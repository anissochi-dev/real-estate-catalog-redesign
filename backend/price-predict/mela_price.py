"""
Виртуальный брокер: проверка цены объекта по реальным аналогам.
Источники данных:
1. Yandex XML Search — реальный поиск по ЦИАН, Авито, Restate (обходит блокировки)
2. YandexGPT — фоллбэк если Search API недоступен
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

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL_NAME = 'yandexgpt-5-pro/latest'
YANDEX_SEARCH_URL = 'https://yandex.ru/search/xml'
CACHE_TTL_DAYS = 3

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


def _db_analogs(cur, listing: dict) -> list:
    """
    Ищет реальные аналоги в базе данных системы.
    Стратегия: широкий диапазон площадей, та же категория и сделка.
    При малом количестве — расширяем диапазон площадей.
    """
    cat = (listing.get('category') or '').replace("'", "''")
    deal = (listing.get('deal') or 'sale').replace("'", "''")
    area = float(listing.get('area') or 0)
    district = (listing.get('district') or '').lower().strip()
    listing_id = int(listing.get('id') or 0)

    if area <= 0:
        return []

    results = []

    # Попытка 1: узкий диапазон площади ±50%, тот же район
    for area_mult, use_district in [(0.5, True), (0.5, False), (1.5, False)]:
        area_min = area * (1 - area_mult)
        area_max = area * (1 + area_mult)
        district_clause = ''
        if use_district and district:
            safe_d = district.replace("'", "''")
            district_clause = f"AND LOWER(district) LIKE '%{safe_d}%'"
        id_clause = f'AND id != {listing_id}' if listing_id else ''

        cur.execute(
            f"SELECT id, price, area, price_per_m2, district, condition, status "
            f"FROM {SCHEMA}.listings "
            f"WHERE category = '{cat}' AND deal = '{deal}' "
            f"AND area BETWEEN {area_min} AND {area_max} "
            f"AND price > 0 AND area > 0 "
            f"AND status IN ('active', 'archived') "
            f"{district_clause} {id_clause} "
            f"ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, updated_at DESC "
            f"LIMIT 15"
        )
        rows = cur.fetchall()
        for r in rows:
            p = float(r['price'] or 0)
            a = float(r['area'] or 0)
            if p > 0 and a > 0:
                ppm2 = float(r['price_per_m2'] or 0) or round(p / a)
                results.append({
                    'source': 'база системы',
                    'price': p,
                    'area': a,
                    'price_per_m2': ppm2,
                    'district': str(r.get('district') or ''),
                    'url': '',
                    'status': str(r.get('status') or ''),
                })
        if len(results) >= 5:
            break

    print(f'[mela_price] DB: found {len(results)} analogs (cat={cat}, deal={deal}, area={area})')
    return results[:10]


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
    """Парсит krasnodar.arrpro.ru/katalog/all/ — каталог коммерческой недвижимости Краснодара."""
    deal = (listing.get('deal') or 'sale').lower()
    area = float(listing.get('area') or 0)
    # Каталог всех объектов — больше объявлений чем на главной
    url = 'https://krasnodar.arrpro.ru/katalog/all/'
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
        if len(html) < 1000:
            print(f'[mela_price] arrpro.ru: empty response ({len(html)} bytes)')
            return []
        print(f'[mela_price] arrpro.ru: html={len(html)} bytes, has_price={"₽" in html or "руб" in html}')
        min_p = 20_000 if deal == 'rent' else 300_000
        broad_area = area if area > 0 else 100
        res = _parse_html_analogs(html, 'arrpro.ru', min_p, broad_area)
        print(f'[mela_price] arrpro.ru: {len(res)} analogs found')
        return res
    except Exception as e:
        print(f'[mela_price] arrpro.ru error: {e}')
        return []


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
    Парсит ayax.ru — крупное агентство Краснодара.
    URL: /kommercheskaya-nedvizhimost/ для продажи и аренды (SSR, до 600кб).
    """
    deal = (listing.get('deal') or 'sale').lower()
    area = float(listing.get('area') or 0)
    url = 'https://www.ayax.ru/kommercheskaya-nedvizhimost/'
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
        print(f'[mela_price] ayax.ru: html={len(html)} bytes, has_price={"₽" in html}')
        if len(html) < 10_000:
            print('[mela_price] ayax.ru: response too small, skipping')
            return []
        min_p = 20_000 if deal == 'rent' else 300_000
        res = _parse_html_analogs(html, 'ayax.ru', min_p, area)
        # Дополнительный поиск цен в формате "цена: X ₽" и data-атрибутах
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
                                    'price_per_m2': round(p / a_val), 'url': url})
                        used.add(pi)
                        break
                if len(res) >= 10:
                    break
        print(f'[mela_price] ayax.ru: {len(res)} analogs found')
        return res[:10]
    except Exception as e:
        print(f'[mela_price] ayax.ru error: {e}')
        return []


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
    '- ГАБ/ГРБ: оценка по доходному методу (10–14% годовых)\n\n'
    'Для аренды (₽/м²/мес):\n'
    '- Офис центр: 800–1800 ₽/м²/мес, окраина: 400–900 ₽/м²/мес\n'
    '- Торговое: 1000–3000 ₽/м²/мес (зависит от трафика)\n'
    '- Склад: 200–500 ₽/м²/мес\n\n'
    'Учти район, состояние, этаж, площадь. Сгенерируй 8 реалистичных аналогов '
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
        parts.append(f"Этаж: {listing['floor']}")
    if listing.get('condition'):
        parts.append(f"Состояние: {listing['condition']}")

    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL_NAME}',
        'completionOptions': {'stream': False, 'temperature': 0.3, 'maxTokens': '700'},
        'messages': [
            {'role': 'system', 'text': GPT_PROMPT},
            {'role': 'user', 'text': '\n'.join(parts)},
        ],
    }
    req = urllib.request.Request(
        YANDEX_GPT_URL,
        data=json.dumps(payload).encode(),
        headers={
            'Authorization': f'Api-Key {api_key}',
            'Content-Type': 'application/json',
            'x-folder-id': folder_id,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode())
        alts = (data.get('result') or {}).get('alternatives') or []
        text = ((alts[0].get('message') or {}).get('text') or '').strip() if alts else ''
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
    """Сравниваем ₽/м² пользователя с медианой аналогов."""
    if not analogs or not user_price or not area:
        return {
            'label': 'Нет данных',
            'color': 'gray',
            'delta_pct': 0,
            'comment': 'Недостаточно данных для анализа',
        }
    user_per_m2 = user_price / area
    ppm2_list = sorted([a['price_per_m2'] for a in analogs if a.get('price_per_m2', 0) > 0])
    if not ppm2_list:
        return {'label': 'Нет данных', 'color': 'gray', 'delta_pct': 0, 'comment': 'Аналоги без цен'}

    median = statistics.median(ppm2_list)
    delta_pct = round(((user_per_m2 - median) / median) * 100, 1) if median else 0

    if delta_pct > 15:
        label, color = 'Цена завышена', 'red'
        comment = f'Дороже рынка на {abs(delta_pct):.0f}%. Снизьте цену для ускорения продажи.'
    elif delta_pct < -15:
        label, color = 'Ниже рынка', 'emerald'
        comment = f'Дешевле рынка на {abs(delta_pct):.0f}%. Можно поднять цену.'
    else:
        label, color = 'Рыночная цена', 'green'
        comment = f'В пределах ±15% от рынка ({delta_pct:+.0f}%).'

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
    }


