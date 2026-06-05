"""
Новости коммерческой недвижимости: CRUD + автокопирайтер на YandexGPT + расписание.
Копирайтер анализирует рынок (ключевые ставки ЦБ, данные застройщиков Краснодара,
ипотека, аренда) и генерирует профессиональные статьи для публикации на сайте.

Публичные эндпоинты (без токена):
  GET /?action=list          — список опубликованных (limit, page)
  GET /?action=get&slug=...  — одна новость по slug

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
  POST {action:ping_cron}    — внутренний крон-пинг (без токена)
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

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL = 'yandexgpt/rc'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
}

ALLOWED_ROLES = ('admin', 'editor', 'manager', 'director')

# Темы для автогенерации
AUTO_TOPICS = [
    'Ключевая ставка ЦБ РФ и её влияние на рынок коммерческой недвижимости Краснодара',
    'Аренда офисов в Краснодаре: тренды и цены',
    'Склады и логистика в Краснодарском крае: спрос и предложение',
    'Торговые помещения Краснодара: что происходит на рынке',
    'Готовый бизнес в Краснодаре: обзор предложений',
    'Ипотека на коммерческую недвижимость: условия банков в 2025 году',
    'Застройщики Краснодара: новые коммерческие площади',
    'Инвестиции в ГАБ (готовый арендный бизнес): доходность и риски',
    'Производственные помещения Кубани: спрос от промышленников',
    'Рестораны и кафе: открытия и закрытия в Краснодаре',
    'Страхование коммерческой недвижимости: что нужно знать',
    'Налоги при продаже и аренде коммерческой недвижимости в 2025',
    'Переход бизнеса на отечественное ПО и офисы IT-компаний',
    'Сельскохозяйственная недвижимость Краснодарского края',
    'Гостиницы и хостелы Краснодара: туристический поток и спрос на площади',
]

SYSTEM_PROMPT_TEMPLATE = """Ты — профессиональный копирайтер специализированного издания о коммерческой недвижимости Краснодара и Краснодарского края.

СЕГОДНЯШНЯЯ ДАТА: {today}. Пиши статью актуальную именно на эту дату.

{key_rate_block}

Правила написания статьи:
1. Заголовок: конкретный, до 100 символов, с указанием периода {month_year}
2. Краткое описание (summary): 2-3 предложения, суть материала, 150-250 символов
3. Текст: 4-6 абзацев, факты и цифры, профессиональный тон, 600-900 слов
4. Если упоминается ключевая ставка — {key_rate_rule}
5. Завершай выводом или рекомендацией для инвесторов/арендаторов
6. Без markdown-разметки, только текст с переносами строк

АНТИПЛАГИАТ — ОБЯЗАТЕЛЬНО:
- Если получаешь новости из источников — НЕ копируй дословно ни одного предложения
- Все факты переформулируй своими словами, сохраняя смысл
- Добавляй собственный экспертный анализ: что это значит для рынка Краснодара, какие последствия
- Статья должна быть уникальной авторской работой, а не пересказом новостей

Формат ответа (строго JSON):
{{
  "title": "Заголовок статьи",
  "summary": "Краткое описание",
  "content": "Полный текст статьи"
}}

