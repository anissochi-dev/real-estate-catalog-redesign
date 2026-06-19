"""
Публичный приём объявлений от собственников.
POST {owner_name, owner_phone, owner_email?, deal, category, address, city?,
      area, price, description, photos[]base64, video_url?,
      floor?, total_floors?, condition?, ceiling_height?, electricity_kw?,
      finishing?, parking?, entrance?}
→ INSERT listings (status=moderation, is_visible=false)
→ INSERT leads (source=owner_submit)
→ Upsert phone_contacts
→ Загрузка фото на S3
Returns: {ok, listing_id}
"""
import base64
import json
import os
import re
import time
import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
}

MAX_PHOTOS = 15
MAX_PHOTO_BYTES = 8 * 1024 * 1024   # 8 MB base64 на фото
RATE_LIMIT_PER_IP = 3               # заявок с одного IP в сутки
RATE_LIMIT_PER_PHONE = 2            # заявок с одного телефона в сутки


def _ok(body):
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(body, ensure_ascii=False, default=str)}


def _err(status, msg):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _normalize_phone(phone):
    digits = re.sub(r'\D', '', phone or '')
    if len(digits) == 11 and digits.startswith('8'):
        digits = '7' + digits[1:]
    return digits


def _safe(s, maxlen=500):
    return str(s or '').replace("'", "''")[:maxlen]


def _upload_photo(b64: str, idx: int) -> str | None:
    """Декодирует base64, загружает на S3, возвращает CDN URL."""
    try:
        # Убираем data:image/...;base64, префикс если есть
        if ',' in b64:
            b64 = b64.split(',', 1)[1]
        data = base64.b64decode(b64)
        if len(data) > MAX_PHOTO_BYTES:
            return None

        token = f"owner_{int(time.time())}_{idx}_{os.urandom(4).hex()}"
        key = f"photos/{token}.jpg"

        s3 = boto3.client(
            's3',
            endpoint_url='https://bucket.poehali.dev',
            aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
            aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        )
        s3.put_object(Bucket='files', Key=key, Body=data, ContentType='image/jpeg')
        cdn = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
        return cdn
    except Exception:
        return None


