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

    # Раздельная обработка CDATA — не трогаем содержимое
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


def _build_yandex(listings, company):
    company_name = _xml_escape(company.get('company_name', 'BIZNEST'))
    phone = _xml_escape(company.get('company_phone', ''))
    email = _xml_escape(company.get('company_email', ''))
    now = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S+00:00')

    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append(f'<realty-feed xmlns="http://webmaster.yandex.ru/schemas/feed/realty/2010-06" generation-date="{now}">')

    for l in listings:
        category_map = {
            'office': 'офисное помещение', 'retail': 'торговое помещение',
            'warehouse': 'складское помещение', 'restaurant': 'помещение свободного назначения',
            'business': 'готовый бизнес', 'production': 'производственное помещение',
        }
        deal_map = {'sale': 'продажа', 'rent': 'аренда', 'business': 'продажа'}
        cat = category_map.get(l.get('category'), 'коммерческая')
        deal = deal_map.get(l.get('deal'), 'продажа')

        out.append(f'<offer internal-id="{l["id"]}">')
        out.append(f'<type>{deal}</type>')
        out.append('<property-type>коммерческая</property-type>')
        out.append(f'<category>{cat}</category>')
        out.append(f'<creation-date>{l["created_at"]}</creation-date>')
        out.append('<location>')
        out.append(f'<country>Россия</country>')
        out.append(f'<locality-name>{_xml_escape(l.get("city") or "Краснодар")}</locality-name>')
        if l.get('address'):
            out.append(f'<address>{_xml_escape(l["address"])}</address>')
        out.append('</location>')
        out.append('<sales-agent>')
        out.append(f'<name>{company_name}</name>')
        if phone:
            out.append(f'<phone>{phone}</phone>')
        if email:
            out.append(f'<email>{email}</email>')
        out.append('<category>agency</category>')
        out.append('</sales-agent>')
        out.append('<price>')
        out.append(f'<value>{l.get("price", 0)}</value>')
        out.append('<currency>RUB</currency>')
        if l.get('deal') == 'rent':
            out.append('<period>month</period>')
        out.append('</price>')
        if l.get('area'):
            out.append(f'<area><value>{l["area"]}</value><unit>кв. м</unit></area>')
        if l.get('floor') is not None:
            out.append(f'<floor>{l["floor"]}</floor>')
        if l.get('total_floors') is not None:
            out.append(f'<floors-total>{l["total_floors"]}</floors-total>')
        if l.get('description'):
            out.append(f'<description>{_xml_escape(l["description"])}</description>')
        for img in _split_images(l):
            out.append(f'<image>{_xml_escape(img)}</image>')
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
        cat_map = {
            'office': 'Офисное помещение', 'retail': 'Торговое помещение',
            'warehouse': 'Помещение свободного назначения', 'restaurant': 'Помещение свободного назначения',
            'business': 'Готовый бизнес', 'production': 'Производственное помещение',
        }
        out.append('<Ad>')
        out.append(f'<Id>{l["id"]}</Id>')
        out.append(f'<DateBegin>{l["created_at"]}</DateBegin>')
        out.append('<Category>Коммерческая недвижимость</Category>')
        out.append(f'<OperationType>{deal_map.get(l.get("deal"), "Продам")}</OperationType>')
        out.append(f'<ObjectType>{cat_map.get(l.get("category"), "Офисное помещение")}</ObjectType>')
        out.append(f'<Title>{_xml_escape(l.get("title", ""))}</Title>')
        out.append(f'<Description><![CDATA[{l.get("description", "")}]]></Description>')
        out.append(f'<Price>{l.get("price", 0)}</Price>')
        out.append('<Address>')
        out.append(f'<City>{_xml_escape(l.get("city") or "Краснодар")}</City>')
        if l.get('address'):
            out.append(f'<Street>{_xml_escape(l["address"])}</Street>')
        out.append('</Address>')
        if l.get('area'):
            out.append(f'<Square>{l["area"]}</Square>')
        if l.get('floor') is not None:
            out.append(f'<Floor>{l["floor"]}</Floor>')
        if l.get('total_floors') is not None:
            out.append(f'<Floors>{l["total_floors"]}</Floors>')
        imgs = _split_images(l)
        if imgs:
            out.append('<Images>')
            for img in imgs:
                out.append(f'<Image url="{_xml_escape(img)}"/>')
            out.append('</Images>')
        if l.get('video_url'):
            out.append(f'<VideoURL>{_xml_escape(l["video_url"])}</VideoURL>')
        company_phone = company.get('company_phone', '')
        if company_phone:
            out.append(f'<ContactPhone>{_xml_escape(company_phone)}</ContactPhone>')
        out.append('</Ad>')

    out.append('</Ads>')
    return '\n'.join(out)


def _build_cian(listings, company):
    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append('<feed>')
    out.append(f'<feed_version>2</feed_version>')

    for l in listings:
        cat_map = {
            'office': 'officeSale', 'retail': 'shoppingAreaSale',
            'warehouse': 'warehouseSale', 'restaurant': 'freeAppointmentObjectSale',
            'business': 'businessSale', 'production': 'industrySale',
        }
        if l.get('deal') == 'rent':
            cat_map = {k: v.replace('Sale', 'Rent') for k, v in cat_map.items()}
        out.append('<object>')
        out.append(f'<ExternalId>{l["id"]}</ExternalId>')
        out.append(f'<Category>{cat_map.get(l.get("category"), "officeSale")}</Category>')
        out.append(f'<Description><![CDATA[{l.get("description", "")}]]></Description>')
        out.append('<Address>')
        out.append(f'<Country>Россия</Country>')
        out.append(f'<Location>{_xml_escape(l.get("city") or "Краснодар")}</Location>')
        if l.get('address'):
            out.append(f'<Address>{_xml_escape(l["address"])}</Address>')
        out.append('</Address>')
        if l.get('area'):
            out.append(f'<TotalArea>{l["area"]}</TotalArea>')
        if l.get('floor') is not None:
            out.append(f'<FloorNumber>{l["floor"]}</FloorNumber>')
        out.append(f'<BargainTerms><Price>{l.get("price", 0)}</Price><Currency>rur</Currency></BargainTerms>')
        imgs = _split_images(l)
        if imgs:
            out.append('<Photos>')
            for img in imgs:
                out.append(f'<PhotoSchema><FullUrl>{_xml_escape(img)}</FullUrl></PhotoSchema>')
            out.append('</Photos>')
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
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
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

                where = ["status = 'active'"]
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
                for l in listings:
                    for k in ('created_at', 'updated_at'):
                        if l.get(k):
                            l[k] = l[k].isoformat()

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
                # Импорт XML Яндекс.Недвижимости
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
                        # Определяем кодировку из заголовка декларации
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
                    # Авто-починка типичных синтаксических ошибок и повторная попытка
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
                        images = [img.text.strip() for img in offer.findall('image') if img.text]
                        first_img = images[0] if images else ''
                        images_str = '|'.join(images)

                        cur.execute(
                            f"INSERT INTO {SCHEMA}.listings "
                            f"(title, description, category, deal, price, area, address, city, image, images, status, author_id) "
                            f"VALUES ('{_safe(title, 255)}', '{_safe(description, 5000)}', "
                            f"'{category}', '{deal}', {price}, {area}, "
                            f"'{_safe(address, 255)}', '{_safe(city, 100)}', "
                            f"'{_safe(first_img, 500)}', '{_safe(images_str, 5000)}', "
                            f"'active', {user['id']})"
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