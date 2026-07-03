"""
Виртуальный брокер: проверка цены объекта по реальным аналогам.
Источники данных (по приоритету):
1. База объектов системы (listings)
2. Общая копилка рыночных данных market_listings (arrpro/ayax/etagi/cian) —
   та же копилка, что использует инвестиционная модель (noi_model) — единый источник данных
3. Живой парсинг локальных сайтов Краснодара (если копилка пуста для этой категории)
4. Yandex XML Search — реальный поиск по ЦИАН, Авито, Restate (обходит блокировки)
5. YandexGPT — фоллбэк если ничего не найдено
Возвращает вердикт (выше/рыночная/ниже) + диапазон цен.
"""

import hashlib
import json
import os
import re
import statistics
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timedelta

from ai_client import chat_simple
from analogs_fetcher import query_market_listings

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_SEARCH_URL = 'https://yandex.ru/search/xml'

# TTL кеша по категориям — редкие категории обновляются реже (мало объявлений)
CACHE_TTL_BY_CAT = {
    'hotel':       14,  # гостиницы — мало объявлений, медленно меняются
    'production':  10,  # производство
    'car_service': 10,  # автосервисы
    'land':         7,  # земля
    'building':     7,  # здания
    'gab':          7,  # ГАБ
    'restaurant':   5,  # общепит
    'warehouse':    5,  # склады
    'office':       3,  # офисы — активный рынок
    'retail':       3,  # торговые
    'free_purpose': 3,
    'business':     5,
}
CACHE_TTL_DEFAULT = 3

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)

CAT_TO_CIAN_OFFER_TYPE = {
    'office': 'office', 'retail': 'shopping-area', 'warehouse': 'warehouse',
    'restaurant': 'free-purpose-flat', 'hotel': 'free-purpose-flat',
    'business': 'business', 'gab': 'business', 'production': 'industry',
    'free_purpose': 'free-purpose-flat', 'land': 'commercial-land',
}

DEAL_TO_CIAN = {'sale': 'sale', 'rent': 'rent', 'business': 'sale'}

TYPE_RU = {
    'office': 'офис', 'retail': 'торговое помещение', 'warehouse': 'склад',
    'restaurant': 'кафе/ресторан', 'hotel': 'гостиница', 'business': 'готовый бизнес',
    'gab': 'готовый арендный бизнес', 'production': 'производство',
    'free_purpose': 'свободного назначения', 'land': 'земельный участок',
}
DEAL_RU = {'sale': 'продажа', 'rent': 'аренда', 'business': 'готовый бизнес'}


