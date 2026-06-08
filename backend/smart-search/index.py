"""
Умный семантический поиск объектов недвижимости через Yandex Text Embeddings.
Пользователь пишет «офис до 100м² в центре» — находим по смыслу, не только по фильтрам.

Оптимизация: эмбеддинги объектов кешируются в listings.embedding.
Пересчёт только для объектов у которых embedding IS NULL или updated_at > embedding_updated_at.
При поиске делаем 1 запрос к Yandex (для query) вместо 100+.

Args: POST { query: str, limit?: int, min_score?: float }
      POST { action: 'reindex', ids?: [int] }  — пересчёт кеша (для крона)
Returns: { results: [{id, title, score, ...}], total }
"""
import json
import math
import os
import urllib.request
import urllib.error
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')
EMBED_DOC_MODEL = 'text-search-doc/latest'
EMBED_QUERY_MODEL = 'text-search-query/latest'
EMBED_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}


def _ok(body, status=200):
    return {'statusCode': status,
            'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(body, ensure_ascii=False)}


def _err(code, msg):
    return _ok({'error': msg}, code)


def _load_keys() -> tuple[str, str]:
    api_key = os.environ.get('AISTUDIO_API_KEY', '')
    folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
    if api_key and folder_id:
        return api_key, folder_id
    try:
        with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
                row = cur.fetchone() or {}
                return (api_key or row.get('yandex_api_key') or '',
                        folder_id or row.get('yandex_folder_id') or '')
    except Exception:
        return api_key, folder_id


def _embed(text: str, model: str, api_key: str, folder_id: str) -> list[float]:
    model_uri = f'emb://{folder_id}/{model}' if folder_id else model
    payload = {'modelUri': model_uri, 'text': text[:2000]}
    headers = {'Content-Type': 'application/json', 'Authorization': f'Api-Key {api_key}'}
    if folder_id:
        headers['x-folder-id'] = folder_id
    req = urllib.request.Request(EMBED_URL, data=json.dumps(payload).encode(), headers=headers, method='POST')
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode()).get('embedding', [])


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def _listing_to_text(listing: dict) -> str:
    cat_map = {
        'office': 'офис', 'retail': 'магазин торговое', 'warehouse': 'склад',
        'restaurant': 'ресторан кафе общепит', 'hotel': 'гостиница отель',
        'building': 'здание', 'land': 'земля участок', 'free_purpose': 'свободного назначения',
        'production': 'производство', 'car_service': 'автосервис',
        'gab': 'арендный бизнес', 'business': 'готовый бизнес',
    }
    deal_map = {'sale': 'продажа продам купить', 'rent': 'аренда сдам снять'}
    cond_map = {'new': 'новое', 'euro': 'евроремонт', 'good': 'хорошее',
                'cosmetic': 'косметика', 'rough': 'черновая', 'shellcore': 'черновая'}
    parts = [
        deal_map.get(listing.get('deal', ''), ''),
        cat_map.get(listing.get('category', ''), listing.get('category', '')),
    ]
    if listing.get('area'):     parts.append(f'площадь {listing["area"]} квадратных метров')
    if listing.get('price'):    parts.append(f'цена {listing["price"]} рублей')
    if listing.get('district'): parts.append(f'район {listing["district"]}')
    if listing.get('city'):     parts.append(f'город {listing["city"]}')
    if listing.get('address'):  parts.append(listing['address'])
    if listing.get('condition'): parts.append(cond_map.get(listing['condition'], ''))
    if listing.get('floor'):     parts.append(f'этаж {listing["floor"]}')
    if listing.get('ceiling_height'): parts.append(f'высота потолков {listing["ceiling_height"]} метров')
    if listing.get('description'): parts.append(listing['description'][:300])
    if listing.get('title'):    parts.append(listing['title'])
    return ' '.join(p for p in parts if p).strip()


