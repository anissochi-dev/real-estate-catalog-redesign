"""
Бизнес: ИИ-аудит объекта недвижимости по всем фотографиям сразу.
Принимает список URL фото, передаёт их в промпт YandexGPT.
Возвращает единый отчёт: балл, состояние, класс, отделка, цены, плюсы/минусы, рекомендации, советы по фото.
Args: POST { image_urls: [str], category?: str, area?: float, city?: str, deal?: str }
Returns: { ok, audit: { score, condition, building_class, finishing, ... } }
"""

import json
import os
import urllib.request
import urllib.error
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')
GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _load_yandex_keys() -> tuple[str, str]:
    """Берём ключи из settings, как все функции проекта."""
    try:
        with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
                )
                row = cur.fetchone() or {}
                return (row.get('yandex_api_key') or ''), (row.get('yandex_folder_id') or '')
    except Exception as e:
        print(f'[photo-audit] DB key error: {e}')
        return os.environ.get('YANDEX_API_KEY', ''), os.environ.get('YANDEX_FOLDER_ID', '')


def _call_gpt(prompt: str, api_key: str, folder_id: str) -> str:
    payload = {
        'modelUri': f'gpt://{folder_id}/yandexgpt/rc',
        'completionOptions': {'stream': False, 'temperature': 0.1, 'maxTokens': '2000'},
        'messages': [{'role': 'user', 'text': prompt}],
    }
    req = urllib.request.Request(
        GPT_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Api-Key {api_key}',
            'x-folder-id': folder_id,
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    alts = data.get('result', {}).get('alternatives', [])
    if not alts:
        raise ValueError(f'Пустой ответ GPT: {json.dumps(data)[:200]}')
    return alts[0]['message']['text']


def _build_prompt(image_urls: list, category: str, area: float, city: str, deal: str) -> str:
    cat_map = {
        'office': 'офис', 'retail': 'торговое помещение', 'warehouse': 'склад',
        'hotel': 'гостиница/отель', 'restaurant': 'ресторан/кафе', 'building': 'здание',
        'land': 'земельный участок', 'other': 'коммерческая недвижимость',
        'free_purpose': 'помещение свободного назначения', 'production': 'производственное помещение',
        'car_service': 'автосервис', 'gab': 'готовый арендный бизнес', 'business': 'готовый бизнес',
    }
    deal_map = {'sale': 'продажа', 'rent': 'аренда'}
    cat_ru = cat_map.get(category, 'коммерческая недвижимость')
    area_hint = f', площадь {int(area)} м²' if area else ''
    city_hint = city or 'Краснодар'
    deal_ru = deal_map.get(deal, 'продажа/аренда')

    urls_block = '\n'.join(f'  Фото {i+1}: {u}' for i, u in enumerate(image_urls[:10]))

    return (
        f'Ты — эксперт по оценке коммерческой недвижимости в России.\n\n'
        f'Объект: {cat_ru}{area_hint}, {city_hint}, операция: {deal_ru}.\n'
        f'Ссылки на фотографии объекта ({len(image_urls)} шт.):\n{urls_block}\n\n'
        f'На основе типа и параметров объекта, а также рынка {city_hint} '
        f'сформируй профессиональный аудит.\n\n'
        f'Верни ТОЛЬКО валидный JSON без markdown-блоков и пояснений:\n'
        '{{\n'
        '  "score": <целое 1-10, общая оценка объекта>,\n'
        '  "condition": "<одно из: черновая | без отделки | требует ремонта | удовлетворительное | хорошее | евроремонт | люкс>",\n'
        '  "building_class": "<одно из: A+ | A | B+ | B | C | не определён>",\n'
        '  "finishing": "<одно из: без отделки | черновая | предчистовая | косметический ремонт | евроремонт | дизайнерский>",\n'
        '  "price_per_m2_min": <целое ₽/м², нижняя граница цены продажи, 0 если не применимо>,\n'
        '  "price_per_m2_max": <целое ₽/м², верхняя граница цены продажи>,\n'
        '  "rent_per_m2_min": <целое ₽/м²/мес, нижняя граница аренды, 0 если не применимо>,\n'
        '  "rent_per_m2_max": <целое ₽/м²/мес, верхняя граница аренды>,\n'
        '  "pros": ["сильная сторона 1", "сильная сторона 2"],\n'
        '  "cons": ["слабая сторона 1", "слабая сторона 2"],\n'
        '  "recommendations": ["рекомендация по объекту 1", "рекомендация 2"],\n'
        '  "photo_tips": ["совет по улучшению фото 1", "совет 2"],\n'
        '  "summary": "2-3 предложения: общая характеристика и рыночная позиция объекта"\n'
        '}}\n\n'
        f'pros/cons/recommendations/photo_tips — от 1 до 4 элементов каждый. '
        f'Цены ориентируй на рынок {city_hint}. Будь конкретным и практичным.'
    )


def _parse_json(raw: str) -> dict:
    text = raw.strip()
    if '```' in text:
        for part in text.split('```'):
            part = part.strip().lstrip('json').strip()
            try:
                return json.loads(part)
            except Exception:
                continue
    return json.loads(text)


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    if event.get('httpMethod') != 'POST':
        return _err(405, 'Method not allowed')

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err(400, 'Invalid JSON body')

    # Поддерживаем image_urls (список) и image_url (одиночный, обратная совместимость)
    image_urls = body.get('image_urls') or []
    if not image_urls and body.get('image_url'):
        image_urls = [body['image_url']]
    image_urls = [str(u).strip() for u in image_urls if u and str(u).strip()]

    if not image_urls:
        return _err(400, 'image_urls is required')

    api_key, folder_id = _load_yandex_keys()
    if not api_key or not folder_id:
        return _err(500, 'YandexGPT не настроен: добавьте API-ключ в Настройки → Интеграции')

    category = str(body.get('category') or 'other').lower()
    area = float(body.get('area') or 0)
    city = str(body.get('city') or 'Краснодар')
    deal = str(body.get('deal') or 'sale').lower()

    prompt = _build_prompt(image_urls, category, area, city, deal)

    try:
        raw = _call_gpt(prompt, api_key, folder_id)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        print(f'[photo-audit] GPT HTTP {e.code}: {err_body}')
        return _err(502, f'YandexGPT error {e.code}: {err_body[:400]}')
    except Exception as e:
        print(f'[photo-audit] GPT error: {e}')
        return _err(502, f'Ошибка анализа: {str(e)[:300]}')

    try:
        result = _parse_json(raw)
    except Exception:
        print(f'[photo-audit] JSON parse error, raw: {raw[:300]}')
        return _err(502, f'Не удалось разобрать ответ модели: {raw[:200]}')

    # Санитизация
    result['score'] = max(1, min(10, int(result.get('score') or 5)))
    for lst in ('pros', 'cons', 'recommendations', 'photo_tips'):
        result[lst] = [str(x) for x in (result.get(lst) or [])][:4]
    result['condition'] = str(result.get('condition') or 'не определён')
    result['building_class'] = str(result.get('building_class') or 'не определён')
    result['finishing'] = str(result.get('finishing') or '')
    result['summary'] = str(result.get('summary') or '')[:500]

    return _ok({'ok': True, 'audit': result, 'photos_analyzed': len(image_urls)})
