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

import json
import os
import re
import urllib.request
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL = 'yandexgpt/rc'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
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

SYSTEM_PROMPT = """Ты — профессиональный копирайтер специализированного издания о коммерческой недвижимости Краснодара и Краснодарского края.

Твои источники для анализа:
- Данные ЦБ РФ о ключевой ставке и ипотеке (cbr.ru)
- Новости застройщиков Краснодара (ЮСИ, Девелопмент-Юг, СКС и другие)
- Данные о рынке коммерческой недвижимости (ЦИАН, Авито, собственные данные)
- Новости правительства Краснодарского края (kuban.ru)
- Банки: Сбербанк, ВТБ, Россельхозбанк — программы финансирования
- Страховые компании — условия страхования недвижимости

Правила написания статьи:
1. Заголовок: конкретный, содержательный, до 100 символов
2. Краткое описание (summary): 2-3 предложения, суть материала, 150-250 символов
3. Текст статьи: 4-6 абзацев, факты и цифры, профессиональный тон
4. Указывай конкретные данные: проценты, суммы, сроки (используй актуальные или приближённые данные 2024-2025)
5. Завершай выводом или рекомендацией для инвесторов/арендаторов
6. Пиши на русском языке, без markdown-разметки, только текст

Формат ответа (строго JSON):
{
  "title": "Заголовок статьи",
  "summary": "Краткое описание",
  "content": "Полный текст статьи"
}"""


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
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


