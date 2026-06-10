"""
Полный сбор всех объявлений arrpro.ru за один вызов.
Обходит все категории продажи и аренды, собирает ~590 объявлений.
Таймаут функции должен быть 600 сек (настраивается в Ядре → Функции).
"""

import json
import os
import re
import gzip
import urllib.request
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
}

CAT_MAP = {
    'офис': 'office', 'офисн': 'office',
    'торг': 'retail', 'магазин': 'retail', 'торговы': 'retail',
    'склад': 'warehouse',
    'производ': 'industrial', 'цех': 'industrial',
    'общепит': 'catering', 'кафе': 'catering', 'ресторан': 'catering',
    'псн': 'free_purpose', 'свободн': 'free_purpose', 'назначен': 'free_purpose',
    'здани': 'standalone', 'отдельно': 'standalone',
    'земл': 'land',
    'гараж': 'garage', 'автосерв': 'garage',
}

URL_CAT_MAP = {
    'sklad': 'warehouse', 'ofis': 'office',
    'torgovoe': 'retail', 'torgovlya': 'retail', 'magazin': 'retail',
    'obshchepit': 'catering', 'kafe': 'catering', 'restoran': 'catering',
    'proizvodstvo': 'industrial', 'promyshlennoe': 'industrial',
    'svobodnogo-naznacheniya': 'free_purpose', 'psn': 'free_purpose',
    'zdanie': 'standalone', 'otdelnoe': 'standalone',
    'zemelniy-uchastok': 'land', 'zemlya': 'land',
    'gostinica': 'other', 'avtoservis': 'other', 'garazh': 'other',
}

CAT_RU = {
    'office': 'Офис', 'retail': 'Торговое помещение', 'warehouse': 'Склад',
    'industrial': 'Производство', 'catering': 'Общепит', 'free_purpose': 'ПСН',
    'standalone': 'Отдельно стоящее здание', 'land': 'Земельный участок',
    'other': 'Коммерческая недвижимость',
}

DEAL_RU = {'sale': 'Продажа', 'rent': 'Аренда'}

STREET_DISTRICT_MAP = {
    'фестивальн': 'ФМР', 'фмр': 'ФМР', 'чистяковск': 'ФМР',
    'героя пешков': 'ФМР', 'московск': 'ФМР', 'дзержинск': 'ФМР',
    'шевцов': 'ФМР', 'прокофьев': 'ФМР', 'бабушкин': 'ФМР',
    'ставропольск': 'ФМР', 'гагарин': 'ФМР',
    'цмр': 'ЦМР', 'октябрьск': 'ЦМР', 'ленин': 'ЦМР', 'мира': 'ЦМР',
    'пушкин': 'ЦМР', 'суворов': 'ЦМР', 'кубанонабережн': 'ЦМР',
    'юмр': 'ЮМР', 'юбилейн': 'ЮМР', 'симферопольск': 'ЮМР',
    'уральск': 'ЮМР', 'адмирала трибуца': 'ЮМР',
    'гидростроит': 'Гидрострой', 'новороссийск': 'Гидрострой',
    'колосист': 'Гидрострой', 'звездн': 'Гидрострой',
    'музыкальн': 'Музыкальный',
    'черёмушк': 'Прикубанский', 'черемушк': 'Прикубанский',
    'прикубанск': 'Прикубанский', 'домбайск': 'Прикубанский',
    'ангарск': 'Прикубанский', 'осокин': 'Прикубанский',
    'индустриальн': 'Прикубанский',
    'карасунск': 'Карасунский', 'ростовское шоссе': 'Карасунский',
    'шоссе нефтяников': 'Карасунский', 'ярославск': 'Карасунский',
    'садовое кольцо': 'Карасунский',
    'западн': 'Западный', 'тургенев': 'Западный',
    'новознаменск': 'Новознаменский',
}


def _detect_district(address: str):
    if not address:
        return None
    a = address.lower()
    for kw, dist in STREET_DISTRICT_MAP.items():
        if kw.lower() in a:
            return dist
    return None


def _detect_category(text: str) -> str:
    t = (text or '').lower()
    for kw, cat in CAT_MAP.items():
        if kw in t:
            return cat
    return 'other'