ВАЖНО: статья должна отражать реалии именно {today}."""


def _fetch_cbr_key_rate() -> float | None:
    """
    Получает текущую ключевую ставку ЦБ РФ через официальный XML-сервис cbr.ru.
    Возвращает float (например 21.0) или None при ошибке.
    """
    try:
        url = 'https://www.cbr.ru/scripts/XML_val.asp?d=0'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            xml_data = resp.read().decode('windows-1251', errors='replace')
        # Метод 1: специализированный endpoint ставки
    except Exception:
        pass

    # Метод 2: cbr.ru/hd_base/keyrate — страница с актуальной ставкой
    try:
        url2 = 'https://www.cbr.ru/hd_base/keyrate/'
        req2 = urllib.request.Request(url2, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req2, timeout=8) as resp2:
            html = resp2.read().decode('utf-8', errors='replace')
        # Ищем паттерн вида "21,00" или "21.00" рядом со ставкой
        m = re.search(r'(\d{1,2})[,.](\d{2})\s*%?\s*</td>', html)
        if m:
            rate = float(f"{m.group(1)}.{m.group(2)}")
            if 1.0 <= rate <= 50.0:
                return rate
    except Exception:
        pass

    # Метод 3: официальный XML DailyInfo
    try:
        url3 = 'https://www.cbr.ru/scripts/XML_daily.asp'
        req3 = urllib.request.Request(url3, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req3, timeout=8) as resp3:
            xml3 = resp3.read().decode('windows-1251', errors='replace')
        root = ET.fromstring(xml3)
        # Ключевая ставка не в этом XML, но попробуем найти KeyRate через другой endpoint
    except Exception:
        pass

    # Метод 4: cbr.ru/scripts/Key_Rate.asp
    try:
        url4 = 'https://www.cbr.ru/scripts/Key_Rate.asp'
        req4 = urllib.request.Request(url4, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req4, timeout=8) as resp4:
            xml4 = resp4.read().decode('windows-1251', errors='replace')
        root4 = ET.fromstring(xml4)
        # Ищем последнее значение
        rates = []
        for kr in root4.iter('KR'):
            val_str = (kr.get('val') or kr.text or '').replace(',', '.').strip()
            try:
                rates.append(float(val_str))
            except Exception:
                pass
        if rates:
            return rates[-1]
        # Ищем атрибуты Rate/rate
        for elem in root4.iter():
            for attr in ('Rate', 'rate', 'Val', 'val'):
                v = elem.get(attr, '')
                v = v.replace(',', '.').strip()
                try:
                    rate = float(v)
                    if 1.0 <= rate <= 50.0:
                        return rate
                except Exception:
                    pass
    except Exception:
        pass

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
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id LIMIT 1")
        row = cur.fetchone()
        if row:
            return (row.get('yandex_api_key') or '').strip(), (row.get('yandex_folder_id') or '').strip()
    except Exception:
        pass
    return os.environ.get('YANDEX_API_KEY', ''), os.environ.get('YANDEX_FOLDER_ID', '')


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
        key_rate_block = 'Ключевая ставка ЦБ РФ: уточни актуальное значение на сайте cbr.ru или опиши влияние ставки без конкретной цифры (например: "в условиях высокой ключевой ставки", "при текущей ставке ЦБ").'
        key_rate_rule = 'не указывай конкретный процент — напиши "при текущей ключевой ставке ЦБ" или "в условиях высоких ставок по кредитам"'
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        today=today_str,
        month_year=month_year,
        key_rate_block=key_rate_block,
        key_rate_rule=key_rate_rule,
    )
    # Добавляем живые новости в контекст если переданы
    news_block = _build_news_context(news_snippets or [])
    user_text = f'Напиши статью на тему: {topic}. Дата: {today_str}.'
    if news_block:
        user_text += f'\n\n{news_block}\n\nНапиши УНИКАЛЬНУЮ авторскую статью, используя эти новости как фактуру и источник данных. Переформулируй все факты своими словами, добавь экспертный анализ и выводы для рынка коммерческой недвижимости Краснодара.'
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL}',
        'completionOptions': {'stream': False, 'temperature': 0.7, 'maxTokens': '3000'},
        'messages': [
            {'role': 'system', 'text': system_prompt},
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
        with urllib.request.urlopen(req, timeout=55) as resp:
            data = json.loads(resp.read().decode())
        alts = (data.get('result') or {}).get('alternatives') or []
        text = ((alts[0].get('message') or {}).get('text') or '').strip() if alts else ''
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
    """Генерирует обложку статьи через FLUX и загружает в S3. Возвращает CDN URL или ''."""
    try:
        flux_url = 'https://api.poehali.dev/v1/images/generations'
        flux_key = os.environ.get('FLUX_API_KEY', '')
        if not flux_key:
            return ''
        # Формируем SEO-промпт на основе заголовка
        prompt = (
            f'Professional business real estate photo for article about: {title}. '
            'Modern commercial building in Krasnodar Russia, golden hour lighting, '
            'clean architectural photography, high quality, 16:9 aspect ratio, '
            'no text, no watermark, photorealistic'
        )
        req = urllib.request.Request(
            flux_url,
            data=json.dumps({'prompt': prompt, 'n': 1, 'size': '1024x576'}).encode(),
            headers={'Authorization': f'Bearer {flux_key}', 'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
        # Получаем URL или base64
        img_data = (data.get('data') or [{}])[0]
        img_url = img_data.get('url', '')
        img_b64 = img_data.get('b64_json', '')
        if not img_url and not img_b64:
            return ''
        # Скачиваем или декодируем
        if img_b64:
            img_bytes = base64.b64decode(img_b64)
        else:
            with urllib.request.urlopen(img_url, timeout=30) as r:
                img_bytes = r.read()
        # Загружаем в S3
        import secrets as _secrets
        s3 = boto3.client(
            's3',
            endpoint_url='https://bucket.poehali.dev',
            aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
            aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        )
        key = f'news/{_secrets.token_urlsafe(12)}.jpg'
        s3.put_object(Bucket='files', Key=key, Body=img_bytes, ContentType='image/jpeg')
        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
        return cdn_url
    except Exception as e:
        print(f'[news] image generation error: {e}')
        return ''


def _load_logo_url(cur) -> str:
    """Загружает logo_url компании из настроек."""
    try:
        cur.execute(f"SELECT logo_url FROM {SCHEMA}.settings ORDER BY id LIMIT 1")
        row = cur.fetchone()
        return (row.get('logo_url') or '') if row else ''
    except Exception:
        return ''


def _save_article(cur, conn, article, is_auto, user_id=None, auto_publish=False, logo_url='', key_rate: float | None = None):
    title = _safe(article.get('title', ''), 299)
    summary = _safe(article.get('summary', ''), 999)
    content = _safe(article.get('content', ''), 49999)
    # Генерируем картинку
    image_url = _generate_image(article.get('title', ''), logo_url)
    img_val = f"'{_safe(image_url, 499)}'" if image_url else 'NULL'
    pub_val = 'TRUE' if auto_publish else 'FALSE'
    pub_at_val = f"'{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')}'" if auto_publish else 'NULL'
    rate_val = str(key_rate) if key_rate is not None else 'NULL'
    cur.execute(
        f"INSERT INTO {SCHEMA}.news (title, summary, content, image_url, is_auto, is_published, published_at, created_by, cb_key_rate) "
        f"VALUES ('{title}', '{summary}', '{content}', {img_val}, {is_auto}, {pub_val}, {pub_at_val}, "
        f"{'NULL' if not user_id else user_id}, {rate_val}) RETURNING id"
    )
    news_id = cur.fetchone()['id']
    slug = _slug(article.get('title', ''), news_id)
    cur.execute(f"UPDATE {SCHEMA}.news SET slug = '{_safe(slug, 319)}' WHERE id = {news_id}")
    conn.commit()
    return news_id, slug


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

            # ── КРОН-ПИНГ (защищён cron-token или IP внутреннего вызова) ───
            if action == 'ping_cron':
                # Защита: принимаем только если передан X-Cron-Token
                # или запрос идёт от самого сайта (Referer содержит наш домен)
                raw_headers = event.get('headers') or {}
                hl = {k.lower(): v for k, v in raw_headers.items()}
                cron_token_hdr = hl.get('x-cron-token', '')
                # Читаем ожидаемый токен из БД (настройки)
                try:
                    cur.execute(f"SELECT site_url FROM {SCHEMA}.settings ORDER BY id LIMIT 1")
                    _st = cur.fetchone()
                    expected_origin = (_st.get('site_url') or 'https://bmn.su').rstrip('/') if _st else 'https://bmn.su'
                except Exception:
                    expected_origin = 'https://bmn.su'
                referer = hl.get('referer', '') or hl.get('origin', '')
                cron_secret = os.environ.get('CRON_SECRET', '')
                # Разрешаем: правильный токен ИЛИ referer с нашего домена ИЛИ нет секрета (обратная совместимость)
                allowed = (
                    not cron_secret  # если секрет не настроен — разрешаем (обратная совместимость)
                    or (cron_secret and cron_token_hdr == cron_secret)
                    or expected_origin in referer
                )
                if not allowed:
                    return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Forbidden'})}

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
                    time_ok = (now_utc.hour == run_hour and now_utc.minute >= run_minute)
                    already_ran = last_run and (now_utc - last_run).total_seconds() < 3600 * 20
                    if time_ok and not already_ran:
                        api_key, folder_id = _load_gpt_keys(cur)
                        logo_url = _load_logo_url(cur)
                        key_rate = _fetch_cbr_key_rate()
                        import random
                        count = int(sch.get('articles_per_run', 3))
                        # Берём темы из расписания если заданы, иначе из AUTO_TOPICS
                        custom_topics_raw = (sch.get('topics') or '').strip()
                        if custom_topics_raw:
                            pool = [t.strip() for t in custom_topics_raw.splitlines() if t.strip()]
                        else:
                            pool = AUTO_TOPICS
                        topics = random.sample(pool, min(count, len(pool)))
                        # Один раз ищем общий дайджест новостей Краснодара за сегодня
                        daily_news, _ = _fetch_news_snippets(
                            'коммерческая недвижимость Краснодар новости сегодня', limit=10
                        )
                        for topic in topics:
                            # Ищем новости по конкретной теме + общий дайджест
                            topic_news, src = _fetch_news_snippets(
                                f'{topic} Краснодар', limit=5
                            )
                            # Объединяем: сначала тематические, потом общие (без дублей)
                            seen_urls = {s['url'] for s in topic_news}
                            combined = topic_news + [s for s in daily_news if s['url'] not in seen_urls]
                            article, err = _gpt(
                                api_key, folder_id, topic,
                                key_rate=key_rate,
                                news_snippets=combined[:8],
                            )
                            if article:
                                _save_article(cur, conn, article, True, auto_publish=True, logo_url=logo_url, key_rate=key_rate)
                                news_generated += 1
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
                key_rate = _fetch_cbr_key_rate()
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

            # ── ГЕНЕРАЦИЯ СТАТЬИ с картинкой ─────────────────────────────
            if action == 'generate':
                topic = body.get('topic', '').strip()
                if not topic:
                    import random
                    topic = random.choice(AUTO_TOPICS)
                api_key, folder_id = _load_gpt_keys(cur)
                logo_url = _load_logo_url(cur)
                auto_pub = bool(body.get('auto_publish', False))
                key_rate = _fetch_cbr_key_rate()
                article, err = _gpt(api_key, folder_id, topic, key_rate=key_rate)
                if err:
                    return _err(f'Ошибка генерации: {err}')
                nid, slug = _save_article(cur, conn, article, True, user['id'], auto_publish=auto_pub, logo_url=logo_url, key_rate=key_rate)
                return _ok({'id': nid, 'slug': slug, 'title': article.get('title'), 'topic': topic, 'cb_key_rate': key_rate})

            # ── АВТОЗАПУСК ВРУЧНУЮ с картинками ──────────────────────────
            if action == 'run_auto':
                api_key, folder_id = _load_gpt_keys(cur)
                logo_url = _load_logo_url(cur)
                key_rate = _fetch_cbr_key_rate()
                count = min(int(body.get('count', 3)), 10)
                auto_pub = bool(body.get('auto_publish', True))
                import random
                topics = random.sample(AUTO_TOPICS, min(count, len(AUTO_TOPICS)))
                results = []
                for topic in topics:
                    article, err = _gpt(api_key, folder_id, topic, key_rate=key_rate)
                    if article:
                        nid, slug = _save_article(cur, conn, article, True, user['id'], auto_publish=auto_pub, logo_url=logo_url, key_rate=key_rate)
                        results.append({'id': nid, 'slug': slug, 'title': article.get('title'), 'topic': topic, 'cb_key_rate': key_rate})
                    else:
                        results.append({'error': err, 'topic': topic})
                return _ok({'results': results, 'generated': len([r for r in results if 'id' in r]), 'cb_key_rate': key_rate})

            # ── ОБНОВИТЬ СТАВКИ В СУЩЕСТВУЮЩИХ СТАТЬЯХ ───────────────────
            if action == 'update_rates':
                key_rate = _fetch_cbr_key_rate()
                if key_rate is None:
                    return _err('Не удалось получить ставку ЦБ РФ')
                cur.execute(
                    f"UPDATE {SCHEMA}.news SET cb_key_rate = {key_rate}, updated_at = NOW() "
                    f"WHERE cb_key_rate IS NULL"
                )
                updated = cur.rowcount
                conn.commit()
                return _ok({'ok': True, 'cb_key_rate': key_rate, 'updated': updated})

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
                ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')
                if row:
                    cur.execute(
                        f"UPDATE {SCHEMA}.news_schedule SET is_enabled = {is_enabled}, "
                        f"run_hour = {run_hour}, run_minute = {run_minute}, articles_per_run = {per_run}, updated_at = '{ts}' "
                        f"WHERE id = {row['id']}"
                    )
                else:
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.news_schedule (is_enabled, run_hour, run_minute, articles_per_run) "
                        f"VALUES ({is_enabled}, {run_hour}, {run_minute}, {per_run})"
                    )
                conn.commit()
                return _ok({'ok': True})

            return _err('Неизвестный action', 404)
    finally:
        conn.close()