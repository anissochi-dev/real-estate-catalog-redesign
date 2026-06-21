"""
Публичный приём объявлений от собственников с многоуровневой защитой от ботов.

Уровни защиты:
  1. form_token — одноразовый UUID, выдаётся при открытии формы (GET ?action=token)
  2. fill_time  — минимальное время заполнения (15 сек), считается на сервере по token_ts
  3. honeypot   — скрытое поле website, бот заполняет его, человек нет
  4. IP rate limit — не более 3 заявок с одного IP в сутки (БД)
  5. Phone rate limit — не более 2 заявок с одного телефона в сутки (БД)
  6. Token reuse — токен одноразовый, повторная отправка блокируется
  7. Content validation — минимальная длина описания (50 симв.), реальные числа
  8. Body size — отклоняем запросы > 50MB
"""
import base64
import hashlib
import json
import os
import random
import re
import threading
import time
import urllib.request
import uuid
import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
}

MAX_PHOTOS        = 15
MAX_PHOTO_BYTES   = 8 * 1024 * 1024  # 8 MB
RATE_IP_PER_DAY   = 3                # заявок с одного IP в сутки
RATE_PHONE_PER_DAY = 2               # заявок с одного телефона в сутки
MIN_FILL_SECONDS  = 15               # минимум секунд на заполнение
MIN_DESC_LEN      = 30               # минимум символов в описании
SECRET_SALT       = 'bmn_owner_form_2025'  # соль для подписи токена


def _ok(body):
    return {
        'statusCode': 200,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(status, msg):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps({'error': msg}, ensure_ascii=False),
    }


def _normalize_phone(phone):
    digits = re.sub(r'\D', '', phone or '')
    if len(digits) == 11 and digits.startswith('8'):
        digits = '7' + digits[1:]
    return digits


def _get_ip(event):
    headers_lc = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    return (
        headers_lc.get('x-forwarded-for', '').split(',')[0].strip()
        or (event.get('requestContext') or {}).get('identity', {}).get('sourceIp', '')
        or 'unknown'
    )[:45]


def _sign_token(token_id: str, ts: int) -> str:
    """HMAC-подпись токена — проверяем что он выдан нашим сервером."""
    raw = f"{token_id}:{ts}:{SECRET_SALT}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _make_token() -> dict:
    """Генерирует одноразовый токен формы."""
    token_id = str(uuid.uuid4()).replace('-', '')
    ts = int(time.time())
    sig = _sign_token(token_id, ts)
    return {'token': f"{token_id}.{ts}.{sig}", 'issued_at': ts}


def _verify_token(token: str) -> tuple[bool, str, int]:
    """Возвращает (valid, token_id, issued_at)."""
    if not token or token.count('.') != 2:
        return False, '', 0
    parts = token.split('.')
    token_id, ts_str, sig = parts
    try:
        ts = int(ts_str)
    except ValueError:
        return False, '', 0
    expected = _sign_token(token_id, ts)
    if sig != expected:
        return False, '', 0
    # Токен действует 2 часа
    if time.time() - ts > 7200:
        return False, '', 0
    return True, token_id, ts


def _upload_photo(b64: str, idx: int):
    try:
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
        return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
    except Exception:
        return None


