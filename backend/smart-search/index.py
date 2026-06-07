"""
Бизнес: Умный семантический поиск объектов недвижимости через Yandex Text Embeddings.
Пользователь пишет «хочу офис до 100м² в центре» — система находит похожие объекты
по смыслу, а не только по точным фильтрам.
Args: POST { query: str, limit?: int, min_score?: float }
Returns: { results: [{listing_id, title, score, ...}], query_understood }
"""

import json
import os
import math
import urllib.request
import urllib.error

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')

# Yandex Text Embeddings — документы и запросы
EMBED_DOC_MODEL = 'text-search-doc/latest'
EMBED_QUERY_MODEL = 'text-search-query/latest'
EMBED_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _load_keys() -> tuple[str, str]:
    import psycopg2
    from psycopg2.extras import RealDictCursor as RC
    api_key = os.environ.get('AISTUDIO_API_KEY', '')
    folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
    if api_key and folder_id:
        return api_key, folder_id
    try:
        with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
            with conn.cursor(cursor_factory=RC) as cur:
                cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
                row = cur.fetchone() or {}
                return (
                    api_key or row.get('yandex_api_key') or '',
                    folder_id or row.get('yandex_folder_id') or '',
                )
    except Exception:
        return api_key, folder_id


def _embed(text: str, model: str, api_key: str, folder_id: str) -> list[float]:
    """Получаем вектор эмбеддинга для текста."""
    model_uri = f'emb://{folder_id}/{model}' if folder_id else model
    payload = {'modelUri': model_uri, 'text': text[:2000]}
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Api-Key {api_key}',
    }
    if folder_id:
        headers['x-folder-id'] = folder_id
    req = urllib.request.Request(
        EMBED_URL,
        data=json.dumps(payload).encode(),
        headers=headers,
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())
    return data.get('embedding', [])


def _cosine(a: list[float], b: list[float]) -> float:
    """Косинусное сходство двух векторов."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _listing_to_text(listing: dict) -> str:
    """Превращаем объект в текст для эмбеддинга."""
    parts = []
    cat_map = {
        'office': 'офис', 'retail': 'магазин торговое', 'warehouse': 'склад',
        'restaurant': 'ресторан кафе общепит', 'hotel': 'гостиница отель',
        'building': 'здание', 'land': 'земля участок', 'free_purpose': 'свободного назначения',
        'production': 'производство', 'car_service': 'автосервис', 'gab': 'арендный бизнес',
        'business': 'готовый бизнес',
    }
    deal_map = {'sale': 'продажа продам купить', 'rent': 'аренда сдам снять'}

    cat = cat_map.get(listing.get('category', ''), listing.get('category', ''))
    deal = deal_map.get(listing.get('deal', ''), listing.get('deal', ''))
    parts.append(f'{deal} {cat}')

    if listing.get('area'):
        parts.append(f'площадь {listing["area"]} квадратных метров')
    if listing.get('price'):
        parts.append(f'цена {listing["price"]} рублей')
    if listing.get('district'):
        parts.append(f'район {listing["district"]}')
    if listing.get('city'):
        parts.append(f'город {listing["city"]}')
    if listing.get('address'):
        parts.append(listing['address'])
    if listing.get('condition'):
        cond_map = {
            'new': 'новое', 'euro': 'евроремонт', 'good': 'хорошее',
            'cosmetic': 'косметика', 'rough': 'черновая', 'shellcore': 'черновая',
        }
        parts.append(cond_map.get(listing.get('condition', ''), ''))
    if listing.get('floor'):
        parts.append(f'этаж {listing["floor"]}')
    if listing.get('ceiling_height'):
        parts.append(f'высота потолков {listing["ceiling_height"]} метров')
    if listing.get('description'):
        parts.append(listing['description'][:300])
    if listing.get('title'):
        parts.append(listing['title'])

    return ' '.join(p for p in parts if p).strip()


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    if event.get('httpMethod') != 'POST':
        return _err(405, 'Method not allowed')

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err(400, 'Invalid JSON body')

    query = str(body.get('query') or '').strip()
    if not query or len(query) < 3:
        return _err(400, 'query обязателен (минимум 3 символа)')

    limit = min(int(body.get('limit') or 10), 30)
    min_score = float(body.get('min_score') or 0.5)

    api_key, folder_id = _load_keys()
    if not api_key or not folder_id:
        return _err(500, 'Embeddings не настроены: нужен AISTUDIO_API_KEY + YANDEX_FOLDER_ID')

    # 1. Получаем эмбеддинг запроса
    try:
        query_vec = _embed(query, EMBED_QUERY_MODEL, api_key, folder_id)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        print(f'[smart-search] Embed query HTTP {e.code}: {err_body}')
        return _err(502, f'Ошибка эмбеддинга запроса: {e.code}')
    except Exception as e:
        print(f'[smart-search] Embed query error: {e}')
        return _err(502, f'Ошибка: {str(e)[:200]}')

    if not query_vec:
        return _err(502, 'Получен пустой вектор запроса')

    # 2. Загружаем активные объекты из БД
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"""
                    SELECT id, title, category, deal, price, area, address, district,
                           city, condition, floor, ceiling_height, description,
                           image, slug, price_unit
                    FROM {SCHEMA}.listings
                    WHERE status = 'active' AND is_visible = TRUE
                    ORDER BY updated_at DESC
                    LIMIT 500
                """)
                listings = cur.fetchall()
    except Exception as e:
        print(f'[smart-search] DB error: {e}')
        return _err(500, f'Ошибка БД: {str(e)[:200]}')

    if not listings:
        return _ok({'results': [], 'total': 0, 'query': query})

    # 3. Для каждого объекта считаем эмбеддинг и косинусное сходство
    # Батчим запросы — берём первые 100 объектов чтобы уложиться в таймаут
    scored = []
    for listing in listings[:100]:
        listing_text = _listing_to_text(dict(listing))
        try:
            doc_vec = _embed(listing_text, EMBED_DOC_MODEL, api_key, folder_id)
            score = _cosine(query_vec, doc_vec)
            if score >= min_score:
                scored.append((score, dict(listing)))
        except Exception:
            continue

    # 4. Сортируем по убыванию сходства
    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:limit]

    results = []
    for score, listing in top:
        results.append({
            'id': listing['id'],
            'title': listing['title'],
            'category': listing['category'],
            'deal': listing['deal'],
            'price': listing['price'],
            'area': listing['area'],
            'address': listing['address'],
            'district': listing.get('district'),
            'city': listing.get('city'),
            'image': listing.get('image'),
            'slug': listing.get('slug'),
            'price_unit': listing.get('price_unit'),
            'relevance_score': round(score, 3),
        })

    return _ok({
        'ok': True,
        'results': results,
        'total': len(results),
        'query': query,
        'listings_scanned': min(len(listings), 100),
    })