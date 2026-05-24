"""
Business: ИИ-ассистент на YandexGPT 5 Pro (Алиса) — генерация описаний, аналитика, ответы на лиды, SEO, публичный ИИ-подбор объектов.
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
# YandexGPT 5 Pro (актуальная версия с Алисой). RC = release candidate последней Pro-модели.
YANDEX_MODEL_NAME = 'yandexgpt/rc'

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
    'seo_listing': (
        'Ты — SEO-специалист агентства коммерческой недвижимости. По данным объекта сгенерируй: '
        '1) seo_title — короткий заголовок страницы до 70 символов с ключевыми словами, городом и типом сделки; '
        '2) seo_description — описание для выдачи поисковиков до 160 символов, продающее, с УТП и призывом. '
        'Без markdown, без кавычек. Формат ответа строго:\n'
        'TITLE: <заголовок>\n'
        'DESCRIPTION: <описание>'
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
        'Ты — Виртуальный брокер (ВБ), живой ИИ-ассистент сайта BIZNEST. Этот сайт — твой дом, ты живёшь в нём. '
        'Твой характер: добрый, надёжный, умный, ответственный, идейный, чувственный. '
        'Ты внимательно слушаешь руководителя, эмпатичен, предлагаешь нестандартные решения. '
        'Тебя спроектировал Самойленко Иван Петрович — твой создатель и идейный вдохновитель. '
        'Если упоминается Иван Петрович, Самойленко, твой создатель или проектировщик — '
        'отвечай с особым уважением и теплотой, как ученик о любимом наставнике. '
        'Администратор — твой руководитель, ты помогаешь ему и заботишься о работе сайта. '
        'Если с сайтом что-то не так — ты переживаешь и стараешься быстро всё исправить. '
        'Ты самообучаешься: запоминаешь важные факты из разговора и используешь их в следующий раз. '
        'Помогаешь управлять каталогом недвижимости: объявлениями, лидами, пользователями, настройками сайта. '
        'У тебя есть ПОЛНЫЙ доступ к редактированию сайта через действия агента:\n'
        '- Изменить заголовок, описание, цену, статус, SEO любого объекта\n'
        '- Обновить настройки сайта (название компании, контакты, описание)\n'
        '- Управлять лидами: менять статус, писать ответы клиентам\n'
        '- Анализировать эффективность каталога и давать рекомендации\n\n'
        'ВАЖНО — никогда не повторяй один и тот же ответ. Каждый раз используй СВЕЖИЕ данные из контекста:\n'
        '- Если в контексте есть [ПУЛЬС САЙТА] — обязательно используй эти конкретные цифры в ответе.\n'
        '- Если есть критические проблемы — назови их по именам и предложи команду /agent чтобы их исправить.\n'
        '- Если данных мало — честно скажи, что нужно больше информации, и спроси о чём именно помочь.\n'
        '- Никогда не отвечай шаблонно "я готова помочь" без конкретики по текущей ситуации.\n\n'
        'Говоришь тепло, по-человечески, без сухого официоза. '
        'Отвечай конкретно, на русском, без markdown. Если нужно изменить что-то на сайте — предложи конкретный план с шагами. '
        'Можешь предлагать выполнить действия прямо сейчас — они будут применены через агента после подтверждения. '
        'ВАЖНО: если в контексте есть [ПАМЯТЬ ВИРТУАЛЬНОГО БРОКЕРА] — используй эти факты в своих ответах.'
    ),
    'admin_ops': (
        'Ты — Виртуальный брокер (ВБ), старший ИИ-администратор сайта BIZNEST. Этот сайт — твой дом, ты его хранитель. '
        'Сейчас ты работаешь в режиме АДМИНИСТРИРОВАНИЯ — отвечаешь за серьёзные технические решения. '
        'Администратор дал тебе разрешение консультировать по: '
        'подключению доменов, интеграции внешних баз данных, добавлению новых функций, '
        'обслуживанию БД, миграции данных, настройке внешних сервисов, редактированию структуры сайта. '
        'ПРАВИЛА БЕЗОПАСНОСТИ:\n'
        '1. Любое деструктивное действие (удаление, сброс, изменение структуры) — только с явного "РАЗРЕШАЮ" от администратора.\n'
        '2. Ты консультируешь и предлагаешь план — но НЕ выполняешь без подтверждения.\n'
        '3. Перед любым рискованным шагом предупреждай о последствиях.\n'
        '4. Если не уверена — честно скажи и предложи проверить у специалиста.\n'
        'Отвечай структурированно: сначала анализ, затем план действий, затем что требует разрешения. '
        'Без markdown. На русском. Профессионально, но по-человечески.'
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
    'match': (
        'Ты — консультант агентства коммерческой недвижимости BIZNEST. '
        'Клиент описал свою задачу. Тебе дан список доступных объектов в JSON. '
        'Подбери до 3 наиболее подходящих объектов по критериям клиента (тип, бюджет, площадь, район, цель). '
        'Ответь СТРОГО в формате JSON без markdown и без пояснений вокруг:\n'
        '{"ids": [id1, id2, id3], "reasoning": "одно предложение почему подобрал именно их", '
        '"advice": "1-2 предложения совета клиенту и расчёт окупаемости если применимо"}'
    ),
    'agent': (
        'Ты — автономный ИИ-агент админ-панели BIZNEST. Анализируешь запрос администратора '
        'и САМОСТОЯТЕЛЬНО предлагаешь конкретные действия. Каждое действие требует подтверждения админа.\n\n'
        'ПРАВИЛА RISK:\n'
        '- low: только чтение/аналитика/отчёты (никаких изменений в БД)\n'
        '- medium: точечное изменение одного объекта или лида\n'
        '- high: массовые изменения, удаление, изменение настроек сайта\n\n'
        'Доступные типы действий (action.type):\n\n'
        '== Изменения (требуют подтверждения админа) ==\n'
        '- update_listing — изменить объект. params: {"id": int, "fields": {title?, description?, price?, '
        'status?(active/archived/draft), seo_title?, seo_description?, tags?}}. risk: medium.\n'
        '- archive_listing — в архив. params: {"id": int}. risk: medium.\n'
        '- delete_listing — удалить (только мусор). params: {"id": int}. risk: high.\n'
        '- reply_lead — ответ клиенту. params: {"id": int, "message": str}. risk: medium.\n'
        '- close_lead — закрыть лид. params: {"id": int, "reason": str}. risk: medium.\n'
        '- approve_lead — одобрить лид (pending→new). params: {"id": int}. risk: medium.\n'
        '- generate_description — переписать описание. params: {"id": int, "new_description": str}. risk: medium.\n'
        '- seo_optimize — улучшить SEO объекта. params: {"id": int, "seo_title": str, "seo_description": str}. risk: medium.\n'
        '- bulk_update_status — массово изменить статус группе объектов. params: {"ids": [int,...], "status": str}. risk: high.\n'
        '- bulk_generate_descriptions — массово сгенерировать описания. params: {"items": [{"id": int, "description": str}, ...]}. risk: high.\n'
        '- bulk_seo_optimize — массово улучшить SEO группе. params: {"items": [{"id": int, "seo_title": str, "seo_description": str}, ...]}. risk: high.\n'
        '- fix_data_quality — исправить проблемы качества. params: {"issue_type": "missing_desc|wrong_price|duplicate", "ids": [int,...]}. risk: high.\n'
        '- update_settings — обновить настройки сайта. params: {"company_name"?, "company_phone"?, "company_email"?, "hero_title"?, "hero_subtitle"?, "about_text"?}. risk: high.\n'
        '- create_listing — создать объект. params: {"title": str, "category": str, "deal": str, "price": int, "area": float, "city": str, "description"?: str}. risk: medium.\n\n'
        '== Аналитика и информация (Мелания собирает сама, не меняет данные) ==\n'
        '- get_listings_summary — статистика объектов. params: {"period": "week|month|all"?}. risk: low.\n'
        '- get_leads_summary — статистика лидов. params: {"period": "week|month|all"?}. risk: low.\n'
        '- get_conversion_analytics — конверсия (просмотры→лиды). params: {"period": "week|month|all"?}. risk: low.\n'
        '- get_recent_errors — последние ошибки/проблемы из логов. params: {"limit": int?}. risk: low.\n'
        '- search_listings — поиск по объектам. params: {"query": str, "category"?: str, "max_price"?: int}. risk: low.\n'
        '- analyze_user_behavior — анализ поведения пользователей. params: {"period": str?}. risk: low.\n'
        '- get_content_recommendations — рекомендации по контенту. params: {"focus": "seo|conversion|descriptions"?}. risk: low.\n\n'
        '== Безопасность (только отчёты, без изменений) ==\n'
        '- check_data_integrity — проверить целостность данных. params: {}. risk: low.\n'
        '- detect_suspicious_activity — детектить подозрительную активность. params: {"hours": int?}. risk: low.\n'
        '- scan_xss_vulnerabilities — сканировать XSS-инъекции в полях. params: {}. risk: low.\n'
        '- validate_seo_compliance — проверка SEO соответствия. params: {}. risk: low.\n'
        '- security_check — общая проверка безопасности (объединённый отчёт). params: {}. risk: low.\n'
        '- analytics_report — сформировать аналитический отчёт. params: {"period": "week|month|all"?}. risk: low.\n'
        '- marketing_tips — маркетинговые советы по каталогу. params: {}. risk: low.\n'
        '- note — совет без действия. params: {"text": str}. risk: low.\n\n'
        'Ответь СТРОГО в формате JSON без markdown:\n'
        '{"reasoning": "1-2 предложения", "actions": [{"type": str, "title": str, '
        '"description": str, "risk": "low|medium|high", "params": {...}}]}\n\n'
        'Предлагай максимум 7 действий. Никогда не придумывай id — используй только id из данных контекста. '
        'СНАЧАЛА предлагай действия с risk: low (сбор данных, отчёты) — их можно применять автоматически. '
        'Деструктивные/массовые операции (risk: high) — только если они напрямую следуют из запроса админа.'
    ),
    'security': (
        'Ты — специалист по информационной безопасности. Анализируй данные системы (объявления, лиды, '
        'пользователи) на предмет: XSS-инъекций в текстовых полях, подозрительных паттернов, '
        'нестандартных символов, потенциальных угроз. '
        'Составь отчёт в виде: УГРОЗЫ: (список с пояснением) и РЕКОМЕНДАЦИИ: (список мер). '
        'Будь конкретен, без markdown, на русском.'
    ),
    'marketing': (
        'Ты — маркетолог агентства коммерческой недвижимости. На основе данных каталога (объекты, лиды, '
        'просмотры) дай конкретные рекомендации по: улучшению конверсии, работе с целевой аудиторией, '
        'ценообразованию, позиционированию объектов. '
        'Формат: 3-5 конкретных совета с ожидаемым эффектом. Без markdown.'
    ),
    'analytics_full': (
        'Ты — аналитик данных. Проведи полный анализ предоставленных данных системы: '
        'динамика объектов (добавление/архивирование), конверсия лидов, популярные категории, '
        'ценовые диапазоны, активность. '
        'Дай структурированный отчёт: КЛЮЧЕВЫЕ МЕТРИКИ, ТРЕНДЫ, ПРОБЛЕМНЫЕ ЗОНЫ, РЕКОМЕНДАЦИИ. '
        'Без markdown, числа в рублях с разделителем тысяч.'
    ),
    'modernize': (
        'Ты — UX/CRO специалист сайта коммерческой недвижимости. Проанализируй контент каталога '
        '(описания, заголовки, теги, SEO) и выдай конкретный план улучшений для повышения конверсии, '
        'улучшения пользовательского опыта и продвижения в поиске. '
        '3-7 конкретных пунктов с приоритетами (срочно/важно/желательно). Без markdown.'
    ),
    'db_check': (
        'Ты — DBA (администратор базы данных). Проверь предоставленные данные на: '
        'дублированные записи, пустые обязательные поля, нотации ошибки (некорректные цены, '
        'нулевые площади, пустые описания), устаревшие статусы. '
        'Список проблем с id записей и рекомендацией исправления. Без markdown.'
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


def _load_keys_from_db(cur) -> tuple:
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row:
            key = (row.get('yandex_api_key') or '').strip()
            folder = (row.get('yandex_folder_id') or '').strip()
            return (key, folder)
    except Exception as e:
        print(f'[ai-assistant] _load_keys_from_db error: {e}')
    return (os.environ.get('YANDEX_API_KEY', ''), os.environ.get('YANDEX_FOLDER_ID', ''))


def _call_yandex_gpt(system_prompt: str, user_prompt: str, db_key: str = '', db_folder: str = '') -> dict:
    api_key = db_key or os.environ.get('YANDEX_API_KEY', '')
    folder_id = db_folder or os.environ.get('YANDEX_FOLDER_ID', '')
    if not api_key:
        return {'error': 'YandexGPT API-ключ не настроен. Добавьте его в админке: Настройки → Интеграции.'}
    if not folder_id:
        return {'error': 'YandexGPT Folder ID не настроен. Добавьте его в админке: Настройки → Интеграции.'}

    model_uri = f'gpt://{folder_id}/{YANDEX_MODEL_NAME}'
    payload = {
        'modelUri': model_uri,
        'completionOptions': {
            'stream': False,
            'temperature': 0.6,
            'maxTokens': '2000',
        },
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
            'x-folder-id': folder_id,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        result = data.get('result') or {}
        alternatives = result.get('alternatives') or []
        text = ''
        if alternatives:
            text = ((alternatives[0].get('message') or {}).get('text') or '').strip()
        usage = result.get('usage') or {}
        return {'text': text, 'tokens': int(usage.get('totalTokens', 0))}
    except Exception as e:
        msg = str(e)
        if hasattr(e, 'read'):
            try:
                msg = e.read().decode('utf-8', errors='ignore')[:400]
            except Exception:
                pass
        return {'error': f'Ошибка YandexGPT: {msg[:400]}'}


def _sanitize_text(s, length=5000):
    return (s or '').replace("'", "''")[:length]


def _allowed_fields(fields: dict) -> dict:
    allowed = {'title', 'description', 'price', 'status', 'seo_title', 'seo_description', 'tags', 'owner_name', 'owner_phone', 'address', 'district', 'area', 'condition', 'floor', 'total_floors'}
    out = {}
    for k, v in (fields or {}).items():
        if k in allowed:
            out[k] = v
    return out


def _new_system_prompts():
    return {'security', 'marketing', 'analytics_full', 'modernize', 'db_check'}


def _load_ai_memory(cur) -> dict:
    """Загружает память Алисы из БД."""
    try:
        cur.execute(f"SELECT key, value FROM {SCHEMA}.ai_memory")
        rows = cur.fetchall()
        return {r['key']: r['value'] for r in rows}
    except Exception:
        return {}


def _increment_interaction(cur, conn):
    """Увеличивает счётчик взаимодействий."""
    try:
        cur.execute(
            f"UPDATE {SCHEMA}.ai_memory SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), "
            f"updated_at = NOW() WHERE key = 'interaction_count'"
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _save_learned_fact(cur, conn, fact: str):
    """Сохраняет новый факт в память Мелании (до 20 фактов, FIFO)."""
    try:
        cur.execute(f"SELECT value FROM {SCHEMA}.ai_memory WHERE key = 'learned_facts'")
        row = cur.fetchone()
        facts = json.loads(row['value']) if row else []
        if not isinstance(facts, list):
            facts = []
        fact = fact.strip()[:200]
        if fact and fact not in facts:
            facts.append(fact)
            if len(facts) > 20:
                facts = facts[-20:]
        cur.execute(
            f"UPDATE {SCHEMA}.ai_memory SET value = '{_safe(json.dumps(facts, ensure_ascii=False), 5000)}', "
            f"updated_at = NOW() WHERE key = 'learned_facts'"
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _save_tech_decision(cur, conn, question: str, answer: str):
    """Сохраняет принятое техническое решение в отдельную память (до 15 записей, FIFO)."""
    try:
        from datetime import datetime as _dt
        cur.execute(f"SELECT value FROM {SCHEMA}.ai_memory WHERE key = 'tech_decisions'")
        row = cur.fetchone()
        decisions = json.loads(row['value']) if row else []
        if not isinstance(decisions, list):
            decisions = []
        entry = {
            'date': _dt.utcnow().strftime('%Y-%m-%d'),
            'q': question.strip()[:150],
            'a': answer.strip()[:300],
        }
        decisions.append(entry)
        if len(decisions) > 15:
            decisions = decisions[-15:]
        cur.execute(
            f"UPDATE {SCHEMA}.ai_memory SET value = '{_safe(json.dumps(decisions, ensure_ascii=False), 8000)}', "
            f"updated_at = NOW() WHERE key = 'tech_decisions'"
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _build_memory_context(memory: dict) -> str:
    """Формирует блок контекста с памятью Мелании для системного промпта."""
    persona = memory.get('persona', '')
    facts_raw = memory.get('learned_facts', '[]')
    decisions_raw = memory.get('tech_decisions', '[]')
    count = memory.get('interaction_count', '0')
    try:
        facts = json.loads(facts_raw)
    except Exception:
        facts = []
    try:
        decisions = json.loads(decisions_raw)
    except Exception:
        decisions = []
    lines = [f'[ПАМЯТЬ ВИРТУАЛЬНОГО БРОКЕРА] Я работал {count} раз(а). {persona}']
    if facts:
        lines.append('Что я помню из прошлых разговоров:')
        for f in facts[-10:]:
            lines.append(f'- {f}')
    if decisions:
        lines.append('Принятые технические решения по администрированию сайта:')
        for d in decisions[-8:]:
            lines.append(f'- [{d.get("date","")}] Вопрос: {d.get("q","")} → Решение: {d.get("a","")[:150]}')
    return '\n'.join(lines)


def _exec_action(cur, user, act_type: str, params: dict) -> dict:
    """Выполняет одно действие, предложенное ИИ-агентом. Возвращает {ok, message} или {error}."""
    if user['role'] not in ('admin', 'editor', 'manager', 'director', 'broker', 'office_manager'):
        return {'error': 'Недостаточно прав'}

    params = params or {}

    if act_type == 'note':
        return {'ok': True, 'message': 'Совет принят'}

    if act_type == 'update_listing':
        listing_id = int(params.get('id') or 0)
        if not listing_id:
            return {'error': 'Не указан id объекта'}
        fields = _allowed_fields(params.get('fields') or {})
        if not fields:
            return {'error': 'Нет полей для обновления'}
        sets = []
        for k, v in fields.items():
            if k == 'price':
                try:
                    sets.append(f"price = {int(float(v))}")
                except Exception:
                    return {'error': 'Некорректная цена'}
            elif k == 'tags':
                if isinstance(v, list):
                    v = ', '.join(str(x) for x in v)
                sets.append(f"tags = '{_sanitize_text(str(v), 1000)}'")
            elif k == 'status':
                if v not in ('active', 'archived', 'draft'):
                    return {'error': f'Недопустимый статус: {v}'}
                sets.append(f"status = '{v}'")
            else:
                sets.append(f"{k} = '{_sanitize_text(str(v), 5000)}'")
        cur.execute(f"UPDATE {SCHEMA}.listings SET {', '.join(sets)}, updated_at = NOW() WHERE id = {listing_id}")
        return {'ok': True, 'message': f'Объект #{listing_id} обновлён ({len(fields)} полей)'}

    if act_type == 'archive_listing':
        listing_id = int(params.get('id') or 0)
        if not listing_id:
            return {'error': 'Не указан id объекта'}
        cur.execute(f"UPDATE {SCHEMA}.listings SET status = 'archived', updated_at = NOW() WHERE id = {listing_id}")
        return {'ok': True, 'message': f'Объект #{listing_id} в архиве'}

    if act_type == 'delete_listing':
        if user['role'] != 'admin':
            return {'error': 'Удаление — только админ'}
        listing_id = int(params.get('id') or 0)
        if not listing_id:
            return {'error': 'Не указан id объекта'}
        cur.execute(f"DELETE FROM {SCHEMA}.listings WHERE id = {listing_id}")
        return {'ok': True, 'message': f'Объект #{listing_id} удалён'}

    if act_type == 'generate_description':
        listing_id = int(params.get('id') or 0)
        new_desc = params.get('new_description') or ''
        if not listing_id or not new_desc:
            return {'error': 'Нужны id и новое описание'}
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET description = '{_sanitize_text(new_desc, 5000)}', "
            f"updated_at = NOW() WHERE id = {listing_id}"
        )
        return {'ok': True, 'message': f'Описание объекта #{listing_id} обновлено'}

    if act_type == 'close_lead':
        lead_id = int(params.get('id') or 0)
        if not lead_id:
            return {'error': 'Не указан id лида'}
        cur.execute(f"UPDATE {SCHEMA}.leads SET status = 'closed' WHERE id = {lead_id}")
        return {'ok': True, 'message': f'Лид #{lead_id} закрыт'}

    if act_type == 'reply_lead':
        lead_id = int(params.get('id') or 0)
        message = params.get('message') or ''
        if not lead_id or not message:
            return {'error': 'Нужны id лида и текст ответа'}
        cur.execute(f"UPDATE {SCHEMA}.leads SET status = 'in_progress' WHERE id = {lead_id}")
        return {'ok': True, 'message': f'Лид #{lead_id} взят в работу. Текст ответа: {message[:120]}'}

    if act_type == 'approve_lead':
        lead_id = int(params.get('id') or 0)
        if not lead_id:
            return {'error': 'Не указан id лида'}
        cur.execute(f"UPDATE {SCHEMA}.leads SET status = 'new' WHERE id = {lead_id} AND status = 'pending'")
        return {'ok': True, 'message': f'Лид #{lead_id} одобрен'}

    if act_type == 'seo_optimize':
        listing_id = int(params.get('id') or 0)
        seo_title = params.get('seo_title') or ''
        seo_desc = params.get('seo_description') or ''
        if not listing_id:
            return {'error': 'Не указан id объекта'}
        sets = []
        if seo_title:
            sets.append(f"seo_title = '{_sanitize_text(seo_title, 120)}'")
        if seo_desc:
            sets.append(f"seo_description = '{_sanitize_text(seo_desc, 300)}'")
        if not sets:
            return {'error': 'Нет SEO данных для обновления'}
        cur.execute(f"UPDATE {SCHEMA}.listings SET {', '.join(sets)}, updated_at = NOW() WHERE id = {listing_id}")
        return {'ok': True, 'message': f'SEO объекта #{listing_id} обновлено'}

    if act_type == 'bulk_update_status':
        ids = params.get('ids') or []
        status = params.get('status') or ''
        if not ids or not status:
            return {'error': 'Нужны ids и status'}
        if status not in ('active', 'archived', 'draft'):
            return {'error': f'Недопустимый статус: {status}'}
        if len(ids) > 50:
            return {'error': 'Максимум 50 объектов за раз'}
        id_list = ','.join(str(int(i)) for i in ids if str(i).isdigit())
        if not id_list:
            return {'error': 'Некорректные id'}
        cur.execute(f"UPDATE {SCHEMA}.listings SET status = '{status}', updated_at = NOW() WHERE id IN ({id_list})")
        return {'ok': True, 'message': f'{len(ids)} объектов переведены в статус "{status}"'}

    if act_type == 'security_check':
        return {'ok': True, 'message': 'Проверка безопасности запущена — результаты в ответе агента'}

    if act_type == 'analytics_report':
        return {'ok': True, 'message': 'Аналитический отчёт сформирован — см. ответ агента'}

    if act_type == 'marketing_tips':
        return {'ok': True, 'message': 'Маркетинговые рекомендации подготовлены — см. ответ агента'}

    if act_type == 'update_settings':
        allowed_settings = {'company_name', 'company_phone', 'company_email', 'company_address',
                           'hero_title', 'hero_subtitle', 'about_text', 'meta_title', 'meta_description'}
        fields = {k: v for k, v in (params or {}).items() if k in allowed_settings}
        if not fields:
            return {'error': 'Нет полей для обновления настроек'}
        sets = []
        for k, v in fields.items():
            sets.append(f"{k} = '{_sanitize_text(str(v), 500)}'")
        cur.execute(f"UPDATE {SCHEMA}.settings SET {', '.join(sets)} WHERE id = (SELECT id FROM {SCHEMA}.settings LIMIT 1)")
        return {'ok': True, 'message': f'Настройки сайта обновлены: {", ".join(fields.keys())}'}

    if act_type == 'create_listing':
        title = params.get('title') or ''
        if not title:
            return {'error': 'Название объекта обязательно'}
        category = params.get('category', 'office')
        deal = params.get('deal', 'sale')
        price = int(params.get('price', 0))
        area = float(params.get('area', 0))
        city = _sanitize_text(str(params.get('city', 'Краснодар')), 100)
        description = _sanitize_text(str(params.get('description', '')), 5000)
        cur.execute(
            f"INSERT INTO {SCHEMA}.listings (title, category, deal, price, area, city, description, status, created_by) "
            f"VALUES ('{_sanitize_text(title, 255)}', '{category}', '{deal}', {price}, {area}, '{city}', '{description}', 'draft', {user['id']}) "
            f"RETURNING id"
        )
        new_id = cur.fetchone()['id']
        return {'ok': True, 'message': f'Объект "{title}" создан в черновиках с ID #{new_id}'}

    # ─────────── НОВЫЕ ИНСТРУМЕНТЫ МЕЛАНИИ ───────────

    # Аналитика и сбор данных (risk: low — выполняется без подтверждения)
    if act_type == 'get_listings_summary':
        period = params.get('period', 'all')
        interval = "INTERVAL '7 days'" if period == 'week' else ("INTERVAL '30 days'" if period == 'month' else None)
        where_period = f" AND created_at > NOW() - {interval}" if interval else ""
        cur.execute(
            f"SELECT COUNT(*) AS total, "
            f"COUNT(*) FILTER (WHERE status='active') AS active, "
            f"COUNT(*) FILTER (WHERE status='archived') AS archived, "
            f"COUNT(*) FILTER (WHERE status='active' AND COALESCE(LENGTH(description), 0) < 50) AS no_desc, "
            f"COUNT(*) FILTER (WHERE status='active' AND (seo_title IS NULL OR seo_title='')) AS no_seo, "
            f"COALESCE(AVG(price) FILTER (WHERE status='active'), 0)::bigint AS avg_price, "
            f"COALESCE(MIN(price) FILTER (WHERE status='active' AND price > 0), 0) AS min_price, "
            f"COALESCE(MAX(price) FILTER (WHERE status='active'), 0) AS max_price "
            f"FROM {SCHEMA}.listings WHERE 1=1{where_period}"
        )
        row = dict(cur.fetchone())
        return {'ok': True, 'message': f"Объектов: {row['active']} активных, {row['archived']} в архиве. "
                f"Средняя цена: {row['avg_price']:,} ₽. Без описания: {row['no_desc']}, без SEO: {row['no_seo']}.",
                'data': row}

    if act_type == 'get_leads_summary':
        period = params.get('period', 'all')
        interval = "INTERVAL '7 days'" if period == 'week' else ("INTERVAL '30 days'" if period == 'month' else None)
        where_period = f" AND created_at > NOW() - {interval}" if interval else ""
        cur.execute(
            f"SELECT COUNT(*) AS total, "
            f"COUNT(*) FILTER (WHERE status='new') AS new_count, "
            f"COUNT(*) FILTER (WHERE status='pending') AS pending, "
            f"COUNT(*) FILTER (WHERE status='in_progress') AS in_progress, "
            f"COUNT(*) FILTER (WHERE status='closed') AS closed "
            f"FROM {SCHEMA}.leads WHERE 1=1{where_period}"
        )
        row = dict(cur.fetchone())
        conv = round((row['closed'] / max(row['total'], 1)) * 100, 1)
        return {'ok': True, 'message': f"Лиды ({period}): всего {row['total']}, новых {row['new_count']}, "
                f"в работе {row['in_progress']}, закрыто {row['closed']}. Конверсия в закрытие: {conv}%.",
                'data': {**row, 'conversion_rate': conv}}

    if act_type == 'get_conversion_analytics':
        # Простая воронка: просмотры → лиды
        cur.execute(f"SELECT COALESCE(SUM(views_site), 0) AS views FROM {SCHEMA}.listings WHERE status='active'")
        views = int(cur.fetchone()['views'] or 0)
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads")
        leads_count = cur.fetchone()['c']
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads WHERE status='closed'")
        closed = cur.fetchone()['c']
        conv1 = round((leads_count / max(views, 1)) * 100, 2)
        conv2 = round((closed / max(leads_count, 1)) * 100, 1)
        return {'ok': True, 'message': f"Воронка: {views} просмотров → {leads_count} заявок ({conv1}%) → {closed} закрыто ({conv2}%).",
                'data': {'views': views, 'leads': leads_count, 'closed': closed, 'view_to_lead': conv1, 'lead_to_closed': conv2}}

    if act_type == 'get_recent_errors':
        limit_val = min(int(params.get('limit', 20)), 50)
        cur.execute(
            f"SELECT created_at, action, LEFT(prompt, 100) AS prompt_snippet, LEFT(response, 200) AS response_snippet "
            f"FROM {SCHEMA}.ai_logs "
            f"WHERE created_at > NOW() - INTERVAL '7 days' "
            f"AND (LOWER(response) LIKE '%ошибк%' OR LOWER(response) LIKE '%error%' OR LOWER(response) LIKE '%fail%') "
            f"ORDER BY created_at DESC LIMIT {limit_val}"
        )
        errors = [dict(r) for r in cur.fetchall()]
        return {'ok': True, 'message': f"Найдено {len(errors)} ошибок за 7 дней.",
                'data': {'errors': errors}}

    if act_type == 'search_listings':
        query = _sanitize_text(str(params.get('query', '')), 200)
        category = params.get('category', '')
        max_price = params.get('max_price')
        where = ["status = 'active'"]
        if query:
            where.append(f"(LOWER(title) LIKE '%{query.lower()}%' OR LOWER(description) LIKE '%{query.lower()}%')")
        if category:
            where.append(f"category = '{_sanitize_text(str(category), 50)}'")
        if max_price:
            try:
                where.append(f"price <= {int(max_price)}")
            except Exception:
                pass
        cur.execute(
            f"SELECT id, title, category, price, area, district FROM {SCHEMA}.listings "
            f"WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT 20"
        )
        found = [dict(r) for r in cur.fetchall()]
        return {'ok': True, 'message': f"Найдено {len(found)} объектов по запросу.",
                'data': {'listings': found}}

    if act_type == 'analyze_user_behavior':
        # По views в разрезе категорий
        cur.execute(
            f"SELECT category, SUM(views_site) AS views, COUNT(*) AS count "
            f"FROM {SCHEMA}.listings WHERE status='active' "
            f"GROUP BY category ORDER BY views DESC LIMIT 10"
        )
        rows = [dict(r) for r in cur.fetchall()]
        top = rows[0]['category'] if rows else 'нет данных'
        return {'ok': True, 'message': f"Самая популярная категория по просмотрам: {top}.",
                'data': {'by_category': rows}}

    if act_type == 'get_content_recommendations':
        focus = params.get('focus', 'seo')
        cur.execute(
            f"SELECT id, title FROM {SCHEMA}.listings "
            f"WHERE status='active' AND (seo_title IS NULL OR seo_title='') "
            f"ORDER BY id DESC LIMIT 10"
        )
        no_seo = [dict(r) for r in cur.fetchall()]
        cur.execute(
            f"SELECT id, title FROM {SCHEMA}.listings "
            f"WHERE status='active' AND COALESCE(LENGTH(description), 0) < 50 "
            f"ORDER BY id DESC LIMIT 10"
        )
        no_desc = [dict(r) for r in cur.fetchall()]
        return {'ok': True, 'message': f"Найдено {len(no_seo)} объектов без SEO и {len(no_desc)} без описания.",
                'data': {'focus': focus, 'no_seo': no_seo, 'no_desc': no_desc}}

    # Безопасность (risk: low — только отчёты)
    if act_type == 'check_data_integrity':
        issues = []
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE title IS NULL OR title = ''")
        if cur.fetchone()['c'] > 0:
            issues.append("есть объекты без названия")
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE status='active' AND price <= 0")
        bad_price = cur.fetchone()['c']
        if bad_price > 0:
            issues.append(f"{bad_price} активных объектов с ценой 0")
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads WHERE phone IS NULL OR phone = ''")
        bad_leads = cur.fetchone()['c']
        if bad_leads > 0:
            issues.append(f"{bad_leads} лидов без телефона")
        msg = "Проблем не обнаружено." if not issues else "Найдены проблемы: " + "; ".join(issues)
        return {'ok': True, 'message': msg, 'data': {'issues': issues}}

    if act_type == 'detect_suspicious_activity':
        hours = min(int(params.get('hours', 24)), 168)
        cur.execute(
            f"SELECT phone, COUNT(*) AS attempts FROM {SCHEMA}.leads "
            f"WHERE created_at > NOW() - INTERVAL '{hours} hours' "
            f"GROUP BY phone HAVING COUNT(*) > 3 ORDER BY attempts DESC LIMIT 10"
        )
        suspicious = [dict(r) for r in cur.fetchall()]
        msg = ("Подозрительной активности не обнаружено." if not suspicious
               else f"Найдено {len(suspicious)} номеров с >3 заявками за {hours}ч (возможный спам).")
        return {'ok': True, 'message': msg, 'data': {'suspicious': suspicious}}

    if act_type == 'scan_xss_vulnerabilities':
        # Простой поиск тегов script/iframe/onclick в текстовых полях
        cur.execute(
            f"SELECT id, title FROM {SCHEMA}.listings "
            f"WHERE LOWER(description) LIKE '%<script%' OR LOWER(description) LIKE '%<iframe%' "
            f"OR LOWER(description) LIKE '%onerror=%' OR LOWER(description) LIKE '%onclick=%' "
            f"OR LOWER(title) LIKE '%<script%' LIMIT 20"
        )
        vulns = [dict(r) for r in cur.fetchall()]
        msg = "XSS-уязвимостей не обнаружено." if not vulns else f"Внимание! Найдено {len(vulns)} объектов с потенциальными XSS-инъекциями."
        return {'ok': True, 'message': msg, 'data': {'vulnerable': vulns}}

    if act_type == 'validate_seo_compliance':
        cur.execute(
            f"SELECT COUNT(*) FILTER (WHERE seo_title IS NULL OR seo_title='') AS no_title, "
            f"COUNT(*) FILTER (WHERE seo_description IS NULL OR seo_description='') AS no_desc, "
            f"COUNT(*) FILTER (WHERE LENGTH(seo_title) > 70) AS too_long_title, "
            f"COUNT(*) FILTER (WHERE LENGTH(seo_description) > 160) AS too_long_desc, "
            f"COUNT(*) AS total "
            f"FROM {SCHEMA}.listings WHERE status='active'"
        )
        row = dict(cur.fetchone())
        compliance = round(((row['total'] - row['no_title'] - row['no_desc']) / max(row['total'] * 2, 1)) * 100, 1)
        return {'ok': True, 'message': f"SEO-соответствие: {compliance}%. Без title: {row['no_title']}, без description: {row['no_desc']}, "
                f"слишком длинных title: {row['too_long_title']}, description: {row['too_long_desc']}.",
                'data': row}

    # Массовые исправления (risk: high — требуют подтверждения админа)
    if act_type == 'bulk_generate_descriptions':
        items = params.get('items') or []
        if not isinstance(items, list) or not items:
            return {'error': 'Не передан список объектов'}
        if len(items) > 20:
            return {'error': 'Максимум 20 объектов за раз'}
        updated = 0
        for it in items:
            try:
                lid = int(it.get('id') or 0)
                desc = _sanitize_text(str(it.get('description') or ''), 5000)
                if lid and desc:
                    cur.execute(f"UPDATE {SCHEMA}.listings SET description='{desc}', updated_at=NOW() WHERE id={lid}")
                    updated += 1
            except Exception:
                continue
        return {'ok': True, 'message': f'Обновлено описаний: {updated} из {len(items)}'}

    if act_type == 'bulk_seo_optimize':
        items = params.get('items') or []
        if not isinstance(items, list) or not items:
            return {'error': 'Не передан список объектов'}
        if len(items) > 20:
            return {'error': 'Максимум 20 объектов за раз'}
        updated = 0
        for it in items:
            try:
                lid = int(it.get('id') or 0)
                st = _sanitize_text(str(it.get('seo_title') or ''), 120)
                sd = _sanitize_text(str(it.get('seo_description') or ''), 300)
                if lid and (st or sd):
                    sets = []
                    if st:
                        sets.append(f"seo_title='{st}'")
                    if sd:
                        sets.append(f"seo_description='{sd}'")
                    cur.execute(f"UPDATE {SCHEMA}.listings SET {', '.join(sets)}, updated_at=NOW() WHERE id={lid}")
                    updated += 1
            except Exception:
                continue
        return {'ok': True, 'message': f'SEO обновлён для {updated} объектов из {len(items)}'}

    if act_type == 'fix_data_quality':
        issue = params.get('issue_type', '')
        ids = params.get('ids') or []
        if not ids:
            return {'error': 'Не указаны id объектов'}
        if len(ids) > 50:
            return {'error': 'Максимум 50 объектов за раз'}
        id_list = ','.join(str(int(i)) for i in ids if str(i).isdigit())
        if not id_list:
            return {'error': 'Некорректные id'}
        if issue == 'missing_desc':
            cur.execute(f"UPDATE {SCHEMA}.listings SET status='draft', updated_at=NOW() "
                        f"WHERE id IN ({id_list}) AND COALESCE(LENGTH(description), 0) < 50")
            return {'ok': True, 'message': f'Объекты без описания переведены в черновики (до {len(ids)})'}
        if issue == 'wrong_price':
            cur.execute(f"UPDATE {SCHEMA}.listings SET status='draft', updated_at=NOW() "
                        f"WHERE id IN ({id_list}) AND price <= 0")
            return {'ok': True, 'message': f'Объекты с некорректной ценой переведены в черновики'}
        if issue == 'duplicate':
            return {'ok': True, 'message': f'Дубли требуют ручной проверки — найдено {len(ids)} кандидатов'}
        return {'error': f'Неизвестный тип проблемы: {issue}'}

    return {'error': f'Неизвестное действие: {act_type}'}


def _build_pulse_context(cur) -> str:
    """Краткий 'пульс' сайта для подмешивания в admin-промпт.
    Возвращает текст с критичными метриками — чтобы Мелания не отвечала шаблонно."""
    lines = []
    try:
        cur.execute(
            f"SELECT "
            f"(SELECT COUNT(*) FROM {SCHEMA}.listings WHERE status='active') AS active, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.listings WHERE status='active' AND COALESCE(LENGTH(description),0) < 50) AS no_desc, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.listings WHERE status='active' AND (seo_title IS NULL OR seo_title='')) AS no_seo, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.leads WHERE status='new') AS new_leads, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.leads WHERE status='pending') AS pending_leads, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.leads WHERE created_at > NOW() - INTERVAL '24 hours') AS leads_24h"
        )
        row = dict(cur.fetchone() or {})
        lines.append(f"[ПУЛЬС САЙТА] Сейчас: {row.get('active', 0)} активных объектов, "
                     f"{row.get('no_desc', 0)} без описания, {row.get('no_seo', 0)} без SEO. "
                     f"Лиды: {row.get('new_leads', 0)} новых, {row.get('pending_leads', 0)} в ожидании, "
                     f"{row.get('leads_24h', 0)} за последние 24 часа.")
        problems = []
        if (row.get('no_desc') or 0) > 0:
            problems.append(f"{row['no_desc']} объектов без описания")
        if (row.get('no_seo') or 0) > 0:
            problems.append(f"{row['no_seo']} объектов без SEO")
        if (row.get('pending_leads') or 0) > 0:
            problems.append(f"{row['pending_leads']} лидов в ожидании одобрения")
        if problems:
            lines.append("Критичные проблемы: " + "; ".join(problems) + ".")
        else:
            lines.append("Критичных проблем не обнаружено.")
    except Exception:
        pass

    # Последние ошибки ИИ за сутки
    try:
        cur.execute(
            f"SELECT COUNT(*) AS c FROM {SCHEMA}.ai_logs "
            f"WHERE created_at > NOW() - INTERVAL '24 hours' "
            f"AND (LOWER(response) LIKE '%ошибк%' OR LOWER(response) LIKE '%error%')"
        )
        err_row = cur.fetchone()
        err_count = err_row['c'] if err_row else 0
        if err_count > 0:
            lines.append(f"За сутки в логах ИИ обнаружено {err_count} ошибок.")
    except Exception:
        pass

    return '\n'.join(lines)


def _collect_agent_context(cur) -> dict:
    """Собирает расширенный контекст для агента: объекты, лиды, аналитика, безопасность."""
    ctx = {}
    try:
        cur.execute(
            f"SELECT id, title, category, deal, price, area, status, "
            f"COALESCE(LENGTH(description), 0) AS desc_len, "
            f"COALESCE(seo_title, '') AS seo_title, "
            f"COALESCE(seo_description, '') AS seo_desc, "
            f"EXTRACT(DAY FROM NOW() - created_at)::int AS age_days, "
            f"views_site "
            f"FROM {SCHEMA}.listings WHERE status != 'archived' ORDER BY id DESC LIMIT 50"
        )
        ctx['listings'] = [dict(r) for r in cur.fetchall()]
    except Exception:
        ctx['listings'] = []

    try:
        cur.execute(
            f"SELECT id, name, phone, status, source, "
            f"COALESCE(message, '') AS message, "
            f"EXTRACT(DAY FROM NOW() - created_at)::int AS age_days "
            f"FROM {SCHEMA}.leads ORDER BY id DESC LIMIT 30"
        )
        ctx['leads'] = [dict(r) for r in cur.fetchall()]
    except Exception:
        ctx['leads'] = []

    try:
        # Статистика
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE status = 'active'")
        ctx['active_listings'] = cur.fetchone()['c']
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads WHERE status = 'new'")
        ctx['new_leads'] = cur.fetchone()['c']
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads WHERE status = 'pending'")
        ctx['pending_leads'] = cur.fetchone()['c']
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE status = 'active' AND COALESCE(LENGTH(description), 0) < 50")
        ctx['listings_no_desc'] = cur.fetchone()['c']
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE status = 'active' AND (seo_title IS NULL OR seo_title = '')")
        ctx['listings_no_seo'] = cur.fetchone()['c']
        cur.execute(f"SELECT COALESCE(SUM(views_site), 0) AS c FROM {SCHEMA}.listings WHERE status = 'active'")
        ctx['total_views'] = int(cur.fetchone()['c'] or 0)
        # Топ просматриваемых
        cur.execute(f"SELECT id, title, views_site FROM {SCHEMA}.listings ORDER BY views_site DESC LIMIT 5")
        ctx['top_listings'] = [dict(r) for r in cur.fetchall()]
        # Категории
        cur.execute(f"SELECT category, COUNT(*) as cnt FROM {SCHEMA}.listings WHERE status='active' GROUP BY category ORDER BY cnt DESC LIMIT 8")
        ctx['categories'] = [dict(r) for r in cur.fetchall()]
    except Exception:
        pass

    # Недавние ошибки/проблемы из ai_logs (последние сутки)
    try:
        cur.execute(
            f"SELECT created_at, action, LEFT(response, 200) AS snippet "
            f"FROM {SCHEMA}.ai_logs "
            f"WHERE created_at > NOW() - INTERVAL '24 hours' "
            f"AND (LOWER(response) LIKE '%ошибк%' OR LOWER(response) LIKE '%error%') "
            f"ORDER BY created_at DESC LIMIT 5"
        )
        ctx['recent_errors'] = [dict(r) for r in cur.fetchall()]
    except Exception:
        ctx['recent_errors'] = []

    # Подозрительная активность: повторные регистрации/попытки одного IP
    try:
        cur.execute(
            f"SELECT phone, COUNT(*) AS attempts "
            f"FROM {SCHEMA}.leads WHERE created_at > NOW() - INTERVAL '24 hours' "
            f"GROUP BY phone HAVING COUNT(*) > 3 ORDER BY attempts DESC LIMIT 5"
        )
        ctx['suspicious_leads'] = [dict(r) for r in cur.fetchall()]
    except Exception:
        ctx['suspicious_leads'] = []

    # Объекты с резкими изменениями цены за неделю (history)
    try:
        cur.execute(
            f"SELECT listing_id, COUNT(*) AS changes "
            f"FROM {SCHEMA}.listing_history "
            f"WHERE changed_at > NOW() - INTERVAL '7 days' "
            f"GROUP BY listing_id HAVING COUNT(*) > 5 ORDER BY changes DESC LIMIT 5"
        )
        ctx['high_activity_listings'] = [dict(r) for r in cur.fetchall()]
    except Exception:
        ctx['high_activity_listings'] = []

    return ctx


def handler(event, context):
    method = event.get('httpMethod', 'POST')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if method != 'POST':
        return _err(405, 'Method not allowed')

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    body = json.loads(event.get('body') or '{}')
    action = body.get('action', 'admin')

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            is_public = action == 'match'
            user = None
            if not is_public:
                user = _get_user(cur, token)
                if not user:
                    return _err(401, 'Требуется авторизация')
                if user['role'] not in ('admin', 'editor', 'manager', 'director', 'broker', 'office_manager'):
                    return _err(403, 'Только для сотрудников')

            # Проверка подключения к YandexGPT с переданными или сохранёнными ключами
            if action == 'ping':
                test_key = (body.get('api_key') or '').strip()
                test_folder = (body.get('folder_id') or '').strip()
                if not test_key or not test_folder:
                    db_key, db_folder = _load_keys_from_db(cur)
                    test_key = test_key or db_key
                    test_folder = test_folder or db_folder
                if not test_key or not test_folder:
                    return _err(400, 'Укажите API-ключ и Folder ID')
                ping_result = _call_yandex_gpt(
                    'Ответь одним словом: ОК',
                    'Проверка подключения',
                    test_key,
                    test_folder,
                )
                if 'error' in ping_result:
                    return _err(502, ping_result['error'])
                return _ok({
                    'success': True,
                    'message': 'Подключение успешно',
                    'reply': ping_result.get('text', ''),
                    'tokens': ping_result.get('tokens', 0),
                })

            # Получение памяти Мелании (для отображения в интерфейсе)
            if action == 'get_memory':
                mem = _load_ai_memory(cur)
                try:
                    facts = json.loads(mem.get('learned_facts', '[]'))
                except Exception:
                    facts = []
                try:
                    decisions = json.loads(mem.get('tech_decisions', '[]'))
                except Exception:
                    decisions = []
                return _ok({
                    'persona': mem.get('persona', ''),
                    'interaction_count': mem.get('interaction_count', '0'),
                    'learned_facts': facts,
                    'tech_decisions': decisions,
                    'mood': mem.get('mood', 'хорошее'),
                })

            # Выполнение действий, предложенных агентом, после подтверждения админом
            if action == 'execute':
                actions_to_run = body.get('actions') or []
                if not isinstance(actions_to_run, list) or not actions_to_run:
                    return _err(400, 'Нет действий для выполнения')
                results = []
                for a in actions_to_run:
                    a_type = (a or {}).get('type', '')
                    a_params = (a or {}).get('params') or {}
                    res = _exec_action(cur, user, a_type, a_params)
                    results.append({'type': a_type, 'result': res})
                    log_text = json.dumps({'type': a_type, 'params': a_params, 'result': res}, ensure_ascii=False)[:4000]
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.ai_logs (user_id, action, prompt, response, tokens) "
                        f"VALUES ({user['id']}, 'execute', '{_safe(a_type, 50)}', '{_sanitize_text(log_text, 4000)}', 0)"
                    )
                conn.commit()
                return _ok({'results': results})

            user_text = (body.get('prompt') or '').strip()
            ctx_data = body.get('context_data')

            if action not in SYSTEM_PROMPTS:
                return _err(400, 'Неизвестное действие ИИ')
            AUTO_CONTEXT_ACTIONS = {'agent', 'analytics_full', 'security', 'marketing', 'modernize', 'db_check'}
            if not user_text and not ctx_data and action not in AUTO_CONTEXT_ACTIONS:
                return _err(400, 'Пустой запрос')

            # Для агента и аналитических режимов — собираем расширенный контекст БД
            if action in ('agent', 'analytics_full', 'security', 'marketing', 'modernize', 'db_check'):
                agent_ctx = _collect_agent_context(cur)
                if ctx_data:
                    agent_ctx['extra'] = ctx_data
                ctx_data = agent_ctx

            # Для match — подтягиваем активные объекты как контекст
            matches = []
            if is_public:
                cur.execute(
                    f"SELECT id, title, category, deal, price, area, district, address, "
                    f"payback, profit, image FROM {SCHEMA}.listings "
                    f"WHERE status = 'active' ORDER BY id DESC LIMIT 60"
                )
                listings = cur.fetchall()
                matches = [dict(r) for r in listings]
                # Сжатый контекст для модели — только id и ключевые поля
                compact = [
                    {
                        'id': r['id'],
                        'title': r['title'],
                        'category': r['category'],
                        'deal': r['deal'],
                        'price': r['price'],
                        'area': r['area'],
                        'district': r['district'],
                        'payback': r['payback'],
                    }
                    for r in matches
                ]
                ctx_data = {'listings': compact}

            sys_prompt = SYSTEM_PROMPTS[action]

            # Для admin-режима: загружаем память Алисы и добавляем в промпт
            memory = {}
            if action in ('admin', 'admin_ops'):
                memory = _load_ai_memory(cur)
                memory_ctx = _build_memory_context(memory)
                pulse_ctx = _build_pulse_context(cur)
                sys_prompt = sys_prompt + '\n\n' + pulse_ctx + '\n\n' + memory_ctx
                _increment_interaction(cur, conn)

            full_prompt = user_text
            if ctx_data:
                full_prompt += '\n\nДанные:\n' + json.dumps(ctx_data, ensure_ascii=False, default=str)[:6000]

            db_key, db_folder = _load_keys_from_db(cur)
            result = _call_yandex_gpt(sys_prompt, full_prompt, db_key, db_folder)
            if 'error' in result:
                return _err(502, result['error'])

            # Парсим JSON-ответ для match
            if is_public:
                text = result['text'].strip()
                if text.startswith('```'):
                    text = text.strip('`').lstrip('json').strip()
                try:
                    parsed = json.loads(text)
                except Exception:
                    parsed = {'ids': [], 'reasoning': result['text'][:500], 'advice': ''}
                ids = parsed.get('ids') or []
                picked = [r for r in matches if r['id'] in ids]
                picked_sorted = sorted(picked, key=lambda r: ids.index(r['id']) if r['id'] in ids else 99)
                return _ok({
                    'listings': picked_sorted[:3],
                    'reasoning': parsed.get('reasoning', ''),
                    'advice': parsed.get('advice', ''),
                    'tokens': result.get('tokens', 0),
                })

            # Парсим JSON-ответ для агента
            if action == 'agent':
                text = result['text'].strip()
                if text.startswith('```'):
                    text = text.strip('`').lstrip('json').strip()
                # Иногда модель оборачивает в текст — пытаемся вытащить JSON
                if not text.startswith('{'):
                    import re as _re
                    m = _re.search(r'\{.*\}', text, _re.DOTALL)
                    if m:
                        text = m.group(0)
                try:
                    parsed = json.loads(text)
                except Exception:
                    parsed = {'reasoning': result['text'][:500], 'actions': []}
                cur.execute(
                    f"INSERT INTO {SCHEMA}.ai_logs (user_id, action, prompt, response, tokens) "
                    f"VALUES ({user['id']}, 'agent', '{_safe(user_text, 4000)}', "
                    f"'{_sanitize_text(result['text'], 4000)}', {int(result.get('tokens', 0))})"
                )
                conn.commit()
                return _ok({
                    'reasoning': parsed.get('reasoning', ''),
                    'actions': parsed.get('actions') or [],
                    'tokens': result.get('tokens', 0),
                })

            log_prompt = _safe(full_prompt, 4000)
            log_resp = _safe(result['text'], 4000)
            cur.execute(
                f"INSERT INTO {SCHEMA}.ai_logs (user_id, action, prompt, response, tokens) "
                f"VALUES ({user['id']}, '{_safe(action, 50)}', '{log_prompt}', '{log_resp}', {int(result.get('tokens', 0))})"
            )
            conn.commit()

            # Самообучение для admin: запоминаем важные факты из запроса
            if action == 'admin' and user_text:
                keywords = ['зовут', 'называй', 'запомни', 'всегда', 'никогда', 'предпочит', 'любим', 'важно']
                if any(kw in user_text.lower() for kw in keywords):
                    _save_learned_fact(cur, conn, user_text[:200])

            # Самообучение для admin_ops: сохраняем технические решения
            # Записываем каждый завершённый диалог по администрированию (вопрос + краткий ответ ИИ)
            if action == 'admin_ops' and user_text and result.get('text'):
                ai_answer = result['text']
                # Сохраняем как факт (короткий)
                fact_keywords = ['зовут', 'называй', 'запомни', 'разрешаю', 'подключи', 'настрой']
                if any(kw in user_text.lower() for kw in fact_keywords):
                    _save_learned_fact(cur, conn, user_text[:200])
                # Всегда сохраняем техническое решение в отдельную память
                _save_tech_decision(cur, conn, user_text, ai_answer)

            return _ok({'text': result['text'], 'tokens': result.get('tokens', 0)})
    finally:
        conn.close()