"""
ИИ-помощник для добавления районов города.
Режимы (action в POST-теле):
  suggest  — через YandexGPT генерирует список районов для заданного города.
  enrich   — принимает текстовый список названий районов, ИИ обогащает каждый
             подробным описанием, характеристиками (тип, особенности, инфра).
  import   — сохраняет переданный список районов в БД (пропускает существующие).
Args: POST {action, city, text?, districts?[{name,description,sort_order}]}, X-Auth-Token
Returns: {districts:[...]} или {imported, skipped}
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


def _call_gpt(system: str, user_text: str, api_key: str, folder_id: str, max_tokens: str = '2000') -> dict:
    if not api_key or not folder_id:
        return {'error': 'YandexGPT не настроен — добавьте ключи в Настройки → Интеграции'}
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL_NAME}',
        'completionOptions': {'stream': False, 'temperature': 0.3, 'maxTokens': max_tokens},
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
        with urllib.request.urlopen(req, timeout=55) as resp:
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
            'description': desc[:250],
            'slug': _make_slug(name),
            'sort_order': (i + 1) * 10,
        })
    return result


def _parse_enriched(text: str, city: str) -> list:
    """Парсит ответ ИИ на обогащение: РАЙОН: ... | ОПИСАНИЕ: ..."""
    return _parse_districts(text, city)


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

            # ── suggest: ИИ сам придумывает список районов города ──────────────
            if action == 'suggest':
                api_key, folder_id = _load_keys(cur)
                system = (
                    'Ты — эксперт по географии и недвижимости. '
                    'По названию города сгенерируй список всех основных районов и микрорайонов этого города. '
                    'Для каждого района дай: короткое название (1-4 слова) и краткое описание (1 предложение, до 120 символов). '
                    'Без нумерации, без markdown. '
                    'Формат строго (каждый район с новой строки):\n'
                    'РАЙОН: <название> | ОПИСАНИЕ: <описание>'
                )
                result = _call_gpt(system, f'Город: {city}', api_key, folder_id)
                if 'error' in result:
                    return _err(502, result['error'])
                districts = _parse_districts(result['text'], city)
                if not districts:
                    return _err(502, 'ИИ не вернул районы — попробуйте ещё раз')
                return _ok({'districts': districts, 'city': city})

            # ── enrich: пользователь вводит названия, ИИ обогащает инфо ────────
            if action == 'enrich':
                raw_text = (body.get('text') or '').strip()
                if not raw_text:
                    return _err(400, 'Введите список районов')

                # Парсим сырой текст — каждая непустая строка = название района
                names = []
                for line in raw_text.splitlines():
                    name = line.strip().lstrip('•-–—*0123456789.) ').strip()
                    if name and len(name) <= 100:
                        names.append(name)
                if not names:
                    return _err(400, 'Не удалось распознать ни одного района')
                if len(names) > 60:
                    return _err(400, f'Слишком много районов ({len(names)}). Максимум 60 за раз')

                api_key, folder_id = _load_keys(cur)
                system = (
                    'Ты — эксперт по географии городов России и недвижимости. '
                    f'Тебе дан список районов / микрорайонов города {city}. '
                    'Для КАЖДОГО района напиши развёрнутое описание (1-2 предложения, до 160 символов): '
                    'тип застройки, особенности, инфраструктура, транспорт, популярность. '
                    'Используй свои знания о реальной географии этого города. '
                    'Без нумерации, без markdown. '
                    'Формат строго (каждый район с новой строки, в том же порядке):\n'
                    'РАЙОН: <точное название из списка> | ОПИСАНИЕ: <описание>'
                )
                user_text = f'Город: {city}\nСписок районов:\n' + '\n'.join(names)
                result = _call_gpt(system, user_text, api_key, folder_id, max_tokens='3000')
                if 'error' in result:
                    return _err(502, result['error'])

                enriched = _parse_enriched(result['text'], city)

                # Сопоставляем: если ИИ пропустил какой-то район — добавляем без описания
                enriched_names_lower = {d['name'].lower() for d in enriched}
                for i, name in enumerate(names):
                    if name.lower() not in enriched_names_lower:
                        enriched.append({
                            'name': name[:100],
                            'city': city,
                            'description': '',
                            'slug': _make_slug(name),
                            'sort_order': (len(enriched) + 1) * 10,
                        })

                # Пересчитываем sort_order по порядку
                for i, d in enumerate(enriched):
                    d['sort_order'] = (i + 1) * 10

                return _ok({'districts': enriched, 'city': city, 'source': 'enrich'})

            # ── import: сохранить выбранные районы в БД ─────────────────────────
            if action == 'import':
                districts_in = body.get('districts') or []
                if not districts_in:
                    return _err(400, 'Нет районов для импорта')

                cur.execute(
                    f"SELECT LOWER(name) FROM {SCHEMA}.districts WHERE LOWER(city) = LOWER('{_safe(city)}')"
                )
                existing = {r[0] for r in cur.fetchall()}

                # Загружаем все существующие slug чтобы избежать коллизий
                cur.execute(f"SELECT slug FROM {SCHEMA}.districts")
                existing_slugs = {r[0] for r in cur.fetchall()}

                imported = 0
                skipped = 0
                for d in districts_in:
                    name = _safe((d.get('name') or '').strip(), 100)
                    if not name or name.lower() in existing:
                        skipped += 1
                        continue
                    desc = _safe((d.get('description') or '').strip(), 300)
                    sort_order = int(d.get('sort_order') or 0)

                    # Генерируем уникальный slug
                    base_slug = _make_slug(name)
                    slug = base_slug
                    counter = 2
                    while slug in existing_slugs:
                        slug = f'{base_slug}-{counter}'
                        counter += 1
                    existing_slugs.add(slug)
                    slug = _safe(slug, 100)

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