def _cache_key(listing: dict) -> str:
    payload = {
        'category': listing.get('category') or '',
        'deal': listing.get('deal') or '',
        'area': round(float(listing.get('area') or 0)),
        'district': (listing.get('district') or '').lower().strip(),
        'condition': (listing.get('condition') or '').lower().strip(),
        'price_bucket': round(float(listing.get('price') or 0) / 100000) * 100000,
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


def _save_cache(cur, conn, key: str, result: dict):
    try:
        expires = (datetime.now() + timedelta(days=CACHE_TTL_DAYS)).isoformat()
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

    listing = {
        'category': str(data.get('category') or ''),
        'deal':     str(data.get('deal') or 'sale'),
        'area':     area,
        'price':    price,
        'address':  str(data.get('address') or ''),
        'district': str(data.get('district') or ''),
        'floor':    data.get('floor'),
        'condition': str(data.get('condition') or ''),
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

    # 1) Аналоги из собственной базы данных системы
    try:
        db_analogs = _db_analogs(cur, listing)
        if db_analogs:
            analogs.extend(db_analogs)
            sources_used.append('база системы')
        print(f'[mela_price] DB analogs: {len(db_analogs)}')
    except Exception as e:
        print(f'[mela_price] DB analogs error: {e}')

    # 2) Парсинг локальных сайтов Краснодара (etagi, ayax, kayan, arrpro, moreon)
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

    # 3) Yandex XML Search (когда будет настроен)
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

    # 4) Если данных всё ещё мало — GPT-фоллбэк
    if len(analogs) < 3:
        api_key, folder_id = _load_keys(cur)
        gpt_analogs = _gpt_fallback(listing, api_key, folder_id)
        if gpt_analogs:
            analogs.extend(gpt_analogs)
            sources_used.append('Виртуальный брокер (GPT)')
            used_fallback = True

    # Отфильтровать выбросы (вне 5–95 перцентилей по ₽/м²)
    if len(analogs) >= 5:
        ppm2 = sorted([a['price_per_m2'] for a in analogs if a.get('price_per_m2', 0) > 0])
        if ppm2:
            lo = ppm2[int(len(ppm2) * 0.05)]
            hi = ppm2[int(len(ppm2) * 0.95)] if int(len(ppm2) * 0.95) < len(ppm2) else ppm2[-1]
            analogs = [a for a in analogs if lo <= a['price_per_m2'] <= hi]

    verdict = _verdict(price, area, analogs)

    db_count = sum(1 for a in analogs if a.get('source') == 'база системы')
    cache_days = 1 if db_count > 0 else CACHE_TTL_DAYS

    result = {
        'verdict': verdict,
        'analogs_count': len(analogs),
        'db_analogs_count': db_count,
        'analogs': analogs[:8],
        'sources': sources_used,
        'used_gpt_fallback': used_fallback,
        'cached_until': (datetime.now() + timedelta(days=cache_days)).isoformat(),
    }
    _save_cache(cur, conn, key, result)
    return result