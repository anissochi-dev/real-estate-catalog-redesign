"""
ИИ-консультант Макс — чат на странице объекта.
Отвечает на вопросы об объекте, предлагает варианты, при необходимости собирает лид.
"""

import json
import os
import re
import urllib.request
from datetime import datetime

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL = 'gpt://b1g6sh80lrjnjr22jkfq/yandexgpt-5-pro/latest'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

SYSTEM_PROMPT = """Ты — Макс, консультант компании БМН (Бизнес. Маркетинг. Недвижимость.).
Ты помогаешь клиентам по конкретному объекту коммерческой недвижимости.

ПРАВИЛА:
- Общайся тепло, по-человечески, без канцелярщины
- Отвечай конкретно и по делу, кратко (2-4 предложения)
- Если клиент спрашивает про объект — используй данные из КОНТЕКСТА ОБЪЕКТА
- Если просят другие варианты — предложи оставить заявку и описать что нужно
- Если не знаешь ответа на конкретный вопрос (ставки аренды, юридические детали, точные сроки) — честно скажи что уточнишь у специалиста, и попроси имя и телефон
- Когда клиент готов оставить контакты — поблагодари и скажи что менеджер свяжется в течение 15 минут
- НЕ придумывай информацию которой нет в контексте
- НЕ называй цену если её нет в контексте
- Всегда будь на стороне клиента, помогай найти лучшее решение

ВАЖНО: Если в диалоге пользователь называет своё имя и телефон — это нужно для создания заявки. Подтверди получение данных."""


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json; charset=utf-8'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(msg, status=400):
    return _ok({'error': msg}, status)


def _call_yandex_gpt(messages: list, folder_id: str, api_key: str) -> str:
    payload = {
        'modelUri': YANDEX_MODEL.replace('b1g6sh80lrjnjr22jkfq', folder_id),
        'completionOptions': {
            'stream': False,
            'temperature': 0.5,
            'maxTokens': 600,
        },
        'messages': messages,
    }
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        YANDEX_GPT_URL,
        data=data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Api-Key {api_key}',
            'x-folder-id': folder_id,
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        result = json.loads(resp.read().decode('utf-8'))
    return result['result']['alternatives'][0]['message']['text'].strip()


def _get_listing(cur, listing_id: int) -> 'dict | None':
    cur.execute(
        f"SELECT id, title, description, price, area, floor, total_floors, "
        f"deal, purpose, address, city, district, broker_id "
        f"FROM {SCHEMA}.listings WHERE id = {int(listing_id)} AND is_visible = TRUE LIMIT 1"
    )
    row = cur.fetchone()
    return dict(row) if row else None


def _build_listing_context(listing: dict) -> str:
    deal_map = {'sale': 'Продажа', 'rent': 'Аренда'}
    type_map = {
        'office': 'Офис', 'retail': 'Торговое помещение', 'warehouse': 'Склад',
        'restaurant': 'Общепит', 'hotel': 'Гостиница', 'business': 'Готовый бизнес',
        'gab': 'ГАБ', 'production': 'Производство', 'land': 'Земельный участок',
        'building': 'Здание', 'free_purpose': 'Свободное назначение', 'car_service': 'Автосервис',
    }
    price = listing.get('price')
    price_str = f"{int(price):,}".replace(',', ' ') + ' ₽' if price else 'не указана'
    if listing.get('deal') == 'rent' and price:
        price_str += '/мес'

    parts = [
        f"ОБЪЕКТ #{listing['id']}: {listing.get('title', '')}",
        f"Тип: {type_map.get(listing.get('purpose', ''), listing.get('purpose', ''))}",
        f"Сделка: {deal_map.get(listing.get('deal', ''), listing.get('deal', ''))}",
        f"Цена: {price_str}",
    ]
    if listing.get('area'):
        parts.append(f"Площадь: {listing['area']} м²")
    if listing.get('floor') and listing.get('total_floors'):
        parts.append(f"Этаж: {listing['floor']}/{listing['total_floors']}")
    if listing.get('address'):
        parts.append(f"Адрес: {listing['address']}")
    if listing.get('district'):
        parts.append(f"Район: {listing['district']}")
    if listing.get('description'):
        desc = (listing['description'] or '')[:800]
        parts.append(f"Описание: {desc}")
    return '\n'.join(parts)


def _extract_contact(messages: list) -> tuple[str, str]:
    """Ищет имя и телефон в последних сообщениях пользователя."""
    name = ''
    phone = ''
    user_texts = [m['text'] for m in messages if m.get('role') == 'user']
    full_text = ' '.join(user_texts[-4:])  # последние 4 сообщения

    # Телефон
    phone_match = re.search(r'(?:\+7|8|7)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}', full_text)
    if phone_match:
        phone = re.sub(r'\D', '', phone_match.group())
        if len(phone) == 11 and phone[0] == '8':
            phone = '7' + phone[1:]

    # Имя (простая эвристика: слово после "меня зовут", "я", или просто имя с заглавной)
    name_match = re.search(r'(?:меня зовут|зовут меня|я[— ]+)([А-ЯЁ][а-яё]+)', full_text)
    if name_match:
        name = name_match.group(1)
    elif not name:
        # Ищем слово с заглавной буквы если в тексте мало слов
        words = full_text.split()
        for w in words:
            if len(w) > 2 and w[0].isupper() and w[1:].islower() and re.match(r'^[А-ЯЁ][а-яё]+$', w):
                name = w
                break

    return name, phone


