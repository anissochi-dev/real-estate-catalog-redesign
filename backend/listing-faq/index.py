"""
Business: Генерация FAQ (вопрос-ответ) для страницы объекта недвижимости через YandexGPT.
Кеширует результат в поле seo_faq таблицы listings.
Args: POST { listing_id: int }
Returns: { faq: [{question: str, answer: str}, ...] }
"""

import json
import os
import re
import urllib.request
import urllib.error
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL = 'yandexgpt/rc'

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
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row:
            return row.get('yandex_api_key') or '', row.get('yandex_folder_id') or ''
    except Exception:
        pass
    return os.environ.get('YANDEX_API_KEY', ''), os.environ.get('YANDEX_FOLDER_ID', '')


def _check_seo_faq_column(cur) -> bool:
    """Проверяет наличие колонки seo_faq в таблице listings через information_schema."""
    schema_name = SCHEMA.rstrip('.')  # SCHEMA уже содержит финальный _
    cur.execute(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = %s AND table_name = 'listings' AND column_name = 'seo_faq'",
        (schema_name,),
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
        'Ты — эксперт по коммерческой недвижимости России. '
        'Составь ровно 6 вопросов и ответов, которые чаще всего задают потенциальные арендаторы или покупатели. '
        'Вопросы конкретные, ответы — 1-3 предложения. Не придумывай данных которых нет в карточке. '
        'Отвечай СТРОГО в формате JSON-массива без markdown и пояснений:\n'
        '[{"question": "...", "answer": "..."}, ...]'
    )
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL}',
        'completionOptions': {'stream': False, 'temperature': 0.4, 'maxTokens': '1200'},
        'messages': [
            {'role': 'system', 'text': system},
            {'role': 'user', 'text': user_text},
        ],
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
        return {'error': f'YandexGPT HTTP {e.code}'}
    except Exception as e:
        return {'error': f'{type(e).__name__}: {str(e)[:200]}'}


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

    listing_id = body.get('listing_id')
    if not listing_id:
        return _json_resp(400, {'error': 'listing_id is required'})
    try:
        listing_id = int(listing_id)
    except (TypeError, ValueError):
        return _json_resp(400, {'error': 'listing_id must be an integer'})

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
            cur.execute(f"SELECT {fields} FROM {SCHEMA}.listings WHERE id = %s", (listing_id,))
            listing = cur.fetchone()
            if not listing:
                return _json_resp(404, {'error': 'Listing not found'})
            listing = dict(listing)

            # Кеш
            if has_seo_faq:
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
                    cur.execute(
                        f"UPDATE {SCHEMA}.listings SET seo_faq = %s WHERE id = %s",
                        (json.dumps(faq, ensure_ascii=False), listing_id),
                    )
                    conn.commit()
                except Exception:
                    conn.rollback()

            return _json_resp(200, {'faq': faq, 'cached': False})
    finally:
        conn.close()