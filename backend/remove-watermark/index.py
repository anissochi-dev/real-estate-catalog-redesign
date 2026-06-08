"""
Удаление водяного знака/логотипа с фотографий объектов недвижимости.
Алгоритм:
  1. Яндекс Vision (classifyObject / detectObject) — находит логотипы/водяные знаки на фото
  2. PIL — размывает найденные области (inpaint-lite: размытие + восстановление фона)
  3. Fallback: если Vision не нашёл — возвращает оригинал
Args: POST { url: str, sensitivity?: float (0.2–0.9, default 0.45) }
Returns: { url: str, detected: bool, regions: [{x,y,w,h}] }
"""

import base64
import io
import json
import os
import urllib.request
import urllib.error
import secrets
import boto3

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')
VISION_URL = 'https://vision.api.cloud.yandex.net/vision/v1/batchAnalyze'
S3_ENDPOINT = 'https://bucket.poehali.dev'
S3_BUCKET = 'files'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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


def _get_keys():
    """API-ключ и folder_id из env или БД."""
    api_key = os.environ.get('AISTUDIO_API_KEY') or os.environ.get('YANDEX_API_KEY', '')
    folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
    if api_key and folder_id:
        return api_key, folder_id
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
                row = cur.fetchone() or {}
                return (
                    api_key or row.get('yandex_api_key') or '',
                    folder_id or row.get('yandex_folder_id') or '',
                )
    except Exception:
        return api_key, folder_id


def _download_image(url: str) -> bytes:
    """Скачиваем фото по URL."""
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read()


def _vision_detect_logos(image_b64: str, api_key: str, folder_id: str) -> list:
    """
    Яндекс Vision — ищем логотипы и текст (водяные знаки).
    Возвращает список регионов [{x, y, w, h, confidence}].
    """
    payload = {
        'folderId': folder_id,
        'analyzeSpecs': [
            {
                'content': image_b64,
                'features': [
                    {
                        'type': 'OBJECT_DETECTION',
                        'objectDetectionConfig': {
                            'objectTypes': ['logo', 'watermark'],
                            'maxAnnotations': 20,
                        }
                    },
                    {
                        'type': 'TEXT_DETECTION',
                        'textDetectionConfig': {
                            'languageCodes': ['ru', 'en'],
                        }
                    }
                ],
            }
        ],
    }
    headers = {
        'Authorization': f'Api-Key {api_key}',
        'Content-Type': 'application/json',
    }
    if folder_id:
        headers['x-folder-id'] = folder_id

    req = urllib.request.Request(
        VISION_URL,
        data=json.dumps(payload).encode(),
        headers=headers,
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode())

    results = (data.get('results') or [{}])[0]
    regions = []

    # Обрабатываем обнаруженные объекты (логотипы/вотермарки)
    for ann in results.get('results', []):
        obj_ann = ann.get('objectAnnotations', {})
        for obj in obj_ann.get('objects', []):
            confidence = obj.get('confidence', 0)
            if confidence < 0.3:
                continue
            vertices = (obj.get('boundingBox') or {}).get('vertices', [])
            if len(vertices) >= 2:
                xs = [v.get('x', 0) for v in vertices]
                ys = [v.get('y', 0) for v in vertices]
                regions.append({
                    'x': min(xs), 'y': min(ys),
                    'w': max(xs) - min(xs),
                    'h': max(ys) - min(ys),
                    'confidence': confidence,
                    'source': 'object',
                })

    # Обрабатываем текст — ищем блоки которые выглядят как водяной знак
    # (маленький текст на краях изображения)
    for ann in results.get('results', []):
        text_ann = ann.get('textAnnotations', {})
        for block in text_ann.get('blocks', []):
            vertices = (block.get('boundingBox') or {}).get('vertices', [])
            if len(vertices) >= 2:
                xs = [v.get('x', 0) for v in vertices]
                ys = [v.get('y', 0) for v in vertices]
                regions.append({
                    'x': min(xs), 'y': min(ys),
                    'w': max(xs) - min(xs),
                    'h': max(ys) - min(ys),
                    'confidence': 0.6,
                    'source': 'text',
                })

    return regions


def _vision_detect_corner_logos(image_bytes: bytes, sensitivity: float) -> list:
    """
    Fallback без Vision API: эвристика — ищем подозрительно яркие/контрастные
    области в углах изображения (типичное место водяных знаков).
    """
    try:
        from PIL import Image, ImageStat
        import numpy as np
    except ImportError:
        return []

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert('RGBA')
        w, h = img.size
        corner_size = max(int(min(w, h) * 0.25), 80)
        regions = []

        corners = [
            (0, 0),
            (w - corner_size, 0),
            (0, h - corner_size),
            (w - corner_size, h - corner_size),
        ]

        for cx, cy in corners:
            crop = img.crop((cx, cy, cx + corner_size, cy + corner_size))
            # Анализируем альфа-канал — водяные знаки часто полупрозрачные
            alpha = crop.split()[3] if crop.mode == 'RGBA' else None
            if alpha:
                stat = ImageStat.Stat(alpha)
                mean_alpha = stat.mean[0]
                # Если средняя прозрачность в углу нетипична (не 0 и не 255) — вероятно вотермарк
                if 30 < mean_alpha < 220:
                    regions.append({
                        'x': cx, 'y': cy,
                        'w': corner_size, 'h': corner_size,
                        'confidence': 0.5,
                        'source': 'heuristic',
                    })

        return regions
    except Exception:
        return []


