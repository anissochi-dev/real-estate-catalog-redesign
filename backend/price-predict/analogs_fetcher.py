"""
Целевой дозапрос аналогов с внешних сайтов для NOI-модели.
Вызывается когда в собственной БД найдено < MIN_ANALOGS объектов.

Источники: arrpro.ru (приоритет), cian.ru (резерв)
Стратегия: сначала по точной категории+сделке+площадь,
           потом расширяем район → весь город.
Результат сохраняется в market_listings для будущих запросов.
"""

import re
import gzip
import time
import urllib.request

SCHEMA = 't_p71821556_real_estate_catalog_'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
}

# Маппинг наших категорий → slug arrpro
CAT_TO_ARRPRO = {
    'office':       'ofis',
    'retail':       'torgovoe',
    'warehouse':    'sklad',
    'restaurant':   'obshchepit',
    'production':   'proizvodstvo',
    'building':     'zdanie',
    'free_purpose': 'svobodnogo-naznacheniya',
    'land':         'zemelniy-uchastok',
    'gab':          'gab',
    'business':     'svobodnogo-naznacheniya',
    'hotel':        'svobodnogo-naznacheniya',
    'car_service':  'svobodnogo-naznacheniya',
}

# Маппинг наших категорий → slug ayax.ru.
# ВАЖНО: у ayax.ru РАЗНЫЕ url-паттерны для продажи и аренды одной категории
# (сайт непоследователен: где-то "kupit-X", где-то "X", где-то "prodazha-X").
# Проверено вручную по каждой категории и типу сделки отдельно (2026-07-03).
# Категории без подтверждённого рабочего URL не включены — лучше не скрапить,
# чем подмешать чужую категорию под неверной меткой.
CAT_TO_AYAX_SALE = {
    'building': 'prodazha-zdanij',
    'office': 'kupit-ofis',
    'retail': 'torgovye-ploshadi',
    # warehouse: страница существует, но 0 объявлений на момент проверки — не скрапим
}
CAT_TO_AYAX_RENT = {
    'building': 'arenda-zdanij',
    'office': 'arenda-ofisov',
    'retail': 'arenda-torgovyh-ploschadej',
    'warehouse': 'arenda-skladov',
}

# Маппинг наших категорий → slug etagi.com.
# Структура: продажа krasnodar.etagi.com/commerce/{slug}/,
#            аренда  krasnodar.etagi.com/commerce/arenda/{slug}/
CAT_TO_ETAGI = {
    'building': 'zdanie',
    'office': 'ofis',
    'retail': 'torgovye-pomeshheniya',
    'warehouse': 'sklad',
    'free_purpose': 'svobodnoe-naznachenie',
}

# Маппинг наших внутренних категорий → категории схемы market_listings
# (market_listings использует свой набор: 'standalone' вместо 'building' и т.д.)
OUR_CAT_TO_ML_CAT = {
    'building': 'standalone',
    'restaurant': 'catering',
    'production': 'industrial',
}

# Маппинг категорий для чтения из общей копилки market_listings.
# Единый источник для noi_model.load_market_comparables и mela_price (Виртуальный брокер) —
# оба инструмента должны видеть одинаковый набор аналогов по одной категории.
# ВАЖНО: 'other' исключён — содержит мусорные записи ЦИАН с нерелевантными ставками.
MARKET_CAT_ALIAS = {
    'hotel': ['hotel', 'standalone'],
    'restaurant': ['catering'],
    'office': ['office'],
    'retail': ['retail', 'free_purpose'],
    'warehouse': ['warehouse'],
    'free_purpose': ['free_purpose', 'retail'],
    'production': ['industrial', 'warehouse'],
    'building': ['standalone'],
    'gab': ['free_purpose', 'retail', 'office'],
    'business': ['free_purpose', 'retail', 'office'],
    'car_service': ['industrial'],
    'land': ['land'],
}


