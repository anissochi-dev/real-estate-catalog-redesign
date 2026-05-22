"""
Мелания: проверка цены объекта по реальным аналогам с krasnodar.cian.ru
и krasnodar.restate.ru. Гибрид: сначала скрапинг, при блокировке — фоллбэк на YandexGPT.
Возвращает вердикт (выше/рыночная/ниже) + диапазон цен.
"""

import hashlib
import json
import re
import statistics
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timedelta

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL_NAME = 'yandexgpt/rc'
CACHE_TTL_DAYS = 7

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


def _scrape_cian(listing: dict) -> list:
    """Парсит первую страницу выдачи Циан по сегменту/площади/городу."""
    category = (listing.get('category') or '').lower()
    deal = (listing.get('deal') or 'sale').lower()
    area = float(listing.get('area') or 0)

    cian_deal = DEAL_TO_CIAN.get(deal, 'sale')
    offer_type = CAT_TO_CIAN_OFFER_TYPE.get(category, 'office')

    params = {
        'deal_type': cian_deal,
        'engine_version': '2',
        f'offer_type': 'offices',
        f'office_type[0]': '1',  # офис по умолчанию
        'region': '4820',  # Краснодар
        'p': '1',
    }
    if area:
        params['mintarea'] = str(int(max(1, area * 0.6)))
        params['maxtarea'] = str(int(area * 1.6))

    # Категории на CIAN: офис=1, торговое=2, склад=3, общепит=4, свободное=5, гостиница=6, производство=7, авто=8, бизнес=10
    cat_map = {'office': 1, 'retail': 2, 'warehouse': 3, 'restaurant': 4,
               'free_purpose': 5, 'hotel': 6, 'production': 7, 'business': 10, 'gab': 10}
    params['office_type[0]'] = str(cat_map.get(category, 1))

    qs = urllib.parse.urlencode(params, doseq=True)
    url = f'https://krasnodar.cian.ru/cat.php?{qs}'

    try:
        html = _http_get(url, timeout=12)
    except Exception:
        return []

    # Быстрый парсинг через regex (без BeautifulSoup) — ищем data-testid карточек
    results = []
    # CIAN рендерит SSR данные в <script type="application/ld+json"> и в data-name атрибутах.
    # Возьмём блоки цен и площадей рядом друг с другом.
    price_pattern = re.compile(r'>(\d[\d\s]{4,})\s*₽<', re.UNICODE)
    area_pattern  = re.compile(r'>(\d+[.,]?\d*)\s*м²<', re.UNICODE)

    prices = [_parse_price(m.group(1)) for m in price_pattern.finditer(html)]
    areas  = [_parse_area(m.group(1) + ' м²') for m in area_pattern.finditer(html)]

    if not prices or not areas:
        return []

    # Берём минимум по длине двух списков, чтобы получить пары
    n = min(len(prices), len(areas), 12)
    for i in range(n):
        p, a = prices[i], areas[i]
        if p > 100000 and a > 5:  # отсекаем шум (комиссии, телефоны)
            results.append({
                'source': 'cian.ru',
                'price': p,
                'area': a,
                'price_per_m2': round(p / a) if a else 0,
                'url': url,
            })
    return results


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
    except Exception:
        return []

    price_pattern = re.compile(r'(\d[\d\s]{5,})\s*₽', re.UNICODE)
    area_pattern  = re.compile(r'(\d+[.,]?\d*)\s*м²', re.UNICODE)

    prices = [_parse_price(m.group(1)) for m in price_pattern.finditer(html)]
    areas  = [_parse_area(m.group(0)) for m in area_pattern.finditer(html)]

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
    'Ты — Мелания, ИИ-аналитик коммерческой недвижимости Краснодара. '
    'По характеристикам объекта оцени рыночные цены аналогов на основе данных '
    'krasnodar.cian.ru и krasnodar.restate.ru. Сгенерируй 6–8 аналогов '
    '(площадь, цена, район) и рассчитай рыночный диапазон и медиану ₽/м².\n'
    'Верни СТРОГО JSON одной строкой без markdown:\n'
    '{"analogs":[{"area":<м²>,"price":<₽>,"district":"<район>"}],'
    '"price_min":<нижняя граница>,"price_max":<верхняя граница>,'
    '"median_per_m2":<медиана ₽/м²>,"comment":"<1 предложение>"}'
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
        cur.execute(
            f"SELECT result FROM {SCHEMA}.mela_price_cache "
            f"WHERE cache_key = %s AND expires_at > NOW()",
            (key,),
        )
        row = cur.fetchone()
        if not row:
            return None
        r = row['result']
        return json.loads(r) if isinstance(r, str) else r
    except Exception:
        return None


def _save_cache(cur, conn, key: str, result: dict):
    try:
        expires = datetime.now() + timedelta(days=CACHE_TTL_DAYS)
        cur.execute(
            f"INSERT INTO {SCHEMA}.mela_price_cache (cache_key, result, expires_at) "
            f"VALUES (%s, %s, %s) "
            f"ON CONFLICT (cache_key) DO UPDATE "
            f"SET result = EXCLUDED.result, expires_at = EXCLUDED.expires_at, created_at = NOW()",
            (key, json.dumps(result, ensure_ascii=False), expires),
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

    # 1) Скрапинг
    analogs = []
    sources_used = []
    try:
        cian_analogs = _scrape_cian(listing)
        if cian_analogs:
            analogs.extend(cian_analogs)
            sources_used.append('cian.ru')
    except Exception:
        pass

    try:
        restate_analogs = _scrape_restate(listing)
        if restate_analogs:
            analogs.extend(restate_analogs)
            sources_used.append('restate.ru')
    except Exception:
        pass

    # 2) Если скрапинг не дал — GPT-фоллбэк
    used_fallback = False
    if len(analogs) < 3:
        api_key, folder_id = _load_keys(cur)
        gpt_analogs = _gpt_fallback(listing, api_key, folder_id)
        if gpt_analogs:
            analogs.extend(gpt_analogs)
            sources_used.append('Мелания (GPT)')
            used_fallback = True

    # Отфильтровать выбросы (вне 5–95 перцентилей по ₽/м²)
    if len(analogs) >= 5:
        ppm2 = sorted([a['price_per_m2'] for a in analogs if a.get('price_per_m2', 0) > 0])
        if ppm2:
            lo = ppm2[int(len(ppm2) * 0.05)]
            hi = ppm2[int(len(ppm2) * 0.95)] if int(len(ppm2) * 0.95) < len(ppm2) else ppm2[-1]
            analogs = [a for a in analogs if lo <= a['price_per_m2'] <= hi]

    verdict = _verdict(price, area, analogs)

    result = {
        'verdict': verdict,
        'analogs_count': len(analogs),
        'analogs': analogs[:8],
        'sources': sources_used,
        'used_gpt_fallback': used_fallback,
        'cached_until': (datetime.now() + timedelta(days=CACHE_TTL_DAYS)).isoformat(),
    }
    _save_cache(cur, conn, key, result)
    return result