def _clean_price(s) -> int | None:
    if not s:
        return None
    s = re.sub(r'[^\d]', '', str(s))
    return int(s) if s else None


def _clean_area(s) -> float | None:
    if not s:
        return None
    m = re.search(r'[\d]+[.,]?[\d]*', str(s).replace(' ', ''))
    return float(m.group().replace(',', '.')) if m else None


def _fetch(url: str, timeout: int = 20) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read(800_000)
            enc = r.headers.get('Content-Encoding', '')
        if enc == 'gzip' or (raw[:2] == b'\x1f\x8b'):
            try:
                raw = gzip.decompress(raw)
            except Exception:
                pass
        for e in ('utf-8', 'cp1251', 'latin-1'):
            try:
                return raw.decode(e, errors='replace')
            except Exception:
                continue
    except Exception as ex:
        print(f'[fetch] {url}: {ex}')
    return ''


def _parse_arrpro_page(html: str, deal_type: str) -> list[dict]:
    results = []
    seen_ids = set()

    url_matches = list(re.finditer(
        r'href=["\'](/katalog/[^"\']+\.php)[^"\']*["\'][^>]*class=["\'][^"\']*props__address',
        html, re.IGNORECASE
    ))
    positions = [(m.start(), m.group(1)) for m in url_matches]

    for idx, (pos, raw_url) in enumerate(positions):
        next_pos = positions[idx + 1][0] if idx + 1 < len(positions) else pos + 4000
        block = html[max(0, pos - 200): next_pos + 200]

        obj_url = 'https://krasnodar.arrpro.ru' + raw_url
        id_m = re.search(r'-(\d+)\.php', obj_url)
        ext_id = id_m.group(1) if id_m else f"arr_{idx}"
        if ext_id in seen_ids:
            continue
        seen_ids.add(ext_id)

        if any(x in obj_url for x in ('/prodam/', '/prodayu-', '/prodam-')):
            actual_deal = 'sale'
        elif any(x in obj_url for x in ('/arenda/', '/sdam-', '/snimu-', '/sdam/')):
            actual_deal = 'rent'
        else:
            actual_deal = deal_type

        pm = re.search(r'class=["\']props__price["\'][^>]*>\s*([\d\s]+)\s*руб', block)
        price = _clean_price(pm.group(1)) if pm else None
        if not price or price < 10_000:
            continue

        p2m = re.search(r'class=["\']props__priceForM["\'][^>]*>\s*([\d\s]+)\s*руб', block)
        price_per_m2 = float(_clean_price(p2m.group(1))) if p2m and _clean_price(p2m.group(1)) else None

        area = None
        area_opt_m = re.search(r'Площадь[:\s]+\s*([\d\s,\.]+)\s*(?:кв\.?\s*м|м²)', block, re.IGNORECASE)
        if area_opt_m:
            area = _clean_area(area_opt_m.group(1))
        elif price and price_per_m2 and price_per_m2 > 0:
            area = round(price / price_per_m2, 1)

        addr_m = re.search(
            r'class=["\']props__address["\'][^>]*>.*?</(?:svg|use)>\s*</svg>\s*([^\n<]{5,150})\s*</a>',
            block, re.DOTALL
        )
        if not addr_m:
            addr_m2 = re.search(r'props__address[^>]*>(?:[^<]*<[^>]+>)*\s*([А-Яа-яёЁ][^\n<]{4,120})\s*</a>', block, re.DOTALL)
            address = addr_m2.group(1).strip() if addr_m2 else None
        else:
            address = addr_m.group(1).strip()

        floor = None
        total_floors = None
        floor_m = re.search(r'[Ээ]таж[:\s]+(\d{1,2})(?:\s*из\s*(\d{1,2}))?', block)
        if floor_m:
            f_val = int(floor_m.group(1))
            if 1 <= f_val <= 50:
                floor = f_val
                if floor_m.group(2):
                    total_floors = int(floor_m.group(2))

        road_line = None
        line_map = {'перв': '1 линия', 'втор': '2 линия', 'трет': '3 линия'}
        line_m = re.search(r'[Лл]иния[:\s]+([^\n<,]{3,30})', block)
        if line_m:
            lt = line_m.group(1).strip().lower()
            for kw, val in line_map.items():
                if kw in lt:
                    road_line = val
                    break
            if not road_line:
                digit_m = re.search(r'(\d)', lt)
                road_line = f"{digit_m.group(1)} линия" if digit_m else lt[:20]
        else:
            title_line_m = re.search(r'(\d)\s*лини', block, re.IGNORECASE)
            if title_line_m:
                road_line = f"{title_line_m.group(1)} линия"

        condition = None
        cond_m = re.search(r'[Сс]остояние[:\s]+([^\n<,]{3,40})', block)
        if cond_m:
            condition = cond_m.group(1).strip()

        district = None
        dist_m = re.search(r'[Рр]айон[:\s]+([А-Яа-яёЁ\s\-]{3,40}?)(?:\.|,|<)', block)
        if dist_m:
            district = dist_m.group(1).strip()
        if not district and address:
            district = _detect_district(address)

        category = 'other'
        for seg, cat in URL_CAT_MAP.items():
            if seg in obj_url:
                category = cat
                break
        if category == 'other' and address:
            category = _detect_category(address)

        title_parts = [DEAL_RU.get(actual_deal, ''), CAT_RU.get(category, 'Объект')]
        if area: title_parts.append(f'{area} м²')
        if floor: title_parts.append(f'{floor} эт.')
        if road_line: title_parts.append(road_line)
        if address: title_parts.append(address[:60])
        title = ', '.join(p for p in title_parts if p)

        results.append({
            'source': 'arrpro', 'external_id': ext_id, 'url': obj_url,
            'title': title[:500], 'category': category, 'deal_type': actual_deal,
            'price': price, 'price_per_m2': price_per_m2, 'area': area,
            'address': address, 'district': district, 'floor': floor,
            'total_floors': total_floors, 'condition': condition, 'road_line': road_line,
        })

    return results