def query_market_listings(cur, category: str, deal: str, area: float = 0,
                           district: str = '', limit: int = 50) -> list[dict]:
    """
    Единый запрос к накопленной копилке market_listings (данные с arrpro/ayax/etagi/cian).
    Каскадно расширяет площадь (±50% → ±75% → ±100%), пробует сначала с районом, потом без.
    Возвращает сырые строки: price, area, price_per_m2, district, source, url.

    Используется ОБОИМИ инструментами сравнения с рынком:
      - noi_model.load_market_comparables (агрегирует в медиану для инвестмодели)
      - mela_price.handle_mela_price_check (берёт как готовый список аналогов для Виртуального брокера)
    Так оба инструмента видят один и тот же набор данных по одному объекту.
    """
    cats = MARKET_CAT_ALIAS.get(category, [category] if category else [])
    cats_sql = ','.join(f"'{c}'" for c in cats if c)
    if not cats_sql:
        return []

    deal_type = 'rent' if deal == 'rent' else 'sale'
    min_p2 = 100 if deal_type == 'rent' else 5000

    area_mults = [0.5, 0.75, 1.0]
    dist_filters = []
    if district:
        dist_kw = district.split('(')[-1].replace(')', '').strip() if '(' in district else district.split()[0]
        dist_filters.append(dist_kw)
    dist_filters.append(None)

    best_rows: list = []
    for dist_kw in dist_filters:
        if len(best_rows) >= 5:
            break
        dist_clause = f"AND district ILIKE '%{dist_kw.replace(chr(39), chr(39)*2)}%'" if dist_kw else ''

        rows: list = []
        for mult in area_mults:
            area_filter = ''
            if area and area > 0:
                area_lo = max(50, round(area * (1 - mult)))
                area_hi = round(area * (1 + mult))
                area_filter = f'AND area BETWEEN {area_lo} AND {area_hi}'

            cur.execute(f"""
                SELECT price, area, price_per_m2, district, source, url
                FROM {SCHEMA}.market_listings
                WHERE deal_type = '{deal_type}'
                  AND category IN ({cats_sql})
                  AND price_per_m2 >= {min_p2}
                  AND scraped_at > NOW() - INTERVAL '90 days'
                  {area_filter}
                  {dist_clause}
                ORDER BY scraped_at DESC
                LIMIT {limit}
            """)
            rows = cur.fetchall() or []
            if len(rows) >= 5 or mult == area_mults[-1]:
                break

        if len(rows) > len(best_rows):
            best_rows = rows

    return best_rows

# Маппинг URL-slugs → категории (для парсинга ответа)
URL_CAT_MAP = {
    'sklad': 'warehouse', 'ofis': 'office',
    'torgovoe': 'retail', 'torgovlya': 'retail', 'magazin': 'retail',
    'obshchepit': 'catering', 'kafe': 'catering', 'restoran': 'catering',
    'proizvodstvo': 'industrial', 'promyshlennoe': 'industrial',
    'svobodnogo-naznacheniya': 'free_purpose', 'psn': 'free_purpose',
    'zdanie': 'standalone', 'otdelnoe': 'standalone',
    'zemelniy-uchastok': 'land', 'zemlya': 'land',
    'gab': 'gab', 'gotoviy-biznes': 'gab',
}

STREET_DISTRICT_MAP = {
    'фестивальн': 'ФМР', 'фмр': 'ФМР', 'чистяковск': 'ФМР',
    'московск': 'ФМР', 'дзержинск': 'ФМР', 'ставропольск': 'ФМР',
    'цмр': 'ЦМР', 'красн': 'ЦМР', 'октябрьск': 'ЦМР', 'ленин': 'ЦМР',
    'мира': 'ЦМР', 'пушкин': 'ЦМР', 'суворов': 'ЦМР',
    'юмр': 'ЮМР', 'юбилейн': 'ЮМР', 'симферопольск': 'ЮМР', 'уральск': 'ЮМР',
    'гидростроит': 'Гидрострой', 'новороссийск': 'Гидрострой',
    'музыкальн': 'Музыкальный',
    'черёмушк': 'Прикубанский', 'черемушк': 'Прикубанский', 'прикубанск': 'Прикубанский',
    'карасунск': 'Карасунский', 'ростовское шоссе': 'Карасунский',
    'шоссе нефтяников': 'Карасунский', 'ярославск': 'Карасунский',
    'западн': 'Западный',
}


