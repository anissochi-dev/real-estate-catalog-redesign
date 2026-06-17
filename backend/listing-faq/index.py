"""
Business: Генерация FAQ (вопрос-ответ) для страницы объекта недвижимости через YandexGPT.
Кеширует результат в поле seo_faq таблицы listings.
Args: POST { listing_id: int }
Returns: { faq: [{question: str, answer: str}, ...] }
"""

import json
import os
import re
import psycopg2
from psycopg2.extras import RealDictCursor
from ai_client import load_keys, chat_simple

SCHEMA = 't_p71821556_real_estate_catalog_'

DEAL_LABELS = {
    'sale': 'продажа',
    'rent': 'аренда',
    'business': 'готовый бизнес',
}

TYPE_LABELS = {
    'office': 'офис',
    'retail': 'торговое помещение',
    'warehouse': 'склад',
    'restaurant': 'помещение под общепит / кафе / ресторан',
    'hotel': 'гостиница',
    'business': 'готовый бизнес',
    'gab': 'готовый арендный бизнес (ГАБ)',
    'production': 'производственное помещение',
    'land': 'земельный участок',
    'building': 'отдельно стоящее здание',
    'free_purpose': 'помещение свободного назначения',
    'car_service': 'автосервис',
}

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token',
}


def _json_resp(status: int, data: dict) -> dict:
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8'},
        'body': json.dumps(data, ensure_ascii=False),
    }


def _load_yandex_keys(cur) -> tuple:
    """Загружает ключи YandexGPT из БД, fallback — env."""
    return load_keys()


def _check_seo_faq_column(cur) -> bool:
    """Проверяет наличие колонки seo_faq в таблице listings через information_schema."""
    schema_name = SCHEMA.rstrip('_').rstrip('.')
    safe = schema_name.replace("'", "''")
    cur.execute(
        f"SELECT 1 FROM information_schema.columns "
        f"WHERE table_schema = '{safe}' AND table_name = 'listings' AND column_name = 'seo_faq'"
    )
    return cur.fetchone() is not None


def _build_prompt(listing: dict) -> str:
    deal = DEAL_LABELS.get(listing.get('deal') or '', listing.get('deal') or '')
    obj_type = TYPE_LABELS.get(listing.get('category') or '', listing.get('category') or '')
    area = listing.get('area')
    price = listing.get('price')
    address = listing.get('address') or ''
    district = listing.get('district') or ''
    city = listing.get('city') or 'Краснодар'
    title = listing.get('title') or ''
    description = (listing.get('description') or '').strip()[:1500]

    location_parts = [p for p in [district, city] if p]
    location = ', '.join(location_parts) if location_parts else city

    price_str = ''
    if price:
        if deal == 'аренда':
            price_str = f'{int(price):,} руб./мес.'.replace(',', ' ')
        else:
            if price >= 1_000_000:
                price_str = f'{price / 1_000_000:.2f} млн руб.'.rstrip('0').rstrip('.')
            else:
                price_str = f'{int(price):,} руб.'.replace(',', ' ')

    lines = [f'Объект: {title}', f'Тип: {obj_type}', f'Вид сделки: {deal}']
    if area:
        lines.append(f'Площадь: {area} м²')
    if price_str:
        lines.append(f'Цена: {price_str}')
    if address:
        lines.append(f'Адрес: {address}')
    else:
        lines.append(f'Местоположение: {location}')
    if description:
        lines.append(f'Описание: {description}')

    return '\n'.join(lines)


def _call_yandex_gpt(api_key: str, folder_id: str, user_text: str) -> dict:
    """Вызывает YandexGPT и возвращает {'text': ...} или {'error': ...}."""
    system = (
        'Ты — эксперт по коммерческой недвижимости. '
        'Сгенерируй ровно 6 вопросов и ответов FAQ для страницы объекта. '
        'Формат ответа — ТОЛЬКО валидный JSON-массив: '
        '[{"question": "...", "answer": "..."}, ...] '
        'Без markdown, без пояснений, только JSON.'
    )
    try:
        text = chat_simple(system, user_text, api_key, folder_id,
                           temperature=0.4, max_tokens=1200, timeout=45)
        return {'text': text}
    except Exception as e:
        return {'error': str(e)}


def _parse_faq(text: str) -> list:
    """Парсит JSON-массив из ответа YandexGPT, игнорирует markdown-обёртку."""
    text = text.strip()
    # Убираем ```json ... ```
    text = re.sub(r'^```[a-zA-Z]*\s*', '', text)
    text = re.sub(r'\s*```$', '', text).strip()
    faq = json.loads(text)
    if not isinstance(faq, list):
        raise ValueError('Ответ не является JSON-массивом')
    result = []
    for item in faq:
        if isinstance(item, dict) and item.get('question') and item.get('answer'):
            result.append({
                'question': str(item['question']).strip(),
                'answer': str(item['answer']).strip(),
            })
    return result[:6]


