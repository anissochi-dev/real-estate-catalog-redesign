"""
Новости коммерческой недвижимости: CRUD + автокопирайтер на YandexGPT + расписание. v3
Копирайтер анализирует рынок (ключевые ставки ЦБ, данные застройщиков Краснодара,
ипотека, аренда) и генерирует профессиональные статьи для публикации на сайте.

Публичные эндпоинты (без токена):
  GET /?action=list          — список опубликованных (limit, page)
  GET /?action=get&slug=...  — одна новость по slug
  POST {action:ping_cron}    — публичный крон-пинг (вызывается с сайта),
                                защита от флуда — через already_ran в БД

Защищённые (требуют X-Auth-Token, роли admin/editor/manager/director):
  GET  /?action=admin_list   — все новости для управления
  POST {action:create}       — создать вручную
  POST {action:update, id}   — обновить
  POST {action:publish, id}  — опубликовать/снять
  POST {action:remove, id}   — архивировать (soft)
  POST {action:generate}     — сгенерировать статью копирайтером
  POST {action:run_auto}     — запустить автогенерацию вручную
  GET  /?action=schedule     — получить расписание
  POST {action:save_schedule}— сохранить расписание
"""

import base64
import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

from ai_client import load_keys, chat_simple

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
}

ALLOWED_ROLES = ('admin', 'editor', 'manager', 'director')

# Темы для автогенерации — отобраны по реальной новостной активности в Краснодаре
AUTO_TOPICS = [
    # Высокая новостная активность — конкретные события по Краснодару
    'Рестораны и кафе Краснодара: открытия, закрытия, новые заведения',
    'Гостиницы и отели Краснодара: инвестиции, строительство, туристический поток',
    'Торговые центры и торговые помещения Краснодара: арендаторы, вакантность, открытия',
    'Строительство коммерческой недвижимости в Краснодаре: новые проекты и сдача объектов',
    'Рынок коммерческой недвижимости Краснодара: итоги и тенденции',

    # Средняя активность — есть региональные новости
    'Производственные и складские помещения Краснодарского края: новые резиденты и проекты',
    'Сельскохозяйственные земли Краснодарского края: сделки, арест, торги',
    'Инвестиции в готовый арендный бизнес (ГАБ) в Краснодаре',
    'Торговля и общепит Краснодара: банкротства, продажа бизнеса, новые открытия',
    'Земельные участки под коммерческую застройку в Краснодаре',

    # Конкретные события и сделки
    'Аренда и продажа офисов в Краснодаре: сделки и новые предложения',
    'Редевелопмент и реконструкция объектов в Краснодаре',
    'Крупные сделки с коммерческой недвижимостью на Кубани',
    'Банкротство и торги недвижимостью в Краснодарском крае',
    'Туристический и гостиничный бизнес Краснодарского края: инвестиции и развитие',
    'Фудкорты, рынки и торговые кластеры Краснодара: изменения и новинки',
    'Автосервисы и автобизнес Краснодара: покупка и аренда помещений',
    'Медицинские и образовательные объекты Краснодара: открытия и продажи',
    'Промышленные зоны и индустриальные парки Краснодарского края',
    'Краснодар в рейтингах инвестиционной привлекательности городов России',

    # Жилая недвижимость и социальная инфраструктура
    'Новый жилой комплекс вышел на рынок в Краснодаре: проект, цены, застройщик',
    'Старт строительства социального объекта в Краснодаре: школа, садик или поликлиника',
    'Ввод в эксплуатацию многоквартирного дома в Краснодаре',

    # Производство и промышленность
    'Открытие нового производства или завода в Краснодарском крае',
    'Расширение действующего производства в Краснодаре: новые линии и оборудование',
    'Строительство нового складского комплекса класса А или В на Кубани',
    'Аренда и продажа производственных помещений в Краснодарском крае',

    # Малый бизнес и поддержка предпринимателей
    'Запуск новой франшизы в Краснодаре: формат, инвестиции, условия',
    'Грант или субсидия краснодарскому предпринимателю: кто получил и за что',
    'Меры поддержки бизнеса в Краснодарском крае: условия и примеры получения',
    'Новый бизнес-инкубатор или технопарк в Краснодаре: набор резидентов',
    'Изменения в законодательстве для малого бизнеса: что важно знать предпринимателям Краснодара',
    'Бесплатное обучение для предпринимателей Краснодара: вебинары и курсы',
    'Самые востребованные ниши для старта бизнеса в Краснодаре',
    'Новый инвестор в краснодарском проекте: венчур или бизнес-ангел',
    'Кейс закрытия бизнеса в Краснодаре: разбор ошибок и уроки',
    'Интервью с владельцем успешного малого бизнеса в Краснодаре: цифры и опыт',

    # Аренда ставки и анализ рынка
    'Изменение арендных ставок на коммерческую недвижимость в районах Краснодара',
    'Продажа готового бизнеса в Краснодаре: что продают и по каким ценам',
    'Самые дорогие и дешёвые объекты коммерческой недвижимости Краснодара',
    'Перечень вакантных помещений под бизнес в новых районах Краснодара',
    'Сравнение условий банков для бизнеса в Краснодаре: кредиты и лизинг',
    'Пример перепрофилирования помещения в Краснодаре: новое применение старого объекта',

    # Гостиницы и отдых
    'Открытие новой гостиницы, отеля или гостевого дома в Краснодаре',
    'Ребрендинг или реновация гостиницы в Краснодаре',
    'Продажа готового гостиничного бизнеса в Краснодаре или Краснодарском крае',
    'Аренда помещений под хостел или апарт-отель в Краснодаре',
    'Открытие базы отдыха или загородного клуба в Краснодарском крае',

    # Общепит
    'Запуск нового ресторана, кафе или стрит-фуд точки в Краснодаре',
    'Смена концепции кафе или ресторана в Краснодаре',
    'Продажа прибыльного кафе, ресторана или бара в Краснодаре',
    'Поиск помещения под кофейню, пекарню или фастфуд в Краснодаре',

    # Офисы и бизнес-центры
    'Ввод в эксплуатацию нового бизнес-центра или офисного здания в Краснодаре',
    'Изменение арендных ставок на офисы классов А, В и С в Краснодаре',

    # Автобизнес
    'Открытие нового автосервиса или детейлинг-центра в Краснодаре',
    'Продажа готового автосервиса или шиномонтажа в Краснодаре',
]

# Стоп-фразы из ответов GPT-моделей при отказе отвечать
_REFUSAL_PHRASES = [
    'не могу обсуждать',
    'не могу помочь',
    'не могу отвечать',
    'давайте поговорим',
    'предлагаю поговорить',
    'не буду обсуждать',
    'не в состоянии',
    'не способен',
    'не имею возможности',
    'обратитесь к специалисту',
    'это вне моей компетенции',
    'я языковая модель',
    'я искусственный интеллект',
    'cannot discuss',
    'let\'s talk about something',
]

def _is_valid_article(article: dict) -> bool:
    """Проверяет что GPT вернул реальную статью, а не отказ/отписку."""
    if not article:
        return False
    title = (article.get('title') or '').lower()
    content = (article.get('content') or '').lower()
    # Проверяем стоп-фразы в заголовке и начале контента
    combined = title + ' ' + content[:500]
    for phrase in _REFUSAL_PHRASES:
        if phrase.lower() in combined:
            return False
    # Статья должна быть достаточно длинной
    if len(content) < 300:
        return False
    return True