def _reindex(cur, conn, api_key: str, folder_id: str, ids: list | None, batch: int = 20) -> dict:
    """Пересчитывает эмбеддинги для объектов у которых кеш устарел или отсутствует."""
    if ids:
        ids_sql = ','.join(str(i) for i in ids)
        cur.execute(
            f"SELECT id, title, category, deal, price, area, address, district, city, "
            f"condition, floor, ceiling_height, description "
            f"FROM {SCHEMA}.listings WHERE id IN ({ids_sql}) AND status = 'active'"
        )
    else:
        # Объекты без кеша или изменившиеся после последнего пересчёта
        cur.execute(f"""
            SELECT id, title, category, deal, price, area, address, district, city,
                   condition, floor, ceiling_height, description
            FROM {SCHEMA}.listings
            WHERE status = 'active' AND is_visible = TRUE
              AND (embedding IS NULL
                   OR embedding_updated_at IS NULL
                   OR updated_at > embedding_updated_at)
            ORDER BY updated_at DESC
            LIMIT {batch}
        """)

    rows = cur.fetchall()
    done, errors = 0, 0
    for row in rows:
        text = _listing_to_text(dict(row))
        try:
            vec = _embed(text, EMBED_DOC_MODEL, api_key, folder_id)
            if vec:
                vec_sql = '{' + ','.join(str(v) for v in vec) + '}'
                cur.execute(
                    f"UPDATE {SCHEMA}.listings "
                    f"SET embedding = '{vec_sql}', embedding_updated_at = NOW() "
                    f"WHERE id = {row['id']}"
                )
                done += 1
        except Exception as e:
            print(f'[smart-search] reindex error id={row["id"]}: {e}')
            errors += 1

    conn.commit()
    # Сколько ещё нужно проиндексировать
    cur.execute(f"""
        SELECT COUNT(*) AS remaining FROM {SCHEMA}.listings
        WHERE status = 'active' AND is_visible = TRUE
          AND (embedding IS NULL OR embedding_updated_at IS NULL OR updated_at > embedding_updated_at)
    """)
    remaining = (cur.fetchone() or {}).get('remaining', 0)
    return {'done': done, 'errors': errors, 'remaining': remaining}


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}
    if event.get('httpMethod') != 'POST':
        return _err(405, 'Method not allowed')

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err(400, 'Invalid JSON')

    action = body.get('action', 'search')
    api_key, folder_id = _load_keys()
    if not api_key or not folder_id:
        return _err(500, 'Embeddings не настроены: нужен AISTUDIO_API_KEY + YANDEX_FOLDER_ID')

    # ── Переиндексация кеша ──────────────────────────────────────────────────
    if action == 'reindex':
        with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                result = _reindex(cur, conn, api_key, folder_id,
                                  ids=body.get('ids'), batch=int(body.get('batch', 20)))
        return _ok({'ok': True, **result})

    # ── Поиск ────────────────────────────────────────────────────────────────
    query = str(body.get('query') or '').strip()
    if not query or len(query) < 3:
        return _err(400, 'query обязателен (минимум 3 символа)')

    limit = min(int(body.get('limit') or 10), 30)
    min_score = float(body.get('min_score') or 0.45)

    # 1. Эмбеддинг запроса — 1 HTTP-вызов
    try:
        query_vec = _embed(query, EMBED_QUERY_MODEL, api_key, folder_id)
    except urllib.error.HTTPError as e:
        return _err(502, f'Ошибка эмбеддинга: {e.code}')
    except Exception as e:
        return _err(502, str(e)[:200])

    if not query_vec:
        return _err(502, 'Получен пустой вектор запроса')

    # 2. Загружаем объекты с кешированными эмбеддингами из БД (0 HTTP-вызовов к Yandex)
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"""
                SELECT id, title, category, deal, price, area, address, district,
                       city, image, slug, embedding
                FROM {SCHEMA}.listings
                WHERE status = 'active' AND is_visible = TRUE AND embedding IS NOT NULL
                ORDER BY updated_at DESC
                LIMIT 500
            """)
            listings = cur.fetchall()

            # Если кеша нет вообще — запускаем реиндексацию на лету (первый запуск)
            if not listings:
                print('[smart-search] кеш пустой — запускаем реиндексацию первых 30 объектов')
                with conn.cursor(cursor_factory=RealDictCursor) as cur2:
                    _reindex(cur2, conn, api_key, folder_id, ids=None, batch=30)
                    cur2.execute(f"""
                        SELECT id, title, category, deal, price, area, address, district,
                               city, image, slug, embedding
                        FROM {SCHEMA}.listings
                        WHERE status = 'active' AND is_visible = TRUE AND embedding IS NOT NULL
                        LIMIT 500
                    """)
                    listings = cur2.fetchall()

    if not listings:
        return _ok({'results': [], 'total': 0, 'query': query})

    # 3. Косинусное сходство — только CPU, без HTTP
    scored = []
    for row in listings:
        vec = row.get('embedding')
        if not vec:
            continue
        score = _cosine(query_vec, list(vec))
        if score >= min_score:
            scored.append((score, dict(row)))

    scored.sort(key=lambda x: x[0], reverse=True)

    results = [
        {
            'id': r['id'], 'title': r['title'], 'category': r['category'],
            'deal': r['deal'], 'price': r['price'], 'area': r['area'],
            'address': r['address'], 'district': r.get('district'),
            'city': r.get('city'), 'image': r.get('image'), 'slug': r.get('slug'),
            'score': round(s, 3),
        }
        for s, r in scored[:limit]
    ]

    return _ok({'results': results, 'total': len(results), 'query': query})
