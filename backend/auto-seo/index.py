"""
Автоматическая SEO-оптимизация объектов недвижимости.
Режимы: run (запустить пакетную оптимизацию), status (статистика), preview (превью без записи).
Использует YandexGPT для генерации seo_title и seo_description.
Args: POST {action: run|status|preview, limit?, listing_id?}, headers X-Auth-Token
Returns: {processed, skipped, errors} или {status}
"""

import json
import os
import urllib.request
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL_NAME = 'yandexgpt/rc'

SEO_SYSTEM_PROMPT = (
    'Ты — SEO-специалист агентства коммерческой недвижимости BIZNEST в Краснодаре. '
    'По данным объекта сгенерируй:\n'
    '1) seo_title — заголовок страницы до 65 символов: тип+площадь+район+действие+город. '
    'Пример: "Аренда офиса 120 м² в центре Краснодара | BIZNEST"\n'
    '2) seo_description — описание для выдачи до 155 символов: '
    'ключевые характеристики + УТП + призыв к действию. '
    'Пример: "Светлый офис 120 м² с евроремонтом, парковкой, охраной 24/7 в центре Краснодара. '
    'Арендуйте сейчас — звоните!"\n'
    'Без markdown, без кавычек, на русском языке.\n'
    'Формат строго:\nTITLE: <заголовок>\nDESCRIPTION: <описание>'
)

DEAL_RU = {'sale': 'Продажа', 'rent': 'Аренда', 'business': 'Готовый бизнес'}
CAT_RU = {
    'office': 'офиса', 'retail': 'магазина', 'warehouse': 'склада',
    'restaurant': 'кафе/ресторана', 'hotel': 'гостиницы', 'business': 'готового бизнеса',
    'gab': 'готового арендного бизнеса', 'production': 'производственного помещения',
    'land': 'земельного участка', 'building': 'здания', 'free_purpose': 'помещения свободного назначения',
    'car_service': 'автосервиса',
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


def _load_keys(cur):
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row:
            return row.get('yandex_api_key') or '', row.get('yandex_folder_id') or ''
    except Exception:
        pass
    return os.environ.get('YANDEX_API_KEY', ''), os.environ.get('YANDEX_FOLDER_ID', '')


def _gpt(system: str, user_text: str, api_key: str, folder_id: str) -> dict:
    if not api_key or not folder_id:
        return {'error': 'YandexGPT не настроен'}
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL_NAME}',
        'completionOptions': {'stream': False, 'temperature': 0.4, 'maxTokens': '500'},
        'messages': [{'role': 'system', 'text': system}, {'role': 'user', 'text': user_text}],
    }
    req = urllib.request.Request(
        YANDEX_GPT_URL,
        data=json.dumps(payload).encode(),
        headers={'Authorization': f'Api-Key {api_key}', 'Content-Type': 'application/json', 'x-folder-id': folder_id},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode())
        alts = (data.get('result') or {}).get('alternatives') or []
        text = ((alts[0].get('message') or {}).get('text') or '').strip() if alts else ''
        return {'text': text}
    except Exception as e:
        return {'error': str(e)[:200]}


def _build_prompt(listing: dict) -> str:
    deal = DEAL_RU.get(listing.get('deal', ''), listing.get('deal', ''))
    cat = CAT_RU.get(listing.get('category', ''), listing.get('category', ''))
    area = listing.get('area') or ''
    price = listing.get('price') or ''
    district = listing.get('district') or ''
    city = listing.get('city') or 'Краснодар'
    desc = (listing.get('description') or '')[:400]
    title = listing.get('title') or ''

    parts = [
        f'Тип сделки: {deal}',
        f'Тип объекта: {cat}',
        f'Площадь: {area} м²' if area else '',
        f'Цена: {price} ₽' if price else '',
        f'Район: {district}' if district else '',
        f'Город: {city}',
        f'Название: {title}' if title else '',
        f'Описание: {desc}' if desc else '',
    ]
    return '\n'.join(p for p in parts if p)