def _save_listings(cur, items: list[dict]) -> dict:
    inserted = updated = 0
    for item in items:
        ext_id = str(item.get('external_id') or '')[:200]
        if not ext_id:
            continue
        cur.execute(
            f"INSERT INTO {SCHEMA}.market_listings "
            f"(source, external_id, url, title, category, deal_type, price, price_per_m2, "
            f"area, address, district, floor, total_floors, condition, description, road_line, scraped_at) "
            f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW()) "
            f"ON CONFLICT (source, external_id) DO UPDATE SET "
            f"price=%s, price_per_m2=%s, area=%s, address=%s, district=%s, "
            f"floor=%s, total_floors=%s, condition=%s, road_line=%s, "
            f"title=%s, category=%s, scraped_at=NOW()",
            (
                item.get('source'), ext_id,
                (item.get('url') or '')[:500], (item.get('title') or '')[:500],
                item.get('category'), item.get('deal_type'),
                item.get('price'), item.get('price_per_m2'), item.get('area'),
                (item.get('address') or '')[:300], (item.get('district') or '')[:200],
                item.get('floor'), item.get('total_floors'),
                (item.get('condition') or '')[:100], (item.get('description') or '')[:1000],
                (item.get('road_line') or '')[:50] or None,
                item.get('price'), item.get('price_per_m2'), item.get('area'),
                (item.get('address') or '')[:300], (item.get('district') or '')[:200],
                item.get('floor'), item.get('total_floors'),
                (item.get('condition') or '')[:100],
                (item.get('road_line') or '')[:50] or None,
                (item.get('title') or '')[:500], item.get('category'),
            )
        )
        if cur.rowcount == 1:
            inserted += 1
        else:
            updated += 1
    return {'inserted': inserted, 'updated': updated}


