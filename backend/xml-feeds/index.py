"""
Business: XML-фиды для выгрузки объектов на Яндекс.Недвижимость, Авито, ЦИАН + импорт объектов из XML Яндекс.Недвижимости.
Args: event с httpMethod GET (выгрузка по slug) или POST (импорт XML, требует токен), queryStringParameters {feed, action}
Returns: XML текст для GET, JSON для POST
"""

import json
import os
import re
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

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
    phone = _xml_escape(company.get('company_phone', ''))
    email = _xml_escape(company.get('company_email', ''))
    site_url = (company.get('site_url') or '').rstrip('/')
    now = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S+00:00')

    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append(f'<realty-feed xmlns="http://webmaster.yandex.ru/schemas/feed/realty/2010-06" generation-date="{now}">')

    for l in listings:
        deal_map = {'sale': 'продажа', 'rent': 'аренда', 'business': 'продажа'}
        cat = YANDEX_CATEGORY_MAP.get(l.get('category'), 'коммерческая')
        deal = deal_map.get(l.get('deal'), 'продажа')

        out.append(f'<offer internal-id="{l["id"]}">')
        out.append(f'<type>{deal}</type>')
        out.append('<property-type>коммерческая</property-type>')
        out.append(f'<category>{cat}</category>')
        out.append('<deal-status>агентство</deal-status>')
        out.append(f'<creation-date>{l["created_at"]}</creation-date>')
        if site_url:
            out.append(f'<url>{site_url}/listing/{l["id"]}</url>')

        # Адрес и геолокация
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

        # Цена
        out.append('<price>')
        price_val = _total_price(l)
        out.append(f'<value>{price_val}</value>')
        out.append('<currency>RUB</currency>')
        if l.get('deal') == 'rent':
            out.append('<period>month</period>')
            out.append('<unit>всего</unit>')
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

        # Класс здания
        if l.get('building_class'):
            out.append(f'<building-class>{_xml_escape(l["building_class"])}</building-class>')

        # Год постройки
        if l.get('building_year'):
            out.append(f'<built-year>{l["building_year"]}</built-year>')

        # Высота потолков
        if l.get('ceiling_height'):
            out.append(f'<ceiling-height>{l["ceiling_height"]}</ceiling-height>')

        # Электричество
        if l.get('electricity_kw'):
            out.append(f'<electricity>{l["electricity_kw"]}</electricity>')

        # Парковка
        parking_map = {'none': 'нет', 'street': 'открытая', 'building': 'подземная'}
        if l.get('parking') and l['parking'] != 'none':
            out.append(f'<parking-type>{parking_map.get(l["parking"], "")}</parking-type>')

        # Метро
        if l.get('subway_station'):
            out.append('<metro>')
            out.append(f'<name>{_xml_escape(l["subway_station"])}</name>')
            if l.get('subway_distance'):
                out.append(f'<time-on-foot>{l["subway_distance"]}</time-on-foot>')
            out.append('</metro>')

        # Описание
        if l.get('description'):
            out.append(f'<description>{_xml_escape(l["description"])}</description>')

        # Фото
        for img in _split_images(l):
            out.append(f'<image>{_xml_escape(img)}</image>')

        # Видео
        if l.get('video_url'):
            out.append(f'<video>{_xml_escape(l["video_url"])}</video>')

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
            if method == 'GET':
                feed_slug = params.get('feed', 'yandex')
                cur.execute(f"SELECT * FROM {SCHEMA}.xml_feeds WHERE slug = '{_safe(feed_slug, 50)}' AND is_active = TRUE")
                feed = cur.fetchone()
                if not feed:
                    return _json({'error': 'Фид не найден'}, 404)

                where = ["status = 'active'", "(is_visible IS NULL OR is_visible = TRUE)"]
                if feed['filter_category']:
                    where.append(f"category = '{_safe(feed['filter_category'], 50)}'")
                if feed['filter_deal']:
                    where.append(f"deal = '{_safe(feed['filter_deal'], 20)}'")
                if feed_slug == 'yandex':
                    where.append("export_yandex = TRUE")
                elif feed_slug == 'avito':
                    where.append("export_avito = TRUE")
                elif feed_slug == 'cian':
                    where.append("export_cian = TRUE")

                cur.execute(f"SELECT * FROM {SCHEMA}.listings WHERE {' AND '.join(where)} ORDER BY created_at DESC")
                listings = [dict(r) for r in cur.fetchall()]
                # Справочник ВРИ: slug → читаемое имя
                cur.execute(f"SELECT slug, name FROM {SCHEMA}.land_vri")
                _vri_map = {r['slug']: r['name'] for r in cur.fetchall()}
                for l in listings:
                    for k in ('created_at', 'updated_at'):
                        if l.get(k):
                            l[k] = l[k].isoformat()
                    # Для земли: если сотки не заданы — считаем из площади (area в м²)
                    if l.get('category') == 'land' and not l.get('land_area') and l.get('area'):
                        try:
                            l['land_area'] = round(float(l['area']) / 100, 2)
                        except (TypeError, ValueError):
                            pass
                    # ВРИ читаемым названием
                    if l.get('land_vri') and l['land_vri'] in _vri_map:
                        l['land_vri'] = _vri_map[l['land_vri']]

                cur.execute(f"SELECT * FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
                company = dict(cur.fetchone() or {})

                fmt = feed['format']
                if fmt == 'yandex':
                    return _xml_response(_build_yandex(listings, company))
                if fmt == 'avito':
                    return _xml_response(_build_avito(listings, company))
                if fmt == 'cian':
                    return _xml_response(_build_cian(listings, company))
                return _json({'error': 'Неизвестный формат'}, 400)

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
                            f"(title, description, category, deal, price, area, address, city, image, images, status, author_id, "
                            f"floor, total_floors, ceiling_height, building_year, building_class, subway_station, subway_distance, lat, lng) "
                            f"VALUES ('{_safe(title, 255)}', '{_safe(description, 5000)}', "
                            f"'{category}', '{deal}', {price}, {area}, "
                            f"'{_safe(address, 255)}', '{_safe(city, 100)}', "
                            f"'{_safe(first_img, 500)}', '{_safe(images_str, 5000)}', "
                            f"'active', {user['id']}, "
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