"""
Загрузка инфраструктурных объектов Краснодара из OpenStreetMap (Overpass API).
Без внешних ключей — OSM полностью открытый и бесплатный.
Запрашиваем: метро/трамвай, остановки, ТЦ, супермаркеты, парки, школы, больницы.
"""

import json
import urllib.request
import urllib.parse
from datetime import datetime

SCHEMA = 't_p71821556_real_estate_catalog_'
OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

# Bounding box Краснодара (с запасом)
KRD_BBOX = '44.9,38.8,45.2,39.2'  # south, west, north, east

# Запросы Overpass QL — каждый тип отдельно для надёжности
OSM_QUERIES = {
    'tram_stop': f"""
        [out:json][timeout:30];
        (
          node["railway"="tram_stop"]({KRD_BBOX});
          node["public_transport"="stop_position"]["tram"="yes"]({KRD_BBOX});
        );
        out body;
    """,
    'bus_stop': f"""
        [out:json][timeout:30];
        node["highway"="bus_stop"]({KRD_BBOX});
        out body;
    """,
    'subway_entrance': f"""
        [out:json][timeout:30];
        node["railway"="subway_entrance"]({KRD_BBOX});
        out body;
    """,
    'shopping_mall': f"""
        [out:json][timeout:30];
        (
          node["shop"="mall"]({KRD_BBOX});
          way["shop"="mall"]({KRD_BBOX});
          node["building"="retail"]({KRD_BBOX});
          way["building"="retail"]({KRD_BBOX});
        );
        out center;
    """,
    'supermarket': f"""
        [out:json][timeout:30];
        (
          node["shop"="supermarket"]({KRD_BBOX});
          way["shop"="supermarket"]({KRD_BBOX});
        );
        out center;
    """,
    'park': f"""
        [out:json][timeout:30];
        (
          way["leisure"="park"]({KRD_BBOX});
          node["leisure"="park"]({KRD_BBOX});
        );
        out center;
    """,
    'school': f"""
        [out:json][timeout:30];
        (
          node["amenity"="school"]({KRD_BBOX});
          way["amenity"="school"]({KRD_BBOX});
        );
        out center;
    """,
    'hospital': f"""
        [out:json][timeout:30];
        (
          node["amenity"="hospital"]({KRD_BBOX});
          way["amenity"="hospital"]({KRD_BBOX});
        );
        out center;
    """,
    'railway_station': f"""
        [out:json][timeout:30];
        (
          node["railway"="station"]({KRD_BBOX});
          node["railway"="halt"]({KRD_BBOX});
        );
        out body;
    """,
    'market': f"""
        [out:json][timeout:30];
        (
          node["amenity"="marketplace"]({KRD_BBOX});
          way["amenity"="marketplace"]({KRD_BBOX});
        );
        out center;
    """,
    'business_center': f"""
        [out:json][timeout:30];
        (
          node["office"="company"]["building"="office"]({KRD_BBOX});
          way["building"="office"]({KRD_BBOX});
          way["office"="yes"]({KRD_BBOX});
        );
        out center;
    """,
}


def _overpass_query(ql: str) -> list:
    """Выполняет запрос к Overpass API, возвращает список элементов."""
    data = urllib.parse.urlencode({'data': ql}).encode()
    req = urllib.request.Request(
        OVERPASS_URL,
        data=data,
        headers={
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'RealEstateCatalog/1.0 (krd.info)',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=35) as r:
        result = json.loads(r.read().decode())
    return result.get('elements', [])


def _extract_point(el: dict) -> tuple[float, float] | None:
    """Извлекает координаты из элемента OSM (node или way с center)."""
    if el.get('type') == 'node':
        return float(el['lat']), float(el['lon'])
    if el.get('type') in ('way', 'relation') and el.get('center'):
        return float(el['center']['lat']), float(el['center']['lon'])
    return None


def load_infra_type(cur, conn, infra_type: str, ql: str) -> dict:
    """Загружает один тип инфраструктуры из OSM в БД."""
    try:
        elements = _overpass_query(ql)
    except Exception as e:
        return {'type': infra_type, 'status': 'error', 'error': str(e)[:200]}

    inserted = 0
    skipped = 0

    for el in elements:
        pt = _extract_point(el)
        if not pt:
            continue
        lat, lng = pt
        osm_id = el.get('id')
        tags = el.get('tags') or {}
        name = (
            tags.get('name:ru')
            or tags.get('name')
            or tags.get('ref')
            or infra_type
        )[:300]
        meta = {}
        for k in ('brand', 'operator', 'opening_hours', 'website', 'addr:street', 'addr:housenumber'):
            if tags.get(k):
                meta[k] = tags[k]

        # Upsert по osm_id + infra_type
        cur.execute(f"""
            INSERT INTO {SCHEMA}.infrastructure (osm_id, infra_type, name, city, lat, lng, meta)
            VALUES (%s, %s, %s, 'Краснодар', %s, %s, %s)
            ON CONFLICT (osm_id, infra_type) DO UPDATE
            SET name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
                meta = EXCLUDED.meta, loaded_at = NOW()
        """, (osm_id, infra_type, name, lat, lng, json.dumps(meta, ensure_ascii=False)))
        inserted += 1

    conn.commit()
    return {'type': infra_type, 'status': 'ok', 'loaded': inserted, 'skipped': skipped}


def handle_osm_load(event: dict, cur, conn) -> dict:
    """
    action=osm_load — загружает или обновляет инфраструктуру Краснодара из OSM.
    POST {action: 'osm_load', types?: ['tram_stop', 'bus_stop', ...]}
    Без типов — загружает всё.
    """
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    requested_types = body.get('types') or list(OSM_QUERIES.keys())
    # Фильтруем только известные типы
    types_to_load = [t for t in requested_types if t in OSM_QUERIES]

    results = []
    for infra_type in types_to_load:
        res = load_infra_type(cur, conn, infra_type, OSM_QUERIES[infra_type])
        results.append(res)

    # Сводная статистика
    cur.execute(
        f"SELECT infra_type, COUNT(*) as cnt FROM {SCHEMA}.infrastructure "
        f"WHERE city = 'Краснодар' GROUP BY infra_type ORDER BY infra_type"
    )
    stats = {r['infra_type']: r['cnt'] for r in cur.fetchall()}

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps({
            'results': results,
            'total_in_db': stats,
            'loaded_at': datetime.utcnow().isoformat(),
        }, ensure_ascii=False),
    }
