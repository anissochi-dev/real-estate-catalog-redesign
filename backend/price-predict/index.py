"""
Прогнозирование рыночной цены, окупаемости и мониторинг рынка.
Использует статистическую модель на реальных данных из БД:
- Сравнивает объект с похожими (категория, тип сделки, площадь ±50%, район)
- Рассчитывает медиану/перцентили цен, цену за м², окупаемость
- Определяет индекс спроса (количество похожих объектов, скорость продажи)
- Оценивает справедливость текущей цены vs рынок
Args: GET ?id=<listing_id> или POST {category, deal, area, price, district?, city?}
Returns: {market_price, price_per_m2_median, payback_months, demand_index, price_assessment, comparables_count, price_range}
"""

import json
import math
import os
import statistics

import psycopg2
from psycopg2.extras import RealDictCursor

from noi_model import handle_noi_request
from mela_price import handle_mela_price_check
from cost_approach import handle_cost_approach
from nei_analysis import handle_nei
from legal_risks import handle_legal_risks
from tech_analysis import handle_tech_analysis
from sensitivity import handle_sensitivity
from financial_metrics import handle_financial_metrics

SCHEMA = 't_p71821556_real_estate_catalog_'

HEADERS = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}


def _ok(body, status=200):
    return {'statusCode': status, 'headers': HEADERS, 'body': json.dumps(body, ensure_ascii=False)}


def _err(code, msg):
    return _ok({'error': msg}, code)


def _get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


# Коэффициенты доходности по типу объекта (среднерыночные ставки Краснодарского края)
YIELD_RATES = {
    'office':      {'min': 0.07, 'mid': 0.09, 'max': 0.12},
    'retail':      {'min': 0.09, 'mid': 0.12, 'max': 0.15},
    'warehouse':   {'min': 0.08, 'mid': 0.10, 'max': 0.13},
    'restaurant':  {'min': 0.10, 'mid': 0.13, 'max': 0.18},
    'business':    {'min': 0.12, 'mid': 0.18, 'max': 0.30},
    'production':  {'min': 0.07, 'mid': 0.09, 'max': 0.12},
    'hotel':       {'min': 0.08, 'mid': 0.11, 'max': 0.15},
    'gab':         {'min': 0.08, 'mid': 0.10, 'max': 0.13},
    'land':        {'min': 0.04, 'mid': 0.06, 'max': 0.10},
    'building':    {'min': 0.07, 'mid': 0.09, 'max': 0.12},
    'free_purpose':{'min': 0.08, 'mid': 0.10, 'max': 0.14},
    'car_service': {'min': 0.10, 'mid': 0.14, 'max': 0.20},
}

# Поправочные коэффициенты на район Краснодара
DISTRICT_COEFF = {
    'центр':         1.25,
    'фмр':           1.15,
    'прикубанский':  0.95,
    'карасунский':   0.90,
    'прикубанский':  0.92,
    'юбилейный':     1.05,
    'гидростроителей': 0.88,
    'восточный':     0.85,
    'северный':      0.90,
}


def _district_coeff(district: str) -> float:
    if not district:
        return 1.0
    d = district.lower()
    for key, coeff in DISTRICT_COEFF.items():
        if key in d:
            return coeff
    return 1.0


# Поправочные коэффициенты на состояние объекта
CONDITION_COEFF = {
    'new':           1.15,   # новое (готово к въезду)
    'euro':          1.20,   # евроремонт
    'designer':      1.25,   # дизайнерский ремонт
    'good':          1.05,   # хорошее
    'normal':        1.00,   # рабочее
    'needs_repair':  0.85,   # требует ремонта
    'rough':         0.75,   # черновая отделка
    'shell':         0.70,   # без отделки
}


def _condition_coeff(condition: str) -> float:
    if not condition:
        return 1.0
    return CONDITION_COEFF.get(condition.lower(), 1.0)


def _condition_label(condition: str) -> str:
    labels = {
        'new': 'новое', 'euro': 'евроремонт', 'designer': 'дизайнерский',
        'good': 'хорошее', 'normal': 'рабочее',
        'needs_repair': 'треб. ремонта', 'rough': 'черновая', 'shell': 'без отделки',
    }
    return labels.get((condition or '').lower(), condition or '')


