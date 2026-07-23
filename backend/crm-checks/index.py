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
        'checko': os.environ.get('CHECKO_API_KEY', ''),
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
    if not keys['dadata']:
        keys['dadata'] = os.environ.get('DADATA_API_KEY', '')
    if not keys['checko']:
        keys['checko'] = os.environ.get('CHECKO_API_KEY', '')
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
    if not inn_clean:
        return {'error': 'Номер не указан или некорректен'}
    if len(inn_clean) not in (10, 12, 13, 15):
        return {'error': f'Некорректная длина номера: {len(inn_clean)} цифр (ИНН — 10/12, ОГРН — 13, ОГРНИП — 15)'}
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

            # Определяем тип: ИП (ИНН 12 цифр или ОГРНИП 15 цифр) или ООО
            entity_type = 'ip' if len(inn_clean) in (12, 15) else 'ul'

            # Нормализованная карточка с ключевыми полями
            card = {
                '_type': entity_type,
                '_source': 'zachestnyibiznes',
                'inn': inn_clean if len(inn_clean) in (10, 12) else (item.get('ИНН') or ''),
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
            raw = json.loads(resp.read().decode())
        # Убираем токен из ответа — не должен светиться во фронтенде
        HIDDEN_FIELDS = {'token', 'api_key', 'key', 'secret', 'password', 'access_token'}
        cleaned = {k: v for k, v in raw.items() if k.lower() not in HIDDEN_FIELDS}
        return cleaned
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
    """
    Проверка компании или ИП через DaData API (party endpoint).
    Поддерживает ИНН (10/12 цифр) и ОГРН (13 цифр). ОГРНИП (15 цифр) DaData не ищет — для него
    нужен ИНН предпринимателя (используйте Checko или ЧестныйБизнес).
    """
    inn_clean = ''.join(filter(str.isdigit, str(inn)))
    if not inn_clean:
        return {'error': 'ИНН не указан или некорректен'}
    if len(inn_clean) == 15:
        return {'error': 'DaData не поддерживает поиск по ОГРНИП — используйте Checko или ЧестныйБизнес'}
    if len(inn_clean) not in (10, 12, 13):
        return {'error': f'Некорректная длина номера: {len(inn_clean)} цифр (ИНН — 10/12, ОГРН — 13)'}
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
        addr_data = addr.get('data') if isinstance(addr, dict) else None
        if not isinstance(addr_data, dict):
            addr_data = {}
        mgmt = data.get('management') or {}
        opf = data.get('opf') or {}
        finance = data.get('finance') or {}

        status_map = {
            'ACTIVE':       'Действует',
            'LIQUIDATING':  'В процессе ликвидации',
            'LIQUIDATED':   'Ликвидирована',
            'BANKRUPT':     'Банкрот',
            'REORGANIZING': 'Реорганизация',
        }
        status_code = state.get('status') or ''

        # Учредители
        founders_raw = data.get('founders') or []
        founders = []
        for f in founders_raw:
            fio = (f.get('fio') or {})
            name_f = (f.get('name') or
                      ' '.join(filter(None, [fio.get('surname'), fio.get('name'), fio.get('patronymic')])) or '')
            share = (f.get('share') or {})
            share_str = ''
            if share.get('percent'):
                share_str = f"{share['percent']}%"
            founders.append({'name': name_f, 'share': share_str, 'inn': f.get('inn') or ''})

        # Лицензии
        licenses_raw = data.get('licenses') or []
        licenses = []
        for lic in licenses_raw:
            licenses.append({
                'activity': lic.get('activity') or '',
                'series': lic.get('series') or '',
                'num': lic.get('num') or '',
                'date': lic.get('date') or '',
                'date_end': lic.get('date_end') or '',
                'authority': lic.get('authority') or '',
                'status': lic.get('status') or '',
            })

        # Финансы за последний год
        fin_year   = finance.get('year') or ''
        fin_income = finance.get('income') or ''
        fin_expense= finance.get('expense') or ''
        fin_profit = finance.get('profit') or ''
        fin_debt   = finance.get('debt') or ''
        fin_penalty= finance.get('penalty') or ''
        ustavcap   = finance.get('ustavcap') or data.get('authorized_capital') or ''

        card = {
            '_type':             'ip' if data.get('type') == 'INDIVIDUAL' else 'ul',
            '_source':           'dadata',
            'inn':               data.get('inn') or inn_clean,
            'ogrn':              data.get('ogrn') or '',
            'kpp':               data.get('kpp') or '',
            'name':              name_obj.get('short_with_opf') or name_obj.get('full_with_opf') or s.get('value') or '',
            'name_full':         name_obj.get('full_with_opf') or '',
            'opf':               opf.get('short') or '',
            'status':            status_map.get(status_code, status_code),
            'status_code':       status_code,
            'address':           (addr.get('value') or '').strip(),
            'address_postal':    addr_data.get('postal_code') or '',
            'address_region':    addr_data.get('region_with_type') or '',
            'reg_date':          state.get('registration_date') or '',
            'liquidation_date':  state.get('liquidation_date') or '',
            'okved':             data.get('okved') or '',
            'okved_name':        (data.get('okved_type') or {}).get('name') if isinstance(data.get('okved_type'), dict) else '',
            'employees':         data.get('employee_count') or '',
            'ustavcap':          ustavcap,
            'tax_system':        finance.get('tax_system') or '',
            'director':          mgmt.get('name') or '',
            'director_post':     mgmt.get('post') or '',
            'branch_type':       data.get('branch_type') or '',
            'branch_count':      data.get('branch_count') or '',
            'phones':            [p.get('value') for p in (data.get('phones') or []) if p.get('value')],
            'emails':            [e.get('value') for e in (data.get('emails') or []) if e.get('value')],
            'founders':          founders,
            'licenses':          licenses,
            'finance': {
                'year':    fin_year,
                'income':  fin_income,
                'expense': fin_expense,
                'profit':  fin_profit,
                'debt':    fin_debt,
                'penalty': fin_penalty,
            } if any([fin_year, fin_income, fin_expense, fin_profit]) else None,
            'is_liquidated':     status_code in ('LIQUIDATED', 'BANKRUPT'),
            'is_active':         status_code == 'ACTIVE',
        }
        return card
    except urllib.error.HTTPError as e:
        body_err = e.read().decode()[:200]
        return {'error': f'DaData HTTP {e.code}: {body_err}'}
    except Exception as e:
        return {'error': str(e)[:200]}


def fetch_checko(inn: str, api_key: str) -> dict:
    """
    Проверка компании или ИП через Checko.ru API — полные данные ЕГРЮЛ/ЕГРИП.
    Принимает ИНН (10/12 цифр), ОГРН (13 цифр) или ОГРНИП (15 цифр) — определяет тип по длине
    и обращается к нужному эндпоинту (/v2/company или /v2/entrepreneur для ОГРНИП).
    """
    num_clean = ''.join(filter(str.isdigit, str(inn)))
    if not num_clean:
        return {'error': 'Номер не указан или некорректен'}
    if len(num_clean) not in (10, 12, 13, 15):
        return {'error': f'Некорректная длина номера: {len(num_clean)} цифр (ИНН — 10/12, ОГРН — 13, ОГРНИП — 15)'}
    if not api_key:
        return {'error': 'Checko API-ключ не настроен'}

    key_q = urllib.parse.quote(api_key)
    if len(num_clean) == 15:
        url = f'https://api.checko.ru/v2/entrepreneur?key={key_q}&ogrn={num_clean}'
    elif len(num_clean) == 13:
        url = f'https://api.checko.ru/v2/company?key={key_q}&ogrn={num_clean}'
    else:
        url = f'https://api.checko.ru/v2/company?key={key_q}&inn={num_clean}'
    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'BizNest CRM/1.0', 'Accept': 'application/json'},
            method='GET',
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = json.loads(resp.read().decode())

        d_keys = list((raw.get("data") or {}).keys())
        print(f'[checko] raw keys: {d_keys}')
        # Логируем структуру ключевых полей для диагностики
        for debug_key in ['Надежность', 'Оценка', 'НалРежим', 'Налоги', 'Финансы', 'Санкции', 'РМСП', 'СЧР', 'ОКПО', 'Контакты', 'Руковод', 'Учред']:
            val = (raw.get('data') or {}).get(debug_key)
            if val is not None:
                print(f'[checko] {debug_key}: {json.dumps(val, ensure_ascii=False, default=str)[:300]}')

        meta = raw.get('meta', {})
        data = raw.get('data')

        if not data:
            msg = raw.get('message') or raw.get('error') or 'Компания не найдена'
            return {'error': msg, '_meta': meta}

        # ── Реальные ключи Checko API ─────────────────────────────────────────
        # НаимСокр, НаимПолн, Статус, ЮрАдрес, ОКВЭД, ОКВЭДДоп
        # Руковод, Учред, Контакты, Налоги, РМСП, СЧР, Лиценз, ТоварЗнак
        # НедобПост, МассРуковод, МассУчред, ДисквЛица, Санкции, НелегалФин, СанкцУчр, ЕФРСБ

        # Статус
        status_raw = data.get('Статус') or {}
        if isinstance(status_raw, dict):
            status_text = status_raw.get('Название') or status_raw.get('Текст') or str(status_raw)
            status_code = status_raw.get('Код') or ''
        else:
            status_text = str(status_raw)
            status_code = ''
        is_active = 'действу' in status_text.lower() or status_code in ('1', 'ACTIVE', 'active')
        is_liquidated = any(w in status_text.lower() for w in ('ликвид', 'банкрот'))
        is_ip = bool(data.get('ОГРНИП'))

        # ── Руководитель (Руковод — список) ──────────────────────────────────
        rukovod = data.get('Руковод') or []
        if isinstance(rukovod, dict):
            rukovod = [rukovod]
        director_fio = director_post = director_inn = ''
        director_mass = False
        directors_history = []
        for d in rukovod:
            fio   = d.get('ФИО') or ''
            post  = d.get('НаимДолжн') or d.get('ВидДолжн') or ''
            inn_d = d.get('ИНН') or ''
            mass  = bool(d.get('МассРуковод'))
            diskv = bool(d.get('ДисквЛицо'))
            date_from = d.get('ДатаНач') or ''
            date_to   = d.get('ДатаКон') or ''
            if not director_fio and fio:
                director_fio  = fio
                director_post = post
                director_inn  = inn_d
                director_mass = mass
            if fio:
                directors_history.append({
                    'фио': fio, 'должность': post, 'инн': inn_d,
                    'с': date_from, 'по': date_to,
                    'массовый': mass, 'дисквалифицирован': diskv,
                })

        # ── Учредители (Учред = {ФЛ: [...], ЮЛ: [...]}) ─────────────────────
        uchred_raw = data.get('Учред') or {}
        founders = []
        fl_list = uchred_raw.get('ФЛ', []) if isinstance(uchred_raw, dict) else []
        ul_list = uchred_raw.get('ЮЛ', []) if isinstance(uchred_raw, dict) else []
        if isinstance(uchred_raw, list):
            fl_list = uchred_raw
        for f in fl_list:
            name  = f.get('ФИО') or ''
            inn_f = f.get('ИНН') or ''
            dolja = f.get('Доля') or {}
            nom   = dolja.get('Номинал', '') if isinstance(dolja, dict) else ''
            pct   = dolja.get('Процент', '') if isinstance(dolja, dict) else ''
            date_f = f.get('ДатаВкл') or ''
            if name:
                founders.append({'наименование': name, 'инн': inn_f, 'доля_руб': nom, 'доля_пct': pct, 'с': date_f, 'тип': 'ФЛ'})
        for f in ul_list:
            name  = f.get('НаимСокр') or f.get('НаимПолн') or ''
            ogrn  = f.get('ОГРН') or ''
            inn_f = f.get('ИНН') or ''
            dolja = f.get('Доля') or {}
            nom   = dolja.get('Номинал', '') if isinstance(dolja, dict) else ''
            pct   = dolja.get('Процент', '') if isinstance(dolja, dict) else ''
            date_f = f.get('ДатаВкл') or ''
            if name:
                founders.append({'наименование': name, 'огрн': ogrn, 'инн': inn_f, 'доля_руб': nom, 'доля_пct': pct, 'с': date_f, 'тип': 'ЮЛ'})

        # ── Контакты (Контакты = {Тел: ["+7..."], Емейл: [...], Сайт: [...]}) ─
        kontakty = data.get('Контакты') or {}
        if isinstance(kontakty, list):
            kontakty = {}
        # Тел — список строк
        tels = kontakty.get('Тел') or kontakty.get('Телефоны') or []
        phones = [p if isinstance(p, str) else str(p) for p in tels if p]
        emails_raw = kontakty.get('Емейл') or kontakty.get('Емейлы') or []
        emails = [e if isinstance(e, str) else str(e) for e in emails_raw if e]
        sites_raw = kontakty.get('Сайт') or kontakty.get('Сайты') or []
        sites = [s if isinstance(s, str) else str(s) for s in sites_raw if s]

        # ── Налоги (Налоги = {ОсобРежим: ["УСН"], СведУпл: [...]}) ──────────
        nalogi = data.get('Налоги') or {}
        tax_systems = []
        tax_payments = []
        if isinstance(nalogi, dict):
            # Специальный режим
            osobrezhim = nalogi.get('ОсобРежим') or []
            if isinstance(osobrezhim, str):
                osobrezhim = [osobrezhim]
            tax_systems = [r for r in osobrezhim if r]
            # Суммы уплаченных налогов
            for t in (nalogi.get('СведУпл') or []):
                if isinstance(t, dict):
                    naim = t.get('Наим') or ''
                    summa = t.get('Сумма') or 0
                    if naim:
                        tax_payments.append({'наименование': naim, 'сумма': summa})

        # ── ОКВЭД ────────────────────────────────────────────────────────────
        okved_main = data.get('ОКВЭД') or {}
        okved_code = okved_main.get('Код') or okved_main.get('КодОКВЭД') or '' if isinstance(okved_main, dict) else str(okved_main)
        okved_name_main = okved_main.get('Название') or okved_main.get('НаимОКВЭД') or '' if isinstance(okved_main, dict) else ''

        okved_list = []
        if okved_code:
            okved_list.append({'код': okved_code, 'наименование': okved_name_main, 'основной': True})
        for o in (data.get('ОКВЭДДоп') or []):
            code_o = o.get('Код') or o.get('КодОКВЭД') or '' if isinstance(o, dict) else str(o)
            name_o = o.get('Название') or o.get('НаимОКВЭД') or '' if isinstance(o, dict) else ''
            if code_o:
                okved_list.append({'код': code_o, 'наименование': name_o, 'основной': False})

        # ── Лицензии ─────────────────────────────────────────────────────────
        licenses = []
        for lic in (data.get('Лиценз') or []):
            if isinstance(lic, dict):
                kind = lic.get('ВидДеят') or lic.get('Вид') or lic.get('Наим') or ''
                num  = lic.get('Номер') or lic.get('НомЛиц') or ''
                date_start = lic.get('ДатаНач') or lic.get('ДатаВыд') or ''
                if kind:
                    licenses.append({'вид': kind, 'номер': num, 'с': date_start})

        # ── МСП (РМСП = {Кат: "МИКРОПРЕДПРИЯТИЕ", ДатаВкл: "2024-09-10"}) ────
        rmsp = data.get('РМСП') or {}
        if isinstance(rmsp, dict):
            msp_cat  = rmsp.get('Кат') or rmsp.get('Категория') or rmsp.get('КатСубМСП') or ''
            msp_date = rmsp.get('ДатаВкл') or rmsp.get('Дата') or ''
        else:
            msp_cat = str(rmsp) if rmsp else ''
            msp_date = ''

        # ── Сотрудники (СЧР — число, СЧРГод — год) ───────────────────────────
        schr_val = data.get('СЧР')
        schr_year = data.get('СЧРГод') or ''
        if isinstance(schr_val, dict):
            schr = schr_val.get('Количество') or schr_val.get('Число') or ''
        else:
            schr = schr_val if schr_val is not None else ''

        # ── Финансы ───────────────────────────────────────────────────────────
        finance_raw = data.get('Финансы') or {}
        finance_history = []
        if isinstance(finance_raw, dict):
            for year in sorted(finance_raw.keys(), reverse=True)[:5]:
                f = finance_raw[year]
                if isinstance(f, dict):
                    finance_history.append({
                        'год': year,
                        'выручка': f.get('Выручка') or f.get('ВырОбщ') or f.get('Доход') or '',
                        'прибыль': f.get('ЧистПриб') or f.get('Прибыль') or f.get('ПрибУб') or '',
                        'активы':  f.get('ВалБал') or f.get('Активы') or '',
                        'капитал': f.get('КапРез') or f.get('Капитал') or '',
                    })

        # ── Товарные знаки ────────────────────────────────────────────────────
        trademarks = []
        for tm in (data.get('ТоварЗнак') or []):
            if isinstance(tm, dict):
                name_tm = tm.get('Название') or tm.get('Наим') or tm.get('НаимТЗ') or ''
                reg_date_tm = tm.get('ДатаРег') or tm.get('Дата') or ''
                if name_tm:
                    trademarks.append({'наименование': name_tm, 'дата_рег': reg_date_tm})

        # ── Адрес ────────────────────────────────────────────────────────────
        adr = data.get('ЮрАдрес') or {}
        if isinstance(adr, dict):
            address = adr.get('АдресПолн') or adr.get('Адрес') or adr.get('Значение') or ''
        else:
            address = str(adr) if adr else ''

        # ── Флаги рисков ─────────────────────────────────────────────────────
        risks = []
        risk_flags = [
            ('НедобПост',   'Недобросовестный поставщик',              'danger'),
            ('МассРуковод', 'Массовый руководитель',                    'warning'),
            ('МассУчред',   'Массовый учредитель',                      'warning'),
            ('ДисквЛица',   'Дисквалифицированные лица в руководстве', 'danger'),
            ('Санкции',     'Под санкциями',                            'danger'),
            ('НелегалФин',  'Нелегальная финансовая деятельность',      'danger'),
            ('СанкцУчр',    'Учредители под санкциями',                 'danger'),
            ('ЕФРСБ',       'Сведения о банкротстве (ЕФРСБ)',           'warning'),
        ]
        for key, label, level in risk_flags:
            val = data.get(key)
            if val and val is not False and val != 0 and val != [] and val != {}:
                risks.append({'label': label, 'level': level})

        # ── Санкции ───────────────────────────────────────────────────────────
        # Санкции = false означает «не под санкциями»
        sankc_val    = data.get('Санкции')
        sankc_uchr   = data.get('СанкцУчр')
        net_sankciy  = sankc_val is False or sankc_val is None or sankc_val == 0 or sankc_val == []
        net_svyaz_sankc = sankc_uchr is False or sankc_uchr is None or sankc_uchr == 0 or sankc_uchr == []

        # ── Итоговая карточка ─────────────────────────────────────────────────
        card = {
            '_source': 'checko',
            '_meta': meta,
            'инн': data.get('ИНН') or (num_clean if len(num_clean) in (10, 12) else ''),
            'огрн': data.get('ОГРН') or '',
            'огрнип': data.get('ОГРНИП') or '',
            'кпп': data.get('КПП') or '',
            'окпо': data.get('ОКПО') or '',
            'наименование': data.get('НаимСокр') or data.get('НаимПолн') or '',
            'наименование_полное': data.get('НаимПолн') or '',
            'наименование_англ': data.get('НаимАнгл') or '',
            'опф': (data.get('ОКОПФ') or {}).get('Название') or '' if isinstance(data.get('ОКОПФ'), dict) else '',
            'тип': 'ИП' if is_ip else 'ЮЛ',
            'статус': status_text,
            'статус_код': status_code,
            'действующее': is_active,
            'ликвидировано': is_liquidated,
            'адрес': address,
            'дата_регистрации': data.get('ДатаОГРН') or data.get('ДатаРег') or '',
            'дата_ликвидации': '',
            'оквэд_основной': okved_code,
            'оквэд_наим': okved_name_main,
            'оквэд_список': okved_list,
            'сотрудников': str(schr) if schr != '' else '',
            'сотрудников_год': str(schr_year),
            'уст_капитал': data.get('УстКап') or '',
            'директор_фио': director_fio,
            'директор_должность': director_post,
            'директор_инн': director_inn,
            'директор_массовый': director_mass,
            'директора_история': directors_history,
            'учредители': founders,
            'телефоны': phones,
            'email': emails,
            'сайты': sites,
            'лицензии': licenses,
            'налог_режим': tax_systems,
            'налог_уплачено': tax_payments,
            'мсп_категория': msp_cat,
            'мсп_дата': msp_date,
            'товарные_знаки': trademarks,
            'финансы': finance_history,
            'риски': risks,
            'санкции_нет': net_sankciy,
            'санкции_связи_нет': net_svyaz_sankc,
            'запросов_сегодня': meta.get('today_request_count', 0),
            'запросов_остаток': meta.get('remaining') if 'remaining' in meta else None,
        }
        return card

    except urllib.error.HTTPError as e:
        body_err = e.read().decode()[:300]
        return {'error': f'Checko HTTP {e.code}: {body_err}'}
    except Exception as e:
        return {'error': str(e)[:200]}


