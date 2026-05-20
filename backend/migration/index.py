"""
Миграция данных сайта: экспорт и импорт объектов, контактов (лидов), настроек.
GET  ?action=export&type=listings|contacts|settings|all   — скачать JSON
POST {action: import, type: listings|contacts, data: [...]} — загрузить JSON
GET  ?action=stats  — количество записей для бэкапа
"""
import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timezone

SCHEMA = 't_p71821556_real_estate_catalog_'
CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}


def _ok(body, status=200):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, ensure_ascii=False, default=str)}


def _err(code, msg):
    return _ok({'error': msg}, code)


def _safe(s, length=255):
    return (s or '').replace("'", "''")[:length]


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _export_listings(cur) -> list:
    cur.execute(
        f"SELECT id, title, description, category, deal, price, price_per_sqm, area, floor, floors_total, "
        f"address, district, city, metro, lat, lng, status, tags, seo_title, seo_description, "
        f"views_site, created_at, updated_at "
        f"FROM {SCHEMA}.listings ORDER BY id ASC"
    )
    return [dict(r) for r in cur.fetchall()]


def _export_contacts(cur) -> list:
    cur.execute(
        f"SELECT id, name, phone, email, message, source, status, listing_id, created_at "
        f"FROM {SCHEMA}.leads ORDER BY id ASC"
    )
    return [dict(r) for r in cur.fetchall()]


def _export_settings(cur) -> dict:
    cur.execute(
        f"SELECT company_name, company_phone, company_email, company_address, "
        f"hero_title, hero_subtitle, about_text, main_city, site_url, "
        f"seo_keywords, seo_description, company_since_year, "
        f"footer_description "
        f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
    )
    row = cur.fetchone()
    return dict(row) if row else {}


def _import_listings(cur, conn, data: list, user_id: int) -> dict:
    created = 0
    updated = 0
    errors = []
    for item in data:
        try:
            title = _safe(str(item.get('title') or ''), 255)
            description = _safe(str(item.get('description') or ''), 10000)
            category = _safe(str(item.get('category') or ''), 100)
            deal = _safe(str(item.get('deal') or 'sale'), 50)
            status = item.get('status') or 'draft'
            if status not in ('active', 'archived', 'draft'):
                status = 'draft'
            price = int(float(item.get('price') or 0))
            area = float(item.get('area') or 0) if item.get('area') else 'NULL'
            city = _safe(str(item.get('city') or ''), 100)
            district = _safe(str(item.get('district') or ''), 100)
            address = _safe(str(item.get('address') or ''), 500)
            seo_title = _safe(str(item.get('seo_title') or ''), 120)
            seo_description = _safe(str(item.get('seo_description') or ''), 300)
            tags = _safe(str(item.get('tags') or ''), 1000)

            area_val = f"{area}" if isinstance(area, float) else 'NULL'

            cur.execute(
                f"INSERT INTO {SCHEMA}.listings "
                f"(title, description, category, deal, price, area, city, district, address, "
                f"status, seo_title, seo_description, tags, created_at, updated_at) "
                f"VALUES ('{title}', '{description}', '{category}', '{deal}', {price}, "
                f"{area_val}, '{city}', '{district}', '{address}', '{status}', "
                f"'{seo_title}', '{seo_description}', '{tags}', NOW(), NOW())"
            )
            created += 1
        except Exception as e:
            errors.append(str(e)[:100])
    conn.commit()
    return {'created': created, 'updated': updated, 'errors': errors}


def _import_contacts(cur, conn, data: list) -> dict:
    created = 0
    errors = []
    for item in data:
        try:
            name = _safe(str(item.get('name') or ''), 100)
            phone = _safe(str(item.get('phone') or ''), 30)
            email = _safe(str(item.get('email') or ''), 100)
            message = _safe(str(item.get('message') or ''), 2000)
            source = _safe(str(item.get('source') or 'import'), 50)
            listing_id = item.get('listing_id')
            lid_val = int(listing_id) if listing_id else 'NULL'

            cur.execute(
                f"INSERT INTO {SCHEMA}.leads (name, phone, email, message, source, status, listing_id, created_at) "
                f"VALUES ('{name}', '{phone}', '{email}', '{message}', '{source}', 'new', {lid_val}, NOW())"
            )
            created += 1
        except Exception as e:
            errors.append(str(e)[:100])
    conn.commit()
    return {'created': created, 'errors': errors}


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
    qs = event.get('queryStringParameters') or {}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    action = qs.get('action') or body.get('action') or 'stats'
    export_type = qs.get('type') or body.get('type') or 'all'

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] != 'admin':
                return _err(403, 'Только для администратора')

            # --- Статистика ---
            if action == 'stats':
                cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings")
                listings_count = cur.fetchone()['c']
                cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads")
                contacts_count = cur.fetchone()['c']
                cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE status = 'active'")
                active_count = cur.fetchone()['c']
                now = datetime.now(timezone.utc).isoformat()
                return _ok({
                    'listings_total': listings_count,
                    'listings_active': active_count,
                    'contacts_total': contacts_count,
                    'generated_at': now,
                })

            # --- Экспорт ---
            if action == 'export':
                result = {'exported_at': datetime.now(timezone.utc).isoformat(), 'version': '1.0'}
                if export_type in ('listings', 'all'):
                    result['listings'] = _export_listings(cur)
                if export_type in ('contacts', 'all'):
                    result['contacts'] = _export_contacts(cur)
                if export_type in ('settings', 'all'):
                    result['settings'] = _export_settings(cur)
                return _ok(result)

            # --- Импорт ---
            if action == 'import':
                import_type = body.get('type') or 'listings'
                data = body.get('data') or []
                if not isinstance(data, list):
                    return _err(400, 'data должен быть массивом')
                if len(data) > 1000:
                    return _err(400, 'Максимум 1000 записей за раз')

                if import_type == 'listings':
                    result = _import_listings(cur, conn, data, user['id'])
                    return _ok({'ok': True, **result})
                if import_type == 'contacts':
                    result = _import_contacts(cur, conn, data)
                    return _ok({'ok': True, **result})
                return _err(400, f'Неизвестный тип импорта: {import_type}')

    finally:
        conn.close()

    return _err(400, 'Неизвестное действие')
