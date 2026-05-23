"""
Проверка недвижимости, собственников и компаний через внешние API.
Источники: bezopasno.org, newdb.net, zachestnyibiznesapi.ru
Кэширование на 30 дней, учёт квот запросов.
"""
import json
import os
import hashlib
import psycopg2
import urllib.request
import urllib.parse


CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
}

ALLOWED_ROLES = ('admin', 'director', 'broker', 'office_manager', 'manager')


SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 'public')


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def _load_check_keys(conn):
    """Читает API-ключи сервисов проверки из таблицы settings; fallback на os.environ."""
    keys = {
        'zachestny': os.environ.get('ZACHESTNY_API_KEY', ''),
        'newdb': os.environ.get('NEWDB_API_KEY', ''),
        'bezopasno': os.environ.get('BEZOPASNO_API_KEY', ''),
    }
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT zachestny_api_key, newdb_api_key, bezopasno_api_key "
            f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            if row[0] and row[0].strip():
                keys['zachestny'] = row[0].strip()
            if row[1] and row[1].strip():
                keys['newdb'] = row[1].strip()
            if row[2] and row[2].strip():
                keys['bezopasno'] = row[2].strip()
    except Exception:
        pass
    return keys


def ok(data):
    return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps(data, default=str)}


def err(msg, status=400):
    return {'statusCode': status, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg})}


def get_user(token, conn):
    if not token:
        return None
    cur = conn.cursor()
    cur.execute(
        "SELECT u.id, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = TRUE",
        (token,)
    )
    row = cur.fetchone()
    return {'id': row[0], 'name': row[1], 'role': row[2]} if row else None


def make_cache_key(check_type, query):
    return hashlib.md5(f"{check_type}:{query}".encode()).hexdigest()


def get_cached(conn, check_type, query_key, source):
    cur = conn.cursor()
    cur.execute(
        "SELECT result FROM crm_checks_cache WHERE check_type=%s AND query_key=%s AND source=%s AND expires_at > NOW()",
        (check_type, query_key, source)
    )
    row = cur.fetchone()
    return row[0] if row else None


def save_cache(conn, check_type, query_key, source, result, user_id):
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO crm_checks_cache (check_type, query_key, source, result, requested_by) "
        "VALUES (%s,%s,%s,%s,%s) ON CONFLICT (check_type, query_key, source) DO UPDATE "
        "SET result=%s, created_at=NOW(), expires_at=NOW() + INTERVAL '30 days'",
        (check_type, query_key, source, json.dumps(result), user_id, json.dumps(result))
    )


def check_quota(conn, source):
    cur = conn.cursor()
    cur.execute("SELECT requests_used, requests_limit FROM crm_api_quota WHERE source=%s", (source,))
    row = cur.fetchone()
    if not row:
        return True
    return row[0] < row[1]


def inc_quota(conn, source):
    cur = conn.cursor()
    cur.execute(
        "UPDATE crm_api_quota SET requests_used = requests_used + 1, updated_at = NOW() WHERE source = %s",
        (source,)
    )


def fetch_zachestny(inn, api_key):
    url = f"https://zachestnyibiznesapi.ru/paid/data/company?api_key={api_key}&id={inn}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'BizNest CRM/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {'error': str(e)}


def fetch_newdb(query, api_key):
    encoded = urllib.parse.quote(query)
    url = f"https://newdb.net/api/v1/search?q={encoded}&token={api_key}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'BizNest CRM/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {'error': str(e)}


def fetch_bezopasno(query, api_key):
    encoded = urllib.parse.quote(query)
    url = f"https://api.bezopasno.org/check?q={encoded}&key={api_key}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'BizNest CRM/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {'error': str(e)}


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    token = event.get('headers', {}).get('x-auth-token') or event.get('headers', {}).get('X-Auth-Token')
    method = event.get('httpMethod', 'GET')
    qs = event.get('queryStringParameters') or {}
    body = json.loads(event['body']) if event.get('body') else {}

    conn = get_conn()
    user = get_user(token, conn)

    if not user or user['role'] not in ALLOWED_ROLES:
        conn.close()
        return err('Нет доступа', 403)

    try:
        check_keys = _load_check_keys(conn)
        result = run_check(conn, user, method, qs, body, check_keys)
        conn.commit()
        return result
    except Exception as e:
        conn.rollback()
        return err(str(e), 500)
    finally:
        conn.close()


