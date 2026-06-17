"""
Проверка недвижимости, собственников и компаний через внешние API.
Источники: bezopasno.org, newdb.net, zachestnyibiznesapi.ru, DaData (ИНН/ОГРН).
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
        'dadata': os.environ.get('DADATA_API_KEY', ''),
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
    # DaData — всегда из env (секрет платформы)
    if not keys['dadata']:
        keys['dadata'] = os.environ.get('DADATA_API_KEY', '')
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
    """
    Официальный API zachestnyibiznesapi.ru.
    /paid/data/card — универсальный endpoint для ООО и ИП.
    ИНН 10 цифр = юрлицо, 12 цифр = ИП.
    """
    inn_clean = ''.join(filter(str.isdigit, str(inn)))
    url = f"https://zachestnyibiznesapi.ru/paid/data/card?api_key={api_key}&id={inn_clean}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'BizNest CRM/1.0', 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = json.loads(resp.read().decode())
            # Нормализуем ответ: вытаскиваем body[0] если массив
            body = raw.get('body', raw)
            if isinstance(body, list) and body:
                item = body[0]
            elif isinstance(body, dict):
                item = body
            else:
                return {'error': 'Пустой ответ от API', '_raw': raw}

            # Определяем тип: ИП или ООО
            entity_type = 'ip' if len(inn_clean) == 12 else 'ul'

            # Нормализованная карточка с ключевыми полями
            card = {
                '_type': entity_type,
                '_source': 'zachestnyibiznes',
                'inn': inn_clean,
                'ogrn': item.get('ОГРН') or item.get('ogrn', ''),
                'name': (item.get('НаимЮЛСокр') or item.get('НаимЮЛПолн')
                         or item.get('ФИОПолн') or item.get('name', '')),
                'status': item.get('Активность') or item.get('СтатусЮЛ') or item.get('status', ''),
                'address': (item.get('АдресЮЛСтр') or item.get('Адрес') or item.get('address', '')),
                'okved': item.get('КодОКВЭД') or item.get('okved', ''),
                'okved_name': item.get('НаимОКВЭД') or '',
                'reg_date': item.get('ДатаРег') or item.get('reg_date', ''),
                'liquidation_date': item.get('ДатаПрекр') or '',
                'employees': item.get('СрЧисРаб') or item.get('ЧисРаб') or '',
                'capital': item.get('СумКап') or '',
                'tax_system': item.get('СистемаНалогообложения') or '',
                'risk_score': item.get('Риск') or item.get('risk', ''),
                '_raw': item,
            }

            # Для ИП — руководитель = само лицо
            if entity_type == 'ip':
                card['director'] = item.get('ФИОПолн') or item.get('name', '')
            else:
                card['director'] = (item.get('РуководительФИО') or item.get('ФИОРук')
                                    or item.get('director', ''))
                card['director_post'] = item.get('РуководительДолжн') or ''

            return card
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


# ── NewDB v2 — 12 методов проверки физических лиц ──────────────────────────

NEWDB_V2_BASE = 'https://api.newdb.net/v2'

NEWDB_METHODS = {
    'fssp_person':        'Долги ФССП (исполнительные производства)',
    'passport_fns':       'Паспорт + ИНН через ФНС',
    'passport_mvd':       'Паспорт на действительность (МВД)',
    'complex_by_passport':'Комплексная проверка (МВД+ФНС+ФССП)',
    'bankrot_person':     'Банкротство физлица (ЕФРСБ)',
    'pledge_person':      'Залоги и обременения физлица',
    'arbitr_person':      'Арбитражные дела (КАД)',
    'nalog_debt':         'Налоговая задолженность по ИНН',
    'fns_block_person':   'Блокировки счетов ФНС',
    'egrul_ip':           'Статус ИП (ЕГРИП)',
    'terrorist':          'Проверка по спискам террористов/экстремистов',
    'elmk_registry':      'Электронная медкнижка (ЭЛМК)',
}

# Параметры для каждого метода (что нужно передать)
NEWDB_METHOD_PARAMS = {
    'fssp_person':         ['lastname', 'firstname', 'secondname', 'dob'],
    'passport_fns':        ['seria', 'number', 'lastname', 'firstname', 'secondname', 'dob'],
    'passport_mvd':        ['seria', 'number', 'lastname', 'firstname', 'secondname'],
    'complex_by_passport': ['seria', 'number', 'lastname', 'firstname', 'secondname', 'dob'],
    'bankrot_person':      ['lastname', 'firstname', 'secondname', 'dob'],
    'pledge_person':       ['lastname', 'firstname', 'secondname', 'dob'],
    'arbitr_person':       ['inn'],
    'nalog_debt':          ['inn'],
    'fns_block_person':    ['inn'],
    'egrul_ip':            ['inn'],
    'terrorist':           ['lastname', 'firstname', 'secondname'],
    'elmk_registry':       ['lastname', 'firstname', 'secondname', 'dob'],
}


def fetch_newdb_balance(api_key: str) -> dict:
    """Запрашивает баланс и лимиты аккаунта NewDB через GET /v2/balance."""
    if not api_key:
        return {'error': 'Ключ не настроен'}
    req = urllib.request.Request(
        f'{NEWDB_V2_BASE}/balance',
        headers={
            'X-API-KEY': api_key,
            'User-Agent': 'BizNest CRM/1.0',
        },
        method='GET',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {'error': f'HTTP {e.code}'}
    except Exception as e:
        return {'error': str(e)[:200]}


def fetch_newdb_v2(method: str, params: dict, api_key: str) -> dict:
    """Вызывает NewDB API v2 для конкретного метода проверки физлица."""
    if method not in NEWDB_METHODS:
        return {'error': f'Неизвестный метод: {method}'}
    if not api_key:
        return {'error': 'NEWDB_API_KEY не настроен'}

    payload = json.dumps({'method': method, **params}, ensure_ascii=False).encode()
    req = urllib.request.Request(
        NEWDB_V2_BASE,
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'X-API-KEY': api_key,
            'User-Agent': 'BizNest CRM/1.0',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = json.loads(resp.read().decode())
        return {'method': method, 'label': NEWDB_METHODS[method], 'data': raw}
    except urllib.error.HTTPError as e:
        body_err = e.read().decode()[:300]
        return {'method': method, 'error': f'HTTP {e.code}: {body_err}'}
    except Exception as e:
        return {'method': method, 'error': str(e)[:200]}


def fetch_bezopasno(query, api_key):
    encoded = urllib.parse.quote(query)
    url = f"https://api.bezopasno.org/check?q={encoded}&key={api_key}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'BizNest CRM/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {'error': str(e)}


def fetch_dadata(inn: str, api_key: str, secret_key: str = '') -> dict:
    """Проверка компании или ИП по ИНН через DaData API (party endpoint)."""
    inn_clean = ''.join(filter(str.isdigit, str(inn)))
    if not inn_clean:
        return {'error': 'ИНН не указан или некорректен'}
    if not api_key:
        return {'error': 'DaData API-ключ не настроен'}

    url = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party'
    payload = json.dumps({'query': inn_clean, 'count': 1}, ensure_ascii=False).encode()
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': f'Token {api_key}',
    }
    if secret_key:
        headers['X-Secret'] = secret_key

    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = json.loads(resp.read().decode())

        suggestions = raw.get('suggestions') or []
        if not suggestions:
            return {'error': 'Компания не найдена в реестре DaData', '_raw': raw}

        s = suggestions[0]
        data = s.get('data') or {}
        state = data.get('state') or {}
        name_obj = data.get('name') or {}
        addr = data.get('address') or {}
        mgmt = data.get('management') or {}
        opf = data.get('opf') or {}

        status_map = {'ACTIVE': 'Действует', 'LIQUIDATING': 'В процессе ликвидации', 'LIQUIDATED': 'Ликвидирована', 'BANKRUPT': 'Банкрот', 'REORGANIZING': 'Реорганизация'}
        status_code = state.get('status') or ''

        card = {
            '_type': 'ip' if data.get('type') == 'INDIVIDUAL' else 'ul',
            '_source': 'dadata',
            'inn': data.get('inn') or inn_clean,
            'ogrn': data.get('ogrn') or '',
            'kpp': data.get('kpp') or '',
            'name': name_obj.get('short_with_opf') or name_obj.get('full_with_opf') or s.get('value') or '',
            'name_full': name_obj.get('full_with_opf') or '',
            'opf': opf.get('short') or '',
            'status': status_map.get(status_code, status_code),
            'status_code': status_code,
            'address': (addr.get('value') or '').strip(),
            'reg_date': state.get('registration_date') or '',
            'liquidation_date': state.get('liquidation_date') or '',
            'okved': data.get('okved') or '',
            'okved_name': (data.get('okved_type') or {}).get('name') if isinstance(data.get('okved_type'), dict) else '',
            'employees': data.get('employee_count') or '',
            'capital': (data.get('finance') or {}).get('tax_system') or '',
            'director': mgmt.get('name') or '',
            'director_post': mgmt.get('post') or '',
            'phones': [p.get('value') for p in (data.get('phones') or []) if p.get('value')],
            'emails': [e.get('value') for e in (data.get('emails') or []) if e.get('value')],
            'is_liquidated': status_code in ('LIQUIDATED', 'BANKRUPT'),
            'is_active': status_code == 'ACTIVE',
            '_raw': data,
        }
        return card
    except urllib.error.HTTPError as e:
        body_err = e.read().decode()[:200]
        return {'error': f'DaData HTTP {e.code}: {body_err}'}
    except Exception as e:
        return {'error': str(e)[:200]}


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

    if method == 'GET' and qs.get('action') == 'newdb_balance':
        api_key = (check_keys or {}).get('newdb', '')
        if not api_key:
            return err('NewDB ключ не настроен', 400)
        balance = fetch_newdb_balance(api_key)
        return ok({'balance': balance})

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

    # ── Ping / проверка ключей из настроек ───────────────────────────────────
    if method == 'POST' and body.get('check_type') == 'ping':
        source = (body.get('sources') or [''])[0]
        temp_key = body.get('api_key', '').strip()
        # Используем переданный ключ или из настроек
        api_key = temp_key or (check_keys or {}).get(source, '')
        if not api_key:
            return ok({'results': {source: {'error': 'API-ключ не введён', 'from_cache': False}}})

        if source == 'newdb':
            # Проверяем через NewDB v2 — простой GET на balance/info
            ping_result = fetch_newdb_v2('fssp_person', {'lastname': 'Тест'}, api_key)
            # Ключ рабочий если нет auth-ошибки (400/422 — ок, это значит ключ принят)
            is_auth_error = 'HTTP 401' in str(ping_result.get('error', '')) or 'HTTP 403' in str(ping_result.get('error', '')) or 'unauthorized' in str(ping_result.get('error', '')).lower()
            if is_auth_error:
                return ok({'results': {source: {'error': 'Неверный API-ключ', 'from_cache': False}}})
            return ok({'results': {source: {'message': 'Ключ принят NewDB API', 'from_cache': False}}})

        elif source == 'zachestny':
            try:
                test_url = f"https://zachestnyibiznesapi.ru/paid/data/card?api_key={api_key}&id=7707083893"
                req = urllib.request.Request(test_url, headers={'User-Agent': 'BizNest CRM/1.0', 'Accept': 'application/json'})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    d = json.loads(resp.read().decode())
                if d.get('status') == 'error' and 'key' in str(d.get('message', '')).lower():
                    return ok({'results': {source: {'error': d.get('message', 'Неверный ключ'), 'from_cache': False}}})
                return ok({'results': {source: {'message': 'Ключ принят', 'from_cache': False}}})
            except Exception as e:
                return ok({'results': {source: {'error': str(e)[:100], 'from_cache': False}}})

        elif source == 'bezopasno':
            try:
                test_url = f"https://api.bezopasno.org/check?q=test&key={api_key}"
                req = urllib.request.Request(test_url, headers={'User-Agent': 'BizNest CRM/1.0'})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    json.loads(resp.read().decode())
                return ok({'results': {source: {'message': 'Ключ принят', 'from_cache': False}}})
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    return ok({'results': {source: {'error': 'Неверный API-ключ', 'from_cache': False}}})
                return ok({'results': {source: {'message': 'Ключ принят', 'from_cache': False}}})
            except Exception as e:
                return ok({'results': {source: {'error': str(e)[:100], 'from_cache': False}}})

        return ok({'results': {source: {'error': 'Неизвестный источник', 'from_cache': False}}})

    # ── NewDB v2 — прямой вызов конкретного метода ───────────────────────────
    if method == 'GET' and qs.get('action') == 'newdb_methods':
        return ok({'methods': [
            {'id': k, 'label': v, 'params': NEWDB_METHOD_PARAMS.get(k, [])}
            for k, v in NEWDB_METHODS.items()
        ]})

    if method == 'POST' and body.get('action') == 'newdb_v2':
        newdb_method = body.get('method', '')
        params = {k: v for k, v in body.items() if k not in ('action', 'method')}
        api_key = (check_keys or {}).get('newdb', '')
        cache_key = make_cache_key(f'newdb_v2_{newdb_method}', json.dumps(params, sort_keys=True))
        if not body.get('force_refresh'):
            cached = get_cached(conn, f'newdb_v2_{newdb_method}', cache_key, 'newdb')
            if cached:
                return ok({'result': cached, 'from_cache': True, 'method': newdb_method})
        result = fetch_newdb_v2(newdb_method, params, api_key)
        if 'error' not in result:
            save_cache(conn, f'newdb_v2_{newdb_method}', cache_key, 'newdb', result, user['id'])
            inc_quota(conn, 'newdb')
        return ok({'result': result, 'from_cache': False, 'method': newdb_method})

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
        elif source == 'dadata':
            secret = os.environ.get('DADATA_SECRET_KEY', '')
            data = fetch_dadata(query, api_key, secret)
        else:
            data = {'error': 'Неизвестный источник'}

        if 'error' not in data:
            save_cache(conn, check_type, cache_key, source, data, user['id'])
            inc_quota(conn, source)

        results[source] = {'data': data, 'from_cache': False}

    return ok({'query': query, 'check_type': check_type, 'results': results})