def handler(event: dict, context) -> dict:
    """Генерирует FAQ для объекта недвижимости через YandexGPT и кеширует в seo_faq."""
    method = event.get('httpMethod', 'POST').upper()

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Access-Control-Max-Age': '86400'}, 'body': ''}

    if method != 'POST':
        return _json_resp(405, {'error': 'Method not allowed'})

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _json_resp(400, {'error': 'Invalid JSON body'})

    # Batch-режим: генерация FAQ для всех объектов без него
    if body.get('action') == 'batch':
        raw_headers = event.get('headers') or {}
        headers_lc = {k.lower(): v for k, v in raw_headers.items()}
        qs = event.get('queryStringParameters') or {}
        token = (
            qs.get('auth_token')
            or headers_lc.get('x-auth-token')
            or headers_lc.get('x-authorization')
            or body.get('auth_token', '')
        )
        return _batch_generate(token or '', event)

    listing_id = body.get('listing_id')
    if not listing_id:
        return _json_resp(400, {'error': 'listing_id is required'})
    try:
        listing_id = int(listing_id)
    except (TypeError, ValueError):
        return _json_resp(400, {'error': 'listing_id must be an integer'})
    force = bool(body.get('force', False))  # True — сбросить кеш и перегенерировать

    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        return _json_resp(500, {'error': 'DATABASE_URL not configured'})

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            has_seo_faq = _check_seo_faq_column(cur)
            api_key, folder_id = _load_yandex_keys(cur)

            if not api_key or not folder_id:
                return _json_resp(503, {'error': 'YandexGPT не настроен. Добавьте ключи в Настройки → Интеграции.'})

            # Получаем объект
            fields = 'id, title, description, category, deal, price, area, address, district, city'
            if has_seo_faq:
                fields += ', seo_faq'
            cur.execute(f"SELECT {fields} FROM {SCHEMA}.listings WHERE id = {int(listing_id)}")
            listing = cur.fetchone()
            if not listing:
                return _json_resp(404, {'error': 'Listing not found'})
            listing = dict(listing)

            # Кеш (пропускаем если force=True)
            if has_seo_faq and not force:
                cached = listing.get('seo_faq')
                if cached:
                    if isinstance(cached, str):
                        try:
                            cached = json.loads(cached)
                        except Exception:
                            cached = None
                    if isinstance(cached, list) and len(cached) > 0:
                        return _json_resp(200, {'faq': cached, 'cached': True})

            # Генерируем через YandexGPT
            prompt = _build_prompt(listing)
            result = _call_yandex_gpt(api_key, folder_id, prompt)

            if 'error' in result:
                return _json_resp(502, {'error': result['error']})

            try:
                faq = _parse_faq(result['text'])
            except Exception as e:
                return _json_resp(502, {'error': f'Не удалось распарсить ответ ИИ: {e}'})

            if not faq:
                return _json_resp(502, {'error': 'ИИ вернул пустой FAQ'})

            # Сохраняем в БД
            if has_seo_faq:
                try:
                    safe_faq = json.dumps(faq, ensure_ascii=False).replace("'", "''")
                    cur.execute(
                        f"UPDATE {SCHEMA}.listings SET seo_faq = '{safe_faq}', faq_updated_at = NOW() WHERE id = {int(listing_id)}"
                    )
                    conn.commit()
                except Exception:
                    conn.rollback()

            return _json_resp(200, {'faq': faq, 'cached': False})
    finally:
        conn.close()


def _batch_generate(auth_token: str, event: dict) -> dict:
    """Генерирует FAQ для всех активных объектов без seo_faq.
    Защищён авторизацией. Обрабатывает по одному за вызов (limit из body).
    """
    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        return _json_resp(500, {'error': 'DATABASE_URL not configured'})

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Проверка токена через sessions
            safe_token = auth_token.replace("'", "''")[:100]
            cur.execute(
                f"SELECT u.id FROM {SCHEMA}.sessions s "
                f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
                f"WHERE s.token = '{safe_token}' AND s.expires_at > NOW() AND u.is_active = TRUE LIMIT 1"
            )
            if not cur.fetchone():
                return _json_resp(401, {'error': 'Unauthorized'})

            api_key, folder_id = _load_yandex_keys(cur)
            if not api_key or not folder_id:
                return _json_resp(503, {'error': 'YandexGPT не настроен'})

            body = {}
            if event.get('body'):
                try:
                    body = json.loads(event['body'])
                except Exception:
                    pass
            limit = min(int(body.get('limit', 5)), 20)

            # Объекты без FAQ
            cur.execute(
                f"SELECT id, title, description, category, deal, price, area, address, district, city "
                f"FROM {SCHEMA}.listings "
                f"WHERE status = 'active' AND (seo_faq IS NULL OR seo_faq = 'null' OR seo_faq = '[]') "
                f"ORDER BY id ASC LIMIT {limit}"
            )
            listings = [dict(r) for r in cur.fetchall()]

            if not listings:
                # Подсчитаем сколько уже есть
                cur.execute(
                    f"SELECT COUNT(*) as cnt FROM {SCHEMA}.listings "
                    f"WHERE status = 'active' AND seo_faq IS NOT NULL AND seo_faq != 'null' AND seo_faq != '[]'"
                )
                done = int((cur.fetchone() or {}).get('cnt') or 0)
                return _json_resp(200, {'done': done, 'remaining': 0, 'processed': 0, 'message': 'Все объекты уже имеют FAQ'})

            processed, errors = 0, 0
            for listing in listings:
                prompt = _build_prompt(listing)
                result = _call_yandex_gpt(api_key, folder_id, prompt)
                if 'error' in result:
                    errors += 1
                    continue
                try:
                    faq = _parse_faq(result['text'])
                    if faq:
                        safe_faq = json.dumps(faq, ensure_ascii=False).replace("'", "''")
                        cur.execute(
                            f"UPDATE {SCHEMA}.listings SET seo_faq = '{safe_faq}', faq_updated_at = NOW() WHERE id = {int(listing['id'])}"
                        )
                        conn.commit()
                        processed += 1
                except Exception:
                    errors += 1

            # Сколько ещё осталось
            cur.execute(
                f"SELECT COUNT(*) as cnt FROM {SCHEMA}.listings "
                f"WHERE status = 'active' AND (seo_faq IS NULL OR seo_faq = 'null' OR seo_faq = '[]')"
            )
            remaining = int((cur.fetchone() or {}).get('cnt') or 0)

            return _json_resp(200, {
                'processed': processed,
                'errors': errors,
                'remaining': remaining,
            })
    finally:
        conn.close()