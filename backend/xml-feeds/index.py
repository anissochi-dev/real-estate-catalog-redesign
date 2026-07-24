"""
Business: XML-фиды для выгрузки объектов на Яндекс.Недвижимость, Авито, ЦИАН (статические файлы в S3+CDN,
обновляются по крону) + импорт объектов из XML Яндекс.Недвижимости + синхронизация статистики/баланса
кабинета ЦИАН (объединено из backend/cian-api).
Args: event с httpMethod GET/POST, queryStringParameters {action, sync}
Returns: XML текст или JSON, в зависимости от action
"""

import json
import os
import re
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
S3_BUCKET = 'files'
S3_ENDPOINT = 'https://bucket.poehali.dev'
CDN_BASE = 'https://cdn.poehali.dev'
STATIC_REGEN_MINUTES = 10

CIAN_BASE = 'https://public-api.cian.ru'
CIAN_SYNC_INTERVAL_HOURS = 6

YANDEX_REALTY_API_BASE = 'https://api.realty.yandex.net/2.0'
YANDEX_REALTY_PARTNER_TOKEN = 'public-partner-ak0hmqjjk1thu3eutxy8hd1i56mhprpfbb6575qw'
YANDEX_REALTY_SYNC_INTERVAL_HOURS = 6

CONTROL_CHARS_RE = re.compile(r'[\x00-\x08\x0B\x0C\x0E-\x1F]')
XML_DECL_RE = re.compile(r'^<\?xml[^?]*\?>', re.IGNORECASE)
CDATA_RE = re.compile(r'<!\[CDATA\[.*?\]\]>', re.DOTALL)
TAG_RE = re.compile(r'<(/?)([A-Za-z_][\w.-]*)((?:\s+[^<>]*?)?)\s*(/?)>')


def _autofix_xml(text):
    """Чинит типичные косяки XML: BOM, мусор перед декларацией, неэкранированные &/<, управляющие символы."""
    fixes = []
    if not text:
        return text, fixes

    if text.startswith('\ufeff'):
        text = text.lstrip('\ufeff')
        fixes.append('removed BOM')

    stripped = text.lstrip()
    if stripped != text:
        text = stripped
        fixes.append('stripped leading whitespace')

    if CONTROL_CHARS_RE.search(text):
        text = CONTROL_CHARS_RE.sub('', text)
        fixes.append('removed control chars')

    parts = []
    last = 0
    for m in CDATA_RE.finditer(text):
        parts.append(('text', text[last:m.start()]))
        parts.append(('cdata', m.group(0)))
        last = m.end()
    parts.append(('text', text[last:]))

    rebuilt = []
    fixed_amp = 0
    fixed_lt = 0
    for kind, seg in parts:
        if kind == 'cdata':
            rebuilt.append(seg)
            continue
        new_seg = re.sub(r'&(?![a-zA-Z#]+;)', '&amp;', seg)
        if new_seg != seg:
            fixed_amp += 1
        seg = new_seg

        out = []
        i = 0
        n = len(seg)
        while i < n:
            ch = seg[i]
            if ch == '<':
                m = TAG_RE.match(seg, i)
                if m:
                    out.append(m.group(0))
                    i = m.end()
                    continue
                if seg.startswith('<!--', i):
                    end = seg.find('-->', i + 4)
                    if end != -1:
                        out.append(seg[i:end + 3])
                        i = end + 3
                        continue
                if seg.startswith('<?', i):
                    end = seg.find('?>', i + 2)
                    if end != -1:
                        out.append(seg[i:end + 2])
                        i = end + 2
                        continue
                if seg.startswith('<!', i):
                    end = seg.find('>', i + 2)
                    if end != -1:
                        out.append(seg[i:end + 1])
                        i = end + 1
                        continue
                out.append('&lt;')
                fixed_lt += 1
                i += 1
            else:
                out.append(ch)
                i += 1
        rebuilt.append(''.join(out))

    text = ''.join(rebuilt)
    if fixed_amp:
        fixes.append("escaped '&' to '&amp;'")
    if fixed_lt:
        fixes.append(f"escaped {fixed_lt} stray '<' to '&lt;'")

    if not XML_DECL_RE.match(text):
        text = '<?xml version="1.0" encoding="UTF-8"?>\n' + text
        fixes.append('added XML declaration')

    return text, fixes


def _safe(s, length=255):
    return (s or '').replace("'", "''")[:length]


def _xml_escape(s):
    if s is None:
        return ''
    s = str(s)
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _xml_response(content):
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/xml; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
        },
        'body': content,
    }


def _json(data, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(data, ensure_ascii=False, default=str),
    }