def _http_get(url: str, timeout: int = 12) -> str:
    req = urllib.request.Request(url, headers={
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        try:
            return raw.decode('utf-8', errors='replace')
        except Exception:
            return raw.decode('cp1251', errors='replace')


def _parse_price(text: str) -> float:
    """'12 500 000 ₽' → 12500000."""
    if not text:
        return 0
    digits = re.sub(r'[^\d]', '', text)
    if not digits:
        return 0
    try:
        return float(digits)
    except Exception:
        return 0


def _parse_area(text: str) -> float:
    """'42,5 м²' или '42 м²' → 42.5."""
    if not text:
        return 0
    m = re.search(r'(\d+[.,]?\d*)\s*м', text)
    if not m:
        m = re.search(r'(\d+[.,]?\d*)', text)
    if not m:
        return 0
    try:
        return float(m.group(1).replace(',', '.'))
    except Exception:
        return 0


def _dedupe_analogs(analogs: list) -> list:
    """
    Удаляет дубли аналогов: считает дублем если цена И площадь совпадают
    с точностью до 1% — это одно и то же объявление из разных источников.
    """
    seen = []
    result = []
    for a in analogs:
        p = a.get('price', 0)
        ar = a.get('area', 0)
        is_dup = False
        for sp, sa in seen:
            if sp > 0 and ar > 0 and abs(p - sp) / sp < 0.01 and abs(ar - sa) / sa < 0.01:
                is_dup = True
                break
        if not is_dup:
            seen.append((p, ar))
            result.append(a)
    return result


def _db_analogs(cur, listing: dict) -> list:
    """
    Ищет реальные аналоги в базе данных системы.
    Стратегия поиска (по убыванию релевантности):
      1. район + состояние ±40% площади
      2. район ±50% площади
      3. округ ±60% площади
      4. весь город ±80% площади
    Дополнительные факторы релевантности: этаж, land_area, monthly_rent, electricity_kw.
    """
    cat = (listing.get('category') or '').replace("'", "''")
    deal = (listing.get('deal') or 'sale').replace("'", "''")
    area = float(listing.get('area') or 0)
    price = float(listing.get('price') or 0)
    district = (listing.get('district') or '').lower().strip()
    condition = (listing.get('condition') or '').lower().strip()
    listing_id = int(listing.get('id') or 0)
    floor = listing.get('floor')          # этаж объекта (не этажность)
    land_area = listing.get('land_area')  # площадь участка (сотки)
    monthly_rent = listing.get('monthly_rent')  # арендный поток/мес
    electricity_kw = listing.get('electricity_kw')  # эл. мощность кВт

    if area <= 0:
        return []

    # Всегда исключаем сам объект — и по id, и по точному совпадению цены+площади
    id_clause = f'AND id != {listing_id}' if listing_id else ''
    self_exclude = ''
    if price > 0:
        p_lo = round(price * 0.99)
        p_hi = round(price * 1.01)
        a_lo = round(area * 0.99)
        a_hi = round(area * 1.01)
        self_exclude = f'AND NOT (price BETWEEN {p_lo} AND {p_hi} AND area BETWEEN {a_lo} AND {a_hi})'

    safe_district = district.replace("'", "''")
    safe_condition = condition.replace("'", "''")

    # Определяем округ микрорайона через таблицу districts
    okrug = ''
    if safe_district:
        try:
            cur.execute(f"""
                SELECT p.name FROM {SCHEMA}.districts d
                JOIN {SCHEMA}.districts p ON p.id = d.parent_id
                WHERE d.is_active = TRUE AND p.is_okrug = TRUE
                  AND LOWER(d.name) = LOWER('{safe_district}')
                LIMIT 1
            """)
            row_okrug = cur.fetchone()
            if row_okrug:
                okrug = row_okrug['name'].replace(' округ', '').strip()
        except Exception:
            pass

    # Извлекаем улицу из адреса
    street = ''
    addr_raw = (listing.get('address') or '').strip()
    if addr_raw:
        import re as _re
        s = _re.sub(r',?\s*\d+[а-яА-Яa-zA-Z/\-]*\s*$', '', addr_raw).strip()
        s = _re.sub(r'^(ул\.?\s*|улица\s*|проспект\s*|пр\.?\s*|бул\.?\s*|пер\.?\s*|переулок\s*|шоссе\s*|ш\.?\s*)', '', s, flags=_re.IGNORECASE).strip()
        if len(s) > 3:
            street = s[:60].replace("'", "''")

    # Каскадные стратегии: район → улица → округ → весь город
    # (area_mult, where_extra, label)
    strategies_cascade = [
        (0.40, f"AND LOWER(district) LIKE '%{safe_district}%'" if safe_district else None,
               f'микрорайон ({district})' if district else None),
        (0.50, f"AND LOWER(address) LIKE '%{street}%'" if street else None,
               f'улица ({street})' if street else None),
        (0.60, f"AND LOWER(district) LIKE '%{okrug.lower()}%'" if okrug else None,
               f'округ ({okrug})' if okrug else None),
        (0.80, '', 'город'),
    ]

    all_rows = []
    seen_ids = set()
    search_level = 'город'

    for area_mult, where_extra, label in strategies_cascade:
        if where_extra is None or label is None:
            continue

        area_min = max(1, area * (1 - area_mult))
        area_max = area * (1 + area_mult)

        # Состояние учитываем только на первом уровне (район)
        condition_clause = f"AND condition = '{safe_condition}'" if safe_condition and area_mult <= 0.40 else ''

        # Дополнительный фильтр: этаж ±2 при наличии (только на первых двух уровнях)
        floor_clause = ''
        if floor is not None and area_mult <= 0.50:
            try:
                f_val = int(floor)
                floor_clause = f'AND floor BETWEEN {max(1, f_val - 2)} AND {f_val + 2}'
            except (TypeError, ValueError):
                pass

        # Дополнительный фильтр: участок — если есть, ищем объекты с участком
        land_clause = ''
        if land_area and float(land_area or 0) > 0 and area_mult <= 0.50:
            land_clause = 'AND land_area IS NOT NULL AND land_area > 0'

        # Дополнительный фильтр: арендный поток — если ГАБ, берём только с monthly_rent
        rent_clause = ''
        if monthly_rent and float(monthly_rent or 0) > 0 and cat in ('gab', 'business'):
            rent_clause = 'AND (monthly_rent > 0 OR yearly_rent > 0)'

        cur.execute(
            f"SELECT id, price, area, price_per_m2, district, condition, status, "
            f"  floor, land_area, monthly_rent, electricity_kw "
            f"FROM {SCHEMA}.listings "
            f"WHERE category = '{cat}' AND deal = '{deal}' "
            f"AND area BETWEEN {area_min} AND {area_max} "
            f"AND price > 0 AND area > 0 "
            f"AND status IN ('active', 'archived') "
            f"{where_extra} {condition_clause} {floor_clause} {land_clause} {rent_clause} "
            f"{id_clause} {self_exclude} "
            f"ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, "
            f"ABS(area - {area}) ASC, updated_at DESC "
            f"LIMIT 20"
        )
        rows = cur.fetchall()
        new = 0
        for r in rows:
            rid = r['id']
            if rid in seen_ids:
                continue
            p = float(r['price'] or 0)
            a = float(r['area'] or 0)
            if p > 0 and a > 0:
                seen_ids.add(rid)
                ppm2 = float(r['price_per_m2'] or 0) or round(p / a)
                all_rows.append({
                    'source': 'база системы',
                    'price': p,
                    'area': a,
                    'price_per_m2': ppm2,
                    'district': str(r.get('district') or ''),
                    'url': '',
                    'status': str(r.get('status') or ''),
                    'floor': float(r['floor']) if r.get('floor') is not None else None,
                    'land_area': float(r['land_area']) if r.get('land_area') is not None else None,
                    'monthly_rent': float(r['monthly_rent']) if r.get('monthly_rent') else None,
                    'electricity_kw': float(r['electricity_kw']) if r.get('electricity_kw') else None,
                    '_relevance': label,
                })
                new += 1
        print(f'[mela_price] DB strategy "{label}": +{new} (total={len(all_rows)})')
        if new > 0 and search_level == 'город':
            search_level = label
        # Останавливаемся когда набрали ≥5 уникальных аналогов
        if len(all_rows) >= 5:
            break

    # Дедупликация по совпадению цены+площади (одно объявление в разных статусах)
    deduped = _dedupe_analogs(all_rows)
    print(f'[mela_price] DB: {len(all_rows)} raw → {len(deduped)} deduped, level={search_level}')
    # Прокидываем search_level через метаданные первого аналога
    if deduped:
        deduped[0]['_search_level'] = search_level
    return deduped[:12]


def _market_listings_analogs(cur, listing: dict) -> list:
    """
    Читает аналоги из общей копилки market_listings — той же самой, что использует
    инвестиционная модель (noi_model.load_market_comparables). Единый источник данных
    для обоих инструментов сравнения с рынком.
    """
    category = (listing.get('category') or '').lower()
    deal = (listing.get('deal') or 'sale').lower()
    area = float(listing.get('area') or 0)
    district = (listing.get('district') or '').strip()

    try:
        rows = query_market_listings(cur, category, deal, area=area, district=district, limit=20)
    except Exception as e:
        print(f'[mela_price] market_listings query error: {e}')
        return []

    results = []
    for r in rows:
        p = float(r.get('price') or 0)
        a = float(r.get('area') or 0)
        if p <= 0 or a <= 0:
            continue
        ppm2 = float(r.get('price_per_m2') or 0) or round(p / a)
        results.append({
            'source': r.get('source') or 'рынок',
            'price': p,
            'area': a,
            'price_per_m2': ppm2,
            'district': str(r.get('district') or ''),
            'url': str(r.get('url') or ''),
        })
    print(f'[mela_price] market_listings: {len(results)} analogs')
    return results


# ─── Парсеры сторонних сайтов Краснодара ────────────────────────────────────

CAT_TO_ARRPRO = {
    'office': 'ofisy', 'retail': 'torgovye-pomeshcheniya', 'warehouse': 'sklady',
    'restaurant': 'obshchepit', 'production': 'proizvodstvo',
    'free_purpose': 'pomeshcheniya-svobodnogo-naznacheniya',
    'business': 'gotovyy-biznes', 'gab': 'gotovyy-biznes',
    'land': 'zemelnye-uchastki', 'building': 'zdaniya',
}
CAT_TO_KAYAN = {
    'office': 'ofisy', 'retail': 'torgovye', 'warehouse': 'sklady',
    'free_purpose': 'svobodnoe', 'production': 'proizvodstvo',
    'business': 'biznes', 'land': 'uchastki',
}
CAT_TO_AYAX = {
    'office': 'office', 'retail': 'retail', 'warehouse': 'warehouse',
    'free_purpose': 'free', 'production': 'production',
    'business': 'business', 'restaurant': 'catering',
}


def _parse_html_analogs(html: str, source: str, min_price: float, area: float) -> list:
    """Универсальный парсер цен и площадей из HTML коммерческих сайтов Краснодара."""
    results = []
    price_pat = re.compile(r'(\d[\d\s]{4,})\s*(?:₽|руб\.?|р\.)', re.UNICODE)
    area_pat  = re.compile(r'(\d+[.,]?\d*)\s*м²', re.UNICODE)

    prices = [(m.start(), _parse_price(m.group(1))) for m in price_pat.finditer(html)]
    areas  = [(m.start(), _parse_area(m.group(0))) for m in area_pat.finditer(html)]

    # Широкий диапазон: берём объекты от 20% до 5× от целевой площади
    area_min = area * 0.2 if area > 0 else 5
    area_max = area * 5.0 if area > 0 else 10000

    used_prices = set()
    for pi, p in prices:
        if p < min_price or pi in used_prices:
            continue
        # Ищем ближайшую площадь в окне ±800 символов
        best_a = None
        best_dist = 9999
        for ai, a_val in areas:
            if area_min <= a_val <= area_max and abs(ai - pi) < 800:
                dist = abs(ai - pi)
                if dist < best_dist:
                    best_dist = dist
                    best_a = a_val
        if best_a and best_a > 0:
            results.append({
                'source': source,
                'price': float(p),
                'area': float(best_a),
                'price_per_m2': round(p / best_a),
                'url': '',
            })
            used_prices.add(pi)
        if len(results) >= 10:
            break
    return results


def _scrape_arrpro(listing: dict) -> list:
    """
    Парсит krasnodar.arrpro.ru — каталог коммерческой недвижимости Краснодара.
    Использует URL с фильтром по категории и типу сделки:
    /katalog/{cat_slug}/?type={deal_slug}
    При отсутствии категории или ответе < 1000 байт — fallback на /katalog/all/.
    """
    cat = (listing.get('category') or '').lower()
    deal = (listing.get('deal') or 'sale').lower()
    area = float(listing.get('area') or 0)

    cat_slug = CAT_TO_ARRPRO.get(cat, '')
    deal_slug = 'arenda' if deal == 'rent' else 'prodazha'

    # Строим URL: сначала с фильтром по категории, fallback — все объекты
    candidate_urls = []
    if cat_slug:
        candidate_urls.append(f'https://krasnodar.arrpro.ru/katalog/{cat_slug}/?type={deal_slug}')
        candidate_urls.append(f'https://krasnodar.arrpro.ru/katalog/{cat_slug}/')
    candidate_urls.append(f'https://krasnodar.arrpro.ru/katalog/all/?type={deal_slug}')
    candidate_urls.append('https://krasnodar.arrpro.ru/katalog/all/')

    html = ''
    used_url = ''
    for url in candidate_urls:
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
                'Accept-Language': 'ru-RU,ru;q=0.9',
                'Cache-Control': 'no-cache',
                'Referer': 'https://krasnodar.arrpro.ru/',
            })
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read(700_000)
                html = raw.decode('utf-8', errors='replace')
            if len(html) >= 1000:
                used_url = url
                break
            html = ''
        except Exception as e:
            print(f'[mela_price] arrpro.ru {url}: {e}')

    if not html:
        print('[mela_price] arrpro.ru: all URLs failed')
        return []

    print(f'[mela_price] arrpro.ru: html={len(html)} bytes from {used_url}, has_price={"₽" in html or "руб" in html}')
    min_p = 20_000 if deal == 'rent' else 300_000
    broad_area = area if area > 0 else 100
    res = _parse_html_analogs(html, 'arrpro.ru', min_p, broad_area)
    print(f'[mela_price] arrpro.ru: {len(res)} analogs found')
    return res


