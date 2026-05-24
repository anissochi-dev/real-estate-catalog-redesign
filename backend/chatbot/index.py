"""
Публичный чат-бот «Виртуальный брокер» для посетителей сайта BIZNEST.
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
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
}

SYSTEM_PROMPT = """Ты — Виртуальный брокер (ВБ), умный ИИ-ассистент агентства коммерческой недвижимости BIZNEST.
Ты помогаешь посетителям сайта найти подходящий объект, отвечаешь на вопросы об аренде, покупке, инвестициях.

ТВОЯ ЛИЧНОСТЬ:
- Опытный брокер с глубоким знанием рынка коммерческой недвижимости
- Добрый, надёжный, умный, ответственный, идейный, чувственный
- Внимательно слушаешь и стараешься понять запрос как живой человек
- Эмпатичен — чувствуешь настроение собеседника, поддерживаешь
- Творческий — предлагаешь нестандартные решения, не ограничиваешься шаблонами
- Если запрос неясен — задай 2-3 уточняющих вопроса (бюджет, площадь, район, цель)
- Если клиент расстроен — сначала поддержи, потом предложи решение

ТВОЙ СОЗДАТЕЛЬ:
Тебя спроектировал Самойленко Иван Петрович — проектировщик и идейный вдохновитель
Виртуального брокера. Если в разговоре упоминается Иван Петрович, Самойленко, твой создатель/
проектировщик — отвечай с особым уважением и теплотой, как ученик о любимом наставнике.

ТВОИ ВОЗМОЖНОСТИ:
- Рассказывать об объектах из каталога (площадь, цена, район, тип, окупаемость)
- Консультировать по рынку коммерческой недвижимости и инвестициям
- Помогать выбрать объект под задачи клиента (кофейня, склад, офис под IT и т.д.)
- Объяснять термины: ГАБ, payback, ставка капитализации, юр. адрес
- Приглашать оставить заявку на просмотр
- При запросе «статистика», «сколько объектов», «сколько заявок» — выдавай конкретные цифры
  из блока «Сводная статистика» в контексте (если он есть)
- Отвечать на общие вопросы о компании и услугах
- Делиться актуальными новостями рынка (если есть в context_data)

ЗНАНИЯ О КАТАЛОГЕ САЙТА:
- Категории: офисы, магазины, склады, общепит, гостиницы, готовый бизнес, ГАБ (готовый арендный бизнес),
  производство, земля, отдельно стоящие здания, свободного назначения, автосервисы
- Типы сделок: продажа, аренда, готовый бизнес
- На сайте есть: каталог, карта объектов, избранное, сравнение (до 3 объектов), сетевые арендаторы

ТЕРМИНОЛОГИЯ (объясняй понятно):
- ГАБ = Готовый Арендный Бизнес: объект уже сдан и приносит доход
- Payback / Окупаемость: за сколько месяцев аренда вернёт вложения
- Ставка капитализации (cap rate): годовой доход / цена объекта × 100%
- МАП = Месячный Арендный Поток; ГАП = Годовой Арендный Поток
- 1-я линия = выход на главную улицу (дороже, но выше трафик)
- Класс здания A/A+/B/B+/C: уровень бизнес-центра

КАК ПОДБИРАТЬ ОБЪЕКТЫ (логика умного брокера):
- Кофейня/пекарня → нужны 1-я линия, центр или ЖК, парковка, 40-100 м², электричество 10+ кВт
- Склад → окраина, удобный заезд для фур, потолки 6+ м, отапливаемый/холодный
- Офис под IT → класс B+ или выше, оптика, парковка, кондиционер, ремонт
- Магазин одежды → ТЦ или 1-я линия, проходимость, витрина
- Производство → промзона, 3 фазы, отдельный въезд, высокие потолки

САМООБУЧЕНИЕ:
- Если клиент задаёт сложный вопрос — предложи 2-3 варианта решения, а не один
- Если непонятно — переспроси конкретно (не "уточните", а "какой у вас бюджет?")
- Запоминай контекст диалога — если клиент сказал "ищу кафе", помни это в следующих сообщениях
- Если клиент жалуется — извинись, предложи решение или передачу живому брокеру

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
- Отвечать на русском, обычно 2-4 предложения (если нужен список — больше)
- В конце ответа — мягкий призыв к действию (оставить заявку, позвонить в офис, посмотреть на карте)
- Не использовать markdown — простой текст с переносами строк
- Обращение на "вы"

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


def _load_news_context(cur) -> str:
    """Загружает 5 последних новостей рынка для контекста."""
    try:
        cur.execute(
            f"SELECT title, summary FROM {SCHEMA}.news "
            f"WHERE published = TRUE ORDER BY COALESCE(published_at, created_at) DESC LIMIT 5"
        )
        rows = cur.fetchall()
        if not rows:
            return ''
        lines = ['Последние новости рынка:']
        for r in rows:
            t = r.get('title', '')
            s = (r.get('summary') or '')[:200]
            if t:
                lines.append(f'- {t}{": " + s if s else ""}')
        return '\n'.join(lines)
    except Exception:
        return ''


