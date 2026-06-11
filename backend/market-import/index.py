"""
Универсальный импортёр рыночных данных в market_listings.
Поддерживает CSV (выгрузка парсера: ЦИАН, Авито, Яндекс) и XLSX (ручная выгрузка).

Формат CSV: разделитель ";", кодировка UTF-8/UTF-8-BOM
  Колонки: Название, Цена, Дата, Телефон, Метро/Район, Адрес, Тип объявления,
           Источник, lat, lng, Доп.параметры (Этаж=N|Этажность=N|Вид объекта=X|Общая площадь=N)

Формат XLSX: произвольные колонки, обязательные: Цена, Площадь, Тип сделки.
  Дополнительные: Район, Адрес, Телефон, Этаж, Этажность, URL

Action: POST { action: 'import', file_url: '...', source: 'cian|avito|manual', preview: true/false }
        POST { action: 'stats' }
        POST { action: 'clear', source: 'avito' }
"""

import csv
import io
import json
import math
import os
import re
import urllib.request
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}

# ── Маппинг типов объектов ────────────────────────────────────────────────────

OBJ_TYPE_MAP = {
    'офисное помещение': 'office', 'офис': 'office',
    'торговое помещение': 'retail', 'торговый': 'retail', 'магазин': 'retail',
    'помещение свободного назначения': 'free_purpose', 'свободного назначения': 'free_purpose',
    'складское помещение': 'warehouse', 'склад': 'warehouse',
    'производственное помещение': 'production', 'производство': 'production',
    'здание': 'building', 'отдельно стоящее здание': 'building',
    'помещение общепита': 'restaurant', 'общепит': 'restaurant', 'кафе': 'restaurant', 'ресторан': 'restaurant',
    'гостиница': 'hotel', 'апартаменты': 'hotel',
    'коммерческая земля': 'land', 'земля': 'land',
    'автосервис': 'car_service', 'автомойка': 'car_service',
    'готовый арендный бизнес': 'gab',
    'другое': 'other', 'иное': 'other',
}

DEAL_MAP = {
    'продам': 'sale', 'продажа': 'sale', 'продаётся': 'sale', 'продается': 'sale',
    'сдам': 'rent', 'аренда': 'rent', 'сдаётся': 'rent', 'сдается': 'rent',
}

# Нормализация районов: дубли из ЦИАН/Авито → единый вид
DISTRICT_NORM = {
    'р-н прикубанский': 'Прикубанский', 'прикубанский': 'Прикубанский',
    'р-н карасунский': 'Карасунский', 'карасунский': 'Карасунский',
    'р-н западный': 'Западный', 'западный': 'Западный',
    'р-н центральный': 'Центральный', 'центральный': 'Центральный',
    'р-н прикубанский округ': 'Прикубанский',
}

# Фильтры качества
MIN_PRICE_SALE = 100_000       # 100 тыс — минимальная цена продажи (реальный минимум для КНД)
MAX_PRICE_SALE = 5_000_000_000 # 5 млрд — максимум
MIN_PRICE_RENT = 3_000         # 3 тыс/мес — минимальная аренда
MAX_PRICE_RENT = 10_000_000    # 10 млн/мес — максимум аренды
MIN_AREA = 4                   # 4 м² — реальный минимум (кладовки, боксы)
MAX_AREA = 100_000
FRESH_DAYS = 365               # принимаем объявления не старше 1 года


# ── Утилиты ───────────────────────────────────────────────────────────────────