def _s3_client():
    return boto3.client(
        's3',
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def _cdn_url(key):
    project_id = os.environ['AWS_ACCESS_KEY_ID']
    return f"{CDN_BASE}/projects/{project_id}/bucket/{key}"


def _build_feed_xml(cur, feed_slug, fmt, filter_category, filter_deal):
    """Собирает XML для одной площадки из текущего состояния БД.
    Набор объектов зависит от ФОРМАТА (fmt), а не от slug — так несколько фидов
    с разными названиями (например «М2» и «Яндекс.Недвижимость») могут использовать
    один и тот же формат yandex и брать один и тот же набор объектов с галочкой экспорта."""
    where = ["status = 'active'", "(is_visible IS NULL OR is_visible = TRUE)"]
    if filter_category:
        where.append(f"category = '{_safe(filter_category, 50)}'")
    if filter_deal:
        where.append(f"deal = '{_safe(filter_deal, 20)}'")
    if fmt == 'yandex':
        where.append("export_yandex = TRUE")
    elif fmt == 'avito':
        where.append("export_avito = TRUE")
    elif fmt == 'cian':
        where.append("export_cian = TRUE")
    elif fmt == 'other':
        # Площадки группы «Разное» (realtymag, rucountry и т.п.) — универсальные бесплатные
        # каталоги без API. Один общий флаг «Р» на объекте включает выгрузку сразу во ВСЕ
        # такие площадки одновременно (в отличие от Я/А/Ц, у каждой из которых свой флаг).
        where.append("export_other = TRUE")

    cur.execute(f"SELECT * FROM {SCHEMA}.listings WHERE {' AND '.join(where)} ORDER BY created_at DESC")
    listings = [dict(r) for r in cur.fetchall()]

    cur.execute(f"SELECT slug, name FROM {SCHEMA}.land_vri")
    _vri_map = {r['slug']: r['name'] for r in cur.fetchall()}
    for l in listings:
        for k in ('created_at', 'updated_at'):
            if l.get(k):
                l[k] = l[k].isoformat()
        if l.get('category') == 'land' and not l.get('land_area') and l.get('area'):
            try:
                l['land_area'] = round(float(l['area']) / 100, 2)
            except (TypeError, ValueError):
                pass
        if l.get('land_vri') and l['land_vri'] in _vri_map:
            l['land_vri'] = _vri_map[l['land_vri']]

    cur.execute(f"SELECT * FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
    company = dict(cur.fetchone() or {})

    if fmt == 'yandex':
        return _build_yandex(listings, company)
    if fmt == 'avito':
        return _build_avito(listings, company)
    if fmt == 'cian':
        return _build_cian(listings, company)
    if fmt == 'other':
        # Площадки «Разное» без собственного формата — используем универсальную
        # yandex-схему (её принимает большинство каталогов недвижимости).
        return _build_yandex(listings, company)
    return None


def _regenerate_static_feeds(cur, conn, force=False):
    """Пересобирает XML для всех активных фидов и заливает готовые файлы в S3.
    Пропускает фид, если он обновлялся меньше STATIC_REGEN_MINUTES назад (если force=False)."""
    cur.execute(f"SELECT * FROM {SCHEMA}.xml_feeds WHERE is_active = TRUE ORDER BY id ASC")
    feeds = [dict(r) for r in cur.fetchall()]
    s3 = None
    results = []

    for feed in feeds:
        last_gen = feed.get('last_generated_at')
        if not force and last_gen:
            elapsed_min = (datetime.now(timezone.utc) - last_gen.replace(tzinfo=timezone.utc)).total_seconds() / 60
            if elapsed_min < STATIC_REGEN_MINUTES:
                results.append({'slug': feed['slug'], 'skipped': True, 'reason': f'{round(elapsed_min, 1)}m ago'})
                continue

        xml_content = _build_feed_xml(cur, feed['slug'], feed['format'], feed.get('filter_category'), feed.get('filter_deal'))
        if xml_content is None:
            results.append({'slug': feed['slug'], 'error': 'Неизвестный формат'})
            continue

        if s3 is None:
            s3 = _s3_client()
        key = f"xml-feeds/{feed['slug']}.xml"
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=xml_content.encode('utf-8'),
            ContentType='application/xml; charset=utf-8',
            CacheControl='public, max-age=300',
        )
        cdn_url = _cdn_url(key)
        cur.execute(
            f"UPDATE {SCHEMA}.xml_feeds SET cdn_url = '{_safe(cdn_url, 500)}', last_generated_at = NOW() WHERE id = {feed['id']}"
        )
        conn.commit()
        results.append({'slug': feed['slug'], 'cdn_url': cdn_url, 'regenerated': True})

    return results


def _split_images(row):
    if row.get('images'):
        return [u.strip() for u in str(row['images']).split('|') if u.strip()]
    if row.get('image'):
        return [row['image']]
    return []


# ── Маппинги категорий ──────────────────────────────────────────────────────

YANDEX_CATEGORY_MAP = {
    'office': 'офисное помещение',
    'retail': 'торговое помещение',
    'warehouse': 'складское помещение',
    'restaurant': 'помещение свободного назначения',
    'hotel': 'помещение свободного назначения',
    'business': 'готовый бизнес',
    'gab': 'готовый бизнес',
    'production': 'производственное помещение',
    'land': 'земля',
    'building': 'здание',
    'free_purpose': 'помещение свободного назначения',
    'car_service': 'производственное помещение',
}

# Значение <commercial-type> для YRL-фида Яндекса (только для category=commercial).
# Точный список допустимых значений подтверждён валидатором Яндекс.Вебмастера:
# office, retail, warehouse, free purpose, land, manufacturing, auto repair,
# business, legal address, public catering, hotel.
YANDEX_COMMERCIAL_TYPE_MAP = {
    'office': 'office',
    'retail': 'retail',
    'warehouse': 'warehouse',
    'restaurant': 'public catering',
    'hotel': 'hotel',
    'business': 'business',
    'gab': 'business',
    'production': 'manufacturing',
    'land': 'land',
    'building': 'free purpose',
    'free_purpose': 'free purpose',
    'car_service': 'auto repair',
}

AVITO_OBJECT_TYPE_MAP = {
    'office': 'Офисное помещение',
    'retail': 'Торговое помещение',
    'warehouse': 'Складское помещение',
    'restaurant': 'Помещение свободного назначения',
    'hotel': 'Гостиница',
    'business': 'Готовый бизнес',
    'gab': 'Готовый арендный бизнес',
    'production': 'Производственное помещение',
    'land': 'Земельный участок',
    'building': 'Здание',
    'free_purpose': 'Помещение свободного назначения',
    'car_service': 'Автосервис',
}

CIAN_CATEGORY_MAP_SALE = {
    'office': 'officeSale',
    'retail': 'shoppingAreaSale',
    'warehouse': 'warehouseSale',
    'restaurant': 'freeAppointmentObjectSale',
    'hotel': 'freeAppointmentObjectSale',
    'business': 'businessSale',
    'gab': 'businessSale',
    'production': 'industrySale',
    'land': 'landSale',
    'building': 'buildingSale',
    'free_purpose': 'freeAppointmentObjectSale',
    'car_service': 'industrySale',
}

CIAN_CATEGORY_MAP_RENT = {
    'office': 'officeRent',
    'retail': 'shoppingAreaRent',
    'warehouse': 'warehouseRent',
    'restaurant': 'freeAppointmentObjectRent',
    'hotel': 'freeAppointmentObjectRent',
    'business': 'officeRent',
    'gab': 'officeRent',
    'production': 'industryRent',
    'land': 'landRent',
    'building': 'buildingRent',
    'free_purpose': 'freeAppointmentObjectRent',
    'car_service': 'industryRent',
}

LAND_STATUS_YANDEX = {
    'izhs': 'ИЖС',
    'lph': 'ЛПХ',
    'snt': 'СНТ',
    'dni': 'ДНТ',
    'commercial': 'Коммерческое',
    'agricultural': 'Сельскохозяйственное',
    'industrial': 'Промышленное',
}

LAND_STATUS_AVITO = {
    'izhs': 'ИЖС',
    'lph': 'ЛПХ',
    'snt': 'СНТ',
    'dni': 'ДНТ',
    'commercial': 'Коммерческое назначение',
    'agricultural': 'Сельскохозяйственное назначение',
    'industrial': 'Промышленное назначение',
}

CONDITION_YANDEX = {
    'new': 'отличное',
    'euro': 'отличное',
    'good': 'хорошее',
    'cosmetic': 'удовлетворительное',
    'rough': 'требует ремонта',
    'shellcore': 'требует ремонта',
}

FINISHING_CIAN = {
    'none': 'no',
    'rough': 'rough',
    'pre_finish': 'roughFinish',
    'cosmetic': 'cosmetic',
    'euro': 'euro',
    'designer': 'design',
}

# Маппинг condition (из вкладки "Основное") → ЦИАН-значения отделки
# Используется как fallback если finishing не заполнен вручную
CONDITION_TO_FINISHING_CIAN = {
    'new': 'design',        # Дизайнерский ремонт
    'euro': 'euro',         # Евроремонт
    'good': 'cosmetic',     # Косметический ремонт
    'cosmetic': 'roughFinish',  # Предчистовая
    'rough': 'no',          # Без отделки
    'shellcore': 'rough',   # Черновая
}

PROPERTY_RIGHTS_AVITO = {
    'ownership': 'Собственность',
    'lease': 'Аренда',
    'sublease': 'Субаренда',
}


def _total_price(l):
    """Возвращает итоговую цену объекта в рублях.

    Если price_unit == 'm2' — умножаем на площадь. НО защищаемся от кривых данных:
    если price уже больше 200 000 ₽ (явно не цена за м²), считаем что это уже итоговая цена.
    Это предотвращает выгрузку нереальных сумм (миллиарды) при ошибочно проставленном
    price_unit на объектах с уже общей ценой.
    """
    raw = l.get('price') or 0
    try:
        price = float(raw)
    except (TypeError, ValueError):
        return 0
    if l.get('price_unit') == 'm2' and l.get('area'):
        try:
            area = float(l['area'])
        except (TypeError, ValueError):
            area = 0
        # Адекватная цена за м² для коммерческой недвижимости — до 200 000 ₽.
        # Если price > 200 000 при unit=m2, значит данные кривые и в price уже итоговая сумма.
        if 0 < price <= 200_000 and area > 0:
            return int(price * area)
    return int(price)


def _build_yandex(listings, company):
    company_name = _xml_escape(company.get('company_name', 'BIZNEST'))
    email = _xml_escape(company.get('company_email', ''))
    site_url = (company.get('site_url') or '').rstrip('/')
    now = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S+00:00')

    # Телефон строго в формате +7XXXXXXXXXX (только цифры, код страны + 10 цифр)
    raw_phone = company.get('company_phone', '') or ''
    digits = re.sub(r'\D', '', raw_phone)
    if digits.startswith('8') and len(digits) == 11:
        digits = '7' + digits[1:]
    phone = f'+{digits}' if len(digits) == 11 and digits.startswith('7') else ''

    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append('<realty-feed xmlns="http://webmaster.yandex.ru/schemas/feed/realty/2010-06">')
    out.append(f'<generation-date>{now}</generation-date>')

    for l in listings:
        deal_map = {'sale': 'продажа', 'rent': 'аренда', 'business': 'продажа'}
        commercial_type = YANDEX_COMMERCIAL_TYPE_MAP.get(l.get('category'), 'office')
        deal = deal_map.get(l.get('deal'), 'продажа')

        # creation-date в строгом ISO 8601: YYYY-MM-DDTHH:mm:ss+00:00 (без микросекунд)
        creation_date = now
        raw_created = l.get('created_at')
        if raw_created:
            try:
                dt = datetime.fromisoformat(str(raw_created).replace('Z', '+00:00'))
                if dt.tzinfo is None:
                    creation_date = dt.strftime('%Y-%m-%dT%H:%M:%S+00:00')
                else:
                    creation_date = dt.strftime('%Y-%m-%dT%H:%M:%S%z')
                    creation_date = creation_date[:-2] + ':' + creation_date[-2:]
            except (ValueError, TypeError):
                pass

        out.append(f'<offer internal-id="{l["id"]}">')
        out.append(f'<type>{deal}</type>')
        out.append('<category>commercial</category>')
        out.append(f'<commercial-type>{commercial_type}</commercial-type>')
        # deal-status обязателен только для аренды; для продажи не передаётся
        if l.get('deal') == 'rent':
            out.append('<deal-status>direct rent</deal-status>')
        out.append(f'<creation-date>{creation_date}</creation-date>')

        # Адрес, геолокация и метро — всё внутри <location>
        out.append('<location>')
        out.append('<country>Россия</country>')
        out.append(f'<locality-name>{_xml_escape(l.get("city") or "Краснодар")}</locality-name>')
        if l.get('district'):
            out.append(f'<sub-locality-name>{_xml_escape(l["district"])}</sub-locality-name>')
        if l.get('address'):
            out.append(f'<address>{_xml_escape(l["address"])}</address>')
        if l.get('lat') and l.get('lng'):
            out.append(f'<latitude>{l["lat"]}</latitude>')
            out.append(f'<longitude>{l["lng"]}</longitude>')
        if l.get('subway_station'):
            out.append('<metro>')
            out.append(f'<name>{_xml_escape(l["subway_station"])}</name>')
            if l.get('subway_distance'):
                out.append(f'<time-on-foot>{l["subway_distance"]}</time-on-foot>')
            out.append('</metro>')
        out.append('</location>')

        # Агент
        out.append('<sales-agent>')
        out.append(f'<name>{company_name}</name>')
        if phone:
            out.append(f'<phone>{phone}</phone>')
        if email:
            out.append(f'<email>{email}</email>')
        out.append('<category>agency</category>')
        out.append('</sales-agent>')

        # Цена (unit не передаём — value всегда итоговая сумма, а не цена за м²)
        out.append('<price>')
        price_val = _total_price(l)
        out.append(f'<value>{price_val}</value>')
        out.append('<currency>RUB</currency>')
        if l.get('deal') == 'rent':
            out.append('<period>month</period>')
        out.append('</price>')

        # Площадь
        if l.get('area'):
            out.append(f'<area><value>{l["area"]}</value><unit>кв. м</unit></area>')
        if l.get('min_area'):
            out.append(f'<lot-area><value>{l["min_area"]}</value><unit>кв. м</unit></lot-area>')

        # Земельный участок
        if l.get('category') == 'land':
            if l.get('land_area'):
                out.append(f'<lot-area><value>{l["land_area"]}</value><unit>сот.</unit></lot-area>')
            if l.get('land_status') and l['land_status'] in LAND_STATUS_YANDEX:
                out.append(f'<lot-type>{LAND_STATUS_YANDEX[l["land_status"]]}</lot-type>')
            if l.get('land_vri'):
                out.append(f'<permitted-land-use>{_xml_escape(str(l["land_vri"]))}</permitted-land-use>')

        # Этажность
        if l.get('floor') is not None:
            out.append(f'<floor>{l["floor"]}</floor>')
        if l.get('total_floors') is not None:
            out.append(f'<floors-total>{l["total_floors"]}</floors-total>')

        # Состояние / отделка
        if l.get('condition') and l['condition'] in CONDITION_YANDEX:
            out.append(f'<quality>{CONDITION_YANDEX[l["condition"]]}</quality>')

        # Класс здания (office-class: A/A+/B/B+/C/C+)
        if l.get('building_class'):
            out.append(f'<office-class>{_xml_escape(l["building_class"])}</office-class>')

        # Год постройки
        if l.get('building_year'):
            out.append(f'<built-year>{l["building_year"]}</built-year>')

        # Высота потолков
        if l.get('ceiling_height'):
            out.append(f'<ceiling-height>{l["ceiling_height"]}</ceiling-height>')

        # Электрическая мощность в кВт (целое число)
        if l.get('electricity_kw'):
            try:
                out.append(f'<electric-capacity>{int(float(l["electricity_kw"]))}</electric-capacity>')
            except (TypeError, ValueError):
                pass

        # Парковка — факт наличия охраняемой парковки
        if l.get('parking') and l['parking'] != 'none':
            out.append('<parking>true</parking>')

        # Описание
        if l.get('description'):
            out.append(f'<description>{_xml_escape(l["description"])}</description>')

        # Фото — не меньше двух по требованиям Яндекса
        images = _split_images(l)
        for img in images:
            out.append(f'<image>{_xml_escape(img)}</image>')

        # Видео — только ссылки на YouTube
        if l.get('video_url') and 'youtu' in l['video_url'].lower():
            out.append('<video-review>')
            out.append(f'<youtube-video-review-url>{_xml_escape(l["video_url"])}</youtube-video-review-url>')
            out.append('</video-review>')

        out.append('</offer>')

    out.append('</realty-feed>')
    return '\n'.join(out)


def _build_avito(listings, company):
    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append('<Ads formatVersion="3" target="Avito.ru">')

    for l in listings:
        deal_map = {'sale': 'Продам', 'rent': 'Сдам', 'business': 'Продам'}
        out.append('<Ad>')
        out.append(f'<Id>{l["id"]}</Id>')
        out.append(f'<DateBegin>{(l.get("created_at") or "")[:10]}</DateBegin>')
        out.append('<Category>Коммерческая недвижимость</Category>')
        out.append(f'<OperationType>{deal_map.get(l.get("deal"), "Продам")}</OperationType>')
        out.append(f'<ObjectType>{_xml_escape(AVITO_OBJECT_TYPE_MAP.get(l.get("category"), "Офисное помещение"))}</ObjectType>')

        # Заголовок и описание
        out.append(f'<Title>{_xml_escape(l.get("title", ""))}</Title>')
        out.append(f'<Description><![CDATA[{l.get("description", "")}]]></Description>')

        # Цена
        price_val = _total_price(l)
        out.append(f'<Price>{price_val}</Price>')

        # Адрес
        out.append('<Address>')
        out.append(f'<City>{_xml_escape(l.get("city") or "Краснодар")}</City>')
        if l.get('district'):
            out.append(f'<District>{_xml_escape(l["district"])}</District>')
        if l.get('address'):
            out.append(f'<Street>{_xml_escape(l["address"])}</Street>')
        if l.get('lat') and l.get('lng'):
            out.append(f'<Latitude>{l["lat"]}</Latitude>')
            out.append(f'<Longitude>{l["lng"]}</Longitude>')
        out.append('</Address>')

        # Параметры площади
        if l.get('area'):
            out.append(f'<Square>{l["area"]}</Square>')
        if l.get('min_area'):
            out.append(f'<MinSquare>{l["min_area"]}</MinSquare>')

        # Земля
        if l.get('category') == 'land':
            if l.get('land_area'):
                out.append(f'<LandSquare>{l["land_area"]}</LandSquare>')
            if l.get('land_status') and l['land_status'] in LAND_STATUS_AVITO:
                out.append(f'<LandStatus>{_xml_escape(LAND_STATUS_AVITO[l["land_status"]])}</LandStatus>')
            if l.get('land_vri'):
                out.append(f'<PermittedLandUse>{_xml_escape(str(l["land_vri"]))}</PermittedLandUse>')

        # Этажи
        if l.get('floor') is not None:
            out.append(f'<Floor>{l["floor"]}</Floor>')
        if l.get('total_floors') is not None:
            out.append(f'<Floors>{l["total_floors"]}</Floors>')

        # Высота потолков
        if l.get('ceiling_height'):
            out.append(f'<CeilingHeight>{l["ceiling_height"]}</CeilingHeight>')

        # Класс здания
        if l.get('building_class'):
            out.append(f'<BuildingClass>{_xml_escape(l["building_class"])}</BuildingClass>')

        # Год постройки
        if l.get('building_year'):
            out.append(f'<BuildingYear>{l["building_year"]}</BuildingYear>')

        # Электричество
        if l.get('electricity_kw'):
            out.append(f'<Power>{l["electricity_kw"]}</Power>')

        # Права на объект
        if l.get('property_rights') and l['property_rights'] in PROPERTY_RIGHTS_AVITO:
            out.append(f'<PropertyRights>{PROPERTY_RIGHTS_AVITO[l["property_rights"]]}</PropertyRights>')

        # Мебель и оборудование
        if l.get('has_furniture'):
            out.append('<Furniture>Да</Furniture>')
        if l.get('has_equipment'):
            out.append('<Equipment>Да</Equipment>')

        # Парковка
        parking_map = {'street': 'Открытая', 'building': 'Подземная'}
        if l.get('parking') and l['parking'] != 'none':
            out.append(f'<Parking>{parking_map.get(l["parking"], "Есть")}</Parking>')

        # Метро
        if l.get('subway_station'):
            out.append(f'<Metro>{_xml_escape(l["subway_station"])}</Metro>')
            if l.get('subway_distance'):
                out.append(f'<MetroDistance>{l["subway_distance"]}</MetroDistance>')

        # Тип аренды
        if l.get('deal') == 'rent':
            out.append('<LeaseType>На длительный срок</LeaseType>')

        # Контакт
        company_phone = company.get('company_phone', '')
        if company_phone:
            out.append(f'<ContactPhone>{_xml_escape(company_phone)}</ContactPhone>')

        # Фото
        imgs = _split_images(l)
        if imgs:
            out.append('<Images>')
            for img in imgs[:40]:
                out.append(f'<Image url="{_xml_escape(img)}"/>')
            out.append('</Images>')

        # Видео
        if l.get('video_url'):
            out.append(f'<VideoURL>{_xml_escape(l["video_url"])}</VideoURL>')

        out.append('</Ad>')

    out.append('</Ads>')
    return '\n'.join(out)


def _build_cian(listings, company):
    # Разбираем телефон компании для блока Phones
    raw_phone = company.get('company_phone', '') or ''
    # Очищаем от пробелов, скобок, тире
    import re as _re
    digits = _re.sub(r'\D', '', raw_phone)
    if digits.startswith('8') and len(digits) == 11:
        digits = '7' + digits[1:]
    cian_country_code = '+' + digits[:1] if digits else '+7'
    cian_phone_number = digits[1:] if len(digits) > 1 else ''

    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append('<feed>')
    out.append('<feed_version>2</feed_version>')

    for l in listings:
        deal = l.get('deal', 'sale')
        category = l.get('category', 'office')
        if deal == 'rent':
            cian_cat = CIAN_CATEGORY_MAP_RENT.get(category, 'officeRent')
        else:
            cian_cat = CIAN_CATEGORY_MAP_SALE.get(category, 'officeSale')

        out.append('<object>')
        out.append(f'<ExternalId>{l["id"]}</ExternalId>')
        out.append(f'<Category>{cian_cat}</Category>')

        # Телефон агентства (обязательный тег ЦИАН)
        if cian_phone_number:
            out.append('<Phones>')
            out.append('<PhoneSchema>')
            out.append(f'<CountryCode>{cian_country_code}</CountryCode>')
            out.append(f'<Number>{cian_phone_number}</Number>')
            out.append('</PhoneSchema>')
            out.append('</Phones>')

        # Описание
        if l.get('description'):
            out.append(f'<Description><![CDATA[{l["description"]}]]></Description>')

        # Заголовок (title)
        if l.get('title'):
            out.append(f'<Title>{_xml_escape(l["title"])}</Title>')

        # Адрес — плоская строка: "Город, Район, Улица"
        addr_parts = [l.get('city') or 'Краснодар']
        if l.get('district'):
            addr_parts.append(l['district'])
        if l.get('address'):
            addr_parts.append(l['address'])
        out.append(f'<Address>{_xml_escape(", ".join(addr_parts))}</Address>')
        # Координаты — отдельный блок
        if l.get('lat') and l.get('lng'):
            out.append('<Coordinates>')
            out.append(f'<Lat>{l["lat"]}</Lat>')
            out.append(f'<Lng>{l["lng"]}</Lng>')
            out.append('</Coordinates>')

        # Площадь
        if l.get('area'):
            out.append(f'<TotalArea>{l["area"]}</TotalArea>')
        if l.get('min_area'):
            out.append(f'<MinArea>{l["min_area"]}</MinArea>')

        # Земля
        if category == 'land' and l.get('land_area'):
            out.append(f'<LandArea>{l["land_area"]}</LandArea>')
            if l.get('land_status'):
                _ls = LAND_STATUS_AVITO.get(l['land_status'], l['land_status'])
                out.append(f'<LandStatus>{_xml_escape(str(_ls))}</LandStatus>')
            if l.get('land_vri'):
                out.append(f'<PermittedLandUse>{_xml_escape(str(l["land_vri"]))}</PermittedLandUse>')

        # Этажи
        if l.get('floor') is not None:
            out.append(f'<FloorNumber>{l["floor"]}</FloorNumber>')
        if l.get('total_floors') is not None:
            out.append(f'<FloorsCount>{l["total_floors"]}</FloorsCount>')

        # Высота потолков
        if l.get('ceiling_height'):
            out.append(f'<CeilingHeight>{l["ceiling_height"]}</CeilingHeight>')

        # Класс здания
        if l.get('building_class'):
            out.append(f'<BuildingClassType>{_xml_escape(l["building_class"])}</BuildingClassType>')

        # Год постройки
        if l.get('building_year'):
            out.append(f'<BuildYear>{l["building_year"]}</BuildYear>')

        # Электричество
        if l.get('electricity_kw'):
            out.append(f'<ElectricPower>{l["electricity_kw"]}</ElectricPower>')

        # Отделка: приоритет finishing, fallback — condition
        _decoration = None
        if l.get('finishing') and l['finishing'] in FINISHING_CIAN:
            _decoration = FINISHING_CIAN[l['finishing']]
        elif l.get('condition') and l['condition'] in CONDITION_TO_FINISHING_CIAN:
            _decoration = CONDITION_TO_FINISHING_CIAN[l['condition']]
        if _decoration:
            out.append(f'<Decoration>{_decoration}</Decoration>')

        # Мебель
        if l.get('has_furniture'):
            out.append('<FurniturePresence>yes</FurniturePresence>')

        # Апартаменты
        if l.get('is_apartments'):
            out.append('<IsApartments>true</IsApartments>')

        # Парковка
        if l.get('parking') == 'building':
            out.append('<HasParking>true</HasParking>')
            out.append('<ParkingType>underground</ParkingType>')
        elif l.get('parking') == 'street':
            out.append('<HasParking>true</HasParking>')
            out.append('<ParkingType>openAir</ParkingType>')

        # Метро
        if l.get('subway_station'):
            out.append('<Undergrounds>')
            out.append('<Underground>')
            out.append(f'<StationName>{_xml_escape(l["subway_station"])}</StationName>')
            if l.get('subway_distance'):
                out.append(f'<Time>{l["subway_distance"]}</Time>')
                out.append('<TransportType>walk</TransportType>')
            out.append('</Underground>')
            out.append('</Undergrounds>')

        # Цена
        out.append('<BargainTerms>')
        price_val = _total_price(l)
        out.append(f'<Price>{price_val}</Price>')
        out.append('<Currency>rur</Currency>')
        if deal == 'rent':
            out.append('<PaymentPeriod>monthly</PaymentPeriod>')
            if l.get('price_unit') == 'm2':
                out.append('<PriceType>squareMeter</PriceType>')
        out.append('</BargainTerms>')

        # Фото
        imgs = _split_images(l)
        if imgs:
            out.append('<Photos>')
            for img in imgs[:50]:
                out.append(f'<PhotoSchema><FullUrl>{_xml_escape(img)}</FullUrl></PhotoSchema>')
            out.append('</Photos>')

        # Видео
        if l.get('video_url'):
            out.append(f'<Video><FullUrl>{_xml_escape(l["video_url"])}</FullUrl></Video>')

        out.append('</object>')

    out.append('</feed>')
    return '\n'.join(out)


# ── ЦИАН: синхронизация статистики/баланса/услуг через public-api.cian.ru ───
# (объединено из backend/cian-api). Сами объекты выгружаются через XML выше,
# этот блок только ЧИТАЕТ данные кабинета (статистика, баланс, услуги, звонки).

def _cian_get(path, token):
    url = f'{CIAN_BASE}{path}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


def _cian_chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def _cian_sync(cur, conn, token):
    """Синхронизирует объявления, статистику, услуги, звонки и баланс ЦИАН → БД."""
    offers_count = stats_count = services_count = calls_count = 0

    all_offers = []
    page = 1
    while True:
        data, err = _cian_get(f'/v2/get-my-offers?page={page}&pageSize=100', token)
        if err or not data:
            break
        result = data.get('result') or {}
        items = result.get('announcements') or []
        all_offers.extend(items)
        total = result.get('totalCount', 0)
        if len(all_offers) >= total or not items:
            break
        page += 1
        if page > 20:
            break

    for o in all_offers:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.cian_offers (id, status, source, creation_date, synced_at, archived_at)
            VALUES (%s,%s,%s,%s, NOW(), NULL)
            ON CONFLICT (id) DO UPDATE SET
                status=EXCLUDED.status, source=EXCLUDED.source,
                creation_date=EXCLUDED.creation_date, synced_at=NOW(),
                archived_at=NULL
        """, (o.get('id'), o.get('status'), o.get('source'), o.get('creationDate')))
    offers_count = len(all_offers)
    offer_ids = [o['id'] for o in all_offers if o.get('id')]

    # Объявления, которых больше нет в ответе ЦИАН (сняты с публикации, ушли в архив на
    # стороне ЦИАН, удалены вручную и т.п.) — НЕ удаляем, а помечаем как архивные, сохраняя
    # всю историю просмотров/звонков/услуг. Так они не засоряют активный дашборд, но
    # статистика по ним не теряется — их можно посмотреть во вкладке «Архив».
    # Защита: если API вернул пустой список (сбой/ошибка авторизации), ничего не трогаем.
    if offer_ids:
        keep_ids_sql = ','.join(str(oid) for oid in offer_ids)
        cur.execute(f"""
            UPDATE {SCHEMA}.cian_offers SET archived_at = NOW()
            WHERE id NOT IN ({keep_ids_sql}) AND archived_at IS NULL
        """)

    for batch in _cian_chunks(offer_ids, 50):
        qs = '&'.join(f'offerIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-my-offers-detail?{qs}', token)
        if err or not data:
            continue
        for item in (data.get('result') or {}).get('offers') or []:
            ext_id = item.get('externalId')
            try:
                ext_id_int = int(ext_id) if ext_id else None
            except (ValueError, TypeError):
                ext_id_int = None
            cur.execute(f"""
                UPDATE {SCHEMA}.cian_offers SET external_id = %s, url = %s WHERE id = %s
            """, (ext_id_int, item.get('url'), item.get('id')))

    for batch in _cian_chunks(offer_ids, 50):
        qs = '&'.join(f'offersIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-views-statistics?{qs}', token)
        if err or not data:
            continue
        for s in (data.get('result') or {}).get('statistics') or []:
            cur.execute(f"""
                INSERT INTO {SCHEMA}.cian_offer_stats
                    (offer_id, add_to_favorites, calls, chats, phone_shows, phone_views, phone_views_and_chats, responses, shows_base, synced_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
                ON CONFLICT (offer_id) DO UPDATE SET
                    add_to_favorites=EXCLUDED.add_to_favorites, calls=EXCLUDED.calls, chats=EXCLUDED.chats,
                    phone_shows=EXCLUDED.phone_shows, phone_views=EXCLUDED.phone_views,
                    phone_views_and_chats=EXCLUDED.phone_views_and_chats, responses=EXCLUDED.responses,
                    shows_base=EXCLUDED.shows_base, synced_at=NOW()
            """, (
                s.get('offerId'), s.get('addToFavorites', 0), s.get('calls', 0), s.get('chats', 0),
                s.get('phoneShows', 0), s.get('phoneViews', 0), s.get('phoneViewsAndChats', 0),
                s.get('responses', 0), s.get('showsBase', 0),
            ))
            stats_count += 1

    for batch in _cian_chunks(offer_ids, 50):
        qs = '&'.join(f'offerIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-offer-active-services?{qs}', token)
        if err or not data:
            continue
        for item in (data.get('result') or {}).get('items') or []:
            oid = item.get('offerId')
            for svc in item.get('services') or []:
                for stype in svc.get('serviceTypes') or []:
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.cian_offer_services (offer_id, service_type, price, paid_till, auto_prolong, synced_at)
                        VALUES (%s,%s,%s,%s,%s, NOW())
                        ON CONFLICT (offer_id, service_type) DO UPDATE SET
                            price=EXCLUDED.price, paid_till=EXCLUDED.paid_till,
                            auto_prolong=EXCLUDED.auto_prolong, synced_at=NOW()
                    """, (oid, stype, svc.get('price'), svc.get('paidTill'), svc.get('autoProlongEnabled', False)))
                    services_count += 1

    date_to = datetime.now().strftime('%Y-%m-%d')
    date_from = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    page = 1
    while True:
        data, err = _cian_get(
            f'/v2/get-calls-report?dateFrom={date_from}&dateTo={date_to}&page={page}&pageSize=100', token,
        )
        if err or not data:
            break
        result = data.get('result') or {}
        calls = result.get('calls') or []
        for c in calls:
            offer = c.get('offer') or {}
            ext_id = offer.get('externalId')
            try:
                ext_id_int = int(ext_id) if ext_id else None
            except (ValueError, TypeError):
                ext_id_int = None
            cur.execute(f"""
                INSERT INTO {SCHEMA}.cian_calls
                    (call_id, offer_id, external_id, source_phone, destination_phone, calltracking_phone,
                     duration, status, call_datetime, employee_id, synced_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
                ON CONFLICT (call_id) DO UPDATE SET
                    offer_id=EXCLUDED.offer_id, external_id=EXCLUDED.external_id,
                    source_phone=EXCLUDED.source_phone, destination_phone=EXCLUDED.destination_phone,
                    calltracking_phone=EXCLUDED.calltracking_phone, duration=EXCLUDED.duration,
                    status=EXCLUDED.status, call_datetime=EXCLUDED.call_datetime,
                    employee_id=EXCLUDED.employee_id, synced_at=NOW()
            """, (
                c.get('callId'), offer.get('id'), ext_id_int, c.get('sourcePhone'), c.get('destinationPhone'),
                c.get('calltrackingPhone'), c.get('duration'), c.get('status'), c.get('datetime'), c.get('employeeId'),
            ))
            calls_count += 1
        total = result.get('totalCount', 0)
        if page * 100 >= total or not calls:
            break
        page += 1
        if page > 20:
            break

    bdata, berr = _cian_get('/v1/get-my-balance', token)
    if not berr and bdata:
        bres = bdata.get('result') or {}
        bonuses = sum(float(b.get('amount', 0) or 0) for b in (bres.get('bonuses') or []))
        auction_pts = sum(float(b.get('amount', 0) or 0) for b in (bres.get('auctionPoints') or []))
        cur.execute(f"""
            INSERT INTO {SCHEMA}.cian_balance (total_balance, bonuses_amount, auction_points_amount, synced_at)
            VALUES (%s,%s,%s, NOW())
        """, (bres.get('totalBalance', 0), bonuses, auction_pts))

    conn.commit()

    cur.execute(f"""
        INSERT INTO {SCHEMA}.cian_sync_log (synced_at, offers_count, stats_count, services_count, calls_count)
        VALUES (NOW(), %s, %s, %s, %s)
    """, (offers_count, stats_count, services_count, calls_count))
    conn.commit()

    return {'offers_count': offers_count, 'stats_count': stats_count, 'services_count': services_count, 'calls_count': calls_count}


def _cian_read_from_db(cur):
    """Читает все данные кабинета ЦИАН из БД и возвращает в формате для фронтенда.
    Объявления делятся на активные (archived_at IS NULL) и архивные — история
    просмотров/звонков/услуг сохраняется по обеим группам."""
    cur.execute(f"""
        SELECT o.id, o.external_id, o.status, o.source, o.url, o.creation_date, o.archived_at,
               l.title, l.slug, l.category, l.deal, l.price, l.image,
               COALESCE(s.add_to_favorites, 0) AS add_to_favorites,
               COALESCE(s.calls, 0) AS calls,
               COALESCE(s.chats, 0) AS chats,
               COALESCE(s.phone_shows, 0) AS phone_shows,
               COALESCE(s.responses, 0) AS responses,
               COALESCE(s.shows_base, 0) AS views
        FROM {SCHEMA}.cian_offers o
        LEFT JOIN {SCHEMA}.listings l ON l.id = o.external_id
        LEFT JOIN {SCHEMA}.cian_offer_stats s ON s.offer_id = o.id
        ORDER BY o.id DESC
    """)
    all_offers = [dict(r) for r in cur.fetchall()]

    cur.execute(f"SELECT offer_id, service_type, price, paid_till, auto_prolong FROM {SCHEMA}.cian_offer_services")
    services_by_offer = {}
    service_type_counts = {}
    for r in cur.fetchall():
        d = dict(r)
        services_by_offer.setdefault(d['offer_id'], []).append(d)
        service_type_counts[d['service_type']] = service_type_counts.get(d['service_type'], 0) + 1

    cur.execute(f"""
        SELECT offer_id, external_id, source_phone, duration, status, call_datetime
        FROM {SCHEMA}.cian_calls
        ORDER BY call_datetime DESC
    """)
    calls_by_offer = {}
    for r in cur.fetchall():
        d = dict(r)
        calls_by_offer.setdefault(d['offer_id'], []).append(d)

    cur.execute(f"SELECT * FROM {SCHEMA}.cian_balance ORDER BY synced_at DESC LIMIT 1")
    balance = dict(cur.fetchone() or {})

    cur.execute(f"SELECT * FROM {SCHEMA}.cian_sync_log ORDER BY synced_at DESC LIMIT 1")
    last_sync = dict(cur.fetchone() or {})

    for o in all_offers:
        o['services'] = services_by_offer.get(o['id'], [])
        o['calls_list'] = calls_by_offer.get(o['id'], [])

    offers = [o for o in all_offers if not o.get('archived_at')]
    archived_offers = [o for o in all_offers if o.get('archived_at')]

    published = [o for o in offers if o.get('status') == 'published']
    total_views = sum(o.get('views', 0) for o in offers)
    total_calls = sum(o.get('calls', 0) for o in offers)
    total_favs = sum(o.get('add_to_favorites', 0) for o in offers)

    return {
        'ok': True,
        'last_sync': last_sync,
        'balance': balance,
        'summary': {
            'offers_count': len(offers),
            'published_count': len(published),
            'total_views': total_views,
            'total_calls': total_calls,
            'total_favorites': total_favs,
            'services_by_type': service_type_counts,
            'archived_count': len(archived_offers),
        },
        'offers': offers,
        'archived_offers': archived_offers,
    }


def _cian_handle(cur, conn, params):
    """Обрабатывает action=cian_stats|cian_sync|cian_cron: читает/синхронизирует кабинет ЦИАН."""
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    cur.execute(f"SELECT api_key, is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'cian' LIMIT 1")
    row = cur.fetchone()
    token = (row.get('api_key') or '').strip() if row else ''
    is_active = bool(row.get('is_active')) if row else False

    if not token:
        return _json({'error': 'ЦИАН не настроен: заполните API Token в Настройках → Интеграции → Площадки'}, 400)

    if action == 'cian_cron' or force_sync:
        if action == 'cian_cron':
            if not is_active:
                return _json({'ok': True, 'skipped': True, 'reason': 'Интеграция выключена'})
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.cian_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < CIAN_SYNC_INTERVAL_HOURS:
                    return _json({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        result = _cian_sync(cur, conn, token)
        data = _cian_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.cian_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        result = _cian_sync(cur, conn, token)
        data = _cian_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    return _json(_cian_read_from_db(cur))


# ── Яндекс.Недвижимость: синхронизация звонков через Public Partner API ─────
# https://yandex.ru/support/realty-partner/ru/api-calls — только список звонков.

def _yandex_calls_get(oauth_token, client_id, agency_id, date_from, date_to):
    qs = urllib.parse.urlencode({
        'clientId': client_id,
        'agencyId': agency_id,
        'fromDate': date_from,
        'toDate': date_to,
        'pageNum': '0',
        'pageSize': '500',
    })
    url = f'{YANDEX_REALTY_API_BASE}/publicPartner/calls?{qs}'
    req = urllib.request.Request(url, headers={
        'accept': 'application/json',
        'X-Authorization': f'Vertis {YANDEX_REALTY_PARTNER_TOKEN}',
        'Authorization': f'OAuth {oauth_token}',
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode()[:300]
        except Exception:
            body = ''
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


def _yandex_calls_sync(cur, conn, oauth_token, client_id, agency_id):
    """Синхронизирует звонки Яндекс.Недвижимости за последние 30 дней → БД."""
    date_to = datetime.now().strftime('%Y-%m-%d')
    date_from = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

    data, err = _yandex_calls_get(oauth_token, client_id, agency_id, date_from, date_to)
    if err:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.yandex_sync_log (synced_at, calls_count, error)
            VALUES (NOW(), 0, %s)
        """, (err[:500],))
        conn.commit()
        return {'calls_count': 0, 'error': err}

    calls = (data or {}).get('calls') or []
    calls_count = 0
    for c in calls:
        obj_name = c.get('objectName') or ''
        ext_id_match = re.search(r'\b(\d{4,})\b', obj_name)
        ext_id = int(ext_id_match.group(1)) if ext_id_match else None
        cur.execute(f"""
            INSERT INTO {SCHEMA}.yandex_calls
                (external_id, object_name, incoming_phone, internal_phone, wait_duration, call_duration,
                 revenue, object_type, campaign_tariff, client_tariff, call_timestamp, synced_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
            ON CONFLICT (call_timestamp, incoming_phone, internal_phone) DO UPDATE SET
                object_name=EXCLUDED.object_name, wait_duration=EXCLUDED.wait_duration,
                call_duration=EXCLUDED.call_duration, revenue=EXCLUDED.revenue,
                object_type=EXCLUDED.object_type, synced_at=NOW()
        """, (
            ext_id, obj_name, c.get('incomingPhone'), c.get('internalPhone'),
            c.get('waitDuration'), c.get('callDuration'), c.get('revenue'),
            c.get('objectType'), c.get('campaignTariff'), c.get('clientTariff'), c.get('timestamp'),
        ))
        calls_count += 1
    conn.commit()

    cur.execute(f"""
        INSERT INTO {SCHEMA}.yandex_sync_log (synced_at, calls_count)
        VALUES (NOW(), %s)
    """, (calls_count,))
    conn.commit()

    return {'calls_count': calls_count}


def _yandex_calls_read_from_db(cur):
    """Читает статистику звонков Яндекс.Недвижимости из БД для фронтенда."""
    cur.execute(f"""
        SELECT c.external_id, c.object_name, c.incoming_phone, c.internal_phone,
               c.wait_duration, c.call_duration, c.revenue, c.object_type,
               c.campaign_tariff, c.client_tariff, c.call_timestamp,
               l.title, l.slug, l.category, l.deal, l.price, l.image
        FROM {SCHEMA}.yandex_calls c
        LEFT JOIN {SCHEMA}.listings l ON l.id = c.external_id
        ORDER BY c.call_timestamp DESC
        LIMIT 500
    """)
    calls = [dict(r) for r in cur.fetchall()]

    cur.execute(f"SELECT * FROM {SCHEMA}.yandex_sync_log ORDER BY synced_at DESC LIMIT 1")
    last_sync = dict(cur.fetchone() or {})

    total_calls = len(calls)
    total_duration = sum(c.get('call_duration') or 0 for c in calls)
    unique_objects = len({c['external_id'] for c in calls if c.get('external_id')})

    return {
        'ok': True,
        'last_sync': last_sync,
        'summary': {
            'total_calls': total_calls,
            'total_duration': total_duration,
            'unique_objects': unique_objects,
        },
        'calls': calls,
    }


def _yandex_calls_handle(cur, conn, params):
    """Обрабатывает action=yandex_stats|yandex_cron: читает/синхронизирует звонки Яндекс.Недвижимости."""
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    cur.execute(f"SELECT api_key, extra, is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'yandex_realty' LIMIT 1")
    row = cur.fetchone()
    oauth_token = (row.get('api_key') or '').strip() if row else ''
    extra = row.get('extra') or {} if row else {}
    client_id = (extra.get('client_id') or '').strip()
    agency_id = (extra.get('agency_id') or '').strip()
    is_active = bool(row.get('is_active')) if row else False

    if not oauth_token or not client_id:
        return _json({'error': 'Яндекс.Недвижимость не настроена: заполните OAuth Token и Client ID в Настройках → Интеграции → Площадки'}, 400)

    if action == 'yandex_cron' or force_sync:
        if action == 'yandex_cron':
            if not is_active:
                return _json({'ok': True, 'skipped': True, 'reason': 'Интеграция выключена'})
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.yandex_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < YANDEX_REALTY_SYNC_INTERVAL_HOURS:
                    return _json({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        result = _yandex_calls_sync(cur, conn, oauth_token, client_id, agency_id)
        data = _yandex_calls_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.yandex_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        result = _yandex_calls_sync(cur, conn, oauth_token, client_id, agency_id)
        data = _yandex_calls_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    return _json(_yandex_calls_read_from_db(cur))


def handler(event, context):
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if method == 'GET' and params.get('action') == 'cron':
                # Публичный пинг-крон: пересобирает статические файлы в S3 (раз в 10 мин)
                # и параллельно синхронизирует кабинеты ЦИАН и Яндекс.Недвижимость (раз в 6 часов, если подключены).
                results = _regenerate_static_feeds(cur, conn, force=False)
                cur.execute(f"SELECT is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'cian' LIMIT 1")
                row = cur.fetchone()
                cian_result = None
                if row and row.get('is_active'):
                    cian_result = _cian_handle(cur, conn, {'action': 'cian_cron'})
                cur.execute(f"SELECT is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'yandex_realty' LIMIT 1")
                row = cur.fetchone()
                yandex_result = None
                if row and row.get('is_active'):
                    yandex_result = _yandex_calls_handle(cur, conn, {'action': 'yandex_cron'})
                return _json({
                    'ok': True, 'results': results,
                    'cian': json.loads(cian_result['body']) if cian_result else None,
                    'yandex': json.loads(yandex_result['body']) if yandex_result else None,
                })

            if method == 'GET' and params.get('action') == 'generate_static':
                # Ручной принудительный пересчёт (из админки).
                headers = event.get('headers') or {}
                token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
                user = _get_user(cur, token)
                if not user or user['role'] not in ('admin', 'editor'):
                    return _json({'error': 'Нет прав'}, 403)
                results = _regenerate_static_feeds(cur, conn, force=True)
                return _json({'ok': True, 'results': results})

            if method == 'GET' and params.get('action') in ('cian_stats', 'cian_sync', 'cian_cron'):
                # Статистика/баланс/услуги кабинета ЦИАН (объединено из backend/cian-api).
                return _cian_handle(cur, conn, params)

            if method == 'GET' and params.get('action') in ('yandex_stats', 'yandex_sync', 'yandex_cron'):
                # Статистика звонков кабинета Яндекс.Недвижимость (Public Partner API).
                return _yandex_calls_handle(cur, conn, params)

            if method == 'GET' and params.get('action') == 'other_platforms':
                # Вкладка «Разное»: список площадок формата 'other' (realtymag, rucountry и т.п.)
                # с количеством и списком выгружаемых на них объектов (флаг export_other) и статусом
                # автостатистики — площадка либо поддерживает передачу цифр через API, либо нет.
                cur.execute(
                    f"SELECT id, slug, name, is_active, cdn_url, last_generated_at, supports_stats "
                    f"FROM {SCHEMA}.xml_feeds WHERE format = 'other' ORDER BY id ASC"
                )
                feeds = [dict(r) for r in cur.fetchall()]
                cur.execute(
                    f"SELECT id, title, image, category, deal, city, status "
                    f"FROM {SCHEMA}.listings WHERE export_other = TRUE AND status = 'active' "
                    f"AND (is_visible IS NULL OR is_visible = TRUE) "
                    f"ORDER BY created_at DESC"
                )
                shared_listings = [dict(r) for r in cur.fetchall()]
                for f in feeds:
                    f['listings_count'] = len(shared_listings)
                    f['listings'] = shared_listings
                    f['stats'] = None  # ручного ввода нет; появится, когда площадка подключит API
                return _json({'platforms': feeds})

            if method == 'GET':
                # Фиды отдаются только готовыми статическими файлами с CDN (см. cdn_url в xml_feeds).
                # Генерация "на лету" по ?feed=slug удалена — используйте ссылку из админки.
                return _json({'error': 'Используйте статическую ссылку на файл (cdn_url) из раздела XML фиды в админке'}, 410)

            if method == 'POST':
                headers = event.get('headers') or {}
                token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
                user = _get_user(cur, token)
                if not user or user['role'] not in ('admin', 'editor'):
                    return _json({'error': 'Нет прав'}, 403)

                body = json.loads(event.get('body') or '{}')
                xml_text = body.get('xml', '')
                source_url = (body.get('url') or '').strip()

                if not xml_text and source_url:
                    if not source_url.startswith(('http://', 'https://')):
                        return _json({'error': 'URL должен начинаться с http:// или https://'}, 400)
                    try:
                        req = urllib.request.Request(
                            source_url,
                            headers={'User-Agent': 'BIZNEST-XML-Importer/1.0'},
                        )
                        with urllib.request.urlopen(req, timeout=25) as resp:
                            raw = resp.read()
                        head = raw[:200].decode('ascii', errors='ignore')
                        m = re.search(r'encoding=["\']([^"\']+)["\']', head, re.IGNORECASE)
                        enc = (m.group(1) if m else 'utf-8').lower()
                        try:
                            xml_text = raw.decode(enc, errors='replace')
                        except (LookupError, UnicodeDecodeError):
                            xml_text = raw.decode('utf-8', errors='replace')
                    except urllib.error.HTTPError as e:
                        return _json({'error': f'HTTP {e.code} при загрузке {source_url}'}, 400)
                    except urllib.error.URLError as e:
                        return _json({'error': f'Не удалось загрузить XML: {str(e.reason)[:200]}'}, 400)
                    except Exception as e:
                        return _json({'error': f'Ошибка загрузки: {str(e)[:200]}'}, 400)

                if not xml_text:
                    return _json({'error': 'Пустой XML'}, 400)

                xml_text = re.sub(r'\sxmlns="[^"]+"', '', xml_text, count=1)
                autofix_report = []
                try:
                    root = ET.fromstring(xml_text)
                except ET.ParseError:
                    fixed_text, autofix_report = _autofix_xml(xml_text)
                    try:
                        root = ET.fromstring(fixed_text)
                    except ET.ParseError as e:
                        return _json({
                            'error': f'Ошибка парсинга XML: {str(e)[:200]}',
                            'autofix_attempted': autofix_report,
                        }, 400)

                imported = 0
                errors = []
                for offer in root.findall('.//offer'):
                    try:
                        otype = (offer.findtext('type') or '').lower()
                        deal = 'rent' if 'аренд' in otype else 'sale'
                        category = 'office'
                        cat_text = (offer.findtext('category') or '').lower()
                        if 'торг' in cat_text:
                            category = 'retail'
                        elif 'склад' in cat_text:
                            category = 'warehouse'
                        elif 'производ' in cat_text:
                            category = 'production'
                        elif 'земл' in cat_text or 'участ' in cat_text:
                            category = 'land'
                        elif 'здани' in cat_text:
                            category = 'building'
                        elif 'свободн' in cat_text or 'псн' in cat_text:
                            category = 'free_purpose'

                        title = offer.findtext('description') or 'Без названия'
                        title = title[:255].strip().split('\n')[0]
                        description = offer.findtext('description') or ''
                        price_val = offer.findtext('price/value') or '0'
                        try:
                            price = int(float(price_val))
                        except Exception:
                            price = 0
                        area_val = offer.findtext('area/value') or '0'
                        try:
                            area = int(float(area_val))
                        except Exception:
                            area = 0
                        city = offer.findtext('location/locality-name') or 'Краснодар'
                        address = offer.findtext('location/address') or ''
                        floor_val = offer.findtext('floor')
                        floor = int(floor_val) if floor_val and floor_val.isdigit() else None
                        floors_total_val = offer.findtext('floors-total')
                        total_floors = int(floors_total_val) if floors_total_val and floors_total_val.isdigit() else None
                        ceiling_val = offer.findtext('ceiling-height')
                        ceiling_height = float(ceiling_val) if ceiling_val else None
                        built_year_val = offer.findtext('built-year')
                        building_year = int(built_year_val) if built_year_val and built_year_val.isdigit() else None
                        building_class = offer.findtext('building-class') or None

                        images = [img.text.strip() for img in offer.findall('image') if img.text]
                        first_img = images[0] if images else ''
                        images_str = '|'.join(images)

                        # Метро
                        subway_station = offer.findtext('.//metro/name') or None
                        subway_time = offer.findtext('.//metro/time-on-foot')
                        subway_distance = int(subway_time) if subway_time and subway_time.isdigit() else None

                        lat_val = offer.findtext('location/latitude')
                        lng_val = offer.findtext('location/longitude')
                        lat = float(lat_val) if lat_val else None
                        lng = float(lng_val) if lng_val else None

                        cur.execute(
                            f"INSERT INTO {SCHEMA}.listings "
                            f"(title, description, category, deal, price, area, address, city, image, images, status, author_id, broker_id, "
                            f"floor, total_floors, ceiling_height, building_year, building_class, subway_station, subway_distance, lat, lng) "
                            f"VALUES ('{_safe(title, 255)}', '{_safe(description, 5000)}', "
                            f"'{category}', '{deal}', {price}, {area}, "
                            f"'{_safe(address, 255)}', '{_safe(city, 100)}', "
                            f"'{_safe(first_img, 500)}', '{_safe(images_str, 5000)}', "
                            f"'active', {user['id']}, {user['id']}, "
                            f"{floor if floor is not None else 'NULL'}, "
                            f"{total_floors if total_floors is not None else 'NULL'}, "
                            f"{ceiling_height if ceiling_height is not None else 'NULL'}, "
                            f"{building_year if building_year is not None else 'NULL'}, "
                            f"{'NULL' if not building_class else chr(39) + _safe(building_class, 10) + chr(39)}, "
                            f"{'NULL' if not subway_station else chr(39) + _safe(subway_station, 150) + chr(39)}, "
                            f"{subway_distance if subway_distance is not None else 'NULL'}, "
                            f"{lat if lat is not None else 'NULL'}, "
                            f"{lng if lng is not None else 'NULL'})"
                        )
                        imported += 1
                    except Exception as e:
                        errors.append(str(e)[:100])

                conn.commit()
                return _json({
                    'imported': imported,
                    'errors': errors[:5],
                    'autofix_applied': autofix_report,
                })

            return _json({'error': 'Method not allowed'}, 405)
    finally:
        conn.close()