def run_check(conn, user, method, qs, body, check_keys=None):
    cur = conn.cursor()

    if method == 'GET' and qs.get('action') == 'status':
        return ok({
            'zachestny': bool((check_keys or {}).get('zachestny')),
            'newdb': bool((check_keys or {}).get('newdb')),
            'bezopasno': bool((check_keys or {}).get('bezopasno')),
        })

    if method == 'GET' and qs.get('action') == 'quota':
        cur.execute("SELECT source, requests_used, requests_limit FROM crm_api_quota ORDER BY source")
        rows = cur.fetchall()
        return ok([{'source': r[0], 'used': r[1], 'limit': r[2], 'percent': round(r[1]/r[2]*100 if r[2] else 0)} for r in rows])

    if method == 'GET' and qs.get('action') == 'history':
        search = (qs.get('search') or '').strip()
        check_type_filter = (qs.get('check_type') or '').strip()
        limit = min(int(qs.get('limit', 50)), 200)

        where_parts = ['c.expires_at > NOW()']
        params = []
        if check_type_filter:
            where_parts.append('c.check_type = %s')
            params.append(check_type_filter)
        # Поиск по результату (JSON text)
        if search:
            where_parts.append("c.result::text ILIKE %s")
            params.append(f'%{search}%')

        where_sql = 'WHERE ' + ' AND '.join(where_parts)

        # Группируем по query_key+check_type — одна запись = один запрос (по всем источникам)
        cur.execute(
            f"SELECT c.check_type, c.query_key, "
            f"       array_agg(DISTINCT c.source) as sources, "
            f"       MAX(c.created_at) as last_check, "
            f"       MAX(u.name) as user_name "
            f"FROM crm_checks_cache c LEFT JOIN users u ON u.id = c.requested_by "
            f"{where_sql} "
            f"GROUP BY c.check_type, c.query_key "
            f"ORDER BY last_check DESC LIMIT %s",
            params + [limit]
        )
        rows = cur.fetchall()
        return ok([
            {'check_type': r[0], 'query_key': r[1], 'sources': list(r[2] or []),
             'created_at': r[3], 'user': r[4]}
            for r in rows
        ])

    if method == 'GET' and qs.get('action') == 'cached':
        # Получить кэшированный результат по ключу из истории
        check_type = qs.get('check_type', '')
        query_key = qs.get('query_key', '')
        if not check_type or not query_key:
            return err('Укажите check_type и query_key')
        cur.execute(
            "SELECT source, result, created_at FROM crm_checks_cache "
            "WHERE check_type=%s AND query_key=%s AND expires_at > NOW() "
            "ORDER BY created_at DESC",
            (check_type, query_key)
        )
        rows = cur.fetchall()
        return ok({
            'results': {r[0]: {'data': r[1], 'from_cache': True, 'cached_at': r[2]} for r in rows}
        })

    if method != 'POST':
        return err('Метод не поддерживается')

    check_type = body.get('check_type')
    query = body.get('query', '').strip()
    sources = body.get('sources', ['zachestny', 'newdb', 'bezopasno'])
    force_refresh = body.get('force_refresh', False)

    if not check_type or not query:
        return err('Укажите check_type и query')

    cache_key = make_cache_key(check_type, query)
    results = {}

    for source in sources:
        if not force_refresh:
            cached = get_cached(conn, check_type, cache_key, source)
            if cached:
                results[source] = {'data': cached, 'from_cache': True}
                continue

        if not check_quota(conn, source):
            results[source] = {'error': 'Лимит запросов исчерпан', 'from_cache': False}
            continue

        api_key = (check_keys or {}).get(source, '')

        if not api_key:
            results[source] = {'error': 'API-ключ не настроен', 'from_cache': False}
            continue

        if source == 'zachestny':
            data = fetch_zachestny(query, api_key)
        elif source == 'newdb':
            data = fetch_newdb(query, api_key)
        elif source == 'bezopasno':
            data = fetch_bezopasno(query, api_key)
        else:
            data = {'error': 'Неизвестный источник'}

        if 'error' not in data:
            save_cache(conn, check_type, cache_key, source, data, user['id'])
            inc_quota(conn, source)

        results[source] = {'data': data, 'from_cache': False}

    return ok({'query': query, 'check_type': check_type, 'results': results})