def _fetch(url: str, timeout: int = 18) -> str:
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
        print(f'[analogs_fetcher] fetch {url}: {ex}')
    return ''


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


def _detect_district(address: str) -> str | None:
    if not address:
        return None
    a = address.lower()
    for kw, dist in STREET_DISTRICT_MAP.items():
        if kw.lower() in a:
            return dist
    return None


def _parse_arrpro_page(html: str, deal_type: str) -> list[dict]:
    """Парсинг страницы каталога arrpro.ru — точная копия из market-scraper."""
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

        floor = total_floors = None
        floor_m = re.search(r'[Ээ]таж[:\s]+(\d{1,2})(?:\s*из\s*(\d{1,2}))?', block)
        if floor_m:
            f_val = int(floor_m.group(1))
            if 1 <= f_val <= 50:
                floor = f_val
                if floor_m.group(2):
                    total_floors = int(floor_m.group(2))

        road_line = None
        line_m = re.search(r'[Лл]иния[:\s]+([^\n<,]{3,30})', block)
        if line_m:
            lt = line_m.group(1).strip().lower()
            for kw, val in [('перв', '1'), ('втор', '2'), ('трет', '3')]:
                if kw in lt:
                    road_line = val
                    break

        condition = None
        cond_m = re.search(r'[Сс]остояние[:\s]+([^\n<,]{3,40})', block)
        if cond_m:
            condition = cond_m.group(1).strip()

        district = _detect_district(address or '')
        if not district:
            dist_m = re.search(r'[Рр]айон[:\s]+([А-Яа-яёЁ\s\-]{3,40}?)(?:\.|,|<)', block)
            if dist_m:
                district = dist_m.group(1).strip()

        category = 'other'
        for slug, cat in URL_CAT_MAP.items():
            if slug in obj_url:
                category = cat
                break

        results.append({
            'source': 'arrpro',
            'external_id': ext_id,
            'url': obj_url,
            'title': f'{category} {actual_deal} {area or "?"} м² {address or ""}',
            'category': category,
            'deal_type': actual_deal,
            'price': price,
            'price_per_m2': price_per_m2,
            'area': area,
            'address': address,
            'district': district,
            'floor': floor,
            'total_floors': total_floors,
            'condition': condition,
            'road_line': road_line,
        })

    return results


def _parse_generic_html(html: str, source: str, category: str, deal_type: str,
                         min_price: float, area: float) -> list[dict]:
    """
    Универсальный парсер цен+площадей из HTML (для ayax.ru и etagi.com),
    когда точной структуры карточек не знаем — ищем пары
    "цена" + "площадь" в окне ±800 символов.
    Возвращает элементы в формате, совместимом с _save_to_market_listings.
    """
    import hashlib

    ml_category = OUR_CAT_TO_ML_CAT.get(category, category)

    results = []
    price_pat = re.compile(r'(\d[\d\s]{4,})\s*(?:₽|руб\.?|р\.)', re.UNICODE)
    area_pat = re.compile(r'(\d+[.,]?\d*)\s*м²', re.UNICODE)

    prices = [(m.start(), _clean_price(m.group(1))) for m in price_pat.finditer(html)]
    areas = [(m.start(), _clean_area(m.group(1))) for m in area_pat.finditer(html)]

    area_min = area * 0.2 if area > 0 else 5
    area_max = area * 5.0 if area > 0 else 10000

    used_prices = set()
    for pi, p in prices:
        if not p or p < min_price or pi in used_prices:
            continue
        best_a = None
        best_dist = 9999
        for ai, a_val in areas:
            if a_val and area_min <= a_val <= area_max and abs(ai - pi) < 800:
                dist = abs(ai - pi)
                if dist < best_dist:
                    best_dist = dist
                    best_a = a_val
        if best_a and best_a > 0:
            ext_id = hashlib.md5(f'{source}_{p}_{best_a}'.encode()).hexdigest()[:16]
            results.append({
                'source': source,
                'external_id': ext_id,
                'url': '',
                'title': f'{category} {deal_type} {best_a} м²',
                'category': ml_category,
                'deal_type': deal_type,
                'price': float(p),
                'price_per_m2': round(p / best_a, 2),
                'area': float(best_a),
                'address': None,
                'district': None,
                'floor': None,
                'total_floors': None,
                'condition': None,
                'road_line': None,
            })
            used_prices.add(pi)
        if len(results) >= 15:
            break
    return results


