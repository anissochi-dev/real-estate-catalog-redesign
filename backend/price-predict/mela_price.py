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
YANDEX_MODEL_NAME = 'yandexgpt/rc'
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
    return results[:15]


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
            if len(all_analogs) >= 8:
                break
        except Exception as e:
            print(f'[mela_price] Yandex Search error: {e}')
            continue

    print(f'[mela_price] Yandex Search total: {len(all_analogs)} from {sources_hit}')
    return all_analogs


def _scrape_cian(listing: dict) -> list:
    """Парсит ЦИАН через внутренний JSON API (не HTML)."""
    import json as _json
    category = (listing.get('category') or '').lower()
    deal = (listing.get('deal') or 'sale').lower()
    area = float(listing.get('area') or 0)

    cian_deal = DEAL_TO_CIAN.get(deal, 'sale')
    cat_map = {'office': 1, 'retail': 2, 'warehouse': 3, 'restaurant': 4,
               'free_purpose': 5, 'hotel': 6, 'production': 7, 'business': 10, 'gab': 10}
    office_type = cat_map.get(category, 1)

    # ЦИАН внутренний API — возвращает JSON с офферами
    api_url = 'https://api.cian.ru/search-offers/v2/search-offers-desktop/'
    payload = {
        'jsonQuery': {
            '_type': 'commercialsale' if cian_deal == 'sale' else 'commercialrent',
            'engine_version': {'type': 'term', 'value': 2},
            'region': {'type': 'terms', 'value': [4820]},
            'office_type': {'type': 'terms', 'value': [office_type]},
            'page': {'type': 'term', 'value': 1},
        }
    }
    if area:
        payload['jsonQuery']['total_area'] = {
            'type': 'range',
            'value': {'gte': int(area * 0.5), 'lte': int(area * 2.0)},
        }

    try:
        data = _json.dumps(payload).encode()
        req = urllib.request.Request(
            api_url, data=data,
            headers={
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://krasnodar.cian.ru',
                'Referer': 'https://krasnodar.cian.ru/',
            },
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = _json.loads(resp.read().decode('utf-8', errors='replace'))
    except Exception as e:
        print(f'[mela_price] CIAN API error: {e}')
        return []

    offers = []
    try:
        for item in (result.get('data') or {}).get('offersSerialized') or []:
            try:
                price_raw = (item.get('bargainTerms') or {}).get('price') or 0
                area_raw = (item.get('totalArea') or item.get('minArea') or 0)
                p = float(price_raw)
                a = float(area_raw)
                if p > 100_000 and a > 5:
                    offers.append({
                        'source': 'cian.ru',
                        'price': p,
                        'area': a,
                        'price_per_m2': round(p / a),
                        'district': str((item.get('geo') or {}).get('userInput') or ''),
                        'url': f"https://www.cian.ru/sale/commercial/{item.get('id', '')}/",
                    })
            except Exception:
                continue
    except Exception as e:
        print(f'[mela_price] CIAN parse error: {e}')

    print(f'[mela_price] CIAN: got {len(offers)} analogs')
    return offers[:12]


def _scrape_avito(listing: dict) -> list:
    """Парсит Авито через внутренний API /web/1/items."""
    import json as _json
    category = (listing.get('category') or '').lower()
    deal = (listing.get('deal') or 'sale').lower()
    area = float(listing.get('area') or 0)

    # Авито categoryId для коммерческой недвижимости Краснодара (city_id=24)
    cat_id_map = {
        'office': 2015, 'retail': 2016, 'warehouse': 2017,
        'restaurant': 2018, 'production': 2019, 'free_purpose': 2020,
        'business': 2021, 'gab': 2021, 'land': 2022,
    }
    cat_id = cat_id_map.get(category, 2015)
    deal_type = 'rent' if deal == 'rent' else 'sell'

    params = {
        'locationId': 637640,  # Краснодар
        'categoryId': cat_id,
        'params[2037]': deal_type,  # тип сделки
        'page': 1,
        'pageSize': 20,
    }
    if area:
        params['params[5904][from]'] = int(area * 0.5)
        params['params[5904][to]'] = int(area * 2.0)

    qs = urllib.parse.urlencode(params)
    url = f'https://www.avito.ru/web/1/main/items?{qs}'

    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': USER_AGENT,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ru-RU,ru;q=0.9',
            'Referer': 'https://www.avito.ru/krasnodar/kommercheskaya_nedvizhimost',
            'X-Requested-With': 'XMLHttpRequest',
        })
        with urllib.request.urlopen(req, timeout=14) as resp:
            data = _json.loads(resp.read().decode('utf-8', errors='replace'))
    except Exception as e:
        print(f'[mela_price] Avito API error: {e}')
        return []

    results = []
    try:
        items = (data.get('result') or {}).get('items') or []
        for item in items:
            try:
                price_raw = (item.get('priceDetailed') or {}).get('value') or item.get('price') or 0
                # price может быть строкой "12 500 000 ₽"
                p = float(re.sub(r'[^\d.]', '', str(price_raw))) if price_raw else 0
                # площадь в params
                area_raw = 0
                for param in (item.get('params') or []):
                    if 'м²' in str(param.get('title') or '') or 'площадь' in str(param.get('title') or '').lower():
                        area_raw = _parse_area(str(param.get('description') or ''))
                        if area_raw:
                            break
                a = float(area_raw) if area_raw else 0
                if p > 100_000 and a > 5:
                    results.append({
                        'source': 'avito.ru',
                        'price': p,
                        'area': a,
                        'price_per_m2': round(p / a),
                        'url': f"https://www.avito.ru{item.get('url', '')}",
                    })
            except Exception:
                continue
    except Exception as e:
        print(f'[mela_price] Avito parse error: {e}')

    print(f'[mela_price] Avito: got {len(results)} analogs')
    return results[:12]