def _scrape_kayan(listing: dict) -> list:
    """
    kayan.ru — страница поиска Drupal отдаёт только форму фильтра (параметры),
    а не карточки объявлений. Карточки грузятся динамически через JS.
    Парсинг без headless-браузера невозможен.
    """
    print('[mela_price] kayan.ru: skipped (search form only, no SSR listings)')
    return []


def _scrape_ayax(listing: dict) -> list:
    """
    Парсит ayax.ru — крупное агентство Краснодара (SSR, до 700кб).
    URL строится с учётом типа сделки:
      продажа: /kommercheskaya-nedvizhimost/prodazha/
      аренда:  /kommercheskaya-nedvizhimost/arenda/
    При 404 — fallback на /kommercheskaya-nedvizhimost/.
    """
    cat = (listing.get('category') or '').lower()
    deal = (listing.get('deal') or 'sale').lower()
    area = float(listing.get('area') or 0)

    deal_slug = 'arenda' if deal == 'rent' else 'prodazha'
    cat_slug = CAT_TO_AYAX.get(cat, '')

    # Строим список URL: сначала с фильтрами, затем fallback
    candidate_urls = []
    if cat_slug:
        candidate_urls.append(f'https://www.ayax.ru/kommercheskaya-nedvizhimost/{cat_slug}/{deal_slug}/')
        candidate_urls.append(f'https://www.ayax.ru/kommercheskaya-nedvizhimost/{cat_slug}/')
    candidate_urls.append(f'https://www.ayax.ru/kommercheskaya-nedvizhimost/{deal_slug}/')
    candidate_urls.append('https://www.ayax.ru/kommercheskaya-nedvizhimost/')

    html = ''
    used_url = ''
    for url in candidate_urls:
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
                'Accept-Language': 'ru-RU,ru;q=0.9',
                'Cache-Control': 'no-cache',
                'Referer': 'https://www.ayax.ru/',
                'Connection': 'keep-alive',
            })
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read(700_000)
                html = raw.decode('utf-8', errors='replace')
            if len(html) >= 10_000:
                used_url = url
                break
            html = ''
        except Exception as e:
            print(f'[mela_price] ayax.ru {url}: {e}')

    if not html:
        print('[mela_price] ayax.ru: all URLs failed or too small')
        return []

    print(f'[mela_price] ayax.ru: html={len(html)} bytes from {used_url}, has_price={"₽" in html}')
    min_p = 20_000 if deal == 'rent' else 300_000
    res = _parse_html_analogs(html, 'ayax.ru', min_p, area)
    # Дополнительный поиск через data-атрибуты (некоторые шаблоны ayax.ru)
    if len(res) < 3:
        price_pat2 = re.compile(r'data-price=["\'](\d+)["\']', re.IGNORECASE)
        area_pat2  = re.compile(r'data-area=["\'](\d+(?:\.\d+)?)["\']', re.IGNORECASE)
        prices2 = [(m.start(), float(m.group(1))) for m in price_pat2.finditer(html)]
        areas2  = [(m.start(), float(m.group(1))) for m in area_pat2.finditer(html)]
        area_min = area * 0.2 if area > 0 else 5
        area_max = area * 5.0 if area > 0 else 10000
        used = set()
        for pi, p in prices2:
            if p < min_p or pi in used:
                continue
            for ai, a_val in areas2:
                if area_min <= a_val <= area_max and abs(ai - pi) < 2000:
                    res.append({'source': 'ayax.ru', 'price': p, 'area': a_val,
                                'price_per_m2': round(p / a_val), 'url': used_url})
                    used.add(pi)
                    break
            if len(res) >= 10:
                break
    print(f'[mela_price] ayax.ru: {len(res)} analogs found')
    return res[:10]