def _percentile(data: list, p: float) -> float:
    if not data:
        return 0.0
    sorted_data = sorted(data)
    idx = (len(sorted_data) - 1) * p / 100
    lo = int(idx)
    hi = lo + 1
    if hi >= len(sorted_data):
        return float(sorted_data[-1])
    frac = idx - lo
    return sorted_data[lo] * (1 - frac) + sorted_data[hi] * frac


def _assess_price(current_price: float, market_price: float) -> dict:
    if market_price <= 0:
        return {'label': 'Нет данных', 'color': 'gray', 'delta_pct': 0}
    delta = (current_price - market_price) / market_price * 100
    if delta < -15:
        return {'label': 'Ниже рынка', 'color': 'emerald', 'delta_pct': round(delta, 1)}
    elif delta < -5:
        return {'label': 'Выгодная цена', 'color': 'green', 'delta_pct': round(delta, 1)}
    elif delta <= 5:
        return {'label': 'Рыночная цена', 'color': 'blue', 'delta_pct': round(delta, 1)}
    elif delta <= 20:
        return {'label': 'Чуть выше рынка', 'color': 'amber', 'delta_pct': round(delta, 1)}
    else:
        return {'label': 'Выше рынка', 'color': 'red', 'delta_pct': round(delta, 1)}


def _demand_index(comparables_count: int, category: str, deal: str) -> dict:
    """
    Индекс спроса: сколько похожих объектов на рынке.
    Чем меньше похожих — тем выше дефицит и спрос.
    """
    if comparables_count == 0:
        return {'score': 5, 'label': 'Нет данных', 'color': 'gray'}
    elif comparables_count <= 2:
        return {'score': 9, 'label': 'Высокий спрос', 'color': 'emerald'}
    elif comparables_count <= 5:
        return {'score': 7, 'label': 'Хороший спрос', 'color': 'green'}
    elif comparables_count <= 10:
        return {'score': 5, 'label': 'Умеренный спрос', 'color': 'blue'}
    elif comparables_count <= 20:
        return {'score': 3, 'label': 'Высокое предложение', 'color': 'amber'}
    else:
        return {'score': 2, 'label': 'Насыщенный рынок', 'color': 'red'}