def _scrape_restate(listing: dict) -> list:
    """Парсит выдачу krasnodar.restate.ru."""
    category = (listing.get('category') or '').lower()
    deal = (listing.get('deal') or 'sale').lower()

    section = {
        'office': 'commercial/office',
        'retail': 'commercial/torgovye-pomescheniya',
        'warehouse': 'commercial/sklady',
        'restaurant': 'commercial/obshchepit',
        'hotel': 'commercial/gostinitsy',
        'business': 'commercial/gotoviy-biznes',
        'gab': 'commercial/gotoviy-biznes',
        'production': 'commercial/proizvodstvo',
        'free_purpose': 'commercial/svobodnogo-naznacheniya',
        'land': 'commercial/zemlya',
    }.get(category, 'commercial/office')

    action = 'arenda' if deal == 'rent' else 'prodazha'
    url = f'https://krasnodar.restate.ru/{section}/{action}/'

    try:
        html = _http_get(url, timeout=12)
    except Exception as e:
        print(f'[mela_price] Restate error: {e}')
        return []

    price_pattern = re.compile(r'(\d[\d\s]{5,})\s*₽', re.UNICODE)
    area_pattern  = re.compile(r'(\d+[.,]?\d*)\s*м²', re.UNICODE)

    prices = [_parse_price(m.group(1)) for m in price_pattern.finditer(html)]
    areas  = [_parse_area(m.group(0)) for m in area_pattern.finditer(html)]

    print(f'[mela_price] Restate: found {len(prices)} prices, {len(areas)} areas in html len={len(html)}')

    if not prices or not areas:
        return []

    results = []
    n = min(len(prices), len(areas), 12)
    for i in range(n):
        p, a = prices[i], areas[i]
        if p > 100000 and a > 5:
            results.append({
                'source': 'restate.ru',
                'price': p,
                'area': a,
                'price_per_m2': round(p / a) if a else 0,
                'url': url,
            })
    print(f'[mela_price] Restate: got {len(results)} analogs')
    return results


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

    # 2) Yandex XML Search — реальный поиск по ЦИАН, Авито и другим площадкам
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

    # 3) Если данных всё ещё мало — GPT-фоллбэк
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