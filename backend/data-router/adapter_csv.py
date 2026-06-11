"""
adapter_csv.py — адаптер импорта CSV-файлов.
Все маппинги и утилиты — из core.py.
"""

import csv
import io
import os
import re

import psycopg2

from core import (
    SCHEMA,
    parse_numeric, parse_area, ppm2,
    map_category, map_deal, norm_district,
    validate_record, valid_date, valid_coords, dedup_key,
    fetch_bytes, upsert_batch,
)

_CIAN_AVITO_MARKER = 'Доп.параметры'


def _detect_delimiter(text):
    sample = '\n'.join(text.splitlines()[:5])
    counts = {d: sample.count(d) for d in (';', ',', '\t', '|')}
    return max(counts, key=counts.get)


def _parse_cian_avito_row(row, source, row_num):
    title     = (row.get('Название') or '').strip()
    raw_price = (row.get('Цена') or '').strip().replace(' ', '').replace('\xa0', '')
    date_str  = (row.get('Дата') or '')[:10]
    phone     = (row.get('Телефон') or '').strip()
    district  = norm_district(row.get('Метро/Район') or '', '')
    address   = (row.get('Адрес') or '').strip()
    deal_raw  = (row.get('Тип объявления') or 'продажа')
    src       = (row.get('Источник') or source or 'csv').strip()[:50]
    ext_id    = str(row.get('ID на сайте') or '').strip() or None
    url       = (row.get('URL') or '').strip() or None
    extra     = (row.get('Доп.параметры') or '')
    lat_s     = (row.get('lat') or '').strip()
    lng_s     = (row.get('lng') or '').strip()

    if date_str and not valid_date(date_str):
        return None, f'row {row_num}: устаревшее объявление ({date_str})'

    try:
        price = int(float(raw_price)) if raw_price else 0
    except Exception:
        price = 0

    deal = map_deal(deal_raw)

    area = 0.0
    m = re.search(r'Общая площадь=([0-9.,]+)', extra)
    if m:
        area = parse_numeric(m.group(1))
    if area <= 0:
        area = parse_area(None, title=title)

    ot_m = re.search(r'Вид объекта=([^|]+)', extra)
    obj_type_raw = ot_m.group(1).strip() if ot_m else ''
    category = map_category(obj_type_raw, title=title, url=url or '')

    floor, total_floors = None, None
    fl_m = re.search(r'Этаж=(\d+)', extra)
    tf_m = re.search(r'Этажность здания=(\d+)', extra)
    if fl_m:
        floor = int(fl_m.group(1))
    if tf_m:
        total_floors = int(tf_m.group(1))

    lat = parse_numeric(lat_s) if lat_s else None
    lng = parse_numeric(lng_s) if lng_s else None
    if lat and lng and not valid_coords(lat, lng):
        lat, lng = None, None

    ppm2_val = ppm2(price, area)
    rec = {
        'source': src, 'external_id': ext_id, 'url': url,
        'title': title[:500] or None, 'category': category, 'deal_type': deal,
        'price': price or None, 'price_per_m2': ppm2_val or None, 'area': area or None,
        'address': address[:500] or None, 'district': district[:200] or None,
        'floor': floor, 'total_floors': total_floors,
        'phone': phone[:50] or None, 'description': None, 'lat': lat, 'lng': lng,
    }
    ok_flag, reason = validate_record(rec)
    if not ok_flag:
        return None, f'row {row_num}: {reason}'
    return rec, ''


_HEADER_MAP = {
    'цена': 'price', 'price': 'price', 'стоимость': 'price',
    'площадь': 'area', 'area': 'area', 'кв.м': 'area', 'кв м': 'area',
    'тип сделки': 'deal', 'тип объявления': 'deal', 'deal': 'deal', 'сделка': 'deal',
    'категория': 'cat', 'тип объекта': 'cat', 'вид объекта': 'cat', 'category': 'cat',
    'адрес': 'addr', 'address': 'addr', 'местоположение': 'addr',
    'район': 'dist', 'district': 'dist', 'метро/район': 'dist',
    'этаж': 'floor', 'floor': 'floor',
    'этажность': 'tfloors', 'этажей': 'tfloors',
    'url': 'url', 'ссылка': 'url', 'link': 'url',
    'id': 'ext_id', 'внешний id': 'ext_id',
    'телефон': 'phone', 'phone': 'phone',
    'название': 'title', 'заголовок': 'title', 'title': 'title',
    'описание': 'desc', 'description': 'desc',
    'дата': 'date', 'date': 'date',
    'источник': 'source',
    'lat': 'lat', 'широта': 'lat',
    'lng': 'lng', 'долгота': 'lng', 'lon': 'lng',
}


def _map_header(col_name):
    s = col_name.lower().strip()
    for key, val in _HEADER_MAP.items():
        if key in s:
            return val
    return None