def _scrape_ayax_targeted(category: str, deal_type: str, area: float) -> list[dict]:
    """
    Целевой скрап ayax.ru по категории и типу сделки для дозапроса аналогов.
    URL-slug различаются для продажи/аренды (см. CAT_TO_AYAX_SALE/CAT_TO_AYAX_RENT).
    Если категория+сделка не имеют подтверждённого URL — сайт не скрапится,
    чтобы не подмешивать объекты чужих категорий под неверной меткой.
    """
    cat_map = CAT_TO_AYAX_RENT if deal_type == 'rent' else CAT_TO_AYAX_SALE
    slug = cat_map.get(category, '')
    if not slug:
        print(f'[analogs_fetcher] ayax.ru: категория "{category}"/{deal_type} не поддерживается, пропуск')
        return []

    url = f'https://www.ayax.ru/{slug}/'

    html = _fetch(url, timeout=15)
    if not html or len(html) < 10_000:
        print(f'[analogs_fetcher] ayax.ru {url}: пусто или слишком мало данных')
        return []

    min_p = 20_000 if deal_type == 'rent' else 300_000
    res = _parse_generic_html(html, 'ayax.ru', category, deal_type, min_p, area)
    print(f'[analogs_fetcher] ayax.ru: {len(res)} analogs found')
    return res


def _scrape_etagi_targeted(category: str, deal_type: str, area: float) -> list[dict]:
    """
    Целевой скрап etagi.com (федеральный агрегатор) для дозапроса аналогов.
    Структура: krasnodar.etagi.com/commerce/{slug}/ (продажа),
               krasnodar.etagi.com/commerce/arenda/{slug}/ (аренда).
    Если категория не сопоставлена — сайт не скрапится вообще (см. _scrape_ayax_targeted).
    JSON-поля "square" и "price" встроены в HTML каталога.
    """
    import hashlib

    cat_slug = CAT_TO_ETAGI.get(category, '')
    if not cat_slug:
        print(f'[analogs_fetcher] etagi.com: категория "{category}" не поддерживается, пропуск')
        return []

    if deal_type == 'rent':
        url = f'https://krasnodar.etagi.com/commerce/arenda/{cat_slug}/'
    else:
        url = f'https://krasnodar.etagi.com/commerce/{cat_slug}/'
    html = _fetch(url, timeout=12)

    if not html or len(html) < 10_000:
        print(f'[analogs_fetcher] etagi.com {url}: пусто или слишком мало данных')
        return []

    ml_category = OUR_CAT_TO_ML_CAT.get(category, category)
    min_p = 20_000 if deal_type == 'rent' else 300_000
    area_min = area * 0.2 if area > 0 else 5
    area_max = area * 5.0 if area > 0 else 10000

    squares = [(m.start(), float(m.group(1))) for m in re.finditer(r'"square"\s*:\s*(\d+(?:\.\d+)?)', html)]
    prices = [(m.start(), float(m.group(1))) for m in re.finditer(r'"price"\s*:\s*"?(\d+)"?', html)]

    results = []
    used_price_pos = set()
    for sq_pos, sq_val in squares:
        if not (area_min <= sq_val <= area_max):
            continue
        best_p = None
        best_dist = 9999
        for pr_pos, pr_val in prices:
            if pr_pos in used_price_pos:
                continue
            dist = abs(pr_pos - sq_pos)
            if dist < 3000 and dist < best_dist and pr_val >= min_p:
                best_dist = dist
                best_p = (pr_pos, pr_val)
        if best_p:
            used_price_pos.add(best_p[0])
            ext_id = hashlib.md5(f'etagi_{best_p[1]}_{sq_val}'.encode()).hexdigest()[:16]
            results.append({
                'source': 'etagi.com',
                'external_id': ext_id,
                'url': '',
                'title': f'{category} {deal_type} {sq_val} м²',
                'category': ml_category,
                'deal_type': deal_type,
                'price': best_p[1],
                'price_per_m2': round(best_p[1] / sq_val, 2),
                'area': sq_val,
                'address': None,
                'district': None,
                'floor': None,
                'total_floors': None,
                'condition': None,
                'road_line': None,
            })
        if len(results) >= 15:
            break

    if not results:
        min_p = 20_000 if deal_type == 'rent' else 300_000
        results = _parse_generic_html(html, 'etagi.com', category, deal_type, min_p, area)

    print(f'[analogs_fetcher] etagi.com: {len(results)} analogs found')
    return results


