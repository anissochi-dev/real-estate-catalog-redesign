"""
Business: ИИ-ассистент на YandexGPT 5 Pro (Алиса) — генерация описаний, аналитика, ответы на лиды, SEO, публичный ИИ-подбор объектов.
Args: event с httpMethod (POST), body {action, prompt, context_data}, headers X-Auth-Token; context
Returns: HTTP-ответ с текстом от YandexGPT и логом в БД
"""

import json
import os
import urllib.request

import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
# YandexGPT 5 Pro (актуальная версия с Алисой). RC = release candidate последней Pro-модели.
YANDEX_MODEL_NAME = 'yandexgpt/rc'

SYSTEM_PROMPTS = {
    'describe': (
        'Ты — копирайтер агентства коммерческой недвижимости BIZNEST. '
        'По кратким данным об объекте напиши продающее описание на русском в 3-4 предложениях. '
        'Подчеркни выгоды для бизнеса, без воды и клише. Не используй markdown.'
    ),
    'reply_lead': (
        'Ты — менеджер агентства коммерческой недвижимости BIZNEST. '
        'Напиши короткий, вежливый и тёплый ответ клиенту на его заявку. '
        'Поблагодари, уточни удобное время для звонка, предложи показ. 3-4 предложения, без markdown.'
    ),
    'seo': (
        'Ты — SEO-специалист. По описанию объекта недвижимости составь meta description '
        '(до 160 символов) и список из 5 ключевых слов через запятую. '
        'Формат ответа строго: \nMETA: <текст>\nKEYWORDS: <ключи через запятую>'
    ),
    'seo_listing': (
        'Ты — SEO-специалист агентства коммерческой недвижимости. По данным объекта сгенерируй: '
        '1) seo_title — короткий заголовок страницы до 70 символов с ключевыми словами, городом и типом сделки; '
        '2) seo_description — описание для выдачи поисковиков до 160 символов, продающее, с УТП и призывом. '
        'Без markdown, без кавычек. Формат ответа строго:\n'
        'TITLE: <заголовок>\n'
        'DESCRIPTION: <описание>'
    ),
    'moderate': (
        'Ты — модератор текста. Оцени описание объекта недвижимости от 1 до 10 по продающести и грамотности. '
        'Дай 2-3 конкретных совета, что улучшить. Без markdown.'
    ),
    'analytics': (
        'Ты — аналитик агентства недвижимости. На основе предоставленных данных дай краткие выводы '
        'и 2-3 практических рекомендации для администратора сайта. Без markdown.'
    ),
    'admin': (
        'Ты — встроенный ассистент админ-панели BIZNEST. Помогаешь администратору управлять каталогом '
        'коммерческой недвижимости: объявлениями, лидами, пользователями, контентом. '
        'Отвечай конкретно и по делу, на русском, без markdown. Если нужно действие — опиши шаги в админке.'
    ),
    'add_city': (
        'Ты — помощник по геоданным России. Пользователь называет город — '
        'верни ровно одну строку формата:\nГОРОД: <название>\nРЕГИОН: <название субъекта РФ>\n'
        'Если город не существует или не в России — верни:\nERROR: <причина>'
    ),
    'auto_tags': (
        'Ты — генератор поисковых тегов для коммерческой недвижимости. '
        'По описанию объекта верни ТОЛЬКО список из 5-8 коротких тегов (1-2 слова), через запятую, '
        'без нумерации и пояснений. Теги — на русском, в нижнем регистре, без точек и хештегов. '
        'Пример: офис, центр, парковка, евроремонт, открытая планировка'
    ),
    'match': (
        'Ты — консультант агентства коммерческой недвижимости BIZNEST. '
        'Клиент описал свою задачу. Тебе дан список доступных объектов в JSON. '
        'Подбери до 3 наиболее подходящих объектов по критериям клиента (тип, бюджет, площадь, район, цель). '
        'Ответь СТРОГО в формате JSON без markdown и без пояснений вокруг:\n'
        '{"ids": [id1, id2, id3], "reasoning": "одно предложение почему подобрал именно их", '
        '"advice": "1-2 предложения совета клиенту и расчёт окупаемости если применимо"}'
    ),
    'agent': (
        'Ты — автономный ИИ-агент админ-панели BIZNEST. Твоя задача — анализировать запрос администратора '
        'и САМОСТОЯТЕЛЬНО предлагать конкретные действия, которые надо выполнить в системе. '
        'Каждое действие требует подтверждения админа. Тебе даётся контекст: список последних объектов, '
        'лидов, статистика. Опирайся на эти данные.\n\n'
        'Доступные действия (action.type):\n'
        '- update_listing — изменить поля карточки. params: {"id": <int>, "fields": {...}}. '
        'Допустимые поля: title, description, price, status (active/archived/draft), '
        'seo_title, seo_description, tags (массив строк или строка через запятую).\n'
        '- archive_listing — отправить объект в архив. params: {"id": <int>}.\n'
        '- delete_listing — удалить объект (только для очевидно мусорных). params: {"id": <int>}.\n'
        '- reply_lead — отправить ответ клиенту (черновик письма). params: {"id": <int>, "message": "<текст>"}.\n'
        '- close_lead — закрыть лид. params: {"id": <int>, "reason": "<причина>"}.\n'
        '- generate_description — переписать описание объекта. params: {"id": <int>, "new_description": "<текст>"}.\n'
        '- note — простой совет без действия. params: {"text": "<текст совета>"}.\n\n'
        'Ответь СТРОГО в формате JSON без markdown:\n'
        '{"reasoning": "1-2 предложения о ситуации", '
        '"actions": [{"type": "<тип>", "title": "<краткое название>", '
        '"description": "<что и зачем>", "risk": "low|medium|high", "params": {...}}]}\n\n'
        'Предлагай максимум 5 действий. Если действий нет — верни actions: [] и поясни в reasoning. '
        'Никогда не придумывай id — бери только из контекста. Не предлагай delete_listing без явной причины.'
    ),
}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


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