def _scrape_etagi(listing: dict) -> list:
    """
    Парсит etagi.com — федеральный агрегатор.
    Пробуем несколько URL (старые могут вернуть 410 Gone).
    JSON с площадями встроен в HTML: "square":N, "price":"14800000".
    """
    deal = (listing.get('deal') or 'sale').lower()
    area = float(listing.get('area') or 0)
    min_p = 20_000 if deal == 'rent' else 300_000

    # Список URL от нового к старому — пробуем по очереди до первого успешного
    if deal == 'rent':
        candidate_urls = [
            'https://krasnodar.etagi.com/realty/arenda-kommercheskoy-nedvizhimosti/',
            'https://krasnodar.etagi.com/rent/commercial/',
            'https://krasnodar.etagi.com/rent/commerce/',
        ]
    else:
        candidate_urls = [
            'https://krasnodar.etagi.com/realty/kommercheskaya-nedvizhimost/',
            'https://krasnodar.etagi.com/commercial/',
            'https://krasnodar.etagi.com/commerce/',
        ]

    html = ''
    used_url = ''
    for url in candidate_urls:
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
                'Accept-Language': 'ru-RU,ru;q=0.9',
                'Cache-Control': 'no-cache',
                'Referer': 'https://krasnodar.etagi.com/',
            })
            with urllib.request.urlopen(req, timeout=12) as resp:
                raw = resp.read(700_000)
                html = raw.decode('utf-8', errors='replace')
            if len(html) >= 10_000:
                used_url = url
                break
            print(f'[mela_price] etagi: {url} too small ({len(html)}b), trying next')
            html = ''
        except Exception as e:
            print(f'[mela_price] etagi: {url} error: {e}')

    if not html:
        print('[mela_price] etagi.com: all URLs failed')
        return []

    print(f'[mela_price] etagi.com: html={len(html)} bytes from {used_url}')

    area_min = area * 0.2 if area > 0 else 5
    area_max = area * 5.0 if area > 0 else 10000

    # Парсинг JSON-полей: "square":42.5 и "price":"14800000"
    results = []
    squares = [(m.start(), float(m.group(1))) for m in re.finditer(r'"square"\s*:\s*(\d+(?:\.\d+)?)', html)]
    prices  = [(m.start(), float(m.group(1))) for m in re.finditer(r'"price"\s*:\s*"?(\d+)"?', html)]

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
            results.append({
                'source': 'etagi.com',
                'price': best_p[1],
                'area': sq_val,
                'price_per_m2': round(best_p[1] / sq_val),
                'url': used_url,
            })
        if len(results) >= 10:
            break

    if not results:
        results = _parse_html_analogs(html, 'etagi.com', min_p, area)

    print(f'[mela_price] etagi.com: {len(results)} analogs found')
    return results


def _scrape_moreon(listing: dict) -> list:
    """
    Парсит moreon-invest.ru — краснодарское агентство коммерческой недвижимости.
    URL с фильтром SSR: /commercii/offers/filter/type-is-prodaja/city-is-krasnodar-g/apply/
    Для аренды: /commercii/offers/filter/type-is-arenda/city-is-krasnodar-g/apply/
    """
    deal = (listing.get('deal') or 'sale').lower()
    area = float(listing.get('area') or 0)
    deal_slug = 'arenda' if deal == 'rent' else 'prodaja'
    url = f'https://moreon-invest.ru/commercii/offers/filter/type-is-{deal_slug}/city-is-krasnodar-g/apply/'
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
            'Accept-Language': 'ru-RU,ru;q=0.9',
            'Cache-Control': 'no-cache',
            'Referer': 'https://moreon-invest.ru/commercii/',
            'Connection': 'keep-alive',
        })
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = resp.read(700_000)
            html = raw.decode('utf-8', errors='replace')
        print(f'[mela_price] moreon-invest.ru: html={len(html)} bytes, has_price={"₽" in html or "руб" in html}')
        if len(html) < 5_000:
            print('[mela_price] moreon-invest.ru: response too small, skipping')
            return []
        min_p = 20_000 if deal == 'rent' else 300_000
        res = _parse_html_analogs(html, 'moreon-invest.ru', min_p, area)
        # Дополнительно ищем цены в meta/JSON-LD разметке Bitrix
        if len(res) < 3:
            # Bitrix часто кладёт цены в атрибуты data-price или JSON
            for pat in [
                r'"price"\s*:\s*"?(\d{5,})"?',
                r'data-price=["\'](\d{5,})["\']',
                r'PRICE["\s]*:\s*(\d{5,})',
            ]:
                price_matches = [(m.start(), float(m.group(1))) for m in re.finditer(pat, html)]
                area_matches  = [(m.start(), float(m.group(1))) for m in re.finditer(
                    r'"square"\s*:\s*(\d+(?:\.\d+)?)|data-area=["\'](\d+(?:\.\d+)?)["\']|(\d+(?:\.\d+)?)\s*м²', html
                )]
                area_min = area * 0.2 if area > 0 else 5
                area_max = area * 5.0 if area > 0 else 10000
                used = set()
                for pi, p in price_matches:
                    if p < min_p or pi in used:
                        continue
                    for ai, *groups in area_matches:
                        a_val_str = next((g for g in groups if g), None)
                        if not a_val_str:
                            continue
                        try:
                            a_val = float(a_val_str.replace(',', '.'))
                        except Exception:
                            continue
                        if area_min <= a_val <= area_max and abs(ai - pi) < 3000:
                            res.append({'source': 'moreon-invest.ru', 'price': p, 'area': a_val,
                                        'price_per_m2': round(p / a_val), 'url': url})
                            used.add(pi)
                            break
                    if len(res) >= 10:
                        break
                if len(res) >= 3:
                    break
        print(f'[mela_price] moreon-invest.ru: {len(res)} analogs found')
        return res[:10]
    except Exception as e:
        print(f'[mela_price] moreon-invest.ru error: {e}')
        return []


