"""
adapters/xml.py — импорт XML-фидов недвижимости.

Поддерживает форматы:
  - Яндекс.Недвижимость (YRL)
  - Авито XML
  - ЦИАН XML
  - Произвольный XML с тегами <offer>

Умеет:
  - Автофикс битого XML (BOM, мусор, неэкранированный &/<)
  - Парсинг координат, изображений, метро, этажей, класса здания
  - Вставка в listings (основной каталог) ИЛИ market_listings (рынок)
  - preview-режим без записи в БД

Все маппинги — из core.py.
"""

import os
import re
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

import psycopg2
import psycopg2.extras

from core import (
    SCHEMA,
    map_category, map_deal,
    validate_record, valid_coords, ppm2,
    upsert_batch,
)

# ═══════════════════════════════════════════════════════════════════════════════
# АВТОФИКС XML
# ═══════════════════════════════════════════════════════════════════════════════

_CONTROL_CHARS_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')
_CDATA_RE         = re.compile(r'<!\[CDATA\[.*?\]\]>', re.S)
_TAG_RE           = re.compile(r'</?[a-zA-Z][^>]*>|<!--|-->')
_XML_DECL_RE      = re.compile(r'^\s*<\?xml')


def _autofix_xml(text: str) -> tuple[str, list[str]]:
    """
    Чинит типичные проблемы XML-фидов:
    - BOM в начале файла
    - Управляющие символы (кроме \t \n \r)
    - Неэкранированные & и < вне тегов
    - Отсутствующая XML-декларация
    Возвращает (исправленный_текст, список_применённых_фиксов).
    """
    fixes: list[str] = []

    # BOM
    if text.startswith('\ufeff'):
        text = text.lstrip('\ufeff')
        fixes.append('removed BOM')

    # Пробелы в начале
    stripped = text.lstrip()
    if stripped != text:
        text = stripped
        fixes.append('stripped leading whitespace')

    # Управляющие символы
    if _CONTROL_CHARS_RE.search(text):
        text = _CONTROL_CHARS_RE.sub('', text)
        fixes.append('removed control chars')

    # Разбиваем на CDATA-секции и обычный текст
    parts: list[tuple[str, str]] = []
    last = 0
    for m in _CDATA_RE.finditer(text):
        parts.append(('text', text[last:m.start()]))
        parts.append(('cdata', m.group(0)))
        last = m.end()
    parts.append(('text', text[last:]))

    rebuilt: list[str] = []
    fixed_amp = fixed_lt = 0

    for kind, seg in parts:
        if kind == 'cdata':
            rebuilt.append(seg)
            continue

        # Экранируем одиночные &
        new_seg = re.sub(r'&(?![a-zA-Z#]+;)', '&amp;', seg)
        if new_seg != seg:
            fixed_amp += 1
        seg = new_seg

        # Экранируем < вне тегов
        out: list[str] = []
        i, n = 0, len(seg)
        while i < n:
            ch = seg[i]
            if ch == '<':
                m2 = _TAG_RE.match(seg, i)
                if m2:
                    out.append(m2.group(0))
                    i = m2.end()
                    continue
                for prefix, endmark in [('<!--', '-->'), ('<?', '?>'), ('<!', '>')]:
                    if seg.startswith(prefix, i):
                        end = seg.find(endmark, i + len(prefix))
                        if end != -1:
                            out.append(seg[i:end + len(endmark)])
                            i = end + len(endmark)
                            break
                else:
                    out.append('&lt;')
                    fixed_lt += 1
                    i += 1
            else:
                out.append(ch)
                i += 1
        rebuilt.append(''.join(out))

    text = ''.join(rebuilt)
    if fixed_amp:
        fixes.append(f"escaped {fixed_amp} stray '&'")
    if fixed_lt:
        fixes.append(f"escaped {fixed_lt} stray '<'")

    # Добавляем XML-декларацию если нет
    if not _XML_DECL_RE.match(text):
        text = '<?xml version="1.0" encoding="UTF-8"?>\n' + text
        fixes.append('added XML declaration')

    return text, fixes


# ═══════════════════════════════════════════════════════════════════════════════
# ЗАГРУЗКА XML
# ═══════════════════════════════════════════════════════════════════════════════

