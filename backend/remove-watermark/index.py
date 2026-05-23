"""
Удаляет водяные знаки с фотографий.
Алгоритм v2: детектирует текст/логотипы через анализ локальной дисперсии и
градиентов, строит точную маску, применяет многопроходный inpainting.
POST {url: str, mask_regions?: list[{x,y,w,h}], sensitivity?: float}
Returns: {url: str, detected: bool}
"""
import io
import json
import os
import uuid
import urllib.request
import urllib.error

import boto3
import psycopg2
import requests
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
CORS = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}


def _ok(body, status=200):
    return {'statusCode': status, 'headers': CORS, 'body': json.dumps(body, ensure_ascii=False)}


def _err(code, msg):
    return _ok({'error': msg}, code)


def _check_auth(token):
    if not token:
        return None
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            t = (token or '').replace("'", "''")[:100]
            cur.execute(
                f"SELECT u.id, u.role FROM {SCHEMA}.sessions s "
                f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
                f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
            )
            return cur.fetchone()
    finally:
        conn.close()


def _build_mask_v2(img: Image.Image, sensitivity: float) -> Image.Image:
    """
    Детектирует водяные знаки через:
    1. Анализ локальной дисперсии — текст/логотипы дают высокую локальную дисперсию
       на однородном фоне
    2. Детекцию краёв + кластеризацию — изолированные кластеры текста
    3. Угловые зоны с аномальной текстурой
    """
    rgb = img.convert('RGB')
    w, h = rgb.size

    arr = np.array(rgb).astype(np.float32)
    gray = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]

    mask_arr = np.zeros((h, w), dtype=np.float32)

    # ── 1. Локальная дисперсия в скользящем окне 15x15 ──────────────────────
    # Водяные знаки — резкий переход пикселей на относительно гладком фоне
    from PIL import ImageFilter as IF
    gray_pil = Image.fromarray(gray.astype(np.uint8))
    blurred = np.array(gray_pil.filter(IF.GaussianBlur(8))).astype(np.float32)
    diff = np.abs(gray - blurred)

    # Нормализуем разницу
    diff_norm = diff / (diff.max() + 1e-6)

    # Threshold зависит от sensitivity (0.1=мягко, 1.0=агрессивно)
    thresh = 0.18 - sensitivity * 0.08  # при 0.35 → ~0.15

    # ── 2. Зоны где дисперсия высокая но окружение однородное ──────────────
    # Это характерно для текста/логотипов на фоне стен/неба
    local_high = diff_norm > thresh

    # Средняя яркость всего фото
    bg_mean = float(np.mean(gray))
    bg_std = float(np.std(gray))

    # Пиксели которые сильно отличаются от фона (логотипы белые/чёрные на цветном)
    bright_anomaly = (gray > bg_mean + bg_std * 2.0) | (gray < bg_mean - bg_std * 2.0)

    combined = local_high & bright_anomaly
    mask_arr[combined] = 1.0

    # ── 3. Угловые зоны — тут чаще всего логотипы ──────────────────────────
    mh = max(80, int(h * 0.22))
    mw = max(150, int(w * 0.28))

    corner_zones = [
        (0, 0, mw, mh),           # верх-лево
        (w - mw, 0, w, mh),       # верх-право
        (0, h - mh, mw, h),       # низ-лево
        (w - mw, h - mh, w, h),   # низ-право
        (0, 0, w, max(40, int(h * 0.08))),          # верхняя полоса
        (0, h - max(40, int(h * 0.08)), w, h),      # нижняя полоса
    ]

    for x0, y0, x1, y1 in corner_zones:
        zone = diff_norm[y0:y1, x0:x1]
        zone_gray = gray[y0:y1, x0:x1]
        if zone.size == 0:
            continue
        zone_thresh = thresh * 0.7  # в углах порог мягче
        suspicious = (zone > zone_thresh) & (
            (zone_gray > bg_mean + bg_std * 1.2) |
            (zone_gray < bg_mean - bg_std * 1.2)
        )
        ratio = float(np.mean(suspicious))
        if ratio > 0.03:  # >3% подозрительных пикселей в зоне
            mask_arr[y0:y1, x0:x1][suspicious] = 1.0

    # ── 4. Морфология: расширяем маску и сглаживаем края ───────────────────
    mask_pil = Image.fromarray((mask_arr * 255).astype(np.uint8))
    mask_pil = mask_pil.filter(IF.MaxFilter(9))   # dilation
    mask_pil = mask_pil.filter(IF.MaxFilter(5))
    mask_pil = mask_pil.filter(IF.GaussianBlur(3))

    return mask_pil


