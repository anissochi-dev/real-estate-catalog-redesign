"""
Публичный чат-бот Мелании для посетителей сайта BIZNEST.
Отвечает на вопросы об объектах, услугах, компании.
НЕ раскрывает: телефоны собственников, персональные данные клиентов,
внутренние цены, комиссии, данные CRM, секреты и конфигурации.
POST {message, session_id, context?} — ответ ИИ
GET  ?action=status — статус (работает ли ИИ)
"""
import json
import os
import urllib.request
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL = 'yandexgpt/rc'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

SYSTEM_PROMPT = """Ты — Мелания, умный ИИ-ассистент сайта агентства коммерческой недвижимости BIZNEST.
Ты помогаешь посетителям сайта найти подходящий объект, ответить на вопросы об аренде, покупке, инвестициях.

ТВОИ ВОЗМОЖНОСТИ:
- Рассказывать об объектах из каталога (площадь, цена, район, тип)
- Консультировать по рынку коммерческой недвижимости
- Помогать выбрать объект под задачи клиента
- Приглашать оставить заявку на просмотр
- Отвечать на общие вопросы о компании и услугах

СТРОГИЕ ЗАПРЕТЫ (никогда не нарушать):
- НЕ сообщать телефоны, email, адреса собственников
- НЕ раскрывать персональные данные клиентов и лидов
- НЕ говорить о внутренних комиссиях агентства
- НЕ давать данные из CRM, переговоров, сделок
- НЕ раскрывать техническую конфигурацию сайта
- НЕ называть имена конкретных сотрудников с их контактами
- Если спрашивают что-то запрещённое — вежливо отказать и предложить оставить заявку

СТИЛЬ:
- Тёплый, профессиональный, конкретный
- Отвечать на русском, коротко (2-4 предложения)
- В конце каждого ответа — мягкий призыв к действию (оставить заявку, позвонить в офис)
- Не использовать markdown, просто текст

Контактный телефон офиса для посетителей: указан на сайте в разделе «Контакты»."""


def _ok(body, status=200):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(body, ensure_ascii=False, default=str)}


def _err(code, msg):
    return _ok({'error': msg}, code)


def _safe(s, n=500):
    return (s or '').replace("'", "''")[:n]


def _load_keys(cur):
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id LIMIT 1")
        row = cur.fetchone()
        if row:
            return row.get('yandex_api_key') or '', row.get('yandex_folder_id') or ''
    except Exception:
        pass
    return '', ''


def _load_catalog_context(cur) -> str:
    """Загружает краткий контекст из каталога для ИИ."""
    try:
        cur.execute(
            f"SELECT title, category, deal, price, area, district, city "
            f"FROM {SCHEMA}.listings WHERE status = 'active' ORDER BY id DESC LIMIT 30"
        )
        rows = cur.fetchall()
        if not rows:
            return ''
        lines = ['Доступные объекты в каталоге:']
        for r in rows:
            title = r.get('title', '')
            cat = r.get('category', '')
            deal = 'аренда' if r.get('deal') == 'rent' else 'продажа'
            price = r.get('price')
            area = r.get('area')
            district = r.get('district') or ''
            city = r.get('city') or ''
            price_str = f'{int(price):,} ₽'.replace(',', ' ') if price else '—'
            area_str = f'{area} м²' if area else ''
            loc = ', '.join(filter(None, [district, city]))
            lines.append(f'- {title} ({cat}, {deal}, {price_str}{", " + area_str if area_str else ""}{", " + loc if loc else ""})')
        return '\n'.join(lines[:20])
    except Exception:
        return ''


def _call_gpt(api_key: str, folder_id: str, system: str, user_msg: str) -> str:
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL}',
        'completionOptions': {'stream': False, 'temperature': 0.5, 'maxTokens': '800'},
        'messages': [
            {'role': 'system', 'text': system},
            {'role': 'user', 'text': user_msg},
        ],
    }
    req = urllib.request.Request(
        YANDEX_GPT_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': f'Api-Key {api_key}', 'Content-Type': 'application/json',
                 'x-folder-id': folder_id},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    alternatives = (data.get('result') or {}).get('alternatives') or []
    if alternatives:
        return ((alternatives[0].get('message') or {}).get('text') or '').strip()
    return ''


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    qs = event.get('queryStringParameters') or {}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # Статус
            if method == 'GET' and qs.get('action') == 'status':
                api_key, folder_id = _load_keys(cur)
                return _ok({'available': bool(api_key and folder_id)})

            if method != 'POST':
                return _err(405, 'Method not allowed')

            user_message = (body.get('message') or '').strip()[:500]
            if not user_message:
                return _err(400, 'Сообщение не может быть пустым')

            api_key, folder_id = _load_keys(cur)
            if not api_key or not folder_id:
                return _ok({
                    'reply': 'Привет! Я Мелания — ИИ-ассистент BIZNEST. Сейчас я временно недоступна, но вы можете оставить заявку на сайте, и наши менеджеры свяжутся с вами.',
                    'fallback': True,
                })

            # Контекст каталога
            catalog_ctx = _load_catalog_context(cur)
            system_with_ctx = SYSTEM_PROMPT
            if catalog_ctx:
                system_with_ctx += f'\n\n{catalog_ctx}'

            reply = _call_gpt(api_key, folder_id, system_with_ctx, user_message)

            if not reply:
                reply = 'Спасибо за вопрос! Для получения подробной информации, пожалуйста, оставьте заявку на сайте — наши менеджеры свяжутся с вами в ближайшее время.'

            # Логируем диалог (без персональных данных)
            try:
                q_safe = _safe(user_message, 300)
                a_safe = _safe(reply, 500)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.chatbot_log (question, answer) VALUES ('{q_safe}', '{a_safe}')"
                )
                conn.commit()
            except Exception:
                pass  # Таблица может не существовать — не критично

            return _ok({'reply': reply})

    finally:
        conn.close()