def _gpt(api_key, folder_id, topic):
    if not api_key or not folder_id:
        return None, 'YandexGPT не настроен'
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL}',
        'completionOptions': {'stream': False, 'temperature': 0.7, 'maxTokens': '3000'},
        'messages': [
            {'role': 'system', 'text': SYSTEM_PROMPT},
            {'role': 'user', 'text': f'Напиши статью на тему: {topic}'},
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
        try:
            parsed = json.loads(text)
            return parsed, None
        except Exception:
            # Пробуем вытащить JSON из текста
            m = re.search(r'\{.*\}', text, re.DOTALL)
            if m:
                try:
                    parsed = json.loads(m.group(0))
                    return parsed, None
                except Exception:
                    pass
            # Если не JSON — формируем структуру из текста
            lines = text.split('\n', 2)
            return {
                'title': lines[0][:200] if lines else topic,
                'summary': lines[1][:300] if len(lines) > 1 else '',
                'content': '\n'.join(lines[2:]) if len(lines) > 2 else text,
            }, None
    except Exception as e:
        return None, str(e)[:300]


def _save_article(cur, conn, article, is_auto, user_id=None):
    title = _safe(article.get('title', ''), 299)
    summary = _safe(article.get('summary', ''), 999)
    content = _safe(article.get('content', ''), 49999)
    cur.execute(
        f"INSERT INTO {SCHEMA}.news (title, summary, content, is_auto, created_by) "
        f"VALUES ('{title}', '{summary}', '{content}', {is_auto}, "
        f"{'NULL' if not user_id else user_id}) RETURNING id"
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

            # ── КРОН-ПИНГ (без авторизации) ─────────────────────────────
            if action == 'ping_cron':
                cur.execute(f"SELECT * FROM {SCHEMA}.news_schedule ORDER BY id LIMIT 1")
                sch = cur.fetchone()
                if not sch or not sch.get('is_enabled'):
                    return _ok({'skipped': True, 'reason': 'schedule disabled'})
                now_utc = datetime.now(timezone.utc)
                if now_utc.hour != sch.get('run_hour', 9):
                    return _ok({'skipped': True, 'reason': 'not time yet', 'current_hour': now_utc.hour})
                last_run = sch.get('last_run_at')
                if last_run and (now_utc - last_run).total_seconds() < 3600 * 20:
                    return _ok({'skipped': True, 'reason': 'already ran today'})

                # Запускаем автогенерацию
                api_key, folder_id = _load_gpt_keys(cur)
                import random
                count = int(sch.get('articles_per_run', 3))
                topics = random.sample(AUTO_TOPICS, min(count, len(AUTO_TOPICS)))
                generated = 0
                for topic in topics:
                    article, err = _gpt(api_key, folder_id, topic)
                    if article:
                        _save_article(cur, conn, article, True)
                        generated += 1
                ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')
                cur.execute(
                    f"UPDATE {SCHEMA}.news_schedule SET last_run_at = '{ts}', "
                    f"last_run_count = {generated}, updated_at = '{ts}' WHERE id = {sch['id']}"
                )
                conn.commit()
                return _ok({'generated': generated, 'topics': topics})

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
                return _ok({'news': [dict(r) for r in rows], 'total': total, 'page': page, 'limit': limit})

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
                return _ok({'article': _row_to_dict(r)})

            # ── ТРЕБУЕТСЯ АВТОРИЗАЦИЯ ────────────────────────────────────
            user = _get_user(cur, token)
            if not user or user['role'] not in ALLOWED_ROLES:
                return _err('Нет доступа', 403)

            # ── СПИСОК ДЛЯ АДМИНКИ ───────────────────────────────────────
            if action == 'admin_list' and method == 'GET':
                cur.execute(
                    f"SELECT id, title, slug, summary, is_published, is_auto, "
                    f"published_at, created_at, category FROM {SCHEMA}.news "
                    f"ORDER BY created_at DESC LIMIT 100"
                )
                return _ok({'news': [dict(r) for r in cur.fetchall()]})

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
                cur.execute(
                    f"INSERT INTO {SCHEMA}.news (title, summary, content, image_url, source_url, source_name, is_auto, created_by) "
                    f"VALUES ('{title}', '{summary}', '{content}', "
                    f"{'NULL' if not image_url else chr(39)+image_url+chr(39)}, "
                    f"{'NULL' if not source_url else chr(39)+source_url+chr(39)}, "
                    f"{'NULL' if not source_name else chr(39)+source_name+chr(39)}, "
                    f"FALSE, {user['id']}) RETURNING id"
                )
                nid = cur.fetchone()['id']
                slug = _slug(body.get('title', ''), nid)
                cur.execute(f"UPDATE {SCHEMA}.news SET slug = '{_safe(slug,319)}' WHERE id = {nid}")
                conn.commit()
                return _ok({'id': nid, 'slug': slug}, 201)

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

            # ── ГЕНЕРАЦИЯ СТАТЬИ ─────────────────────────────────────────
            if action == 'generate':
                topic = body.get('topic', '').strip()
                if not topic:
                    import random
                    topic = random.choice(AUTO_TOPICS)
                api_key, folder_id = _load_gpt_keys(cur)
                article, err = _gpt(api_key, folder_id, topic)
                if err:
                    return _err(f'Ошибка генерации: {err}')
                nid, slug = _save_article(cur, conn, article, True, user['id'])
                return _ok({'id': nid, 'slug': slug, 'title': article.get('title'), 'topic': topic})

            # ── АВТОЗАПУСК ВРУЧНУЮ ───────────────────────────────────────
            if action == 'run_auto':
                api_key, folder_id = _load_gpt_keys(cur)
                count = min(int(body.get('count', 3)), 10)
                import random
                topics = random.sample(AUTO_TOPICS, min(count, len(AUTO_TOPICS)))
                results = []
                for topic in topics:
                    article, err = _gpt(api_key, folder_id, topic)
                    if article:
                        nid, slug = _save_article(cur, conn, article, True, user['id'])
                        results.append({'id': nid, 'slug': slug, 'title': article.get('title'), 'topic': topic})
                    else:
                        results.append({'error': err, 'topic': topic})
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
                per_run = max(1, min(10, int(body.get('articles_per_run', 3))))
                ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')
                if row:
                    cur.execute(
                        f"UPDATE {SCHEMA}.news_schedule SET is_enabled = {is_enabled}, "
                        f"run_hour = {run_hour}, articles_per_run = {per_run}, updated_at = '{ts}' "
                        f"WHERE id = {row['id']}"
                    )
                else:
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.news_schedule (is_enabled, run_hour, articles_per_run) "
                        f"VALUES ({is_enabled}, {run_hour}, {per_run})"
                    )
                conn.commit()
                return _ok({'ok': True})

            return _err('Неизвестный action', 404)
    finally:
        conn.close()