def _load_xml(source_url: str = '', xml_text: str = '') -> str:
    """
    Загружает XML: либо по URL, либо из переданного текста.
    Возвращает текст XML.
    """
    if xml_text:
        return xml_text

    if not source_url.startswith(('http://', 'https://')):
        raise ValueError('URL должен начинаться с http:// или https://')

    req = urllib.request.Request(
        source_url,
        headers={'User-Agent': 'DataRouter-XML-Importer/1.0'},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()

    head = raw[:200].decode('ascii', errors='ignore')
    m = re.search(r'encoding=["\']([^"\']+)["\']', head, re.I)
    enc = (m.group(1) if m else 'utf-8').lower()
    try:
        return raw.decode(enc, errors='replace')
    except (LookupError, UnicodeDecodeError):
        return raw.decode('utf-8', errors='replace')


def _parse_xml_root(xml_text: str) -> tuple[ET.Element, list[str]]:
    """
    Парсит XML-текст в ElementTree-root.
    При ошибке применяет автофикс и пробует снова.
    """
    # Удаляем дефолтный namespace — мешает поиску тегов
    xml_text = re.sub(r'\sxmlns="[^"]+"', '', xml_text, count=1)

    try:
        return ET.fromstring(xml_text), []
    except ET.ParseError:
        fixed, fixes = _autofix_xml(xml_text)
        try:
            return ET.fromstring(fixed), fixes
        except ET.ParseError as e:
            raise ValueError(f'Ошибка парсинга XML: {e}. Автофикс применён: {fixes}')


# ═══════════════════════════════════════════════════════════════════════════════
# ПАРСИНГ ОДНОГО ОФФЕРА
# ═══════════════════════════════════════════════════════════════════════════════

def _txt(offer: ET.Element, *paths: str) -> str:
    """Возвращает текст первого найденного пути или ''."""
    for path in paths:
        v = offer.findtext(path)
        if v:
            return v.strip()
    return ''

def _int(v: str) -> int | None:
    try:
        return int(float(v)) if v and v.strip().replace('.', '').isdigit() else None
    except Exception:
        return None

def _float(v: str) -> float | None:
    try:
        return float(v.replace(',', '.')) if v else None
    except Exception:
        return None


def _parse_offer(offer: ET.Element, source: str) -> dict | None:
    """
    Парсит один <offer> элемент → словарь записи.
    Поддерживает форматы Яндекс.Недвижимость, Авито XML, ЦИАН XML.
    """
    # Тип сделки
    deal_raw = _txt(offer, 'type', 'deal-type', 'dealType')
    deal = map_deal(deal_raw)

    # Категория
    cat_raw = _txt(offer, 'category', 'object-type', 'objectType', 'property-type')
    category = map_category(cat_raw)

    # Заголовок (description — в YRL часто используется как title)
    title = _txt(offer, 'name', 'title', 'header')
    if not title:
        desc_raw = _txt(offer, 'description')
        title = (desc_raw.split('\n')[0])[:255].strip() if desc_raw else 'Без названия'

    description = _txt(offer, 'description', 'full-description', 'fullDescription')[:5000]

    # Цена
    price_raw = _txt(offer, 'price/value', 'price', 'Price', 'bargain-price')
    price = _int(price_raw) or 0

    # Площадь
    area_raw = _txt(offer, 'area/value', 'area', 'total-area', 'totalArea', 'Area')
    area = _float(area_raw) or 0.0

    # Адрес
    address = _txt(offer, 'location/address', 'address', 'Address', 'location/street')
    city    = _txt(offer, 'location/locality-name', 'city', 'City') or 'Краснодар'

    # Этажи
    floor       = _int(_txt(offer, 'floor', 'Floor'))
    total_floors = _int(_txt(offer, 'floors-total', 'floorsTotal', 'building-floors', 'building/floors-total'))

    # Потолки и год
    ceiling_height = _float(_txt(offer, 'ceiling-height', 'ceilingHeight'))
    building_year  = _int(_txt(offer, 'built-year', 'builtYear', 'building-year'))
    building_class = _txt(offer, 'building-class', 'buildingClass') or None

    # Изображения
    images = [img.text.strip() for img in offer.findall('image') if img.text]
    if not images:
        images = [img.text.strip() for img in offer.findall('.//image') if img.text]
    first_img  = images[0] if images else ''
    images_str = '|'.join(images)

    # Метро
    subway_station  = _txt(offer, './/metro/name', './/metro/station')
    subway_time_raw = _txt(offer, './/metro/time-on-foot', './/metro/timeOnFoot')
    subway_distance = _int(subway_time_raw)

    # Координаты
    lat_raw = _txt(offer, 'location/latitude', 'latitude', 'Latitude')
    lng_raw = _txt(offer, 'location/longitude', 'longitude', 'Longitude')
    lat = _float(lat_raw)
    lng = _float(lng_raw)
    if lat and lng and not valid_coords(lat, lng):
        lat, lng = None, None

    # external_id из атрибута
    ext_id = offer.get('id') or offer.get('internal-id') or ''

    # URL объявления
    url = _txt(offer, 'url', 'URL', 'link')

    # Телефон
    phone = _txt(offer, './/phone', './/contact-info/phone', 'phone')

    ppm2_val = ppm2(price, area) if price and area else None

    return {
        'source':          source,
        'external_id':     ext_id[:200] if ext_id else None,
        'url':             url[:500] if url else None,
        'title':           title[:500],
        'description':     description or None,
        'category':        category,
        'deal_type':       deal,
        'price':           price or None,
        'price_per_m2':    ppm2_val,
        'area':            area or None,
        'address':         address[:500] if address else None,
        'city':            city[:100],
        'floor':           floor,
        'total_floors':    total_floors,
        'ceiling_height':  ceiling_height,
        'building_year':   building_year,
        'building_class':  building_class[:10] if building_class else None,
        'image':           first_img[:500] if first_img else None,
        'images':          images_str[:5000] if images_str else None,
        'phone':           phone[:50] if phone else None,
        'subway_station':  subway_station[:150] if subway_station else None,
        'subway_distance': subway_distance,
        'lat':             lat,
        'lng':             lng,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ВСТАВКА В listings (основной каталог)
# ═══════════════════════════════════════════════════════════════════════════════

def _insert_listings(conn, records: list[dict], author_id: int) -> tuple[int, list[str]]:
    """Вставляет офферы в основную таблицу listings."""
    def safe(v, limit=None):
        s = str(v or '').replace("'", "''")
        return s[:limit] if limit else s

    cur = conn.cursor()
    imported = 0
    errors: list[str] = []

    for rec in records:
        try:
            floor    = rec.get('floor')
            tfloors  = rec.get('total_floors')
            ceiling  = rec.get('ceiling_height')
            b_year   = rec.get('building_year')
            b_class  = rec.get('building_class')
            sub_st   = rec.get('subway_station')
            sub_dist = rec.get('subway_distance')
            lat      = rec.get('lat')
            lng      = rec.get('lng')
            price    = rec.get('price') or 0
            area     = rec.get('area') or 0

            cur.execute(
                f"INSERT INTO {SCHEMA}.listings "
                f"(title, description, category, deal, price, area, address, city, "
                f"image, images, status, author_id, "
                f"floor, total_floors, ceiling_height, building_year, building_class, "
                f"subway_station, subway_distance, lat, lng) "
                f"VALUES ('{safe(rec['title'], 255)}', '{safe(rec.get('description', ''), 5000)}', "
                f"'{rec['category']}', '{rec['deal_type']}', {price}, {area}, "
                f"'{safe(rec.get('address', ''), 255)}', '{safe(rec.get('city', 'Краснодар'), 100)}', "
                f"'{safe(rec.get('image', ''), 500)}', '{safe(rec.get('images', ''), 5000)}', "
                f"'active', {author_id}, "
                f"{floor if floor is not None else 'NULL'}, "
                f"{tfloors if tfloors is not None else 'NULL'}, "
                f"{ceiling if ceiling is not None else 'NULL'}, "
                f"{b_year if b_year is not None else 'NULL'}, "
                f"{'NULL' if not b_class else chr(39) + safe(b_class, 10) + chr(39)}, "
                f"{'NULL' if not sub_st else chr(39) + safe(sub_st, 150) + chr(39)}, "
                f"{sub_dist if sub_dist is not None else 'NULL'}, "
                f"{lat if lat is not None else 'NULL'}, "
                f"{lng if lng is not None else 'NULL'})"
            )
            imported += 1
        except Exception as e:
            errors.append(str(e)[:100])

    conn.commit()
    cur.close()
    return imported, errors


# ═══════════════════════════════════════════════════════════════════════════════
# ПУБЛИЧНЫЙ API АДАПТЕРА
# ═══════════════════════════════════════════════════════════════════════════════

def action_import(
    source_url: str = '',
    xml_text: str = '',
    source: str = 'xml',
    target: str = 'listings',   # 'listings' или 'market'
    author_id: int = 1,
    preview: bool = False,
) -> dict:
    """
    Импортирует XML-фид.

    target='listings' — вставляет в основной каталог listings (для собственных объектов)
    target='market'   — вставляет в market_listings (для рыночной аналитики)
    preview=True      — только парсинг, без записи в БД
    """
    # Загружаем XML
    try:
        xml_text = _load_xml(source_url, xml_text)
    except Exception as e:
        return {'error': str(e)}

    if not xml_text:
        return {'error': 'Пустой XML'}

    # Парсим
    try:
        root, autofix = _parse_xml_root(xml_text)
    except ValueError as e:
        return {'error': str(e)}

    # Собираем офферы
    offers = root.findall('.//offer')
    if not offers:
        return {'error': 'В XML не найдено ни одного тега <offer>'}

    records: list[dict] = []
    parse_errors: list[str] = []

    for i, offer in enumerate(offers):
        try:
            rec = _parse_offer(offer, source)
            if rec:
                records.append(rec)
        except Exception as e:
            parse_errors.append(f'offer {i}: {str(e)[:80]}')

    # Статистика по категориям
    cat_counts: dict[str, int] = {}
    for r in records:
        cat_counts[r['category']] = cat_counts.get(r['category'], 0) + 1

    if preview:
        return {
            'preview':            True,
            'offers_found':       len(offers),
            'records_parsed':     len(records),
            'category_breakdown': cat_counts,
            'autofix_applied':    autofix,
            'parse_errors':       parse_errors[:10],
            'sample':             records[:3],
        }

    # Полный импорт
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        if target == 'market':
            # Приводим к формату market_listings
            market_recs = []
            for r in records:
                mr = {
                    'source':       r['source'],
                    'external_id':  r.get('external_id'),
                    'url':          r.get('url'),
                    'title':        r.get('title'),
                    'category':     r['category'],
                    'deal_type':    r['deal_type'],
                    'price':        r.get('price'),
                    'price_per_m2': r.get('price_per_m2'),
                    'area':         r.get('area'),
                    'address':      r.get('address'),
                    'district':     None,
                    'floor':        r.get('floor'),
                    'total_floors': r.get('total_floors'),
                    'description':  r.get('description'),
                    'condition':    None,
                    'phone':        r.get('phone'),
                    'lat':          r.get('lat'),
                    'lng':          r.get('lng'),
                }
                ok, _ = validate_record(mr)
                if ok:
                    market_recs.append(mr)
            inserted, updated = upsert_batch(conn, market_recs)
            conn.close()
            return {
                'success':            True,
                'target':             'market_listings',
                'offers_found':       len(offers),
                'records_parsed':     len(records),
                'inserted':           inserted,
                'updated':            updated,
                'category_breakdown': cat_counts,
                'autofix_applied':    autofix,
                'parse_errors':       parse_errors[:5],
            }
        else:
            imported, db_errors = _insert_listings(conn, records, author_id)
            conn.close()
            return {
                'success':            True,
                'target':             'listings',
                'offers_found':       len(offers),
                'imported':           imported,
                'category_breakdown': cat_counts,
                'autofix_applied':    autofix,
                'parse_errors':       (parse_errors + db_errors)[:10],
            }
    except Exception as e:
        conn.close()
        return {'error': f'Ошибка при записи в БД: {str(e)[:200]}'}