def fetch_cadastr_by_address(address: str) -> dict:
    """
    Поиск кадастрового номера по адресу через публичное API Росреестра (pkk.rosreestr.ru).
    Шаг 1: геокодируем адрес через DaData → получаем lat/lon.
    Шаг 2: по координатам ищем объект на публичной кадастровой карте.
    Возвращает список найденных объектов с кадастровыми номерами.
    """
    dadata_key = os.environ.get('DADATA_API_KEY', '')
    if not dadata_key:
        return {'error': 'DADATA_API_KEY не настроен', 'found': []}

    # ── Шаг 1: геокодирование адреса через DaData → координаты ───────────────
    try:
        geo_url = 'https://cleaner.dadata.ru/api/v1/clean/address'
        geo_payload = json.dumps([address]).encode('utf-8')
        geo_req = urllib.request.Request(
            geo_url,
            data=geo_payload,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': f'Token {dadata_key}',
                'X-Secret': os.environ.get('DADATA_SECRET_KEY', ''),
            },
            method='POST',
        )
        with urllib.request.urlopen(geo_req, timeout=10) as resp:
            geo_data = json.loads(resp.read().decode())

        if not geo_data or not isinstance(geo_data, list) or not geo_data[0]:
            return {'error': 'Адрес не найден. Уточните запрос.', 'found': []}

        result = geo_data[0]
        lat = result.get('geo_lat')
        lon = result.get('geo_lon')
        geocoded_address = result.get('result') or address

        if not lat or not lon:
            return {'error': 'Не удалось определить координаты адреса. Уточните запрос.', 'found': []}

        lat = float(lat)
        lon = float(lon)
    except Exception as e:
        return {'error': f'Ошибка геокодирования: {str(e)[:150]}', 'found': []}

    # ── Шаг 2: поиск объектов по координатам через Росреестр ──────────────────
    # Параметры: center=[lon,lat], zoom=18, type=1 (здания/помещения)
    try:
        pkk_url = (
            f'https://pkk.rosreestr.ru/api/features/1'
            f'?text={lat}+{lon}'
            f'&tolerance=2&limit=5'
        )
        pkk_req = urllib.request.Request(
            pkk_url,
            headers={
                'User-Agent': 'Mozilla/5.0 (compatible; BizNest CRM/1.0)',
                'Referer': 'https://pkk.rosreestr.ru/',
                'Accept': 'application/json',
            }
        )
        with urllib.request.urlopen(pkk_req, timeout=15) as resp:
            pkk_data = json.loads(resp.read().decode())

        features = pkk_data.get('features') or []
        found = []
        for f in features:
            attrs = f.get('attrs') or {}
            cad_num = attrs.get('cn') or attrs.get('id') or ''
            obj_address = attrs.get('address') or attrs.get('name') or ''
            area = attrs.get('area_value') or ''
            purpose = attrs.get('util_by_doc') or attrs.get('category_type') or ''
            if cad_num:
                found.append({
                    'cadastral_number': cad_num,
                    'address': obj_address,
                    'area': str(area) if area else '',
                    'purpose': purpose,
                })

        if not found:
            return {
                'error': 'Объекты по этому адресу не найдены на кадастровой карте.',
                'found': [],
                'lat': lat,
                'lon': lon,
            }

        return {
            'found': found,
            'lat': lat,
            'lon': lon,
            'geocoded_address': geocoded_address,
        }
    except Exception as e:
        return {'error': f'Ошибка запроса к Росреестру: {str(e)[:150]}', 'found': []}


