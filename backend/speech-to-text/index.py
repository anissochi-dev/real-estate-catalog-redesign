"""
Голосовой ввод для брокеров: принимает аудио в base64, отправляет в Yandex SpeechKit
(stt.api.cloud.yandex.net), возвращает распознанный текст.
После распознавания YandexGPT 5 Pro структурирует речь в поля объекта недвижимости.
Args: POST { audio_b64: str, format?: "ogg_opus"|"lpcm"|"mp3", mode?: "stt"|"parse" }
Returns: { text: str, fields?: {title, description, area, price, floor, address, ...} }
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

GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
STT_URL = 'https://stt.api.cloud.yandex.net/speech/v1/stt:recognize'


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _get_keys() -> tuple[str, str]:
    return (
        os.environ.get('AISTUDIO_API_KEY') or os.environ.get('YANDEX_API_KEY', ''),
        os.environ.get('YANDEX_FOLDER_ID', ''),
    )


def _stt(audio_bytes: bytes, fmt: str, api_key: str, folder_id: str) -> str:
    """Отправляем аудио в Yandex SpeechKit STT v1 — возвращает распознанный текст."""
    fmt_map = {
        'ogg_opus': 'oggopus',
        'mp3': 'mp3',
        'lpcm': 'lpcm',
        'webm': 'oggopus',   # браузер пишет webm/opus — совместим с oggopus
        'ogg': 'oggopus',
    }
    stt_fmt = fmt_map.get(fmt, 'oggopus')

    params = f'?lang=ru-RU&format={stt_fmt}&folderId={folder_id}&profanityFilter=false'
    req = urllib.request.Request(
        STT_URL + params,
        data=audio_bytes,
        headers={
            'Authorization': f'Api-Key {api_key}',
            'Content-Type': 'application/octet-stream',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    text = data.get('result', '')
    if not text:
        raise ValueError(f'SpeechKit вернул пустой результат: {json.dumps(data)[:200]}')
    return text


def _parse_speech(text: str, api_key: str, folder_id: str) -> dict:
    """
    YandexGPT 5 Pro разбирает речь брокера и извлекает поля объекта.
    Пример: «офис 80 метров в центре за 90 тысяч в месяц, евроремонт, 3й этаж»
    → {category: office, area: 80, price: 90000, deal: rent, condition: euro, floor: 3, ...}
    """
    system = (
        'Ты — ассистент брокера коммерческой недвижимости. '
        'Из голосового описания объекта извлеки структурированные поля. '
        'Верни ТОЛЬКО валидный JSON без markdown:\n'
        '{\n'
        '  "title": "краткий заголовок до 70 символов или null",\n'
        '  "category": "office|retail|warehouse|restaurant|hotel|building|land|free_purpose|production|car_service|gab|business или null",\n'
        '  "deal": "sale|rent или null",\n'
        '  "area": число_м2_или_null,\n'
        '  "price": число_рублей_или_null,\n'
        '  "price_unit": "total|m2|sotka или null",\n'
        '  "floor": число_или_null,\n'
        '  "floors_total": число_или_null,\n'
        '  "ceiling_height": число_метров_или_null,\n'
        '  "address": "адрес или null",\n'
        '  "district": "район или null",\n'
        '  "condition": "new|euro|good|cosmetic|rough|shellcore или null",\n'
        '  "description": "развёрнутое описание из речи, 2-5 предложений или null",\n'
        '  "parking": true_false_или_null,\n'
        '  "separate_entrance": true_false_или_null\n'
        '}\n'
        'Если поле не упомянуто — null. Для price: если сказано "90 тысяч" — 90000, '
        '"1.5 млн" — 1500000. Для price_unit: "в месяц/за месяц" → total (аренда), '
        '"за метр/м²" → m2. Condition: евроремонт→euro, хороший→good, черновая→rough.'
    )

    model_uri = f'gpt://{folder_id}/yandexgpt-5-pro/latest' if folder_id else 'yandexgpt-5-pro/latest'
    payload = {
        'modelUri': model_uri,
        'completionOptions': {'stream': False, 'temperature': 0.1, 'maxTokens': '1000'},
        'messages': [
            {'role': 'system', 'text': system},
            {'role': 'user', 'text': f'Распознанная речь брокера:\n"{text}"'},
        ],
    }
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Api-Key {api_key}',
    }
    if folder_id:
        headers['x-folder-id'] = folder_id

    req = urllib.request.Request(
        GPT_URL,
        data=json.dumps(payload).encode(),
        headers=headers,
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    raw = (data.get('result', {}).get('alternatives') or [{}])[0].get('message', {}).get('text', '')
    raw = raw.strip()
    if '```' in raw:
        for part in raw.split('```'):
            part = part.strip().lstrip('json').strip()
            try:
                return json.loads(part)
            except Exception:
                continue
    return json.loads(raw)


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    if event.get('httpMethod') != 'POST':
        return _err(405, 'Method not allowed')

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err(400, 'Invalid JSON body')

    audio_b64 = body.get('audio_b64', '')
    if not audio_b64:
        return _err(400, 'audio_b64 обязателен')

    fmt = str(body.get('format') or 'ogg_opus').lower()
    mode = str(body.get('mode') or 'parse').lower()  # stt | parse

    api_key, folder_id = _get_keys()
    if not api_key:
        return _err(500, 'AISTUDIO_API_KEY не настроен')
    if not folder_id:
        return _err(500, 'YANDEX_FOLDER_ID не настроен (нужен для SpeechKit STT)')

    # 1. Декодируем аудио
    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception as e:
        return _err(400, f'Ошибка декодирования base64: {e}')

    if len(audio_bytes) < 100:
        return _err(400, 'Аудио слишком короткое — запись не удалась')

    print(f'[speech-to-text] аудио {len(audio_bytes)} байт, формат {fmt}, режим {mode}')

    # 2. Speech-to-Text через Yandex SpeechKit
    try:
        text = _stt(audio_bytes, fmt, api_key, folder_id)
        print(f'[speech-to-text] STT результат: "{text[:100]}"')
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        print(f'[speech-to-text] STT HTTP {e.code}: {err_body}')
        return _err(502, f'SpeechKit ошибка {e.code}: {err_body[:300]}')
    except Exception as e:
        print(f'[speech-to-text] STT error: {e}')
        return _err(502, f'Ошибка распознавания: {str(e)[:200]}')

    # 3. Если только STT — возвращаем текст
    if mode == 'stt':
        return _ok({'ok': True, 'text': text})

    # 4. Парсим поля объекта через GPT
    fields = {}
    try:
        fields = _parse_speech(text, api_key, folder_id)
        # Убираем null-значения
        fields = {k: v for k, v in fields.items() if v is not None}
        print(f'[speech-to-text] поля: {list(fields.keys())}')
    except Exception as e:
        print(f'[speech-to-text] parse error: {e}')
        # Если парсинг не удался — возвращаем хотя бы текст

    return _ok({
        'ok': True,
        'text': text,
        'fields': fields,
    })