def _generate_facts(cur) -> int:
    cat_ru = {
        'office': 'Офисная недвижимость', 'retail': 'Торговая недвижимость',
        'warehouse': 'Складская недвижимость', 'industrial': 'Производственные помещения',
        'catering': 'Помещения общепита', 'free_purpose': 'ПСН',
        'standalone': 'Отдельно стоящие здания', 'land': 'Земельные участки',
        'other': 'Прочая коммерческая недвижимость',
    }
    deal_ru = {'sale': 'продажа', 'rent': 'аренда'}

    cur.execute(
        f"SELECT category, deal_type, COUNT(*) AS cnt, "
        f"ROUND(AVG(price_per_m2)::numeric,0) AS avg_p2, "
        f"ROUND(MIN(price_per_m2)::numeric,0) AS min_p2, "
        f"ROUND(MAX(price_per_m2)::numeric,0) AS max_p2, "
        f"ROUND(AVG(area)::numeric,0) AS avg_area, "
        f"ROUND(AVG(price)::numeric,0) AS avg_price "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE source='arrpro' AND scraped_at > NOW() - INTERVAL '7 days' AND price_per_m2 > 0 "
        f"GROUP BY category, deal_type HAVING COUNT(*) >= 2 ORDER BY cnt DESC"
    )
    rows = cur.fetchall() or []
    facts = []
    for r in rows:
        cat = r.get('category') or 'other'
        dt = r.get('deal_type') or 'sale'
        cnt = int(r.get('cnt') or 0)
        avg_p2 = int(r.get('avg_p2') or 0)
        min_p2 = int(r.get('min_p2') or 0)
        max_p2 = int(r.get('max_p2') or 0)
        avg_area = int(r.get('avg_area') or 0)
        avg_price = int(r.get('avg_price') or 0)
        if not avg_p2:
            continue
        suffix = '/мес' if dt == 'rent' else ''
        cl = cat_ru.get(cat, cat)
        dl = deal_ru.get(dt, dt)
        facts.append({'key': f'market_ext_arrpro_{cat}_{dt}_p2',
            'value': f'АРР Краснодар — {cl} ({dl}): {avg_p2:,} руб/м²{suffix} (мин {min_p2:,}, макс {max_p2:,}), {cnt} объявлений, ср. площадь {avg_area} м²'})
        if avg_price:
            facts.append({'key': f'market_ext_arrpro_{cat}_{dt}_price',
                'value': f'АРР Краснодар — {cl} ({dl}): средняя цена сделки {avg_price:,} ₽ ({cnt} объявлений)'})

    # Аналитика по районам
    cur.execute(
        f"SELECT district, deal_type, category, COUNT(*) AS cnt, "
        f"ROUND(AVG(price_per_m2)::numeric,0) AS avg_p2 "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE source='arrpro' AND scraped_at > NOW() - INTERVAL '7 days' "
        f"AND district IS NOT NULL AND district != '' AND price_per_m2 > 0 "
        f"GROUP BY district, deal_type, category HAVING COUNT(*) >= 2 "
        f"ORDER BY cnt DESC LIMIT 40"
    )
    dist_rows = cur.fetchall() or []
    for r in dist_rows:
        dist = r.get('district') or ''
        dt = r.get('deal_type') or 'sale'
        cat = r.get('category') or 'other'
        avg_p2 = int(r.get('avg_p2') or 0)
        cnt = int(r.get('cnt') or 0)
        if not avg_p2 or not dist:
            continue
        suffix = '/мес' if dt == 'rent' else ''
        cl = cat_ru.get(cat, cat)
        dl = deal_ru.get(dt, dt)
        facts.append({'key': f'market_ext_dist_{dist.replace(" ","_").lower()}_{cat}_{dt}',
            'value': f'{dist} — {cl} ({dl}): {avg_p2:,} руб/м²{suffix} ({cnt} объявлений)'})

    # Аналитика по линии
    cur.execute(
        f"SELECT road_line, deal_type, category, COUNT(*) AS cnt, "
        f"ROUND(AVG(price_per_m2)::numeric,0) AS avg_p2 "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE source='arrpro' AND scraped_at > NOW() - INTERVAL '7 days' "
        f"AND road_line IS NOT NULL AND price_per_m2 > 0 "
        f"GROUP BY road_line, deal_type, category HAVING COUNT(*) >= 2 ORDER BY avg_p2 DESC LIMIT 20"
    )
    for r in cur.fetchall() or []:
        rl = r.get('road_line') or ''
        dt = r.get('deal_type') or 'sale'
        cat = r.get('category') or 'other'
        avg_p2 = int(r.get('avg_p2') or 0)
        cnt = int(r.get('cnt') or 0)
        if not avg_p2:
            continue
        suffix = '/мес' if dt == 'rent' else ''
        cl = cat_ru.get(cat, cat)
        dl = deal_ru.get(dt, dt)
        facts.append({'key': f'market_ext_line_{rl.replace(" ","_")}_{cat}_{dt}',
            'value': f'{cl} ({dl}), {rl}: {avg_p2:,} руб/м²{suffix} ({cnt} объявлений)'})

    saved = 0
    for f in facts:
        cur.execute(
            f"INSERT INTO {SCHEMA}.ai_memory (key, value, updated_at) VALUES (%s,%s,NOW()) "
            f"ON CONFLICT (key) DO UPDATE SET value=%s, updated_at=NOW()",
            (f['key'], f['value'], f['value'])
        )
        saved += 1
    return saved


