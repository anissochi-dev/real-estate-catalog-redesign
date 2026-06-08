"""
Бизнес: ИИ-аудит объекта недвижимости с реальным Vision-анализом фотографий.
Использует Qwen2 VL 7B Instruct (мультимодальная модель) через Yandex AI Studio —
модель реально видит фотографии и анализирует их содержимое.
Fallback на YandexGPT 5 Pro (текстовый анализ по URL).
Args: POST { image_urls: [str], category?: str, area?: float, city?: str, deal?: str }
Returns: { ok, audit: { score, condition, building_class, finishing, ... }, model_used }
"""

import json
import os
import urllib.request
import urllib.error
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')

# AI Studio endpoint — поддерживает все модели включая мультимодальные
AI_STUDIO_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'

# Qwen2 VL — Vision модель в AI Studio (URI строится динамически из folder_id)
VISION_MODEL_NAME = 'qwen2-vl-7b-instruct'
# YandexGPT 5 Pro — текстовый fallback
TEXT_MODEL = 'yandexgpt-5-pro/latest'

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


def _load_keys() -> tuple[str, str]:
    """Берём ключи: сначала AISTUDIO_API_KEY из env, потом из settings БД."""
    # Приоритет: AI Studio ключ из env (самый свежий)
    api_key = os.environ.get('AISTUDIO_API_KEY', '')
    folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
    if api_key:
        return api_key, folder_id
    # Fallback: из БД
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
        return os.environ.get('YANDEX_API_KEY', ''), folder_id


