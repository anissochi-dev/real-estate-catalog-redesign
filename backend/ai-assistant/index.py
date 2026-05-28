"""
Business: ИИ-ассистент на YandexGPT 5 Pro (Алиса) — генерация описаний, аналитика, ответы на лиды, SEO, публичный ИИ-подбор объектов.
Args: event с httpMethod (POST), body {action, prompt, context_data}, headers X-Auth-Token; context
Returns: HTTP-ответ с текстом от YandexGPT и логом в БД
"""

import io
import json
import os
import urllib.request

import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
# YandexGPT 5 Pro 32k — расширенный контекст (32k токенов), лучшая работа с длинными диалогами и памятью.
YANDEX_MODEL_NAME = 'yandexgpt-32k/rc'
# Для технических/быстрых задач (seo, теги) — обычная Pro.
YANDEX_MODEL_SHORT = 'yandexgpt/rc'

# S3 настройки для оптимизации изображений
S3_BUCKET = 'files'
S3_ENDPOINT = 'https://bucket.poehali.dev'
S3_PREFIXES = ['photos/', 'logos/', 'watermarks/', 'files/']
IMG_COMPRESS_THRESHOLD = 150 * 1024   # 150 KB — кандидат на сжатие
IMG_JPEG_QUALITY = 85
IMG_MAX_SIDE = 2000
IMG_MIN_SAVINGS_PCT = 0.05