def _parse_seo(text: str) -> tuple:
    seo_title, seo_desc = '', ''
    for line in text.splitlines():
        line = line.strip()
        if line.upper().startswith('TITLE:'):
            seo_title = line[6:].strip()[:70]
        elif line.upper().startswith('DESCRIPTION:'):
            seo_desc = line[12:].strip()[:160]
    return seo_title, seo_desc


def _process_listing(cur, conn, listing: dict, api_key: str, folder_id: str, dry_run: bool = False) -> dict:
    lid = listing['id']
    prompt = _build_prompt(listing)
    result = _gpt(SEO_SYSTEM_PROMPT, prompt, api_key, folder_id)

    if 'error' in result:
        return {'id': lid, 'status': 'error', 'error': result['error']}

    seo_title, seo_desc = _parse_seo(result['text'])
    if not seo_title and not seo_desc:
        return {'id': lid, 'status': 'error', 'error': 'Не удалось распарсить ответ ИИ'}

    if not dry_run:
        st = _safe(seo_title, 120)
        sd = _safe(seo_desc, 300)
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET "
            f"seo_title = '{st}', seo_description = '{sd}', updated_at = NOW() "
            f"WHERE id = {int(lid)}"
        )
        conn.commit()

    return {'id': lid, 'status': 'ok', 'seo_title': seo_title, 'seo_description': seo_desc}


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'POST')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or 'status'

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ('admin', 'editor'):
                return _err(403, 'Только для admin/editor')

            api_key, folder_id = _load_keys(cur)

            if action == 'status':
                cur.execute(
                    f"SELECT "
                    f"COUNT(*) FILTER (WHERE status='active') AS total_active,"
                    f"COUNT(*) FILTER (WHERE status='active' AND (seo_title IS NULL OR seo_title='')) AS no_seo_title,"
                    f"COUNT(*) FILTER (WHERE status='active' AND (seo_description IS NULL OR seo_description='')) AS no_seo_desc,"
                    f"COUNT(*) FILTER (WHERE status='active' AND (description IS NULL OR LENGTH(description)<50)) AS no_desc "
                    f"FROM {SCHEMA}.listings"
                )
                row = dict(cur.fetchone())
                return _ok({'status': row, 'gpt_configured': bool(api_key and folder_id)})

            if action in ('run', 'preview'):
                dry_run = action == 'preview'
                limit = min(int(body.get('limit') or qs.get('limit') or 10), 50)
                listing_id = body.get('listing_id') or qs.get('listing_id')

                if listing_id:
                    cur.execute(
                        f"SELECT id, title, category, deal, price, area, district, city, description "
                        f"FROM {SCHEMA}.listings WHERE id = {int(listing_id)} AND status = 'active'"
                    )
                else:
                    # Приоритет: объекты без seo_title
                    cur.execute(
                        f"SELECT id, title, category, deal, price, area, district, city, description "
                        f"FROM {SCHEMA}.listings WHERE status = 'active' "
                        f"AND (seo_title IS NULL OR seo_title = '') "
                        f"ORDER BY id DESC LIMIT {limit}"
                    )

                listings = [dict(r) for r in cur.fetchall()]

                if not listings:
                    return _ok({'message': 'Все активные объекты уже имеют SEO-данные', 'processed': 0, 'results': []})

                if not api_key or not folder_id:
                    return _err(503, 'YandexGPT не настроен. Добавьте ключи в Настройки → Интеграции.')

                results = []
                processed = 0
                errors = 0
                for lst in listings:
                    r = _process_listing(cur, conn, lst, api_key, folder_id, dry_run)
                    results.append(r)
                    if r['status'] == 'ok':
                        processed += 1
                    else:
                        errors += 1

                return _ok({
                    'processed': processed,
                    'errors': errors,
                    'total': len(listings),
                    'dry_run': dry_run,
                    'results': results,
                })

    finally:
        conn.close()

    return _err(400, 'Неизвестное действие')
