"""
adapter_tg.py — парсер публичных Telegram-каналов.

Метод: t.me/s/{channel} — публичный веб-просмотр без авторизации.
Извлекает: текст, фото, дату, автора (для групп).
Результат сохраняется в social_posts (очередь модерации).

Антибан: паузы 0.5-2 сек, лимит 500 req/h, 3000 req/day, круглосуточно.
"""

import re
import time
import random
import hashlib
import gzip as _gz
import urllib.request
import urllib.error

from core import (
    parse_post_text, is_realestate_post,
    get_sources, update_source, save_post, log_run,
    matches_criteria, post_meets_requirements,
)

UA_POOL = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
]
MAX_HTML = 800_000


# ═══════════════════════════════════════════════════════════════════════════════
# HTTP (без куки — публичные каналы не требуют авторизации)
# ═══════════════════════════════════════════════════════════════════════════════

def _fetch_tg(channel_slug: str, timeout: int = 15) -> str:
    """Загружает HTML превью публичного канала t.me/s/{channel}."""
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
        print(f'[tg] ошибка: {ex}')
        return ''


# ═══════════════════════════════════════════════════════════════════════════════
# ПАРСИНГ HTML
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_tg_channel(html: str, channel_slug: str) -> list[dict]:
    """
    Парсит HTML t.me/s/{channel}.
    Структура: div.tgme_widget_message — каждый пост.
    """
    posts = []
    seen  = set()

    positions = [
        (m.start(), m.group(1))
        for m in re.finditer(r'data-post=["\']([^"\']+/\d+)["\']', html)
    ]

    for i, (pos, post_ref) in enumerate(positions):
        if post_ref in seen:
            continue
        seen.add(post_ref)

        next_pos = positions[i + 1][0] if i + 1 < len(positions) else pos + 5000
        block = html[pos:next_pos]

        text   = _extract_text(block)
        photos = _extract_photos(block)
        date   = _extract_date(block)
        views  = _extract_views(block)

        if not text and not photos:
            continue

        post_id = post_ref.split('/')[-1]

        posts.append({
            'post_id':    post_id,
            'post_url':   f'https://t.me/{channel_slug}/{post_id}',
            'post_date':  date,
            'raw_text':   text,
            'photos':     photos,
            'views':      views,
            'author_name': channel_slug,  # для каналов автор = канал
            'author_url':  f'https://t.me/{channel_slug}',
        })

    return posts


def _extract_text(block: str) -> str:
    for pattern in [
        r'class=["\'][^"\']*tgme_widget_message_text[^"\']*["\'][^>]*>(.*?)</div>',
        r'class=["\'][^"\']*js-message_text[^"\']*["\'][^>]*>(.*?)</div>',
    ]:
        m = re.search(pattern, block, re.S | re.I)
        if m:
            return _clean_html(m.group(1))
    return ''


def _extract_photos(block: str) -> list[str]:
    """Извлекает фото из поста Telegram."""
    photos = []
    seen_p = set()

    for pattern in [
        # Стиль background-image в tgme_widget_message_photo_wrap
        r'background-image:\s*url\(["\']?(https://cdn\d*\.telegram[^"\')\s]+\.(?:jpg|jpeg|png|webp))["\']?\)',
        # Прямые img теги
        r'<img[^>]+src=["\']([^"\']+\.(?:jpg|jpeg|png|webp))["\']',
        # data-sizes / data-src для ленивой загрузки
        r'data-src=["\']([^"\']+\.(?:jpg|jpeg|png|webp))["\']',
    ]:
        for pm in re.finditer(pattern, block, re.I | re.S):
            url = pm.group(1)
            if url and url not in seen_p:
                seen_p.add(url)
                photos.append(url)

    return photos[:20]


def _extract_date(block: str) -> str | None:
    m = re.search(r'<time[^>]+datetime=["\']([^"\']+)["\']', block, re.I)
    return m.group(1) if m else None


def _extract_views(block: str) -> int | None:
    m = re.search(r'tgme_widget_message_views[^>]*>([^<]+)<', block, re.I)
    if m:
        raw = m.group(1).strip().replace('K', '000').replace('M', '000000')
        try:
            return int(float(raw.replace(',', '.')))
        except Exception:
            pass
    return None


