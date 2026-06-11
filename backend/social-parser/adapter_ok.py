"""
adapter_ok.py — парсер публичных групп Одноклассников (ok.ru).

Метод: HTML-парсинг ok.ru/group/{id}/topics
Без API — через куки техаккаунта (social_sessions).
Результат сохраняется в social_posts (очередь модерации).

Антибан: паузы 3-6 сек, лимит 150 req/h, 800 req/day, 09-23 МСК.
"""

import re
import hashlib

from core import (
    safe_fetch, parse_post_text, is_realestate_post,
    get_session, get_sources, update_source, save_post, log_run,
    matches_criteria, post_meets_requirements,
)


# ═══════════════════════════════════════════════════════════════════════════════
# ПАРСИНГ HTML ГРУППЫ
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_ok_group(html: str, group_id: str) -> list[dict]:
    """Парсит HTML страницы ok.ru/group/{id}/topics."""
    posts = []
    seen  = set()

    # Ищем блоки постов по data-id
    positions = [(m.start(), m.group(1))
                 for m in re.finditer(r'data-id=["\'](\d+)["\']', html)]

    for i, (pos, post_id) in enumerate(positions):
        if post_id in seen:
            continue
        seen.add(post_id)

        next_pos = positions[i + 1][0] if i + 1 < len(positions) else pos + 4000
        block = html[pos:next_pos]

        text   = _extract_text(block)
        photos = _extract_photos(block)
        author = _extract_author(block)
        date   = _extract_date(block)

        if not text or len(text) < 20:
            continue

        posts.append({
            'post_id':    post_id,
            'post_url':   f'https://ok.ru/group/{group_id}/topic/{post_id}',
            'post_date':  date,
            'raw_text':   text,
            'photos':     photos,
            'author_name': author.get('name'),
            'author_url':  author.get('url'),
        })

    # Запасной метод — если data-id не нашли
    if not posts:
        for i, m in enumerate(re.finditer(
            r'class=["\'][^"\']*(?:media-text|post-content)[^"\']*["\'][^>]*>(.*?)</div>',
            html, re.S | re.I
        )):
            text = _clean_html(m.group(1))
            if text and len(text) >= 30:
                pid = f'ok_{group_id}_{i}'
                posts.append({
                    'post_id':    pid,
                    'post_url':   f'https://ok.ru/group/{group_id}',
                    'post_date':  None,
                    'raw_text':   text,
                    'photos':     [],
                    'author_name': None,
                    'author_url':  None,
                })

    return posts


def _extract_text(block: str) -> str:
    for pattern in [
        r'class=["\'][^"\']*media-text[^"\']*["\'][^>]*>(.*?)</(?:div|article)>',
        r'class=["\'][^"\']*post-content[^"\']*["\'][^>]*>(.*?)</div>',
    ]:
        m = re.search(pattern, block, re.S | re.I)
        if m:
            return _clean_html(m.group(1))
    m = re.search(r'data-text=["\']([^"\']{20,})["\']', block)
    return m.group(1) if m else ''


def _extract_photos(block: str) -> list[str]:
    photos = []
    seen_p = set()
    for pattern in [
        r'<img[^>]+src=["\']([^"\']+\.(?:jpg|jpeg|png|webp))["\'][^>]*class=["\'][^"\']*photo',
        r'data-original=["\']([^"\']+\.(?:jpg|jpeg|png))["\']',
        r'background-image:\s*url\(["\']?([^"\')\s]+\.(?:jpg|jpeg|png))["\']?\)',
    ]:
        for pm in re.finditer(pattern, block, re.I | re.S):
            url = pm.group(1)
            if url and url.startswith('http') and url not in seen_p:
                seen_p.add(url)
                photos.append(url)
    return photos[:20]


def _extract_author(block: str) -> dict:
    m = re.search(
        r'class=["\'][^"\']*(?:author|owner)[^"\']*["\'][^>]*href=["\']([^"\']+)["\'][^>]*>([^<]{2,80})',
        block, re.I
    )
    if m:
        href = m.group(1)
        url  = href if href.startswith('http') else f'https://ok.ru{href}'
        return {'name': _clean_html(m.group(2)), 'url': url}
    return {'name': None, 'url': None}


