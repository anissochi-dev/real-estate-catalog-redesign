"""
Business: ИИ-ассистент на YandexGPT для админки — генерация описаний объектов, аналитика, ответы на лиды, SEO, помощь по администрированию.
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


def _call_yandex(system_prompt: str, user_prompt: str) -> dict:
    api_key = os.environ.get('YANDEX_API_KEY', '')
    folder = os.environ.get('YANDEX_FOLDER_ID', '')
    if not api_key or not folder:
        return {'error': 'YANDEX_API_KEY или YANDEX_FOLDER_ID не настроены'}

    payload = {
        'modelUri': f'gpt://{folder}/yandexgpt-lite/latest',
        'completionOptions': {'stream': False, 'temperature': 0.6, 'maxTokens': 800},
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
            'x-folder-id': folder,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        text = data.get('result', {}).get('alternatives', [{}])[0].get('message', {}).get('text', '')
        usage = data.get('result', {}).get('usage', {})
        return {'text': text.strip(), 'tokens': int(usage.get('totalTokens', 0))}
    except Exception as e:
        msg = str(e)
        if hasattr(e, 'read'):
            try:
                msg = e.read().decode('utf-8', errors='ignore')[:300]
            except Exception:
                pass
        return {'error': f'Ошибка YandexGPT: {msg[:300]}'}


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

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ('admin', 'editor', 'manager'):
                return _err(403, 'Только для сотрудников')

            body = json.loads(event.get('body') or '{}')
            action = body.get('action', 'admin')
            user_text = (body.get('prompt') or '').strip()
            ctx_data = body.get('context_data')

            if action not in SYSTEM_PROMPTS:
                return _err(400, 'Неизвестное действие ИИ')
            if not user_text and not ctx_data:
                return _err(400, 'Пустой запрос')

            sys_prompt = SYSTEM_PROMPTS[action]
            full_prompt = user_text
            if ctx_data:
                full_prompt += '\n\nДанные:\n' + json.dumps(ctx_data, ensure_ascii=False)[:3000]

            result = _call_yandex(sys_prompt, full_prompt)
            if 'error' in result:
                return _err(502, result['error'])

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