def _predict(cur, category: str, deal: str, area: float, price: float,
             district: str = '', city: str = 'Краснодар', listing_id: int = 0,
             condition: str = '') -> dict:

    area = float(area or 0)
    price = float(price or 0)
    area_min = area * 0.4
    area_max = area * 2.5

    cat_safe = category.replace("'", "''")
    deal_safe = deal.replace("'", "''")
    city_safe = city.replace("'", "''")

    # 1. Похожие объекты (та же категория + тип сделки + площадь в диапазоне)
    cur.execute(
        f"SELECT id, price, area, price_per_m2, district, payback, profit, monthly_rent, yearly_rent, created_at "
        f"FROM {SCHEMA}.listings "
        f"WHERE category = '{cat_safe}' AND deal = '{deal_safe}' "
        f"AND area BETWEEN {area_min} AND {area_max} "
        f"AND status = 'active' "
        f"AND price > 0 AND area > 0 "
        + (f"AND id != {listing_id} " if listing_id else "")
    )
    rows = cur.fetchall()

    prices = [float(r['price']) for r in rows if r['price']]
    areas = [float(r['area']) for r in rows if r['area']]
    ppm2_list = []
    for r in rows:
        if r['price_per_m2'] and r['price_per_m2'] > 0:
            ppm2_list.append(float(r['price_per_m2']))
        elif r['price'] and r['area'] and r['area'] > 0:
            ppm2_list.append(float(r['price']) / float(r['area']))

    comparables_count = len(rows)

    # 2. Рыночная цена за м²
    if ppm2_list:
        market_ppm2 = statistics.median(ppm2_list)
        ppm2_p25 = _percentile(ppm2_list, 25)
        ppm2_p75 = _percentile(ppm2_list, 75)
    else:
        # Нет аналогов — используем нормативные ставки
        yields = YIELD_RATES.get(category, YIELD_RATES['office'])
        d_coeff = _district_coeff(district)
        # Базовая цена за м² для Краснодара (приблизительные нормативы 2024)
        BASE_PPM2 = {
            'office': 80_000, 'retail': 100_000, 'warehouse': 45_000,
            'restaurant': 90_000, 'business': 120_000, 'production': 40_000,
            'hotel': 110_000, 'gab': 85_000, 'land': 25_000,
            'building': 75_000, 'free_purpose': 70_000, 'car_service': 55_000,
        }
        base = BASE_PPM2.get(category, 70_000) * d_coeff
        market_ppm2 = base
        ppm2_p25 = base * 0.75
        ppm2_p75 = base * 1.30

    # Поправка на район и состояние
    d_coeff = _district_coeff(district)
    c_coeff = _condition_coeff(condition)
    # Если аналогов мало — корректируем по району; если много — район уже зашит в данные.
    # Состояние учитываем всегда (различает квартиры с ремонтом и без)
    if comparables_count < 3:
        market_ppm2_adj = market_ppm2 * d_coeff * c_coeff
        ppm2_p25 = ppm2_p25 * d_coeff * c_coeff
        ppm2_p75 = ppm2_p75 * d_coeff * c_coeff
    else:
        market_ppm2_adj = market_ppm2 * c_coeff
        ppm2_p25 = ppm2_p25 * c_coeff
        ppm2_p75 = ppm2_p75 * c_coeff

    # 3. Расчётная рыночная цена объекта
    market_price = market_ppm2_adj * area if area > 0 else 0
    price_range_min = ppm2_p25 * area
    price_range_max = ppm2_p75 * area

    # Рекомендованная цена (центр диапазона) — для текстового предложения
    suggested_price = market_price
    suggested_ppm2 = market_ppm2_adj

    # 4. Окупаемость (для продажи)
    payback_months = None
    monthly_income_est = None
    if deal == 'sale' and area > 0 and price > 0:
        yields = YIELD_RATES.get(category, {'min': 0.07, 'mid': 0.09, 'max': 0.12})

        # Если есть данные по арендным объектам той же категории — берём реальную ставку аренды
        cur.execute(
            f"SELECT monthly_rent, yearly_rent, area FROM {SCHEMA}.listings "
            f"WHERE category = '{cat_safe}' AND deal = 'rent' "
            f"AND area BETWEEN {area_min} AND {area_max} "
            f"AND status = 'active' AND (monthly_rent > 0 OR yearly_rent > 0)"
        )
        rent_rows = cur.fetchall()
        rent_per_m2_list = []
        for r in rent_rows:
            a = float(r['area'] or 0)
            if a > 0:
                if r['monthly_rent']:
                    rent_per_m2_list.append(float(r['monthly_rent']) / a)
                elif r['yearly_rent']:
                    rent_per_m2_list.append(float(r['yearly_rent']) / a / 12)

        if rent_per_m2_list:
            rent_ppm2 = statistics.median(rent_per_m2_list)
            monthly_income_est = rent_ppm2 * area
        else:
            # Нормативная доходность
            monthly_income_est = price * yields['mid'] / 12

        if monthly_income_est > 0:
            payback_months = round(price / monthly_income_est)

    # Если объект — аренда, считаем доходность от цены покупки (нормативно)
    elif deal == 'rent' and price > 0 and area > 0:
        monthly_income_est = price  # для аренды price = месячная ставка
        # Ищем цены продажи аналогов
        cur.execute(
            f"SELECT price, area FROM {SCHEMA}.listings "
            f"WHERE category = '{cat_safe}' AND deal = 'sale' "
            f"AND area BETWEEN {area_min} AND {area_max} "
            f"AND status = 'active' AND price > 0"
        )
        sale_rows = cur.fetchall()
        sale_ppm2_list = [float(r['price']) / float(r['area'])
                          for r in sale_rows if r['area'] and r['area'] > 0]
        if sale_ppm2_list:
            sale_ppm2 = statistics.median(sale_ppm2_list)
            est_value = sale_ppm2 * area
            if monthly_income_est > 0:
                payback_months = round(est_value / monthly_income_est)

    # 5. Готовый бизнес — окупаемость по прибыли
    elif deal == 'business':
        cur.execute(
            f"SELECT payback, profit, price FROM {SCHEMA}.listings "
            f"WHERE category = '{cat_safe}' AND deal = 'business' "
            f"AND status = 'active' AND payback IS NOT NULL AND payback > 0"
            + (f" AND id != {listing_id}" if listing_id else "")
        )
        pb_rows = cur.fetchall()
        if pb_rows:
            pb_list = [float(r['payback']) for r in pb_rows]
            payback_months = round(statistics.median(pb_list))

    # 6. Оценка цены
    price_assessment = _assess_price(price, market_price) if price > 0 and market_price > 0 else \
        {'label': 'Нет данных', 'color': 'gray', 'delta_pct': 0}

    # 7. Индекс спроса
    demand = _demand_index(comparables_count, category, deal)

    # 8. Похожие объекты (топ-3 для показа)
    similar = []
    for r in sorted(rows, key=lambda x: abs(float(x['area'] or 0) - area))[:3]:
        similar.append({
            'id': r['id'],
            'price': float(r['price']),
            'area': float(r['area']),
            'district': r.get('district') or '',
        })

    # 9. Текстовое предложение по цене (учитывает категорию, сделку, состояние, площадь)
    cat_labels = {
        'office': 'офиса', 'retail': 'торгового помещения', 'warehouse': 'склада',
        'restaurant': 'помещения общепита', 'hotel': 'гостиницы',
        'business': 'готового бизнеса', 'gab': 'ГАБ', 'production': 'производственного помещения',
        'land': 'участка', 'building': 'отдельно стоящего здания',
        'free_purpose': 'помещения свободного назначения', 'car_service': 'автосервиса',
    }
    deal_labels = {'sale': 'продажа', 'rent': 'аренда', 'business': 'готовый бизнес'}
    cat_lbl = cat_labels.get(category, category or 'объекта')
    deal_lbl = deal_labels.get(deal, deal or 'сделки')
    cond_lbl = _condition_label(condition)

    suggestion_parts = [
        f"Для {cat_lbl} ({deal_lbl}) площадью {round(area)} м²"
    ]
    if cond_lbl:
        suggestion_parts.append(f"с состоянием «{cond_lbl}»")
    if district:
        suggestion_parts.append(f"в районе «{district}»")

    if suggested_price > 0:
        suggestion_parts.append(
            f"справедливая цена ≈ {round(suggested_price):,} ₽".replace(',', ' ')
        )
        if price_range_min and price_range_max:
            suggestion_parts.append(
                f"(диапазон {round(price_range_min):,}–{round(price_range_max):,} ₽)".replace(',', ' ')
            )
        if suggested_ppm2:
            suggestion_parts.append(f"~ {round(suggested_ppm2):,} ₽/м²".replace(',', ' '))

    if price > 0 and price_assessment.get('label') != 'Нет данных':
        suggestion_parts.append(
            f"Ваша цена — «{price_assessment['label']}» ({price_assessment.get('delta_pct', 0):+}% от рынка)."
        )

    suggestion = ' · '.join(suggestion_parts)

    return {
        'market_price': round(market_price) if market_price else None,
        'price_per_m2_median': round(market_ppm2_adj) if market_ppm2_adj else None,
        'price_range': {
            'min': round(price_range_min) if price_range_min else None,
            'max': round(price_range_max) if price_range_max else None,
        },
        'suggested_price': round(suggested_price) if suggested_price else None,
        'suggestion': suggestion,
        'condition_coeff': c_coeff,
        'district_coeff': d_coeff,
        'payback_months': payback_months,
        'monthly_income_est': round(monthly_income_est) if monthly_income_est else None,
        'demand': demand,
        'price_assessment': price_assessment,
        'comparables_count': comparables_count,
        'similar': similar,
        'data_source': 'db_comparables' if comparables_count >= 3 else 'market_norms',
    }