QUEUES = [
    ('svobodnogo-naznacheniya', 'sale'),
    ('torgovoe',               'sale'),
    ('ofis',                   'sale'),
    ('sklad',                  'sale'),
    ('zdanie',                 'sale'),
    ('obshchepit',             'sale'),
    ('proizvodstvo',           'sale'),
    ('zemelniy-uchastok',      'sale'),
    ('svobodnogo-naznacheniya','rent'),
    ('torgovoe',               'rent'),
    ('ofis',                   'rent'),
    ('sklad',                  'rent'),
    ('obshchepit',             'rent'),
    ('zdanie',                 'rent'),
]


def _auth(event):
    headers_ev = event.get('headers') or {}
    headers_lc = {k.lower(): v for k, v in headers_ev.items()}
    token = headers_lc.get('x-auth-token') or headers_lc.get('x-authorization', '').replace('Bearer ', '')
    if not token:
        return None
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        f"SELECT u.role FROM {SCHEMA}.users u JOIN {SCHEMA}.sessions s ON s.user_id=u.id "
        f"WHERE s.token=%s AND s.expires_at>NOW() LIMIT 1", (token,)
    )
    user = cur.fetchone()
    cur.close(); conn.close()
    return user if user and user['role'] in ('admin', 'director') else None


def handler(event: dict, context) -> dict:
    """
    Сбор объявлений arrpro.ru — одна категория за вызов (укладывается в 30 сек).
    POST {"cat":"svobodnogo-naznacheniya","deal":"sale"} — конкретная категория.
    POST {"action":"next"} или GET ?action=cron — следующая незавершённая.
    POST {"action":"reset"} — сбросить прогресс.
    POST {"action":"stats"} — статистика.
    POST {"action":"facts"} — обновить факты в ai_memory.
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    body = json.loads(event.get('body') or '{}')
    params = event.get('queryStringParameters') or {}
    action = body.get('action') or params.get('action') or 'next'

    # cron не требует авторизации
    if action not in ('cron', 'next'):
        user = _auth(event)
        if not user:
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Нет доступа'})}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Инициализируем очередь если нужно
        for cs, dt in QUEUES:
            cur.execute(
                f"INSERT INTO {SCHEMA}.market_scraper_progress (source,category_slug,deal_type,last_page,is_done) "
                f"VALUES ('arrpro',%s,%s,0,FALSE) ON CONFLICT (source,category_slug,deal_type) DO NOTHING",
                (cs, dt)
            )
        conn.commit()

        if action == 'reset':
            cur.execute(f"UPDATE {SCHEMA}.market_scraper_progress SET last_page=0,total_scraped=0,is_done=FALSE,updated_at=NOW() WHERE source='arrpro'")
            conn.commit()
            return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
                    'body': json.dumps({'reset': True}, ensure_ascii=False)}

        if action == 'stats':
            cur.execute(
                f"SELECT deal_type, category, COUNT(*) as cnt, ROUND(AVG(price_per_m2)::numeric,0) as avg_p2 "
                f"FROM {SCHEMA}.market_listings WHERE source='arrpro' AND scraped_at > NOW()-INTERVAL '7 days' "
                f"GROUP BY deal_type, category ORDER BY deal_type, cnt DESC"
            )
            rows = [dict(r) for r in cur.fetchall()]
            cur.execute(f"SELECT COUNT(*) as t FROM {SCHEMA}.market_listings WHERE source='arrpro' AND scraped_at>NOW()-INTERVAL '7 days'")
            total = int((cur.fetchone() or {}).get('t') or 0)
            cur.execute(f"SELECT category_slug,deal_type,last_page,total_scraped,is_done FROM {SCHEMA}.market_scraper_progress WHERE source='arrpro' ORDER BY id")
            progress = [dict(r) for r in cur.fetchall()]
            return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
                    'body': json.dumps({'total': total, 'by_category': rows, 'progress': progress}, ensure_ascii=False)}

        if action == 'facts':
            saved = _generate_facts(cur)
            conn.commit()
            return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
                    'body': json.dumps({'facts_saved': saved}, ensure_ascii=False)}

        # Определяем категорию для парсинга
        cat_slug = body.get('cat')
        deal_type = body.get('deal')

        if not cat_slug or not deal_type:
            cur.execute(
                f"SELECT category_slug, deal_type, last_page FROM {SCHEMA}.market_scraper_progress "
                f"WHERE source='arrpro' AND is_done=FALSE ORDER BY id ASC LIMIT 1"
            )
            row = cur.fetchone()
            if not row:
                facts_saved = _generate_facts(cur)
                conn.commit()
                return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
                        'body': json.dumps({'done': True, 'facts_saved': facts_saved}, ensure_ascii=False)}
            cat_slug = row['category_slug']
            deal_type = row['deal_type']
            start_page = int(row['last_page'] or 0) + 1
        else:
            cur.execute(
                f"SELECT last_page FROM {SCHEMA}.market_scraper_progress "
                f"WHERE source='arrpro' AND category_slug=%s AND deal_type=%s",
                (cat_slug, deal_type)
            )
            r = cur.fetchone()
            start_page = int((r or {}).get('last_page') or 0) + 1

        base = f'https://krasnodar.arrpro.ru/katalog/{"prodam" if deal_type == "sale" else "arenda"}/{cat_slug}/'
        total_inserted = total_updated = 0
        last_page = start_page - 1
        page = start_page
        is_cat_done = False

        while page <= start_page + 25:
            url = base if page == 1 else f'{base}page/{page}/'
            html = _fetch(url, timeout=18)
            if not html or len(html) < 5000:
                print(f'[market-full] {deal_type}/{cat_slug} p{page}: empty → done')
                is_cat_done = True
                break
            items = _parse_arrpro_page(html, deal_type)
            print(f'[market-full] {deal_type}/{cat_slug} p{page}: {len(items)} items')
            if not items:
                is_cat_done = True
                break
            save = _save_listings(cur, items)
            conn.commit()
            total_inserted += save['inserted']
            total_updated += save['updated']
            last_page = page

            has_next = bool(re.search(rf'page/{page + 1}/', html))
            if not has_next:
                has_next = bool(re.search(rf'PAGEN_\d+={page + 1}', html))
            if not has_next:
                tm = re.search(r'(\d+)\s*предложен', html)
                if tm:
                    has_next = int(tm.group(1)) > page * max(len(items), 1)
                    print(f'[market-full] total_declared={tm.group(1)} page={page} per={len(items)} has_next={has_next}')
            if not has_next:
                is_cat_done = True
                break
            page += 1
        cur.execute(
            f"UPDATE {SCHEMA}.market_scraper_progress "
            f"SET last_page=%s, is_done=%s, total_scraped=total_scraped+%s, updated_at=NOW() "
            f"WHERE source='arrpro' AND category_slug=%s AND deal_type=%s",
            (last_page, is_cat_done, total_inserted + total_updated, cat_slug, deal_type)
        )

        cur.execute(f"SELECT COUNT(*) as r FROM {SCHEMA}.market_scraper_progress WHERE source='arrpro' AND is_done=FALSE")
        remaining = int((cur.fetchone() or {}).get('r') or 0)

        facts_saved = 0
        if remaining == 0:
            facts_saved = _generate_facts(cur)

        conn.commit()

        cur.execute(f"SELECT COUNT(*) as t FROM {SCHEMA}.market_listings WHERE source='arrpro' AND scraped_at>NOW()-INTERVAL '7 days'")
        total_in_db = int((cur.fetchone() or {}).get('t') or 0)

        return {
            'statusCode': 200,
            'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps({
                'success': True, 'cat': cat_slug, 'deal': deal_type,
                'pages': f'{start_page}–{last_page}',
                'inserted': total_inserted, 'updated': total_updated,
                'cat_done': is_cat_done, 'remaining_tasks': remaining,
                'total_in_db': total_in_db, 'facts_saved': facts_saved,
            }, ensure_ascii=False),
        }
    finally:
        conn.close()