SYSTEM_PROMPT_TEMPLATE = """Ты — редактор новостного издания о коммерческой недвижимости Краснодара и Краснодарского края.

СЕГОДНЯШНЯЯ ДАТА: {today}.
{key_rate_block}

ГЛАВНОЕ ПРАВИЛО — НИКАКИХ ВЫДУМОК:
- Пиши ТОЛЬКО на основе предоставленных новостей из источников
- Если новость не содержит конкретную цифру — НЕ придумывай её
- Если факт не указан в источниках — НЕ добавляй его
- Запрещено писать "по данным экспертов", "аналитики отмечают" без ссылки на реальный источник из новостей
- Запрещено придумывать проценты роста, суммы сделок, количество объектов и любые другие цифры

ФОРМАТ СТАТЬИ:
1. Заголовок: точно отражает содержание новостей, до 100 символов, период {month_year}
2. Краткое описание (summary): 2-3 предложения о том, что реально произошло, 150-250 символов
3. Текст: 4-6 абзацев, только факты из источников, профессиональный тон, 500-800 слов
4. Если упоминается ключевая ставка — {key_rate_rule}
5. Завершай кратким выводом о том, что это значит для рынка Краснодара — без придуманных прогнозов
6. Без markdown-разметки, только текст с переносами строк

ОБЯЗАТЕЛЬНО:
- Все факты и цифры — только из предоставленных новостей
- Переформулируй своими словами, НЕ копируй дословно
- Указывай временные рамки только если они есть в источниках

Формат ответа (строго JSON):
{{
  "title": "Заголовок статьи",
  "summary": "Краткое описание",
  "content": "Полный текст статьи"
}}"""


def _extract_key_rate(text: str) -> float | None:
    """
    Ищет упоминание ключевой ставки ЦБ РФ прямо в тексте (статьи/новости/сниппеты).
    Не делает никаких внешних запросов — только разбор переданного текста.
    Ищет число с процентом рядом со словом «ставка» (ключевая ставка / ставка ЦБ / ставка Банка России).
    Возвращает float (например 18.0) или None, если в тексте ставка не упомянута.
    """
    if not text:
        return None
    for m in re.finditer(r'ставк[а-я]*', text, re.IGNORECASE):
        window = text[max(0, m.start() - 15):m.end() + 60]
        rate_m = re.search(r'(\d{1,2})[.,]?(\d{0,2})\s*%', window)
        if rate_m:
            whole, frac = rate_m.group(1), rate_m.group(2) or '0'
            try:
                rate = float(f'{whole}.{frac}')
                if 1.0 <= rate <= 50.0:
                    return rate
            except Exception:
                continue
    return None


def _extract_key_rate_from_snippets(snippets: list | None) -> float | None:
    """Ищет ключевую ставку ЦБ РФ в заголовках/сниппетах найденных новостей (первое совпадение)."""
    if not snippets:
        return None
    for s in snippets:
        rate = _extract_key_rate(f"{s.get('title', '')} {s.get('snippet', '')}")
        if rate is not None:
            return rate
    return None


def _ok(body, status=200, cache: str = 'no-store'):
    headers = {**CORS, 'Content-Type': 'application/json', 'Cache-Control': cache}
    return {
        'statusCode': status,
        'headers': headers,
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(msg, status=400):
    return _ok({'error': msg}, status)


def _safe(s, n=500):
    return (s or '').replace("'", "''")[:n]


def _slug(title: str, news_id: int) -> str:
    s = title.lower()
    s = re.sub(r'[а-яё]', lambda m: {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh',
        'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
        'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts',
        'ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
    }.get(m.group(), ''), s)
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = s.strip('-')[:60]
    return f'{s}-{news_id}'


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.role, u.name FROM {SCHEMA}.sessions s "
        f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _load_gpt_keys(cur):
    return load_keys()


def _fetch_news_snippets(query: str, limit: int = 8) -> tuple[list[dict], str]:
    """
    Ищет свежие новости. Пробует несколько источников.
    Возвращает (список {'title', 'snippet', 'url'}, источник).
    """
    import urllib.parse

    # ── Метод 1: Яндекс XML Search API ───────────────────────────────────
    search_user = os.environ.get('YANDEX_SEARCH_USER', '')
    search_key = os.environ.get('YANDEX_SEARCH_API_KEY', '')
    if search_user and search_key:
        try:
            params = urllib.parse.urlencode({
                'user': search_user,
                'key': search_key,
                'query': query,
                'lr': '35',
                'l10n': 'ru',
                'sortby': 'rlv',
                'filter': 'none',
                'maxpassages': '3',
                'groupby': f'attr=d.mode=flat.groups-on-page={limit}.docs-in-group=1',
            })
            url = f'https://yandex.ru/search/xml?{params}'
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=12) as resp:
                xml_data = resp.read().decode('utf-8', errors='replace')
            # Проверяем на ошибку от Яндекса
            if '<error' in xml_data.lower():
                err_m = re.search(r'<message>(.*?)</message>', xml_data)
                raise Exception(f'Яндекс XML: {err_m.group(1) if err_m else xml_data[:200]}')
            root = ET.fromstring(xml_data)
            results = []
            for doc in root.iter('doc'):
                title_el = doc.find('title')
                snippet_el = doc.find('passages/passage') or doc.find('headline') or doc.find('snippet')
                url_el = doc.find('url')
                title = re.sub(r'<[^>]+>', '', (title_el.text or '') if title_el is not None else '').strip()
                snippet = re.sub(r'<[^>]+>', '', (snippet_el.text or '') if snippet_el is not None else '').strip()
                url_s = (url_el.text or '') if url_el is not None else ''
                if title:
                    results.append({'title': title[:150], 'snippet': snippet[:400], 'url': url_s[:200]})
                if len(results) >= limit:
                    break
            if results:
                return results, 'yandex_xml'
        except Exception as e:
            # Сохраняем ошибку для диагностики — попадёт в логи если вызывается из _gpt
            os.environ['_SEARCH_LAST_ERROR'] = str(e)[:300]

    # ── Метод 2: Google News RSS (без ключа) ─────────────────────────────
    try:
        q_enc = urllib.parse.quote(query)
        rss_url = f'https://news.google.com/rss/search?q={q_enc}&hl=ru&gl=RU&ceid=RU:ru'
        req2 = urllib.request.Request(rss_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req2, timeout=10) as resp2:
            rss_data = resp2.read().decode('utf-8', errors='replace')
        root2 = ET.fromstring(rss_data)
        results2 = []
        for item in root2.iter('item'):
            t_el = item.find('title')
            d_el = item.find('description')
            l_el = item.find('link')
            title = (t_el.text or '') if t_el is not None else ''
            snippet = re.sub(r'<[^>]+>', '', (d_el.text or '') if d_el is not None else '').strip()
            link = (l_el.text or '') if l_el is not None else ''
            # Убираем имя издания из заголовка (формат «Заголовок - Издание»)
            title = re.sub(r'\s+-\s+[\w\s]+$', '', title).strip()
            if title:
                results2.append({'title': title[:150], 'snippet': snippet[:300], 'url': link[:200]})
            if len(results2) >= limit:
                break
        if results2:
            return results2, 'google_news_rss'
    except Exception:
        pass

    # ── Метод 3: Яндекс Новости RSS ──────────────────────────────────────
    try:
        q_enc = urllib.parse.quote(query)
        yn_url = f'https://news.yandex.ru/search.rss?text={q_enc}&geo=35'
        req3 = urllib.request.Request(yn_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req3, timeout=10) as resp3:
            rss3 = resp3.read().decode('utf-8', errors='replace')
        root3 = ET.fromstring(rss3)
        results3 = []
        for item in root3.iter('item'):
            t_el = item.find('title')
            d_el = item.find('description')
            l_el = item.find('link')
            title = (t_el.text or '') if t_el is not None else ''
            snippet = re.sub(r'<[^>]+>', '', (d_el.text or '') if d_el is not None else '').strip()[:300]
            link = (l_el.text or '') if l_el is not None else ''
            if title:
                results3.append({'title': title[:150], 'snippet': snippet, 'url': link[:200]})
            if len(results3) >= limit:
                break
        if results3:
            return results3, 'yandex_news_rss'
    except Exception:
        pass

    return [], 'none'


def _build_news_context(snippets: list[dict]) -> str:
    """Форматирует найденные новости в читаемый блок для промпта GPT."""
    if not snippets:
        return ''
    lines = ['СВЕЖИЕ НОВОСТИ ИЗ ИНТЕРНЕТА (использй как фактуру, НЕ копируй дословно):']
    for i, s in enumerate(snippets, 1):
        lines.append(f'{i}. {s["title"]}')
        if s['snippet']:
            lines.append(f'   {s["snippet"]}')
    return '\n'.join(lines)


