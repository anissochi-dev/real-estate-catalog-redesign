"""
Бизнес: ИИ-аудит фото объекта недвижимости — анализирует изображение через YandexGPT Vision
и возвращает: состояние, класс, ориентировочную цену/м², балл 1-10, плюсы/минусы и рекомендации.
Args: POST body { image_url: str, category?: str, area?: float, city?: str }
Returns: { score, condition, building_class, price_per_m2_min, price_per_m2_max, pros, cons, recommendations, summary }
"""

import json
import os
import urllib.request
import urllib.error


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


def _yandex_vision(image_url: str, prompt: str, api_key: str, folder_id: str) -> str:
    """Вызов YandexGPT Pro с Vision (multimodal) через imageUrl."""
    payload = {
        'modelUri': f'gpt://{folder_id}/yandexgpt/latest',
        'completionOptions': {
            'stream': False,
            'temperature': 0.2,
            'maxTokens': 1200,
        },
        'messages': [
            {
                'role': 'user',
                'content': [
                    {
                        'type': 'image_url',
                        'image_url': {'url': image_url},
                    },
                    {
                        'type': 'text',
                        'text': prompt,
                    },
                ],
            }
        ],
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
        data=data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Api-Key {api_key}',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        result = json.loads(resp.read().decode('utf-8'))
    return result['result']['alternatives'][0]['message']['text']


def _build_prompt(category: str, area: float, city: str) -> str:
    cat_ru = {
        'office': 'офис', 'retail': 'торговое помещение', 'warehouse': 'склад',
        'hotel': 'гостиница/отель', 'restaurant': 'ресторан/кафе',
        'building': 'здание', 'land': 'земельный участок', 'other': 'коммерческая недвижимость',
    }.get(category, 'коммерческая недвижимость')

    area_hint = f', площадь {int(area)} м²' if area else ''
    city_hint = city or 'Краснодар'

    return f"""Ты — эксперт по оценке коммерческой недвижимости в России.
Проанализируй фотографию объекта: {cat_ru}{area_hint}, {city_hint}.

Верни ТОЛЬКО валидный JSON без markdown-обёртки, без пояснений, строго такой формат:
{{
  "score": <целое число 1-10, общий балл состояния>,
  "condition": "<одно из: черновая | требует ремонта | удовлетворительное | хорошее | евроремонт | люкс>",
  "building_class": "<одно из: A | B+ | B | C | не определён>",
  "price_per_m2_min": <целое число, нижняя граница рыночной цены продажи ₽/м²>,
  "price_per_m2_max": <целое число, верхняя граница рыночной цены продажи ₽/м²>,
  "rent_per_m2_min": <целое число, нижняя граница арендной ставки ₽/м²/мес>,
  "rent_per_m2_max": <целое число, верхняя граница арендной ставки ₽/м²/мес>,
  "pros": ["<плюс 1>", "<плюс 2>", "<плюс 3>"],
  "cons": ["<минус 1>", "<минус 2>"],
  "recommendations": ["<рекомендация 1>", "<рекомендация 2>", "<рекомендация 3>"],
  "summary": "<1-2 предложения — общая характеристика объекта по фото>"
}}

Правила:
- Оценивай только то, что видно на фото. Не выдумывай.
- pros, cons, recommendations — массивы строк, 1-4 элемента каждый.
- Цены ориентируй на рынок {city_hint} {cat_ru}.
- Если на фото плохо видно объект или это не недвижимость — верни score=0 и пустые массивы."""


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

    api_key = os.environ.get('YANDEX_API_KEY', '')
    folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
    if not api_key or not folder_id:
        return _err(500, 'YandexGPT не настроен')

    category = str(body.get('category') or 'other').lower()
    area = float(body.get('area') or 0)
    city = str(body.get('city') or 'Краснодар')

    prompt = _build_prompt(category, area, city)

    try:
        raw = _yandex_vision(image_url, prompt, api_key, folder_id)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        return _err(502, f'YandexGPT error {e.code}: {err_body[:300]}')
    except Exception as e:
        return _err(502, f'Vision call failed: {str(e)[:200]}')

    # Парсим JSON из ответа
    try:
        # YandexGPT иногда оборачивает в ```json ... ```
        text = raw.strip()
        if text.startswith('```'):
            text = text.split('```')[1]
            if text.startswith('json'):
                text = text[4:]
        result = json.loads(text.strip())
    except Exception:
        return _err(502, f'Не удалось разобрать ответ модели: {raw[:300]}')

    # Санитизация
    result['score'] = max(0, min(10, int(result.get('score') or 0)))
    result['pros'] = (result.get('pros') or [])[:4]
    result['cons'] = (result.get('cons') or [])[:4]
    result['recommendations'] = (result.get('recommendations') or [])[:4]

    return _ok({'ok': True, 'audit': result, 'image_url': image_url})