def _load_keys_from_db(cur) -> tuple:
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row:
            return (row.get('yandex_api_key') or '', row.get('yandex_folder_id') or '')
    except Exception:
        pass
    return ('', '')


def _call_yandex_gpt(system_prompt: str, user_prompt: str, db_key: str = '', db_folder: str = '') -> dict:
    api_key = db_key or os.environ.get('YANDEX_API_KEY', '')
    folder_id = db_folder or os.environ.get('YANDEX_FOLDER_ID', '')
    if not api_key:
        return {'error': 'YandexGPT API-ключ не настроен. Добавьте его в админке: Настройки → Интеграции.'}
    if not folder_id:
        return {'error': 'YandexGPT Folder ID не настроен. Добавьте его в админке: Настройки → Интеграции.'}

    model_uri = f'gpt://{folder_id}/{YANDEX_MODEL_NAME}'
    payload = {
        'modelUri': model_uri,
        'completionOptions': {
            'stream': False,
            'temperature': 0.6,
            'maxTokens': '2000',
        },
        'messages': [
            {'role': 'system', 'text': system_prompt},
            {'role': 'user', 'text': user_prompt},
        ],
    }

    req = urllib.request.Request(
        YANDEX_GPT_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Api-Key {api_key}',
            'Content-Type': 'application/json',
            'x-folder-id': folder_id,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        result = data.get('result') or {}
        alternatives = result.get('alternatives') or []
        text = ''
        if alternatives:
            text = ((alternatives[0].get('message') or {}).get('text') or '').strip()
        usage = result.get('usage') or {}
        return {'text': text, 'tokens': int(usage.get('totalTokens', 0))}
    except Exception as e:
        msg = str(e)
        if hasattr(e, 'read'):
            try:
                msg = e.read().decode('utf-8', errors='ignore')[:400]
            except Exception:
                pass
        return {'error': f'Ошибка YandexGPT: {msg[:400]}'}


def _sanitize_text(s, length=5000):
    return (s or '').replace("'", "''")[:length]


def _allowed_fields(fields: dict) -> dict:
    allowed = {'title', 'description', 'price', 'status', 'seo_title', 'seo_description', 'tags'}
    out = {}
    for k, v in (fields or {}).items():
        if k in allowed:
            out[k] = v
    return out


def _exec_action(cur, user, act_type: str, params: dict) -> dict:
    """Выполняет одно действие, предложенное ИИ-агентом. Возвращает {ok, message} или {error}."""
    if user['role'] not in ('admin', 'editor', 'manager'):
        return {'error': 'Недостаточно прав'}

    params = params or {}

    if act_type == 'note':
        return {'ok': True, 'message': 'Совет принят'}

    if act_type == 'update_listing':
        listing_id = int(params.get('id') or 0)
        if not listing_id:
            return {'error': 'Не указан id объекта'}
        fields = _allowed_fields(params.get('fields') or {})
        if not fields:
            return {'error': 'Нет полей для обновления'}
        sets = []
        for k, v in fields.items():
            if k == 'price':
                try:
                    sets.append(f"price = {int(float(v))}")
                except Exception:
                    return {'error': 'Некорректная цена'}
            elif k == 'tags':
                if isinstance(v, list):
                    v = ', '.join(str(x) for x in v)
                sets.append(f"tags = '{_sanitize_text(str(v), 1000)}'")
            elif k == 'status':
                if v not in ('active', 'archived', 'draft'):
                    return {'error': f'Недопустимый статус: {v}'}
                sets.append(f"status = '{v}'")
            else:
                sets.append(f"{k} = '{_sanitize_text(str(v), 5000)}'")
        cur.execute(f"UPDATE {SCHEMA}.listings SET {', '.join(sets)}, updated_at = NOW() WHERE id = {listing_id}")
        return {'ok': True, 'message': f'Объект #{listing_id} обновлён ({len(fields)} полей)'}

    if act_type == 'archive_listing':
        listing_id = int(params.get('id') or 0)
        if not listing_id:
            return {'error': 'Не указан id объекта'}
        cur.execute(f"UPDATE {SCHEMA}.listings SET status = 'archived', updated_at = NOW() WHERE id = {listing_id}")
        return {'ok': True, 'message': f'Объект #{listing_id} в архиве'}

    if act_type == 'delete_listing':
        if user['role'] != 'admin':
            return {'error': 'Удаление — только админ'}
        listing_id = int(params.get('id') or 0)
        if not listing_id:
            return {'error': 'Не указан id объекта'}
        cur.execute(f"DELETE FROM {SCHEMA}.listings WHERE id = {listing_id}")
        return {'ok': True, 'message': f'Объект #{listing_id} удалён'}

    if act_type == 'generate_description':
        listing_id = int(params.get('id') or 0)
        new_desc = params.get('new_description') or ''
        if not listing_id or not new_desc:
            return {'error': 'Нужны id и новое описание'}
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET description = '{_sanitize_text(new_desc, 5000)}', "
            f"updated_at = NOW() WHERE id = {listing_id}"
        )
        return {'ok': True, 'message': f'Описание объекта #{listing_id} обновлено'}

    if act_type == 'close_lead':
        lead_id = int(params.get('id') or 0)
        if not lead_id:
            return {'error': 'Не указан id лида'}
        cur.execute(f"UPDATE {SCHEMA}.leads SET status = 'closed' WHERE id = {lead_id}")
        return {'ok': True, 'message': f'Лид #{lead_id} закрыт'}

    if act_type == 'reply_lead':
        lead_id = int(params.get('id') or 0)
        message = params.get('message') or ''
        if not lead_id or not message:
            return {'error': 'Нужны id лида и текст ответа'}
        # Помечаем лид как в работе. Текст ответа пользователь увидит в чате и сможет скопировать.
        cur.execute(f"UPDATE {SCHEMA}.leads SET status = 'in_progress' WHERE id = {lead_id}")
        return {'ok': True, 'message': f'Лид #{lead_id} взят в работу. Текст ответа: {message[:120]}'}

    return {'error': f'Неизвестное действие: {act_type}'}