def _gpt(api_key, folder_id, topic, key_rate: float | None = None, news_snippets: list | None = None):
    if not api_key or not folder_id:
        return None, 'YandexGPT не настроен'
    now = datetime.now(timezone.utc)
    MONTHS_RU = ['января','февраля','марта','апреля','мая','июня',
                 'июля','августа','сентября','октября','ноября','декабря']
    today_str = f'{now.day} {MONTHS_RU[now.month-1]} {now.year}'
    month_year = f'{MONTHS_RU[now.month-1]} {now.year}'
    if key_rate is not None:
        key_rate_block = f'АКТУАЛЬНАЯ КЛЮЧЕВАЯ СТАВКА ЦБ РФ: {key_rate:.2f}% годовых. Используй ИМЕННО ЭТО значение — не придумывай другое.'
        key_rate_rule = f'используй только точное значение {key_rate:.2f}% — не придумывай другую цифру'
    else:
        key_rate_block = 'Ключевая ставка ЦБ РФ в предоставленных новостях не упомянута — опиши влияние ставки без конкретной цифры (например: "в условиях высокой ключевой ставки", "при текущей ставке ЦБ").'
        key_rate_rule = 'не указывай конкретный процент — напиши "при текущей ключевой ставке ЦБ" или "в условиях высоких ставок по кредитам"'
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        today=today_str,
        month_year=month_year,
        key_rate_block=key_rate_block,
        key_rate_rule=key_rate_rule,
    )
    # Если нет новостей — отказываемся генерировать (запрещено выдумывать)
    news_snippets = news_snippets or []
    if not news_snippets:
        return None, 'Нет свежих новостей по теме — генерация отменена (запрещено писать без источников)'
    news_block = _build_news_context(news_snippets)
    user_text = (
        f'Тема: {topic}\n'
        f'Дата публикации: {today_str}\n\n'
        f'{news_block}\n\n'
        f'Напиши статью, пересказав эти новости своими словами. '
        f'Используй только факты из источников выше. Не придумывай цифры и данные которых нет в новостях.'
    )
    try:
        text = chat_simple(system_prompt, user_text, api_key, folder_id,
                           temperature=0.3, max_tokens=3000, timeout=55)
        if not text:
            return None, 'Пустой ответ от модели'
        # Парсим JSON из ответа
        text = text.strip()
        if text.startswith('```'):
            text = re.sub(r'^```\w*\n?', '', text)
            text = re.sub(r'\n?```$', '', text)
        # Убираем markdown если GPT добавил
        def _strip_md(s):
            s = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', s)
            s = re.sub(r'#{1,6}\s+', '', s)
            s = re.sub(r'_{1,2}([^_]+)_{1,2}', r'\1', s)
            return s

        try:
            parsed = json.loads(text)
            parsed['content'] = _strip_md(parsed.get('content', ''))
            parsed['title'] = _strip_md(parsed.get('title', ''))
            return parsed, None
        except Exception:
            # Пробуем вытащить JSON из текста
            m = re.search(r'\{.*\}', text, re.DOTALL)
            if m:
                try:
                    parsed = json.loads(m.group(0))
                    parsed['content'] = _strip_md(parsed.get('content', ''))
                    parsed['title'] = _strip_md(parsed.get('title', ''))
                    return parsed, None
                except Exception:
                    pass
            # Если не JSON — формируем структуру из текста
            lines = text.split('\n', 2)
            return {
                'title': _strip_md(lines[0][:200] if lines else topic),
                'summary': lines[1][:300] if len(lines) > 1 else '',
                'content': _strip_md('\n'.join(lines[2:]) if len(lines) > 2 else text),
            }, None
    except Exception as e:
        return None, str(e)[:300]