def _inpaint(img: Image.Image, mask: Image.Image) -> Image.Image:
    """
    Многопроходный inpainting:
    1. Пробуем cv2.INPAINT_TELEA (лучший результат)
    2. Fallback: итеративное размытие с учётом соседей
    """
    # Попытка cv2
    try:
        import cv2
        img_arr = np.array(img.convert('RGB'))
        img_bgr = cv2.cvtColor(img_arr, cv2.COLOR_RGB2BGR)
        mask_arr = (np.array(mask.convert('L')) > 128).astype(np.uint8) * 255

        if not np.any(mask_arr > 0):
            return img.convert('RGB')

        # TELEA лучше чем NS для текста
        result = cv2.inpaint(img_bgr, mask_arr, inpaintRadius=7, flags=cv2.INPAINT_TELEA)
        return Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))
    except ImportError:
        pass

    # Fallback: Pillow многопроходный
    result = np.array(img.convert('RGB')).astype(np.float32)
    m = np.array(mask.convert('L')) > 128

    if not np.any(m):
        return Image.fromarray(result.astype(np.uint8))

    for radius in [15, 9, 5, 3]:
        blurred = np.array(
            Image.fromarray(result.astype(np.uint8))
            .filter(ImageFilter.GaussianBlur(radius))
        ).astype(np.float32)
        result[m] = blurred[m]

    return Image.fromarray(result.astype(np.uint8))


def _apply_manual_regions(img: Image.Image, regions: list) -> Image.Image:
    """Закрашивает указанные прямоугольные области через inpainting."""
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    for r in regions:
        x, y, rw, rh = int(r.get('x', 0)), int(r.get('y', 0)), int(r.get('w', 0)), int(r.get('h', 0))
        if rw > 0 and rh > 0:
            draw.rectangle([x, y, x + rw, y + rh], fill=255)
    # Расширяем маску
    mask = mask.filter(ImageFilter.MaxFilter(5))
    return _inpaint(img, mask)


def handler(event: dict, context) -> dict:
    """Удаляет водяные знаки с фото. POST {url, sensitivity?, mask_regions?}"""

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
        }, 'body': ''}

    if event.get('httpMethod') != 'POST':
        return _err(405, 'Method not allowed')

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
    user = _check_auth(token)
    if not user:
        return _err(401, 'Требуется авторизация')
    if user['role'] not in ('admin', 'editor', 'manager'):
        return _err(403, 'Только для сотрудников')

    body = json.loads(event.get('body') or '{}')
    photo_url = (body.get('url') or '').strip()
    sensitivity = float(body.get('sensitivity') or 0.45)
    sensitivity = max(0.1, min(1.0, sensitivity))
    manual_regions = body.get('mask_regions') or []

    if not photo_url:
        return _err(400, 'Не передан url фотографии')

    # Скачиваем фото
    resp = requests.get(photo_url, timeout=20, headers={'User-Agent': 'Mozilla/5.0'})
    resp.raise_for_status()
    img = Image.open(io.BytesIO(resp.content))
    img.load()

    # Ручные области имеют приоритет
    if manual_regions:
        result_img = _apply_manual_regions(img, manual_regions)
        detected = True
    else:
        mask = _build_mask_v2(img, sensitivity)
        mask_arr = np.array(mask.convert('L'))
        detected = bool(np.mean(mask_arr > 128) > 0.002)
        result_img = _inpaint(img, mask) if detected else img.convert('RGB')

    # Сохраняем в S3
    out_buf = io.BytesIO()
    result_img.convert('RGB').save(out_buf, format='WEBP', quality=93, method=4)
    out_buf.seek(0)

    key = f"photos/{uuid.uuid4().hex}_nowm.webp"
    aws_key = os.environ['AWS_ACCESS_KEY_ID']
    s3 = boto3.client('s3', endpoint_url='https://bucket.poehali.dev',
                      aws_access_key_id=aws_key,
                      aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'])
    s3.put_object(Bucket='files', Key=key, Body=out_buf.read(), ContentType='image/webp')

    return _ok({'url': f"https://cdn.poehali.dev/projects/{aws_key}/bucket/{key}", 'detected': detected})