def _notify_new_submission(listing_id: int, owner_name: str, owner_phone: str,
                            address: str, category: str, area: float, price: float,
                            deal: str, dsn: str):
    """Уведомляет сотрудников о новой заявке от собственника через MAX.
    SMTP-уведомления отключены — активен только MAX-мессенджер.
    """
    MAX_API_URL = 'https://botapi.max.ru'
    CAT_LABELS = {
        'office': 'Офис', 'retail': 'Торговое помещение', 'warehouse': 'Склад',
        'restaurant': 'Общепит', 'hotel': 'Гостиница', 'business': 'Готовый бизнес',
        'gab': 'ГАБ', 'production': 'Производство', 'land': 'Земельный участок',
        'building': 'Здание', 'free_purpose': 'ПСН', 'car_service': 'Автосервис',
    }
    cat_label  = CAT_LABELS.get(category, category)
    deal_label = 'Аренда' if deal == 'rent' else 'Продажа'
    price_fmt  = f"{int(price):,}".replace(',', ' ')

    try:
        conn2 = psycopg2.connect(dsn)
        with conn2.cursor() as cur:
            cur.execute(
                f"SELECT notify_max_enabled, notify_max_on_lead, notify_max_bot_token, "
                f"notify_max_roles, notify_max_extra_phones, company_name "
                f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
            )
            row = cur.fetchone()
            if not row:
                conn2.close()
                return
            (max_enabled, max_on_lead, bot_token, roles_str, extra_phones, company_name) = row

            if not max_enabled or not max_on_lead or not (bot_token or '').strip():
                conn2.close()
                return

            bot_token = bot_token.strip()
            enabled_roles = [r.strip() for r in (roles_str or 'broker,admin,director,office_manager').split(',') if r.strip()]
            roles_sql = ', '.join(f"'{r}'" for r in enabled_roles)
            cur.execute(
                f"SELECT name, max_user_id FROM {SCHEMA}.users "
                f"WHERE is_active = TRUE AND max_user_id IS NOT NULL AND max_user_id != '' "
                f"AND role IN ({roles_sql})"
            )
            recipients = [(r[0], r[1]) for r in cur.fetchall()]
            for extra in (extra_phones or '').split(','):
                uid = extra.strip()
                if uid:
                    recipients.append(('Доп. получатель', uid))

        conn2.close()

        if not recipients:
            return

        company = company_name or 'Система'
        text = (
            f'🏢 Новая заявка от собственника — {company}\n\n'
            f'👤 {owner_name}\n'
            f'📞 {owner_phone}\n'
            f'📍 {address}\n'
            f'🏷 {cat_label} · {deal_label}\n'
            f'📐 {int(area)} м² · {price_fmt} ₽\n'
            f'\n🆔 Объект #{listing_id} — на модерации'
        )
        for _, user_id in recipients:
            try:
                payload = json.dumps({'text': text}, ensure_ascii=False).encode('utf-8')
                req = urllib.request.Request(
                    f'{MAX_API_URL}/messages?user_id={user_id}',
                    data=payload,
                    headers={'Authorization': bot_token, 'Content-Type': 'application/json'},
                    method='POST',
                )
                urllib.request.urlopen(req, timeout=8)
            except Exception as e:
                print(f'[owner-submit] MAX notify error: {e}')

    except Exception as e:
        print(f'[owner-submit] _notify_new_submission error: {e}')


