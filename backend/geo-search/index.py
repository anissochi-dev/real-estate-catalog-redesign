"""
Геопространственный поиск и анализ локации.
Работает без PostGIS — формула Haversine в SQL/Python.
Данные инфраструктуры — OpenStreetMap (бесплатно, без ключей).

Actions:
  osm_load        — загрузить/обновить инфраструктуру Краснодара из OSM
  location_score  — скоринг локации объекта (0-100) по инфраструктуре
  radius_search   — найти объекты каталога в радиусе N метров
  similar_location— найти объекты с похожей локацией (по score)
  infra_stats     — статистика загруженной инфраструктуры
"""

import json
import os

import psycopg2
from psycopg2.extras import RealDictCursor

from osm_loader import handle_osm_load
from geo_search import handle_location_score, handle_radius_search, handle_similar_location

SCHEMA = 't_p71821556_real_estate_catalog_'
HEADERS = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}


def _ok(body, status=200):
    return {'statusCode': status, 'headers': HEADERS,
            'body': json.dumps(body, ensure_ascii=False, default=str)}

def _err(code, msg):
    return _ok({'error': msg}, code)

def _get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def handler(event: dict, context) -> dict:
    """Геопространственный поиск и анализ локации объектов недвижимости."""

    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, Authorization',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    params = event.get('queryStringParameters') or {}
    body_data = {}
    if event.get('body'):
        try:
            body_data = json.loads(event['body'])
        except Exception:
            pass

    action = params.get('action') or body_data.get('action') or ''

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # Загрузка/обновление OSM — только для авторизованных
            if action == 'osm_load':
                r = handle_osm_load(event, cur, conn)
                return {**r, 'headers': {**HEADERS, **(r.get('headers') or {})}}

            # Скоринг локации
            if action == 'location_score':
                r = handle_location_score(event, cur, conn)
                return {**r, 'headers': {**HEADERS, **(r.get('headers') or {})}}

            # Радиусный поиск объектов каталога
            if action == 'radius_search':
                r = handle_radius_search(event, cur)
                return {**r, 'headers': {**HEADERS, **(r.get('headers') or {})}}

            # Похожие по локации
            if action == 'similar_location':
                r = handle_similar_location(event, cur)
                return {**r, 'headers': {**HEADERS, **(r.get('headers') or {})}}

            # Статистика инфраструктуры
            if action == 'infra_stats':
                cur.execute(f"""
                    SELECT infra_type, COUNT(*) as cnt,
                           MIN(loaded_at) as first_loaded,
                           MAX(loaded_at) as last_loaded
                    FROM {SCHEMA}.infrastructure
                    WHERE city = 'Краснодар'
                    GROUP BY infra_type
                    ORDER BY cnt DESC
                """)
                rows = cur.fetchall()
                total = sum(r['cnt'] for r in rows)
                return _ok({
                    'total': total,
                    'by_type': [dict(r) for r in rows],
                })

            return _err(400, f'Неизвестный action: {action}. '
                             f'Доступные: osm_load, location_score, radius_search, '
                             f'similar_location, infra_stats')

    finally:
        conn.close()
