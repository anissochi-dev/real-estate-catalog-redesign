"""
Business: ИИ-ассистент на YandexGPT 5 Pro — генерация описаний, аналитика, ответы на лиды, SEO, публичный ИИ-подбор объектов.
Модули: Страж, Инспектор, Копирайтер, Диспетчер, DevOps.
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
        'По данным об объекте напиши продающее, но удобное для чтения человеком описание на русском. '
        'СТРОГИЕ ПРАВИЛА:\n'
        '1. Первая строка ВСЕГДА: «От собственника, без комиссий и %!»\n'
        '2. Далее одним абзацем или короткими блоками укажи (только то, что есть в данных, пустые поля пропускай): '
        'район/расположение, площадь, коммуникации (электричество, отделка, парковка, высота потолков), '
        'и доходность — если указан доход/окупаемость, обязательно упомяни сколько объект приносит.\n'
        '3. В конце добавь блок перспектив: «Подойдёт для:» и перечисли подходящие направления использования. '
        'Бери их из поля «назначение», если оно заполнено, и можешь дополнить логичными вариантами по категории объекта.\n'
        '4. НИКОГДА не указывай стоимость/цену объекта в описании.\n'
        '5. Пиши живым языком, удобно для чтения, без воды и клише. Не используй markdown, символы * и #.\n'
        '6. Объём описания — НЕ более 3000 символов.'
    ),
    'title': (
        'Ты — копирайтер агентства коммерческой недвижимости BIZNEST. '
        'Составь ОДИН короткий продающий заголовок объявления на русском, СТРОГО не более 70 символов. '
        'В заголовке укажи: тип сделки (Сдаётся — для аренды, Продаётся — для продажи), '
        'категорию объекта, и краткое уникальное торговое предложение (например: от собственника, без комиссии, '
        'первая линия, высокий трафик — если это следует из данных). '
        'Без кавычек, без markdown, без точки в конце. Верни ТОЛЬКО текст заголовка, одной строкой.'
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
        '- generate_description: {"id":int} risk:medium — GPT сам генерирует описание по данным объекта. Передавай ТОЛЬКО id, больше ничего не нужно.\n'
        '- seo_optimize: {"id":int,"seo_title":str,"seo_description":str} risk:medium\n'
        '- bulk_update_status: {"ids":[int,...],"status":str} risk:high\n'
        '- bulk_generate_descriptions: {"items":[{"id":int},...]} risk:high — GPT сам генерирует описания для всех переданных id. Если items пустой [] — обработает ВСЕ объекты без описания.\n'
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
        '- note: {"text":str} risk:low\n'
        'Поиск и коммуникация:\n'
        '- lookup_lead: {"phone":str} или {"id":int} risk:low — найти заявку по номеру телефона или id. Используй когда спрашивают «найди заявку», «что по номеру +79...», «статус заявки #N»\n'
        '- search_knowledge: {"query":str} risk:low — поиск по базе знаний ВБ (ai_memory). Используй когда нужно найти факты о рынке, ценах, районах\n'
        '- assign_broker: {"lead_id":int,"broker_id":int} или {"lead_id":int,"broker_name":str} risk:medium — назначить брокера на заявку. Статус меняется на in_progress\n'
        '- send_email_to_lead: {"lead_id":int,"subject":str,"body":str} или {"email":str,"subject":str,"body":str} risk:medium — отправить письмо клиенту. Используй когда просят «напиши клиенту», «отправь подборку на почту»\n'
        '- notify_employee: {"name":str,"subject":str,"body":str} или {"employee_id":int,"subject":str,"body":str} risk:medium — уведомить сотрудника по email. Используй когда просят «передай Ивану», «уведоми менеджера»\n'
        '\n'
        '🛡️ СТРАЖ (Security Guardian):\n'
        '- guardian_full_scan: {} risk:low — полное сканирование безопасности: XSS, спам-телефоны, SQL-инъекции в заявках, аномалии, активные блокировки. Используй при «проверь безопасность», «сканируй угрозы»\n'
        '- guardian_block: {"block_type":"phone|email|ip","value":str,"reason":str} risk:medium — заблокировать телефон/email/ip\n'
        '- guardian_unblock: {"block_type":str,"value":str} risk:medium — снять блокировку\n'
        '- guardian_get_blocks: {} risk:low — список активных блокировок\n'
        '\n'
        '🔍 ИНСПЕКТОР (Site Doctor):\n'
        '- inspector_full_audit: {} risk:low — полный аудит: SEO, битые данные, дубли, устаревшие объекты, необработанные лиды. Используй при «проверь сайт», «аудит», «что не так»\n'
        '- inspector_check_typos: {"ids":[int,...]} risk:low — проверка опечаток в описаниях через GPT (до 5 объектов)\n'
        '- inspector_get_reports: {"module":str?,"limit":int?} risk:low — история отчётов модулей\n'
        '\n'
        '✍️ КОПИРАЙТЕР:\n'
        '- copywriter_write_article: {"topic":str,"keywords":str?,"length":"short|medium|long"?,"publish":bool?} risk:medium — написать SEO-статью для блога. publish:true — сразу публикует как новость\n'
        '- copywriter_rewrite_tov: {"id":int} risk:medium — переписать описание объекта под TOV компании\n'
        '- copywriter_get_topics: {} risk:low — предложить темы для статей на основе каталога и лидов\n'
        '\n'
        '🎛️ ДИСПЕТЧЕР (Orchestrator):\n'
        '- dispatcher_smart_run: {} risk:medium — УМНЫЙ WORKFLOW: запускает все 3 шага с условной логикой:\n'
        '  1) guardian_full_scan → авто-блокирует найденные спам-телефоны и инъекции\n'
        '  2) inspector_full_audit → авто-генерирует SEO для объектов без мета через GPT\n'
        '  3) inspector_check_typos → находит опечатки и сохраняет в отчёт\n'
        '  Возвращает итоговую сводку с числами. Используй при «проверь всё», «полная проверка», «запусти умный анализ»\n'
        '- dispatcher_run_module: {"module":"guardian|inspector|copywriter"} risk:low — запустить один модуль\n'
        '- dispatcher_run_all: {} risk:low — запустить все модули (Страж + Инспектор). Используй при «запусти всё», «полная проверка»\n'
        '- dispatcher_get_status: {} risk:low — статус всех модулей: включён, последний запуск, последний отчёт\n'
        '- dispatcher_toggle_module: {"module":str,"enabled":bool} risk:medium — включить/выключить модуль\n'
        '\n'
        '🛠️ DEVOPS-АССИСТЕНТ:\n'
        '- devops_check_github: {} risk:low — проверить подключение к GitHub, список репозиториев. Используй при «проверь GitHub», «что с репозиторием»\n'
        '- devops_get_commits: {"repo":"owner/repo"?,"branch":"main"?,"limit":10?} risk:low — последние коммиты репо\n'
        '- devops_get_issues: {"repo":"owner/repo"?,"state":"open|closed"?} risk:low — список issues/багов\n'
        '- devops_create_issue: {"repo":"owner/repo","title":str,"body":str?,"labels":[str]?} risk:medium — создать issue/баг-репорт\n'
        '- devops_get_workflows: {"repo":"owner/repo"?} risk:low — статус GitHub Actions, упавшие сборки\n'
        '- devops_analyze_errors: {"hours":24?} risk:low — анализ ошибок из логов системы + GPT-рекомендации\n'
        '- devops_get_repo_stats: {"repo":"owner/repo"?} risk:low — статистика репо: языки, контрибьюторы, релизы\n'
        '\n'
        '🌐 ПОИСК В ИНТЕРНЕТЕ (Yandex Search API):\n'
        '- web_search: {"query":str,"limit":5?} risk:low — поиск в интернете через Яндекс. Используй при «найди в интернете», «что пишут про», «новости рынка», «актуальная цена», «найди информацию о», «поищи». Возвращает заголовки, сниппеты и ссылки.\n'
        '\n'
        '🧠 БАЗА ЗНАНИЙ (векторный поиск):\n'
        '- knowledge_search: {"query":str,"source_type":"listing|news|ai_memory"?,"limit":10?} risk:low — семантический поиск по базе знаний. Используй когда спрашивают «найди в базе», «что известно про...», «есть ли объекты с...»\n'
        '- knowledge_index: {"source_type":"listing|news|ai_memory|all"?,"limit":50?} risk:low — проиндексировать источники в базу знаний. Запускай при «обнови базу знаний», «переиндексируй»\n'
        '- knowledge_stats: {} risk:low — статистика базы знаний: сколько записей по каждому источнику\n'
        '- knowledge_delete: {"source_type":str} risk:high — удалить записи из базы знаний по типу\n'
        '\n'
        'ПРАВИЛА МОДУЛЕЙ:\n'
        '- При запросах «проверь безопасность» — сначала guardian_full_scan, потом предлагай guardian_block для найденных угроз\n'
        '- При «аудит сайта» / «что не так» — inspector_full_audit\n'
        '- При «напиши статью» / «контент для блога» — сначала copywriter_get_topics (low, авто), потом copywriter_write_article\n'
        '- При «запусти все модули» / «полная проверка» — dispatcher_run_all\n'
        '- dispatcher_get_status всегда выполняется автоматически (low risk)\n'
        '\n'
        'КАК ОТВЕЧАТЬ:\n'
        'Ты — живой помощник, не робот. Сначала ВСЕГДА пиши короткий человеческий ответ (1-3 предложения) — '
        'что ты понял из запроса и что собираешься сделать. Потом предлагай действия.\n'
        'Если пользователь просто общается ("привет", "как дела", "спасибо") — отвечай текстом без actions.\n'
        'Если вопрос аналитический ("сколько объектов", "как дела с лидами") — отвечай текстом на основе данных контекста, actions опциональны.\n'
        'Если нужны действия — добавляй их после текстового ответа.\n\n'
        'MULTI-STEP REASONING (цепочка шагов):\n'
        'Если в истории диалога есть сообщения вида «📊 Результат «...»:» — это результаты предыдущих действий.\n'
        'Используй их как основу для следующих шагов. Например:\n'
        '- Если до этого был web_search с ценами конкурентов → предложи update_listing_full для обновления цен\n'
        '- Если был inspector_full_audit с SEO-проблемами → предложи bulk_seo_optimize с конкретными id\n'
        '- Если был get_listings_summary → используй числа оттуда в своём ответе\n'
        'Всегда объясняй в reasoning что именно ты нашёл и какие конкретные действия предлагаешь на основе результатов.\n\n'
        'ФОРМАТ ОТВЕТА — валидный JSON без markdown:\n'
        '{"reasoning":"Живой текстовый ответ 1-4 предложения. Можно задать уточняющий вопрос.","actions":[{"type":str,"title":str,"description":str,"risk":"low|medium|high","params":{}}]}\n'
        'actions может быть пустым массивом [] если действия не нужны.\n\n'
        'ПРАВИЛА ДЕЙСТВИЙ:\n'
        '- Максимум 5 действий. Сначала low risk (аналитика, авто), потом medium/high (требуют подтверждения).\n'
        '- Используй id ТОЛЬКО из контекста данных — не придумывай.\n'
        '- Если в данных есть listings_no_desc или listings_no_seo > 0 — предложи bulk-исправление с реальными id из listings.\n'
        '- Если в данных listings_long_titles > 0 — предложи ОДНО действие bulk_shorten_titles с params: {"items": [{"id":N},{"id":N},...все id из long_titles_sample...], "max_len":65}. Передавай ВСЕ id из long_titles_sample, не обрезай список. Это обработает все объекты за один вызов.\n'
        '- Если пользователь просит «измени/поправь объект #ID» — update_listing_full. risk:low если только description/tags/seo_*/флаги, risk:high если title/price/status/address.\n'
        '- Если запрос общий — начни с get_listings_summary + get_leads_summary (оба low, выполнятся авто).\n'
        '- При «проверь всё» / «полная проверка» — dispatcher_smart_run (risk:medium).\n'
        '- web_search, knowledge_search, knowledge_stats — всегда risk:low (авто). После web_search изложи найденное в reasoning.'
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
        if not listing_id:
            return {'error': 'Укажите id объекта'}

        # Если описание уже передано — просто сохраняем
        new_desc = (params.get('new_description') or params.get('description') or '').strip()

        if not new_desc:
            # Генерируем через GPT: подтягиваем данные объекта
            cur.execute(
                f"SELECT id, title, category, deal, area, price, floor, floors_total, "
                f"address, district, city, condition, parking, entrance, finishing, "
                f"ceiling_height, electricity_kw, building_year, building_class "
                f"FROM {SCHEMA}.listings WHERE id = {listing_id}"
            )
            row = cur.fetchone()
            if not row:
                return {'error': f'Объект #{listing_id} не найден'}
            row = dict(row)

            db_key, db_folder = _load_keys_from_db(cur)
            if not db_key:
                return {'error': 'YandexGPT не настроен'}

            deal_map = {'sale': 'Продажа', 'rent': 'Аренда', 'lease': 'Аренда'}
            cat_map = {
                'office': 'Офис', 'warehouse': 'Склад', 'retail': 'Торговое помещение',
                'production': 'Производство', 'land': 'Земельный участок', 'gab': 'Готовый арендный бизнес',
                'building': 'Здание', 'free_purpose': 'Помещение свободного назначения',
            }
            deal_ru = deal_map.get((row.get('deal') or '').lower(), '')
            cat_ru = cat_map.get((row.get('category') or '').lower(), 'Объект')
            price_fmt = f"{int(row['price']):,}".replace(',', ' ') + ' ₽' if row.get('price') else '—'
            area = row.get('area') or '—'
            address = row.get('address') or row.get('district') or row.get('city') or '—'
            extra_parts = []
            if row.get('floor'): extra_parts.append(f"этаж {row['floor']}" + (f"/{row['floors_total']}" if row.get('floors_total') else ''))
            if row.get('ceiling_height'): extra_parts.append(f"высота потолков {row['ceiling_height']} м")
            if row.get('condition'): extra_parts.append(f"состояние: {row['condition']}")
            if row.get('parking'): extra_parts.append(f"парковка: {row['parking']}")
            if row.get('building_year'): extra_parts.append(f"год постройки {row['building_year']}")
            extra = ', '.join(extra_parts)

            # Загружаем TOV компании
            cur.execute(f"SELECT company_name FROM {SCHEMA}.settings LIMIT 1")
            site_s = cur.fetchone() or {}
            company = (site_s.get('company_name') or 'наша компания')

            sys_p = (
                'Ты — профессиональный копирайтер коммерческой недвижимости. '
                'Пиши продающие описания для объявлений: живо, конкретно, без воды. '
                'Структура: 1) главная ценность объекта (1-2 предложения), '
                '2) характеристики и преимущества (2-4 предложения), '
                '3) кому подойдёт и призыв к действию (1-2 предложения). '
                'Без эмодзи, без markdown, только текст. Объём 100-200 слов.'
            )
            user_p = (
                f'Напиши описание для объекта коммерческой недвижимости:\n'
                f'Тип: {cat_ru}\n'
                f'Сделка: {deal_ru}\n'
                f'Площадь: {area} м²\n'
                f'Цена: {price_fmt}\n'
                f'Адрес: {address}\n'
                + (f'Доп. характеристики: {extra}\n' if extra else '')
                + f'Название объявления: {row.get("title", "")}\n\n'
                f'Напиши продающее описание для сайта {company}.'
            )
            gpt = _call_yandex_gpt(
                sys_p, user_p, db_key, db_folder,
                history=None, temperature=0.6, max_tokens=400,
                model=YANDEX_MODEL_SHORT,
            )
            new_desc = (gpt.get('text') or '').strip()
            if not new_desc or len(new_desc) < 30:
                return {'error': 'GPT не смог сгенерировать описание, попробуйте ещё раз'}

        cur.execute(
            f"UPDATE {SCHEMA}.listings SET description = '{_sanitize_text(new_desc, 5000)}', "
            f"updated_at = NOW() WHERE id = {listing_id}"
        )
        preview = new_desc[:120] + ('…' if len(new_desc) > 120 else '')
        return {
            'ok': True,
            'listing_id': listing_id,
            'description': new_desc,
            'message': f'✅ Описание для объекта #{listing_id} сгенерировано и сохранено.\n\n{preview}',
        }

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
        # Если items пустой — берём ВСЕ активные объекты без описания
        if not isinstance(items, list) or not items:
            cur.execute(
                f"SELECT id FROM {SCHEMA}.listings "
                f"WHERE status='active' AND (description IS NULL OR LENGTH(description) < 50) "
                f"ORDER BY id"
            )
            items = [{'id': r['id']} for r in cur.fetchall()]
        if not items:
            return {'ok': True, 'message': 'Все объекты уже имеют описания.'}

        # Режим 1: готовые описания переданы — просто сохраняем
        has_ready = all(isinstance(it, dict) and it.get('description') for it in items)
        if has_ready:
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

        # Режим 2: только id — генерируем через generate_description для каждого
        db_key, db_folder = _load_keys_from_db(cur)
        if not db_key:
            return {'error': 'YandexGPT не настроен'}

        ids = [int(it.get('id')) for it in items if isinstance(it, dict) and str(it.get('id','')).isdigit()]
        if not ids:
            return {'error': 'Не переданы корректные id'}

        id_list = ','.join(str(i) for i in ids)
        cur.execute(
            f"SELECT id, title, category, deal, area, price, address, district, floor, floors_total, condition "
            f"FROM {SCHEMA}.listings WHERE id IN ({id_list})"
        )
        rows = [dict(r) for r in cur.fetchall()]

        deal_map = {'sale': 'Продажа', 'rent': 'Аренда', 'lease': 'Аренда'}
        cat_map = {
            'office': 'Офис', 'warehouse': 'Склад', 'retail': 'Торговое помещение',
            'production': 'Производство', 'land': 'Земельный участок', 'gab': 'Готовый арендный бизнес',
            'building': 'Здание', 'free_purpose': 'Помещение свободного назначения',
        }
        cur.execute(f"SELECT company_name FROM {SCHEMA}.settings LIMIT 1")
        site_s = cur.fetchone() or {}
        company = (site_s.get('company_name') or 'наша компания')

        sys_p = (
            'Ты — копирайтер коммерческой недвижимости. Пиши продающие описания: живо, конкретно, без воды. '
            'Структура: 1) главная ценность (1-2 предл.), 2) характеристики (2-3 предл.), 3) кому подойдёт (1 предл.). '
            'Без эмодзи, без markdown. 80-150 слов.'
        )

        updated = 0
        results = []
        for row in rows:
            try:
                lid = row['id']
                deal_ru = deal_map.get((row.get('deal') or '').lower(), '')
                cat_ru = cat_map.get((row.get('category') or '').lower(), 'Объект')
                price_fmt = f"{int(row['price']):,}".replace(',', ' ') + ' ₽' if row.get('price') else '—'
                area = row.get('area') or '—'
                address = row.get('address') or row.get('district') or '—'
                floor_info = f"этаж {row['floor']}" if row.get('floor') else ''

                user_p = (
                    f'Описание для: {cat_ru}, {deal_ru}, {area} м², {price_fmt}, {address}'
                    + (f', {floor_info}' if floor_info else '')
                    + f'\nНазвание: {row.get("title","")}\nКомпания: {company}'
                )
                gpt = _call_yandex_gpt(sys_p, user_p, db_key, db_folder,
                    history=None, temperature=0.6, max_tokens=350, model=YANDEX_MODEL_SHORT)
                desc = (gpt.get('text') or '').strip()
                if desc and len(desc) > 30:
                    cur.execute(f"UPDATE {SCHEMA}.listings SET description='{_sanitize_text(desc, 5000)}', updated_at=NOW() WHERE id={lid}")
                    updated += 1
                    results.append(f'#{lid}')
            except Exception:
                continue

        sample = ', '.join(results[:8]) + (f' и ещё {updated-8}' if updated > 8 else '')
        return {
            'ok': True,
            'updated': updated,
            'total': len(rows),
            'message': f'✅ Описания сгенерированы и сохранены: {updated} из {len(rows)} объектов ({sample}).',
        }

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

        deal_map = {'sale': 'Продажа', 'rent': 'Аренда', 'lease': 'Аренда'}
        cat_map = {
            'office': 'офис', 'warehouse': 'склад', 'retail': 'ритейл',
            'production': 'производство', 'land': 'участок', 'gab': 'ГАБ',
            'building': 'здание', 'free_purpose': 'помещение',
        }

        # Режим 1: items уже содержит готовые new_title → просто применяем без GPT
        if isinstance(items, list) and items and all(isinstance(it, dict) and it.get('new_title') for it in items):
            updated = 0
            for it in items:
                try:
                    lid = int(it.get('id') or 0)
                    nt = _sanitize_text(str(it.get('new_title') or ''), 200).strip()
                    if not lid or not nt:
                        continue
                    if len(nt) > max_len + 20:
                        cut = nt[:max_len].rsplit(' ', 1)[0] or nt[:max_len]
                        nt = cut.rstrip(' .,;:-—')
                    cur.execute(
                        f"UPDATE {SCHEMA}.listings SET title='{nt}', updated_at=NOW() WHERE id={lid}"
                    )
                    updated += 1
                except Exception:
                    continue
            return {'ok': True, 'message': f'Названия обновлены: {updated} из {len(items)}'}

        # Режим 2: items = [{id}, ...] или пусто → собираем ВСЕ длинные из БД
        if isinstance(items, list) and items:
            ids_from_params = [int(it.get('id')) for it in items if isinstance(it, dict) and str(it.get('id', '')).isdigit()]
        else:
            ids_from_params = []

        if ids_from_params:
            id_list = ','.join(str(i) for i in ids_from_params)
            cur.execute(
                f"SELECT id, title, category, deal, area, district, address "
                f"FROM {SCHEMA}.listings WHERE id IN ({id_list}) ORDER BY LENGTH(title) DESC"
            )
        else:
            # Без явных ID — берём ВСЕ активные объекты с длинным title (без лимита)
            cur.execute(
                f"SELECT id, title, category, deal, area, district, address "
                f"FROM {SCHEMA}.listings "
                f"WHERE status='active' AND LENGTH(title) > {max_len} "
                f"ORDER BY LENGTH(title) DESC"
            )
        rows = [dict(r) for r in cur.fetchall()]
        if not rows:
            return {'ok': True, 'message': f'Объектов с title длиннее {max_len} символов не найдено.'}

        db_key, db_folder = _load_keys_from_db(cur)
        if not db_key:
            return {'error': 'YandexGPT не настроен'}

        sys_p = (
            'Ты — SEO-копирайтер коммерческой недвижимости. Получаешь список объектов в формате:\n'
            'ID|Тип сделки|Категория|Площадь|Район|Текущее название\n\n'
            'Для каждого объекта напиши короткий SEO-заголовок (45-65 символов).\n'
            'Правила: 1) вид сделки (Аренда/Продажа). 2) тип объекта. 3) площадь в м². '
            '4) район или улица коротко. 5) без воды и эмодзи.\n'
            'Отвечай СТРОГО в формате — одна строка на объект:\n'
            'ID|Новый заголовок\n'
            'Никаких пояснений, только строки ID|заголовок.'
        )

        # Батчевая обработка по 15 объектов — один вызов GPT на пачку
        BATCH = 15
        results = []
        updated = 0
        total = len(rows)

        import math as _math
        batches = [rows[i:i+BATCH] for i in range(0, total, BATCH)]

        for batch in batches:
            lines = []
            for r in batch:
                deal_ru = deal_map.get((r.get('deal') or '').lower(), '—')
                cat_ru = cat_map.get((r.get('category') or '').lower(), 'помещение')
                area = r.get('area') or '—'
                district = (r.get('district') or r.get('address') or '')[:50]
                old_title = (r.get('title') or '')[:200]
                lines.append(f"{r['id']}|{deal_ru}|{cat_ru}|{area}|{district}|{old_title}")

            user_p = 'Объекты:\n' + '\n'.join(lines) + '\n\nВерни только строки ID|Новый заголовок.'
            gpt = _call_yandex_gpt(
                sys_p, user_p, db_key, db_folder,
                history=None, temperature=0.3, max_tokens=BATCH * 25,
                model=YANDEX_MODEL_SHORT,
            )
            raw = (gpt.get('text') or '').strip()

            # Парсим ответ построчно
            gpt_map = {}
            for line in raw.splitlines():
                line = line.strip()
                if '|' not in line:
                    continue
                parts = line.split('|', 1)
                if len(parts) == 2:
                    try:
                        gpt_map[int(parts[0].strip())] = parts[1].strip().strip('"').strip("'")
                    except Exception:
                        pass

            # Применяем результаты батча
            for r in batch:
                lid = r['id']
                old_title = (r.get('title') or '')[:100]
                new_title = gpt_map.get(lid, '')
                if not new_title or len(new_title) < 15:
                    results.append({'id': lid, 'old': old_title, 'skipped': True})
                    continue
                if len(new_title) > max_len + 15:
                    cut = new_title[:max_len].rsplit(' ', 1)[0] or new_title[:max_len]
                    new_title = cut.rstrip(' .,;:-—')
                try:
                    safe_title = _sanitize_text(new_title, 200)
                    cur.execute(
                        f"UPDATE {SCHEMA}.listings SET title='{safe_title}', updated_at=NOW() WHERE id={lid}"
                    )
                    updated += 1
                    results.append({'id': lid, 'old': old_title, 'new': new_title})
                except Exception as e:
                    results.append({'id': lid, 'old': old_title, 'skipped': True, 'reason': str(e)[:80]})

        skipped = total - updated
        # Краткий отчёт со списком исправленных
        sample_lines = [f"• [{r['id']}] {r.get('new','—')}" for r in results if not r.get('skipped')][:10]
        sample_text = '\n'.join(sample_lines)
        if len(results) > 10:
            sample_text += f'\n... и ещё {updated - 10} объектов'

        return {
            'ok': True,
            'updated': updated,
            'skipped': skipped,
            'total': total,
            'results': results,
            'message': (
                f'✅ Оптимизация завершена: исправлено {updated} из {total} заголовков'
                + (f', пропущено {skipped}' if skipped else '') + '.\n\n'
                + sample_text
            ),
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
            # Автосбор: сканируем S3 и берём кандидатов на сжатие
            try:
                s3 = _s3()
                all_keys_sizes = {}
                paginator = s3.get_paginator('list_objects_v2')
                for prefix in S3_PREFIXES:
                    try:
                        for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
                            for obj in page.get('Contents', []):
                                all_keys_sizes[obj['Key']] = obj['Size']
                    except Exception:
                        pass
                keys = [
                    k for k, sz in all_keys_sizes.items()
                    if sz > IMG_COMPRESS_THRESHOLD
                    and k.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
                ][:50]
            except Exception as e:
                return {'error': f'Не удалось собрать список файлов: {e}'}
            if not keys:
                return {'ok': True, 'message': 'Нет изображений для оптимизации — все файлы уже в норме.'}
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

    # ── Поиск заявки по телефону или id ─────────────────────────────────
    if act_type == 'lookup_lead':
        phone = (params.get('phone') or '').strip()
        lead_id = params.get('id')
        if not phone and not lead_id:
            return {'error': 'Укажите телефон или id заявки'}
        if lead_id:
            try:
                cur.execute(
                    f"SELECT id, name, phone, email, message, status, source, "
                    f"listing_id, created_at, company, request_category, budget "
                    f"FROM {SCHEMA}.leads WHERE id = {int(lead_id)}"
                )
            except Exception:
                return {'error': 'Некорректный id'}
        else:
            # Нормализуем телефон — убираем всё кроме цифр для поиска
            digits = ''.join(c for c in phone if c.isdigit())
            cur.execute(
                f"SELECT id, name, phone, email, message, status, source, "
                f"listing_id, created_at, company, request_category, budget "
                f"FROM {SCHEMA}.leads "
                f"WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%{digits[-10:]}%' "
                f"ORDER BY created_at DESC LIMIT 5"
            )
        rows = [dict(r) for r in cur.fetchall()]
        if not rows:
            return {'ok': True, 'found': 0, 'message': 'Заявок не найдено', 'leads': []}
        # Форматируем даты
        for r in rows:
            if r.get('created_at'):
                try:
                    r['created_at'] = r['created_at'].strftime('%d.%m.%Y %H:%M')
                except Exception:
                    r['created_at'] = str(r['created_at'])
        return {
            'ok': True, 'found': len(rows), 'leads': rows,
            'message': f'Найдено заявок: {len(rows)}. ' + '; '.join(
                f"#{r['id']} {r.get('name','?')} {r.get('phone','')} — {r.get('status','?')}"
                for r in rows
            ),
        }

    # ── Отправка email клиенту из чата ───────────────────────────────────
    if act_type == 'send_email_to_lead':
        import smtplib
        from email.mime.text import MIMEText as _MIMEText
        lead_id = params.get('lead_id') or params.get('id')
        to_email = (params.get('email') or '').strip()
        subject = (params.get('subject') or '').strip()
        body = (params.get('body') or '').strip()
        if not (subject and body):
            return {'error': 'Укажите тему (subject) и текст письма (body)'}
        # Если email не передан — берём из лида
        if not to_email and lead_id:
            try:
                cur.execute(f"SELECT email, name FROM {SCHEMA}.leads WHERE id = {int(lead_id)}")
                row = cur.fetchone()
                if row:
                    to_email = (row.get('email') or '').strip()
            except Exception:
                pass
        if not to_email:
            return {'error': 'Не найден email получателя. Укажите email или lead_id с email в базе'}
        # Настройки SMTP из settings
        cur.execute(
            f"SELECT smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, company_name "
            f"FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
        )
        s = cur.fetchone() or {}
        host = (s.get('smtp_host') or '').strip()
        port = int(s.get('smtp_port') or 465)
        smtp_user = (s.get('smtp_user') or '').strip()
        smtp_pass = (s.get('smtp_password') or '').strip()
        smtp_from = (s.get('smtp_from') or smtp_user or '').strip()
        company = (s.get('company_name') or 'БМН').strip()
        if not (host and smtp_user and smtp_pass):
            return {'error': 'SMTP не настроен. Перейди в Настройки → Интеграции и укажи данные почты'}
        try:
            msg = _MIMEText(body, 'plain', 'utf-8')
            msg['Subject'] = subject
            msg['From'] = f'{company} <{smtp_from}>'
            msg['To'] = to_email
            if port == 465:
                srv = smtplib.SMTP_SSL(host, port, timeout=15)
            else:
                srv = smtplib.SMTP(host, port, timeout=15)
                srv.starttls()
            srv.login(smtp_user, smtp_pass)
            srv.sendmail(smtp_from, [to_email], msg.as_string())
            srv.quit()
            # Логируем в лид если есть lead_id
            if lead_id:
                try:
                    cur.execute(
                        f"UPDATE {SCHEMA}.leads SET updated_at = NOW() WHERE id = {int(lead_id)}"
                    )
                except Exception:
                    pass
            return {'ok': True, 'message': f'Письмо отправлено на {to_email}. Тема: «{subject}»'}
        except Exception as e:
            return {'error': f'Ошибка отправки: {str(e)[:200]}'}

    # ── Поиск по базе знаний (ai_memory) ─────────────────────────────────
    if act_type == 'search_knowledge':
        query = (params.get('query') or '').strip().lower()
        if not query:
            return {'error': 'Укажите поисковый запрос (query)'}
        # Ищем по ключу и значению
        terms = query.split()[:5]
        where_parts = []
        for t in terms:
            t_safe = t.replace("'", "''")
            where_parts.append(
                f"(LOWER(key) LIKE '%{t_safe}%' OR LOWER(value) LIKE '%{t_safe}%')"
            )
        where_sql = ' AND '.join(where_parts) if where_parts else '1=1'
        cur.execute(
            f"SELECT key, value, updated_at FROM {SCHEMA}.ai_memory "
            f"WHERE {where_sql} ORDER BY updated_at DESC LIMIT 10"
        )
        rows = cur.fetchall()
        if not rows:
            return {'ok': True, 'found': 0, 'results': [],
                    'message': f'В базе знаний ничего не найдено по запросу «{query}»'}
        results = []
        for r in rows:
            upd = r['updated_at'].strftime('%d.%m.%Y') if r.get('updated_at') else ''
            results.append({'key': r['key'], 'value': (r['value'] or '')[:300], 'updated': upd})
        summary = '\n'.join(f"• {r['key']}: {r['value'][:120]}" for r in results)
        return {
            'ok': True, 'found': len(results), 'results': results,
            'message': f'Найдено {len(results)} записей по «{query}»:\n{summary}',
        }

    # ── Назначить брокера на заявку ──────────────────────────────────────
    if act_type == 'assign_broker':
        lead_id = params.get('lead_id') or params.get('id')
        broker_id = params.get('broker_id')
        broker_name = (params.get('broker_name') or '').strip()
        if not lead_id:
            return {'error': 'Укажите lead_id заявки'}
        # Если передано имя — ищем брокера по нему
        if broker_name and not broker_id:
            name_safe = broker_name.replace("'", "''")
            cur.execute(
                f"SELECT id, name FROM {SCHEMA}.users "
                f"WHERE is_active = TRUE AND LOWER(name) LIKE '%{name_safe.lower()}%' "
                f"AND role IN ('admin','director','broker','manager','office_manager') LIMIT 1"
            )
            broker_row = cur.fetchone()
            if broker_row:
                broker_id = broker_row['id']
                broker_name = broker_row['name']
            else:
                return {'error': f'Брокер «{broker_name}» не найден в системе'}
        if not broker_id:
            return {'error': 'Укажите broker_id или broker_name'}
        try:
            cur.execute(
                f"UPDATE {SCHEMA}.leads SET broker_id = {int(broker_id)}, "
                f"status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END, "
                f"updated_at = NOW() WHERE id = {int(lead_id)}"
            )
        except Exception as e:
            return {'error': f'Ошибка: {e}'}
        return {
            'ok': True,
            'message': f'Заявка #{lead_id} назначена брокеру {broker_name or broker_id}. Статус → in_progress.',
        }

    # ── Уведомить сотрудника по email ────────────────────────────────────
    if act_type == 'notify_employee':
        import smtplib
        from email.mime.text import MIMEText as _MIMEText2
        employee_name = (params.get('name') or '').strip()
        employee_id = params.get('employee_id')
        subject = (params.get('subject') or '').strip()
        body = (params.get('body') or '').strip()
        if not (subject and body):
            return {'error': 'Укажите тему (subject) и текст (body)'}
        # Ищем email сотрудника
        to_email = (params.get('email') or '').strip()
        if not to_email:
            if employee_id:
                cur.execute(
                    f"SELECT email, name FROM {SCHEMA}.users WHERE id = {int(employee_id)} LIMIT 1"
                )
            elif employee_name:
                name_safe = employee_name.replace("'", "''")
                cur.execute(
                    f"SELECT email, name FROM {SCHEMA}.users "
                    f"WHERE is_active = TRUE AND LOWER(name) LIKE '%{name_safe.lower()}%' LIMIT 1"
                )
            else:
                return {'error': 'Укажите имя, id или email сотрудника'}
            row = cur.fetchone()
            if not row:
                return {'error': f'Сотрудник не найден'}
            to_email = (row.get('email') or '').strip()
            employee_name = employee_name or row.get('name', '')
        if not to_email:
            return {'error': f'У сотрудника {employee_name} не указан email'}
        # SMTP
        cur.execute(
            f"SELECT smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, company_name "
            f"FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
        )
        s = cur.fetchone() or {}
        host = (s.get('smtp_host') or '').strip()
        port = int(s.get('smtp_port') or 465)
        smtp_user = (s.get('smtp_user') or '').strip()
        smtp_pass = (s.get('smtp_password') or '').strip()
        smtp_from = (s.get('smtp_from') or smtp_user or '').strip()
        company = (s.get('company_name') or 'БМН').strip()
        if not (host and smtp_user and smtp_pass):
            return {'error': 'SMTP не настроен. Перейди в Настройки → Интеграции'}
        try:
            msg = _MIMEText2(body, 'plain', 'utf-8')
            msg['Subject'] = subject
            msg['From'] = f'{company} <{smtp_from}>'
            msg['To'] = to_email
            if port == 465:
                srv = smtplib.SMTP_SSL(host, port, timeout=15)
            else:
                srv = smtplib.SMTP(host, port, timeout=15)
                srv.starttls()
            srv.login(smtp_user, smtp_pass)
            srv.sendmail(smtp_from, [to_email], msg.as_string())
            srv.quit()
            return {'ok': True, 'message': f'Уведомление отправлено сотруднику {employee_name} ({to_email})'}
        except Exception as e:
            return {'error': f'Ошибка отправки: {str(e)[:200]}'}

    # ════════════════════════════════════════════════════════════════════
    # 🛡️  МОДУЛЬ: СТРАЖ (Security Guardian)
    # ════════════════════════════════════════════════════════════════════

    if act_type == 'guardian_full_scan':
        """Полное сканирование безопасности: XSS, спам, брутфорс, аномалии."""
        report = {}

        # 1. XSS в текстовых полях
        cur.execute(
            f"SELECT id, title FROM {SCHEMA}.listings "
            f"WHERE description ~ '<script|<iframe|onerror=|onclick=|javascript:' "
            f"OR title ~ '<script|<iframe|onerror=' LIMIT 20"
        )
        xss_rows = [dict(r) for r in cur.fetchall()]
        report['xss'] = {'count': len(xss_rows), 'items': xss_rows}

        # 2. Спам-активность по телефонам (>3 заявок за 24ч)
        cur.execute(
            f"SELECT phone, COUNT(*) AS cnt FROM {SCHEMA}.leads "
            f"WHERE created_at > NOW() - INTERVAL '24 hours' AND phone IS NOT NULL "
            f"GROUP BY phone HAVING COUNT(*) > 3 ORDER BY cnt DESC LIMIT 20"
        )
        spam_rows = [dict(r) for r in cur.fetchall()]
        report['spam_phones'] = {'count': len(spam_rows), 'items': spam_rows}

        # 3. Повторные заявки с одного email за неделю
        cur.execute(
            f"SELECT email, COUNT(*) AS cnt FROM {SCHEMA}.leads "
            f"WHERE created_at > NOW() - INTERVAL '7 days' AND email IS NOT NULL AND email != '' "
            f"GROUP BY email HAVING COUNT(*) > 5 ORDER BY cnt DESC LIMIT 10"
        )
        spam_emails = [dict(r) for r in cur.fetchall()]
        report['spam_emails'] = {'count': len(spam_emails), 'items': spam_emails}

        # 4. Подозрительные паттерны в заявках (SQL, скрипты)
        cur.execute(
            f"SELECT id, name, message FROM {SCHEMA}.leads "
            f"WHERE message ~ 'SELECT |INSERT |DROP |UNION |--$|<script' "
            f"OR name ~ '<script|SELECT ' LIMIT 10"
        )
        injection_rows = [dict(r) for r in cur.fetchall()]
        report['injections'] = {'count': len(injection_rows), 'items': injection_rows}

        # 5. Аномальные объекты: цена 0, площадь 0, без автора
        cur.execute(
            f"SELECT id, title, price, area FROM {SCHEMA}.listings "
            f"WHERE status='active' AND (price = 0 OR area = 0 OR author_id IS NULL) LIMIT 20"
        )
        anomaly_rows = [dict(r) for r in cur.fetchall()]
        report['anomalies'] = {'count': len(anomaly_rows), 'items': anomaly_rows}

        # 6. Активные блокировки
        cur.execute(
            f"SELECT block_type, value, reason, blocked_at FROM {SCHEMA}.agent_blocks "
            f"WHERE is_active = TRUE ORDER BY blocked_at DESC LIMIT 20"
        )
        blocks = [dict(r) for r in cur.fetchall()]
        for b in blocks:
            if b.get('blocked_at'):
                b['blocked_at'] = b['blocked_at'].strftime('%d.%m.%Y %H:%M')
        report['active_blocks'] = {'count': len(blocks), 'items': blocks}

        total_threats = (
            report['xss']['count'] + report['spam_phones']['count'] +
            report['injections']['count']
        )
        severity = 'critical' if total_threats > 5 else ('warning' if total_threats > 0 else 'info')

        # Сохраняем отчёт
        import json as _json
        summary = (
            f"XSS: {report['xss']['count']}, спам-телефоны: {report['spam_phones']['count']}, "
            f"инъекции: {report['injections']['count']}, аномалии: {report['anomalies']['count']}, "
            f"активных блокировок: {report['active_blocks']['count']}"
        )
        cur.execute(
            f"INSERT INTO {SCHEMA}.agent_reports (module, report_type, summary, data, severity) "
            f"VALUES ('guardian', 'full_scan', '{_sanitize_text(summary, 500)}', "
            f"'{_sanitize_text(_json.dumps(report, ensure_ascii=False, default=str), 8000)}', '{severity}')"
        )
        return {
            'ok': True, 'severity': severity,
            'report': report, 'message': f'Сканирование завершено. {summary}',
        }

    if act_type == 'guardian_block':
        """Заблокировать телефон/email как спам."""
        block_type = (params.get('block_type') or 'phone').strip()
        value = (params.get('value') or '').strip()
        reason = (params.get('reason') or 'Заблокировано агентом Страж').strip()
        if not value:
            return {'error': 'Укажите value (телефон, email или ip)'}
        if block_type not in ('phone', 'email', 'ip'):
            return {'error': 'block_type: phone | email | ip'}
        val_safe = value.replace("'", "''")
        reason_safe = reason.replace("'", "''")
        cur.execute(
            f"INSERT INTO {SCHEMA}.agent_blocks (block_type, value, reason, blocked_by) "
            f"VALUES ('{block_type}', '{val_safe}', '{reason_safe}', 'guardian') "
            f"ON CONFLICT (block_type, value) DO UPDATE SET is_active=TRUE, reason='{reason_safe}', blocked_at=NOW()"
        )
        return {'ok': True, 'message': f'{block_type} «{value}» заблокирован. Причина: {reason}'}

    if act_type == 'guardian_unblock':
        """Снять блокировку."""
        block_type = (params.get('block_type') or 'phone').strip()
        value = (params.get('value') or '').strip()
        if not value:
            return {'error': 'Укажите value'}
        val_safe = value.replace("'", "''")
        cur.execute(
            f"UPDATE {SCHEMA}.agent_blocks SET is_active=FALSE "
            f"WHERE block_type='{block_type}' AND value='{val_safe}'"
        )
        return {'ok': True, 'message': f'{block_type} «{value}» разблокирован'}

    if act_type == 'guardian_get_blocks':
        """Список активных блокировок."""
        cur.execute(
            f"SELECT block_type, value, reason, blocked_at FROM {SCHEMA}.agent_blocks "
            f"WHERE is_active=TRUE ORDER BY blocked_at DESC LIMIT 50"
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            if r.get('blocked_at'):
                r['blocked_at'] = r['blocked_at'].strftime('%d.%m.%Y %H:%M')
        return {'ok': True, 'count': len(rows), 'blocks': rows,
                'message': f'Активных блокировок: {len(rows)}'}

    # ════════════════════════════════════════════════════════════════════
    # 🔍  МОДУЛЬ: ИНСПЕКТОР (Site Doctor)
    # ════════════════════════════════════════════════════════════════════

    if act_type == 'inspector_full_audit':
        """Полный аудит сайта: SEO, данные, опечатки, качество контента."""
        audit = {}

        # 1. SEO-аудит
        cur.execute(
            f"SELECT "
            f"COUNT(*) FILTER (WHERE seo_title IS NULL OR seo_title='') AS no_seo_title, "
            f"COUNT(*) FILTER (WHERE seo_description IS NULL OR seo_description='') AS no_seo_desc, "
            f"COUNT(*) FILTER (WHERE LENGTH(seo_title) > 70) AS long_seo_title, "
            f"COUNT(*) FILTER (WHERE LENGTH(seo_description) > 160) AS long_seo_desc, "
            f"COUNT(*) FILTER (WHERE COALESCE(LENGTH(description),0) < 50) AS short_desc, "
            f"COUNT(*) FILTER (WHERE LENGTH(title) > 70) AS long_title, "
            f"COUNT(*) AS total "
            f"FROM {SCHEMA}.listings WHERE status='active'"
        )
        seo_stat = dict(cur.fetchone() or {})
        audit['seo'] = seo_stat

        # 2. Битые данные (нулевые цены, площади, пустые адреса)
        cur.execute(
            f"SELECT id, title, price, area, address FROM {SCHEMA}.listings "
            f"WHERE status='active' AND (price <= 0 OR area <= 0 OR "
            f"COALESCE(address,'') = '' OR COALESCE(city,'') = '') LIMIT 30"
        )
        broken_rows = [dict(r) for r in cur.fetchall()]
        audit['broken_data'] = {'count': len(broken_rows), 'items': broken_rows}

        # 3. Дубли по названию
        cur.execute(
            f"SELECT LOWER(title) AS title_lower, COUNT(*) AS cnt FROM {SCHEMA}.listings "
            f"WHERE status='active' GROUP BY LOWER(title) HAVING COUNT(*) > 1 LIMIT 10"
        )
        dupes = [dict(r) for r in cur.fetchall()]
        audit['duplicates'] = {'count': len(dupes), 'items': dupes}

        # 4. Устаревшие объекты (активны > 365 дней без изменений)
        cur.execute(
            f"SELECT id, title, created_at FROM {SCHEMA}.listings "
            f"WHERE status='active' AND created_at < NOW() - INTERVAL '365 days' "
            f"AND updated_at < NOW() - INTERVAL '180 days' LIMIT 20"
        )
        stale_rows = [dict(r) for r in cur.fetchall()]
        for r in stale_rows:
            if r.get('created_at'):
                r['created_at'] = r['created_at'].strftime('%d.%m.%Y')
        audit['stale_listings'] = {'count': len(stale_rows), 'items': stale_rows}

        # 5. Объекты без фото
        cur.execute(
            f"SELECT id, title FROM {SCHEMA}.listings "
            f"WHERE status='active' AND (image IS NULL OR image='') LIMIT 20"
        )
        no_photo = [dict(r) for r in cur.fetchall()]
        audit['no_photo'] = {'count': len(no_photo), 'items': no_photo}

        # 6. Лиды без обработки >7 дней
        cur.execute(
            f"SELECT id, name, phone, created_at FROM {SCHEMA}.leads "
            f"WHERE status='new' AND created_at < NOW() - INTERVAL '7 days' "
            f"ORDER BY created_at ASC LIMIT 20"
        )
        old_leads = [dict(r) for r in cur.fetchall()]
        for r in old_leads:
            if r.get('created_at'):
                r['created_at'] = r['created_at'].strftime('%d.%m.%Y')
        audit['old_unprocessed_leads'] = {'count': len(old_leads), 'items': old_leads}

        total_issues = (
            seo_stat.get('no_seo_title', 0) + seo_stat.get('short_desc', 0) +
            audit['broken_data']['count'] + audit['old_unprocessed_leads']['count']
        )
        severity = 'critical' if total_issues > 20 else ('warning' if total_issues > 5 else 'info')

        import json as _json2
        summary = (
            f"Без SEO: {seo_stat.get('no_seo_title',0)}, коротких описаний: {seo_stat.get('short_desc',0)}, "
            f"битых данных: {audit['broken_data']['count']}, дублей: {audit['duplicates']['count']}, "
            f"без фото: {audit['no_photo']['count']}, старых необработанных лидов: {audit['old_unprocessed_leads']['count']}"
        )
        # Сохраняем только числа в data — без вложенных items, чтобы не ломать SQL большим JSON
        audit_summary_only = {
            'seo': {k: v for k, v in seo_stat.items()},
            'broken_data': audit['broken_data']['count'],
            'duplicates': audit['duplicates']['count'],
            'stale_listings': audit['stale_listings']['count'],
            'no_photo': audit['no_photo']['count'],
            'old_unprocessed_leads': audit['old_unprocessed_leads']['count'],
        }
        try:
            cur.execute(
                f"INSERT INTO {SCHEMA}.agent_reports (module, report_type, summary, data, severity) "
                f"VALUES ('inspector', 'full_audit', '{_sanitize_text(summary, 500)}', "
                f"'{_sanitize_text(_json2.dumps(audit_summary_only, ensure_ascii=False), 2000)}', '{severity}')"
            )
        except Exception:
            pass  # не критично — основной результат возвращаем всегда
        return {
            'ok': True, 'severity': severity,
            'audit': audit, 'message': f'Аудит завершён. {summary}',
        }

    if act_type == 'inspector_check_typos':
        """Проверка опечаток в описаниях через YandexGPT (до 5 объектов за раз)."""
        ids = params.get('ids') or []
        if not ids:
            # Берём объекты с длинными описаниями
            cur.execute(
                f"SELECT id, title, description FROM {SCHEMA}.listings "
                f"WHERE status='active' AND LENGTH(description) > 100 "
                f"ORDER BY updated_at DESC LIMIT 5"
            )
            rows = [dict(r) for r in cur.fetchall()]
        else:
            id_list = ','.join(str(int(i)) for i in ids[:5] if str(i).isdigit() or isinstance(i, int))
            cur.execute(
                f"SELECT id, title, description FROM {SCHEMA}.listings WHERE id IN ({id_list})"
            )
            rows = [dict(r) for r in cur.fetchall()]

        if not rows:
            return {'ok': True, 'message': 'Нет объектов для проверки', 'results': []}

        api_key, folder_id = _load_keys_from_db(cur)
        if not api_key:
            return {'error': 'YandexGPT не настроен'}

        results = []
        for row in rows:
            text = (row.get('description') or '')[:1500]
            if not text:
                continue
            prompt = (
                f'Найди орфографические и стилистические ошибки в тексте объявления о недвижимости. '
                f'Перечисли только реальные ошибки (не больше 5), каждую в формате: '
                f'«ошибка» → «исправление». Если ошибок нет — ответь: ОК.\n\nТекст:\n{text}'
            )
            gpt_res = _call_yandex_gpt(prompt, 'Корректор текста', api_key, folder_id, model='short')
            results.append({
                'id': row['id'],
                'title': row.get('title', '')[:60],
                'typos': gpt_res.get('text', 'Ошибка GPT'),
            })

        return {
            'ok': True,
            'checked': len(results), 'results': results,
            'message': f'Проверено объектов: {len(results)}',
        }

    if act_type == 'inspector_get_reports':
        """Последние отчёты Инспектора и Стража."""
        module_filter = (params.get('module') or '').strip()
        limit = min(int(params.get('limit') or 10), 50)
        where = f"WHERE module='{module_filter}'" if module_filter else "WHERE TRUE"
        cur.execute(
            f"SELECT id, module, report_type, summary, severity, created_at, is_resolved "
            f"FROM {SCHEMA}.agent_reports {where} ORDER BY created_at DESC LIMIT {limit}"
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            if r.get('created_at'):
                r['created_at'] = r['created_at'].strftime('%d.%m.%Y %H:%M')
        return {'ok': True, 'count': len(rows), 'reports': rows}

    # ════════════════════════════════════════════════════════════════════
    # ✍️  МОДУЛЬ: КОПИРАЙТЕР
    # ════════════════════════════════════════════════════════════════════

    if act_type == 'copywriter_write_article':
        """Написать SEO-статью для блога под тему и TOV компании."""
        topic = (params.get('topic') or '').strip()
        keywords = (params.get('keywords') or '').strip()
        length = (params.get('length') or 'medium').strip()  # short|medium|long
        publish = params.get('publish', False)

        if not topic:
            return {'error': 'Укажите topic — тему статьи'}

        # Загружаем TOV из конфига модуля
        cur.execute(
            f"SELECT config FROM {SCHEMA}.agent_modules WHERE module='copywriter' LIMIT 1"
        )
        cfg_row = cur.fetchone()
        tov = 'профессиональный брокер коммерческой недвижимости'
        if cfg_row and cfg_row.get('config'):
            import json as _jcfg
            try:
                tov = _jcfg.loads(cfg_row['config']).get('tov', tov) if isinstance(cfg_row['config'], str) else cfg_row['config'].get('tov', tov)
            except Exception:
                pass

        # Данные о компании
        cur.execute(f"SELECT company_name, hero_subtitle FROM {SCHEMA}.settings LIMIT 1")
        site_s = cur.fetchone() or {}
        company = site_s.get('company_name') or 'BIZNEST'

        words_map = {'short': '400-600', 'medium': '700-900', 'long': '1200-1500'}
        words_count = words_map.get(length, '700-900')

        api_key, folder_id = _load_keys_from_db(cur)
        if not api_key:
            return {'error': 'YandexGPT не настроен'}

        kw_line = f'Ключевые слова для SEO (вплети органично): {keywords}.' if keywords else ''
        sys_p = (
            f'Ты — экспертный копирайтер агентства коммерческой недвижимости «{company}». '
            f'Стиль: {tov}. Пишешь полезные, экспертные статьи для блога. '
            f'Без воды, с конкретными фактами, советами и примерами.'
        )
        user_p = (
            f'Напиши SEO-статью для блога на тему: «{topic}». '
            f'{kw_line} '
            f'Объём: {words_count} слов. '
            f'Структура: заголовок H1, вводный абзац, 3-5 разделов с подзаголовками, заключение с призывом. '
            f'Без markdown-символов (#, *, **). Только чистый текст с переносами строк.'
        )

        gpt_res = _call_yandex_gpt(user_p, sys_p, api_key, folder_id)
        if 'error' in gpt_res:
            return {'error': gpt_res['error']}

        article_text = gpt_res.get('text', '')

        # Генерируем SEO-мету
        seo_prompt = (
            f'По этой статье дай:\nTITLE: заголовок до 65 символов\nDESCRIPTION: описание до 155 символов\n\n'
            f'Статья:\n{article_text[:800]}'
        )
        seo_res = _call_yandex_gpt(seo_prompt, 'SEO-специалист', api_key, folder_id, model='short')
        seo_text = seo_res.get('text', '')
        seo_title, seo_desc = '', ''
        for line in seo_text.splitlines():
            if line.startswith('TITLE:'):
                seo_title = line[6:].strip()[:65]
            elif line.startswith('DESCRIPTION:'):
                seo_desc = line[12:].strip()[:155]

        # Первая строка = заголовок статьи
        lines = [l.strip() for l in article_text.splitlines() if l.strip()]
        news_title = lines[0][:200] if lines else topic
        summary = lines[1][:500] if len(lines) > 1 else article_text[:200]

        news_id = None
        if publish:
            cur.execute(
                f"INSERT INTO {SCHEMA}.news (title, summary, content, is_published, "
                f"seo_title, seo_description, created_at) "
                f"VALUES ('{_sanitize_text(news_title, 200)}', "
                f"'{_sanitize_text(summary, 500)}', "
                f"'{_sanitize_text(article_text, 15000)}', TRUE, "
                f"'{_sanitize_text(seo_title, 100)}', "
                f"'{_sanitize_text(seo_desc, 300)}', NOW()) RETURNING id"
            )
            news_row = cur.fetchone()
            news_id = news_row['id'] if news_row else None

        # Логируем задачу
        cur.execute(
            f"UPDATE {SCHEMA}.agent_modules SET last_run_at=NOW() WHERE module='copywriter'"
        )

        return {
            'ok': True,
            'title': news_title,
            'content': article_text,
            'seo_title': seo_title,
            'seo_description': seo_desc,
            'news_id': news_id,
            'published': bool(publish and news_id),
            'message': (
                f'Статья «{news_title[:60]}» написана ({len(article_text)} симв.). '
                + (f'Опубликована как новость #{news_id}.' if news_id else 'Не опубликована — передай publish:true чтобы сохранить.')
            ),
        }

    if act_type == 'copywriter_rewrite_tov':
        """Переписать описание объекта под TOV компании."""
        listing_id = int(params.get('id') or 0)
        if not listing_id:
            return {'error': 'Укажите id объекта'}

        cur.execute(
            f"SELECT id, title, description, category, deal, price, area, district "
            f"FROM {SCHEMA}.listings WHERE id={listing_id}"
        )
        row = cur.fetchone()
        if not row:
            return {'error': f'Объект #{listing_id} не найден'}

        cur.execute(f"SELECT config FROM {SCHEMA}.agent_modules WHERE module='copywriter' LIMIT 1")
        cfg_row = cur.fetchone()
        tov = 'профессиональный брокер коммерческой недвижимости'
        if cfg_row and cfg_row.get('config'):
            import json as _jcfg2
            try:
                tov = (_jcfg2.loads(cfg_row['config']) if isinstance(cfg_row['config'], str) else cfg_row['config']).get('tov', tov)
            except Exception:
                pass

        api_key, folder_id = _load_keys_from_db(cur)
        if not api_key:
            return {'error': 'YandexGPT не настроен'}

        row = dict(row)
        ctx = f"{row.get('category','')}, {row.get('deal','')}, {row.get('area','')} м², {row.get('district','')}, {row.get('price','')} руб."
        prompt = (
            f'Перепиши описание объекта недвижимости в стиле: {tov}. '
            f'Параметры: {ctx}. Объём: 150-250 слов. Продающий, конкретный, без воды. '
            f'Только описание, без заголовка.\n\nИсходное описание:\n{(row.get("description") or "")[:1000]}'
        )
        gpt_res = _call_yandex_gpt(prompt, f'Копирайтер ({tov})', api_key, folder_id)
        if 'error' in gpt_res:
            return {'error': gpt_res['error']}

        new_desc = gpt_res.get('text', '')
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET description='{_sanitize_text(new_desc, 5000)}', "
            f"updated_at=NOW() WHERE id={listing_id}"
        )
        return {
            'ok': True,
            'id': listing_id, 'new_description': new_desc,
            'message': f'Описание объекта #{listing_id} переписано в стиле TOV ({len(new_desc)} симв.)',
        }

    if act_type == 'copywriter_get_topics':
        """Предложить темы для статей блога на основе каталога и лидов."""
        api_key, folder_id = _load_keys_from_db(cur)
        if not api_key:
            return {'error': 'YandexGPT не настроен'}

        # Собираем контекст: популярные категории и запросы лидов
        cur.execute(
            f"SELECT category, COUNT(*) AS cnt FROM {SCHEMA}.listings "
            f"WHERE status='active' GROUP BY category ORDER BY cnt DESC LIMIT 8"
        )
        cats = ', '.join(f"{r['category']}({r['cnt']})" for r in cur.fetchall())
        cur.execute(
            f"SELECT request_category, COUNT(*) AS cnt FROM {SCHEMA}.leads "
            f"WHERE created_at > NOW()-INTERVAL '30 days' AND request_category IS NOT NULL "
            f"GROUP BY request_category ORDER BY cnt DESC LIMIT 5"
        )
        lead_cats = ', '.join(f"{r['request_category']}({r['cnt']})" for r in cur.fetchall())
        cur.execute(f"SELECT company_name FROM {SCHEMA}.settings LIMIT 1")
        company = (cur.fetchone() or {}).get('company_name', 'агентство')

        prompt = (
            f'Ты — контент-стратег агентства «{company}». '
            f'Предложи 8 тем для SEO-статей блога. '
            f'Каталог: {cats}. Запросы клиентов за месяц: {lead_cats or "нет данных"}. '
            f'Темы должны отвечать на реальные вопросы покупателей/арендаторов. '
            f'Формат: нумерованный список, каждая тема — одна строка, до 80 символов.'
        )
        gpt_res = _call_yandex_gpt(prompt, 'Контент-стратег', api_key, folder_id, model='short')
        topics_text = gpt_res.get('text', '')
        topics = [l.strip() for l in topics_text.splitlines() if l.strip() and l[0].isdigit()]
        return {
            'ok': True, 'topics': topics, 'raw': topics_text,
            'message': f'Предложено {len(topics)} тем для блога',
        }

    # ════════════════════════════════════════════════════════════════════
    # 🎛️  МОДУЛЬ: ДИСПЕТЧЕР (Orchestrator)
    # ════════════════════════════════════════════════════════════════════

    if act_type == 'dispatcher_run_module':
        """Запустить конкретный модуль по имени."""
        module = (params.get('module') or '').strip()
        module_action_map = {
            'guardian':   'guardian_full_scan',
            'inspector':  'inspector_full_audit',
            'copywriter': 'copywriter_get_topics',
        }
        if module not in module_action_map:
            return {'error': f'Неизвестный модуль: {module}. Доступны: {", ".join(module_action_map)}'}

        # Проверяем включён ли модуль
        cur.execute(
            f"SELECT enabled FROM {SCHEMA}.agent_modules WHERE module='{module}' LIMIT 1"
        )
        mod_row = cur.fetchone()
        if mod_row and not mod_row.get('enabled'):
            return {'error': f'Модуль {module} отключён в настройках'}

        # Запускаем нужный _exec_action рекурсивно
        result = _exec_action(cur, user, module_action_map[module], params)

        # Обновляем last_run_at
        cur.execute(
            f"UPDATE {SCHEMA}.agent_modules SET last_run_at=NOW() WHERE module='{module}'"
        )
        # Сохраняем задачу
        import json as _jd
        cur.execute(
            f"INSERT INTO {SCHEMA}.agent_tasks (module, action, status, result, created_by) "
            f"VALUES ('{module}', '{module_action_map[module]}', 'done', "
            f"'{_sanitize_text(_jd.dumps(result, ensure_ascii=False, default=str), 4000)}', "
            f"{user['id'] if user else 'NULL'})"
        )
        return {'ok': True, 'module': module, 'result': result,
                'message': f'Модуль «{module}» выполнен'}

    if act_type == 'dispatcher_run_all':
        """Запустить все включённые модули последовательно."""
        modules = ['guardian', 'inspector']  # copywriter не запускаем авто (контент по запросу)
        results = {}
        for mod in modules:
            cur.execute(
                f"SELECT enabled FROM {SCHEMA}.agent_modules WHERE module='{mod}' LIMIT 1"
            )
            row = cur.fetchone()
            if not row or not row.get('enabled'):
                results[mod] = {'skipped': True, 'reason': 'отключён'}
                continue
            results[mod] = _exec_action(cur, user, f'{mod}_full_scan' if mod == 'guardian' else f'{mod}_full_audit', {})
            cur.execute(f"UPDATE {SCHEMA}.agent_modules SET last_run_at=NOW() WHERE module='{mod}'")

        summary = '; '.join(
            f"{m}: {'OK' if results[m].get('ok') else results[m].get('error','skip')}"
            for m in results
        )
        return {'ok': True, 'results': results, 'message': f'Все модули запущены. {summary}'}

    if act_type == 'dispatcher_get_status':
        """Статус всех модулей: включён, последний запуск, конфиг."""
        cur.execute(
            f"SELECT module, enabled, config, last_run_at FROM {SCHEMA}.agent_modules ORDER BY module"
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            if r.get('last_run_at'):
                r['last_run_at'] = r['last_run_at'].strftime('%d.%m.%Y %H:%M')
            # Последний отчёт
            cur.execute(
                f"SELECT severity, created_at FROM {SCHEMA}.agent_reports "
                f"WHERE module='{r['module']}' ORDER BY created_at DESC LIMIT 1"
            )
            last_rep = cur.fetchone()
            r['last_report_severity'] = last_rep['severity'] if last_rep else None

        # Задачи за последние 24ч
        cur.execute(
            f"SELECT module, action, status, created_at FROM {SCHEMA}.agent_tasks "
            f"WHERE created_at > NOW()-INTERVAL '24 hours' ORDER BY created_at DESC LIMIT 20"
        )
        tasks = [dict(r) for r in cur.fetchall()]
        for t in tasks:
            if t.get('created_at'):
                t['created_at'] = t['created_at'].strftime('%d.%m.%Y %H:%M')

        return {
            'ok': True, 'modules': rows, 'recent_tasks': tasks,
            'message': f'Модулей: {len(rows)}, задач за 24ч: {len(tasks)}',
        }

    if act_type == 'dispatcher_toggle_module':
        """Включить/выключить модуль."""
        module = (params.get('module') or '').strip()
        enabled = bool(params.get('enabled', True))
        if not module:
            return {'error': 'Укажите module'}
        cur.execute(
            f"UPDATE {SCHEMA}.agent_modules SET enabled={enabled}, updated_at=NOW() "
            f"WHERE module='{module}'"
        )
        state = 'включён' if enabled else 'выключен'
        return {'ok': True, 'message': f'Модуль «{module}» {state}'}

    # DevOps-модуль вынесен в отдельную функцию devops-agent

    # Smart Run вынесен в отдельную функцию backend/smart-run

    if act_type == 'dispatcher_smart_run':
        # Выполняется через отдельную функцию smart-run (см. backend/smart-run/index.py)
        return {'error': 'Smart Run выполняется через отдельный эндпоинт. Используй кнопку ⚡ Smart Run в чате.'}

    # ════════════════════════════════════════════════════════════════════
    # 🌐  ПОИСК В ИНТЕРНЕТЕ (Yandex Search API)
    # ════════════════════════════════════════════════════════════════════

    if act_type == 'web_search':
        """Поиск в интернете через Yandex Search API v2."""
        import xml.etree.ElementTree as ET
        import urllib.error as _ue

        query = (params.get('query') or '').strip()
        limit = min(int(params.get('limit') or 5), 10)
        if not query:
            return {'error': 'Укажите query для поиска'}

        search_key = os.environ.get('YANDEX_SEARCH_API_KEY', '')
        folder_id_s = os.environ.get('YANDEX_FOLDER_ID', '')
        if not search_key:
            return {'error': 'YANDEX_SEARCH_API_KEY не настроен'}

        payload = json.dumps({
            'query': {'searchType': 'SEARCH_TYPE_RU', 'queryText': query},
            'sortSpec': {'sortMode': 'SORT_MODE_BY_RELEVANCE'},
            'maxPassages': 2,
            'pageSize': limit,
        }, ensure_ascii=False).encode()

        req = urllib.request.Request(
            'https://searchapi.api.cloud.yandex.net/v2/web/search',
            data=payload,
            headers={
                'Authorization': f'Api-Key {search_key}',
                'Content-Type': 'application/json',
                'x-folder-id': folder_id_s,
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = json.loads(resp.read().decode())
        except _ue.HTTPError as e:
            err_body = ''
            try:
                err_body = e.read().decode('utf-8', errors='ignore')[:400]
            except Exception:
                pass
            return {'error': f'Yandex Search API ошибка {e.code}: {err_body}'}
        except Exception as e:
            return {'error': f'Ошибка соединения: {str(e)[:200]}'}

        # rawData — base64 XML с результатами
        import base64 as _b64
        raw_data = raw.get('rawData', '')
        if not raw_data:
            return {'ok': True, 'found': 0, 'results': [], 'message': f'По запросу «{query}» ничего не найдено.'}

        try:
            xml_bytes = _b64.b64decode(raw_data)
            root = ET.fromstring(xml_bytes.decode('utf-8', errors='ignore'))
        except Exception as e:
            return {'error': f'Ошибка разбора XML: {str(e)[:200]}'}

        results = []
        for doc in root.findall('.//doc'):
            title_el = doc.find('title')
            url_el = doc.find('url')
            passages = doc.findall('.//passage')
            snippet_parts = [p.text or '' for p in passages if p.text]
            # Убираем теги из текста (могут быть <hlword>)
            snippet = ' '.join(snippet_parts)[:400]
            # Очищаем от XML-тегов вручную
            import re as _re
            snippet = _re.sub(r'<[^>]+>', '', snippet).strip()
            title_text = _re.sub(r'<[^>]+>', '', (title_el.text or '') if title_el is not None else '').strip()
            url_text = (url_el.text or '').strip() if url_el is not None else ''
            if title_text or url_text:
                results.append({
                    'title': title_text[:150],
                    'url': url_text,
                    'snippet': snippet[:300],
                })

        # Формируем читаемое сообщение для ВБ
        lines = [f'🌐 Результаты поиска по запросу «{query}»:\n']
        for i, r in enumerate(results[:limit], 1):
            lines.append(f'{i}. **{r["title"]}**')
            if r['snippet']:
                lines.append(f'   {r["snippet"]}')
            lines.append(f'   🔗 {r["url"]}')
        summary = '\n'.join(lines) if results else f'По запросу «{query}» ничего не найдено.'

        return {
            'ok': True,
            'query': query,
            'found': len(results),
            'results': results,
            'message': summary,
        }

    # ════════════════════════════════════════════════════════════════════
    # 🧠  БАЗА ЗНАНИЙ (pgvector / FTS)
    # ════════════════════════════════════════════════════════════════════

    if act_type == 'knowledge_search':
        """Семантический поиск по базе знаний через FTS (с fallback на LIKE)."""
        query = (params.get('query') or '').strip()
        source_type = (params.get('source_type') or '').strip()
        limit = min(int(params.get('limit') or 10), 50)
        if not query:
            return {'error': 'Укажите query'}

        where_parts = []
        if source_type:
            where_parts.append(f"source_type = '{_sanitize_text(source_type, 50)}'")

        # FTS-поиск с ранжированием
        src_filter = f"AND {' AND '.join(where_parts)}" if where_parts else ''
        query_safe = _sanitize_text(query, 200)
        cur.execute(
            f"SELECT id, source_type, source_id, title, "
            f"LEFT(content, 400) AS snippet, meta, created_at, "
            f"ts_rank(fts, plainto_tsquery('russian', '{query_safe}')) AS rank "
            f"FROM {SCHEMA}.knowledge_vectors "
            f"WHERE fts @@ plainto_tsquery('russian', '{query_safe}') {src_filter} "
            f"ORDER BY rank DESC LIMIT {limit}"
        )
        rows = [dict(r) for r in cur.fetchall()]

        # Fallback: ILIKE если FTS ничего не нашёл
        if not rows:
            words = [w for w in query.split()[:3] if len(w) > 2]
            if words:
                like_parts = [f"content ILIKE '%{_sanitize_text(w, 50)}%'" for w in words]
                like_sql = ' OR '.join(like_parts)
                cur.execute(
                    f"SELECT id, source_type, source_id, title, "
                    f"LEFT(content, 400) AS snippet, meta, created_at, 0.0 AS rank "
                    f"FROM {SCHEMA}.knowledge_vectors "
                    f"WHERE ({like_sql}) {src_filter} "
                    f"ORDER BY created_at DESC LIMIT {limit}"
                )
                rows = [dict(r) for r in cur.fetchall()]

        for r in rows:
            if r.get('created_at'):
                r['created_at'] = r['created_at'].strftime('%d.%m.%Y')
            r['rank'] = round(float(r.get('rank') or 0), 4)

        summary = '\n'.join(
            f"• [{r['source_type']}] {r.get('title') or '—'}: {(r.get('snippet') or '')[:150]}"
            for r in rows
        )
        return {
            'ok': True, 'found': len(rows), 'results': rows,
            'message': f'По запросу «{query}» найдено {len(rows)} записей.' +
                       (f'\n{summary}' if rows else ' База знаний пуста или запрос не совпал.'),
        }

    if act_type == 'knowledge_index':
        """Проиндексировать источники в базу знаний: listings, news, ai_memory."""
        source_type = (params.get('source_type') or 'all').strip()
        limit = min(int(params.get('limit') or 50), 200)
        indexed = 0
        skipped = 0

        import hashlib as _md5

        def _upsert_doc(src_type: str, src_id, title: str, content: str, meta: dict):
            nonlocal indexed, skipped
            if not content or len(content.strip()) < 10:
                return
            import json as _jm
            h = _md5.md5(content.encode()).hexdigest()
            cur.execute(
                f"SELECT id FROM {SCHEMA}.knowledge_vectors "
                f"WHERE source_type='{src_type}' AND source_id={src_id if src_id else 'NULL'} "
                f"AND content_hash='{h}' LIMIT 1"
            )
            if cur.fetchone():
                skipped += 1
                return
            title_s = _sanitize_text(title or '', 490)
            content_s = _sanitize_text(content, 15000)
            meta_s = _sanitize_text(_jm.dumps(meta, ensure_ascii=False), 1000)
            src_id_sql = str(int(src_id)) if src_id else 'NULL'
            cur.execute(
                f"INSERT INTO {SCHEMA}.knowledge_vectors "
                f"(source_type, source_id, title, content, content_hash, meta) "
                f"VALUES ('{src_type}', {src_id_sql}, '{title_s}', '{content_s}', '{h}', '{meta_s}') "
                f"ON CONFLICT DO NOTHING"
            )
            indexed += 1

        # 1. Объекты каталога
        if source_type in ('all', 'listing'):
            cur.execute(
                f"SELECT id, title, description, category, deal, price, area, district, city, tags "
                f"FROM {SCHEMA}.listings WHERE status='active' "
                f"AND COALESCE(LENGTH(description),0) > 30 "
                f"ORDER BY id DESC LIMIT {limit}"
            )
            for r in cur.fetchall():
                r = dict(r)
                content = (
                    f"Объект: {r.get('title','')}. "
                    f"Категория: {r.get('category','')} {r.get('deal','')}. "
                    f"Цена: {r.get('price','')} руб., площадь: {r.get('area','')} м². "
                    f"Район: {r.get('district','')} {r.get('city','')}. "
                    f"Описание: {(r.get('description') or '')[:1000]}. "
                    f"Теги: {r.get('tags','')}."
                )
                _upsert_doc('listing', r['id'], r.get('title',''), content,
                            {'category': r.get('category'), 'price': r.get('price')})

        # 2. Новости / статьи блога
        if source_type in ('all', 'news'):
            cur.execute(
                f"SELECT id, title, summary, content FROM {SCHEMA}.news "
                f"WHERE is_published=TRUE ORDER BY id DESC LIMIT {limit}"
            )
            for r in cur.fetchall():
                r = dict(r)
                text = f"{r.get('summary','')} {(r.get('content') or '')[:2000]}"
                _upsert_doc('news', r['id'], r.get('title',''), text, {})

        # 3. База знаний ВБ (ai_memory)
        if source_type in ('all', 'ai_memory'):
            cur.execute(f"SELECT key, value FROM {SCHEMA}.ai_memory WHERE value IS NOT NULL")
            for r in cur.fetchall():
                r = dict(r)
                val = (r.get('value') or '')[:3000]
                if len(val) > 20:
                    _upsert_doc('ai_memory', None, r.get('key',''), val, {'key': r.get('key')})

        return {
            'ok': True,
            'indexed': indexed, 'skipped': skipped,
            'message': f'Индексирование завершено. Добавлено: {indexed}, пропущено (дубли): {skipped}.',
        }

    if act_type == 'knowledge_stats':
        """Статистика базы знаний."""
        cur.execute(
            f"SELECT source_type, COUNT(*) AS cnt, MAX(created_at) AS last_added "
            f"FROM {SCHEMA}.knowledge_vectors GROUP BY source_type ORDER BY cnt DESC"
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            if r.get('last_added'):
                r['last_added'] = r['last_added'].strftime('%d.%m.%Y')
        cur.execute(f"SELECT COUNT(*) AS total FROM {SCHEMA}.knowledge_vectors")
        total = (cur.fetchone() or {}).get('total', 0)
        summary = ', '.join(f"{r['source_type']}: {r['cnt']}" for r in rows)
        return {
            'ok': True, 'total': total, 'by_source': rows,
            'message': f'База знаний: {total} записей. {summary}',
        }

    if act_type == 'knowledge_delete':
        """Удалить записи из базы знаний по типу источника."""
        source_type = (params.get('source_type') or '').strip()
        if not source_type:
            return {'error': 'Укажите source_type (listing|news|ai_memory|all)'}
        if source_type == 'all':
            cur.execute(f"DELETE FROM {SCHEMA}.knowledge_vectors")
        else:
            cur.execute(
                f"DELETE FROM {SCHEMA}.knowledge_vectors WHERE source_type='{_sanitize_text(source_type, 50)}'"
            )
        count = cur.rowcount
        return {'ok': True, 'deleted': count, 'message': f'Удалено {count} записей типа «{source_type}»'}

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
        # Длинные названия — передаём ВСЕ id агенту, чтобы bulk_shorten_titles обработал все
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE status='active' AND LENGTH(title) > 70")
        ctx['listings_long_titles'] = cur.fetchone()['c']
        cur.execute(
            f"SELECT id, LENGTH(title) AS len, LEFT(title, 60) AS title_preview "
            f"FROM {SCHEMA}.listings WHERE status='active' AND LENGTH(title) > 70 "
            f"ORDER BY LENGTH(title) DESC LIMIT 200"
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
                    try:
                        res = _exec_action(cur, user, a_type, a_params)
                    except Exception as exec_err:
                        res = {'ok': False, 'error': f'Ошибка выполнения {a_type}: {str(exec_err)[:200]}'}
                    results.append({'type': a_type, 'result': res})
                    try:
                        log_text = json.dumps({'type': a_type, 'result': {'ok': res.get('ok'), 'message': str(res.get('message',''))[:200]}}, ensure_ascii=False)
                        cur.execute(
                            f"INSERT INTO {SCHEMA}.ai_logs (user_id, action, prompt, response, tokens) "
                            f"VALUES ({user['id']}, 'exec_{_safe(a_type, 40)}', '{_safe(a_type, 50)}', '{_sanitize_text(log_text, 2000)}', 0)"
                        )
                    except Exception:
                        pass
                try:
                    conn.commit()
                except Exception:
                    pass
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
            if action in ('admin', 'admin_ops', 'describe', 'title', 'reply_lead', 'seo', 'seo_listing'):
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
            short_actions = {'auto_tags', 'seo', 'seo_listing', 'add_city', 'title'}
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
                # Убираем markdown-обёртку ```json ... ``` (любые варианты)
                text = _re.sub(r'^```[a-zA-Z]*\s*', '', text)
                text = _re.sub(r'\s*```$', '', text).strip()
                # Пытаемся найти JSON-объект внутри текста — берём самый длинный
                if not text.startswith('{'):
                    matches_json = _re.findall(r'\{[\s\S]*?\}(?=\s*$|\s*\n\s*[^\{])', text)
                    m = _re.search(r'\{[\s\S]*\}', text)
                    if m:
                        text = m.group(0)
                # Несколько попыток парсинга
                parsed = None
                for candidate in [text, text.split('\n\n')[0], text.split('\n')[0]]:
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