def handle_debug_scrape(body: dict) -> dict:
    """Живая диагностика HTTP-запроса к сайту прямо из облачной функции."""
    import urllib.request as _req
    import urllib.error as _err
    import re as _re
    import time

    urls = body.get('urls') or []
    keywords = body.get('keywords') or ['руб', '₽', 'price', 'м²', 'площадь']
    regex_patterns = body.get('regex_patterns') or []
    results = []

    ua_variants = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'python-requests/2.31.0',
    ]

    for url in urls[:5]:
        for ua in ua_variants:
            t0 = time.time()
            entry = {'url': url, 'user_agent': ua[:40] + '...', 'status': None,
                     'html_len': 0, 'keywords_found': [], 'error': None,
                     'first_200_chars': '', 'elapsed_ms': 0, 'regex_matches': {}}
            try:
                cache_bust = f'{"&" if "?" in url else "?"}nocache={int(time.time())}'
                req = _req.Request(
                    url + cache_bust,
                    headers={
                        'User-Agent': ua,
                        'Accept': 'text/html,application/xhtml+xml,application/json,*/*;q=0.9',
                        'Accept-Language': 'ru-RU,ru;q=0.9',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Referer': 'https://www.google.com/',
                    }
                )
                with _req.urlopen(req, timeout=12) as resp:
                    raw = resp.read(500_000)
                    try:
                        html = raw.decode('utf-8', errors='replace')
                    except Exception:
                        html = raw.decode('cp1251', errors='replace')
                    entry['status'] = resp.status
                    entry['html_len'] = len(html)
                    entry['first_200_chars'] = html[:200].replace('\n', ' ').strip()
                    entry['keywords_found'] = [kw for kw in keywords if kw in html]
                    entry['is_spa'] = (
                        len(html) < 5000 or
                        (html.count('<script') > 10 and not entry['keywords_found'])
                    )
                    # Дополнительный regex-поиск по HTML
                    for pat in regex_patterns:
                        try:
                            matches = _re.findall(pat, html)
                            entry['regex_matches'][pat[:40]] = matches[:5]
                        except Exception:
                            pass
                    # Ищем встроенный JSON (SSR-данные)
                    json_snippets = _re.findall(
                        r'(?:window\.__(?:NUXT|NEXT_DATA|STATE|INITIAL_STATE|DATA)__|'
                        r'<script[^>]*type=["\']application/json["\'][^>]*>)'
                        r'.{0,50}',
                        html
                    )
                    entry['embedded_json_hints'] = json_snippets[:3]
                    # Ищем первое вхождение числа рядом с ₽/руб
                    price_samples = _re.findall(r'(\d[\d\s]{3,})\s*(?:₽|руб)', html)[:5]
                    entry['price_samples'] = price_samples
            except _err.HTTPError as e:
                entry['status'] = e.code
                entry['error'] = f'HTTP {e.code}: {e.reason}'
                try:
                    body_bytes = e.read(2000)
                    entry['first_200_chars'] = body_bytes.decode('utf-8', errors='replace')[:200]
                except Exception:
                    pass
            except Exception as e:
                entry['error'] = str(e)[:200]
            finally:
                entry['elapsed_ms'] = round((time.time() - t0) * 1000)
            results.append(entry)
            if entry['status'] == 200:
                break

    return {'results': results}