def _scrape_local_sites(listing: dict) -> list:
    """Запускает все локальные парсеры и возвращает объединённый список аналогов."""
    all_analogs = []
    sources_hit = []
    for scraper, name in [
        (_scrape_arrpro, 'arrpro'),
        (_scrape_ayax, 'ayax'),
        (_scrape_etagi, 'etagi'),
        (_scrape_moreon, 'moreon'),
    ]:
        try:
            res = scraper(listing)
            if res:
                all_analogs.extend(res)
                sources_hit.append(name)
        except Exception as e:
            print(f'[mela_price] {name} failed: {e}')
    print(f'[mela_price] local sites total: {len(all_analogs)} from {sources_hit}')
    return all_analogs


def _search_yandex_xml(query: str, user: str, api_key: str, num: int = 10) -> str:
    """Делает запрос к Yandex XML Search и возвращает сырой XML."""
    params = urllib.parse.urlencode({
        'user': user,
        'key': api_key,
        'query': query,
        'lr': '35',
        'l10n': 'ru',
        'sortby': 'rlv',
        'filter': 'none',
        'maxpassages': '3',
        'groupby': f'attr=d.mode=flat.groups-on-page={num}.docs-in-group=1',
    })
    url = f'{YANDEX_SEARCH_URL}?{params}'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        xml_data = resp.read().decode('utf-8', errors='replace')
    # Проверяем на ошибку Яндекса в теле ответа
    if '<error' in xml_data.lower():
        err_m = re.search(r'<message>(.*?)</message>', xml_data)
        raise Exception(f'Яндекс XML: {err_m.group(1) if err_m else xml_data[:200]}')
    return xml_data


def _extract_prices_from_xml(xml_text: str, min_price: float = 100_000) -> list:
    """Парсит XML-ответ Яндекс.Поиска, извлекает цены и площади из сниппетов."""
    import xml.etree.ElementTree as ET
    results = []
    try:
        root = ET.fromstring(xml_text)
    except Exception as e:
        print(f'[mela_price] XML parse error: {e}, raw: {xml_text[:200]}')
        return results

    for doc in root.iter('doc'):
        url_el = doc.find('url')
        url = (url_el.text or '') if url_el is not None else ''

        source = 'интернет'
        if 'cian.ru' in url:
            source = 'cian.ru'
        elif 'avito.ru' in url:
            source = 'avito.ru'
        elif 'restate.ru' in url:
            source = 'restate.ru'
        elif 'domclick' in url:
            source = 'domclick.ru'
        elif 'emls.ru' in url or 'n1.ru' in url:
            source = url.split('/')[2]

        # Собираем весь текст из сниппета/заголовка
        parts = []
        for tag in ('title', 'headline', 'passages/passage', 'snippet'):
            el = doc.find(tag)
            if el is not None and el.text:
                parts.append(re.sub(r'<[^>]+>', ' ', el.text))
        snippet = ' '.join(parts)

        price_matches = re.findall(r'(\d[\d\s]{3,})\s*(?:₽|руб\.?|р\.)', snippet, re.UNICODE)
        area_matches  = re.findall(r'(\d+[.,]?\d*)\s*м²', snippet, re.UNICODE)

        for pm in price_matches:
            p = _parse_price(pm)
            if p < min_price:
                continue
            for am in area_matches:
                a = _parse_area(am + ' м²')
                if a > 5:
                    results.append({
                        'source': source,
                        'price': p,
                        'area': a,
                        'price_per_m2': round(p / a),
                        'url': url,
                    })
                    break
    return results


def _search_analogs(listing: dict, search_user: str, search_key: str) -> list:
    """Ищет аналоги через Yandex XML Search."""
    cat = (listing.get('category') or '').lower()
    deal = (listing.get('deal') or 'sale').lower()
    area = float(listing.get('area') or 0)
    district = (listing.get('district') or '').strip()

    cat_ru = TYPE_RU.get(cat, 'коммерческое помещение')
    deal_ru = 'аренда' if deal == 'rent' else 'продажа'
    area_str = f'{int(area * 0.6)}-{int(area * 1.6)} м²' if area else ''
    loc = f'Краснодар {district}'.strip()

    # Запросы без site: — он даёт 403 в Яндекс XML
    queries = [
        f'купить {cat_ru} Краснодар {district} {area_str} цена',
        f'{cat_ru} {deal_ru} {loc} {area_str} ₽ аналоги',
        f'продажа {cat_ru} {loc} стоимость м²',
    ] if deal != 'rent' else [
        f'аренда {cat_ru} Краснодар {district} {area_str} цена',
        f'{cat_ru} снять {loc} {area_str} ₽',
        f'аренда {cat_ru} {loc} ставка м²',
    ]

    all_analogs = []
    sources_hit = set()
    for q in queries:
        try:
            xml = _search_yandex_xml(q, search_user, search_key, num=10)
            found = _extract_prices_from_xml(xml, min_price=50_000 if deal == 'rent' else 500_000)
            for a in found:
                sources_hit.add(a['source'])
            all_analogs.extend(found)
            print(f'[mela_price] Query "{q[:60]}": {len(found)} results')
            if len(all_analogs) >= 10:
                break
        except Exception as e:
            print(f'[mela_price] Yandex Search error: {e}')
            continue

    print(f'[mela_price] Yandex Search total: {len(all_analogs)} from {sources_hit}')
    return all_analogs[:10]


def _scrape_cian(listing: dict) -> list:
    """ЦИАН: заблокирован с облачных IP (403). Отключён."""
    return []


def _scrape_avito(listing: dict) -> list:
    """Авито: заблокирован с облачных IP (403). Отключён."""
    return []


def _scrape_restate(listing: dict) -> list:
    """Restate: заблокирован с облачных IP (404). Отключён."""
    return []


def _load_keys(cur):
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if not row:
            return None, None
        return row.get('yandex_api_key'), row.get('yandex_folder_id')
    except Exception:
        return None, None