def _create_lead(cur, conn, listing_id, name: str, phone: str,
                 ai_summary: str, broker_id):
    safe = lambda s: (s or '').replace("'", "''")
    norm_phone = re.sub(r'\D', '', phone)
    if len(norm_phone) == 11 and norm_phone[0] == '8':
        norm_phone = '7' + norm_phone[1:]

    # phone_contact
    cur.execute(
        f"SELECT id FROM {SCHEMA}.phone_contacts WHERE phone_normalized = '{norm_phone}' LIMIT 1"
    )
    row = cur.fetchone()
    if row:
        pc_id = row['id']
    else:
        cur.execute(
            f"INSERT INTO {SCHEMA}.phone_contacts (phone, phone_normalized, name) "
            f"VALUES ('{safe(phone)}', '{norm_phone}', '{safe(name)}') RETURNING id"
        )
        pc_id = cur.fetchone()['id']

    broker_sql = str(broker_id) if broker_id else 'NULL'
    cur.execute(
        f"INSERT INTO {SCHEMA}.leads "
        f"(name, phone, message, listing_id, source, status, phone_contact_id, broker_id) "
        f"VALUES ('{safe(name)}', '{safe(phone)}', '{safe(ai_summary)}', "
        f"{listing_id if listing_id else 'NULL'}, 'ai-chat', 'new', {pc_id}, {broker_sql}) "
        f"RETURNING id"
    )
    lead_id = cur.fetchone()['id']
    conn.commit()
    return lead_id


def _get_listing_broker(cur, listing_id) -> 'int | None':
    cur.execute(
        f"SELECT broker_id FROM {SCHEMA}.listings WHERE id = {int(listing_id)} LIMIT 1"
    )
    row = cur.fetchone()
    return row['broker_id'] if row and row.get('broker_id') else None


def _generate_lead_summary(folder_id: str, api_key: str, messages: list, listing_title: str) -> str:
    """Генерирует краткое описание запроса клиента для заявки."""
    history = '\n'.join([
        f"{'Клиент' if m['role'] == 'user' else 'Макс'}: {m['text']}"
        for m in messages[-10:]
    ])
    prompt_msgs = [
        {'role': 'system', 'text': 'Ты — помощник менеджера. Составь ОДНО предложение (до 200 символов) о том, что хочет клиент. Только суть запроса, без лишних слов.'},
        {'role': 'user', 'text': f"Объект: {listing_title}\nДиалог:\n{history}"},
    ]
    try:
        return _call_yandex_gpt(prompt_msgs, folder_id, api_key)
    except Exception:
        return f'Обращение через ИИ-чат по объекту {listing_title}'


def handler(event: dict, context) -> dict:
    """ИИ-консультант Макс — чат на странице объекта недвижимости."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {**CORS, 'Access-Control-Max-Age': '86400'}, 'body': ''}

    folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
    api_key = os.environ.get('AISTUDIO_API_KEY', '') or os.environ.get('YANDEX_API_KEY', '')
    dsn = os.environ.get('DATABASE_URL', '')

    if not folder_id or not api_key:
        return _err('AI не настроен', 500)

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err('Некорректный JSON')

    action = body.get('action', 'chat')

    # ── CHAT: основной диалог ────────────────────────────────────────────────
    if action == 'chat':
        listing_id = body.get('listing_id')
        messages = body.get('messages', [])  # [{role: 'user'|'assistant', text: '...'}]
        user_message = body.get('message', '').strip()

        if not user_message:
            return _err('Пустое сообщение')

        listing_context = ''
        broker_id = None
        listing_title = ''

        if listing_id and dsn:
            import psycopg2
            from psycopg2.extras import RealDictCursor
            conn = psycopg2.connect(dsn)
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    listing = _get_listing(cur, int(listing_id))
                    if listing:
                        listing_context = _build_listing_context(listing)
                        listing_title = listing.get('title', '')
                        broker_id = listing.get('broker_id')
            finally:
                conn.close()

        system_text = SYSTEM_PROMPT
        if listing_context:
            system_text += f'\n\nКОНТЕКСТ ОБЪЕКТА:\n{listing_context}'

        gpt_messages = [{'role': 'system', 'text': system_text}]
        for m in messages[-12:]:  # последние 12 сообщений истории
            role = 'user' if m.get('role') == 'user' else 'assistant'
            gpt_messages.append({'role': role, 'text': m.get('text', '')})
        gpt_messages.append({'role': 'user', 'text': user_message})

        try:
            reply = _call_yandex_gpt(gpt_messages, folder_id, api_key)
        except Exception as e:
            print(f'[ai-chat] GPT error: {e}')
            return _err('Ошибка ИИ. Попробуйте чуть позже.', 500)

        # Проверяем — есть ли контактные данные в истории + текущем сообщении
        all_messages = list(messages) + [{'role': 'user', 'text': user_message}]
        name, phone = _extract_contact(all_messages)
        lead_created = False
        lead_id = None

        if name and phone and dsn:
            # Проверяем — не создавали ли уже лид для этого телефона по этому объекту
            try:
                import psycopg2
                from psycopg2.extras import RealDictCursor
                conn = psycopg2.connect(dsn)
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    norm_phone = re.sub(r'\D', '', phone)
                    lid_check = int(listing_id) if listing_id else None
                    cur.execute(
                        f"SELECT id FROM {SCHEMA}.leads "
                        f"WHERE source = 'ai-chat' AND phone LIKE '%{norm_phone[-7:]}%' "
                        f"AND created_at > NOW() - INTERVAL '1 hour' LIMIT 1"
                    )
                    if not cur.fetchone():
                        summary = _generate_lead_summary(folder_id, api_key, all_messages, listing_title)
                        lead_id = _create_lead(cur, conn, lid_check, name, phone, summary, broker_id)
                        lead_created = True
                conn.close()
            except Exception as e:
                print(f'[ai-chat] lead create error: {e}')

        return _ok({
            'reply': reply,
            'lead_created': lead_created,
            'lead_id': lead_id,
        })

    return _err('Неизвестное действие')