def handler(event: dict, context) -> dict:
    """Прогнозирует рыночную цену, окупаемость и индекс спроса для объекта недвижимости."""

    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    method = event.get('httpMethod', 'GET')
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # NOI-модель (инвестиционная аналитика) — отдельная ветка
            params_all = event.get('queryStringParameters') or {}
            if params_all.get('action') == 'noi_model':
                result = handle_noi_request(cur, conn, params_all)
                status = result.pop('_status', 200)
                return _ok(result, status)

            # Мелания: проверка цены по аналогам CIAN/restate
            body_data = {}
            if event.get('body'):
                try:
                    body_data = json.loads(event['body'])
                except Exception:
                    body_data = {}
            if params_all.get('action') == 'mela_price_check' or body_data.get('action') == 'mela_price_check':
                result = handle_mela_price_check(cur, conn, body_data, params_all)
                status = result.pop('_status', 200)
                return _ok(result, status)

            if body_data.get('action') == 'debug_scrape':
                return _ok(handle_debug_scrape(body_data))

            # ── Система оценки и анализа ──────────────────────────────────────
            _api_key    = os.environ.get('AISTUDIO_API_KEY', '')
            _folder_id  = os.environ.get('YANDEX_FOLDER_ID', 'b1g3c3russgao6k4432n')

            action = params_all.get('action') or body_data.get('action') or ''

            if action == 'analyze_csv':
                csv_url = params_all.get('url') or body_data.get('url', '')
                result = handle_analyze_csv(csv_url)
                return _ok(result)

            if action == 'cost_approach':
                r = handle_cost_approach(event, cur, conn, _api_key, _folder_id)
                return {**r, 'headers': {**HEADERS, **(r.get('headers') or {})}}

            if action == 'nei':
                r = handle_nei(event, cur, conn, _api_key, _folder_id)
                return {**r, 'headers': {**HEADERS, **(r.get('headers') or {})}}

            if action == 'legal_risks':
                r = handle_legal_risks(event, cur, conn, _api_key, _folder_id)
                return {**r, 'headers': {**HEADERS, **(r.get('headers') or {})}}

            if action == 'tech_analysis':
                r = handle_tech_analysis(event, cur, conn, _api_key, _folder_id)
                return {**r, 'headers': {**HEADERS, **(r.get('headers') or {})}}

            if action == 'sensitivity':
                r = handle_sensitivity(event, cur, conn, _api_key, _folder_id)
                return {**r, 'headers': {**HEADERS, **(r.get('headers') or {})}}

            if action == 'financial_metrics':
                r = handle_financial_metrics(event, cur, conn, _api_key, _folder_id)
                return {**r, 'headers': {**HEADERS, **(r.get('headers') or {})}}

            # Сводный отчёт — все модули сразу для одного объекта
            if action == 'full_valuation':
                listing_id = int(body_data.get('id') or params_all.get('id') or 0)
                if not listing_id:
                    return _err(400, 'id обязателен')
                import json as _j
                def _body(r):
                    return _j.loads(r.get('body', '{}'))
                cost   = _body(handle_cost_approach(event, cur, conn, _api_key, _folder_id))
                nei    = _body(handle_nei(event, cur, conn, _api_key, _folder_id))
                legal  = _body(handle_legal_risks(event, cur, conn, _api_key, _folder_id))
                tech   = _body(handle_tech_analysis(event, cur, conn, _api_key, _folder_id))
                fin    = _body(handle_financial_metrics(event, cur, conn, _api_key, _folder_id))
                # Сохраняем сводный отчёт
                cur.execute(
                    f"INSERT INTO {SCHEMA}.valuation_reports (listing_id, report_type, result) "
                    f"VALUES (%s, 'full', %s)",
                    (listing_id, json.dumps({
                        'cost_approach': cost, 'nei': nei,
                        'legal_risks': legal, 'tech_analysis': tech,
                        'financial_metrics': fin,
                    }, ensure_ascii=False))
                )
                conn.commit()
                return _ok({
                    'listing_id': listing_id,
                    'cost_approach': cost,
                    'nei': nei,
                    'legal_risks': legal,
                    'tech_analysis': tech,
                    'financial_metrics': fin,
                })
            # ─────────────────────────────────────────────────────────────────

            # Авто-обновление рыночных снапшотов по всем категориям
            if params_all.get('action') == 'ping_cron' or body_data.get('action') == 'price_market_refresh':
                from market_snapshots import handle_refresh as _msr
                return _ok(_msr(cur, conn, force=body_data.get('force') is True))

            if params_all.get('action') == 'price_market_stats':
                from market_snapshots import handle_stats as _mss
                return _ok(_mss(cur, params_all))

            if action == 'aggregate_market_listings':
                from market_snapshots import aggregate_market_listings as _aml
                return _ok(_aml(cur, conn))

            if method == 'GET':
                params = params_all

                # Батч-режим: ?ids=54,62,59 — один запрос вместо N
                ids_str = params.get('ids') or ''
                if ids_str:
                    raw_ids = [s.strip() for s in ids_str.split(',') if s.strip().isdigit()]
                    if not raw_ids:
                        return _err(400, 'Не переданы корректные ids')
                    ids_list = [int(x) for x in raw_ids[:20]]  # лимит 20
                    ids_sql = ','.join(str(i) for i in ids_list)
                    cur.execute(
                        f"SELECT id, category, deal, area, price, district, city, payback, profit, monthly_rent, condition "
                        f"FROM {SCHEMA}.listings WHERE id IN ({ids_sql}) AND status = 'active'"
                    )
                    rows_batch = cur.fetchall()
                    batch_result = {}
                    for row in rows_batch:
                        rid = row['id']
                        batch_result[str(rid)] = _predict(
                            cur,
                            category=row['category'],
                            deal=row['deal'],
                            area=float(row['area'] or 0),
                            price=float(row['price'] or 0),
                            district=row.get('district') or '',
                            city=row.get('city') or 'Краснодар',
                            listing_id=rid,
                            condition=row.get('condition') or '',
                        )
                    return _ok(batch_result)

                # Одиночный режим: ?id=54
                listing_id_str = params.get('id') or ''
                if not listing_id_str.isdigit():
                    return _err(400, 'Не передан id объекта')
                listing_id = int(listing_id_str)
                cur.execute(
                    f"SELECT id, category, deal, area, price, district, city, payback, profit, monthly_rent, condition "
                    f"FROM {SCHEMA}.listings WHERE id = {listing_id} AND status = 'active'"
                )
                row = cur.fetchone()
                if not row:
                    return _err(404, 'Объект не найден')
                result = _predict(
                    cur,
                    category=row['category'],
                    deal=row['deal'],
                    area=float(row['area'] or 0),
                    price=float(row['price'] or 0),
                    district=row.get('district') or '',
                    city=row.get('city') or 'Краснодар',
                    listing_id=listing_id,
                    condition=row.get('condition') or '',
                )
                return _ok(result)

            elif method == 'POST':
                body = json.loads(event.get('body') or '{}')
                category = str(body.get('category') or 'office')
                deal = str(body.get('deal') or 'sale')
                area = float(body.get('area') or 0)
                price = float(body.get('price') or 0)
                district = str(body.get('district') or '')
                city = str(body.get('city') or 'Краснодар')
                condition = str(body.get('condition') or '')
                if area <= 0:
                    return _err(400, 'Не передана площадь объекта')
                result = _predict(cur, category, deal, area, price, district, city,
                                  condition=condition)
                return _ok(result)

            return _err(405, 'Method not allowed')
    finally:
        conn.close()