def _call_vision(image_urls: list, prompt_text: str, api_key: str, folder_id: str) -> tuple[str, str]:
    """
    Вызов Qwen2 VL через AI Studio — модель реально видит изображения.
    Передаём до 5 фото как image_url в messages.
    Возвращает (text, model_name) или бросает исключение.
    """
    # Формируем multimodal сообщение: чередуем image_url и финальный text
    content_parts = []
    for url in image_urls[:5]:  # Qwen VL принимает до 5 изображений
        content_parts.append({'type': 'image_url', 'image_url': {'url': url}})
    content_parts.append({'type': 'text', 'text': prompt_text})

    model_uri = f'ds://{folder_id}/{VISION_MODEL_NAME}' if folder_id else VISION_MODEL_NAME
    payload = {
        'modelUri': model_uri,
        'completionOptions': {
            'stream': False,
            'temperature': 0.1,
            'maxTokens': '2500',
        },
        'messages': [
            {
                'role': 'user',
                'content': content_parts,
            }
        ],
    }

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Api-Key {api_key}',
    }
    if folder_id:
        headers['x-folder-id'] = folder_id

    req = urllib.request.Request(
        AI_STUDIO_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers=headers,
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    alts = data.get('result', {}).get('alternatives', [])
    if not alts:
        raise ValueError(f'Пустой ответ Vision: {json.dumps(data)[:300]}')
    return alts[0]['message']['text'], 'qwen2-vl-7b-instruct'


def _call_text(image_urls: list, prompt_text: str, api_key: str, folder_id: str) -> tuple[str, str]:
    """
    Fallback: YandexGPT 5 Pro — текстовый анализ (не видит фото, но даёт оценку по типу объекта).
    """
    model_uri = f'gpt://{folder_id}/{TEXT_MODEL}' if folder_id else TEXT_MODEL
    payload = {
        'modelUri': model_uri,
        'completionOptions': {'stream': False, 'temperature': 0.1, 'maxTokens': '2000'},
        'messages': [{'role': 'user', 'text': prompt_text}],
    }
    headers = {'Content-Type': 'application/json', 'Authorization': f'Api-Key {api_key}'}
    if folder_id:
        headers['x-folder-id'] = folder_id

    req = urllib.request.Request(
        AI_STUDIO_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers=headers,
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    alts = data.get('result', {}).get('alternatives', [])
    if not alts:
        raise ValueError(f'Пустой ответ GPT: {json.dumps(data)[:200]}')
    return alts[0]['message']['text'], 'yandexgpt-5-pro'


def _build_vision_prompt(category: str, area: float, city: str, deal: str) -> str:
    """Промпт для мультимодальной модели — она реально смотрит на фото."""
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

    return (
        f'Ты — эксперт по коммерческой недвижимости России. Внимательно изучи все приложенные фотографии.\n\n'
        f'Объект: {cat_ru}{area_hint}, {city_hint}, операция: {deal_ru}.\n\n'
        f'На основе того что ВИДИШЬ на фотографиях, дай профессиональный аудит.\n'
        f'Опирайся на реальное состояние помещения, отделку, освещение, планировку, общий вид.\n\n'
        f'Верни ТОЛЬКО валидный JSON без markdown:\n'
        '{{\n'
        '  "score": <целое 1-10, общая оценка по фото>,\n'
        '  "condition": "<черновая|без отделки|требует ремонта|удовлетворительное|хорошее|евроремонт|люкс>",\n'
        '  "building_class": "<A+|A|B+|B|C|не определён>",\n'
        '  "finishing": "<без отделки|черновая|предчистовая|косметический ремонт|евроремонт|дизайнерский>",\n'
        '  "price_per_m2_min": <целое ₽/м², 0 если не применимо>,\n'
        '  "price_per_m2_max": <целое ₽/м²>,\n'
        '  "rent_per_m2_min": <целое ₽/м²/мес, 0 если не применимо>,\n'
        '  "rent_per_m2_max": <целое ₽/м²/мес>,\n'
        '  "pros": ["видимое преимущество 1", "преимущество 2"],\n'
        '  "cons": ["видимый недостаток 1", "недостаток 2"],\n'
        '  "recommendations": ["конкретная рекомендация 1", "рекомендация 2"],\n'
        '  "photo_tips": ["совет по съёмке 1", "совет 2"],\n'
        '  "what_i_see": "краткое описание что видно на фотографиях",\n'
        '  "summary": "2-3 предложения: оценка состояния и рыночная позиция"\n'
        '}}\n\n'
        f'Цены ориентируй на рынок {city_hint}. Описывай только то, что реально видишь на фото.'
    )


def _build_text_prompt(image_urls: list, category: str, area: float, city: str, deal: str) -> str:
    """Промпт для текстовой модели — fallback без реального Vision."""
    cat_map = {
        'office': 'офис', 'retail': 'торговое помещение', 'warehouse': 'склад',
        'hotel': 'гостиница/отель', 'restaurant': 'ресторан/кафе', 'building': 'здание',
        'land': 'земельный участок', 'other': 'коммерческая недвижимость',
        'free_purpose': 'помещение свободного назначения', 'production': 'производственное помещение',
        'car_service': 'автосервис', 'gab': 'готовый арендный бизнес', 'business': 'готовый бизнес',
    }
    cat_ru = cat_map.get(category, 'коммерческая недвижимость')
    area_hint = f', площадь {int(area)} м²' if area else ''
    city_hint = city or 'Краснодар'
    deal_ru = {'sale': 'продажа', 'rent': 'аренда'}.get(deal, 'продажа/аренда')
    urls_block = '\n'.join(f'  Фото {i+1}: {u}' for i, u in enumerate(image_urls[:10]))

    return (
        f'Ты — эксперт по коммерческой недвижимости России.\n\n'
        f'Объект: {cat_ru}{area_hint}, {city_hint}, операция: {deal_ru}.\n'
        f'Ссылки на фотографии ({len(image_urls)} шт.):\n{urls_block}\n\n'
        f'Дай профессиональную оценку объекта на основе его типа и рынка {city_hint}.\n\n'
        f'Верни ТОЛЬКО валидный JSON без markdown:\n'
        '{{\n'
        '  "score": <целое 1-10>,\n'
        '  "condition": "<черновая|без отделки|требует ремонта|удовлетворительное|хорошее|евроремонт|люкс>",\n'
        '  "building_class": "<A+|A|B+|B|C|не определён>",\n'
        '  "finishing": "<без отделки|черновая|предчистовая|косметический ремонт|евроремонт|дизайнерский>",\n'
        '  "price_per_m2_min": <целое ₽/м², 0 если не применимо>,\n'
        '  "price_per_m2_max": <целое ₽/м²>,\n'
        '  "rent_per_m2_min": <целое ₽/м²/мес, 0 если не применимо>,\n'
        '  "rent_per_m2_max": <целое ₽/м²/мес>,\n'
        '  "pros": ["преимущество 1", "преимущество 2"],\n'
        '  "cons": ["недостаток 1"],\n'
        '  "recommendations": ["рекомендация 1", "рекомендация 2"],\n'
        '  "photo_tips": ["совет по фото 1"],\n'
        '  "what_i_see": "",\n'
        '  "summary": "2-3 предложения об объекте"\n'
        '}}\n\n'
        f'Цены ориентируй на рынок {city_hint}.'
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

    image_urls = body.get('image_urls') or []
    if not image_urls and body.get('image_url'):
        image_urls = [body['image_url']]
    image_urls = [str(u).strip() for u in image_urls if u and str(u).strip()]

    if not image_urls:
        return _err(400, 'image_urls is required')

    api_key, folder_id = _load_keys()
    if not api_key:
        return _err(500, 'API-ключ не настроен: добавьте AISTUDIO_API_KEY в секреты')

    category = str(body.get('category') or 'other').lower()
    area = float(body.get('area') or 0)
    city = str(body.get('city') or 'Краснодар')
    deal = str(body.get('deal') or 'sale').lower()

    # Пробуем Vision (Qwen2 VL) — видит фото
    raw = ''
    model_used = ''
    try:
        vision_prompt = _build_vision_prompt(category, area, city, deal)
        raw, model_used = _call_vision(image_urls, vision_prompt, api_key, folder_id)
        print(f'[photo-audit] Vision OK ({model_used}), фото: {len(image_urls)}')
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        print(f'[photo-audit] Vision HTTP {e.code}: {err_body[:300]} — fallback на GPT')
    except Exception as e:
        print(f'[photo-audit] Vision error: {e} — fallback на GPT')

    # Fallback на YandexGPT 5 Pro если Vision недоступен
    if not raw:
        try:
            text_prompt = _build_text_prompt(image_urls, category, area, city, deal)
            raw, model_used = _call_text(image_urls, text_prompt, api_key, folder_id)
            print(f'[photo-audit] Text fallback OK ({model_used})')
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='replace')
            print(f'[photo-audit] Text HTTP {e.code}: {err_body}')
            return _err(502, f'Ошибка ИИ {e.code}: {err_body[:400]}')
        except Exception as e:
            print(f'[photo-audit] Text error: {e}')
            return _err(502, f'Ошибка анализа: {str(e)[:300]}')

    try:
        result = _parse_json(raw)
    except Exception:
        print(f'[photo-audit] JSON parse error, raw: {raw[:300]}')
        return _err(502, f'Не удалось разобрать ответ: {raw[:200]}')

    # Санитизация
    result['score'] = max(1, min(10, int(result.get('score') or 5)))
    for lst in ('pros', 'cons', 'recommendations', 'photo_tips'):
        result[lst] = [str(x) for x in (result.get(lst) or [])][:4]
    result['condition'] = str(result.get('condition') or 'не определён')
    result['building_class'] = str(result.get('building_class') or 'не определён')
    result['finishing'] = str(result.get('finishing') or '')
    result['summary'] = str(result.get('summary') or '')[:500]
    result['what_i_see'] = str(result.get('what_i_see') or '')[:300]

    return _ok({
        'ok': True,
        'audit': result,
        'photos_analyzed': len(image_urls),
        'model_used': model_used,
        'vision_enabled': model_used == 'qwen2-vl-7b-instruct',
    })