def _save_to_market_listings(cur, conn, items: list[dict]) -> int:
    """Сохраняет найденные аналоги в market_listings для будущего использования."""
    saved = 0
    for item in items:
        ext_id = str(item.get('external_id') or '')[:200]
        if not ext_id:
            continue
        try:
            cur.execute(
                f"INSERT INTO {SCHEMA}.market_listings "
                f"(source, external_id, url, title, category, deal_type, price, price_per_m2, "
                f"area, address, district, floor, total_floors, condition, road_line, scraped_at) "
                f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW()) "
                f"ON CONFLICT (source, external_id) DO UPDATE SET "
                f"price=%s, price_per_m2=%s, area=%s, address=%s, district=%s, "
                f"floor=%s, total_floors=%s, condition=%s, road_line=%s, scraped_at=NOW()",
                (
                    item.get('source'), ext_id,
                    (item.get('url') or '')[:500], (item.get('title') or '')[:500],
                    item.get('category'), item.get('deal_type'),
                    item.get('price'), item.get('price_per_m2'), item.get('area'),
                    (item.get('address') or '')[:300], (item.get('district') or '')[:200],
                    item.get('floor'), item.get('total_floors'),
                    (item.get('condition') or '')[:100],
                    (item.get('road_line') or '')[:50] or None,
                    # ON CONFLICT SET
                    item.get('price'), item.get('price_per_m2'), item.get('area'),
                    (item.get('address') or '')[:300], (item.get('district') or '')[:200],
                    item.get('floor'), item.get('total_floors'),
                    (item.get('condition') or '')[:100],
                    (item.get('road_line') or '')[:50] or None,
                )
            )
            saved += 1
        except Exception as e:
            print(f'[analogs_fetcher] save error: {e}')
    try:
        conn.commit()
    except Exception:
        pass
    return saved


def _filter_by_area(items: list[dict], area: float, delta_pct: float = 1.0) -> list[dict]:
    """
    Оставляем только объекты в диапазоне площади ±delta_pct.
    По умолчанию ±100% — согласовано с каскадным расширением в load_market_comparables
    (noi_model.py), где итоговая фильтрация по площади происходит при выборке из БД.
    Здесь фильтр лишь отсекает явно нерелевантные по масштабу объекты (напр. 25 000 м² склад).
    """
    lo = area * (1 - delta_pct)
    hi = area * (1 + delta_pct)
    return [i for i in items if i.get('area') and lo <= float(i['area']) <= hi]


def scrape_arrpro_targeted(category: str, deal_type: str, area: float = 0, max_pages: int = 2) -> list[dict]:
    """
    Быстрый целевой скрап arrpro.ru по одной категории+сделке (1-2 страницы каталога).
    В отличие от fetch_external_analogs (до 8 страниц, для одного объекта) — эта версия
    рассчитана на фоновый обход МНОГИХ категорий за один вызов батча (укладываемся в таймаут).
    """
    arrpro_slug = CAT_TO_ARRPRO.get(category)
    if not arrpro_slug:
        return []

    deal_prefix = 'arenda' if deal_type == 'rent' else 'prodam'
    base_url = f'https://krasnodar.arrpro.ru/katalog/{deal_prefix}/{arrpro_slug}/'

    all_items: list[dict] = []
    for page in range(1, max_pages + 1):
        url = base_url if page == 1 else f'{base_url}page/{page}/'
        html = _fetch(url, timeout=12)
        if not html or len(html) < 3000:
            break
        items = _parse_arrpro_page(html, deal_type)
        all_items.extend(items)
        if len(items) < 5:
            break

    filtered = _filter_by_area(all_items, area) if area > 0 else all_items
    return filtered