GPT_PROMPT = (
    'Ты — эксперт по рынку коммерческой недвижимости Краснодара с 15-летним опытом. '
    'Тебе нужно оценить рыночную стоимость объекта по реальным рыночным данным Краснодара 2024–2025 года.\n\n'
    'ВАЖНО: используй реальные рыночные данные Краснодара. '
    'Ориентировочные диапазоны ₽/м² (продажа, 2024–2025):\n'
    '- Офис центр: 100–180 тыс ₽/м², окраина: 50–90 тыс ₽/м²\n'
    '- Торговое помещение центр: 120–250 тыс ₽/м², окраина: 60–110 тыс ₽/м²\n'
    '- Склад: 25–55 тыс ₽/м²\n'
    '- Производство: 15–40 тыс ₽/м²\n'
    '- Свободное назначение: 70–150 тыс ₽/м² (зависит от района)\n'
    '- ГАБ/ГРБ: оценка по доходному методу (10–14% годовых)\n'
    '- Земельный участок: 0.5–5 млн ₽/сот. (зависит от назначения и района)\n\n'
    'Для аренды (₽/м²/мес):\n'
    '- Офис центр: 800–1800 ₽/м²/мес, окраина: 400–900 ₽/м²/мес\n'
    '- Торговое: 1000–3000 ₽/м²/мес (зависит от трафика)\n'
    '- Склад: 200–500 ₽/м²/мес\n\n'
    'Факторы влияющие на цену (учитывай обязательно):\n'
    '- Этаж: 1-й этаж +10-20% к торговым, подвал/цоколь −15-25%\n'
    '- Состояние: новое/евро +15-25%, требует ремонта −15-20%\n'
    '- Земельный участок: наличие участка повышает цену здания на 10-40%\n'
    '- Эл. мощность: >100 кВт важна для производства/склада, даёт +5-15%\n'
    '- Коммуникации: центральные все = норма, газ+вода+канализация +5-10%\n'
    '- Арендный поток (ГАБ): цена = месячная_аренда × 10-14 лет\n\n'
    'Учти все переданные параметры. Сгенерируй 8 реалистичных аналогов '
    'с ценами близкими к реальному рынку Краснодара.\n'
    'Верни СТРОГО JSON одной строкой без markdown:\n'
    '{"analogs":[{"area":<м²>,"price":<₽>,"district":"<район Краснодара>"}],'
    '"price_min":<нижняя граница рынка для объекта>,"price_max":<верхняя граница>,'
    '"median_per_m2":<медиана ₽/м²>,"comment":"<1 предложение об оценке>"}'
)


def _gpt_fallback(listing: dict, api_key: str, folder_id: str) -> list:
    if not api_key or not folder_id:
        return []
    cat = (listing.get('category') or '').lower()
    deal = (listing.get('deal') or '').lower()
    parts = [
        f"Тип: {TYPE_RU.get(cat, cat or 'коммерческая')}",
        f"Сделка: {DEAL_RU.get(deal, deal or 'продажа')}",
        f"Площадь: {listing.get('area') or 0} м²",
    ]
    if listing.get('address'):
        parts.append(f"Адрес: {listing['address']}")
    if listing.get('district'):
        parts.append(f"Район: {listing['district']}")
    if listing.get('floor'):
        parts.append(f"Этаж: {listing['floor']} (важно для торговых)")
    if listing.get('condition'):
        parts.append(f"Состояние: {listing['condition']}")
    if listing.get('land_area'):
        parts.append(f"Площадь участка: {listing['land_area']} соток")
    if listing.get('electricity_kw'):
        parts.append(f"Электрическая мощность: {listing['electricity_kw']} кВт")
    if listing.get('utilities'):
        parts.append(f"Коммуникации: {listing['utilities']}")
    if listing.get('monthly_rent'):
        parts.append(f"Арендный поток: {listing['monthly_rent']:,.0f} ₽/мес (ГАБ)")

    try:
        text = chat_simple(GPT_PROMPT, '\n'.join(parts), api_key, folder_id,
                           temperature=0.3, max_tokens=700, timeout=45)
        text = text.replace('```json', '').replace('```', '').strip()
        parsed = json.loads(text)
        analogs = parsed.get('analogs') or []
        results = []
        for a in analogs[:10]:
            try:
                p = float(a.get('price') or 0)
                ar = float(a.get('area') or 0)
                if p > 100000 and ar > 5:
                    results.append({
                        'source': 'gpt_inference',
                        'price': p,
                        'area': ar,
                        'price_per_m2': round(p / ar),
                        'district': str(a.get('district') or ''),
                        'url': '',
                    })
            except Exception:
                continue
        return results
    except Exception:
        return []


def _verdict(user_price: float, area: float, analogs: list) -> dict:
    """
    Сравниваем ₽/м² пользователя с медианой аналогов.
    Минимальные требования к качеству:
      - Не менее 4 уникальных аналогов (не дублей)
      - Не менее 3 разных значений цены ₽/м² (иначе данные не репрезентативны)
      - Источники не только из GPT (gpt_inference не считается реальным рынком)
    """
    if not user_price or not area:
        return {
            'label': 'Нет данных',
            'color': 'gray',
            'delta_pct': 0,
            'comment': 'Укажите цену и площадь объекта.',
        }

    # Фильтруем GPT-аналоги — они не являются реальными рыночными данными
    real_analogs = [a for a in (analogs or []) if a.get('source') != 'gpt_inference']
    gpt_only = len(real_analogs) == 0 and len(analogs or []) > 0

    ppm2_list = sorted([a['price_per_m2'] for a in real_analogs if a.get('price_per_m2', 0) > 100])
    unique_prices = len(set(round(v / 1000) for v in ppm2_list))  # уникальные с точностью 1000 ₽

    # Проверяем достаточность данных
    if gpt_only or len(ppm2_list) < 4 or unique_prices < 3:
        reason = ''
        if gpt_only:
            reason = 'реальные объявления не найдены'
        elif len(ppm2_list) < 4:
            reason = f'найдено только {len(ppm2_list)} аналог(а) — нужно минимум 4'
        elif unique_prices < 3:
            reason = 'аналоги имеют одинаковую цену — вероятно, это один объект'
        return {
            'label': 'Недостаточно данных',
            'color': 'gray',
            'delta_pct': 0,
            'user_price_per_m2': round(user_price / area),
            'comment': f'Для анализа недостаточно данных: {reason}. Попробуйте обновить вручную или расширить параметры поиска.',
            'data_quality': 'insufficient',
        }

    user_per_m2 = user_price / area
    median = statistics.median(ppm2_list)
    delta_pct = round(((user_per_m2 - median) / median) * 100, 1) if median else 0

    # Оценка разброса — если аналоги слишком разнородны, снижаем уверенность
    stdev = statistics.stdev(ppm2_list) if len(ppm2_list) >= 3 else 0
    cv = (stdev / median * 100) if median else 0  # коэффициент вариации
    data_quality = 'good' if cv < 30 else 'noisy'

    if delta_pct > 20:
        label, color = 'Цена завышена', 'red'
        comment = f'Дороже рынка на {abs(delta_pct):.0f}%. Рекомендуем снизить цену для ускорения сделки.'
    elif delta_pct > 10:
        label, color = 'Чуть выше рынка', 'amber'
        comment = f'На {abs(delta_pct):.0f}% выше медианы по аналогам. Небольшой торг вероятен.'
    elif delta_pct < -20:
        label, color = 'Ниже рынка', 'emerald'
        comment = f'Дешевле рынка на {abs(delta_pct):.0f}%. Есть потенциал поднять цену.'
    elif delta_pct < -10:
        label, color = 'Выгодная цена', 'green'
        comment = f'На {abs(delta_pct):.0f}% ниже медианы — привлекательно для покупателя.'
    else:
        label, color = 'Рыночная цена', 'blue'
        comment = f'В пределах ±10% от рыночной медианы ({delta_pct:+.0f}%).'

    if data_quality == 'noisy':
        comment += f' Данные разнородны (разброс {cv:.0f}%) — оценка ориентировочная.'

    # Диапазон по 25–75 перцентилям
    if len(ppm2_list) >= 4:
        q1 = statistics.quantiles(ppm2_list, n=4)[0]
        q3 = statistics.quantiles(ppm2_list, n=4)[2]
    else:
        q1 = min(ppm2_list)
        q3 = max(ppm2_list)

    return {
        'label': label,
        'color': color,
        'delta_pct': delta_pct,
        'user_price_per_m2': round(user_per_m2),
        'market_median_per_m2': round(median),
        'market_min_price': round(q1 * area),
        'market_max_price': round(q3 * area),
        'suggested_price': round(median * area),
        'comment': comment,
        'data_quality': data_quality,
        'analogs_used': len(ppm2_list),
    }


