"""
Business: Генерация FAQ (вопрос-ответ) для страницы объекта недвижимости через OpenAI GPT-4o-mini.
Кеширует результат в поле seo_faq таблицы listings (если поле существует).
Args: POST { listing_id: int, token?: str }
Returns: { faq: [{question: str, answer: str}, ...] }
"""

import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import openai

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


def _check_seo_faq_column(cur) -> bool:
    """Проверяет наличие колонки seo_faq в таблице listings через information_schema."""
    cur.execute(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = %s AND table_name = 'listings' AND column_name = 'seo_faq'",
        (SCHEMA.rstrip('_'),),
    )
    return cur.fetchone() is not None


def _build_prompt(listing: dict) -> str:
    deal = DEAL_LABELS.get(listing.get('deal') or '', listing.get('deal') or '')
    obj_type = TYPE_LABELS.get(listing.get('category') or listing.get('type') or '', listing.get('category') or '')
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

    lines = [
        f'Объект: {title}',
        f'Тип: {obj_type}',
        f'Вид сделки: {deal}',
    ]
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

    card = '\n'.join(lines)

    prompt = (
        'Ты — эксперт по коммерческой недвижимости. '
        'На основе данных объекта составь 4-5 вопросов и ответов, '
        'которые чаще всего задают потенциальные арендаторы или покупатели. '
        'Вопросы должны быть конкретными и полезными, ответы — информативными, 1-3 предложения. '
        'Не придумывай данные которых нет в карточке. '
        'Отвечай строго в формате JSON-массива:\n'
        '[{"question": "...", "answer": "..."}, ...]\n\n'
        'Карточка объекта:\n'
        f'{card}'
    )
    return prompt


def _generate_faq(listing: dict) -> list:
    """Вызывает OpenAI GPT-4o-mini и возвращает список {question, answer}."""
    client = openai.OpenAI(api_key=os.environ['OPENAI_API_KEY'])
    prompt = _build_prompt(listing)

    response = client.chat.completions.create(
        model='gpt-4o-mini',
        messages=[
            {
                'role': 'system',
                'content': (
                    'Ты эксперт по коммерческой недвижимости России. '
                    'Отвечаешь только на русском языке. '
                    'Возвращаешь только валидный JSON без пояснений и markdown.'
                ),
            },
            {'role': 'user', 'content': prompt},
        ],
        temperature=0.5,
        max_tokens=1200,
    )

    raw = response.choices[0].message.content or ''

    # Вырезаем ```json ... ``` если модель всё-таки добавила markdown
    raw = raw.strip()
    if raw.startswith('```'):
        raw = raw.split('```', 2)[-1] if raw.count('```') >= 2 else raw
        if raw.startswith('json'):
            raw = raw[4:]
        raw = raw.rsplit('```', 1)[0].strip()

    faq = json.loads(raw)
    if not isinstance(faq, list):
        raise ValueError('GPT вернул не массив')

    result = []
    for item in faq:
        if isinstance(item, dict) and item.get('question') and item.get('answer'):
            result.append({
                'question': str(item['question']).strip(),
                'answer': str(item['answer']).strip(),
            })
    return result[:5]


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'POST').upper()

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                **CORS_HEADERS,
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if method != 'POST':
        return _json_resp(405, {'error': 'Method not allowed'})

    # Парсим тело
    body_raw = event.get('body') or '{}'
    try:
        body = json.loads(body_raw)
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

            # Проверяем наличие колонки seo_faq
            has_seo_faq = _check_seo_faq_column(cur)

            # Получаем объект из БД
            if has_seo_faq:
                cur.execute(
                    f"SELECT id, title, description, category, deal, price, area, "
                    f"address, district, city, seo_faq "
                    f"FROM {SCHEMA}listings WHERE id = %s",
                    (listing_id,),
                )
            else:
                cur.execute(
                    f"SELECT id, title, description, category, deal, price, area, "
                    f"address, district, city "
                    f"FROM {SCHEMA}listings WHERE id = %s",
                    (listing_id,),
                )

            listing = cur.fetchone()
            if not listing:
                return _json_resp(404, {'error': 'Listing not found'})

            listing = dict(listing)

            # Кеш: если seo_faq уже есть в БД — возвращаем без вызова GPT
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

            # Генерируем FAQ через OpenAI
            try:
                faq = _generate_faq(listing)
            except json.JSONDecodeError as e:
                return _json_resp(502, {'error': f'GPT returned invalid JSON: {e}'})
            except openai.OpenAIError as e:
                return _json_resp(502, {'error': f'OpenAI error: {e}'})
            except Exception as e:
                return _json_resp(502, {'error': f'Generation failed: {e}'})

            if not faq:
                return _json_resp(502, {'error': 'GPT returned empty FAQ'})

            # Сохраняем в seo_faq если колонка существует
            if has_seo_faq:
                try:
                    cur.execute(
                        f"UPDATE {SCHEMA}listings SET seo_faq = %s WHERE id = %s",
                        (json.dumps(faq, ensure_ascii=False), listing_id),
                    )
                    conn.commit()
                except Exception:
                    conn.rollback()
                    # Не фатально — всё равно вернём FAQ

            return _json_resp(200, {'faq': faq, 'cached': False})

    finally:
        conn.close()