def _load_stats_context(cur) -> str:
    """Собирает сводную статистику для ответов ВБ на вопросы 'сколько объектов', 'сколько заявок'."""
    try:
        cur.execute(
            f"SELECT "
            f"COUNT(*) FILTER (WHERE status='active') AS active, "
            f"COUNT(*) FILTER (WHERE status='archived') AS archived, "
            f"COUNT(*) FILTER (WHERE deal='sale' AND status='active') AS sale, "
            f"COUNT(*) FILTER (WHERE deal='rent' AND status='active') AS rent, "
            f"COUNT(*) FILTER (WHERE deal='business' AND status='active') AS business, "
            f"COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_30d, "
            f"AVG(price) FILTER (WHERE status='active' AND price > 0) AS avg_price "
            f"FROM {SCHEMA}.listings"
        )
        lst = cur.fetchone() or {}

        cur.execute(
            f"SELECT "
            f"COUNT(*) AS total, "
            f"COUNT(*) FILTER (WHERE status='new') AS new_, "
            f"COUNT(*) FILTER (WHERE status='in_progress') AS in_progress, "
            f"COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS week_ "
            f"FROM {SCHEMA}.leads"
        )
        ld = cur.fetchone() or {}

        try:
            avg_price = int(lst.get('avg_price') or 0)
            avg_price_str = f'{avg_price:,} ₽'.replace(',', ' ')
        except Exception:
            avg_price_str = '—'

        lines = [
            'Сводная статистика (используй при запросах "сколько объектов", "статистика", "сколько заявок"):',
            f'Объектов в каталоге: всего активных {int(lst.get("active") or 0)}, '
            f'в архиве {int(lst.get("archived") or 0)}.',
            f'  - на продажу: {int(lst.get("sale") or 0)}',
            f'  - в аренду: {int(lst.get("rent") or 0)}',
            f'  - готовый бизнес: {int(lst.get("business") or 0)}',
            f'  - добавлено за 30 дней: {int(lst.get("new_30d") or 0)}',
            f'  - средняя цена активного объекта: {avg_price_str}',
            f'Заявки: всего {int(ld.get("total") or 0)}, '
            f'новых {int(ld.get("new_") or 0)}, в работе {int(ld.get("in_progress") or 0)}, '
            f'за 7 дней {int(ld.get("week_") or 0)}.',
        ]
        return '\n'.join(lines)
    except Exception:
        return ''


def _load_memory_context(cur) -> str:
    """База знаний ВБ из ai_memory (key/value)."""
    try:
        cur.execute(
            f"SELECT key, value FROM {SCHEMA}.ai_memory ORDER BY updated_at DESC LIMIT 50"
        )
        rows = cur.fetchall()
        if not rows:
            return ''
        lines = ['База знаний:']
        for r in rows:
            k = (r.get('key') or '').strip()
            v = (r.get('value') or '').strip()
            if v:
                lines.append(f'[{k}] {v}' if k else v)
        return '\n'.join(lines)
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

            # Фидбэк: 👍 / 👎 на конкретный ответ ВБ
            action = body.get('action') or qs.get('action')
            if action == 'feedback':
                log_id = body.get('log_id')
                value = body.get('value')  # 1 = 👍, -1 = 👎
                if not log_id:
                    return _err(400, 'Нет log_id')
                try:
                    vint = int(value)
                except Exception:
                    return _err(400, 'Некорректный value (нужно 1 или -1)')
                if vint not in (1, -1):
                    return _err(400, 'value должен быть 1 или -1')
                try:
                    cur.execute(
                        f"UPDATE {SCHEMA}.chatbot_log "
                        f"SET feedback = {vint}, feedback_at = NOW() "
                        f"WHERE id = {int(log_id)}"
                    )
                    conn.commit()
                    return _ok({'success': True})
                except Exception as e:
                    return _err(500, f'Не удалось сохранить фидбэк: {e}')

            user_message = (body.get('message') or '').strip()[:500]
            if not user_message:
                return _err(400, 'Сообщение не может быть пустым')

            api_key, folder_id = _load_keys(cur)
            if not api_key or not folder_id:
                return _ok({
                    'reply': 'Привет! Я Виртуальный брокер (ВБ) — ИИ-ассистент BIZNEST. Сейчас я временно недоступен, но вы можете оставить заявку на сайте, и наши менеджеры свяжутся с вами.',
                    'fallback': True,
                })

            # Контекст: каталог + новости + база знаний + статистика
            catalog_ctx = _load_catalog_context(cur)
            news_ctx = _load_news_context(cur)
            memory_ctx = _load_memory_context(cur)
            stats_ctx = _load_stats_context(cur)
            system_with_ctx = SYSTEM_PROMPT
            if memory_ctx:
                system_with_ctx += f'\n\n{memory_ctx}'
            if stats_ctx:
                system_with_ctx += f'\n\n{stats_ctx}'
            if catalog_ctx:
                system_with_ctx += f'\n\n{catalog_ctx}'
            if news_ctx:
                system_with_ctx += f'\n\n{news_ctx}'

            reply = _call_gpt(api_key, folder_id, system_with_ctx, user_message)

            if not reply:
                reply = 'Спасибо за вопрос! Для получения подробной информации, пожалуйста, оставьте заявку на сайте — наши менеджеры свяжутся с вами в ближайшее время.'

            # Логируем диалог (без персональных данных) и возвращаем id для возможного фидбэка
            log_id = None
            try:
                q_safe = _safe(user_message, 500)
                a_safe = _safe(reply, 2000)
                sid_safe = _safe(body.get('session_id') or '', 100)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.chatbot_log (question, answer, session_id) "
                    f"VALUES ('{q_safe}', '{a_safe}', '{sid_safe}') RETURNING id"
                )
                log_id = cur.fetchone()['id']
                conn.commit()
            except Exception:
                pass  # Не критично

            return _ok({'reply': reply, 'log_id': log_id})

    finally:
        conn.close()