def _get_conn():
    return psycopg2.connect(
        os.environ['DATABASE_URL'],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _map_obj_type(raw: str) -> str:
    if not raw:
        return 'other'
    s = raw.lower().strip()
    for key, val in OBJ_TYPE_MAP.items():
        if key in s:
            return val
    return 'other'


def _map_deal(raw: str) -> str:
    if not raw:
        return 'sale'
    s = raw.lower().strip()
    for key, val in DEAL_MAP.items():
        if key in s:
            return val
    return 'sale'


def _norm_district(raw: str) -> str:
    if not raw:
        return ''
    s = raw.lower().strip()
    return DISTRICT_NORM.get(s, raw.strip())


def _parse_float(s) -> float:
    if s is None:
        return 0.0
    try:
        return float(str(s).replace(' ', '').replace(',', '.').replace('\xa0', ''))
    except Exception:
        return 0.0


def _valid_date(date_str: str) -> bool:
    """Проверяет что дата не старше FRESH_DAYS."""
    try:
        d = datetime.fromisoformat(date_str[:10])
        return (datetime.now() - d).days <= FRESH_DAYS
    except Exception:
        return True  # если нет даты — принимаем


def _ppm2(price: float, area: float) -> float:
    if area > 0 and price > 0:
        return round(price / area, 2)
    return 0.0


def _dedup_key(address: str, area: float) -> str:
    """Ключ для дедупликации: адрес + площадь ±10%."""
    bucket = round(area / 10) * 10 if area > 0 else 0
    return f"{address.lower().strip()}|{bucket}"


# ── Парсер CSV (формат ЦИАН/Авито-парсера) ───────────────────────────────────

def _parse_csv(raw_bytes: bytes, source: str) -> tuple[list[dict], list[str]]:
    """Парсит CSV-файл, возвращает (записи, предупреждения)."""
    text = raw_bytes.decode('utf-8-sig', errors='replace')
    reader = csv.DictReader(io.StringIO(text), delimiter=';')
    records, warnings = [], []
    seen_keys = set()

    for i, row in enumerate(reader, 1):
        title    = (row.get('Название') or '').strip()
        raw_price = (row.get('Цена') or '').strip().replace(' ', '').replace('\xa0', '')
        date_str  = (row.get('Дата') or '')[:19]
        phone     = (row.get('Телефон') or '').strip()
        district  = _norm_district(row.get('Метро/Район') or '')
        address   = (row.get('Адрес') or '').strip()
        deal_raw  = (row.get('Тип объявления') or '')
        src       = (row.get('Источник') or source or 'csv').strip()
        ext_id    = str(row.get('ID на сайте') or '').strip()
        url       = (row.get('URL') or '').strip()
        extra     = (row.get('Доп.параметры') or '')
        lat_s     = (row.get('lat') or '').strip()
        lng_s     = (row.get('lng') or '').strip()

        # Дата
        if date_str and not _valid_date(date_str):
            warnings.append(f'row {i}: устаревшее объявление ({date_str[:10]}), пропущено')
            continue

        # Цена
        try:
            price = float(raw_price) if raw_price else 0.0
        except Exception:
            price = 0.0

        deal = _map_deal(deal_raw)

        # Фильтр цены
        if deal == 'sale' and not (MIN_PRICE_SALE <= price <= MAX_PRICE_SALE):
            if price > 0:
                warnings.append(f'row {i}: цена вне диапазона ({price:,.0f}), пропущено')
            continue
        if deal == 'rent' and not (MIN_PRICE_RENT <= price <= MAX_PRICE_RENT):
            if price > 0:
                warnings.append(f'row {i}: цена аренды вне диапазона ({price:,.0f}), пропущено')
            continue

        # Площадь из Доп.параметры или из названия
        area = 0.0
        m = re.search(r'Общая площадь=([0-9.,]+)', extra)
        if m:
            area = _parse_float(m.group(1))
        if area <= 0:
            m2 = re.search(r'\((\d+[\.,]?\d*)\s*м', title)
            if m2:
                area = _parse_float(m2.group(1))

        if not (MIN_AREA <= area <= MAX_AREA):
            if area > 0:
                warnings.append(f'row {i}: площадь вне диапазона ({area}), пропущено')
            continue

        # Тип объекта
        ot_m = re.search(r'Вид объекта=([^|]+)', extra)
        obj_type_raw = ot_m.group(1).strip() if ot_m else ''
        category = _map_obj_type(obj_type_raw)

        # Этаж
        floor, total_floors = None, None
        fl_m = re.search(r'Этаж=(\d+)', extra)
        tf_m = re.search(r'Этажность здания=(\d+)', extra)
        if fl_m:
            floor = int(fl_m.group(1))
        if tf_m:
            total_floors = int(tf_m.group(1))

        # Координаты
        lat = _parse_float(lat_s)
        lng = _parse_float(lng_s)
        if lat != 0 and lng != 0 and not (44.0 < lat < 45.7 and 38.5 < lng < 39.5):
            warnings.append(f'row {i}: координаты вне Краснодара ({lat},{lng}), сброшены')
            lat, lng = 0.0, 0.0

        ppm2 = _ppm2(price, area)

        # Дедупликация
        dk = _dedup_key(address or title, area)
        if dk in seen_keys:
            continue
        seen_keys.add(dk)

        records.append({
            'source': src[:50],
            'external_id': ext_id[:200] if ext_id else None,
            'url': url or None,
            'title': title[:500] if title else None,
            'category': category,
            'deal_type': deal,
            'price': int(price) if price else None,
            'price_per_m2': ppm2 if ppm2 else None,
            'area': area if area else None,
            'address': address[:500] if address else None,
            'district': district[:200] if district else None,
            'floor': floor,
            'total_floors': total_floors,
            'phone': phone[:50] if phone else None,
            'description': None,
            'lat': lat if lat else None,
            'lng': lng if lng else None,
        })

    return records, warnings


# ── Парсер XLSX (ручная выгрузка) ────────────────────────────────────────────

def _parse_xlsx(raw_bytes: bytes, source: str) -> tuple[list[dict], list[str]]:
    """Парсит XLSX с произвольными колонками."""
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
    ws = wb.active
    all_rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not all_rows:
        return [], ['Файл пустой']

    header = [str(c).strip().lower() if c else '' for c in all_rows[0]]

    # Поиск нужных колонок (нечёткий)
    def find_col(*candidates) -> int:
        for cand in candidates:
            for i, h in enumerate(header):
                if cand in h:
                    return i
        return -1

    col_price   = find_col('цена', 'price')
    col_area    = find_col('площадь', 'area', 'кв.м', 'кв м')
    col_deal    = find_col('тип сделки', 'тип объявления', 'deal', 'сделка')
    col_cat     = find_col('категория', 'тип объекта', 'вид объекта', 'category')
    col_addr    = find_col('адрес', 'address')
    col_dist    = find_col('район', 'district', 'метро')
    col_phone   = find_col('телефон', 'phone')
    col_floor   = find_col('этаж', 'floor')
    col_tfloors = find_col('этажность', 'этажей', 'total_floor')
    col_url     = find_col('url', 'ссылка', 'link')
    col_ext_id  = find_col('id', 'внешний')
    col_date    = find_col('дата', 'date')

    if col_price < 0 or col_area < 0:
        return [], ['Не найдены обязательные колонки "Цена" и "Площадь"']

    records, warnings = [], []
    seen_keys = set()

    for i, row in enumerate(all_rows[1:], 2):
        def cell(idx):
            if idx < 0 or idx >= len(row):
                return None
            return row[idx]

        # Дата
        date_val = cell(col_date)
        if date_val:
            date_str = str(date_val)[:10]
            if not _valid_date(date_str):
                warnings.append(f'row {i}: устаревшее объявление, пропущено')
                continue

        price = _parse_float(cell(col_price))
        area  = _parse_float(cell(col_area))
        deal_raw = str(cell(col_deal) or 'продам')
        deal = _map_deal(deal_raw)

        # Фильтры
        if deal == 'sale' and not (MIN_PRICE_SALE <= price <= MAX_PRICE_SALE):
            if price > 0:
                warnings.append(f'row {i}: цена продажи вне диапазона ({price:,.0f})')
            continue
        if deal == 'rent' and not (MIN_PRICE_RENT <= price <= MAX_PRICE_RENT):
            if price > 0:
                warnings.append(f'row {i}: цена аренды вне диапазона ({price:,.0f})')
            continue
        if not (MIN_AREA <= area <= MAX_AREA):
            if area > 0:
                warnings.append(f'row {i}: площадь вне диапазона ({area})')
            continue

        category = _map_obj_type(str(cell(col_cat) or ''))
        address  = str(cell(col_addr) or '').strip()
        district = _norm_district(str(cell(col_dist) or ''))
        phone    = str(cell(col_phone) or '').strip()
        floor    = int(_parse_float(cell(col_floor))) or None
        tfloors  = int(_parse_float(cell(col_tfloors))) or None
        url      = str(cell(col_url) or '').strip() or None
        ext_id   = str(cell(col_ext_id) or '').strip() or None

        ppm2 = _ppm2(price, area)

        dk = _dedup_key(address or f'row_{i}', area)
        if dk in seen_keys:
            continue
        seen_keys.add(dk)

        records.append({
            'source': source[:50],
            'external_id': ext_id,
            'url': url,
            'title': None,
            'category': category,
            'deal_type': deal,
            'price': int(price) if price else None,
            'price_per_m2': ppm2 if ppm2 else None,
            'area': area if area else None,
            'address': address[:500] if address else None,
            'district': district[:200] if district else None,
            'floor': floor,
            'total_floors': tfloors,
            'phone': phone[:50] if phone else None,
            'description': None,
            'lat': None,
            'lng': None,
        })

    return records, warnings


# ── Вставка в БД ─────────────────────────────────────────────────────────────

def _insert_records(cur, conn, records: list[dict]) -> dict:
    """
    Батчевая вставка для высокой производительности.
    Стратегия дедупликации:
    1. Загружаем все existing external_id одним запросом (O(1) вместо O(N))
    2. Новые → INSERT через executemany батчами по 200 строк
    3. Существующие → UPDATE батчем
    """
    inserted = skipped = updated = 0
    if not records:
        return {'inserted': 0, 'skipped': 0, 'updated': 0}

    def esc(v): return str(v).replace("'", "''") if v else ''

    # Собираем все external_id которые есть в этом импорте
    sources_in_batch = list({r['source'] for r in records if r.get('source')})
    extids_in_batch  = [r['external_id'] for r in records if r.get('external_id')]

    # Один запрос — получаем все уже существующие external_id
    existing_extids: set = set()
    if extids_in_batch and sources_in_batch:
        src_list  = ','.join(f"'{esc(s)}'" for s in sources_in_batch)
        eid_list  = ','.join(f"'{esc(e)}'" for e in extids_in_batch[:5000])
        cur.execute(f"""
            SELECT external_id FROM {SCHEMA}.market_listings
            WHERE source IN ({src_list})
              AND external_id IN ({eid_list})
        """)
        existing_extids = {row['external_id'] for row in cur.fetchall()}

    to_insert = []
    to_update = []  # (external_id, source, price, ppm2, area)

    for r in records:
        extid = r.get('external_id') or ''
        src   = r.get('source') or 'manual'

        if extid and extid in existing_extids:
            # Обновляем цену/площадь
            to_update.append((
                r.get('price'), r.get('price_per_m2'), r.get('area'),
                r.get('url') or '', r.get('district') or '', r.get('phone') or '',
                extid, src,
            ))
        else:
            to_insert.append(r)

    # Батчевый UPDATE — по 50 строк
    for i in range(0, len(to_update), 50):
        batch = to_update[i:i+50]
        for (price, ppm2, area, url_v, dist_v, phone_v, extid, src) in batch:
            ps = str(price) if price is not None else 'NULL'
            pp = str(ppm2)  if ppm2  is not None else 'NULL'
            ar = str(area)  if area  is not None else 'NULL'
            cur.execute(f"""
                UPDATE {SCHEMA}.market_listings SET
                  price = {ps}, price_per_m2 = {pp}, area = {ar}, scraped_at = NOW()
                  {f", url = '{esc(url_v)}'" if url_v else ''}
                  {f", district = '{esc(dist_v)}'" if dist_v else ''}
                  {f", phone = '{esc(phone_v)}'" if phone_v else ''}
                WHERE source = '{esc(src)}' AND external_id = '{esc(extid)}'
            """)
            updated += 1

    # Батчевый INSERT — по 100 строк
    BATCH = 100
    for i in range(0, len(to_insert), BATCH):
        batch = to_insert[i:i+BATCH]
        values_parts = []
        for r in batch:
            src     = esc(r.get('source') or 'manual')
            extid   = esc(r.get('external_id') or '')
            url_v   = esc(r.get('url') or '')
            title_v = esc(r.get('title') or '')
            cat     = esc(r.get('category') or 'other')
            deal    = esc(r.get('deal_type') or 'sale')
            price_s = str(r['price'])        if r.get('price')        is not None else 'NULL'
            ppm2_s  = str(r['price_per_m2']) if r.get('price_per_m2') is not None else 'NULL'
            area_s  = str(r['area'])         if r.get('area')         is not None else 'NULL'
            addr    = esc(r.get('address') or '')
            dist    = esc(r.get('district') or '')
            floor_s = str(r['floor'])        if r.get('floor')        is not None else 'NULL'
            tfl_s   = str(r['total_floors']) if r.get('total_floors') is not None else 'NULL'
            phone_v = esc(r.get('phone') or '')

            q_extid  = f"'{extid}'"  if extid  else 'NULL'
            q_url    = f"'{url_v}'"   if url_v  else 'NULL'
            q_title  = f"'{title_v}'" if title_v else 'NULL'
            q_addr   = f"'{addr}'"    if addr   else 'NULL'
            q_dist   = f"'{dist}'"    if dist   else 'NULL'
            q_phone  = f"'{phone_v}'" if phone_v else 'NULL'
            values_parts.append(
                f"('{src}', {q_extid}, {q_url}, {q_title}, "
                f"'{cat}', '{deal}', {price_s}, {ppm2_s}, {area_s}, "
                f"{q_addr}, {q_dist}, {floor_s}, {tfl_s}, {q_phone}, NOW())"
            )

        if values_parts:
            cur.execute(f"""
                INSERT INTO {SCHEMA}.market_listings
                  (source, external_id, url, title, category, deal_type, price, price_per_m2,
                   area, address, district, floor, total_floors, phone, scraped_at)
                VALUES {','.join(values_parts)}
                ON CONFLICT DO NOTHING
            """)
            inserted += cur.rowcount

        conn.commit()  # коммит после каждого батча — не теряем прогресс

    return {'inserted': inserted, 'skipped': skipped, 'updated': updated}


# ── Handler ───────────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """Импорт рыночных данных из CSV или XLSX в market_listings."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    def ok(data):
        return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
                'body': json.dumps(data, ensure_ascii=False, default=str)}

    def err(code, msg):
        return {'statusCode': code, 'headers': {**CORS, 'Content-Type': 'application/json'},
                'body': json.dumps({'error': msg}, ensure_ascii=False)}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass
    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or 'import'

    conn = _get_conn()
    cur = conn.cursor()

    try:
        # ── Статистика ────────────────────────────────────────────────────────
        if action == 'stats':
            cur.execute(f"""
                SELECT source, deal_type, category,
                  COUNT(*) as cnt,
                  ROUND(AVG(price_per_m2)::numeric, 0) as avg_ppm2,
                  MAX(scraped_at) as last_scraped
                FROM {SCHEMA}.market_listings
                GROUP BY source, deal_type, category
                ORDER BY source, deal_type, cnt DESC
            """)
            rows = cur.fetchall()
            cur.execute(f"SELECT COUNT(*) as total FROM {SCHEMA}.market_listings")
            total = cur.fetchone()['total']
            return ok({'total': total, 'breakdown': [dict(r) for r in rows]})

        # ── Очистка по источнику ──────────────────────────────────────────────
        if action == 'clear':
            source = (body.get('source') or '').strip()
            if not source:
                return err(400, 'Укажите source')
            src_safe = source.replace("'", "''")
            cur.execute(f"DELETE FROM {SCHEMA}.market_listings WHERE source = '{src_safe}'")
            deleted = max(0, cur.rowcount)
            conn.commit()
            return ok({'deleted': deleted, 'source': source})

        # ── Импорт ───────────────────────────────────────────────────────────
        file_url = body.get('file_url') or qs.get('file_url') or ''
        source   = body.get('source') or 'manual'
        preview  = body.get('preview', False)
        replace  = body.get('replace', False)  # удалить старые записи этого источника перед импортом

        if not file_url:
            return err(400, 'Укажите file_url')

        # Скачиваем файл
        req = urllib.request.Request(file_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw_bytes = resp.read()

        file_lower = file_url.lower().split('?')[0]
        if file_lower.endswith('.xlsx') or file_lower.endswith('.xls'):
            records, warnings = _parse_xlsx(raw_bytes, source)
            fmt = 'xlsx'
        else:
            records, warnings = _parse_csv(raw_bytes, source)
            fmt = 'csv'

        # Превью — возвращаем без записи
        if preview:
            # Статистика по превью
            by_cat   = {}
            by_deal  = {}
            for r in records:
                by_cat[r['category']]   = by_cat.get(r['category'], 0) + 1
                by_deal[r['deal_type']] = by_deal.get(r['deal_type'], 0) + 1
            prices = [r['price'] for r in records if r.get('price')]
            areas  = [float(r['area']) for r in records if r.get('area')]
            import statistics as _st
            return ok({
                'preview': True,
                'format': fmt,
                'total_parsed': len(records),
                'warnings_count': len(warnings),
                'warnings_sample': warnings[:20],
                'by_category': by_cat,
                'by_deal': by_deal,
                'price_median': round(_st.median(prices)) if prices else None,
                'area_median': round(_st.median(areas)) if areas else None,
                'sample': records[:10],
            })

        # Опционально: очищаем старые данные этого источника
        if replace:
            src_safe = source.replace("'", "''")
            cur.execute(f"DELETE FROM {SCHEMA}.market_listings WHERE source = '{src_safe}'")
            deleted_old = cur.rowcount
            conn.commit()
        else:
            deleted_old = 0

        # Вставляем
        result = _insert_records(cur, conn, records)

        # П.3: Автопереобучение ВБ после импорта (если добавились новые записи)
        retrain_triggered = False
        retrain_error = None
        if result['inserted'] > 0:
            retrain_triggered, retrain_error = _trigger_vb_retrain(cur)

        return ok({
            'success': True,
            'format': fmt,
            'total_parsed': len(records),
            'inserted': result['inserted'],
            'updated': result.get('updated', 0),
            'skipped': result['skipped'],
            'deleted_old': deleted_old,
            'warnings_count': len(warnings),
            'warnings_sample': warnings[:20],
            'retrain_triggered': retrain_triggered,
            'retrain_error': retrain_error,
        })

    finally:
        cur.close()
        conn.close()


def _trigger_vb_retrain(cur) -> tuple[bool, str | None]:
    """П.3: Запускает переобучение ВБ по источникам market_import и district_prices.
    Вызывается асинхронно через HTTP — не блокирует ответ импортёра.
    Берёт URL ai-retrain из func2url или переменной окружения.
    """
    import threading

    # Получаем токен admin-сессии для авторизации retrain
    cur.execute(f"""
        SELECT s.token FROM {SCHEMA}.sessions s
        JOIN {SCHEMA}.users u ON u.id = s.user_id
        WHERE u.role = 'admin' AND s.expires_at > NOW()
        ORDER BY s.created_at DESC LIMIT 1
    """)
    row = cur.fetchone()
    if not row:
        return False, 'Нет активной admin-сессии для запуска retrain'

    token = row['token']
    retrain_url = os.environ.get('RETRAIN_URL', '')
    if not retrain_url:
        # Пробуем из func2url (если задеплоено вместе)
        return False, 'RETRAIN_URL не задан'

    def _fire():
        try:
            payload = json.dumps({'sources': ['market_import', 'district_prices']}).encode()
            req = urllib.request.Request(
                retrain_url,
                data=payload,
                headers={
                    'Content-Type': 'application/json',
                    'X-Auth-Token': token,
                },
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                resp.read()
        except Exception as e:
            print(f'[market-import] retrain fire error: {e}')

    t = threading.Thread(target=_fire, daemon=True)
    t.start()
    return True, None