def _parse_generic_row(row, col_map, source, row_num):
    def get(name, default=''):
        col = col_map.get(name)
        return (row.get(col) or default).strip() if col else default

    title    = get('title')
    deal     = map_deal(get('deal', 'продажа'))
    category = map_category(get('cat'), title=title, url=get('url'))
    address  = get('addr')
    district = norm_district(get('dist'), address)
    ext_id   = get('ext_id') or None
    url      = get('url') or None
    phone    = get('phone') or None
    desc     = get('desc')[:1000] or None
    price    = int(parse_numeric(get('price')))
    area     = parse_area(get('area') or None, title=title)
    floor_v  = int(parse_numeric(get('floor')))   or None
    tfloors_v = int(parse_numeric(get('tfloors'))) or None
    lat = parse_numeric(get('lat')) if col_map.get('lat') else None
    lng = parse_numeric(get('lng')) if col_map.get('lng') else None
    if lat and lng and not valid_coords(lat, lng):
        lat, lng = None, None
    date_raw = get('date')[:10]
    if date_raw and not valid_date(date_raw):
        return None, f'row {row_num}: устаревшее объявление ({date_raw})'
    row_source = get('source') or source or 'csv'
    ppm2_val = ppm2(price, area)
    rec = {
        'source': row_source[:50], 'external_id': ext_id, 'url': url,
        'title': title[:500] or None, 'category': category, 'deal_type': deal,
        'price': price or None, 'price_per_m2': ppm2_val or None, 'area': area or None,
        'address': address[:500] or None, 'district': district[:200] or None,
        'floor': floor_v, 'total_floors': tfloors_v,
        'phone': phone[:50] if phone else None, 'description': desc, 'lat': lat, 'lng': lng,
    }
    ok_flag, reason = validate_record(rec)
    if not ok_flag:
        return None, f'row {row_num}: {reason}'
    return rec, ''


def parse_csv(raw_bytes, source):
    text = raw_bytes.decode('utf-8-sig', errors='replace')
    delim = _detect_delimiter(text)
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    fieldnames = reader.fieldnames or []
    is_cian_avito = _CIAN_AVITO_MARKER in fieldnames

    col_map = {}
    if not is_cian_avito:
        for col in fieldnames:
            internal = _map_header(col)
            if internal and internal not in col_map.values():
                col_map[internal] = col
        if 'price' not in col_map:
            return [], [f'Не найдена колонка "Цена". Доступные: {list(fieldnames)[:20]}']

    records, warnings, seen = [], [], set()
    for row_num, row in enumerate(reader, 2):
        if is_cian_avito:
            rec, reason = _parse_cian_avito_row(row, source, row_num)
        else:
            rec, reason = _parse_generic_row(row, col_map, source, row_num)
        if rec is None:
            if reason:
                warnings.append(reason)
            continue
        dk = dedup_key(rec['source'], rec.get('external_id') or '',
                       rec.get('address') or f'row{row_num}',
                       rec.get('area') or 0, rec.get('price') or 0)
        if dk in seen:
            continue
        seen.add(dk)
        records.append(rec)
    return records, warnings


def action_import(file_url, source, replace, preview):
    raw_bytes = fetch_bytes(file_url, timeout=60)
    records, warnings = parse_csv(raw_bytes, source)
    cat_counts, deal_counts = {}, {}
    for r in records:
        cat_counts[r['category']]   = cat_counts.get(r['category'], 0) + 1
        deal_counts[r['deal_type']] = deal_counts.get(r['deal_type'], 0) + 1
    if preview:
        return {'preview': True, 'records_parsed': len(records),
                'category_breakdown': cat_counts, 'deal_breakdown': deal_counts,
                'sample': records[:5], 'warnings': warnings[:20]}
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    if replace:
        cur = conn.cursor()
        cur.execute(f"DELETE FROM {SCHEMA}.market_listings WHERE source = %s", (source,))
        conn.commit()
        cur.close()
    inserted, updated = upsert_batch(conn, records)
    conn.close()
    return {'success': True, 'records_parsed': len(records), 'inserted': inserted,
            'updated': updated, 'warnings_count': len(warnings), 'warnings': warnings[:10],
            'category_breakdown': cat_counts}


def action_stats(source=''):
    import psycopg2.extras
    conn = psycopg2.connect(os.environ['DATABASE_URL'],
                            cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()
    if source:
        cur.execute(
            f"SELECT category, deal_type, COUNT(*) as cnt, AVG(price_per_m2) as avg_ppm2 "
            f"FROM {SCHEMA}.market_listings WHERE source = %s "
            f"GROUP BY category, deal_type ORDER BY cnt DESC", (source,))
    else:
        cur.execute(
            f"SELECT source, COUNT(*) as cnt, MIN(scraped_at) as oldest, MAX(scraped_at) as newest "
            f"FROM {SCHEMA}.market_listings GROUP BY source ORDER BY cnt DESC")
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return {'stats': rows}


def action_clear(source):
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()
    cur.execute(f"DELETE FROM {SCHEMA}.market_listings WHERE source = %s", (source,))
    deleted = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return {'deleted': deleted, 'source': source}
