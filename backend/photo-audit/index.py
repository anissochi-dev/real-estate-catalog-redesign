"""
Бизнес: ИИ-аудит фото объекта недвижимости через YandexGPT Vision (multimodal).
Скачивает изображение, кодирует в base64, отправляет в модель yandex-gpt-lite/vision-preview.
Возвращает: состояние, класс, цена/м², балл 1-10, плюсы/минусы, рекомендации.
Args: POST body { image_url: str, category?: str, area?: float, city?: str }
Returns: { ok, audit: { score, condition, building_class, price_per_m2_min, ... } }
"""

import json
import os
import base64
import urllib.request
import urllib.error


CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}

# YandexGPT Vision endpoint — multimodal completions
VISION_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _fetch_image_b64(url: str) -> tuple[str, str]:
    """Скачивает изображение и возвращает (base64_data, mime_type)."""
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = resp.read()
        ct = resp.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()
    # Нормализуем mime
    if 'png' in ct:
        mime = 'image/png'
    elif 'webp' in ct:
        mime = 'image/webp'
    else:
        mime = 'image/jpeg'
    return base64.b64encode(data).decode('utf-8'), mime


def _call_vision(b64_data: str, mime: str, prompt: str, api_key: str, folder_id: str) -> str:
    """
    Вызов YandexGPT multimodal с изображением в base64.
    Модель: yandexgpt/rc — поддерживает image_url через data URI.
    Сообщение: role=user, parts: [{image_url}, {text}]
    """
    # YandexGPT Vision принимает изображение как data URI в поле image_url
    data_uri = f'data:{mime};base64,{b64_data}'

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
                'image': data_uri,  # YandexGPT multimodal поле
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


def _build_prompt(category: str, area: float, city: str) -> str:
    cat_ru = {
        'office': 'офис', 'retail': 'торговое помещение', 'warehouse': 'склад',
        'hotel': 'гостиница/отель', 'restaurant': 'ресторан/кафе',
        'building': 'здание', 'land': 'земельный участок', 'other': 'коммерческая недвижимость',
        'free_purpose': 'свободного назначения', 'production': 'производственное помещение',
    }.get(category, 'коммерческая недвижимость')

    area_hint = f', площадь {int(area)} м²' if area else ''
    city_hint = city or 'Краснодар'

    return (
        f'Ты — эксперт по оценке коммерческой недвижимости в России.\n'
        f'Проанализируй фотографию объекта: {cat_ru}{area_hint}, {city_hint}.\n\n'
        f'Верни ТОЛЬКО валидный JSON без markdown и пояснений:\n'
        f'{{\n'
        f'  "score": <целое 1-10, общий балл состояния>,\n'
        f'  "condition": "<черновая|требует ремонта|удовлетворительное|хорошее|евроремонт|люкс>",\n'
        f'  "building_class": "<A|B+|B|C|не определён>",\n'
        f'  "price_per_m2_min": <целое, нижняя граница цены продажи ₽/м²>,\n'
        f'  "price_per_m2_max": <целое, верхняя граница цены продажи ₽/м²>,\n'
        f'  "rent_per_m2_min": <целое, нижняя граница аренды ₽/м²/мес>,\n'
        f'  "rent_per_m2_max": <целое, верхняя граница аренды ₽/м²/мес>,\n'
        f'  "pros": ["плюс1","плюс2"],\n'
        f'  "cons": ["минус1","минус2"],\n'
        f'  "recommendations": ["рек1","рек2"],\n'
        f'  "summary": "1-2 предложения о состоянии объекта"\n'
        f'}}\n\n'
        f'Правила: оценивай только видимое. Цены — рынок {city_hint}. '
        f'Если фото нечёткое или не недвижимость — score=0, пустые массивы.'
    )


def _parse_json(raw: str) -> dict:
    """Парсит JSON из ответа модели, убирает ```json обёртку."""
    text = raw.strip()
    # Убираем ```json ... ``` или ``` ... ```
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

    api_key = os.environ.get('YANDEX_API_KEY', '')
    folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
    if not api_key or not folder_id:
        return _err(500, 'YandexGPT не настроен: добавьте YANDEX_API_KEY и YANDEX_FOLDER_ID')

    category = str(body.get('category') or 'other').lower()
    area = float(body.get('area') or 0)
    city = str(body.get('city') or 'Краснодар')

    # 1. Скачиваем изображение → base64
    try:
        b64_data, mime = _fetch_image_b64(image_url)
    except Exception as e:
        return _err(502, f'Не удалось загрузить фото: {str(e)[:200]}')

    # Ограничение: не более ~4 МБ base64 (≈3 МБ исходник)
    if len(b64_data) > 5_500_000:
        # Пробуем уменьшить — берём только первые байты для превью не выйдет,
        # сообщаем об ошибке
        return _err(413, 'Фото слишком большое для анализа (максимум ~4 МБ). Загрузите фото меньшего размера.')

    prompt = _build_prompt(category, area, city)

    # 2. Вызываем YandexGPT Vision
    try:
        raw = _call_vision(b64_data, mime, prompt, api_key, folder_id)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        return _err(502, f'YandexGPT error {e.code}: {err_body[:400]}')
    except Exception as e:
        return _err(502, f'Vision call failed: {str(e)[:300]}')

    # 3. Парсим JSON ответ
    try:
        result = _parse_json(raw)
    except Exception:
        return _err(502, f'Не удалось разобрать ответ модели: {raw[:300]}')

    # 4. Санитизация значений
    result['score'] = max(0, min(10, int(result.get('score') or 0)))
    result['pros'] = [str(x) for x in (result.get('pros') or [])][:4]
    result['cons'] = [str(x) for x in (result.get('cons') or [])][:4]
    result['recommendations'] = [str(x) for x in (result.get('recommendations') or [])][:4]
    result['condition'] = str(result.get('condition') or 'не определён')
    result['building_class'] = str(result.get('building_class') or 'не определён')
    result['summary'] = str(result.get('summary') or '')[:400]

    return _ok({'ok': True, 'audit': result, 'image_url': image_url})
