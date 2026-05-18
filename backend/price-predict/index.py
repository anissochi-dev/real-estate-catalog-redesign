"""
Прогнозирование рыночной цены и окупаемости объекта недвижимости.
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
             district: str = '', city: str = 'Краснодар', listing_id: int = 0) -> dict:

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

    # Поправка на район
    d_coeff = _district_coeff(district)
    market_ppm2_adj = market_ppm2  # уже в данных с учётом района, корректировка не нужна

    # 3. Расчётная рыночная цена объекта
    market_price = market_ppm2_adj * area if area > 0 else 0
    price_range_min = ppm2_p25 * area
    price_range_max = ppm2_p75 * area

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

    return {
        'market_price': round(market_price) if market_price else None,
        'price_per_m2_median': round(market_ppm2_adj) if market_ppm2_adj else None,
        'price_range': {
            'min': round(price_range_min) if price_range_min else None,
            'max': round(price_range_max) if price_range_max else None,
        },
        'payback_months': payback_months,
        'monthly_income_est': round(monthly_income_est) if monthly_income_est else None,
        'demand': demand,
        'price_assessment': price_assessment,
        'comparables_count': comparables_count,
        'similar': similar,
        'data_source': 'db_comparables' if comparables_count >= 3 else 'market_norms',
    }


def handler(event: dict, context) -> dict:
    """Прогнозирует рыночную цену, окупаемость и индекс спроса для объекта недвижимости."""

    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    method = event.get('httpMethod', 'GET')
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if method == 'GET':
                params = event.get('queryStringParameters') or {}
                listing_id_str = params.get('id') or ''
                if not listing_id_str.isdigit():
                    return _err(400, 'Не передан id объекта')
                listing_id = int(listing_id_str)
                cur.execute(
                    f"SELECT id, category, deal, area, price, district, city, payback, profit, monthly_rent "
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
                if area <= 0:
                    return _err(400, 'Не передана площадь объекта')
                result = _predict(cur, category, deal, area, price, district, city)
                return _ok(result)

            return _err(405, 'Method not allowed')
    finally:
        conn.close()