def fetch_external_analogs(listing: dict, cur, conn, need: int = 35) -> dict:
    """
    Целевой дозапрос аналогов с внешних сайтов: arrpro → ayax → etagi → cian (резерв).
    Вызывается когда в БД нашлось < need аналогов.

    Стратегия arrpro:
      - Шаг 1: страница 1-3 по точной категории+сделке
      - Шаг 2: если мало — добавляем страницы 4-8
      - Фильтруем по площади ±20% после скачивания
    Ayax и Etagi добавляются по одной странице каталога каждый,
    если после arrpro всё ещё не хватает аналогов.

    Все найденные объекты сохраняются в market_listings.
    Возвращает dict: items (list), count (int), saved (int), source (напр. 'arrpro+ayax+etagi')
    """
    category = (listing.get('category') or listing.get('type') or '').lower()
    deal = (listing.get('deal') or '').lower()
    area = float(listing.get('area') or 0)
    district = (listing.get('district') or '').strip()

    if not category or area <= 0:
        return {'items': [], 'count': 0, 'saved': 0, 'source': 'none'}

    arrpro_slug = CAT_TO_ARRPRO.get(category)
    deal_prefix = 'prodam' if deal != 'rent' else 'arenda'
    deal_type_ml = 'rent' if deal == 'rent' else 'sale'

    all_items: list[dict] = []
    scrape_source = 'none'

    # ── ARRPRO: целевой скрап по категории ──────────────────────────────────
    if arrpro_slug:
        base_url = f'https://krasnodar.arrpro.ru/katalog/{deal_prefix}/{arrpro_slug}/'
        # Сначала 3 страницы, потом ещё 5 если мало
        page_ranges = [range(1, 4), range(4, 9)]
        for page_range in page_ranges:
            for page in page_range:
                url = base_url if page == 1 else f'{base_url}page/{page}/'
                html = _fetch(url, timeout=15)
                if not html or len(html) < 3000:
                    print(f'[analogs_fetcher] arrpro {arrpro_slug}/{deal_prefix} p{page}: empty, stop')
                    break
                items = _parse_arrpro_page(html, deal_type_ml)
                all_items.extend(items)
                print(f'[analogs_fetcher] arrpro p{page}: {len(items)} items, total={len(all_items)}')
                time.sleep(0.3)

            # Фильтруем по площади ±20%
            filtered = _filter_by_area(all_items, area) if area > 0 else all_items
            if len(filtered) >= need:
                break

        filtered = _filter_by_area(all_items, area) if area > 0 else all_items
        if filtered:
            scrape_source = 'arrpro'
            print(f'[analogs_fetcher] arrpro result: total_scraped={len(all_items)}, filtered={len(filtered)}')
        all_items = filtered

    # ── AYAX: добавляем если после arrpro всё ещё не хватает ─────────────────
    if len(all_items) < need:
        print(f'[analogs_fetcher] после arrpro {len(all_items)} < {need}, пробуем ayax')
        ayax_items = _scrape_ayax_targeted(category, deal_type_ml, area)
        if ayax_items:
            existing_ids = {i.get('external_id') for i in all_items}
            new_ayax = [i for i in ayax_items if i.get('external_id') not in existing_ids]
            all_items.extend(new_ayax)
            if new_ayax:
                scrape_source = scrape_source + '+ayax' if scrape_source != 'none' else 'ayax'
            print(f'[analogs_fetcher] ayax добавил {len(new_ayax)}, итого={len(all_items)}')

    # ── ETAGI: добавляем если всё ещё не хватает ─────────────────────────────
    if len(all_items) < need:
        print(f'[analogs_fetcher] после ayax {len(all_items)} < {need}, пробуем etagi')
        etagi_items = _scrape_etagi_targeted(category, deal_type_ml, area)
        if etagi_items:
            existing_ids = {i.get('external_id') for i in all_items}
            new_etagi = [i for i in etagi_items if i.get('external_id') not in existing_ids]
            all_items.extend(new_etagi)
            if new_etagi:
                scrape_source = scrape_source + '+etagi' if scrape_source != 'none' else 'etagi'
            print(f'[analogs_fetcher] etagi добавил {len(new_etagi)}, итого={len(all_items)}')

    # ── CIAN: последний резерв если всё ещё мало ─────────────────────────────
    if len(all_items) < need:
        print(f'[analogs_fetcher] после etagi {len(all_items)} < {need}, пробуем cian')
        cian_items = _scrape_cian_targeted(category, deal_type_ml, area)
        if cian_items:
            # Дедупликация по external_id
            existing_ids = {i.get('external_id') for i in all_items}
            new_cian = [i for i in cian_items if i.get('external_id') not in existing_ids]
            all_items.extend(new_cian)
            if new_cian:
                scrape_source = scrape_source + '+cian' if scrape_source != 'none' else 'cian'
            print(f'[analogs_fetcher] cian добавил {len(new_cian)}, итого={len(all_items)}')

    # ── Сохраняем все найденные в market_listings ────────────────────────────
    saved = 0
    if all_items and cur and conn:
        saved = _save_to_market_listings(cur, conn, all_items)
        print(f'[analogs_fetcher] сохранено в market_listings: {saved}')

    return {
        'items': all_items,
        'count': len(all_items),
        'saved': saved,
        'source': scrape_source,
    }