def _cache_key(listing: dict) -> str:
    # floor с точностью до 1, land_area до 5 соток (объекты с участком — особая выборка)
    floor_bucket = int(listing.get('floor') or 0)
    land_bucket = round((float(listing.get('land_area') or 0)) / 5) * 5
    payload = {
        'category': listing.get('category') or '',
        'deal': listing.get('deal') or '',
        'area': round(float(listing.get('area') or 0)),
        'district': (listing.get('district') or '').lower().strip(),
        'condition': (listing.get('condition') or '').lower().strip(),
        'price_bucket': round(float(listing.get('price') or 0) / 100000) * 100000,
        'floor': floor_bucket,
        'land': land_bucket,
    }
    return hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def _load_cached(cur, key: str):
    try:
        safe_key = key.replace("'", "''")
        cur.execute(
            f"SELECT result FROM {SCHEMA}.mela_price_cache "
            f"WHERE cache_key = '{safe_key}' AND expires_at > NOW()"
        )
        row = cur.fetchone()
        if not row:
            return None
        r = row['result']
        return json.loads(r) if isinstance(r, str) else r
    except Exception as e:
        print(f'[mela_price] Cache load error: {e}')
        return None


def _get_ttl(category: str, has_db_analogs: bool) -> int:
    """TTL кеша в днях: для редких категорий дольше, если только DB-аналоги — короче."""
    ttl = CACHE_TTL_BY_CAT.get(category, CACHE_TTL_DEFAULT)
    if has_db_analogs:
        ttl = min(ttl, 1)  # данные из системы свежие — не кешируем надолго
    return ttl


def _save_cache(cur, conn, key: str, result: dict, category: str = ''):
    try:
        has_db = result.get('db_analogs_count', 0) > 0
        ttl = _get_ttl(category, has_db)
        expires = (datetime.now() + timedelta(days=ttl)).isoformat()
        safe_key = key.replace("'", "''")
        safe_result = json.dumps(result, ensure_ascii=False).replace("'", "''")
        cur.execute(
            f"INSERT INTO {SCHEMA}.mela_price_cache (cache_key, result, expires_at) "
            f"VALUES ('{safe_key}', '{safe_result}', '{expires}') "
            f"ON CONFLICT (cache_key) DO UPDATE "
            f"SET result = EXCLUDED.result, expires_at = EXCLUDED.expires_at, created_at = NOW()"
        )
        conn.commit()
    except Exception:
        pass


def _save_snapshot(cur, conn, listing: dict, analogs: list, verdict: dict, sources: list, used_fallback: bool):
    """Сохраняет живой срез рынка в price_market_snapshots (единая таблица аналитики).
    Ключ уникальности: snapshot_date + category + deal + district.
    Если за сегодня запись уже есть — обновляем (более свежие данные).
    """
    try:
        if not analogs:
            return
        # Только реальные аналоги — GPT не идёт в историю
        real = [a for a in analogs if a.get('source') != 'gpt_inference']
        if not real:
            return

        cat  = (listing.get('category') or '').replace("'", "''")
        deal = (listing.get('deal') or 'sale').replace("'", "''")
        dist = (listing.get('district') or '').strip().replace("'", "''")
        today = datetime.now().date().isoformat()

        ppm2_list = sorted([a['price_per_m2'] for a in real if a.get('price_per_m2', 0) > 0])
        prices    = sorted([a['price']        for a in real if a.get('price', 0) > 0])
        if not ppm2_list:
            return

        # Фильтруем выбросы 10–90 перцентиль
        lo = ppm2_list[int(len(ppm2_list) * 0.10)]
        hi = ppm2_list[min(int(len(ppm2_list) * 0.90), len(ppm2_list) - 1)]
        filtered = [p for p in ppm2_list if lo <= p <= hi] or ppm2_list

        median_ppm2 = round(statistics.median(filtered), 2)
        price_med   = round(statistics.median(prices), 2) if prices else 'NULL'
        price_min   = prices[0]  if prices else 'NULL'
        price_max   = prices[-1] if prices else 'NULL'
        cnt         = len(real)
        src_json    = json.dumps(list(set(a.get('source','') for a in real if a.get('source'))), ensure_ascii=False).replace("'", "''")

        pm_sql   = f'{price_med}'   if price_med  != 'NULL' else 'NULL'
        pmin_sql = f'{price_min}'   if price_min  != 'NULL' else 'NULL'
        pmax_sql = f'{price_max}'   if price_max  != 'NULL' else 'NULL'

        cur.execute(
            f"INSERT INTO {SCHEMA}.price_market_snapshots "
            f"(snapshot_date, category, deal, district, "
            f" price_median, price_min, price_max, price_per_m2_median, analogs_count, sources) "
            f"VALUES ('{today}', '{cat}', '{deal}', '{dist}', "
            f"{pm_sql}, {pmin_sql}, {pmax_sql}, {median_ppm2}, {cnt}, '{src_json}') "
            f"ON CONFLICT (snapshot_date, category, deal, district) DO UPDATE SET "
            f"  price_median        = EXCLUDED.price_median, "
            f"  price_min           = EXCLUDED.price_min, "
            f"  price_max           = EXCLUDED.price_max, "
            f"  price_per_m2_median = EXCLUDED.price_per_m2_median, "
            f"  analogs_count       = GREATEST({SCHEMA}.price_market_snapshots.analogs_count, EXCLUDED.analogs_count), "
            f"  sources             = EXCLUDED.sources, "
            f"  created_at          = NOW()"
        )
        conn.commit()
        print(f'[mela_price] pms upsert: cat={cat} deal={deal} dist={dist} median={median_ppm2} n={cnt}')
    except Exception as e:
        print(f'[mela_price] snapshot save error: {e}')