def _generate_image(title: str, logo_url: str = '') -> str:
    """Генерирует обложку статьи через YandexART 2.0 и загружает в S3. Возвращает CDN URL или ''."""
    import time as _time
    import secrets as _secrets
    try:
        api_key = os.environ.get('AISTUDIO_API_KEY') or os.environ.get('YANDEX_API_KEY', '')
        folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
        if not api_key:
            print('[news] YandexART: нет API-ключа')
            return ''

        # Промпт на русском — YandexART лучше понимает русский
        prompt = (
            f'Профессиональная фотография коммерческой недвижимости для статьи: {title}. '
            'Современное деловое здание в Краснодаре, архитектурная съёмка, '
            'дневное освещение, чистый фон, высокое качество, без текста, без людей, '
            'реалистичная фотография, широкоформатный кадр 16:9'
        )

        model_uri = f'art://{folder_id}/yandex-art/latest' if folder_id else 'yandex-art/latest'

        # 1. Запускаем генерацию (асинхронная операция)
        req_body = json.dumps({
            'modelUri': model_uri,
            'generationOptions': {
                'seed': _secrets.randbelow(2**31),
                'aspectRatio': {'widthRatio': 16, 'heightRatio': 9},
            },
            'messages': [{'weight': 1, 'text': prompt}],
        }).encode()

        req = urllib.request.Request(
            'https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync',
            data=req_body,
            headers={
                'Authorization': f'Api-Key {api_key}',
                'Content-Type': 'application/json',
                **(({'x-folder-id': folder_id}) if folder_id else {}),
            },
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            op = json.loads(resp.read().decode())

        operation_id = op.get('id', '')
        if not operation_id:
            print(f'[news] YandexART: нет operation_id, ответ: {op}')
            return ''

        # 2. Polling — ждём завершения (до 50 сек)
        poll_url = f'https://llm.api.cloud.yandex.net/operations/{operation_id}'
        poll_headers = {
            'Authorization': f'Api-Key {api_key}',
            **(({'x-folder-id': folder_id}) if folder_id else {}),
        }
        img_b64 = ''
        for attempt in range(10):
            _time.sleep(5)
            poll_req = urllib.request.Request(poll_url, headers=poll_headers, method='GET')
            with urllib.request.urlopen(poll_req, timeout=15) as pr:
                result = json.loads(pr.read().decode())
            if result.get('done'):
                img_b64 = (result.get('response') or {}).get('image', '')
                break

        if not img_b64:
            print('[news] YandexART: генерация не завершилась за 50 сек')
            return ''

        img_bytes = base64.b64decode(img_b64)

        # 3. Загружаем в S3
        s3 = boto3.client(
            's3',
            endpoint_url='https://bucket.poehali.dev',
            aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
            aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        )
        key = f'news/{_secrets.token_urlsafe(12)}.jpg'
        s3.put_object(Bucket='files', Key=key, Body=img_bytes, ContentType='image/jpeg', CacheControl='public, max-age=31536000')
        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
        print(f'[news] YandexART: обложка создана → {cdn_url}')
        return cdn_url

    except Exception as e:
        print(f'[news] YandexART error: {e}')
        return ''


def _load_logo_url(cur) -> str:
    """Загружает logo_url компании из настроек."""
    try:
        cur.execute(f"SELECT logo_url FROM {SCHEMA}.settings ORDER BY id LIMIT 1")
        row = cur.fetchone()
        return (row.get('logo_url') or '') if row else ''
    except Exception:
        return ''


def _call_gpt_raw(api_key: str, folder_id: str, user_text: str, system_text: str = '') -> str:
    """Простой вызов YandexGPT, возвращает сырой текст ответа или ''."""
    if not api_key or not folder_id:
        return ''
    if not system_text:
        system_text = (
            'Ты — профессиональный аналитик рынка коммерческой недвижимости России. '
            'Пиши профессиональные аналитические статьи на русском языке. '
            'Отвечай строго в формате JSON: {"title":"...","summary":"...","content":"..."}'
        )
    try:
        return chat_simple(system_text, user_text, api_key, folder_id,
                           temperature=0.4, max_tokens=3000, timeout=55)
    except Exception as e:
        print(f'[price_digest] _call_gpt_raw error: {e}')
        return ''


def _parse_article_json(text: str) -> dict | None:
    """Парсит JSON-статью из ответа GPT."""
    text = text.strip()
    if text.startswith('```'):
        text = re.sub(r'^```\w*\n?', '', text)
        text = re.sub(r'\n?```$', '', text).strip()
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
    return None


CAT_LABELS_RU = {
    'office': 'Офисы', 'retail': 'Торговые помещения', 'warehouse': 'Склады',
    'standalone': 'Отдельные здания', 'industrial': 'Производство/промышленность',
    'free_purpose': 'Свободное назначение', 'catering': 'Общепит',
    'car_service': 'Автосервисы', 'hotel': 'Гостиницы', 'land': 'Земля',
}
DEAL_LABELS_RU = {'sale': 'продажа', 'rent': 'аренда'}


def _analyze_price_changes(cur, threshold_pct: float = 3.0) -> list:
    """
    Сравнивает два последних снапшота price_market_snapshots (город в целом, district=''),
    возвращает значимые изменения цены за м² по категориям + направлению сделки (аренда/продажа).

    ВАЖНО: раньше использовалась price_history_biweekly, которая не пополняется автоматически
    (последний срез застрял на 2026-06-02) — из-за этого сводка была идентична неделя за неделей.
    price_market_snapshots пополняется ежедневным cron-батчем price_market_refresh на реальных
    данных с arrpro/ayax/etagi — здесь всегда есть актуальный срез.
    """
    try:
        cur.execute(
            f"SELECT DISTINCT snapshot_date FROM {SCHEMA}.price_market_snapshots "
            f"WHERE district = '' ORDER BY snapshot_date DESC LIMIT 2"
        )
        dates = [r['snapshot_date'] for r in cur.fetchall()]
        if len(dates) < 2:
            return []
        date_new, date_old = dates[0], dates[1]

        cur.execute(
            f"SELECT n.category, n.deal, "
            f"n.price_per_m2_median AS price_new, o.price_per_m2_median AS price_old, "
            f"n.analogs_count AS cnt_new, o.analogs_count AS cnt_old "
            f"FROM {SCHEMA}.price_market_snapshots n "
            f"JOIN {SCHEMA}.price_market_snapshots o "
            f"  ON n.category = o.category AND n.deal = o.deal AND n.district = o.district "
            f"WHERE n.district = '' AND n.snapshot_date = '{date_new}' AND o.snapshot_date = '{date_old}' "
            f"  AND n.price_per_m2_median IS NOT NULL AND o.price_per_m2_median IS NOT NULL "
            f"  AND n.price_per_m2_median > 0 AND o.price_per_m2_median > 0 "
            f"  AND n.analogs_count >= 3 AND o.analogs_count >= 3"
        )
        rows = [dict(r) for r in cur.fetchall()]

        significant = []
        for r in rows:
            price_new = float(r['price_new'])
            price_old = float(r['price_old'])
            chg = round((price_new / price_old - 1) * 100, 1)
            # Фильтруем аномальные выбросы (>50%) — скорее всего смена состава выборки, не рынка
            if abs(chg) >= threshold_pct and abs(chg) <= 50.0:
                cat = r.get('category') or ''
                deal = r.get('deal') or ''
                significant.append({
                    'category': cat,
                    'deal_type': deal,
                    'cat_label': CAT_LABELS_RU.get(cat, cat),
                    'deal_label': DEAL_LABELS_RU.get(deal, deal),
                    'price_per_m2': price_new,
                    'change_pct': chg,
                    'arrow': '↑' if chg > 0 else '↓',
                    'sign': '+' if chg > 0 else '',
                    'date_new': str(date_new),
                    'date_old': str(date_old),
                })
        significant.sort(key=lambda c: abs(c['change_pct']), reverse=True)
        return significant
    except Exception as e:
        print(f'[price_digest] ошибка анализа: {e}')
        return []


def _analyze_district_changes(cur, threshold_pct: float = 5.0, limit: int = 3) -> list:
    """
    Сравнивает два последних снапшота price_market_snapshots по районам (district != ''),
    возвращает топ районов с наибольшим изменением цены за м² по любой категории+сделке.
    Используется как дополнительный блок сводки — если изменений нет, блок просто не включается.
    """
    try:
        cur.execute(
            f"SELECT DISTINCT snapshot_date FROM {SCHEMA}.price_market_snapshots "
            f"WHERE district != '' ORDER BY snapshot_date DESC LIMIT 2"
        )
        dates = [r['snapshot_date'] for r in cur.fetchall()]
        if len(dates) < 2:
            return []
        date_new, date_old = dates[0], dates[1]

        cur.execute(
            f"SELECT n.category, n.deal, n.district, "
            f"n.price_per_m2_median AS price_new, o.price_per_m2_median AS price_old, "
            f"n.analogs_count AS cnt_new, o.analogs_count AS cnt_old "
            f"FROM {SCHEMA}.price_market_snapshots n "
            f"JOIN {SCHEMA}.price_market_snapshots o "
            f"  ON n.category = o.category AND n.deal = o.deal AND n.district = o.district "
            f"WHERE n.district != '' AND n.snapshot_date = '{date_new}' AND o.snapshot_date = '{date_old}' "
            f"  AND n.price_per_m2_median IS NOT NULL AND o.price_per_m2_median IS NOT NULL "
            f"  AND n.price_per_m2_median > 0 AND o.price_per_m2_median > 0 "
            f"  AND n.analogs_count >= 3 AND o.analogs_count >= 3"
        )
        rows = [dict(r) for r in cur.fetchall()]

        significant = []
        for r in rows:
            price_new = float(r['price_new'])
            price_old = float(r['price_old'])
            chg = round((price_new / price_old - 1) * 100, 1)
            if abs(chg) >= threshold_pct and abs(chg) <= 50.0:
                cat = r.get('category') or ''
                deal = r.get('deal') or ''
                significant.append({
                    'district': r.get('district') or '',
                    'category': cat,
                    'deal_type': deal,
                    'cat_label': CAT_LABELS_RU.get(cat, cat),
                    'deal_label': DEAL_LABELS_RU.get(deal, deal),
                    'price_per_m2': price_new,
                    'change_pct': chg,
                    'arrow': '↑' if chg > 0 else '↓',
                    'sign': '+' if chg > 0 else '',
                })
        significant.sort(key=lambda c: abs(c['change_pct']), reverse=True)
        return significant[:limit]
    except Exception as e:
        print(f'[price_digest] ошибка анализа районов: {e}')
        return []


def _build_price_digest_text(changes: list, date_str: str, district_changes: list | None = None) -> str:
    """Формирует краткий текст дайджеста для MAX."""
    lines = [f'📊 Обзор рынка коммерческой недвижимости — {date_str}', '']
    if not changes and not district_changes:
        lines.append('Значимых изменений цен не выявлено.')
        return '\n'.join(lines)
    if changes:
        for c in changes:
            arrow = c['arrow']
            sign = c['sign']
            lines.append(
                f"{arrow} {c['cat_label']} ({c['deal_label']}): "
                f"{sign}{c['change_pct']:.1f}% → {int(c['price_per_m2']):,} ₽/м²".replace(',', ' ')
            )
    if district_changes:
        lines += ['', '📍 По районам:']
        for c in district_changes:
            arrow = c['arrow']
            sign = c['sign']
            lines.append(
                f"{arrow} {c['district']} — {c['cat_label']} ({c['deal_label']}): "
                f"{sign}{c['change_pct']:.1f}% → {int(c['price_per_m2']):,} ₽/м²".replace(',', ' ')
            )
    lines += ['', '📈 Данные по рынку Краснодара']
    return '\n'.join(lines)


def _send_max_digest(bot_token: str, roles_str: str, cur, text: str):
    """Рассылает ценовой дайджест через MAX всем менеджерам."""
    try:
        enabled_roles = [r.strip() for r in (roles_str or 'broker,admin,director').split(',') if r.strip()]
        roles_sql = ', '.join(f"'{r}'" for r in enabled_roles)
        cur.execute(
            f"SELECT name, max_user_id FROM {SCHEMA}.users "
            f"WHERE is_active = TRUE AND max_user_id IS NOT NULL AND max_user_id != '' "
            f"AND role IN ({roles_sql})"
        )
        recipients = [(r['name'], r['max_user_id']) for r in cur.fetchall()]
        base_url = 'https://botapi.max.ru'
        sent = 0
        for _, uid in recipients:
            try:
                payload = json.dumps({'text': text}, ensure_ascii=False).encode('utf-8')
                req = urllib.request.Request(
                    f'{base_url}/messages?user_id={uid}',
                    data=payload,
                    headers={'Authorization': bot_token, 'Content-Type': 'application/json'},
                    method='POST',
                )
                urllib.request.urlopen(req, timeout=8)
                sent += 1
            except Exception as e:
                print(f'[price_digest] MAX send error to {uid}: {e}')
        return sent
    except Exception as e:
        print(f'[price_digest] _send_max_digest error: {e}')
        return 0


def _build_price_news_prompt(
    changes: list, date_str: str, key_rate: float | None,
    district_changes: list | None = None, prev_key_rate: float | None = None,
) -> str:
    """
    Строит prompt для GPT для генерации обзорной еженедельной статьи.
    Включает ТОЛЬКО блоки, где реально есть изменения (по городу, по районам, по ставке ЦБ) —
    пустые блоки не упоминаются вообще, чтобы не плодить шаблонные фразы вида
    "значимых изменений не выявлено" из недели в неделю.
    """
    now = datetime.now(timezone.utc)
    MONTHS_RU = ['января','февраля','марта','апреля','мая','июня',
                 'июля','августа','сентября','октября','ноября','декабря']
    month_year = f'{MONTHS_RU[now.month-1]} {now.year}'

    blocks = []

    if changes:
        table_lines = [
            f"- {c['cat_label']} ({c['deal_label']}): {c['sign']}{c['change_pct']:.1f}%, "
            f"цена {int(c['price_per_m2']):,} ₽/м²".replace(',', ' ')
            for c in changes
        ]
        blocks.append('Изменение цен по городу (за неделю):\n' + '\n'.join(table_lines))

    if district_changes:
        dist_lines = [
            f"- {c['district']}, {c['cat_label']} ({c['deal_label']}): "
            f"{c['sign']}{c['change_pct']:.1f}%, цена {int(c['price_per_m2']):,} ₽/м²".replace(',', ' ')
            for c in district_changes
        ]
        blocks.append('Изменение цен по районам (за неделю):\n' + '\n'.join(dist_lines))

    if key_rate is not None and prev_key_rate is not None and abs(key_rate - prev_key_rate) >= 0.01:
        direction = 'повышена' if key_rate > prev_key_rate else 'снижена'
        blocks.append(
            f'Ключевая ставка ЦБ РФ {direction}: было {prev_key_rate:.2f}%, стало {key_rate:.2f}%.'
        )
    elif key_rate is not None:
        blocks.append(f'Ключевая ставка ЦБ РФ без изменений: {key_rate:.2f}%.')

    data_block = '\n\n'.join(blocks)

    return (
        f'Напиши профессиональную аналитическую статью «Обзор рынка коммерческой недвижимости Краснодара — {month_year}» '
        f'по итогам недели ({date_str}).\n\n'
        f'{data_block}\n\n'
        f'ВАЖНО: пиши ТОЛЬКО о данных, приведённых выше. Если по какому-то направлению (город/районы/ставка) '
        f'данных нет в блоке — вообще не упоминай его и не пиши, что там "нет изменений" — просто пропусти. '
        f'Требования: 3-5 абзацев, 300-600 слов, профессиональный деловой стиль, '
        f'краткий анализ возможных причин изменений на основе только приведённых цифр, без придуманных прогнозов. '
        f'Отвечай строго в JSON: {{"title":"...","summary":"...","content":"..."}}'
    )


def _save_article(cur, conn, article, is_auto, user_id=None, auto_publish=False, logo_url='', key_rate: float | None = None, topic: str = ''):
    title = _safe(article.get('title', ''), 299)
    summary = _safe(article.get('summary', ''), 999)
    content = _safe(article.get('content', ''), 49999)
    image_url = article.get('image_url', '')
    img_val = f"'{_safe(image_url, 499)}'" if image_url else 'NULL'
    pub_val = 'TRUE' if auto_publish else 'FALSE'
    pub_at_val = f"'{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')}'" if auto_publish else 'NULL'
    rate_val = str(key_rate) if key_rate is not None else 'NULL'
    topic_val = f"'{_safe(topic, 299)}'" if topic else 'NULL'
    cur.execute(
        f"INSERT INTO {SCHEMA}.news (title, summary, content, image_url, is_auto, is_published, published_at, created_by, cb_key_rate, topic) "
        f"VALUES ('{title}', '{summary}', '{content}', {img_val}, {is_auto}, {pub_val}, {pub_at_val}, "
        f"{'NULL' if not user_id else user_id}, {rate_val}, {topic_val}) RETURNING id"
    )
    news_id = cur.fetchone()['id']
    slug = _slug(article.get('title', ''), news_id)
    cur.execute(f"UPDATE {SCHEMA}.news SET slug = '{_safe(slug, 319)}' WHERE id = {news_id}")
    conn.commit()
    return news_id, slug


def _pick_fresh_topics(cur, pool: list, count: int, cooldown_days: int = 14) -> list:
    """
    Выбирает случайные темы из pool, исключая те, что уже использовались
    в последние cooldown_days дней — защита от повторов вида
    "Новые тенденции на рынке недвижимости Кубани" 3 раза за неделю.
    Если после исключения тем не хватает — добираем из оставшихся (лучше похожая тема,
    чем полный простой генерации).
    """
    import random
    try:
        cur.execute(
            f"SELECT DISTINCT topic FROM {SCHEMA}.news "
            f"WHERE topic IS NOT NULL AND created_at >= NOW() - INTERVAL '{int(cooldown_days)} days'"
        )
        recent = {r['topic'] for r in cur.fetchall() if r.get('topic')}
    except Exception as e:
        print(f'[news] _pick_fresh_topics ошибка чтения истории: {e}')
        recent = set()

    fresh_pool = [t for t in pool if t not in recent]
    if len(fresh_pool) >= count:
        return random.sample(fresh_pool, count)
    # Не хватает свежих тем — добираем из полного пула (включая недавние), чтобы не сорвать генерацию
    chosen = list(fresh_pool)
    remaining = [t for t in pool if t not in chosen]
    random.shuffle(remaining)
    chosen += remaining[:max(0, count - len(chosen))]
    return chosen[:count]


def _row_to_dict(r):
    return {
        'id': r['id'],
        'title': r['title'],
        'slug': r['slug'],
        'summary': r['summary'],
        'content': r['content'],
        'image_url': r['image_url'],
        'source_url': r['source_url'],
        'source_name': r['source_name'],
        'category': r['category'],
        'is_published': r['is_published'],
        'is_auto': r['is_auto'],
        'published_at': r['published_at'],
        'created_at': r['created_at'],
        'cb_key_rate': float(r['cb_key_rate']) if r.get('cb_key_rate') is not None else None,
        'topic': r.get('topic'),
    }


def handler(event: dict, context) -> dict:
    """Новости: CRUD + автокопирайтер коммерческой недвижимости"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    qs = event.get('queryStringParameters') or {}
    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
    method = event.get('httpMethod', 'GET')

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    action = qs.get('action') or body.get('action', '')

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # ── КРОН-ПИНГ (публичный, как auto-seo.ping) ────────────────────
            # Вызывается с любой страницы сайта при загрузке, не чаще раза в 10 мин
            # (троттлинг на фронте) + защита от флуда через already_ran в БД ниже.
            if action == 'ping_cron':
                now_utc = datetime.now(timezone.utc)
                result = {'hour': now_utc.hour, 'minute': now_utc.minute}

                # ── Автогенерация новостей ────────────────────────────────
                cur.execute(f"SELECT * FROM {SCHEMA}.news_schedule ORDER BY id LIMIT 1")
                sch = cur.fetchone()
                news_generated = 0
                if sch and sch.get('is_enabled'):
                    run_hour = sch.get('run_hour', 9)
                    run_minute = sch.get('run_minute', 0)
                    last_run = sch.get('last_run_at')
                    # Публикуем если: текущий час >= нужного И сегодня ещё не публиковали
                    time_ok = now_utc.hour >= run_hour
                    already_ran = (
                        last_run and hasattr(last_run, 'date')
                        and last_run.date() >= now_utc.date()
                    )
                    if time_ok and not already_ran:
                        api_key, folder_id = _load_gpt_keys(cur)
                        if not api_key or not folder_id:
                            print('[news] CRON: YandexGPT не настроен — пропускаем генерацию')
                        else:
                            count = int(sch.get('articles_per_run', 3))
                            # Берём темы из расписания если заданы, иначе из AUTO_TOPICS
                            custom_topics_raw = (sch.get('topics') or '').strip()
                            if custom_topics_raw:
                                pool = [t.strip() for t in custom_topics_raw.splitlines() if t.strip()]
                            else:
                                pool = AUTO_TOPICS
                            # Исключаем темы, публиковавшиеся последние 14 дней — защита от повторов
                            topics = _pick_fresh_topics(cur, pool, min(count, len(pool)), cooldown_days=14)
                            # Один раз ищем общий дайджест новостей Краснодара за сегодня
                            daily_news, _ = _fetch_news_snippets(
                                'коммерческая недвижимость Краснодар новости сегодня', limit=10
                            )
                            for topic in topics:
                                topic_news, src = _fetch_news_snippets(f'{topic} Краснодар', limit=5)
                                seen_urls = {s['url'] for s in topic_news}
                                combined = topic_news + [s for s in daily_news if s['url'] not in seen_urls]
                                # Ставку ЦБ берём только если она реально упомянута в найденных новостях
                                key_rate = _extract_key_rate_from_snippets(combined)
                                article, err = _gpt(
                                    api_key, folder_id, topic,
                                    key_rate=key_rate,
                                    news_snippets=combined[:8],
                                )
                                if article and _is_valid_article(article):
                                    _save_article(cur, conn, article, True, auto_publish=True, key_rate=key_rate, topic=topic)
                                    news_generated += 1
                                elif article:
                                    print(f'[news] Отклонена статья (отказ модели): {article.get("title", "")[:80]}')
                                else:
                                    print(f'[news] Пропущена тема (нет новостей): {topic[:80]}')
                        ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')
                        cur.execute(
                            f"UPDATE {SCHEMA}.news_schedule SET last_run_at = '{ts}', "
                            f"last_run_count = {news_generated}, updated_at = '{ts}' WHERE id = {sch['id']}"
                        )
                        conn.commit()
                result['news_generated'] = news_generated

                # ── Автопереобучение ВБ (независимо от новостей) ─────────
                vb_retrained = False
                try:
                    cur.execute(
                        f"SELECT vb_retrain_enabled, vb_retrain_hour, vb_retrain_minute, "
                        f"vb_retrain_last_at, vb_retrain_last_status "
                        f"FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
                    )
                    vb = cur.fetchone()
                    if vb and vb.get('vb_retrain_enabled'):
                        vb_hour = int(vb.get('vb_retrain_hour') or 3)
                        vb_minute = int(vb.get('vb_retrain_minute') or 0)
                        vb_last = vb.get('vb_retrain_last_at')
                        status_raw = vb.get('vb_retrain_last_status') or ''
                        in_progress = '"in_progress": true' in str(status_raw) or '"in_progress":true' in str(status_raw)
                        vb_time_ok = (now_utc.hour == vb_hour and abs(now_utc.minute - vb_minute) <= 30)
                        vb_done_today = vb_last and hasattr(vb_last, 'date') and vb_last.date() >= now_utc.date()
                        # Запускаем: либо пришло время, либо уже идёт (in_progress)
                        if (vb_time_ok and not vb_done_today) or in_progress:
                            try:
                                urllib.request.urlopen(
                                    urllib.request.Request(
                                        'https://functions.poehali.dev/e2f1d357-fb83-4fbb-8d8b-6fb063357afc?action=cron',
                                        method='GET',
                                    ), timeout=25
                                )
                            except Exception:
                                pass
                            vb_retrained = True
                except Exception as e:
                    result['vb_retrain_error'] = str(e)[:100]

                result['vb_retrain_triggered'] = vb_retrained

                # ── Авто-обновление рыночных цен (батчевый, 1 шаг за вызов) ─
                price_refresh_result = None
                try:
                    import urllib.request as _ur_pr
                    _pr_req = _ur_pr.Request(
                        'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2',
                        data=b'{"action":"price_market_refresh"}',
                        headers={'Content-Type': 'application/json'},
                        method='POST',
                    )
                    with _ur_pr.urlopen(_pr_req, timeout=25) as _pr_resp:
                        _pr_body = _pr_resp.read(4096).decode('utf-8', errors='replace')
                        import json as _json_pr
                        price_refresh_result = _json_pr.loads(_pr_body)
                except Exception as _pr_e:
                    price_refresh_result = {'error': str(_pr_e)[:100]}
                result['price_refresh'] = price_refresh_result

                # ── VK Ads: синхронизация кабинета (каждые 6 часов) ──────
                vk_ads_result = None
                try:
                    _vk_req = urllib.request.Request(
                        'https://functions.poehali.dev/d995fba6-2780-433f-bc4f-a430321d60d8?action=cron',
                        method='GET',
                    )
                    with urllib.request.urlopen(_vk_req, timeout=25) as _vk_resp:
                        vk_ads_result = json.loads(_vk_resp.read(4096).decode('utf-8', errors='replace'))
                except Exception as _vk_e:
                    vk_ads_result = {'error': str(_vk_e)[:100]}
                result['vk_ads_sync'] = vk_ads_result

                # ── Ценовой дайджест (еженедельно по расписанию) ──────────
                price_digest_result = None
                try:
                    cur.execute(f"SELECT * FROM {SCHEMA}.news_schedule ORDER BY id LIMIT 1")
                    sch_d = cur.fetchone()
                    if sch_d:
                        pd_enabled = sch_d.get('price_digest_enabled') or False
                        pn_enabled = sch_d.get('price_news_enabled') or False
                        pm_enabled = sch_d.get('price_digest_max_enabled') or False
                        pd_day = int(sch_d.get('price_digest_day') or 0)
                        pd_threshold = float(sch_d.get('price_digest_threshold') or 3.0)
                        pd_last = sch_d.get('price_digest_last_at')

                        # Воскресенье = 6, понедельник = 0 (weekday())
                        today_weekday = now_utc.weekday()
                        # pd_day: 0=пн..6=вс
                        is_digest_day = (today_weekday == pd_day)
                        already_ran_week = (
                            pd_last and hasattr(pd_last, 'date')
                            and (now_utc.date() - pd_last.date()).days < 6
                        )

                        if (pd_enabled or pn_enabled) and is_digest_day and not already_ran_week:
                            changes = _analyze_price_changes(cur, pd_threshold)
                            district_changes = _analyze_district_changes(cur, threshold_pct=max(pd_threshold, 5.0))
                            now_d = now_utc
                            MONTHS_RU = ['января','февраля','марта','апреля','мая','июня',
                                         'июля','августа','сентября','октября','ноября','декабря']
                            date_str = f'{now_d.day} {MONTHS_RU[now_d.month-1]} {now_d.year}'
                            sent_max = 0
                            news_id = None

                            # Ставку ЦБ ищем только в свежих новостях — без обязательного cbr.ru
                            rate_snippets, _ = _fetch_news_snippets('ключевая ставка ЦБ РФ', limit=5)
                            key_rate_d = _extract_key_rate_from_snippets(rate_snippets)
                            prev_key_rate = sch_d.get('price_digest_last_key_rate')
                            prev_key_rate = float(prev_key_rate) if prev_key_rate is not None else None
                            rate_changed = (
                                key_rate_d is not None and prev_key_rate is not None
                                and abs(key_rate_d - prev_key_rate) >= 0.01
                            )
                            has_any_data = bool(changes) or bool(district_changes) or rate_changed

                            # MAX-дайджест менеджерам
                            if pm_enabled and (changes or district_changes):
                                try:
                                    cur.execute(
                                        f"SELECT notify_max_bot_token, notify_max_roles "
                                        f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
                                    )
                                    s_row = cur.fetchone()
                                    if s_row and s_row.get('notify_max_bot_token'):
                                        digest_text = _build_price_digest_text(changes, date_str, district_changes)
                                        sent_max = _send_max_digest(
                                            s_row['notify_max_bot_token'],
                                            s_row.get('notify_max_roles') or 'broker,admin,director',
                                            cur, digest_text
                                        )
                                except Exception as e:
                                    print(f'[price_digest] MAX error: {e}')

                            # Авто-новость на сайт — публикуем ТОЛЬКО если есть хоть какие-то
                            # реальные изменения (город/районы/ставка ЦБ), иначе неделя пропускается
                            # без публикации, вместо шаблонной статьи "изменений не выявлено"
                            if pn_enabled and has_any_data:
                                try:
                                    api_key, folder_id = _load_gpt_keys(cur)
                                    if api_key and folder_id:
                                        prompt_text = _build_price_news_prompt(
                                            changes, date_str, key_rate_d,
                                            district_changes=district_changes,
                                            prev_key_rate=prev_key_rate,
                                        )
                                        gpt_result = _call_gpt_raw(api_key, folder_id, prompt_text)
                                        if gpt_result:
                                            article = _parse_article_json(gpt_result)
                                            if article and _is_valid_article(article):
                                                news_id, _ = _save_article(
                                                    cur, conn, article, True,
                                                    auto_publish=True, key_rate=key_rate_d,
                                                    topic='weekly_price_digest',
                                                )
                                except Exception as e:
                                    print(f'[price_digest] news error: {e}')

                            # Обновляем last_at и последнюю ставку ЦБ (для сравнения на след. неделе)
                            ts_pd = now_utc.strftime('%Y-%m-%d %H:%M:%S+00')
                            rate_sql = str(key_rate_d) if key_rate_d is not None else 'NULL'
                            cur.execute(
                                f"UPDATE {SCHEMA}.news_schedule SET price_digest_last_at = '{ts_pd}', "
                                f"price_digest_last_key_rate = {rate_sql} "
                                f"WHERE id = {sch_d['id']}"
                            )
                            conn.commit()
                            price_digest_result = {
                                'changes_found': len(changes),
                                'district_changes_found': len(district_changes),
                                'rate_changed': rate_changed,
                                'sent_max': sent_max,
                                'news_id': news_id,
                                'date': date_str,
                            }
                            print(f'[price_digest] done: changes={len(changes)}, max_sent={sent_max}, news={news_id}')
                except Exception as pd_e:
                    price_digest_result = {'error': str(pd_e)[:200]}
                    print(f'[price_digest] cron error: {pd_e}')
                result['price_digest'] = price_digest_result

                # ── Переиндексация ИИ-поиска объектов (02:00 МСК = 23:00 UTC) ─
                search_reindex_result = None
                try:
                    _SEARCH_REINDEX_HOUR_UTC = 23  # 02:00 МСК
                    if now_utc.hour == _SEARCH_REINDEX_HOUR_UTC:
                        _sr_req = urllib.request.Request(
                            'https://functions.poehali.dev/32925bd2-c418-4a8c-8e32-97b5385e67da',
                            data=json.dumps({'action': 'reindex', 'batch': 50}).encode(),
                            headers={'Content-Type': 'application/json'},
                            method='POST',
                        )
                        with urllib.request.urlopen(_sr_req, timeout=25) as _sr_resp:
                            search_reindex_result = json.loads(_sr_resp.read(4096).decode('utf-8', errors='replace'))
                        print(f'[smart-search] reindex: {search_reindex_result}')
                    else:
                        search_reindex_result = {'skipped': True, 'reason': f'not 02:00 MSK, now_utc={now_utc.hour:02d}:{now_utc.minute:02d}'}
                except Exception as _sr_e:
                    search_reindex_result = {'error': str(_sr_e)[:100]}
                result['search_reindex'] = search_reindex_result

                return _ok(result)

            # ── ПУБЛИЧНЫЙ СПИСОК ─────────────────────────────────────────
            if action == 'list' and method == 'GET':
                page = int(qs.get('page', 1))
                limit = min(int(qs.get('limit', 12)), 50)
                offset = (page - 1) * limit
                cur.execute(
                    f"SELECT id, title, slug, summary, image_url, source_name, category, published_at, created_at "
                    f"FROM {SCHEMA}.news WHERE is_published = TRUE "
                    f"ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT {limit} OFFSET {offset}"
                )
                rows = cur.fetchall()
                cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.news WHERE is_published = TRUE")
                total = cur.fetchone()['c']
                return _ok({'news': [dict(r) for r in rows], 'total': total, 'page': page, 'limit': limit}, cache='public, max-age=120, stale-while-revalidate=30')

            # ── ПУБЛИЧНАЯ СТАТЬЯ ─────────────────────────────────────────
            if action == 'get' and method == 'GET':
                slug = qs.get('slug', '')
                if not slug:
                    return _err('Укажите slug')
                cur.execute(
                    f"SELECT * FROM {SCHEMA}.news WHERE slug = '{_safe(slug, 319)}' AND is_published = TRUE"
                )
                r = cur.fetchone()
                if not r:
                    return _err('Не найдено', 404)
                return _ok({'article': _row_to_dict(r)}, cache='public, max-age=300, stale-while-revalidate=60')

            # ── ТРЕБУЕТСЯ АВТОРИЗАЦИЯ ────────────────────────────────────
            user = _get_user(cur, token)
            if not user or user['role'] not in ALLOWED_ROLES:
                return _err('Нет доступа', 403)

            # ── ПОЛНАЯ СТАТЬЯ ДЛЯ АДМИНКИ (включая черновики) ───────────
            if action == 'admin_get' and method == 'GET':
                nid = int(qs.get('id', 0))
                if not nid:
                    return _err('Укажите id')
                cur.execute(f"SELECT * FROM {SCHEMA}.news WHERE id = {nid}")
                r = cur.fetchone()
                if not r:
                    return _err('Не найдено', 404)
                return _ok({'article': _row_to_dict(r)})

            # ── СПИСОК ДЛЯ АДМИНКИ ───────────────────────────────────────
            if action == 'admin_list' and method == 'GET':
                cur.execute(
                    f"SELECT id, title, slug, summary, content, image_url, "
                    f"source_url, source_name, is_published, is_auto, "
                    f"published_at, created_at, category, cb_key_rate FROM {SCHEMA}.news "
                    f"ORDER BY created_at DESC LIMIT 100"
                )
                rows = []
                for r in cur.fetchall():
                    d = dict(r)
                    if d.get('cb_key_rate') is not None:
                        d['cb_key_rate'] = float(d['cb_key_rate'])
                    # Обрезаем content для списка — полный текст не нужен
                    if d.get('content'):
                        d['content_preview'] = d['content'][:600]
                        d['content_length'] = len(d['content'])
                        del d['content']
                    rows.append(d)
                return _ok({'news': rows})

            # ── СОЗДАТЬ ──────────────────────────────────────────────────
            if action == 'create':
                title = _safe(body.get('title', ''), 299)
                if not title:
                    return _err('Заголовок обязателен')
                summary = _safe(body.get('summary', ''), 999)
                content = _safe(body.get('content', ''), 49999)
                image_url = _safe(body.get('image_url', ''), 499)
                source_url = _safe(body.get('source_url', ''), 499)
                source_name = _safe(body.get('source_name', ''), 199)
                key_rate = _extract_key_rate(f"{title} {summary} {content}")
                rate_val = str(key_rate) if key_rate is not None else 'NULL'
                cur.execute(
                    f"INSERT INTO {SCHEMA}.news (title, summary, content, image_url, source_url, source_name, is_auto, created_by, cb_key_rate) "
                    f"VALUES ('{title}', '{summary}', '{content}', "
                    f"{'NULL' if not image_url else chr(39)+image_url+chr(39)}, "
                    f"{'NULL' if not source_url else chr(39)+source_url+chr(39)}, "
                    f"{'NULL' if not source_name else chr(39)+source_name+chr(39)}, "
                    f"FALSE, {user['id']}, {rate_val}) RETURNING id"
                )
                nid = cur.fetchone()['id']
                slug = _slug(body.get('title', ''), nid)
                cur.execute(f"UPDATE {SCHEMA}.news SET slug = '{_safe(slug,319)}' WHERE id = {nid}")
                conn.commit()
                return _ok({'id': nid, 'slug': slug, 'cb_key_rate': key_rate}, 201)

            # ── ОБНОВИТЬ ─────────────────────────────────────────────────
            if action == 'update':
                nid = int(body.get('id', 0))
                if not nid:
                    return _err('Укажите id')
                fields = []
                for f, maxlen in [('title',299),('summary',999),('content',49999),
                                   ('image_url',499),('source_url',499),('source_name',199)]:
                    if f in body:
                        fields.append(f"{f} = '{_safe(body[f], maxlen)}'")
                fields.append(f"updated_at = NOW()")
                if fields:
                    cur.execute(f"UPDATE {SCHEMA}.news SET {', '.join(fields)} WHERE id = {nid}")
                conn.commit()
                return _ok({'ok': True})

            # ── ОПУБЛИКОВАТЬ / СНЯТЬ ─────────────────────────────────────
            if action == 'publish':
                nid = int(body.get('id', 0))
                state = bool(body.get('state', True))
                ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')
                pub_at = f"'{ts}'" if state else 'NULL'
                cur.execute(
                    f"UPDATE {SCHEMA}.news SET is_published = {state}, published_at = {pub_at}, "
                    f"updated_at = NOW() WHERE id = {nid}"
                )
                # Инвалидируем кэш sitemap — новость появится/исчезнет при следующем запросе
                cur.execute(
                    f"UPDATE {SCHEMA}.seo_artifacts SET urls_count = 0 WHERE kind = 'sitemap'"
                )
                conn.commit()
                return _ok({'ok': True})

            # ── УДАЛИТЬ (soft — убираем из публикации) ───────────────────
            if action == 'remove':
                nid = int(body.get('id', 0))
                cur.execute(
                    f"UPDATE {SCHEMA}.news SET is_published = FALSE, updated_at = NOW() WHERE id = {nid}"
                )
                conn.commit()
                return _ok({'ok': True})

            # ── УДАЛИТЬ ПОЛНОСТЬЮ (hard delete) ───────────────────────────
            if action == 'delete':
                nid = int(body.get('id', 0))
                if not nid:
                    return _err(400, 'id обязателен')
                cur.execute(f"DELETE FROM {SCHEMA}.news WHERE id = {nid}")
                conn.commit()
                # Инвалидируем sitemap
                cur.execute(f"UPDATE {SCHEMA}.seo_artifacts SET urls_count = 0 WHERE kind = 'sitemap'")
                conn.commit()
                return _ok({'ok': True})

            # ── ГЕНЕРАЦИЯ СТАТЬИ ──────────────────────────────────────────
            if action == 'generate':
                topic = body.get('topic', '').strip()
                if not topic:
                    # Тема не указана вручную — выбираем свежую (не публиковавшуюся 14 дней)
                    picked = _pick_fresh_topics(cur, AUTO_TOPICS, 1, cooldown_days=14)
                    topic = picked[0] if picked else AUTO_TOPICS[0]
                api_key, folder_id = _load_gpt_keys(cur)
                auto_pub = bool(body.get('auto_publish', False))
                # Ищем свежие новости — без них генерация запрещена
                news_snippets, src = _fetch_news_snippets(f'{topic} Краснодар', limit=8)
                if not news_snippets:
                    news_snippets, src = _fetch_news_snippets('коммерческая недвижимость Краснодар', limit=8)
                # Ставку ЦБ берём только если она реально упомянута в найденных новостях
                key_rate = _extract_key_rate_from_snippets(news_snippets)
                article, err = _gpt(api_key, folder_id, topic, key_rate=key_rate, news_snippets=news_snippets)
                if err:
                    return _err(f'Ошибка генерации: {err}')
                if not _is_valid_article(article):
                    return _err(f'Модель отказалась писать статью на тему: {topic}')
                nid, slug = _save_article(cur, conn, article, True, user['id'], auto_publish=auto_pub, key_rate=key_rate, topic=topic)
                return _ok({'id': nid, 'slug': slug, 'title': article.get('title'), 'topic': topic, 'cb_key_rate': key_rate, 'news_source': src, 'news_count': len(news_snippets)})

            # ── АВТОЗАПУСК ВРУЧНУЮ ────────────────────────────────────────
            if action == 'run_auto':
                api_key, folder_id = _load_gpt_keys(cur)
                count = min(int(body.get('count', 3)), 10)
                auto_pub = bool(body.get('auto_publish', True))
                # Исключаем темы, публиковавшиеся последние 14 дней — защита от повторов
                topics = _pick_fresh_topics(cur, AUTO_TOPICS, min(count, len(AUTO_TOPICS)), cooldown_days=14)
                # Общий дайджест новостей на случай если по теме ничего нет
                daily_news, _ = _fetch_news_snippets('коммерческая недвижимость Краснодар новости', limit=10)
                results = []
                for topic in topics:
                    topic_news, src = _fetch_news_snippets(f'{topic} Краснодар', limit=5)
                    seen = {s['url'] for s in topic_news}
                    combined = topic_news + [s for s in daily_news if s['url'] not in seen]
                    # Ставку ЦБ берём только если она реально упомянута в найденных новостях
                    key_rate = _extract_key_rate_from_snippets(combined)
                    article, err = _gpt(api_key, folder_id, topic, key_rate=key_rate, news_snippets=combined[:8])
                    if article and _is_valid_article(article):
                        nid, slug = _save_article(cur, conn, article, True, user['id'], auto_publish=auto_pub, key_rate=key_rate, topic=topic)
                        results.append({'id': nid, 'slug': slug, 'title': article.get('title'), 'topic': topic, 'cb_key_rate': key_rate})
                    else:
                        results.append({'error': err or 'Модель отказалась писать статью', 'topic': topic})
                return _ok({'results': results, 'generated': len([r for r in results if 'id' in r])})

            # ── РАСПИСАНИЕ GET ───────────────────────────────────────────
            if action == 'schedule' and method == 'GET':
                cur.execute(f"SELECT * FROM {SCHEMA}.news_schedule ORDER BY id LIMIT 1")
                row = cur.fetchone()
                return _ok({'schedule': dict(row) if row else {}})

            # ── РАСПИСАНИЕ SAVE ──────────────────────────────────────────
            if action == 'save_schedule':
                cur.execute(f"SELECT id FROM {SCHEMA}.news_schedule ORDER BY id LIMIT 1")
                row = cur.fetchone()
                is_enabled = bool(body.get('is_enabled', False))
                run_hour = max(0, min(23, int(body.get('run_hour', 9))))
                run_minute = max(0, min(59, int(body.get('run_minute', 0))))
                per_run = max(1, min(10, int(body.get('articles_per_run', 3))))
                topics_raw = (body.get('topics') or '').strip().replace("'", "''")
                price_digest_enabled = bool(body.get('price_digest_enabled', False))
                price_news_enabled = bool(body.get('price_news_enabled', False))
                price_digest_max_enabled = bool(body.get('price_digest_max_enabled', False))
                price_digest_day = max(0, min(6, int(body.get('price_digest_day', 0))))
                price_digest_threshold = max(0.5, min(20.0, float(body.get('price_digest_threshold', 3.0))))
                ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')
                if row:
                    cur.execute(
                        f"UPDATE {SCHEMA}.news_schedule SET is_enabled = {is_enabled}, "
                        f"run_hour = {run_hour}, run_minute = {run_minute}, articles_per_run = {per_run}, "
                        f"topics = '{topics_raw}', "
                        f"price_digest_enabled = {price_digest_enabled}, "
                        f"price_news_enabled = {price_news_enabled}, "
                        f"price_digest_max_enabled = {price_digest_max_enabled}, "
                        f"price_digest_day = {price_digest_day}, "
                        f"price_digest_threshold = {price_digest_threshold}, "
                        f"updated_at = '{ts}' "
                        f"WHERE id = {row['id']}"
                    )
                else:
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.news_schedule "
                        f"(is_enabled, run_hour, run_minute, articles_per_run, topics, "
                        f"price_digest_enabled, price_news_enabled, price_digest_max_enabled, "
                        f"price_digest_day, price_digest_threshold) "
                        f"VALUES ({is_enabled}, {run_hour}, {run_minute}, {per_run}, '{topics_raw}', "
                        f"{price_digest_enabled}, {price_news_enabled}, {price_digest_max_enabled}, "
                        f"{price_digest_day}, {price_digest_threshold})"
                    )
                conn.commit()
                return _ok({'ok': True})

            return _err('Неизвестный action', 404)
    finally:
        conn.close()