def _scrape_cian_targeted(category: str, deal_type: str, area: float) -> list[dict]:
    """Целевой парсинг ЦИАН по категории из sitemap."""
    results = []
    seen = set()

    # Маппинг типа сделки для URL cian
    deal_url = 'sale' if deal_type == 'sale' else 'rent'

    try:
        sitemap_index = _fetch('https://krasnodar.cian.ru/sitemap.xml', timeout=8)
        if not sitemap_index:
            return []

        all_sitemaps = re.findall(r'<loc>(https://krasnodar\.cian\.ru/[^<]+)</loc>', sitemap_index)
        comm_sitemaps = [s for s in all_sitemaps if 'commercial' in s or 'kommerch' in s][:3]

        obj_urls = []
        for sm_url in comm_sitemaps:
            xml = _fetch(sm_url, timeout=8)
            if not xml:
                continue
            pattern = rf'<loc>(https://krasnodar\.cian\.ru/{deal_url}/commercial/[^<]+)</loc>'
            urls = re.findall(pattern, xml)
            obj_urls.extend(urls)
            if len(obj_urls) >= 150:
                break

        for url in obj_urls[:80]:
            id_m = re.search(r'/(\d+)/?$', url)
            obj_id = id_m.group(1) if id_m else None
            if not obj_id or obj_id in seen:
                continue
            seen.add(obj_id)

            html = _fetch(url, timeout=6)
            if not html:
                continue

            title_m = re.search(r'<title>([^<]{10,400})</title>', html)
            if not title_m:
                continue
            title_raw = title_m.group(1)

            area_m = re.search(r'([\d,\.]+)\s*м²', title_raw)
            obj_area = _clean_area(area_m.group(1)) if area_m else None
            if not obj_area:
                continue

            # Фильтруем по площади прямо здесь
            if area > 0:
                lo = area * 0.80
                hi = area * 1.20
                if not (lo <= obj_area <= hi):
                    continue

            price_m = re.search(r'([\d\s]{4,})\s*[₽р]', title_raw)
            price = _clean_price(price_m.group(1)) if price_m else None
            if not price or price < 100_000:
                continue

            price_per_m2 = round(price / obj_area, 2) if obj_area > 0 else None
            addr_m = re.search(r'(?:в\s+)?Краснодар[е,\s]+([^—\|<\n]{5,120})', title_raw)
            address = addr_m.group(1).strip() if addr_m else None

            results.append({
                'source': 'cian',
                'external_id': obj_id,
                'url': url,
                'title': title_raw[:400],
                'category': category,
                'deal_type': deal_type,
                'price': price,
                'price_per_m2': price_per_m2,
                'area': obj_area,
                'address': address,
                'district': _detect_district(address or ''),
            })
            if len(results) >= 40:
                break
            time.sleep(0.05)

    except Exception as e:
        print(f'[analogs_fetcher] cian error: {e}')

    print(f'[analogs_fetcher] cian targeted: {len(results)} items')
    return results