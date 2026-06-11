"""
adapter_ok.py — парсер публичных групп Одноклассников (ok.ru).

Метод: HTML-парсинг публичных страниц ok.ru/group/{id}/topics
Без API ключей — работает через куки техаккаунта (хранятся в social_sessions).
Публичные группы — без авторизации (ограниченно).
Закрытые — через куки аккаунта-члена группы.

Антибан: паузы 3-6 сек, лимит 150 req/h, 800 req/day, только 09-23 МСК.
"""

import re
from core import (
    safe_fetch, parse_post_text, is_realestate_post,
    get_session, get_sources, update_source, save_to_market, log_run,
)


# ─── Парсинг страницы группы ──────────────────────────────────────────────────

def _parse_ok_group_html(html: str, group_id: str) -> list[dict]:
    """
    Парсит HTML страницы ok.ru/group/{id}/topics.
    Извлекает посты из div.media-text_cnt или похожих блоков.
    """
    posts = []
    seen = set()

    # Метод 1: ищем data-id постов
    post_ids = re.finditer(r'data-id=["\'](\d+)["\']', html)
    positions = [(m.start(), m.group(1)) for m in post_ids]

    for i, (pos, post_id) in enumerate(positions):
        if post_id in seen:
            continue
        seen.add(post_id)

        next_pos = positions[i + 1][0] if i + 1 < len(positions) else pos + 4000
        block = html[pos:next_pos]

        text = _extract_ok_text(block)
        if not text or len(text) < 30:
            continue

        url = f'https://ok.ru/group/{group_id}/topic/{post_id}'
        posts.append({'post_id': post_id, 'text': text, 'url': url})

    # Метод 2: если data-id не нашли — ищем по классам текста
    if not posts:
        text_blocks = re.finditer(
            r'class=["\'][^"\']*(?:media-text|post-content|group-feed)[^"\']*["\'][^>]*>(.*?)</div>',
            html, re.S | re.I
        )
        for i, m in enumerate(text_blocks):
            text = _clean_html(m.group(1))
            if text and len(text) >= 30:
                post_id = f'ok_{group_id}_{i}'
                if post_id not in seen:
                    seen.add(post_id)
                    posts.append({
                        'post_id': post_id,
                        'text': text,
                        'url': f'https://ok.ru/group/{group_id}',
                    })

    return posts


def _extract_ok_text(block: str) -> str:
    """Извлекает текст из блока HTML поста ОК."""
    # Метод 1: media-text_cnt
    m = re.search(
        r'class=["\'][^"\']*media-text[^"\']*["\'][^>]*>(.*?)</(?:div|article)>',
        block, re.S | re.I
    )
    if m:
        return _clean_html(m.group(1))

    # Метод 2: post-content-container
    m = re.search(
        r'class=["\'][^"\']*post-content[^"\']*["\'][^>]*>(.*?)</div>',
        block, re.S | re.I
    )
    if m:
        return _clean_html(m.group(1))

    # Метод 3: data-text атрибут
    m = re.search(r'data-text=["\']([^"\']{20,})["\']', block)
    if m:
        return m.group(1)

    return ''


def _clean_html(html: str) -> str:
    """Убирает HTML-теги, нормализует пробелы."""
    text = re.sub(r'<br\s*/?>', '\n', html, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'\s{3,}', '\n\n', text)
    return text.strip()


def _get_group_url(source_id: str) -> str:
    """Строит URL страницы группы."""
    # source_id может быть числовым id или slug
    if source_id.isdigit():
        return f'https://ok.ru/group/{source_id}/topics'
    # slug вида ok.ru/something
    slug = source_id.replace('https://ok.ru/', '').strip('/')
    return f'https://ok.ru/{slug}/topics'


# ─── Главная функция парсинга ─────────────────────────────────────────────────

def scrape_ok(conn, source: dict, session: dict, max_posts: int = 50) -> dict:
    """
    Парсит одну группу Одноклассников.
    source — запись из social_parser_sources.
    session — запись из social_sessions.
    """
    group_id = source['source_id']
    url = _get_group_url(group_id)

    print(f'[ok] парсим группу {group_id}: {url}')

    html = safe_fetch(url, 'ok', conn, session, timeout=20)
    if not html:
        return {'posts_found': 0, 'posts_saved': 0, 'skipped': 0, 'error': 'Не удалось загрузить страницу'}

    posts = _parse_ok_group_html(html, group_id)
    print(f'[ok] найдено постов в HTML: {len(posts)}')

    records = []
    skipped = 0

    for post in posts[:max_posts]:
        text = post['text']
        if not is_realestate_post(text):
            skipped += 1
            continue

        rec = parse_post_text(
            text=text,
            source='ok',
            post_id=post['post_id'],
            url=post['url'],
        )
        if rec:
            records.append(rec)
        else:
            skipped += 1

    inserted, updated = save_to_market(conn, records)

    print(f'[ok] {group_id}: постов={len(posts)}, объявлений={len(records)}, '
          f'добавлено={inserted}, обновлено={updated}, пропущено={skipped}')

    return {
        'posts_found': len(posts),
        'posts_saved': inserted + updated,
        'skipped': skipped,
        'error': None,
    }


def run_ok(conn, max_posts_per_source: int = 50) -> dict:
    """Запускает парсинг всех активных OK-источников."""
    session = get_session(conn, 'ok')
    if not session:
        return {'error': 'Нет активной OK-сессии. Добавьте куки в настройках.', 'total_saved': 0}

    sources = get_sources(conn, 'ok')
    if not sources:
        return {'error': 'Нет активных OK-источников. Добавьте группы в настройках.', 'total_saved': 0}

    total_found = total_saved = 0
    results = []

    for src in sources:
        result = scrape_ok(conn, src, session, max_posts=max_posts_per_source)
        total_found += result['posts_found']
        total_saved += result['posts_saved']
        results.append({'source_id': src['source_id'], **result})

        update_source(conn, src['id'], result['posts_found'])
        log_run(conn, 'ok', src['source_id'],
                'done' if not result['error'] else 'error',
                result['posts_found'], result['posts_saved'],
                result.get('error') or '')

        if session.get('is_blocked'):
            print('[ok] сессия заблокирована, останавливаемся')
            break

    return {
        'platform': 'ok',
        'sources_processed': len(results),
        'total_found': total_found,
        'total_saved': total_saved,
        'details': results,
    }