def _parse_egrn_raw(raw: dict, cadastr_clean: str) -> dict:
    """Парсит сырой ответ api-assist.com/api/egrn-object в структурированные данные."""

    def _str(v):
        return str(v).strip() if v is not None else ''

    def _fmt_cost(v):
        try:
            return f"{float(str(v).replace(',', '.').replace(' ', '')):,.2f} ₽".replace(',', ' ')
        except Exception:
            return _str(v)

    # ── Основные поля ──────────────────────────────────────────────────────────
    # api-assist может вернуть данные в разных ключах
    cad_num   = _str(raw.get('cadastral_number') or raw.get('number') or cadastr_clean)
    address   = _str(raw.get('address') or raw.get('addr') or '')
    area      = _str(raw.get('area') or raw.get('square') or '')
    purpose   = _str(raw.get('purpose') or raw.get('category') or raw.get('type') or '')
    cad_cost  = raw.get('cad_cost') or raw.get('cadastral_cost') or raw.get('cost') or ''
    cad_cost_date = _str(raw.get('cad_cost_det_date') or raw.get('cad_cost_date') or '')
    reg_date  = _str(raw.get('reg_date') or raw.get('registration_date') or '')
    status    = _str(raw.get('status') or '')

    # ── Обременения ────────────────────────────────────────────────────────────
    encumbrances_raw = raw.get('encumbrances') or raw.get('restrictions') or []
    encumbrances = []
    if isinstance(encumbrances_raw, list):
        for e in encumbrances_raw:
            if isinstance(e, dict):
                encumbrances.append({
                    'number': _str(e.get('number') or e.get('num') or ''),
                    'type':   _str(e.get('type') or e.get('kind') or ''),
                    'date':   _str(e.get('date') or e.get('reg_date') or ''),
                    'holder': _str(e.get('holder') or e.get('person') or ''),
                })
            elif isinstance(e, str) and e:
                encumbrances.append({'type': e, 'number': '', 'date': '', 'holder': ''})

    # ── Права собственности ────────────────────────────────────────────────────
    rights_raw = raw.get('rights') or raw.get('owners') or []
    rights = []
    if isinstance(rights_raw, list):
        for r in rights_raw:
            if isinstance(r, dict):
                rights.append({
                    'number': _str(r.get('number') or r.get('num') or ''),
                    'type':   _str(r.get('type') or r.get('right_type') or ''),
                    'date':   _str(r.get('date') or r.get('reg_date') or ''),
                    'person': _str(r.get('person') or r.get('owner') or r.get('name') or ''),
                    'share':  _str(r.get('share') or ''),
                })
            elif isinstance(r, str) and r:
                rights.append({'type': r, 'number': '', 'date': '', 'person': '', 'share': ''})

    return {
        '_source': 'egrn',
        'cadastral_number': cad_num,
        'address':          address,
        'area':             area,
        'purpose':          purpose,
        'cadastral_cost':   _fmt_cost(cad_cost) if cad_cost else '',
        'cadastral_cost_date': cad_cost_date,
        'registration_date': reg_date,
        'status':           status,
        'encumbrances':     encumbrances,
        'rights':           rights,
        'has_encumbrances': len(encumbrances) > 0,
        '_raw':             raw,
    }


