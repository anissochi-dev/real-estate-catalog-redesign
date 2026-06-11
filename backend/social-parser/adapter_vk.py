"""
adapter_vk.py — парсер публичных групп ВКонтакте.

Метод: HTML-парсинг публичных страниц vk.com/wall{group_id}
Без API ключей — работает через куки техаккаунта (хранятся в social_sessions).
Публичные группы доступны без авторизации (ограниченно).
Закрытые группы — через куки аккаунта-члена группы.

Антибан: паузы 2-5 сек, лимит 200 req/h, 1000 req/day, только 09-23 МСК.
"""

import re
from core import (
    safe_fetch, parse_post_text, is_realestate_post,
    get_session, get_sources, update_source, save_to_market, log_run,
    SCHEMA,
)


# ─── Парсинг стены группы ─────────────────────────────────────────────────────

def _parse_vk_wall_html(html: str, group_id: str) -> list[dict]:
    """
    Парсит HTML страницы vk.com/wall-{group_id} или vk.com/{slug}.
    Извлекает посты из div.wall_post_text.
    Возвращает список {post_id, text, url}.
    """
    posts = []

    # Ищем блоки постов по data-post-id
    post_blocks = re.finditer(
        r'data-post-id=["\'](-?\d+_\d+)["\']',
        html
    )

    seen = set()
    for m in post_blocks:
        post_id = m.group(1)
        if post_id in seen:
            continue
        seen.add(post_id)

        # Берём блок от текущей позиции до следующего поста (~3000 символов)
        start = m.start()
        block = html[start:start + 3000]

        # Извлекаем текст поста
        text = _extract_post_text(block)
        if not text:
            continue

        posts.append({
            'post_id': post_id,
            'text': text,
            'url': f'https://vk.com/wall{post_id}',
        })

    return posts


def _extract_post_text(block: str) -> str:
    """Извлекает текст из блока HTML поста ВКонтакте."""
    # Метод 1: div class="wall_post_text"
    m = re.search(
        r'class=["\'][^"\']*wall_post_text[^"\']*["\'][^>]*>(.*?)</div>',
        block, re.S | re.I
    )
    if m:
        return _clean_html(m.group(1))

    # Метод 2: class="pi_text" (мобильная версия)
    m = re.search(
        r'class=["\'][^"\']*pi_text[^"\']*["\'][^>]*>(.*?)</div>',
        block, re.S | re.I
    )
    if m:
        return _clean_html(m.group(1))

    # Метод 3: поиск по data-content
    m = re.search(r'data-content=["\']([^"\']{20,})["\']', block)
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
    """Строит URL стены группы."""
    # source_id может быть: -123456, public123456, club123456, или slug
    if source_id.startswith('-') or source_id.isdigit():
        return f'https://vk.com/wall{source_id}'
    return f'https://vk.com/{source_id}'


# ─── Главная функция парсинга ─────────────────────────────────────────────────

def scrape_vk(conn, source: dict, session: dict, max_posts: int = 50) -> dict:
    """
    Парсит одну группу ВКонтакте.
    source — запись из social_parser_sources.
    session — запись из social_sessions (куки).
    Возвращает {posts_found, posts_saved, skipped, error}.
    """
    group_id = source['source_id']
    url = _get_group_url(group_id)

    print(f'[vk] парсим группу {group_id}: {url}')

    html = safe_fetch(url, 'vk', conn, session, timeout=20)
    if not html:
        return {'posts_found': 0, 'posts_saved': 0, 'skipped': 0, 'error': 'Не удалось загрузить страницу'}

    posts = _parse_vk_wall_html(html, group_id)
    print(f'[vk] найдено постов в HTML: {len(posts)}')

    records = []
    skipped = 0

    for post in posts[:max_posts]:
        text = post['text']
        if not is_realestate_post(text):
            skipped += 1
            continue

        rec = parse_post_text(
            text=text,
            source='vk',
            post_id=post['post_id'],
            url=post['url'],
        )
        if rec:
            records.append(rec)
        else:
            skipped += 1

    inserted, updated = save_to_market(conn, records)

    print(f'[vk] {group_id}: постов={len(posts)}, объявлений={len(records)}, '
          f'добавлено={inserted}, обновлено={updated}, пропущено={skipped}')

    return {
        'posts_found': len(posts),
        'posts_saved': inserted + updated,
        'skipped': skipped,
        'error': None,
    }


def run_vk(conn, max_posts_per_source: int = 50) -> dict:
    """
    Запускает парсинг всех активных VK-источников.
    Использует первую доступную сессию.
    """
    session = get_session(conn, 'vk')
    if not session:
        return {'error': 'Нет активной VK-сессии. Добавьте куки в настройках.', 'total_saved': 0}

    sources = get_sources(conn, 'vk')
    if not sources:
        return {'error': 'Нет активных VK-источников. Добавьте группы в настройках.', 'total_saved': 0}

    total_found = total_saved = 0
    results = []

    for src in sources:
        result = scrape_vk(conn, src, session, max_posts=max_posts_per_source)
        total_found += result['posts_found']
        total_saved += result['posts_saved']
        results.append({'source_id': src['source_id'], **result})

        update_source(conn, src['id'], result['posts_found'])
        log_run(conn, 'vk', src['source_id'],
                'done' if not result['error'] else 'error',
                result['posts_found'], result['posts_saved'],
                result.get('error') or '')

        # Если сессия заблокирована — останавливаемся
        if session.get('is_blocked'):
            print('[vk] сессия заблокирована, останавливаемся')
            break

    return {
        'platform': 'vk',
        'sources_processed': len(results),
        'total_found': total_found,
        'total_saved': total_saved,
        'details': results,
    }
