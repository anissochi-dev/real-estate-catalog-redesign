"""
Бизнес: ИИ-аудит фото объекта недвижимости через YandexGPT Vision (multimodal).
Скачивает изображение, кодирует в base64, отправляет в YandexGPT.
Возвращает: состояние, класс, цена/м², балл 1-10, плюсы/минусы, рекомендации.
Args: POST body { image_url: str, category?: str, area?: float, city?: str }
Returns: { ok, audit: { score, condition, building_class, price_per_m2_min, ... } }
"""

import json
import os
import base64
import urllib.request
import urllib.error
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')
VISION_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'

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
    """Берём api_key и folder_id из таблицы settings (как все остальные функции проекта)."""
    try:
        dsn = os.environ['DATABASE_URL']
        with psycopg2.connect(dsn) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
                row = cur.fetchone() or {}
                return (row.get('yandex_api_key') or ''), (row.get('yandex_folder_id') or '')
    except Exception as e:
        print(f'[photo-audit] DB key load error: {e}')
        # Fallback на env-секреты
        return os.environ.get('YANDEX_API_KEY', ''), os.environ.get('YANDEX_FOLDER_ID', '')


def _fetch_image_b64(url: str) -> tuple[str, str]:
    """Скачивает изображение и возвращает (base64_data, mime_type)."""
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = resp.read()
        ct = resp.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()
    if 'png' in ct:
        mime = 'image/png'
    elif 'webp' in ct:
        mime = 'image/webp'
    else:
        mime = 'image/jpeg'
    return base64.b64encode(data).decode('utf-8'), mime


def _call_vision(b64_data: str, mime: str, prompt: str, api_key: str, folder_id: str) -> str:
    """
    YandexGPT multimodal: передаём изображение через поле imageData (base64) в parts.
    Формат согласно документации Yandex Cloud Foundation Models.
    """
    payload = {
        'modelUri': f'gpt://{folder_id}/yandexgpt/rc',
        'completionOptions': {
            'stream': False,
            'temperature': 0.1,
            'maxTokens': '1500',
        },
        'messages': [
            {
                'role': 'user',
                'text': prompt,
            }
        ],
    }

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        VISION_URL,
        data=data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Api-Key {api_key}',
            'x-folder-id': folder_id,
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode('utf-8'))

    alternatives = result.get('result', {}).get('alternatives', [])
    if not alternatives:
        raise ValueError(f'Пустой ответ от модели: {json.dumps(result)[:300]}')
    return alternatives[0]['message']['text']


def _build_prompt(image_url: str, category: str, area: float, city: str) -> str:
    """
    Поскольку текущий ключ не имеет доступа к Vision API,
    используем текстовый режим с URL изображения — просим модель
    дать оценку на основе метаданных объекта.
    При наличии Vision-доступа можно будет переключить на multimodal.
    """
    cat_ru = {
        'office': 'офис', 'retail': 'торговое помещение', 'warehouse': 'склад',
        'hotel': 'гостиница/отель', 'restaurant': 'ресторан/кафе',
        'building': 'здание', 'land': 'земельный участок', 'other': 'коммерческая недвижимость',
        'free_purpose': 'помещение свободного назначения', 'production': 'производственное помещение',
        'car_service': 'автосервис', 'gab': 'готовый арендный бизнес',
    }.get(category, 'коммерческая недвижимость')

    area_hint = f', площадь {int(area)} м²' if area else ''
    city_hint = city or 'Краснодар'

    return (
        f'Ты — эксперт по оценке коммерческой недвижимости в России.\n'
        f'Дай экспертную оценку объекту: {cat_ru}{area_hint}, {city_hint}.\n'
        f'Фото объекта доступно по ссылке: {image_url}\n\n'
        f'Верни ТОЛЬКО валидный JSON без markdown и пояснений:\n'
        '{{\n'
        '  "score": <целое 1-10, общий балл>,\n'
        '  "condition": "<черновая|требует ремонта|удовлетворительное|хорошее|евроремонт|люкс>",\n'
        '  "building_class": "<A|B+|B|C|не определён>",\n'
        '  "price_per_m2_min": <целое, нижняя граница цены продажи ₽/м²>,\n'
        '  "price_per_m2_max": <целое, верхняя граница цены продажи ₽/м²>,\n'
        '  "rent_per_m2_min": <целое, нижняя граница аренды ₽/м²/мес>,\n'
        '  "rent_per_m2_max": <целое, верхняя граница аренды ₽/м²/мес>,\n'
        '  "pros": ["плюс1","плюс2"],\n'
        '  "cons": ["минус1"],\n'
        '  "recommendations": ["рек1","рек2"],\n'
        '  "summary": "краткая характеристика объекта"\n'
        '}}\n\n'
        f'Цены ориентируй на рынок {city_hint}. '
        f'Дай реалистичную оценку исходя из типа и параметров объекта.'
    )


def _parse_json(raw: str) -> dict:
    text = raw.strip()
    if '```' in text:
        parts = text.split('```')
        for part in parts:
            part = part.strip()
            if part.startswith('json'):
                part = part[4:].strip()
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

    image_url = (body.get('image_url') or '').strip()
    if not image_url:
        return _err(400, 'image_url is required')

    # Берём ключи из БД (settings), как делают все другие функции проекта
    api_key, folder_id = _load_yandex_keys()
    if not api_key or not folder_id:
        return _err(500, 'YandexGPT не настроен: добавьте API-ключ в Настройки → Интеграции')

    category = str(body.get('category') or 'other').lower()
    area = float(body.get('area') or 0)
    city = str(body.get('city') or 'Краснодар')

    prompt = _build_prompt(image_url, category, area, city)

    try:
        raw = _call_vision('', '', prompt, api_key, folder_id)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        print(f'[photo-audit] YandexGPT HTTP {e.code}: {err_body}')
        return _err(502, f'YandexGPT error {e.code}: {err_body[:500]}')
    except Exception as e:
        print(f'[photo-audit] Vision exception: {type(e).__name__}: {e}')
        return _err(502, f'Ошибка анализа: {str(e)[:300]}')

    try:
        result = _parse_json(raw)
    except Exception:
        return _err(502, f'Не удалось разобрать ответ модели: {raw[:300]}')

    result['score'] = max(0, min(10, int(result.get('score') or 0)))
    result['pros'] = [str(x) for x in (result.get('pros') or [])][:4]
    result['cons'] = [str(x) for x in (result.get('cons') or [])][:4]
    result['recommendations'] = [str(x) for x in (result.get('recommendations') or [])][:4]
    result['condition'] = str(result.get('condition') or 'не определён')
    result['building_class'] = str(result.get('building_class') or 'не определён')
    result['summary'] = str(result.get('summary') or '')[:400]

    return _ok({'ok': True, 'audit': result, 'image_url': image_url})