def fetch_egrn(cadastr_number: str) -> dict:
    """Получение данных ЕГРН по кадастровому номеру через api-assist.com."""
    api_key = os.environ.get('EGRN_API_KEY', '')
    if not api_key:
        return {'error': 'EGRN_API_KEY не настроен'}
    cadastr_clean = cadastr_number.strip()
    url = f'https://api-assist.com/api/egrn-object?cadastral_number={urllib.parse.quote(cadastr_clean)}'
    try:
        req = urllib.request.Request(
            url,
            headers={'Authorization': f'Bearer {api_key}', 'User-Agent': 'BizNest CRM/1.0'},
            method='GET',
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = json.loads(resp.read().decode())
        # Проверяем что API вернул успешный ответ
        if isinstance(raw, dict) and (raw.get('success') == 0 or raw.get('error')):
            return {'error': raw.get('error') or raw.get('message') or 'Объект не найден', '_raw': raw}
        return _parse_egrn_raw(raw, cadastr_clean)
    except urllib.error.HTTPError as e:
        body_err = e.read().decode()[:300]
        return {'error': f'EGRН HTTP {e.code}: {body_err}'}
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
        dadata_key = (check_keys or {}).get('dadata', '')
        dadata_info = None
        if dadata_key:
            try:
                secret = os.environ.get('DADATA_SECRET_KEY', '')
                req = urllib.request.Request(
                    'https://dadata.ru/api/v2/profile/balance',
                    headers={'Authorization': f'Token {dadata_key}', 'X-Secret': secret},
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    balance_data = json.loads(resp.read().decode())
                req2 = urllib.request.Request(
                    'https://dadata.ru/api/v2/stat/daily',
                    headers={'Authorization': f'Token {dadata_key}', 'X-Secret': secret},
                )
                with urllib.request.urlopen(req2, timeout=8) as resp2:
                    stat_data = json.loads(resp2.read().decode())
                dadata_info = {
                    'connected': True,
                    'balance': balance_data.get('balance'),
                    'services': stat_data.get('services', {}),
                    'remaining': stat_data.get('remaining', {}),
                    'date': stat_data.get('date'),
                }
            except Exception as e:
                dadata_info = {'connected': bool(dadata_key), 'error': str(e)[:100]}
        # Проверяем остаток запросов Checko
        checko_key = (check_keys or {}).get('checko', '')
        checko_info = None
        if checko_key:
            try:
                test_url = f'https://api.checko.ru/v2/company?key={urllib.parse.quote(checko_key)}&inn=7707083893'
                req_c = urllib.request.Request(
                    test_url,
                    headers={'User-Agent': 'BizNest CRM/1.0', 'Accept': 'application/json'},
                )
                with urllib.request.urlopen(req_c, timeout=8) as resp_c:
                    c_data = json.loads(resp_c.read().decode())
                meta = c_data.get('meta', {})
                checko_info = {
                    'connected': True,
                    'today_request_count': meta.get('today_request_count', 0),
                    'remaining': meta.get('remaining'),
                    'limit': meta.get('limit'),
                }
            except Exception as e:
                checko_info = {'connected': bool(checko_key), 'error': str(e)[:100]}

        return ok({
            'zachestny': bool((check_keys or {}).get('zachestny')),
            'newdb': bool((check_keys or {}).get('newdb')),
            'bezopasno': bool((check_keys or {}).get('bezopasno')),
            'dadata': bool(dadata_key),
            'dadata_info': dadata_info,
            'checko': bool(checko_key),
            'checko_info': checko_info,
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
    force_refresh = body.get('force_refresh', False)

    if not check_type or not query:
        return err('Укажите check_type и query')

    # ── Кадастровая проверка (ЕГРН) ─────────────────────────────────────────
    if check_type == 'property':
        search_mode = body.get('search_mode', 'cadastral')  # 'cadastral' | 'address'

        # Поиск по адресу → возвращаем список найденных объектов с кадастровыми номерами
        if search_mode == 'address':
            result = fetch_cadastr_by_address(query)
            return ok({'query': query, 'check_type': 'property', 'search_mode': 'address', 'results': {'egrn': {'data': result, 'from_cache': False}}})

        # Поиск по кадастровому номеру (основной режим)
        cache_key = make_cache_key('property', query)
        cached = get_cached(conn, 'property', cache_key, 'egrn')
        if cached and not force_refresh:
            return ok({'query': query, 'check_type': 'property', 'results': {'egrn': {'data': cached, 'from_cache': True}}})
        data = fetch_egrn(query)
        if 'error' not in data:
            save_cache(conn, 'property', cache_key, 'egrn', data, user['id'])
            inc_quota(conn, 'egrn')
            conn.commit()
        return ok({'query': query, 'check_type': 'property', 'results': {'egrn': {'data': data, 'from_cache': False}}})

    # ── Выбор источников по типу проверки ───────────────────────────────────
    default_sources_by_type = {
        'company': ['zachestny', 'dadata', 'checko'],
        'owner':   ['newdb', 'bezopasno'],
    }
    requested_sources = body.get('sources', default_sources_by_type.get(check_type, ['zachestny', 'bezopasno']))

    cache_key = make_cache_key(check_type, query)
    results = {}

    for source in requested_sources:
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
        elif source == 'checko':
            data = fetch_checko(query, api_key)
        else:
            data = {'error': 'Неизвестный источник'}

        if 'error' not in data:
            save_cache(conn, check_type, cache_key, source, data, user['id'])
            inc_quota(conn, source)

        results[source] = {'data': data, 'from_cache': False}

    return ok({'query': query, 'check_type': check_type, 'results': results})