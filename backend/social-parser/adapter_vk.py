"""
adapter_vk.py — парсер публичных групп ВКонтакте.

Метод: HTML-парсинг публичных страниц vk.com/wall{group_id}
Без API — работает через куки техаккаунта (social_sessions).

Что извлекаем из поста:
  - post_id, post_url, post_date
  - author_name, author_url
  - raw_text
  - photos (массив URL изображений)

Фильтрация по критериям (social_search_criteria) происходит здесь же.
Результат сохраняется в social_posts (очередь модерации).

Антибан: паузы 2-5 сек, лимит 200 req/h, 1000 req/day, 09-23 МСК.
"""

import re
import hashlib

from core import (
    safe_fetch, parse_post_text, is_realestate_post,
    get_session, get_sources, update_source, save_post, log_run,
    matches_criteria, post_meets_requirements,
)


# ═══════════════════════════════════════════════════════════════════════════════
# ПАРСИНГ HTML СТЕНЫ ГРУППЫ
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_vk_wall(html: str, group_id: str) -> list[dict]:
    """
    Парсит HTML страницы vk.com/wall-{group_id}.
    Извлекает посты: текст, фото, автор, дата, id.
    """
    posts = []
    seen  = set()

    for m in re.finditer(r'data-post-id=["\'](-?\d+_\d+)["\']', html):
        post_ref = m.group(1)
        if post_ref in seen:
            continue
        seen.add(post_ref)

        start = m.start()
        block = html[start:start + 5000]

        text     = _extract_text(block)
        photos   = _extract_photos(block)
        author   = _extract_author(block)
        date_str = _extract_date(block)

        if not text and not photos:
            continue

        posts.append({
            'post_id':    post_ref,
            'post_url':   f'https://vk.com/wall{post_ref}',
            'post_date':  date_str,
            'raw_text':   text,
            'photos':     photos,
            'author_name': author.get('name'),
            'author_url':  author.get('url'),
        })

    return posts


def _extract_text(block: str) -> str:
    for pattern in [
        r'class=["\'][^"\']*wall_post_text[^"\']*["\'][^>]*>(.*?)</div>',
        r'class=["\'][^"\']*pi_text[^"\']*["\'][^>]*>(.*?)</div>',
    ]:
        m = re.search(pattern, block, re.S | re.I)
        if m:
            return _clean_html(m.group(1))
    m = re.search(r'data-content=["\']([^"\']{20,})["\']', block)
    return m.group(1) if m else ''


def _extract_photos(block: str) -> list[str]:
    photos = []
    seen_p = set()
    for pattern in [
        r'<img[^>]+(?:data-src-large|data-src-expanded)=["\']([^"\']+\.(?:jpg|jpeg|png|webp))[^"\']*["\']',
        r'background-image:\s*url\(["\']?([^"\')\s]+\.(?:jpg|jpeg|png))["\']?\)',
    ]:
        for pm in re.finditer(pattern, block, re.I | re.S):
            url = pm.group(1)
            if url and url.startswith('http') and url not in seen_p:
                seen_p.add(url)
                photos.append(url)
    # Фильтруем аватарки
    photos = [p for p in photos if '/userpic/' not in p and '_50.' not in p]
    return photos[:20]


def _extract_author(block: str) -> dict:
    m = re.search(
        r'class=["\'][^"\']*author[^"\']*["\'][^>]*href=["\']([^"\']+)["\'][^>]*>([^<]{2,80})',
        block, re.I
    )
    if m:
        href = m.group(1)
        url  = href if href.startswith('http') else f'https://vk.com{href}'
        return {'name': _clean_html(m.group(2)), 'url': url}
    return {'name': None, 'url': None}


def _extract_date(block: str) -> str | None:
    m = re.search(r'<(?:time|abbr)[^>]+datetime=["\']([^"\']+)["\']', block, re.I)
    return m.group(1) if m else None


def _clean_html(html: str) -> str:
    text = re.sub(r'<br\s*/?>', '\n', html, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    for ent, rep in [('&amp;','&'),('&lt;','<'),('&gt;','>'),('&nbsp;',' ')]:
        text = text.replace(ent, rep)
    text = re.sub(r'\s{3,}', '\n\n', text)
    return text.strip()


def _get_group_url(source_id: str) -> str:
    if source_id.startswith('-') or source_id.lstrip('-').isdigit():
        return f'https://vk.com/wall{source_id}'
    return f'https://vk.com/{source_id.lstrip("@")}'


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

def scrape_vk_source(conn, source: dict, session: dict,
                     criteria: dict = None, max_posts: int = 50) -> dict:
    """Парсит одну VK-группу. Сохраняет в social_posts."""
    group_id = source['source_id']
    html = safe_fetch(_get_group_url(group_id), 'vk', conn, session, timeout=20)
    if not html:
        return {'posts_found': 0, 'posts_saved': 0, 'skipped': 0,
                'error': 'Не удалось загрузить страницу'}

    raw_posts = _parse_vk_wall(html, group_id)
    print(f'[vk] {group_id}: найдено постов={len(raw_posts)}')

    saved = skipped = 0
    route_to = (criteria or {}).get('route_to', 'moderation')

    for raw in raw_posts[:max_posts]:
        text = raw.get('raw_text') or ''

        if criteria and not matches_criteria(text, criteria):
            skipped += 1; continue
        if not is_realestate_post(text):
            skipped += 1; continue

        parsed = parse_post_text(text, 'vk', raw['post_id'], raw.get('post_url', ''))
        if not parsed:
            skipped += 1; continue

        post_record = {
            'criteria_id':       (criteria or {}).get('id'),
            'platform':          'vk',
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
            'content_hash':      _content_hash('vk', raw['post_id']),
        }

        if criteria and not post_meets_requirements(post_record, criteria):
            skipped += 1; continue

        if save_post(conn, post_record):
            saved += 1
        else:
            skipped += 1

    print(f'[vk] {group_id}: сохранено={saved}, пропущено={skipped}')
    return {'posts_found': len(raw_posts), 'posts_saved': saved,
            'skipped': skipped, 'error': None}


def run_vk(conn, criteria: dict = None, max_posts_per_source: int = 50) -> dict:
    """Запускает парсинг всех активных VK-источников."""
    session = get_session(conn, 'vk')
    if not session:
        return {'error': 'Нет активной VK-сессии', 'total_saved': 0}

    if criteria and criteria.get('source_ids'):
        all_src = get_sources(conn, 'vk')
        sources = [s for s in all_src if s['source_id'] in criteria['source_ids']]
    else:
        sources = get_sources(conn, 'vk')

    if not sources:
        return {'error': 'Нет активных VK-источников', 'total_saved': 0}

    total_found = total_saved = 0
    results = []

    for src in sources:
        res = scrape_vk_source(conn, src, session, criteria, max_posts_per_source)
        total_found += res['posts_found']
        total_saved += res['posts_saved']
        results.append({'source_id': src['source_id'], **res})
        update_source(conn, src['id'], res['posts_found'])
        log_run(conn, 'vk', src['source_id'],
                'done' if not res['error'] else 'error',
                res['posts_found'], res['posts_saved'], res.get('error') or '')
        if session.get('is_blocked'):
            break

    return {'platform': 'vk', 'sources_processed': len(results),
            'total_found': total_found, 'total_saved': total_saved, 'details': results}
