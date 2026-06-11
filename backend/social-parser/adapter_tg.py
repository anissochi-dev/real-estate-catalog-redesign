"""
adapter_tg.py — парсер публичных Telegram-каналов.

Метод: HTTP-парсинг публичных превью каналов через t.me/s/{channel}
Без Bot API и без MTProto — работает для ПУБЛИЧНЫХ каналов без авторизации.
t.me/s/{channel} отдаёт HTML с последними ~20 постами без токенов.

Антибан: паузы 0.5-2 сек, лимит 500 req/h, 3000 req/day, круглосуточно.
Telegram значительно мягче VK/OK по rate-limit.

Для закрытых каналов нужен MTProto (Telethon) — это следующий этап.
"""

import re
from core import (
    safe_fetch, parse_post_text, is_realestate_post,
    get_session, get_sources, update_source, save_to_market, log_run,
    get_conn, SCHEMA,
)
import urllib.request
import urllib.error
import random
import time

UA_POOL = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
]
MAX_HTML = 800_000


# ─── Парсинг публичного канала ────────────────────────────────────────────────

def _fetch_tg_channel(channel_slug: str, timeout: int = 15) -> str:
    """
    Загружает HTML превью публичного канала.
    t.me/s/{channel} — публичный веб-просмотр без авторизации.
    """
    url = f'https://t.me/s/{channel_slug}'
    headers = {
        'User-Agent': random.choice(UA_POOL),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(MAX_HTML)
            import gzip as _gz
            if resp.headers.get('Content-Encoding', '') == 'gzip':
                try:
                    raw = _gz.decompress(raw)
                except Exception:
                    pass
            enc = resp.headers.get_content_charset() or 'utf-8'
            return raw.decode(enc, errors='replace')
    except urllib.error.HTTPError as e:
        print(f'[tg] HTTP {e.code}: t.me/s/{channel_slug}')
        return ''
    except Exception as ex:
        print(f'[tg] ошибка: {ex}: t.me/s/{channel_slug}')
        return ''


def _parse_tg_channel_html(html: str, channel_slug: str) -> list[dict]:
    """
    Парсит HTML страницы t.me/s/{channel}.
    Структура: div.tgme_widget_message — каждый пост.
    Текст: div.tgme_widget_message_text
    ID поста: data-post="{channel}/{id}"
    """
    posts = []
    seen = set()

    # Находим все блоки постов
    message_blocks = re.finditer(
        r'data-post=["\']([^"\']+/\d+)["\']',
        html
    )

    positions = [(m.start(), m.group(1)) for m in message_blocks]

    for i, (pos, post_ref) in enumerate(positions):
        if post_ref in seen:
            continue
        seen.add(post_ref)

        next_pos = positions[i + 1][0] if i + 1 < len(positions) else pos + 5000
        block = html[pos:next_pos]

        text = _extract_tg_text(block)
        if not text or len(text) < 20:
            continue

        # post_ref вида "channel_name/12345"
        post_id = post_ref.split('/')[-1]
        url = f'https://t.me/{channel_slug}/{post_id}'

        # Дата поста (datetime атрибут)
        date_m = re.search(r'datetime=["\']([^"\']+)["\']', block)
        post_date = date_m.group(1) if date_m else None

        posts.append({
            'post_id': post_id,
            'text': text,
            'url': url,
            'date': post_date,
        })

    return posts


def _extract_tg_text(block: str) -> str:
    """Извлекает текст из блока HTML поста Telegram."""
    # Основной метод: div.tgme_widget_message_text
    m = re.search(
        r'class=["\'][^"\']*tgme_widget_message_text[^"\']*["\'][^>]*>(.*?)</div>',
        block, re.S | re.I
    )
    if m:
        return _clean_html(m.group(1))

    # Запасной: class="js-message_text"
    m = re.search(
        r'class=["\'][^"\']*js-message_text[^"\']*["\'][^>]*>(.*?)</div>',
        block, re.S | re.I
    )
    if m:
        return _clean_html(m.group(1))

    return ''


def _clean_html(html: str) -> str:
    """Убирает HTML-теги, сохраняет переносы строк."""
    text = re.sub(r'<br\s*/?>', '\n', html, flags=re.I)
    text = re.sub(r'</p>', '\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&#\d+;', '', text)
    text = re.sub(r'\s{3,}', '\n\n', text)
    return text.strip()


def _get_channel_slug(source_id: str) -> str:
    """Нормализует source_id в slug канала."""
    # Убираем https://t.me/, @, пробелы
    slug = source_id.strip().lstrip('@')
    slug = re.sub(r'^https?://t\.me/', '', slug)
    slug = slug.strip('/')
    return slug


# ─── Главная функция парсинга ─────────────────────────────────────────────────

def scrape_telegram(conn, source: dict, max_posts: int = 50) -> dict:
    """
    Парсит один публичный Telegram-канал через t.me/s/.
    Не требует сессии (публичные каналы открыты).
    """
    channel_slug = _get_channel_slug(source['source_id'])
    print(f'[tg] парсим канал @{channel_slug}')

    # Случайная пауза (антибан)
    time.sleep(random.uniform(0.5, 2.0))

    html = _fetch_tg_channel(channel_slug, timeout=15)
    if not html:
        return {'posts_found': 0, 'posts_saved': 0, 'skipped': 0, 'error': 'Не удалось загрузить канал'}

    # Проверяем что канал существует и публичный
    if 'tgme_widget_message' not in html:
        error = 'Канал не найден или закрыт'
        if 'tgme_channel_info' not in html:
            error = 'Канал не существует'
        return {'posts_found': 0, 'posts_saved': 0, 'skipped': 0, 'error': error}

    posts = _parse_tg_channel_html(html, channel_slug)
    print(f'[tg] @{channel_slug}: найдено постов={len(posts)}')

    records = []
    skipped = 0

    for post in posts[:max_posts]:
        text = post['text']
        if not is_realestate_post(text):
            skipped += 1
            continue

        rec = parse_post_text(
            text=text,
            source='telegram',
            post_id=post['post_id'],
            url=post['url'],
        )
        if rec:
            records.append(rec)
        else:
            skipped += 1

    inserted, updated = save_to_market(conn, records)

    print(f'[tg] @{channel_slug}: постов={len(posts)}, объявлений={len(records)}, '
          f'добавлено={inserted}, обновлено={updated}, пропущено={skipped}')

    return {
        'posts_found': len(posts),
        'posts_saved': inserted + updated,
        'skipped': skipped,
        'error': None,
    }


def run_telegram(conn, max_posts_per_source: int = 50) -> dict:
    """
    Запускает парсинг всех активных Telegram-источников.
    Не требует сессии — публичные каналы парсятся напрямую.
    """
    sources = get_sources(conn, 'telegram')
    if not sources:
        return {
            'error': 'Нет активных Telegram-каналов. Добавьте каналы в настройках.',
            'total_saved': 0,
        }

    total_found = total_saved = 0
    results = []

    for src in sources:
        result = scrape_telegram(conn, src, max_posts=max_posts_per_source)
        total_found += result['posts_found']
        total_saved += result['posts_saved']
        results.append({'source_id': src['source_id'], **result})

        update_source(conn, src['id'], result['posts_found'])
        log_run(
            conn, 'telegram', src['source_id'],
            'done' if not result['error'] else 'error',
            result['posts_found'], result['posts_saved'],
            result.get('error') or '',
        )

    return {
        'platform': 'telegram',
        'sources_processed': len(results),
        'total_found': total_found,
        'total_saved': total_saved,
        'details': results,
    }