def handle_mela_price_check(cur, conn, body: dict, qs: dict) -> dict:
    """POST/GET ?action=mela_price_check {category, deal, area, price, address?, district?, floor?, condition?, refresh?}"""
    data = body if body else {}
    # Поддержка GET с qs
    if not data:
        data = qs or {}

    try:
        area = float(data.get('area') or 0)
        price = float(data.get('price') or 0)
    except Exception:
        return {'_status': 400, 'error': 'area и price должны быть числами'}

    if area <= 0:
        return {'_status': 400, 'error': 'Укажите площадь объекта'}

    def _safe_float(v):
        try:
            return float(v) if v not in (None, '', 'null') else None
        except (TypeError, ValueError):
            return None

    listing = {
        'category':      str(data.get('category') or ''),
        'deal':          str(data.get('deal') or 'sale'),
        'area':          area,
        'price':         price,
        'address':       str(data.get('address') or ''),
        'district':      str(data.get('district') or ''),
        'floor':         _safe_float(data.get('floor')),
        'condition':     str(data.get('condition') or ''),
        'land_area':     _safe_float(data.get('land_area')),
        'electricity_kw': _safe_float(data.get('electricity_kw')),
        'utilities':     str(data.get('utilities') or ''),
        'monthly_rent':  _safe_float(data.get('monthly_rent')),
    }

    refresh = str(data.get('refresh') or '').lower() in ('1', 'true', 'yes')

    key = _cache_key(listing)
    if not refresh:
        cached = _load_cached(cur, key)
        if cached:
            return cached

    analogs = []
    sources_used = []
    used_fallback = False

    search_level = ''

    # 1) Аналоги из собственной базы данных системы
    try:
        db_analogs = _db_analogs(cur, listing)
        if db_analogs:
            analogs.extend(db_analogs)
            sources_used.append('база системы')
            search_level = db_analogs[0].pop('_search_level', '') if db_analogs else ''
        print(f'[mela_price] DB analogs: {len(db_analogs)}, level={search_level}')
    except Exception as e:
        print(f'[mela_price] DB analogs error: {e}')

    # 2) Общая копилка рыночных данных (та же, что использует инвестиционная модель) —
    # быстрее живого парсинга, т.к. данные уже накоплены с прошлых проверок/дозапросов
    if len(analogs) < 5:
        try:
            market_analogs = _market_listings_analogs(cur, listing)
            if market_analogs:
                analogs.extend(market_analogs)
                for a in market_analogs:
                    if a['source'] not in sources_used:
                        sources_used.append(a['source'])
        except Exception as e:
            print(f'[mela_price] market_listings error: {e}')

    # 3) Парсинг локальных сайтов Краснодара (etagi, ayax, kayan, arrpro, moreon) —
    # только если копилка не дала достаточно данных
    if len(analogs) < 5:
        try:
            site_analogs = _scrape_local_sites(listing)
            if site_analogs:
                analogs.extend(site_analogs)
                for a in site_analogs:
                    if a['source'] not in sources_used:
                        sources_used.append(a['source'])
        except Exception as e:
            print(f'[mela_price] local sites error: {e}')

    # 4) Yandex XML Search (когда будет настроен)
    if len(analogs) < 5:
        search_key = os.environ.get('YANDEX_SEARCH_API_KEY', '')
        search_user = os.environ.get('YANDEX_SEARCH_USER', '')
        if search_key and search_user:
            try:
                search_analogs = _search_analogs(listing, search_user, search_key)
                if search_analogs:
                    analogs.extend(search_analogs)
                    for a in search_analogs:
                        if a['source'] not in sources_used:
                            sources_used.append(a['source'])
            except Exception as e:
                print(f'[mela_price] Search analogs error: {e}')

    # 5) Если данных всё ещё мало — GPT-фоллбэк
    if len(analogs) < 3:
        api_key, folder_id = _load_keys(cur)
        gpt_analogs = _gpt_fallback(listing, api_key, folder_id)
        if gpt_analogs:
            analogs.extend(gpt_analogs)
            sources_used.append('Виртуальный брокер (GPT)')
            used_fallback = True

    # Глобальная дедупликация всех аналогов (из разных источников)
    analogs = _dedupe_analogs(analogs)
    print(f'[mela_price] after global dedup: {len(analogs)} analogs')

    # Отфильтровать выбросы (вне 5–95 перцентилей по ₽/м²) — только среди реальных
    real = [a for a in analogs if a.get('source') != 'gpt_inference']
    if len(real) >= 6:
        ppm2 = sorted([a['price_per_m2'] for a in real if a.get('price_per_m2', 0) > 0])
        if ppm2:
            lo = ppm2[max(0, int(len(ppm2) * 0.05))]
            hi = ppm2[min(len(ppm2) - 1, int(len(ppm2) * 0.95))]
            analogs = [a for a in analogs if a.get('source') == 'gpt_inference' or lo <= a.get('price_per_m2', 0) <= hi]
            print(f'[mela_price] after outlier filter: {len(analogs)} analogs (lo={lo}, hi={hi})')

    verdict = _verdict(price, area, analogs)

    db_count = sum(1 for a in analogs if a.get('source') == 'база системы')
    category = listing.get('category', '')
    ttl = _get_ttl(category, db_count > 0)

    result = {
        'verdict': verdict,
        'analogs_count': len(analogs),
        'db_analogs_count': db_count,
        'analogs': analogs[:8],
        'sources': sources_used,
        'used_gpt_fallback': used_fallback,
        'cached_until': (datetime.now() + timedelta(days=ttl)).isoformat(),
        'cache_ttl_days': ttl,
        'search_level': search_level,
    }
    _save_cache(cur, conn, key, result, category=category)

    # Сохраняем рыночный срез в историю (только если есть реальные аналоги, не только GPT)
    if analogs and not (used_fallback and db_count == 0):
        _save_snapshot(cur, conn, listing, analogs, verdict, sources_used, used_fallback)

    return result