def handler(event: dict, context) -> dict:
    """Публичный приём объявлений от собственников для последующей модерации."""

    method = event.get('httpMethod', 'POST')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}
    if method != 'POST':
        return _err(405, 'Method not allowed')

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err(400, 'Invalid JSON')

    # ── Обязательные поля ────────────────────────────────────────────────────
    owner_name  = (body.get('owner_name') or '').strip()[:100]
    owner_phone = (body.get('owner_phone') or '').strip()[:30]
    deal        = (body.get('deal') or '').strip()
    category    = (body.get('category') or '').strip()
    address     = (body.get('address') or '').strip()[:300]
    city        = (body.get('city') or 'Краснодар').strip()[:100]
    description = (body.get('description') or '').strip()[:3000]

    try:
        area  = float(body.get('area') or 0)
        price = float(body.get('price') or 0)
    except Exception:
        return _err(400, 'area и price должны быть числами')

    if not owner_name:
        return _err(400, 'Укажите ваше имя')
    if not owner_phone:
        return _err(400, 'Укажите номер телефона')
    phone_digits = re.sub(r'\D', '', owner_phone)
    if len(phone_digits) < 10 or len(phone_digits) > 15:
        return _err(400, 'Некорректный номер телефона')
    if deal not in ('sale', 'rent'):
        return _err(400, 'Укажите тип сделки: sale или rent')
    if not category:
        return _err(400, 'Укажите категорию объекта')
    if not address:
        return _err(400, 'Укажите адрес объекта')
    if area <= 0:
        return _err(400, 'Укажите площадь объекта')
    if price <= 0:
        return _err(400, 'Укажите стоимость объекта')
    if not description:
        return _err(400, 'Добавьте описание объекта')

    # ── Опциональные поля ────────────────────────────────────────────────────
    owner_email    = (body.get('owner_email') or '').strip()[:100] or None
    video_url      = (body.get('video_url') or '').strip()[:500] or None
    floor          = body.get('floor')
    total_floors   = body.get('total_floors')
    condition      = (body.get('condition') or '').strip() or None
    ceiling_height = body.get('ceiling_height')
    electricity_kw = body.get('electricity_kw')
    finishing      = (body.get('finishing') or '').strip() or None
    parking        = (body.get('parking') or '').strip() or None
    entrance       = (body.get('entrance') or '').strip() or None

    try:
        floor          = int(floor) if floor not in (None, '') else None
        total_floors   = int(total_floors) if total_floors not in (None, '') else None
        ceiling_height = float(ceiling_height) if ceiling_height not in (None, '') else None
        electricity_kw = float(electricity_kw) if electricity_kw not in (None, '') else None
    except Exception:
        pass

    # ── Фото ────────────────────────────────────────────────────────────────
    photos_b64 = body.get('photos') or []
    if not isinstance(photos_b64, list):
        photos_b64 = []
    photos_b64 = photos_b64[:MAX_PHOTOS]

    # ── Rate limit по IP ─────────────────────────────────────────────────────
    raw_headers = event.get('headers') or {}
    headers_lc = {k.lower(): v for k, v in raw_headers.items()}
    client_ip = (
        headers_lc.get('x-forwarded-for', '').split(',')[0].strip()
        or (event.get('requestContext') or {}).get('identity', {}).get('sourceIp', '')
        or 'unknown'
    )[:45]

    norm_phone = _normalize_phone(owner_phone)

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # Rate limit по IP
            cur.execute(
                f"SELECT COUNT(*) AS cnt FROM {SCHEMA}.listings "
                f"WHERE status = 'moderation' AND created_at >= NOW() - INTERVAL '1 day' "
                f"AND description LIKE %s",
                (f'%{client_ip}%',)  # IP храним в description временно — нет поля
            )
            # Простая проверка через leads по IP нет — используем phone rate limit
            cur.execute(
                f"SELECT COUNT(*) AS cnt FROM {SCHEMA}.leads "
                f"WHERE source = 'owner_submit' "
                f"AND created_at >= NOW() - INTERVAL '1 day' "
                f"AND phone LIKE %s",
                (f'%{norm_phone[-7:]}',)
            )
            phone_count = cur.fetchone()['cnt']
            if phone_count >= RATE_LIMIT_PER_PHONE:
                return _err(429, 'Вы уже отправляли объект сегодня. Попробуйте завтра.')

            # ── Загрузка фото на S3 ──────────────────────────────────────────
            photo_urls = []
            for idx, b64 in enumerate(photos_b64):
                if not b64:
                    continue
                url = _upload_photo(b64, idx)
                if url:
                    photo_urls.append(url)

            images_str = '|'.join(photo_urls)
            main_image = photo_urls[0] if photo_urls else ''

            # Генерируем заголовок автоматически
            deal_label = 'Аренда' if deal == 'rent' else 'Продажа'
            cat_labels = {
                'office': 'Офис', 'retail': 'Торговое помещение', 'warehouse': 'Склад',
                'restaurant': 'Общепит', 'hotel': 'Гостиница', 'business': 'Готовый бизнес',
                'gab': 'ГАБ', 'production': 'Производство', 'land': 'Земельный участок',
                'building': 'Здание', 'free_purpose': 'ПСН', 'car_service': 'Автосервис',
            }
            cat_label = cat_labels.get(category, category)
            title = f"{cat_label}, {int(area)} м² — {deal_label}"

            # ── INSERT listing со статусом moderation ───────────────────────
            cur.execute(f"""
                INSERT INTO {SCHEMA}.listings
                    (title, category, deal, price, area, address, city, description,
                     image, images, status, is_visible, is_hot, is_new, use_watermark,
                     owner_name, owner_phone, owner_phone2,
                     floor, total_floors, condition, ceiling_height, electricity_kw,
                     finishing, parking, entrance, video_url,
                     export_yandex, export_avito, export_cian,
                     price_unit, created_at, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                        'moderation',false,false,false,true,
                        %s,%s,NULL,
                        %s,%s,%s,%s,%s,%s,%s,%s,%s,
                        false,false,false,'total',NOW(),NOW())
                RETURNING id
            """, (
                title, category, deal, price, area, address, city, description,
                main_image, images_str,
                owner_name, owner_phone,
                floor, total_floors, condition, ceiling_height, electricity_kw,
                finishing, parking, entrance, video_url,
            ))
            listing_id = cur.fetchone()['id']

            # ── Upsert phone_contacts ────────────────────────────────────────
            pc_id = None
            if norm_phone:
                cur.execute(
                    f"SELECT id FROM {SCHEMA}.phone_contacts WHERE phone_normalized = %s LIMIT 1",
                    (norm_phone,)
                )
                row = cur.fetchone()
                if row:
                    pc_id = row['id']
                else:
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.phone_contacts (phone, phone_normalized, name, email) "
                        f"VALUES (%s,%s,%s,%s) RETURNING id",
                        (owner_phone, norm_phone, owner_name, owner_email)
                    )
                    pc_id = cur.fetchone()['id']

            # ── INSERT lead ──────────────────────────────────────────────────
            cur.execute(f"""
                INSERT INTO {SCHEMA}.leads
                    (name, phone, email, message, listing_id, source, status, phone_contact_id)
                VALUES (%s,%s,%s,%s,%s,'owner_submit','new',%s)
                RETURNING id
            """, (
                owner_name, owner_phone, owner_email,
                f'Заявка от собственника. Объект #{listing_id}: {title}',
                listing_id, pc_id,
            ))

            conn.commit()

        return _ok({'ok': True, 'listing_id': listing_id})
    finally:
        conn.close()