def handle_analyze_csv(csv_url: str) -> dict:
    """Анализирует CSV-файл выгрузки с ЦИАН/Авито для оценки пригодности данных."""
    import urllib.request
    import csv
    import io
    import statistics as _stat
    import re

    if not csv_url:
        return {'error': 'Не указан url'}

    # Скачиваем файл
    req = urllib.request.Request(csv_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode('utf-8-sig', errors='replace')

    reader = csv.DictReader(io.StringIO(raw), delimiter=';')
    rows = list(reader)
    total = len(rows)

    # Счётчики
    sources = {}
    deal_types = {}
    districts = {}
    obj_types = {}
    prices_sale, prices_rent = [], []
    areas = []
    ppm2_sale, ppm2_rent = [], []
    coords_missing, coords_invalid = 0, 0
    no_price, no_area, no_coords = 0, 0, 0
    phones = {}
    addresses = {}
    dates = []
    problems = []

    # Маппинг "Вид объекта" → наша категория
    TYPE_MAP = {
        'офис': 'office', 'офисное': 'office',
        'торговое': 'retail', 'торговый': 'retail', 'магазин': 'retail',
        'свободного назначения': 'free_purpose', 'свободное': 'free_purpose',
        'склад': 'warehouse', 'складской': 'warehouse',
        'производственное': 'production', 'производство': 'production',
        'здание': 'building', 'отдельно стоящее': 'building',
        'общепит': 'restaurant', 'кафе': 'restaurant', 'ресторан': 'restaurant',
        'гостиниц': 'hotel', 'гостевой': 'hotel',
        'земельн': 'land',
        'автосервис': 'car_service', 'автомойк': 'car_service',
        'готовый арендный': 'gab',
    }

    for i, row in enumerate(rows, 1):
        raw_price = (row.get('Цена') or '').strip().replace(' ', '')
        raw_deal = (row.get('Тип объявления') or '').strip()
        source = (row.get('Источник') or '').strip()
        district = (row.get('Метро/Район') or '').strip()
        address = (row.get('Адрес') or '').strip()
        phone = (row.get('Телефон') or '').strip()
        date_str = (row.get('Дата') or '').strip()
        extra = (row.get('Доп.параметры') or '')
        lat_s = (row.get('lat') or '').strip()
        lng_s = (row.get('lng') or '').strip()

        # Источник
        sources[source] = sources.get(source, 0) + 1

        # Тип сделки
        deal_key = 'sale' if 'продам' in raw_deal.lower() or 'продаж' in raw_deal.lower() else 'rent'
        deal_types[deal_key] = deal_types.get(deal_key, 0) + 1

        # Район
        if district:
            districts[district] = districts.get(district, 0) + 1

        # Цена
        try:
            price = float(raw_price) if raw_price else 0
        except Exception:
            price = 0
        if price <= 0:
            no_price += 1
            problems.append({'row': i, 'issue': 'нет цены', 'title': row.get('Название', '')[:60]})

        # Площадь из Доп.параметры
        area = 0
        area_m = re.search(r'Общая площадь=([0-9.,]+)', extra)
        if area_m:
            try:
                area = float(area_m.group(1).replace(',', '.'))
            except Exception:
                area = 0
        if area <= 0:
            # попробуем из названия: "(125 м²)"
            nm = re.search(r'\((\d+[\.,]?\d*)\s*м', row.get('Название', ''))
            if nm:
                try:
                    area = float(nm.group(1).replace(',', '.'))
                except Exception:
                    area = 0
        if area > 0:
            areas.append(area)
        else:
            no_area += 1
            problems.append({'row': i, 'issue': 'нет площади', 'title': row.get('Название', '')[:60]})

        # Тип объекта
        obj_type = ''
        ot_m = re.search(r'Вид объекта=([^|]+)', extra)
        if ot_m:
            obj_type = ot_m.group(1).strip()
        if obj_type:
            obj_types[obj_type] = obj_types.get(obj_type, 0) + 1

        # Цена за м²
        if price > 0 and area > 0:
            ppm2 = price / area
            if deal_key == 'sale':
                prices_sale.append(price)
                ppm2_sale.append(ppm2)
            else:
                prices_rent.append(price)
                ppm2_rent.append(ppm2)

        # Координаты
        try:
            lat = float(lat_s) if lat_s else 0
            lng = float(lng_s) if lng_s else 0
            if lat == 0 or lng == 0:
                coords_missing += 1
                no_coords += 1
            elif not (44.0 < lat < 45.7 and 38.5 < lng < 39.5):
                coords_invalid += 1
                problems.append({'row': i, 'issue': f'координаты вне Краснодара ({lat},{lng})', 'title': row.get('Название', '')[:60]})
        except Exception:
            coords_missing += 1
            no_coords += 1

        # Телефоны
        if phone:
            phones[phone] = phones.get(phone, 0) + 1

        # Адреса
        if address:
            addresses[address] = addresses.get(address, 0) + 1

        # Даты
        if date_str:
            dates.append(date_str[:10])

    # Считаем метрики
    def safe_median(lst): return round(_stat.median(lst)) if lst else None
    def safe_min(lst): return round(min(lst)) if lst else None
    def safe_max(lst): return round(max(lst)) if lst else None

    dup_phones = {p: c for p, c in phones.items() if c > 1}
    dup_addresses = {a: c for a, c in addresses.items() if c > 1}

    area_buckets = {
        'до_100м2': sum(1 for a in areas if a < 100),
        '100_300м2': sum(1 for a in areas if 100 <= a < 300),
        '300_1000м2': sum(1 for a in areas if 300 <= a < 1000),
        'свыше_1000м2': sum(1 for a in areas if a >= 1000),
    }

    top_districts = sorted(districts.items(), key=lambda x: -x[1])[:10]
    top_obj_types = sorted(obj_types.items(), key=lambda x: -x[1])[:10]

    # Оценка пригодности для NOI
    has_price_pct = round((total - no_price) / total * 100, 1) if total else 0
    has_area_pct = round((total - no_area) / total * 100, 1) if total else 0
    has_coords_pct = round((total - no_coords) / total * 100, 1) if total else 0

    noi_score = round((has_price_pct + has_area_pct + has_coords_pct) / 3, 1)

    return {
        'total_rows': total,
        'sources': sources,
        'deal_types': deal_types,
        'top_obj_types': top_obj_types,
        'top_districts': top_districts,
        'prices': {
            'sale': {
                'count': len(prices_sale),
                'min': safe_min(prices_sale),
                'median': safe_median(prices_sale),
                'max': safe_max(prices_sale),
            },
            'rent': {
                'count': len(prices_rent),
                'min': safe_min(prices_rent),
                'median': safe_median(prices_rent),
                'max': safe_max(prices_rent),
            },
        },
        'price_per_m2': {
            'sale': {
                'min': safe_min(ppm2_sale),
                'median': safe_median(ppm2_sale),
                'max': safe_max(ppm2_sale),
            },
            'rent': {
                'min': safe_min(ppm2_rent),
                'median': safe_median(ppm2_rent),
                'max': safe_max(ppm2_rent),
            },
        },
        'areas': {
            'min': safe_min(areas),
            'median': safe_median(areas),
            'max': safe_max(areas),
            'buckets': area_buckets,
            'no_area_rows': no_area,
        },
        'data_quality': {
            'no_price': no_price,
            'no_area': no_area,
            'no_coords': no_coords,
            'coords_invalid': coords_invalid,
            'has_price_pct': has_price_pct,
            'has_area_pct': has_area_pct,
            'has_coords_pct': has_coords_pct,
            'noi_readiness_score': noi_score,
        },
        'duplicates': {
            'phones': len(dup_phones),
            'phone_details': dict(list(dup_phones.items())[:10]),
            'addresses': len(dup_addresses),
            'address_details': dict(list(dup_addresses.items())[:10]),
        },
        'dates': {
            'min': min(dates) if dates else None,
            'max': max(dates) if dates else None,
        },
        'problems': problems[:30],
    }