def _extract_date(block: str) -> str | None:
    m = re.search(r'<(?:time|abbr)[^>]+datetime=["\']([^"\']+)["\']', block, re.I)
    if m:
        return m.group(1)
    m = re.search(r'data-date=["\'](\d+)["\']', block)
    return m.group(1) if m else None


def _clean_html(html: str) -> str:
    text = re.sub(r'<br\s*/?>', '\n', html, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    for ent, rep in [('&amp;','&'),('&lt;','<'),('&gt;','>'),('&nbsp;',' ')]:
        text = text.replace(ent, rep)
    text = re.sub(r'\s{3,}', '\n\n', text)
    return text.strip()


def _get_group_url(source_id: str) -> str:
    slug = source_id.replace('https://ok.ru/', '').strip('/')
    if slug.isdigit():
        return f'https://ok.ru/group/{slug}/topics'
    return f'https://ok.ru/{slug}/topics'


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

def scrape_ok_source(conn, source: dict, session: dict,
                     criteria: dict = None, max_posts: int = 50) -> dict:
    """Парсит одну OK-группу. Сохраняет в social_posts."""
    group_id = source['source_id']
    html = safe_fetch(_get_group_url(group_id), 'ok', conn, session, timeout=20)
    if not html:
        return {'posts_found': 0, 'posts_saved': 0, 'skipped': 0,
                'error': 'Не удалось загрузить страницу'}

    raw_posts = _parse_ok_group(html, group_id)
    print(f'[ok] {group_id}: найдено постов={len(raw_posts)}')

    saved = skipped = 0
    route_to = (criteria or {}).get('route_to', 'moderation')

    for raw in raw_posts[:max_posts]:
        text = raw.get('raw_text') or ''

        if criteria and not matches_criteria(text, criteria):
            skipped += 1; continue
        if not is_realestate_post(text):
            skipped += 1; continue

        parsed = parse_post_text(text, 'ok', raw['post_id'], raw.get('post_url', ''))
        if not parsed:
            skipped += 1; continue

        post_record = {
            'criteria_id':       (criteria or {}).get('id'),
            'platform':          'ok',
            'source_id':         group_id,
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
            'content_hash':      _content_hash('ok', raw['post_id']),
        }

        if criteria and not post_meets_requirements(post_record, criteria):
            skipped += 1; continue

        if save_post(conn, post_record):
            saved += 1
        else:
            skipped += 1

    print(f'[ok] {group_id}: сохранено={saved}, пропущено={skipped}')
    return {'posts_found': len(raw_posts), 'posts_saved': saved,
            'skipped': skipped, 'error': None}


def run_ok(conn, criteria: dict = None, max_posts_per_source: int = 50) -> dict:
    """Запускает парсинг всех активных OK-источников."""
    session = get_session(conn, 'ok')
    if not session:
        return {'error': 'Нет активной OK-сессии', 'total_saved': 0}

    if criteria and criteria.get('source_ids'):
        all_src = get_sources(conn, 'ok')
        sources = [s for s in all_src if s['source_id'] in criteria['source_ids']]
    else:
        sources = get_sources(conn, 'ok')

    if not sources:
        return {'error': 'Нет активных OK-источников', 'total_saved': 0}

    total_found = total_saved = 0
    results = []

    for src in sources:
        res = scrape_ok_source(conn, src, session, criteria, max_posts_per_source)
        total_found += res['posts_found']
        total_saved += res['posts_saved']
        results.append({'source_id': src['source_id'], **res})
        update_source(conn, src['id'], res['posts_found'])
        log_run(conn, 'ok', src['source_id'],
                'done' if not res['error'] else 'error',
                res['posts_found'], res['posts_saved'], res.get('error') or '')
        if session.get('is_blocked'):
            break

    return {'platform': 'ok', 'sources_processed': len(results),
            'total_found': total_found, 'total_saved': total_saved, 'details': results}