def _remove_regions_pil(image_bytes: bytes, regions: list, sensitivity: float) -> bytes:
    """
    Удаляем найденные регионы через PIL:
    1. Сильное размытие области (GaussianBlur)
    2. Смешение с соседними пикселями (inpaint-lite)
    3. Сохраняем с качеством 92
    """
    try:
        from PIL import Image, ImageFilter
    except ImportError:
        return image_bytes

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        w, h = img.size

        for region in regions:
            if region.get('confidence', 0) < (1 - sensitivity):
                continue

            # Добавляем padding 15% для захвата краёв знака
            pad_x = int(region['w'] * 0.15)
            pad_y = int(region['h'] * 0.15)
            x1 = max(0, region['x'] - pad_x)
            y1 = max(0, region['y'] - pad_y)
            x2 = min(w, region['x'] + region['w'] + pad_x)
            y2 = min(h, region['y'] + region['h'] + pad_y)

            if x2 <= x1 or y2 <= y1:
                continue

            # Вырезаем область и берём "фон" — усредняем соседние полосы
            border = 20
            top_strip    = img.crop((x1, max(0, y1 - border), x2, y1)) if y1 > 0 else None
            bottom_strip = img.crop((x1, y2, x2, min(h, y2 + border))) if y2 < h else None
            left_strip   = img.crop((max(0, x1 - border), y1, x1, y2)) if x1 > 0 else None
            right_strip  = img.crop((x2, y1, min(w, x2 + border), y2)) if x2 < w else None

            # Создаём патч на основе размытого окружения
            region_crop = img.crop((x1, y1, x2, y2))
            rw, rh = region_crop.size

            # Сильное размытие (имитация inpaint)
            blurred = region_crop.filter(ImageFilter.GaussianBlur(radius=max(rw, rh) // 4))

            # Если есть соседние полосы — смешиваем с ними для плавного перехода
            bg_strips = [s for s in [top_strip, bottom_strip, left_strip, right_strip] if s]
            if bg_strips:
                from PIL import ImageOps
                import functools

                def avg_color(strip):
                    try:
                        strip_r = strip.resize((1, 1), Image.LANCZOS)
                        return strip_r.getpixel((0, 0))[:3]
                    except Exception:
                        return (128, 128, 128)

                colors = [avg_color(s) for s in bg_strips]
                avg = tuple(int(sum(c[i] for c in colors) / len(colors)) for i in range(3))
                # Создаём однотонный патч цвета фона и смешиваем с размытым
                bg_patch = Image.new('RGB', (rw, rh), avg)
                from PIL import Image as PILImage
                mixed = PILImage.blend(blurred, bg_patch, alpha=0.6)
                img.paste(mixed, (x1, y1))
            else:
                img.paste(blurred, (x1, y1))

        out = io.BytesIO()
        img.save(out, format='JPEG', quality=92, optimize=True)
        return out.getvalue()

    except Exception as e:
        print(f'[remove-watermark] PIL error: {e}')
        return image_bytes


def _upload_s3(image_bytes: bytes) -> str:
    """Загружаем обработанное фото в S3, возвращаем CDN URL."""
    s3 = boto3.client(
        's3',
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )
    key = f'photos/nowm_{secrets.token_urlsafe(12)}.jpg'
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=image_bytes, ContentType='image/jpeg')
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    if event.get('httpMethod') != 'POST':
        return _err(405, 'Method not allowed')

    # Авторизация (только сотрудники)
    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
    if not token:
        return _err(401, 'Требуется авторизация')

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err(400, 'Invalid JSON')

    url = (body.get('url') or '').strip()
    if not url:
        return _err(400, 'url обязателен')

    sensitivity = float(body.get('sensitivity') or 0.45)
    sensitivity = max(0.1, min(0.95, sensitivity))

    api_key, folder_id = _get_keys()

    # 1. Скачиваем фото
    try:
        image_bytes = _download_image(url)
        print(f'[remove-watermark] скачано {len(image_bytes)} байт: {url[:80]}')
    except Exception as e:
        return _err(502, f'Не удалось скачать фото: {str(e)[:200]}')

    # 2. Конвертируем в base64 для Vision
    image_b64 = base64.b64encode(image_bytes).decode()

    # 3. Яндекс Vision — ищем логотипы и текст
    regions = []
    vision_used = False
    if api_key and folder_id:
        try:
            regions = _vision_detect_logos(image_b64, api_key, folder_id)
            vision_used = True
            print(f'[remove-watermark] Vision нашёл {len(regions)} регионов')
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='replace')
            print(f'[remove-watermark] Vision HTTP {e.code}: {err_body[:200]}')
        except Exception as e:
            print(f'[remove-watermark] Vision error: {e}')

    # 4. Fallback эвристика если Vision ничего не нашёл
    if not regions:
        regions = _vision_detect_corner_logos(image_bytes, sensitivity)
        print(f'[remove-watermark] эвристика нашла {len(regions)} регионов')

    detected = len(regions) > 0

    # 5. Удаляем найденные области
    if detected:
        result_bytes = _remove_regions_pil(image_bytes, regions, sensitivity)
    else:
        result_bytes = image_bytes
        print('[remove-watermark] водяной знак не обнаружен, возвращаем оригинал')

    # 6. Загружаем в S3
    try:
        cdn_url = _upload_s3(result_bytes)
        print(f'[remove-watermark] результат: {cdn_url}')
    except Exception as e:
        return _err(502, f'Ошибка загрузки в S3: {str(e)[:200]}')

    return _ok({
        'ok': True,
        'url': cdn_url,
        'detected': detected,
        'regions': [{'x': r['x'], 'y': r['y'], 'w': r['w'], 'h': r['h']} for r in regions],
        'vision_used': vision_used,
    })