def _clean_html(html: str) -> str:
    text = re.sub(r'<br\s*/?>', '\n', html, flags=re.I)
    text = re.sub(r'</p>', '\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    for ent, rep in [('&amp;','&'),('&lt;','<'),('&gt;','>'),('&nbsp;',' '),('&#\d+;','')]:
        text = re.sub(ent if '\\' in ent else re.escape(ent), rep, text)
    text = re.sub(r'\s{3,}', '\n\n', text)
    return text.strip()


def _get_channel_slug(source_id: str) -> str:
    slug = source_id.strip().lstrip('@')
    slug = re.sub(r'^https?://t\.me/', '', slug)
    return slug.strip('/')


def _content_hash(platform: str, post_id: str) -> str:
    return hashlib.md5(f'{platform}:{post_id}'.encode()).hexdigest()


def _calc_confidence(parsed: dict) -> float:
    score = 0.0
    if parsed.get('price'):    score += 0.3
    if parsed.get('area'):     score += 0.2
    if parsed.get('phone'):    score += 0.2
    if parsed.get('address'):  score += 0.15
    if parsed.get('district'): score += 0.1
    if parsed.get('category') != 'other': score += 0.05
    return round(min(score, 1.0), 2)


# ═══════════════════════════════════════════════════════════════════════════════
# ГЛАВНЫЕ ФУНКЦИИ
# ═══════════════════════════════════════════════════════════════════════════════

def scrape_tg_source(conn, source: dict, criteria: dict = None,
                     max_posts: int = 50) -> dict:
    """Парсит один Telegram-канал. Сохраняет в social_posts."""
    channel_slug = _get_channel_slug(source['source_id'])

    # Антибан-пауза
    time.sleep(random.uniform(0.5, 2.0))

    html = _fetch_tg(channel_slug, timeout=15)
    if not html:
        return {'posts_found': 0, 'posts_saved': 0, 'skipped': 0,
                'error': 'Не удалось загрузить канал'}

    if 'tgme_widget_message' not in html:
        return {'posts_found': 0, 'posts_saved': 0, 'skipped': 0,
                'error': 'Канал не найден или закрыт'}

    raw_posts = _parse_tg_channel(html, channel_slug)
    print(f'[tg] @{channel_slug}: найдено постов={len(raw_posts)}')

    saved = skipped = 0
    route_to = (criteria or {}).get('route_to', 'moderation')

    for raw in raw_posts[:max_posts]:
        text = raw.get('raw_text') or ''

        if criteria and not matches_criteria(text, criteria):
            skipped += 1; continue
        if not is_realestate_post(text):
            skipped += 1; continue

        parsed = parse_post_text(text, 'telegram', raw['post_id'], raw.get('post_url', ''))
        if not parsed:
            skipped += 1; continue

        post_record = {
            'criteria_id':       (criteria or {}).get('id'),
            'platform':          'telegram',
            'source_id':         channel_slug,
            'post_id':           raw['post_id'],
            'post_url':          raw.get('post_url'),
            'post_date':         raw.get('post_date'),
            'author_name':       raw.get('author_name'),
            'author_url':        raw.get('author_url'),
            'raw_text':          text[:5000],
            'photos':            raw.get('photos') or [],
            'detected_deal':     parsed.get('deal_type'),
            'detected_category': parsed.get('category'),
            'detected_price':    parsed.get('price'),
            'detected_area':     parsed.get('area'),
            'detected_address':  parsed.get('address'),
            'detected_district': parsed.get('district'),
            'detected_phone':    parsed.get('phone'),
            'confidence':        _calc_confidence(parsed),
            'route_to':          route_to,
            'content_hash':      _content_hash('telegram', raw['post_id']),
        }

        if criteria and not post_meets_requirements(post_record, criteria):
            skipped += 1; continue

        if save_post(conn, post_record):
            saved += 1
        else:
            skipped += 1

    print(f'[tg] @{channel_slug}: сохранено={saved}, пропущено={skipped}')
    return {'posts_found': len(raw_posts), 'posts_saved': saved,
            'skipped': skipped, 'error': None}


def run_telegram(conn, criteria: dict = None,
                 max_posts_per_source: int = 50) -> dict:
    """Запускает парсинг всех активных Telegram-источников."""
    if criteria and criteria.get('source_ids'):
        all_src = get_sources(conn, 'telegram')
        sources = [s for s in all_src if s['source_id'] in criteria['source_ids']]
    else:
        sources = get_sources(conn, 'telegram')

    if not sources:
        return {'error': 'Нет активных Telegram-каналов', 'total_saved': 0}

    total_found = total_saved = 0
    results = []

    for src in sources:
        res = scrape_tg_source(conn, src, criteria, max_posts_per_source)
        total_found += res['posts_found']
        total_saved += res['posts_saved']
        results.append({'source_id': src['source_id'], **res})
        update_source(conn, src['id'], res['posts_found'])
        log_run(conn, 'telegram', src['source_id'],
                'done' if not res['error'] else 'error',
                res['posts_found'], res['posts_saved'], res.get('error') or '')

    return {'platform': 'telegram', 'sources_processed': len(results),
            'total_found': total_found, 'total_saved': total_saved, 'details': results}