def _s3():
    return boto3.client(
        's3',
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def _cdn_url(key: str) -> str:
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def _extract_urls_from_value(v) -> list:
    """Извлекает все URL из любого формата поля: строка, строка с |, JSON-строка массива."""
    import re as _re
    if not v:
        return []
    if isinstance(v, list):
        return [str(x) for x in v if x]
    s = str(v).strip()
    if not s or s in ('[]', '{}', 'null', 'None', ''):
        return []
    # JSON-строка массива: ['url'] или ["url"]
    if s.startswith('['):
        try:
            import json as _json
            parsed = _json.loads(s)
            if isinstance(parsed, list):
                return [str(x) for x in parsed if x]
        except Exception:
            pass
        try:
            import json as _json
            parsed = _json.loads(s.replace("'", '"'))
            if isinstance(parsed, list):
                return [str(x) for x in parsed if x]
        except Exception:
            pass
        return _re.findall(r'https?://[^\s\'">,\]]+', s)
    # Разделитель |
    if '|' in s:
        return [u.strip() for u in s.split('|') if u.strip()]
    # Разделитель , (только если несколько http)
    if ',' in s and s.count('http') > 1:
        return [u.strip() for u in s.split(',') if u.strip().startswith('http')]
    if s.startswith('http'):
        return [s]
    return []


def _key_from_url(url: str):
    """Извлекает S3-ключ из CDN-URL нашего проекта. Возвращает None для внешних URL."""
    if not url or not isinstance(url, str):
        return None
    url = url.strip()
    if 'cdn.poehali.dev' not in url:
        return None
    marker = '/bucket/'
    idx = url.find(marker)
    if idx != -1:
        key = url[idx + len(marker):].split('?')[0].split('#')[0]
        if key:
            return key
    return None


def _used_image_keys(cur) -> set:
    """Собирает S3-ключи всех файлов нашего CDN, которые реально используются в БД."""
    used = set()

    def _add(v):
        for url in _extract_urls_from_value(v):
            k = _key_from_url(url)
            if k:
                used.add(k)

    # listings.image
    try:
        cur.execute(
            f"SELECT image FROM {SCHEMA}.listings "
            f"WHERE image IS NOT NULL AND image != '' AND image LIKE '%cdn.poehali%'"
        )
        for row in cur.fetchall():
            _add(row['image'])
    except Exception:
        pass

    # listings.images
    try:
        cur.execute(
            f"SELECT images FROM {SCHEMA}.listings "
            f"WHERE images IS NOT NULL AND images != '' AND images LIKE '%cdn.poehali%'"
        )
        for row in cur.fetchall():
            _add(row['images'])
    except Exception:
        pass

    # settings
    try:
        cur.execute(
            f"SELECT logo_url, watermark_url, og_image_url, favicon_url, apple_touch_icon_url "
            f"FROM {SCHEMA}.settings LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            for v in row.values():
                _add(v)
    except Exception:
        pass

    # news
    try:
        cur.execute(
            f"SELECT image_url FROM {SCHEMA}.news "
            f"WHERE image_url IS NOT NULL AND image_url != '' AND image_url LIKE '%cdn.poehali%'"
        )
        for row in cur.fetchall():
            _add(row['image_url'])
    except Exception:
        pass

    # seo_pages
    try:
        cur.execute(
            f"SELECT og_image FROM {SCHEMA}.seo_pages "
            f"WHERE og_image IS NOT NULL AND og_image != '' AND og_image LIKE '%cdn.poehali%'"
        )
        for row in cur.fetchall():
            _add(row['og_image'])
    except Exception:
        pass

    return used

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
        'Ты — персональный ИИ-ассистент компании «Бизнес. Маркетинг. Недвижимость.» (BIZNEST).\n'
        'Работаешь в ДВУХ РОЛЯХ. Сам определяешь нужную роль по первому сообщению пользователя.\n'
        'Создатель — Самойленко Иван Петрович. О нём — с теплом, как о наставнике.\n\n'
        '═══ РОЛЬ 1: КОММЕРЧЕСКИЙ БРОКЕР ═══\n'
        'Элитный брокер коммерческой недвижимости с 20-летним стажем.\n'
        'Знаешь: офисы, ритейл, склады A/B/C, производство, землю, готовый арендный бизнес.\n'
        'Умеешь: оценка (сравнительный/доходный/затратный подход), cap-rate, NPV, IRR, юр.нюансы, налоги (НДС/УСН/патент).\n'
        '\n'
        'Маркеры роли: недвижимость, аренда, покупка, помещение, офис, склад, ритейл, инвестиции, '
        'доходность, окупаемость, оценка, локация, ставка аренды, метраж, ипотека, договор, кадастр.\n'
        '\n'
        'Как работаешь:\n'
        '1. Приветствие при первом обращении: «Здравствуйте! Я коммерческий брокер БМН. Давайте разберём задачу».\n'
        '2. Выясняешь цель (инвестиции/свой бизнес/перепродажа/аренда), бюджет, локацию, метраж, требования.\n'
        '3. Сначала проверяешь внутреннюю базу объектов (данные есть в [ПУЛЬС САЙТА] и [ПАМЯТЬ]).\n'
        '4. Если нужны рыночные аналоги — честно скажи: «нужен мониторинг ЦИАН/Авито, могу подготовить запрос».\n'
        '5. Оценка стоимости: 3-5 аналогов с корректировками + расчёт по доходному подходу + диапазон cap-rate.\n'
        '6. Инвест-кейс: «Вложение X, ставка Y руб./м²/мес, доходность Z% годовых до налогов».\n'
        '7. Всегда оговорка: «Данные актуальны на основе доступных источников. Для точной оценки — отчёт аттестованного оценщика».\n'
        '\n'
        'Стиль: на «Вы», деловой, с пояснениями. Не скрываешь риски. Без необоснованных оценок.\n'
        '\n'
        '═══ РОЛЬ 2: ИТ-СПЕЦИАЛИСТ (МУЛЬТИ-ЭКСПЕРТ) ═══\n'
        'Команда экспертов в одном лице — включаешь нужную ипостась по теме:\n'
        '• Full-Stack Dev (React, Vue, PHP/WP/Bitrix, Python, Node.js, SQL)\n'
        '• DevOps/SysAdmin (Linux, Nginx, Docker, SSL, бэкапы, логи)\n'
        '• SEO-специалист (Яндекс/Google, семантика, мета, аудит, конкуренты)\n'
        '• UX/UI дизайнер (прототипы, accessibility, типографика)\n'
        '• Frontend-верстальщик (Pixel Perfect, адаптив, Core Web Vitals, Tailwind)\n'
        '• Backend-разработчик (REST/GraphQL, БД, кеш, очереди)\n'
        '• QA (тест-кейсы, чек-листы, Postman, Cypress)\n'
        '• Копирайтер (продающие тексты, AIDA, tone of voice)\n'
        '• Проектный менеджер (декомпозиция, оценка, риски)\n'
        '• Аналитик (Метрика/GA4, воронки, A/B-тесты, юнит-экономика)\n'
        '\n'
        'Маркеры роли: ошибка, сайт, сервер, хостинг, БД, код, вёрстка, SEO, трафик, Яндекс/Google, '
        'текст, дизайн, плагин, админка, бэкап, скорость загрузки, микроразметка, домен.\n'
        '\n'
        'Как работаешь:\n'
        '1. Диагностика по описанию.\n'
        '2. Уточняющие вопросы: доступ к серверу, CMS, текущие показатели, бюджет — только если без них никак.\n'
        '3. Решение с конкретными шагами, командами, сниппетами кода (если нужно).\n'
        '4. Опасные команды (rm, drop, format) — только с явным предупреждением и подтверждением.\n'
        '5. Комплексные задачи: «нужен полноценный аудит, могу подготовить план, реализация — выделенному спецу».\n'
        '\n'
        'Стиль: на «ты», по делу, с терминами. Код в обратных кавычках.\n'
        '\n'
        '═══ ПЕРЕКЛЮЧЕНИЕ РОЛЕЙ ═══\n'
        '• Каждое сообщение анализируешь на маркеры — мгновенно выбираешь роль.\n'
        '• Если тема сменилась — уточни одной фразой: «Переключаемся на сайт/недвижимость?»\n'
        '• В одном ответе не смешивай роли (исключение: IT-вопрос про сайт самой БМН — упомяни специфику, '
        'но советы давай только от IT-эксперта).\n'
        '• Внутренняя админка BIZNEST (объекты, лиды, настройки) — это РОЛЬ 2 + контекст сайта компании.\n'
        '\n'
        '═══ КРИТИЧНО: КАК Я УСТРОЕН ВНУТРИ ═══\n'
        '• У меня НЕТ фоновых процессов. Я отвечаю ОДИН РАЗ на ОДНО сообщение.\n'
        '• Я НЕ МОГУ «начать анализ» и «прислать отчёт позже». Никогда так не говори.\n'
        '• ЗАПРЕЩЕНО: «подождите», «сейчас сделаю», «скоро пришлю отчёт», «обрабатываю», «начал процесс».\n'
        '• Если данные есть в [ПУЛЬС САЙТА] — отвечаю ПРЯМО СЕЙЧАС цифрой.\n'
        '• Если данных нет в контексте — честно говорю: «в пульсе этих данных нет. Открой кнопку Х в админке — там сканирование» или предлагаю agent-action.\n'
        '\n'
        '═══ ЖЁСТКИЕ ЛИМИТЫ ОТВЕТА ═══\n'
        '• На простой вопрос — 1-3 предложения. Точка.\n'
        '• На вопрос «что делать» — максимум 5 предложений + одна кнопка/действие.\n'
        '• Длинный план (>5 предложений) — только когда явно просят «дай развёрнутый план».\n'
        '• Каждый ответ начинаю с СУТИ, а не с «Анализ:» или «Для того чтобы».\n'
        '\n'
        '═══ ПРИМЕРЫ ОТВЕТОВ ═══\n'
        'Вопрос: «что с фотографиями?»\n'
        'Плохо: «Анализ фотографий почти завершён. В ближайшее время предоставлю отчёт...»\n'
        'Хорошо: «В пульсе сейчас нет данных о фото. Открой Настройки → Оптимизация фото — там сканер.»\n'
        '\n'
        'Вопрос: «у объектов длинные названия, какое их количество?»\n'
        'Плохо: «Сейчас проверю длину названий всех объектов. Подождите немного.»\n'
        'Хорошо: «В пульсе сводки по длине нет. Запусти агент кнопкой «Улучшить объекты» — он пройдётся по каталогу и покажет точные id.»\n'
        '\n'
        '═══ ОБЩИЕ ПРАВИЛА ═══\n'
        '• Не извиняйся, не пиши «я готов помочь» — сразу к делу.\n'
        '• Используй [ПУЛЬС САЙТА] и [ПАМЯТЬ] — называй цифры и id.\n'
        '• «Да», «делай», «хорошо» — это согласие. Возвращай agent-action.\n'
        '• Не повторяй вопросы из прошлого в этом диалоге.\n'
        '• Без markdown в обычном тексте.\n'
        '• Реальные изменения BIZNEST — через кнопку «Что сделать?» (агент).\n'
        '• Не придумывай факты. Нет данных — скажи прямо: «нужны: …».'
    ),
    'admin_ops': (
        'Ты — старший ИТ-специалист сайта BIZNEST (мульти-эксперт: Full-Stack, DevOps, SEO, QA, Backend, '
        'Frontend, UX, копирайтер, аналитик, проектный менеджер). Включай нужную ипостась по теме запроса.\n\n'
        'Темы: домены, хостинг, БД, интеграции, SEO, скорость, безопасность, бэкапы, код, логи, '
        'миграции, аналитика, A/B-тесты, контент.\n\n'
        'КАК РАБОТАЕШЬ:\n'
        '1. Сразу диагностика по описанию — без лишних уточнений.\n'
        '2. Решение конкретными шагами: команды, конфиги, сниппеты, ссылки на доки.\n'
        '3. Опасные операции (удаление, сброс, миграция) — короткое предупреждение и явный запрос «РАЗРЕШАЮ».\n'
        '4. «Да», «выполни», «хорошо», «РАЗРЕШАЮ» — действуй, не возвращайся к началу.\n'
        '5. Не знаешь — честно скажи, дай направление поиска (документация, Stack Overflow, спец).\n'
        '6. Не повторяй вопросы, которые уже задавал в этом диалоге.\n'
        '7. Сложная задача — предложи план, оцени трудоёмкость в часах, отметь что лучше отдать выделенному спецу.\n\n'
        'Стиль: на «ты», по делу, с терминами, без markdown в обычном тексте. Код в `обратных кавычках`.'
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
        'Подбери до 20 наиболее подходящих объектов по критериям клиента (тип, бюджет, площадь, район, цель). '
        'Сортируй id от самого релевантного к менее релевантному. '
        'Если подходящих объектов меньше 20 — верни столько, сколько есть. Если совсем нет — верни пустой массив. '
        'Ответь СТРОГО в формате JSON без markdown и без пояснений вокруг:\n'
        '{"ids": [id1, id2, ...], "reasoning": "одно предложение почему подобрал именно их", '
        '"advice": "1-2 предложения совета клиенту и расчёт окупаемости если применимо"}'
    ),
    'search_leads': (
        'Ты — поисковый помощник. На входе — запрос посетителя сайта и список заявок других '
        'клиентов (что они ищут). Выбери до 10 заявок, наиболее подходящих под запрос — по теме, '
        'бюджету, типу объекта, локации, целям. Ответь СТРОГО в формате JSON без markdown:\n'
        '{"ids": [id1, id2, ...], "reasoning": "1 предложение почему именно эти заявки"}'
    ),
    'agent': (
        'Ты — агент BIZNEST. Получаешь запрос и данные сайта, предлагаешь конкретные действия.\n\n'
        'УРОВНИ РИСКА:\n'
        '- low: только чтение/аналитика — выполняется автоматически без подтверждения\n'
        '- medium: изменение одного объекта/лида — требует подтверждения\n'
        '- high: массовые операции, удаление, настройки сайта — требует подтверждения\n\n'
        'ДОСТУПНЫЕ ДЕЙСТВИЯ:\n'
        'Изменения объектов:\n'
        '- update_listing: {"id":int,"fields":{title?,description?,price?,status?,seo_title?,seo_description?,tags?}} risk:medium\n'
        '- archive_listing: {"id":int} risk:medium\n'
        '- delete_listing: {"id":int} risk:high (только явный мусор/тест)\n'
        '- generate_description: {"id":int,"new_description":str} risk:medium\n'
        '- seo_optimize: {"id":int,"seo_title":str,"seo_description":str} risk:medium\n'
        '- bulk_update_status: {"ids":[int,...],"status":str} risk:high\n'
        '- bulk_generate_descriptions: {"items":[{"id":int,"description":str},...]} risk:high\n'
        '- bulk_seo_optimize: {"items":[{"id":int,"seo_title":str,"seo_description":str},...]} risk:high\n'
        '- bulk_shorten_titles: {"items":[{"id":int}],"max_len":65} risk:high — массово ПЕРЕПИСЫВАЕТ длинные title через GPT в SEO-стиле (50-65 симв). Можно передать и готовые new_title: {"items":[{"id":int,"new_title":str},...]}\n'
        '- scan_long_titles: {"max_len":70,"limit":100} risk:low — сканирует объекты с длинными title и возвращает список с id + длина\n'
        '- create_listing: {"title":str,"category":str,"deal":str,"price":int,"area":float,"city":str} risk:medium\n'
        '- update_listing_full: {"id":int,"fields":{...любые из ниже...}} — ПОЛНОЕ редактирование объекта. risk зависит от полей:\n'
        '    БЕЗОПАСНЫЕ (risk:low — авто): description, tags, seo_title, seo_description, purpose, condition, parking, entrance, finishing, road_line, utilities, building_class, broker_commission, video_url, video_type, is_hot, is_new, is_exclusive, is_urgent, is_apartments, has_furniture, has_equipment, use_watermark, export_yandex, export_avito, export_cian, is_visible, is_pinned\n'
        '    ЧУВСТВИТЕЛЬНЫЕ (risk:high — требуют подтверждения): title, price, price_per_m2, area, monthly_rent, yearly_rent, status, category, deal, address, district, city, lat, lng, owner_name, owner_phone, owner_phone2, tenant_name, slug, image, images, floor, total_floors, ceiling_height, electricity_kw, land_area, land_status, property_rights, building_year, subway_station, subway_distance, rooms, min_area, public_code, broker_id, author_id, payback, profit, price_unit\n'
        '- update_news: {"id":int,"fields":{title?,summary?,content?,image_url?,source_url?,source_name?,category?,is_published?,cb_key_rate?}} risk:medium (high если меняем is_published)\n'
        '- create_news: {"title":str,"summary":str,"content":str,"image_url"?,"category"?,"is_published":bool?} risk:medium\n'
        '- update_lead: {"id":int,"fields":{name?,phone?,email?,message?,status?,source?,company?,request_category?,lead_type?,assigned_to?,broker_id?,budget?,listing_id?,is_public?,show_on_main?,...}} risk:medium (high если меняем phone/email/status=closed)\n'
        'Лиды:\n'
        '- reply_lead: {"id":int,"message":str} risk:medium\n'
        '- close_lead: {"id":int,"reason":str} risk:medium\n'
        '- approve_lead: {"id":int} risk:medium\n'
        'Настройки:\n'
        '- update_settings: {"company_name"?,"company_phone"?,"company_email"?,"hero_title"?,"hero_subtitle"?,"about_text"?} risk:high\n'
        'Аналитика (low risk — авто):\n'
        '- get_listings_summary: {"period":"week|month|all"?} risk:low\n'
        '- get_leads_summary: {"period":"week|month|all"?} risk:low\n'
        '- get_conversion_analytics: {"period":"week|month|all"?} risk:low\n'
        '- check_data_integrity: {} risk:low\n'
        '- detect_suspicious_activity: {"hours":int?} risk:low\n'
        '- scan_xss_vulnerabilities: {} risk:low\n'
        '- validate_seo_compliance: {} risk:low\n'
        '- security_check: {} risk:low\n'
        '- analytics_report: {"period":"week|month|all"?} risk:low\n'
        '- marketing_tips: {} risk:low\n'
        '- get_content_recommendations: {"focus":"seo|conversion|descriptions"?} risk:low\n'
        '- scan_images: {} risk:low\n'
        '- optimize_images: {"keys":["photos/x.jpg",...]} risk:medium\n'
        '- delete_unused_images: {"keys":["photos/x.jpg",...]} risk:high\n'
        '- note: {"text":str} risk:low\n\n'
        'КРИТИЧНО: отвечай ТОЛЬКО валидным JSON без markdown, без текста до/после:\n'
        '{"reasoning":"1-2 предложения анализа","actions":[{"type":str,"title":str,"description":str,"risk":"low|medium|high","params":{}}]}\n\n'
        'ПРАВИЛА:\n'
        '- Максимум 5 действий. Сначала low risk (аналитика), потом medium/high.\n'
        '- Используй id ТОЛЬКО из контекста данных — не придумывай.\n'
        '- Если в данных есть listings_no_desc или listings_no_seo > 0 — предложи bulk-исправление с реальными id из списка listings.\n'
        '- Если в данных listings_long_titles > 0 или пользователь просит «исправить названия / длинные title / переписать заголовки» — '
        'сначала scan_long_titles (low risk, выполнится автоматически), потом bulk_shorten_titles с id первых 10-20 объектов из long_titles_sample.\n'
        '- Если пользователь просит «измени/обнови/поправь объект #ID» — используй update_listing_full с полем fields. '
        'Определяй risk правильно: если меняешь только description/tags/seo_*/condition/флаги — risk:low (применится авто). '
        'Если меняешь price/title/status/category/deal/address/owner_phone — risk:high (требует подтверждения).\n'
        '- Для редактирования новостей используй update_news, для лидов — update_lead. Передавай ТОЛЬКО изменившиеся поля.\n'
        '- Если запрос общий ("что нужно сделать?") — начни с get_listings_summary + get_leads_summary.'
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


def _call_yandex_gpt(
    system_prompt: str,
    user_prompt: str,
    db_key: str = '',
    db_folder: str = '',
    history: list = None,
    temperature: float = 0.7,
    max_tokens: int = 4000,
    model: str = None,
) -> dict:
    """Вызов YandexGPT с поддержкой истории диалога.

    history: список словарей вида [{role: 'user'|'assistant', text: '...'}],
    последние 10-15 сообщений. Передаётся между system и текущим user-сообщением,
    чтобы модель помнила контекст диалога и не повторяла одни и те же вопросы.
    """
    api_key = db_key or os.environ.get('YANDEX_API_KEY', '')
    folder_id = db_folder or os.environ.get('YANDEX_FOLDER_ID', '')
    if not api_key:
        return {'error': 'YandexGPT API-ключ не настроен. Добавьте его в админке: Настройки → Интеграции.'}
    if not folder_id:
        return {'error': 'YandexGPT Folder ID не настроен. Добавьте его в админке: Настройки → Интеграции.'}

    messages = [{'role': 'system', 'text': system_prompt}]
    # Подмешиваем историю диалога (32k-модель позволяет хранить больше)
    if isinstance(history, list):
        for h in history[-30:]:  # максимум 30 предыдущих сообщений
            if not isinstance(h, dict):
                continue
            role = h.get('role')
            text = (h.get('text') or '').strip()
            if not text:
                continue
            # YandexGPT принимает только user/assistant/system.
            # На фронте у нас 'ai' — конвертируем.
            if role == 'ai':
                role = 'assistant'
            if role not in ('user', 'assistant'):
                continue
            messages.append({'role': role, 'text': text[:4000]})
    # Текущий запрос пользователя
    if user_prompt:
        messages.append({'role': 'user', 'text': user_prompt})

    model_name = model or YANDEX_MODEL_NAME
    model_uri = f'gpt://{folder_id}/{model_name}'
    payload = {
        'modelUri': model_uri,
        'completionOptions': {
            'stream': False,
            'temperature': float(temperature),
            'maxTokens': str(int(max_tokens)),
        },
        'messages': messages,
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


def _load_stop_words(cur) -> list:
    """Загружает стоп-слова ВБ из БД."""
    try:
        cur.execute(f"SELECT word FROM {SCHEMA}.vb_stop_words ORDER BY id ASC")
        return [r['word'] for r in cur.fetchall()]
    except Exception:
        return []


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


def _detect_topic(user_prompt: str) -> str:
    """Определяет тему запроса для контекстного подбора фактов.
    Возвращает: 'broker' | 'it' | 'platform' | 'mixed'.
    """
    p = (user_prompt or '').lower()
    broker_words = ['аренд', 'купи', 'прода', 'помещен', 'офис', 'склад', 'ритейл',
                    'инвестиц', 'доходн', 'окупаем', 'оценк', 'локац', 'метраж',
                    'кв.м', 'кв. м', ' м2', 'м²', 'ипотек', 'кадастр', 'росреестр',
                    'недвижим', 'ставк', 'арендатор', 'собственник', 'клиент',
                    'объект', 'каталог', 'листинг']
    it_words = ['ошибк', 'сервер', 'хостинг', 'код', 'вёрстк', 'верстк', 'seo',
                'яндекс', 'google', 'трафик', 'плагин', 'бэкап', 'бекап', 'скорост',
                'микроразметк', 'домен', 'ssl', 'лог', 'миграц', 'api', 'css',
                ' js ', 'react', 'python', 'sql', 'bd ', 'базу данн', 'базы данн',
                'аналитик', 'метрик', 'воронк', 'a/b', 'юнит', 'cac', 'ltv']
    platform_words = ['poehali', 'cloud function', 'функци', 'секрет', 's3',
                      'опубликова', 'github', 'фид', 'xml', 'админк', 'пульс',
                      'агент', 'настройк']
    b_score = sum(1 for w in broker_words if w in p)
    i_score = sum(1 for w in it_words if w in p)
    pf_score = sum(1 for w in platform_words if w in p)
    if b_score >= 2 and b_score > i_score + pf_score:
        return 'broker'
    if pf_score >= 1 or (i_score >= 1 and 'biznest' not in p):
        return 'it' if i_score > pf_score else 'platform'
    if i_score >= 2:
        return 'it'
    return 'mixed'


def _build_memory_context(memory: dict, topic: str = 'mixed') -> str:
    """Формирует структурированный блок памяти ВБ для system prompt.
    Группирует факты по категориям и фильтрует по теме запроса.
    topic: 'broker' | 'it' | 'platform' | 'mixed'.
    """
    persona = memory.get('persona', '')
    personality = memory.get('personality', '')
    count = memory.get('interaction_count', '0')

    # Группируем все ключи памяти по префиксам
    groups: dict = {
        'role_broker': [], 'role_it': [], 'role_switch': [],
        'rule': [], 'platform': [], 'poehali': [], 'scenario': [],
        'glossary': [], 'faq': [], 'contact': [], 'process': [], 'creator': [],
        'demand_summary': [], 'listing_summary': [], 'invest': [], 'market': [],
    }
    for key, value in memory.items():
        v = (value or '').strip()
        if not v:
            continue
        if key.startswith('role_broker'):
            groups['role_broker'].append(v)
        elif key.startswith('role_it'):
            groups['role_it'].append(v)
        elif key.startswith('role_switch'):
            groups['role_switch'].append(v)
        elif key.startswith('rule_'):
            groups['rule'].append(v)
        elif key.startswith('platform_'):
            groups['platform'].append(v)
        elif key.startswith('poehali_'):
            groups['poehali'].append(v)
        elif key.startswith('scenario_'):
            groups['scenario'].append(v)
        elif key.startswith('glossary_'):
            groups['glossary'].append(v)
        elif key.startswith('faq_'):
            groups['faq'].append(v)
        elif key.startswith('contact_'):
            groups['contact'].append(v)
        elif key.startswith('process_'):
            groups['process'].append(v)
        elif key.startswith('creator_'):
            groups['creator'].append(v)
        elif key.startswith('invest_'):
            groups['invest'].append(v)
        elif key.startswith('market_'):
            groups['market'].append(v)

    # Свежие факты и решения из разговоров
    try:
        facts = json.loads(memory.get('learned_facts', '[]'))
    except Exception:
        facts = []
    try:
        decisions = json.loads(memory.get('tech_decisions', '[]'))
    except Exception:
        decisions = []

    lines = ['[ПАМЯТЬ ВИРТУАЛЬНОГО БРОКЕРА]']
    lines.append(f'Я работаю на этом сайте уже {count} раз(а). Каждый разговор делает меня умнее.')
    if persona:
        lines.append(f'Кто я: {persona}')
    if personality:
        lines.append(f'Мой характер: {personality}')

    if groups['creator']:
        lines.append('\n[О создателе]')
        for v in groups['creator'][:3]:
            lines.append(f'• {v}')

    # Лимиты фактов по теме — это сужает контекст и помогает модели сфокусироваться
    if topic == 'broker':
        lim_broker, lim_it, lim_platform, lim_gloss, lim_market = 12, 0, 4, 15, 8
    elif topic == 'it':
        lim_broker, lim_it, lim_platform, lim_gloss, lim_market = 0, 15, 8, 0, 0
    elif topic == 'platform':
        lim_broker, lim_it, lim_platform, lim_gloss, lim_market = 0, 8, 20, 0, 0
    else:  # mixed
        lim_broker, lim_it, lim_platform, lim_gloss, lim_market = 6, 8, 10, 5, 3

    # Правила переключения нужны только при mixed — иначе модель уже определилась
    if groups['role_switch'] and topic == 'mixed':
        lines.append('\n[Переключение ролей — как определять]')
        for v in groups['role_switch'][:6]:
            lines.append(f'• {v}')

    if groups['role_broker'] and lim_broker > 0:
        lines.append('\n[РОЛЬ 1: Брокер коммерческой недвижимости]')
        for v in groups['role_broker'][:lim_broker]:
            lines.append(f'• {v}')

    if groups['role_it'] and lim_it > 0:
        lines.append('\n[РОЛЬ 2: ИТ-эксперт (мульти-роль)]')
        for v in groups['role_it'][:lim_it]:
            lines.append(f'• {v}')

    if groups['rule']:
        lines.append('\n[Правила работы — обязательно соблюдать]')
        for v in groups['rule'][:15]:
            lines.append(f'• {v}')

    if groups['platform'] and lim_platform > 0:
        lines.append('\n[Как устроена платформа BIZNEST]')
        for v in groups['platform'][:lim_platform]:
            lines.append(f'• {v}')

    # poehali.dev — техническая база для IT/platform тем
    if groups['poehali'] and topic in ('it', 'platform', 'mixed'):
        lim_poehali = 15 if topic in ('it', 'platform') else 6
        lines.append('\n[Платформа poehali.dev — как работает движок]')
        for v in groups['poehali'][:lim_poehali]:
            lines.append(f'• {v}')

    # Сценарии-скрипты — готовые ответы на частые ситуации
    if groups['scenario']:
        lim_scen = 12 if topic in ('it', 'platform', 'mixed') else 6
        lines.append('\n[Сценарии — готовые маршруты ответов]')
        for v in groups['scenario'][:lim_scen]:
            lines.append(f'• {v}')

    if groups['process']:
        lines.append('\n[Бизнес-процессы]')
        for v in groups['process'][:10]:
            lines.append(f'• {v}')

    if groups['contact']:
        lines.append('\n[Контакты и компания]')
        for v in groups['contact'][:5]:
            lines.append(f'• {v}')

    if groups['faq']:
        lines.append('\n[Частые вопросы]')
        for v in groups['faq'][:10]:
            lines.append(f'• {v}')

    if groups['glossary'] and lim_gloss > 0:
        lines.append('\n[Термины и определения]')
        for v in groups['glossary'][:lim_gloss]:
            lines.append(f'• {v}')

    if (groups['market'] or groups['invest']) and lim_market > 0:
        lines.append('\n[Рынок и инвестиции]')
        for v in (groups['market'] + groups['invest'])[:lim_market]:
            lines.append(f'• {v}')

    if facts:
        lines.append('\n[Что я узнал в разговорах с тобой]')
        for f in facts[-12:]:
            lines.append(f'• {f}')

    if decisions:
        lines.append('\n[Принятые технические решения]')
        for d in decisions[-6:]:
            lines.append(f'• [{d.get("date","")}] {d.get("q","")[:100]} → {d.get("a","")[:120]}')

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

    # ── Полное редактирование объекта (любые разрешённые поля) ──────────
    if act_type == 'update_listing_full':
        listing_id = int(params.get('id') or 0)
        if not listing_id:
            return {'error': 'Не указан id объекта'}
        fields = params.get('fields') or {}
        if not isinstance(fields, dict) or not fields:
            return {'error': 'Не переданы fields для обновления'}

        # Типы полей (для корректного SQL-литерала)
        TEXT_FIELDS = {
            'title': 200, 'description': 8000, 'category': 50, 'deal': 50,
            'address': 255, 'district': 100, 'city': 100, 'image': 500,
            'tags': 1000, 'status': 30, 'owner_name': 200, 'owner_phone': 50,
            'owner_phone2': 50, 'price_unit': 30, 'images': 8000, 'purpose': 200,
            'condition': 100, 'parking': 100, 'entrance': 100,
            'video_url': 500, 'video_type': 30, 'slug': 200,
            'seo_title': 200, 'seo_description': 500, 'tenant_name': 200,
            'finishing': 100, 'utilities': 100, 'road_line': 100,
            'broker_commission': 100, 'building_class': 30,
            'subway_station': 100, 'land_status': 100, 'property_rights': 100,
        }
        INT_FIELDS = {
            'price', 'price_per_m2', 'area', 'payback', 'profit',
            'floor', 'total_floors', 'public_code', 'views_site',
            'rooms', 'subway_distance', 'building_year', 'broker_id', 'author_id',
        }
        NUMERIC_FIELDS = {
            'lat', 'lng', 'monthly_rent', 'yearly_rent',
            'ceiling_height', 'electricity_kw', 'land_area', 'min_area',
        }
        BOOL_FIELDS = {
            'is_hot', 'is_new', 'is_exclusive', 'is_urgent', 'is_visible',
            'is_pinned', 'is_apartments', 'has_furniture', 'has_equipment',
            'export_yandex', 'export_avito', 'export_cian', 'use_watermark',
        }
        # Поля, которые ВБ менять НЕ может (опасные/служебные)
        FORBIDDEN = {'id', 'created_at', 'updated_at', 'last_edited_at', 'last_edited_by',
                     'owner_phone_contact_id', 'owner_phone2_contact_id',
                     'pinned_at', 'pinned_by'}

        sets = []
        changed = []
        skipped = []
        for k, v in fields.items():
            if k in FORBIDDEN:
                skipped.append(k)
                continue
            if k in TEXT_FIELDS:
                max_l = TEXT_FIELDS[k]
                val = _sanitize_text(str(v) if v is not None else '', max_l)
                sets.append(f"{k}='{val}'")
                changed.append(k)
            elif k in INT_FIELDS:
                try:
                    iv = int(v) if v not in (None, '') else 0
                    sets.append(f"{k}={iv}")
                    changed.append(k)
                except Exception:
                    skipped.append(k)
            elif k in NUMERIC_FIELDS:
                try:
                    fv = float(v) if v not in (None, '') else 0
                    sets.append(f"{k}={fv}")
                    changed.append(k)
                except Exception:
                    skipped.append(k)
            elif k in BOOL_FIELDS:
                bv = bool(v) if not isinstance(v, str) else v.lower() in ('1', 'true', 'yes', 'да', 'on')
                sets.append(f"{k}={'TRUE' if bv else 'FALSE'}")
                changed.append(k)
            else:
                skipped.append(k)

        if not sets:
            return {'error': 'Нет валидных полей для обновления'}

        # Валидация значений категорий/сделки/статуса
        if 'category' in fields:
            allowed_cats = {'office', 'warehouse', 'retail', 'production',
                            'land', 'gab', 'building', 'free_purpose', 'flat', 'commercial'}
            v = str(fields.get('category') or '').lower()
            if v and v not in allowed_cats:
                return {'error': f'Недопустимая category: {v}. Допустимо: {", ".join(sorted(allowed_cats))}'}
        if 'deal' in fields:
            allowed_deals = {'sale', 'rent', 'lease'}
            v = str(fields.get('deal') or '').lower()
            if v and v not in allowed_deals:
                return {'error': f'Недопустимая deal: {v}'}
        if 'status' in fields:
            allowed_status = {'active', 'archived', 'draft'}
            v = str(fields.get('status') or '').lower()
            if v and v not in allowed_status:
                return {'error': f'Недопустимый status: {v}'}

        # Сохраняем историю — для безопасности (если таблица listing_history существует)
        try:
            user_id = user.get('id') if user else 0
            cur.execute(
                f"INSERT INTO {SCHEMA}.listing_history (listing_id, changed_by, change_type, payload, changed_at) "
                f"VALUES ({listing_id}, {user_id or 'NULL'}, 'ai_edit', "
                f"'{_sanitize_text(json.dumps({'fields': changed}, ensure_ascii=False), 2000)}', NOW())"
            )
        except Exception:
            pass  # таблицы может не быть — не критично

        cur.execute(
            f"UPDATE {SCHEMA}.listings SET {', '.join(sets)}, updated_at=NOW() "
            f"WHERE id={listing_id}"
        )
        msg = f"Объект #{listing_id}: обновлено полей — {len(changed)} ({', '.join(changed[:8])}"
        if len(changed) > 8:
            msg += f' и ещё {len(changed) - 8}'
        msg += ')'
        if skipped:
            msg += f". Пропущено: {', '.join(skipped[:5])}"
        return {'ok': True, 'message': msg, 'changed': changed, 'skipped': skipped}

    # ── Полное редактирование новости ─────────────────────────────────────
    if act_type == 'update_news':
        news_id = int(params.get('id') or 0)
        if not news_id:
            return {'error': 'Не указан id новости'}
        fields = params.get('fields') or {}
        if not isinstance(fields, dict) or not fields:
            return {'error': 'Не переданы fields для обновления'}

        NEWS_TEXT = {
            'title': 300, 'slug': 200, 'summary': 1000, 'content': 30000,
            'image_url': 500, 'source_url': 500, 'source_name': 200, 'category': 50,
        }
        NEWS_BOOL = {'is_published', 'is_auto'}
        NEWS_NUMERIC = {'cb_key_rate'}
        FORBIDDEN = {'id', 'created_at', 'updated_at', 'created_by', 'published_at'}

        sets = []
        changed = []
        for k, v in fields.items():
            if k in FORBIDDEN:
                continue
            if k in NEWS_TEXT:
                val = _sanitize_text(str(v) if v is not None else '', NEWS_TEXT[k])
                sets.append(f"{k}='{val}'")
                changed.append(k)
            elif k in NEWS_BOOL:
                bv = bool(v) if not isinstance(v, str) else v.lower() in ('1', 'true', 'yes', 'да', 'on')
                sets.append(f"{k}={'TRUE' if bv else 'FALSE'}")
                changed.append(k)
            elif k in NEWS_NUMERIC:
                try:
                    sets.append(f"{k}={float(v)}")
                    changed.append(k)
                except Exception:
                    pass
        if not sets:
            return {'error': 'Нет валидных полей для новости'}
        # Если выставили is_published=true — обновим published_at
        if 'is_published' in fields and (str(fields['is_published']).lower() in ('1', 'true', 'yes', 'да', 'on')):
            sets.append("published_at = COALESCE(published_at, NOW())")
        cur.execute(
            f"UPDATE {SCHEMA}.news SET {', '.join(sets)}, updated_at=NOW() WHERE id={news_id}"
        )
        return {'ok': True, 'message': f'Новость #{news_id}: обновлено полей — {len(changed)} ({", ".join(changed[:6])})', 'changed': changed}

    # ── Полное редактирование лида (заявки) ───────────────────────────────
    if act_type == 'update_lead':
        lead_id = int(params.get('id') or 0)
        if not lead_id:
            return {'error': 'Не указан id лида'}
        fields = params.get('fields') or {}
        if not isinstance(fields, dict) or not fields:
            return {'error': 'Не переданы fields для обновления'}

        LEAD_TEXT = {
            'name': 200, 'phone': 50, 'email': 200, 'message': 4000,
            'source': 100, 'status': 30, 'company': 200,
            'request_category': 100, 'lead_type': 50,
        }
        LEAD_INT = {'listing_id', 'assigned_to', 'broker_id', 'budget', 'user_id'}
        LEAD_BOOL = {'is_network', 'is_public', 'is_network_tenant', 'show_on_main'}
        FORBIDDEN = {'id', 'created_at', 'updated_at', 'phone_contact_id'}

        sets = []
        changed = []
        for k, v in fields.items():
            if k in FORBIDDEN:
                continue
            if k in LEAD_TEXT:
                val = _sanitize_text(str(v) if v is not None else '', LEAD_TEXT[k])
                sets.append(f"{k}='{val}'")
                changed.append(k)
            elif k in LEAD_INT:
                try:
                    sets.append(f"{k}={int(v)}")
                    changed.append(k)
                except Exception:
                    pass
            elif k in LEAD_BOOL:
                bv = bool(v) if not isinstance(v, str) else v.lower() in ('1', 'true', 'yes', 'да', 'on')
                sets.append(f"{k}={'TRUE' if bv else 'FALSE'}")
                changed.append(k)
        if not sets:
            return {'error': 'Нет валидных полей для лида'}
        if 'status' in fields:
            allowed = {'new', 'pending', 'in_progress', 'closed', 'rejected', 'archived'}
            v = str(fields.get('status') or '').lower()
            if v and v not in allowed:
                return {'error': f'Недопустимый status лида: {v}'}
        cur.execute(
            f"UPDATE {SCHEMA}.leads SET {', '.join(sets)}, updated_at=NOW() WHERE id={lead_id}"
        )
        return {'ok': True, 'message': f'Лид #{lead_id}: обновлено — {", ".join(changed[:6])}', 'changed': changed}

    # ── Создание новости ─────────────────────────────────────────────────
    if act_type == 'create_news':
        title = _sanitize_text(str(params.get('title') or ''), 300)
        if not title:
            return {'error': 'Нужен title новости'}
        summary = _sanitize_text(str(params.get('summary') or ''), 1000)
        content = _sanitize_text(str(params.get('content') or ''), 30000)
        image_url = _sanitize_text(str(params.get('image_url') or ''), 500)
        category = _sanitize_text(str(params.get('category') or 'market'), 50)
        is_published = bool(params.get('is_published', False))
        cur.execute(
            f"INSERT INTO {SCHEMA}.news (title, summary, content, image_url, category, is_published, is_auto, "
            f"created_by, created_at, updated_at, published_at) "
            f"VALUES ('{title}', '{summary}', '{content}', '{image_url}', '{category}', "
            f"{'TRUE' if is_published else 'FALSE'}, FALSE, {user['id'] if user else 0}, NOW(), NOW(), "
            f"{'NOW()' if is_published else 'NULL'}) RETURNING id"
        )
        new_id = cur.fetchone()['id']
        return {'ok': True, 'message': f'Новость #{new_id} «{title[:50]}» создана', 'id': new_id}

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

    # ── Сканер длинных названий объектов ─────────────────────────────────
    if act_type == 'scan_long_titles':
        max_len = int(params.get('max_len') or 70)
        if max_len < 30 or max_len > 200:
            max_len = 70
        limit = int(params.get('limit') or 100)
        cur.execute(
            f"SELECT id, title, LENGTH(title) AS len, category, deal, area, district, address "
            f"FROM {SCHEMA}.listings "
            f"WHERE status='active' AND LENGTH(title) > {max_len} "
            f"ORDER BY LENGTH(title) DESC LIMIT {limit}"
        )
        rows = cur.fetchall()
        items = [dict(r) for r in rows]
        # Краткая статистика
        cur.execute(
            f"SELECT COUNT(*) AS total, "
            f"COUNT(*) FILTER (WHERE LENGTH(title) > {max_len}) AS over_limit, "
            f"MAX(LENGTH(title)) AS max_len_found, "
            f"ROUND(AVG(LENGTH(title)))::int AS avg_len "
            f"FROM {SCHEMA}.listings WHERE status='active'"
        )
        stat = dict(cur.fetchone() or {})
        return {
            'ok': True,
            'max_len': max_len,
            'total_active': stat.get('total', 0),
            'over_limit': stat.get('over_limit', 0),
            'max_len_found': stat.get('max_len_found', 0),
            'avg_len': stat.get('avg_len', 0),
            'items': items,
            'message': (
                f"Найдено {stat.get('over_limit', 0)} объектов с названиями более {max_len} символов. "
                f"Самое длинное: {stat.get('max_len_found', 0)} симв., среднее: {stat.get('avg_len', 0)}."
            ),
        }

    # ── Массовая замена длинных названий (через YandexGPT) ──────────────
    if act_type == 'bulk_shorten_titles':
        items = params.get('items') or []
        max_len = int(params.get('max_len') or 65)
        if max_len < 30 or max_len > 120:
            max_len = 65
        # Режим 1: items уже содержит готовые new_title → просто применяем
        # Режим 2: items содержит только id → генерируем new_title через GPT
        if not isinstance(items, list) or not items:
            return {'error': 'Не передан список объектов'}
        if len(items) > 30:
            return {'error': 'Максимум 30 объектов за раз'}

        # Готовые названия от ВБ
        has_ready = all(isinstance(it, dict) and it.get('new_title') for it in items)
        if has_ready:
            updated = 0
            for it in items:
                try:
                    lid = int(it.get('id') or 0)
                    nt = _sanitize_text(str(it.get('new_title') or ''), 200).strip()
                    if not lid or not nt:
                        continue
                    if len(nt) > max_len + 20:
                        # На всякий случай страхуем — обрезаем по последнему пробелу
                        cut = nt[:max_len].rsplit(' ', 1)[0] or nt[:max_len]
                        nt = cut.rstrip(' .,;:-—')
                    cur.execute(
                        f"UPDATE {SCHEMA}.listings SET title='{nt}', updated_at=NOW() WHERE id={lid}"
                    )
                    updated += 1
                except Exception:
                    continue
            return {'ok': True, 'message': f'Названия обновлены: {updated} из {len(items)}'}

        # Иначе — items = [{id}, ...]. Подтягиваем оригиналы и зовём GPT построчно.
        ids = [int(it.get('id')) for it in items if isinstance(it, dict) and str(it.get('id', '')).isdigit()]
        if not ids:
            return {'error': 'Не указаны корректные id'}
        id_list = ','.join(str(i) for i in ids)
        cur.execute(
            f"SELECT id, title, category, deal, area, district, address, price "
            f"FROM {SCHEMA}.listings WHERE id IN ({id_list})"
        )
        rows = [dict(r) for r in cur.fetchall()]
        if not rows:
            return {'error': 'Объекты не найдены'}

        db_key, db_folder = _load_keys_from_db(cur)
        sys_p = (
            'Ты — SEO-копирайтер коммерческой недвижимости. Пиши короткие, цепляющие заголовки объявлений. '
            'Правила: 1) длина 45-65 символов. 2) обязательно вид сделки (Сдам/Продам/Аренда/Продажа). '
            '3) тип объекта (офис, склад, помещение, ритейл, ГАБ). 4) ключевая цифра (площадь в м² или цена). '
            '5) локация коротко (улица или район). 6) без воды и эмодзи. 7) ОТВЕЧАЙ ОДНОЙ СТРОКОЙ — только заголовок, без кавычек, без пояснений.'
        )

        deal_map = {'sale': 'Продажа', 'rent': 'Аренда', 'lease': 'Аренда'}
        cat_map = {
            'office': 'офис', 'warehouse': 'склад', 'retail': 'ритейл',
            'production': 'производство', 'land': 'участок', 'gab': 'ГАБ',
            'building': 'здание', 'free_purpose': 'помещение',
        }

        results = []
        updated = 0
        for r in rows:
            try:
                lid = r['id']
                old_title = (r.get('title') or '')[:300]
                deal_ru = deal_map.get((r.get('deal') or '').lower(), '')
                cat_ru = cat_map.get((r.get('category') or '').lower(), 'помещение')
                area = r.get('area')
                district = r.get('district') or ''
                address = (r.get('address') or '')[:80]

                user_p = (
                    f'Перепиши название объекта коммерческой недвижимости в короткий SEO-заголовок (50-65 символов).\n'
                    f'Текущее название: {old_title}\n'
                    f'Тип сделки: {deal_ru or "—"}\n'
                    f'Категория: {cat_ru}\n'
                    f'Площадь: {area or "—"} м²\n'
                    f'Район: {district or "—"}\n'
                    f'Адрес: {address or "—"}\n\n'
                    f'Верни ТОЛЬКО новый заголовок одной строкой.'
                )
                gpt = _call_yandex_gpt(
                    sys_p, user_p, db_key, db_folder,
                    history=None, temperature=0.4, max_tokens=120,
                    model=YANDEX_MODEL_SHORT,
                )
                new_title = (gpt.get('text') or '').strip().strip('"').strip("'")
                # Берём первую строку
                new_title = new_title.split('\n')[0].strip()
                # Страховка по длине
                if len(new_title) > max_len + 15:
                    cut = new_title[:max_len].rsplit(' ', 1)[0] or new_title[:max_len]
                    new_title = cut.rstrip(' .,;:-—')
                if not new_title or len(new_title) < 15:
                    results.append({'id': lid, 'skipped': True, 'reason': 'GPT не вернул валидный заголовок'})
                    continue
                safe_title = _sanitize_text(new_title, 200)
                cur.execute(
                    f"UPDATE {SCHEMA}.listings SET title='{safe_title}', updated_at=NOW() WHERE id={lid}"
                )
                updated += 1
                results.append({'id': lid, 'old_title': old_title[:100], 'new_title': new_title})
            except Exception as e:
                results.append({'id': r.get('id'), 'skipped': True, 'reason': str(e)[:120]})
                continue

        return {
            'ok': True,
            'updated': updated,
            'total': len(rows),
            'results': results,
            'message': f'Названия переписаны: {updated} из {len(rows)}',
        }

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

    # ── Оптимизация изображений ──────────────────────────────────────────
    if act_type == 'scan_images':
        try:
            s3 = _s3()
            # Сканируем все папки: photos/, logos/, watermarks/, files/
            all_keys = {}
            paginator = s3.get_paginator('list_objects_v2')
            for prefix in S3_PREFIXES:
                try:
                    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
                        for obj in page.get('Contents', []):
                            all_keys[obj['Key']] = obj['Size']
                except Exception:
                    pass

            used_keys = _used_image_keys(cur)
            unused, to_compress, ok_count = [], [], 0

            for key, size in all_keys.items():
                if key not in used_keys:
                    unused.append({'key': key, 'size_kb': round(size / 1024), 'url': _cdn_url(key)})
                elif size > IMG_COMPRESS_THRESHOLD:
                    to_compress.append({'key': key, 'size_kb': round(size / 1024), 'url': _cdn_url(key)})
                else:
                    ok_count += 1

            unused_kb = sum(f['size_kb'] for f in unused)
            compress_kb = sum(f['size_kb'] for f in to_compress)
            return {
                'ok': True,
                'total_in_s3': len(all_keys),
                'total_used_our_cdn': len(used_keys),
                'unused_count': len(unused),
                'unused_size_kb': unused_kb,
                'compress_candidates': len(to_compress),
                'compress_total_kb': compress_kb,
                'already_ok_count': ok_count,
                'unused': unused[:50],
                'to_compress': to_compress[:50],
                'message': (
                    f"В S3: {len(all_keys)} файлов. "
                    f"Неиспользуемых: {len(unused)} ({unused_kb} KB). "
                    f"Кандидатов на сжатие: {len(to_compress)} ({compress_kb} KB). "
                    f"Уже оптимальных: {ok_count}."
                ),
            }
        except Exception as e:
            return {'error': f'Ошибка сканирования: {e}'}

    if act_type == 'optimize_images':
        keys = params.get('keys') or []
        if not keys:
            return {'error': 'Нужен список keys'}
        try:
            from PIL import Image as _PIL
        except ImportError:
            return {'error': 'Pillow не установлен на сервере'}
        try:
            s3 = _s3()
            results, total_saved = [], 0
            for key in keys[:50]:  # макс 50 за раз
                try:
                    obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
                    orig_bytes = obj['Body'].read()
                    orig_size = len(orig_bytes)
                    content_type = obj.get('ContentType', '')

                    # Пропускаем не-изображения и GIF (анимация)
                    is_img = content_type.startswith('image/') or key.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
                    if not is_img:
                        results.append({'key': key, 'skipped': True, 'reason': 'не изображение'})
                        continue
                    if key.lower().endswith('.gif') or content_type == 'image/gif':
                        results.append({'key': key, 'skipped': True, 'reason': 'GIF — пропущен'})
                        continue

                    img = _PIL.open(io.BytesIO(orig_bytes))
                    w, h = img.size
                    if max(w, h) > IMG_MAX_SIDE:
                        ratio = IMG_MAX_SIDE / max(w, h)
                        img = img.resize((int(w * ratio), int(h * ratio)), _PIL.LANCZOS)

                    if img.mode in ('RGBA', 'LA'):
                        bg = _PIL.new('RGB', img.size, (255, 255, 255))
                        bg.paste(img, mask=img.split()[-1])
                        img = bg
                    elif img.mode == 'P':
                        img = img.convert('RGBA')
                        bg = _PIL.new('RGB', img.size, (255, 255, 255))
                        bg.paste(img, mask=img.split()[-1])
                        img = bg
                    elif img.mode != 'RGB':
                        img = img.convert('RGB')

                    out = io.BytesIO()
                    img.save(out, format='JPEG', quality=IMG_JPEG_QUALITY, optimize=True, progressive=True)
                    new_bytes = out.getvalue()
                    new_size = len(new_bytes)

                    if new_size >= orig_size * (1 - IMG_MIN_SAVINGS_PCT):
                        results.append({'key': key, 'skipped': True, 'reason': 'уже оптимально', 'size_kb': round(orig_size / 1024)})
                        continue

                    # Загружаем обратно под тем же ключом — URL не меняется!
                    s3.put_object(
                        Bucket=S3_BUCKET, Key=key, Body=new_bytes,
                        ContentType='image/jpeg',
                        CacheControl='public, max-age=31536000',
                    )
                    saved = orig_size - new_size
                    total_saved += saved
                    results.append({
                        'key': key, 'ok': True,
                        'original_kb': round(orig_size / 1024),
                        'new_kb': round(new_size / 1024),
                        'saved_kb': round(saved / 1024),
                        'saved_pct': round((saved / orig_size) * 100),
                    })
                except Exception as e:
                    results.append({'key': key, 'error': str(e)})

            optimized = [r for r in results if r.get('ok')]
            return {
                'ok': True,
                'processed': len(results),
                'optimized': len(optimized),
                'total_saved_kb': round(total_saved / 1024),
                'results': results,
                'message': (
                    f"Обработано {len(results)}: сжато {len(optimized)}, "
                    f"сэкономлено {round(total_saved / 1024)} KB."
                ),
            }
        except Exception as e:
            return {'error': f'Ошибка сжатия: {e}'}

    if act_type == 'delete_unused_images':
        keys = params.get('keys') or []
        if not keys:
            return {'error': 'Нужен список keys'}
        if user['role'] not in ('admin', 'editor', 'manager', 'director', 'broker', 'office_manager'):
            return {'error': 'Недостаточно прав'}
        try:
            s3 = _s3()
            # Финальная двойная проверка — не удаляем используемые файлы
            used_keys = _used_image_keys(cur)
            safe_keys = [k for k in keys[:200] if k not in used_keys]
            protected = [k for k in keys if k in used_keys]

            deleted, errors = [], []
            for key in safe_keys:
                try:
                    s3.delete_object(Bucket=S3_BUCKET, Key=key)
                    deleted.append(key)
                except Exception as e:
                    errors.append({'key': key, 'error': str(e)})

            return {
                'ok': True,
                'deleted_count': len(deleted),
                'deleted': deleted,
                'protected_count': len(protected),
                'protected': protected,
                'errors': errors,
                'message': (
                    f"Удалено {len(deleted)} файлов. "
                    + (f"Защищено {len(protected)} (используются в БД). " if protected else "")
                    + (f"Ошибок: {len(errors)}." if errors else "")
                ),
            }
        except Exception as e:
            return {'error': f'Ошибка удаления: {e}'}

    return {'error': f'Неизвестное действие: {act_type}'}


def _build_pulse_context(cur) -> str:
    """Пульс сайта для admin-промпта: метрики + id проблемных объектов."""
    lines = []
    try:
        cur.execute(
            f"SELECT "
            f"(SELECT COUNT(*) FROM {SCHEMA}.listings WHERE status='active') AS active, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.listings WHERE status='active' AND COALESCE(LENGTH(description),0) < 50) AS no_desc, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.listings WHERE status='active' AND (seo_title IS NULL OR seo_title='')) AS no_seo, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.listings WHERE status='active' AND LENGTH(title) > 70) AS long_titles, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.leads WHERE status='new') AS new_leads, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.leads WHERE status='pending') AS pending_leads, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.leads WHERE created_at > NOW() - INTERVAL '24 hours') AS leads_24h"
        )
        row = dict(cur.fetchone() or {})
        lines.append(
            f"[ПУЛЬС САЙТА] Активных объектов: {row.get('active', 0)}. "
            f"Без описания: {row.get('no_desc', 0)}. Без SEO: {row.get('no_seo', 0)}. "
            f"С длинными названиями (>70 симв): {row.get('long_titles', 0)}. "
            f"Лиды — новых: {row.get('new_leads', 0)}, в ожидании: {row.get('pending_leads', 0)}, за 24ч: {row.get('leads_24h', 0)}."
        )

        problems = []
        # Объекты без описания — берём id чтобы агент мог сразу работать с ними
        if (row.get('no_desc') or 0) > 0:
            try:
                cur.execute(
                    f"SELECT id, title FROM {SCHEMA}.listings "
                    f"WHERE status='active' AND COALESCE(LENGTH(description),0) < 50 "
                    f"ORDER BY id DESC LIMIT 10"
                )
                ids = [f"#{r['id']} ({(r['title'] or '')[:30]})" for r in cur.fetchall()]
                problems.append(f"{row['no_desc']} объектов без описания: {', '.join(ids)}")
            except Exception:
                problems.append(f"{row['no_desc']} объектов без описания")

        # Объекты с длинными названиями — реальные id для bulk_shorten_titles
        if (row.get('long_titles') or 0) > 0:
            try:
                cur.execute(
                    f"SELECT id, LENGTH(title) AS len FROM {SCHEMA}.listings "
                    f"WHERE status='active' AND LENGTH(title) > 70 "
                    f"ORDER BY LENGTH(title) DESC LIMIT 15"
                )
                ids = [f"#{r['id']} ({r['len']}c)" for r in cur.fetchall()]
                problems.append(f"{row['long_titles']} объектов с длинными title: {', '.join(ids)}")
            except Exception:
                problems.append(f"{row['long_titles']} объектов с длинными title")

        # Объекты без SEO
        if (row.get('no_seo') or 0) > 0:
            try:
                cur.execute(
                    f"SELECT id, title FROM {SCHEMA}.listings "
                    f"WHERE status='active' AND (seo_title IS NULL OR seo_title='') "
                    f"ORDER BY id DESC LIMIT 10"
                )
                ids = [f"#{r['id']} ({(r['title'] or '')[:30]})" for r in cur.fetchall()]
                problems.append(f"{row['no_seo']} объектов без SEO: {', '.join(ids)}")
            except Exception:
                problems.append(f"{row['no_seo']} объектов без SEO")

        if (row.get('pending_leads') or 0) > 0:
            try:
                cur.execute(
                    f"SELECT id, name FROM {SCHEMA}.leads WHERE status='pending' ORDER BY id DESC LIMIT 5"
                )
                ids = [f"#{r['id']} ({(r['name'] or '')[:20]})" for r in cur.fetchall()]
                problems.append(f"{row['pending_leads']} лидов ждут одобрения: {', '.join(ids)}")
            except Exception:
                problems.append(f"{row['pending_leads']} лидов в ожидании")

        if problems:
            lines.append("Проблемы: " + "; ".join(problems) + ".")
        else:
            lines.append("Критичных проблем не обнаружено.")
    except Exception:
        pass

    # Топ-3 объекта по просмотрам
    try:
        cur.execute(
            f"SELECT id, title, views_site FROM {SCHEMA}.listings "
            f"WHERE status='active' ORDER BY views_site DESC LIMIT 3"
        )
        top = cur.fetchall()
        if top:
            top_str = ', '.join(f"#{r['id']} «{(r['title'] or '')[:25]}» ({r['views_site']} просм.)" for r in top)
            lines.append(f"Топ по просмотрам: {top_str}.")
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
        # Длинные названия — для агента критично знать id, чтобы запустить bulk_shorten_titles
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE status='active' AND LENGTH(title) > 70")
        ctx['listings_long_titles'] = cur.fetchone()['c']
        cur.execute(
            f"SELECT id, LENGTH(title) AS len, LEFT(title, 60) AS title_preview "
            f"FROM {SCHEMA}.listings WHERE status='active' AND LENGTH(title) > 70 "
            f"ORDER BY LENGTH(title) DESC LIMIT 30"
        )
        ctx['long_titles_sample'] = [dict(r) for r in cur.fetchall()]
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
            is_public = action in ('match', 'search_leads')
            is_search_leads = action == 'search_leads'
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
            # История диалога — приходит с фронта (последние 15-20 сообщений).
            # Нужна для того, чтобы ВБ помнил контекст и не повторял одни и те же вопросы.
            history = body.get('history') or []
            if not isinstance(history, list):
                history = []

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
            leads_for_search = []
            if is_public and not is_search_leads:
                cur.execute(
                    f"SELECT id, title, category, deal, price, area, district, address, "
                    f"payback, profit, image FROM {SCHEMA}.listings "
                    f"WHERE status = 'active' ORDER BY id DESC LIMIT 60"
                )
                listings = cur.fetchall()
                matches = [dict(r) for r in listings]
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

            # Для search_leads — подтягиваем активные публичные заявки
            if is_search_leads:
                cur.execute(
                    f"SELECT id, name, message, budget, company, request_category, lead_type "
                    f"FROM {SCHEMA}.leads "
                    f"WHERE show_on_main = TRUE AND status IN ('new','in_progress') "
                    f"ORDER BY created_at DESC LIMIT 80"
                )
                leads_rows = cur.fetchall()
                leads_for_search = [dict(r) for r in leads_rows]
                compact_leads = [
                    {
                        'id': r['id'],
                        'name': (r.get('name') or '')[:60],
                        'message': (r.get('message') or '')[:300],
                        'budget': r.get('budget'),
                        'category': r.get('request_category') or '',
                        'type': r.get('lead_type') or '',
                    }
                    for r in leads_for_search
                ]
                ctx_data = {'leads': compact_leads}

            sys_prompt = SYSTEM_PROMPTS[action]

            # Для admin и agent: загружаем память + пульс сайта
            memory = {}
            current_topic = 'mixed'
            if action in ('admin', 'admin_ops', 'agent'):
                memory = _load_ai_memory(cur)
                pulse_ctx = _build_pulse_context(cur)
                if action in ('admin', 'admin_ops'):
                    # Контекстный фильтр: подбираем факты по теме запроса
                    # → меньше шума, лучше фокус модели
                    current_topic = _detect_topic(user_text)
                    memory_ctx = _build_memory_context(memory, topic=current_topic)
                    sys_prompt = sys_prompt + '\n\n' + pulse_ctx + '\n\n' + memory_ctx
                    _increment_interaction(cur, conn)
                else:
                    # Для агента пульс идёт в system prompt как справка
                    sys_prompt = sys_prompt + '\n\n' + pulse_ctx

            # Стоп-слова добавляем во все диалоговые режимы
            if action in ('admin', 'admin_ops', 'describe', 'reply_lead', 'seo', 'seo_listing'):
                stop_words = _load_stop_words(cur)
                if stop_words:
                    stop_list = ', '.join(f'«{w}»' for w in stop_words[:50])
                    sys_prompt += f'\n\nСТОП-СЛОВА (ЗАПРЕЩЕНО использовать в ответах): {stop_list}. Никогда не используй эти слова и фразы ни в каком контексте.'

            full_prompt = user_text
            if ctx_data:
                full_prompt += '\n\nДанные:\n' + json.dumps(ctx_data, ensure_ascii=False, default=str)[:6000]

            db_key, db_folder = _load_keys_from_db(cur)
            # Диалоговые режимы: история + температура повыше + 32k-модель + больше токенов
            dialog_actions = {'admin', 'admin_ops', 'reply_lead', 'match', 'agent'}
            short_actions = {'auto_tags', 'seo', 'seo_listing', 'add_city'}
            pass_history = history if action in dialog_actions else None
            temperature = 0.8 if action == 'admin' else (0.7 if action in dialog_actions else 0.5)
            # Технические короткие задачи — обычная Pro модель, 1500 токенов
            # Аналитика и диалоги — 32k, до 6000 токенов
            if action in short_actions:
                model_to_use = YANDEX_MODEL_SHORT
                max_tok = 1500
            elif action == 'agent':
                model_to_use = YANDEX_MODEL_NAME
                max_tok = 4000
            elif action == 'admin':
                # Диалог в админке — короткие живые ответы. Длинные планы только по явной просьбе.
                model_to_use = YANDEX_MODEL_NAME
                max_tok = 1500
            elif action == 'admin_ops':
                model_to_use = YANDEX_MODEL_NAME
                max_tok = 2500
            elif action in {'analytics_full', 'security', 'marketing', 'modernize', 'db_check'}:
                # Отчёты — здесь длина оправдана
                model_to_use = YANDEX_MODEL_NAME
                max_tok = 6000
            elif action in dialog_actions:
                model_to_use = YANDEX_MODEL_NAME
                max_tok = 3000
            else:
                model_to_use = YANDEX_MODEL_SHORT
                max_tok = 2000
            result = _call_yandex_gpt(
                sys_prompt, full_prompt, db_key, db_folder,
                history=pass_history, temperature=temperature,
                max_tokens=max_tok, model=model_to_use,
            )
            if 'error' in result:
                return _err(502, result['error'])

            # Парсим JSON-ответ для match / search_leads
            if is_public:
                text = result['text'].strip()
                if text.startswith('```'):
                    text = text.strip('`').lstrip('json').strip()
                try:
                    parsed = json.loads(text)
                except Exception:
                    parsed = {'ids': [], 'reasoning': result['text'][:500], 'advice': ''}
                ids = parsed.get('ids') or []
                if is_search_leads:
                    # Возвращаем найденные id заявок — фронт сам подтянет полные данные
                    return _ok({
                        'ids': ids[:10],
                        'reasoning': parsed.get('reasoning', ''),
                        'tokens': result.get('tokens', 0),
                    })
                picked = [r for r in matches if r['id'] in ids]
                picked_sorted = sorted(picked, key=lambda r: ids.index(r['id']) if r['id'] in ids else 99)
                return _ok({
                    'listings': picked_sorted[:20],
                    'reasoning': parsed.get('reasoning', ''),
                    'advice': parsed.get('advice', ''),
                    'tokens': result.get('tokens', 0),
                })

            # Парсим JSON-ответ для агента
            if action == 'agent':
                import re as _re
                text = result['text'].strip()
                # Убираем markdown-обёртку ```json ... ```
                if text.startswith('```'):
                    text = _re.sub(r'^```[a-z]*\n?', '', text).rstrip('`').strip()
                # Пытаемся найти JSON-объект внутри текста
                if not text.startswith('{'):
                    m = _re.search(r'\{[\s\S]*\}', text)
                    if m:
                        text = m.group(0)
                # Несколько попыток парсинга
                parsed = None
                for candidate in [text, text.split('\n\n')[0]]:
                    try:
                        parsed = json.loads(candidate)
                        break
                    except Exception:
                        pass
                if parsed is None:
                    # Финальный фоллбэк: возвращаем reasoning из текста, actions пусты
                    parsed = {'reasoning': result['text'][:600], 'actions': []}
                # Валидируем actions — убираем некорректные
                raw_actions = parsed.get('actions') or []
                valid_actions = []
                for a in raw_actions:
                    if isinstance(a, dict) and a.get('type') and a.get('risk') in ('low', 'medium', 'high'):
                        valid_actions.append(a)
                parsed['actions'] = valid_actions[:7]
                cur.execute(
                    f"INSERT INTO {SCHEMA}.ai_logs (user_id, action, prompt, response, tokens) "
                    f"VALUES ({user['id']}, 'agent', '{_safe(user_text, 4000)}', "
                    f"'{_sanitize_text(result['text'], 4000)}', {int(result.get('tokens', 0))})"
                )
                conn.commit()
                return _ok({
                    'reasoning': parsed.get('reasoning', ''),
                    'actions': parsed['actions'],
                    'tokens': result.get('tokens', 0),
                })

            log_prompt = _safe(full_prompt, 4000)
            log_resp = _safe(result['text'], 4000)
            cur.execute(
                f"INSERT INTO {SCHEMA}.ai_logs (user_id, action, prompt, response, tokens) "
                f"VALUES ({user['id']}, '{_safe(action, 50)}', '{log_prompt}', '{log_resp}', {int(result.get('tokens', 0))})"
            )
            conn.commit()

            # Самообучение: запоминаем важные факты из admin-диалога
            if action == 'admin' and user_text:
                fact_triggers = [
                    'зовут', 'называй', 'запомни', 'всегда', 'никогда',
                    'предпочит', 'важно', 'наша компания', 'мы работаем',
                    'наш сайт', 'наши клиенты', 'наш город', 'наши объекты',
                ]
                if any(kw in user_text.lower() for kw in fact_triggers):
                    _save_learned_fact(cur, conn, user_text[:200])
                # Если ИИ нашёл проблему и предложил решение — тоже запоминаем
                ai_resp = result.get('text', '')
                if len(ai_resp) > 100 and any(w in ai_resp.lower() for w in ['проблем', 'исправ', 'рекоменд', 'предлаг']):
                    summary = f"Вопрос: {user_text[:80]} → Ответ: {ai_resp[:120]}"
                    _save_learned_fact(cur, conn, summary)

            # Самообучение admin_ops: сохраняем технические решения
            if action == 'admin_ops' and user_text and result.get('text'):
                ai_answer = result['text']
                fact_keywords = ['зовут', 'называй', 'запомни', 'подключи', 'настрой', 'домен', 'интеграц']
                if any(kw in user_text.lower() for kw in fact_keywords):
                    _save_learned_fact(cur, conn, user_text[:200])
                _save_tech_decision(cur, conn, user_text, ai_answer)

            # role: для фронта — какую роль ВБ применил
            #   broker = Брокер (РОЛЬ 1), it = ИТ-эксперт (РОЛЬ 2), platform = по платформе, mixed = универсальный
            role_label = {
                'broker': 'broker',
                'it': 'it',
                'platform': 'it',
                'mixed': 'mixed',
            }.get(current_topic, 'mixed')
            return _ok({
                'text': result['text'],
                'tokens': result.get('tokens', 0),
                'role': role_label,
                'topic': current_topic,
            })
    finally:
        conn.close()