"""
Геопространственный поиск и скоринг локации.
Всё — чистая математика без внешних сервисов.

Haversine вместо PostGIS: расстояние между двумя точками на сфере.
Точность ±0.5% — достаточно для задач недвижимости.
"""

import json
import math
from datetime import datetime, timedelta

SCHEMA = 't_p71821556_real_estate_catalog_'
CACHE_TTL_DAYS = 30   # инфраструктура меняется редко

EARTH_RADIUS_M = 6_371_000.0


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Расстояние между двумя точками в метрах (формула Haversine)."""
    r = EARTH_RADIUS_M
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ─── SQL Haversine (для запросов прямо в БД) ───────────────────────────────────
# Возвращает расстояние в метрах между точкой (lat1, lng1) и колонками lat/lng таблицы
def haversine_sql(lat: float, lng: float, lat_col: str = 'lat', lng_col: str = 'lng') -> str:
    """Генерирует SQL-выражение Haversine для использования в WHERE/ORDER BY."""
    return f"""
        6371000 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS({lat_col}::float - {lat}) / 2), 2) +
            COS(RADIANS({lat})) * COS(RADIANS({lat_col}::float)) *
            POWER(SIN(RADIANS({lng_col}::float - {lng}) / 2), 2)
        ))
    """


# ─── Весовые коэффициенты скоринга локации ────────────────────────────────────
# Максимальный балл каждого фактора + функция убывания по расстоянию

SCORE_FACTORS = {
    # Транспортная доступность (макс 40 баллов)
    'tram_stop': {
        'max_score': 20,
        'decay': [  # (расстояние_м, балл)
            (150,  20),
            (300,  15),
            (500,  10),
            (800,   5),
            (1200,  2),
        ],
        'label': 'Трамвайная остановка',
    },
    'bus_stop': {
        'max_score': 10,
        'decay': [
            (100,  10),
            (300,   7),
            (500,   4),
            (800,   2),
        ],
        'label': 'Автобусная остановка',
    },
    'subway_entrance': {
        'max_score': 20,
        'decay': [
            (200,  20),
            (400,  15),
            (800,  10),
            (1200,  5),
        ],
        'label': 'Метро / электрозаправка',
    },
    'railway_station': {
        'max_score': 10,
        'decay': [
            (300,  10),
            (600,   7),
            (1000,  3),
        ],
        'label': 'ЖД-вокзал / платформа',
    },
    # Торговля и сервисы (макс 25 баллов)
    'shopping_mall': {
        'max_score': 15,
        'decay': [
            (200,  15),
            (500,  10),
            (1000,  5),
            (2000,  2),
        ],
        'label': 'Торговый центр',
    },
    'supermarket': {
        'max_score': 10,
        'decay': [
            (150,  10),
            (400,   7),
            (700,   4),
            (1000,  2),
        ],
        'label': 'Супермаркет',
    },
    'market': {
        'max_score': 8,
        'decay': [
            (300,   8),
            (700,   5),
            (1200,  2),
        ],
        'label': 'Рынок',
    },
    # Деловая среда (макс 15 баллов)
    'business_center': {
        'max_score': 15,
        'decay': [
            (200,  15),
            (500,  10),
            (1000,  5),
            (2000,  2),
        ],
        'label': 'Бизнес-центр',
    },
    # Качество среды (макс 10 баллов)
    'park': {
        'max_score': 8,
        'decay': [
            (200,   8),
            (500,   5),
            (1000,  3),
        ],
        'label': 'Парк / сквер',
    },
    'school': {
        'max_score': 5,
        'decay': [
            (300,   5),
            (700,   3),
            (1200,  1),
        ],
        'label': 'Школа',
    },
    'hospital': {
        'max_score': 5,
        'decay': [
            (500,   5),
            (1200,  3),
            (2000,  1),
        ],
        'label': 'Больница / клиника',
    },
}

# Корректировка по категории объекта: какие факторы важнее
CATEGORY_WEIGHTS = {
    'retail': {
        'tram_stop': 1.4, 'bus_stop': 1.2, 'shopping_mall': 1.3,
        'supermarket': 0.8, 'business_center': 0.8, 'park': 0.5,
    },
    'restaurant': {
        'tram_stop': 1.3, 'bus_stop': 1.1, 'shopping_mall': 1.2,
        'park': 1.2, 'business_center': 1.0,
    },
    'office': {
        'tram_stop': 1.2, 'bus_stop': 1.1, 'business_center': 1.5,
        'subway_entrance': 1.3, 'park': 1.1,
    },
    'warehouse': {
        'railway_station': 1.5, 'tram_stop': 0.5, 'bus_stop': 0.7,
        'shopping_mall': 0.3, 'business_center': 0.4,
    },
    'hotel': {
        'railway_station': 1.4, 'tram_stop': 1.2, 'shopping_mall': 1.2,
        'park': 1.3, 'subway_entrance': 1.3,
    },
    'production': {
        'railway_station': 1.6, 'tram_stop': 0.6, 'bus_stop': 0.8,
        'shopping_mall': 0.3, 'business_center': 0.4,
    },
}


def _score_for_distance(factor_key: str, distance_m: float, category: str = '') -> float:
    """Балл за конкретный инфраструктурный объект на данном расстоянии."""
    factor = SCORE_FACTORS.get(factor_key)
    if not factor:
        return 0.0
    base_score = 0.0
    for max_dist, pts in factor['decay']:
        if distance_m <= max_dist:
            base_score = float(pts)
            break
    if base_score == 0:
        return 0.0
    weight = CATEGORY_WEIGHTS.get(category, {}).get(factor_key, 1.0)
    return min(base_score * weight, factor['max_score'] * 1.5)


def _load_nearby_infra(cur, lat: float, lng: float, radius_m: float = 2000) -> list:
    """
    Загружает инфраструктурные объекты в радиусе из БД.
    Фильтр по bbox (быстро), потом Haversine в Python (точно).
    """
    # Грубый bbox-фильтр: 1 градус ≈ 111 км
    deg = radius_m / 111_000
    lat_min, lat_max = lat - deg, lat + deg
    lng_min, lng_max = lng - deg, lng + deg

    cur.execute(f"""
        SELECT id, infra_type, name, lat::float, lng::float, meta
        FROM {SCHEMA}.infrastructure
        WHERE city = 'Краснодар'
          AND lat BETWEEN %s AND %s
          AND lng BETWEEN %s AND %s
    """, (lat_min, lat_max, lng_min, lng_max))
    rows = cur.fetchall()

    result = []
    for r in rows:
        dist = haversine(lat, lng, r['lat'], r['lng'])
        if dist <= radius_m:
            result.append({
                'id': r['id'],
                'infra_type': r['infra_type'],
                'name': r['name'],
                'lat': r['lat'],
                'lng': r['lng'],
                'distance_m': round(dist),
            })

    return sorted(result, key=lambda x: x['distance_m'])


def calc_location_score(lat: float, lng: float, category: str, nearby: list) -> dict:
    """
    Считает скоринг локации (0–100) по близлежащей инфраструктуре.
    Возвращает итоговый балл и детализацию по факторам.
    """
    # По каждому типу берём только ближайший объект
    best_by_type: dict[str, dict] = {}
    for obj in nearby:
        t = obj['infra_type']
        if t not in best_by_type or obj['distance_m'] < best_by_type[t]['distance_m']:
            best_by_type[t] = obj

    breakdown = {}
    total_score = 0.0
    max_possible = 0.0

    for factor_key, factor_cfg in SCORE_FACTORS.items():
        max_possible += factor_cfg['max_score']
        obj = best_by_type.get(factor_key)
        if obj:
            pts = _score_for_distance(factor_key, obj['distance_m'], category)
            breakdown[factor_key] = {
                'label': factor_cfg['label'],
                'score': round(pts, 1),
                'max': factor_cfg['max_score'],
                'nearest_name': obj['name'],
                'nearest_dist_m': obj['distance_m'],
            }
            total_score += pts
        else:
            breakdown[factor_key] = {
                'label': factor_cfg['label'],
                'score': 0,
                'max': factor_cfg['max_score'],
                'nearest_name': None,
                'nearest_dist_m': None,
            }

    # Нормализуем к 100
    normalized = round(min(total_score / max_possible * 100, 100), 1) if max_possible > 0 else 0

    # Словесная оценка
    if normalized >= 80:
        label = 'отличная локация'
    elif normalized >= 60:
        label = 'хорошая локация'
    elif normalized >= 40:
        label = 'средняя локация'
    elif normalized >= 20:
        label = 'слабая локация'
    else:
        label = 'изолированная локация'

    return {
        'score': normalized,
        'label': label,
        'breakdown': breakdown,
        'raw_score': round(total_score, 1),
        'max_possible': round(max_possible, 1),
    }


def handle_location_score(event: dict, cur, conn) -> dict:
    """
    action=location_score — скоринг локации объекта.
    GET ?action=location_score&id=123
    POST {action, id} или {action, lat, lng, category}
    """
    params = event.get('queryStringParameters') or {}
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    listing_id = int(body.get('id') or params.get('id') or 0)

    lat  = float(body.get('lat')  or params.get('lat')  or 0) or None
    lng  = float(body.get('lng')  or params.get('lng')  or 0) or None
    category = body.get('category') or params.get('category') or ''

    # Если передан id — грузим координаты из БД
    if listing_id and not (lat and lng):
        cur.execute(
            f"SELECT lat::float, lng::float, category FROM {SCHEMA}.listings "
            f"WHERE id = %s AND status = 'active' AND (is_visible IS NULL OR is_visible = TRUE)",
            (listing_id,)
        )
        row = cur.fetchone()
        if not row:
            return _err(404, 'Объект не найден')
        lat, lng = row['lat'], row['lng']
        category = category or row['category'] or ''

    if not lat or not lng:
        return _err(400, 'Нужны координаты: id объекта или lat+lng')

    # Проверяем кеш
    if listing_id:
        cur.execute(
            f"SELECT score, score_breakdown, infra_nearby, expires_at "
            f"FROM {SCHEMA}.location_score_cache WHERE listing_id = %s",
            (listing_id,)
        )
        cached = cur.fetchone()
        if cached and cached['expires_at'] > datetime.utcnow():
            return _ok({
                **cached['score_breakdown'],
                'infra_nearby': cached['infra_nearby'],
                'cached': True,
            })

    # Загружаем инфраструктуру в радиусе 2 км
    nearby = _load_nearby_infra(cur, lat, lng, radius_m=2000)

    if not nearby:
        return _ok({
            'score': 0,
            'label': 'нет данных об инфраструктуре',
            'breakdown': {},
            'infra_nearby': [],
            'cached': False,
            'note': 'Запустите action=osm_load для загрузки данных OSM',
        })

    score_result = calc_location_score(lat, lng, category, nearby)

    # Топ-5 ближайших объектов (для отображения на карте)
    infra_nearby = nearby[:15]

    # Кешируем
    if listing_id:
        expires = datetime.utcnow() + timedelta(days=CACHE_TTL_DAYS)
        cur.execute(f"""
            INSERT INTO {SCHEMA}.location_score_cache
                (listing_id, score, score_breakdown, infra_nearby, expires_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (listing_id) DO UPDATE
            SET score = EXCLUDED.score, score_breakdown = EXCLUDED.score_breakdown,
                infra_nearby = EXCLUDED.infra_nearby,
                calculated_at = NOW(), expires_at = EXCLUDED.expires_at
        """, (
            listing_id,
            score_result['score'],
            json.dumps(score_result, ensure_ascii=False),
            json.dumps(infra_nearby, ensure_ascii=False),
            expires,
        ))
        conn.commit()

    return _ok({
        **score_result,
        'infra_nearby': infra_nearby,
        'lat': lat,
        'lng': lng,
        'category': category,
        'cached': False,
    })


def handle_radius_search(event: dict, cur) -> dict:
    """
    action=radius_search — поиск объектов каталога в радиусе от точки.
    POST {action, lat, lng, radius_m?, category?, deal?, limit?}
    или  POST {action, id, radius_m?}  — от конкретного объекта
    """
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass
    params = event.get('queryStringParameters') or {}

    listing_id = int(body.get('id') or params.get('id') or 0)
    lat    = float(body.get('lat')    or params.get('lat')    or 0) or None
    lng    = float(body.get('lng')    or params.get('lng')    or 0) or None
    radius = float(body.get('radius_m') or params.get('radius_m') or 1000)
    category = body.get('category') or params.get('category') or ''
    deal   = body.get('deal')    or params.get('deal')    or ''
    limit  = min(int(body.get('limit') or 20), 50)

    if listing_id and not (lat and lng):
        cur.execute(
            f"SELECT lat::float, lng::float, category, deal FROM {SCHEMA}.listings "
            f"WHERE id = %s AND status = 'active'",
            (listing_id,)
        )
        row = cur.fetchone()
        if not row:
            return _err(404, 'Объект не найден')
        lat, lng = row['lat'], row['lng']
        category = category or row['category'] or ''
        deal = deal or row['deal'] or ''

    if not lat or not lng:
        return _err(400, 'Нужны координаты')

    # Bbox-фильтр
    deg = radius / 111_000
    lat_min, lat_max = lat - deg, lat + deg
    lng_min, lng_max = lng - deg, lng + deg

    where_parts = [
        "status = 'active'",
        "(is_visible IS NULL OR is_visible = TRUE)",
        "lat IS NOT NULL AND lng IS NOT NULL",
        "lat::float BETWEEN %(lat_min)s AND %(lat_max)s",
        "lng::float BETWEEN %(lng_min)s AND %(lng_max)s",
    ]
    if listing_id:
        where_parts.append(f"id != %(listing_id)s")
    if category:
        where_parts.append("category = %(category)s")
    if deal:
        where_parts.append("deal = %(deal)s")

    where_sql = ' AND '.join(where_parts)
    cur.execute(f"""
        SELECT id, title, category, deal, price, area, district, address,
               lat::float, lng::float, condition, building_class, image
        FROM {SCHEMA}.listings
        WHERE {where_sql}
        LIMIT 200
    """, {
        'lat_min': lat_min, 'lat_max': lat_max,
        'lng_min': lng_min, 'lng_max': lng_max,
        'listing_id': listing_id,
        'category': category, 'deal': deal,
    })
    rows = cur.fetchall()

    results = []
    for r in rows:
        dist = haversine(lat, lng, r['lat'], r['lng'])
        if dist <= radius:
            results.append({
                'id': r['id'],
                'title': r['title'],
                'category': r['category'],
                'deal': r['deal'],
                'price': r['price'],
                'area': r['area'],
                'district': r['district'],
                'address': r['address'],
                'lat': r['lat'],
                'lng': r['lng'],
                'condition': r['condition'],
                'building_class': r['building_class'],
                'image': r['image'],
                'distance_m': round(dist),
                'price_per_m2': round(r['price'] / r['area']) if r['area'] else None,
            })

    results.sort(key=lambda x: x['distance_m'])
    results = results[:limit]

    return _ok({
        'center': {'lat': lat, 'lng': lng},
        'radius_m': radius,
        'total': len(results),
        'results': results,
    })


def handle_similar_location(event: dict, cur) -> dict:
    """
    action=similar_location — объекты с похожей локацией (похожий скоринг).
    POST {action, id, max_score_delta?}
    Находит объекты в том же районе со схожим score ±delta.
    """
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass
    params = event.get('queryStringParameters') or {}

    listing_id = int(body.get('id') or params.get('id') or 0)
    if not listing_id:
        return _err(400, 'id обязателен')

    max_delta = float(body.get('max_score_delta') or 15)
    limit = min(int(body.get('limit') or 10), 30)

    # Берём score нашего объекта
    cur.execute(
        f"SELECT score FROM {SCHEMA}.location_score_cache WHERE listing_id = %s",
        (listing_id,)
    )
    row = cur.fetchone()
    if not row:
        return _err(400, 'Сначала рассчитайте скоринг: action=location_score')

    base_score = float(row['score'])

    # Ищем объекты с похожим скором (±delta)
    cur.execute(f"""
        SELECT lc.listing_id, lc.score, lc.score_breakdown,
               l.title, l.category, l.deal, l.price, l.area, l.district, l.address,
               l.lat::float, l.lng::float, l.image
        FROM {SCHEMA}.location_score_cache lc
        JOIN {SCHEMA}.listings l ON l.id = lc.listing_id
        WHERE lc.listing_id != %s
          AND lc.score BETWEEN %s AND %s
          AND l.status = 'active'
          AND (l.is_visible IS NULL OR l.is_visible = TRUE)
        ORDER BY ABS(lc.score - %s) ASC
        LIMIT %s
    """, (listing_id, base_score - max_delta, base_score + max_delta, base_score, limit))

    rows = cur.fetchall()
    results = []
    for r in rows:
        sb = r['score_breakdown']
        if isinstance(sb, str):
            sb = json.loads(sb)
        results.append({
            'id': r['listing_id'],
            'title': r['title'],
            'category': r['category'],
            'deal': r['deal'],
            'price': r['price'],
            'area': r['area'],
            'district': r['district'],
            'address': r['address'],
            'lat': r['lat'],
            'lng': r['lng'],
            'image': r['image'],
            'location_score': float(r['score']),
            'score_delta': round(abs(float(r['score']) - base_score), 1),
        })

    return _ok({
        'base_score': base_score,
        'max_score_delta': max_delta,
        'total': len(results),
        'results': results,
    })


def _ok(body: dict) -> dict:
    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }

def _err(code: int, msg: str) -> dict:
    return {
        'statusCode': code,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps({'error': msg}, ensure_ascii=False),
    }