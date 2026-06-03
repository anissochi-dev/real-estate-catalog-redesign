"""
ИИ-помощник для добавления районов города.
Режимы (action в POST-теле):
  suggest  — через YandexGPT генерирует список районов для заданного города,
             возвращает массив без сохранения в БД (для превью).
  import   — сохраняет переданный список районов в БД (пропускает уже существующие).
Args: POST {action, city, districts?[{name, description, sort_order}]}, X-Auth-Token
Returns: {districts: [...]} или {imported, skipped}
"""
import json
import os
import urllib.request
import urllib.error
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL_NAME = 'yandexgpt/rc'

_RU_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _safe(s, length=255):
    return (s or '').replace("'", "''")[:length]


def _make_slug(title: str) -> str:
    s = (title or '').lower()
    out = []
    for ch in s:
        out.append(_RU_MAP.get(ch, ch))
    s = ''.join(out)
    clean = []
    for ch in s:
        if ch.isalnum():
            clean.append(ch)
        elif ch in (' ', '-', '_'):
            clean.append('-')
    s = ''.join(clean)
    while '--' in s:
        s = s.replace('--', '-')
    return s.strip('-')[:80].rstrip('-') or 'district'


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _load_keys(cur):
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row:
            return row.get('yandex_api_key') or '', row.get('yandex_folder_id') or ''
    except Exception:
        pass
    return os.environ.get('YANDEX_API_KEY', ''), os.environ.get('YANDEX_FOLDER_ID', '')


def _gpt(user_text: str, api_key: str, folder_id: str) -> dict:
    if not api_key or not folder_id:
        return {'error': 'YandexGPT не настроен — добавьте ключи в Настройки → Интеграции'}
    system = (
        'Ты — эксперт по географии и недвижимости. '
        'По названию города сгенерируй список всех основных районов и микрорайонов этого города. '
        'Для каждого района дай: короткое название (1-4 слова) и краткое описание (1 предложение, до 100 символов). '
        'Без нумерации, без markdown. '
        'Формат строго (каждый район с новой строки):\n'
        'РАЙОН: <название> | ОПИСАНИЕ: <описание>'
    )
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL_NAME}',
        'completionOptions': {'stream': False, 'temperature': 0.3, 'maxTokens': '2000'},
        'messages': [{'role': 'system', 'text': system}, {'role': 'user', 'text': user_text}],
    }
    req = urllib.request.Request(
        YANDEX_GPT_URL,
        data=json.dumps(payload).encode(),
        headers={
            'Authorization': f'Api-Key {api_key}',
            'Content-Type': 'application/json',
            'x-folder-id': folder_id,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode())
        alts = (data.get('result') or {}).get('alternatives') or []
        text = ((alts[0].get('message') or {}).get('text') or '').strip() if alts else ''
        return {'text': text}
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {'error': 'YandexGPT отклонил ключ (401)'}
        if e.code == 403:
            return {'error': 'YandexGPT: нет прав (403)'}
        if e.code == 429:
            return {'error': 'YandexGPT: превышен лимит (429)'}
        return {'error': f'YandexGPT ошибка {e.code}'}
    except Exception as e:
        return {'error': f'{type(e).__name__}: {str(e)[:200]}'}


def _parse_districts(text: str, city: str) -> list:
    result = []
    for i, line in enumerate(text.splitlines()):
        line = line.strip()
        if not line or '|' not in line:
            continue
        parts = line.split('|')
        name_part = parts[0].strip()
        desc_part = parts[1].strip() if len(parts) > 1 else ''
        name = name_part.replace('РАЙОН:', '').strip()
        desc = desc_part.replace('ОПИСАНИЕ:', '').strip()
        if not name:
            continue
        result.append({
            'name': name[:100],
            'city': city,
            'description': desc[:200],
            'slug': _make_slug(name),
            'sort_order': (i + 1) * 10,
        })
    return result


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {**CORS, 'Access-Control-Max-Age': '86400'}, 'body': ''}

    if event.get('httpMethod') != 'POST':
        return _err(405, 'Method not allowed')

    headers = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    token = headers.get('x-auth-token') or headers.get('x-authorization', '')

    body = json.loads(event.get('body') or '{}')
    action = body.get('action', 'suggest')
    city = (body.get('city') or '').strip()

    if not city:
        return _err(400, 'Укажите название города')

    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        return _err(500, 'DATABASE_URL not configured')

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            user = _get_user(cur, token)
            if not user or user['role'] not in ('admin', 'director', 'editor'):
                return _err(401, 'Недостаточно прав')

            if action == 'suggest':
                api_key, folder_id = _load_keys(cur)
                result = _gpt(f'Город: {city}', api_key, folder_id)
                if 'error' in result:
                    return _err(502, result['error'])
                districts = _parse_districts(result['text'], city)
                if not districts:
                    return _err(502, 'ИИ не вернул районы — попробуйте ещё раз')
                return _ok({'districts': districts, 'city': city})

            if action == 'import':
                districts_in = body.get('districts') or []
                if not districts_in:
                    return _err(400, 'Нет районов для импорта')

                cur.execute(
                    f"SELECT LOWER(name) FROM {SCHEMA}.districts WHERE LOWER(city) = LOWER('{_safe(city)}')"
                )
                existing = {r[0] for r in cur.fetchall()}

                imported = 0
                skipped = 0
                for d in districts_in:
                    name = _safe((d.get('name') or '').strip(), 100)
                    if not name or name.lower() in existing:
                        skipped += 1
                        continue
                    slug = _safe(_make_slug(name), 100)
                    desc = _safe((d.get('description') or '').strip(), 300)
                    sort_order = int(d.get('sort_order') or 0)

                    cur.execute(
                        f"INSERT INTO {SCHEMA}.districts (name, slug, city, description, sort_order, is_active) "
                        f"VALUES ('{name}', '{slug}', '{_safe(city)}', '{desc}', {sort_order}, TRUE)"
                    )
                    imported += 1

                conn.commit()
                return _ok({'imported': imported, 'skipped': skipped})

            return _err(400, f'Неизвестный action: {action}')
    finally:
        conn.close()