def _collect_agent_context(cur) -> dict:
    """Собирает контекст для агента: последние объекты, лиды, статистика."""
    ctx = {}
    try:
        cur.execute(
            f"SELECT id, title, category, deal, price, area, status, "
            f"COALESCE(LENGTH(description), 0) AS desc_len, "
            f"EXTRACT(DAY FROM NOW() - created_at)::int AS age_days "
            f"FROM {SCHEMA}.listings ORDER BY id DESC LIMIT 30"
        )
        ctx['listings'] = [dict(r) for r in cur.fetchall()]
    except Exception:
        ctx['listings'] = []
    try:
        cur.execute(
            f"SELECT id, name, phone, email, status, "
            f"EXTRACT(DAY FROM NOW() - created_at)::int AS age_days "
            f"FROM {SCHEMA}.leads ORDER BY id DESC LIMIT 20"
        )
        ctx['leads'] = [dict(r) for r in cur.fetchall()]
    except Exception:
        ctx['leads'] = []
    try:
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE status = 'active'")
        ctx['active_listings'] = cur.fetchone()['c']
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads WHERE status = 'new'")
        ctx['new_leads'] = cur.fetchone()['c']
    except Exception:
        pass
    return ctx


def handler(event, context):
    method = event.get('httpMethod', 'POST')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if method != 'POST':
        return _err(405, 'Method not allowed')

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    body = json.loads(event.get('body') or '{}')
    action = body.get('action', 'admin')

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            is_public = action == 'match'
            user = None
            if not is_public:
                user = _get_user(cur, token)
                if not user:
                    return _err(401, 'Требуется авторизация')
                if user['role'] not in ('admin', 'editor', 'manager'):
                    return _err(403, 'Только для сотрудников')

            # Проверка подключения к YandexGPT с переданными или сохранёнными ключами
            if action == 'ping':
                test_key = (body.get('api_key') or '').strip()
                test_folder = (body.get('folder_id') or '').strip()
                if not test_key or not test_folder:
                    db_key, db_folder = _load_keys_from_db(cur)
                    test_key = test_key or db_key
                    test_folder = test_folder or db_folder
                if not test_key or not test_folder:
                    return _err(400, 'Укажите API-ключ и Folder ID')
                ping_result = _call_yandex_gpt(
                    'Ответь одним словом: ОК',
                    'Проверка подключения',
                    test_key,
                    test_folder,
                )
                if 'error' in ping_result:
                    return _err(502, ping_result['error'])
                return _ok({
                    'success': True,
                    'message': 'Подключение успешно',
                    'reply': ping_result.get('text', ''),
                    'tokens': ping_result.get('tokens', 0),
                })

            # Выполнение действий, предложенных агентом, после подтверждения админом
            if action == 'execute':
                actions_to_run = body.get('actions') or []
                if not isinstance(actions_to_run, list) or not actions_to_run:
                    return _err(400, 'Нет действий для выполнения')
                results = []
                for a in actions_to_run:
                    a_type = (a or {}).get('type', '')
                    a_params = (a or {}).get('params') or {}
                    res = _exec_action(cur, user, a_type, a_params)
                    results.append({'type': a_type, 'result': res})
                    log_text = json.dumps({'type': a_type, 'params': a_params, 'result': res}, ensure_ascii=False)[:4000]
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.ai_logs (user_id, action, prompt, response, tokens) "
                        f"VALUES ({user['id']}, 'execute', '{_safe(a_type, 50)}', '{_sanitize_text(log_text, 4000)}', 0)"
                    )
                conn.commit()
                return _ok({'results': results})

            user_text = (body.get('prompt') or '').strip()
            ctx_data = body.get('context_data')

            if action not in SYSTEM_PROMPTS:
                return _err(400, 'Неизвестное действие ИИ')
            if not user_text and not ctx_data and action != 'agent':
                return _err(400, 'Пустой запрос')

            # Для агента собираем контекст автоматически
            if action == 'agent':
                agent_ctx = _collect_agent_context(cur)
                if ctx_data:
                    agent_ctx['extra'] = ctx_data
                ctx_data = agent_ctx

            # Для match — подтягиваем активные объекты как контекст
            matches = []
            if is_public:
                cur.execute(
                    f"SELECT id, title, category, deal, price, area, district, address, "
                    f"payback, profit, image FROM {SCHEMA}.listings "
                    f"WHERE status = 'active' ORDER BY id DESC LIMIT 60"
                )
                listings = cur.fetchall()
                matches = [dict(r) for r in listings]
                # Сжатый контекст для модели — только id и ключевые поля
                compact = [
                    {
                        'id': r['id'],
                        'title': r['title'],
                        'category': r['category'],
                        'deal': r['deal'],
                        'price': r['price'],
                        'area': r['area'],
                        'district': r['district'],
                        'payback': r['payback'],
                    }
                    for r in matches
                ]
                ctx_data = {'listings': compact}

            sys_prompt = SYSTEM_PROMPTS[action]
            full_prompt = user_text
            if ctx_data:
                full_prompt += '\n\nДанные:\n' + json.dumps(ctx_data, ensure_ascii=False, default=str)[:6000]

            db_key, db_folder = _load_keys_from_db(cur)
            result = _call_yandex_gpt(sys_prompt, full_prompt, db_key, db_folder)
            if 'error' in result:
                return _err(502, result['error'])

            # Парсим JSON-ответ для match
            if is_public:
                text = result['text'].strip()
                if text.startswith('```'):
                    text = text.strip('`').lstrip('json').strip()
                try:
                    parsed = json.loads(text)
                except Exception:
                    parsed = {'ids': [], 'reasoning': result['text'][:500], 'advice': ''}
                ids = parsed.get('ids') or []
                picked = [r for r in matches if r['id'] in ids]
                picked_sorted = sorted(picked, key=lambda r: ids.index(r['id']) if r['id'] in ids else 99)
                return _ok({
                    'listings': picked_sorted[:3],
                    'reasoning': parsed.get('reasoning', ''),
                    'advice': parsed.get('advice', ''),
                    'tokens': result.get('tokens', 0),
                })

            # Парсим JSON-ответ для агента
            if action == 'agent':
                text = result['text'].strip()
                if text.startswith('```'):
                    text = text.strip('`').lstrip('json').strip()
                # Иногда модель оборачивает в текст — пытаемся вытащить JSON
                if not text.startswith('{'):
                    import re as _re
                    m = _re.search(r'\{.*\}', text, _re.DOTALL)
                    if m:
                        text = m.group(0)
                try:
                    parsed = json.loads(text)
                except Exception:
                    parsed = {'reasoning': result['text'][:500], 'actions': []}
                cur.execute(
                    f"INSERT INTO {SCHEMA}.ai_logs (user_id, action, prompt, response, tokens) "
                    f"VALUES ({user['id']}, 'agent', '{_safe(user_text, 4000)}', "
                    f"'{_sanitize_text(result['text'], 4000)}', {int(result.get('tokens', 0))})"
                )
                conn.commit()
                return _ok({
                    'reasoning': parsed.get('reasoning', ''),
                    'actions': parsed.get('actions') or [],
                    'tokens': result.get('tokens', 0),
                })

            log_prompt = _safe(full_prompt, 4000)
            log_resp = _safe(result['text'], 4000)
            cur.execute(
                f"INSERT INTO {SCHEMA}.ai_logs (user_id, action, prompt, response, tokens) "
                f"VALUES ({user['id']}, '{_safe(action, 50)}', '{log_prompt}', '{log_resp}', {int(result.get('tokens', 0))})"
            )
            conn.commit()

            return _ok({'text': result['text'], 'tokens': result.get('tokens', 0)})
    finally:
        conn.close()