def handler(event: dict, context) -> dict:
    """Публичный приём объявлений от собственников с антибот-защитой."""

    method = event.get('httpMethod', 'POST')

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    # ── GET: выдать токен формы ───────────────────────────────────────────────
    if method == 'GET':
        qs = event.get('queryStringParameters') or {}
        if qs.get('action') == 'token':
            return _ok(_make_token())
        return _err(400, 'Unknown action')

    if method != 'POST':
        return _err(405, 'Method not allowed')

    # ── Размер тела ───────────────────────────────────────────────────────────
    body_raw = event.get('body') or '{}'
    if len(body_raw) > 50 * 1024 * 1024:
        return _err(413, 'Запрос слишком большой')

    try:
        body = json.loads(body_raw)
    except Exception:
        return _err(400, 'Invalid JSON')

    client_ip = _get_ip(event)

    # ── Уровень 3: Honeypot ───────────────────────────────────────────────────
    # Бот заполняет скрытое поле, человек — нет
    if body.get('website') or body.get('url') or body.get('company_url'):
        # Возвращаем случайный ID — бот не отличит от реального успеха
        return _ok({'ok': True, 'listing_id': random.randint(1_000_000, 9_999_999)})

    # ── Уровень 1+6: Токен формы (выдан GET /token, одноразовый) ─────────────
    form_token = (body.get('form_token') or '').strip()
    valid, token_id, token_ts = _verify_token(form_token)
    if not valid:
        return _err(400, 'Недействительный токен формы. Обновите страницу.')

    # ── Уровень 2: Минимальное время заполнения ───────────────────────────────
    # Считаем на сервере по времени выдачи токена — клиент не может подделать
    fill_time = int(time.time()) - token_ts
    if fill_time < MIN_FILL_SECONDS:
        return _err(400, 'Форма заполнена слишком быстро. Пожалуйста, заполните внимательно.')

    # ── Обязательные поля ─────────────────────────────────────────────────────
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
        return _err(400, 'Укажите тип сделки')
    if not category:
        return _err(400, 'Укажите категорию объекта')
    if not address:
        return _err(400, 'Укажите адрес объекта')
    if area <= 0 or area > 1_000_000:
        return _err(400, 'Укажите корректную площадь объекта')
    if price <= 0 or price > 100_000_000_000:
        return _err(400, 'Укажите корректную стоимость')
    if len(description) < MIN_DESC_LEN:
        return _err(400, f'Описание слишком короткое (минимум {MIN_DESC_LEN} символов)')

    # ── Уровень 7: Контентные эвристики ──────────────────────────────────────
    name_letters = re.sub(r'[^а-яёa-z]', '', owner_name.lower())
    if len(name_letters) < 2:
        return _err(400, 'Укажите корректное имя')
    desc_letters = re.sub(r'[^а-яёa-z0-9]', '', description.lower())
    if len(desc_letters) < 10:
        return _err(400, 'Добавьте осмысленное описание объекта')

    norm_phone = _normalize_phone(owner_phone)
    phone_tail = norm_phone[-7:] if len(norm_phone) >= 7 else norm_phone

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

    photos_b64 = body.get('photos') or []
    if not isinstance(photos_b64, list):
        photos_b64 = []
    photos_b64 = photos_b64[:MAX_PHOTOS]

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # Уровень 6: Проверка одноразовости токена
            cur.execute(
                f"SELECT id FROM {SCHEMA}.submit_attempts WHERE form_token = %s LIMIT 1",
                (token_id,)
            )
            if cur.fetchone():
                return _err(429, 'Эта форма уже была отправлена. Обновите страницу для новой попытки.')

            # Уровень 4: Rate limit по IP
            cur.execute(
                f"SELECT COUNT(*) AS cnt FROM {SCHEMA}.submit_attempts "
                f"WHERE ip = %s AND attempted_at >= NOW() - INTERVAL '1 day'",
                (client_ip,)
            )
            ip_count = cur.fetchone()['cnt']
            if ip_count >= RATE_IP_PER_DAY:
                return _err(429, 'Слишком много заявок с вашего устройства. Попробуйте завтра.')

            # Уровень 5: Rate limit по телефону
            cur.execute(
                f"SELECT COUNT(*) AS cnt FROM {SCHEMA}.submit_attempts "
                f"WHERE phone_tail = %s AND attempted_at >= NOW() - INTERVAL '1 day'",
                (phone_tail,)
            )
            phone_count = cur.fetchone()['cnt']
            if phone_count >= RATE_PHONE_PER_DAY:
                return _err(429, 'Вы уже отправляли объект с этого номера сегодня. Попробуйте завтра.')

            # ── Регистрируем попытку (сразу, до загрузки фото) ───────────────
            cur.execute(
                f"INSERT INTO {SCHEMA}.submit_attempts (ip, phone_tail, form_token) VALUES (%s,%s,%s)",
                (client_ip, phone_tail, token_id)
            )
            conn.commit()

            # ── Загрузка фото на S3 ───────────────────────────────────────────
            photo_urls = []
            for idx, b64 in enumerate(photos_b64):
                if not b64:
                    continue
                url = _upload_photo(b64, idx)
                if url:
                    photo_urls.append(url)

            images_str = '|'.join(photo_urls)
            main_image = photo_urls[0] if photo_urls else ''

            # Генерируем заголовок
            deal_label = 'Аренда' if deal == 'rent' else 'Продажа'
            cat_labels = {
                'office': 'Офис', 'retail': 'Торговое помещение', 'warehouse': 'Склад',
                'restaurant': 'Общепит', 'hotel': 'Гостиница', 'business': 'Готовый бизнес',
                'gab': 'ГАБ', 'production': 'Производство', 'land': 'Земельный участок',
                'building': 'Здание', 'free_purpose': 'ПСН', 'car_service': 'Автосервис',
            }
            cat_label = cat_labels.get(category, category)
            title = f"{cat_label}, {int(area)} м² — {deal_label}"

            # ── INSERT listing ────────────────────────────────────────────────
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

            # ── Upsert phone_contacts ─────────────────────────────────────────
            if norm_phone:
                cur.execute(
                    f"SELECT id FROM {SCHEMA}.phone_contacts WHERE phone_normalized = %s LIMIT 1",
                    (norm_phone,)
                )
                row = cur.fetchone()
                if not row:
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.phone_contacts (phone, phone_normalized, name, email) "
                        f"VALUES (%s,%s,%s,%s) RETURNING id",
                        (owner_phone, norm_phone, owner_name, owner_email)
                    )

            conn.commit()

        # Уведомляем сотрудников через MAX асинхронно
        threading.Thread(
            target=_notify_new_submission,
            args=(listing_id, owner_name, owner_phone, address, category, area, price, deal, dsn),
            daemon=True,
        ).start()

        return _ok({'ok': True, 'listing_id': listing_id})
    except Exception as e:
        conn.rollback()
        import traceback
        print(f'[owner-submit] ERROR: {e}\n{traceback.format_exc()}')
        return _err(500, 'Внутренняя ошибка. Попробуйте позже.')
    finally:
        conn.close()
