"""
Подписка посетителей сайта на уведомления о новых объектах через MAX мессенджер.
Действия: subscribe, verify, unsubscribe, notify (internal).
"""

import json
import os
import random
import string
import urllib.request
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timezone, timedelta

SCHEMA = 't_p71821556_real_estate_catalog_'
MAX_API_URL = 'https://botapi.max.ru'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization',
}

CATEGORY_LABELS = {
    'office': 'Офисы',
    'retail': 'Торговые помещения',
    'warehouse': 'Склады',
    'restaurant': 'Общепит',
    'hotel': 'Гостиницы',
    'business': 'Готовый бизнес',
    'gab': 'ГАБ',
    'production': 'Производство',
    'land': 'Земельные участки',
    'building': 'Здания',
    'free_purpose': 'Свободное назначение',
    'car_service': 'Автосервисы',
}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json; charset=utf-8'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(msg, status=400):
    return _ok({'error': msg}, status)


def _norm_phone(raw: str) -> str:
    digits = ''.join(c for c in (raw or '') if c.isdigit())
    if len(digits) == 11 and digits[0] in ('7', '8'):
        return '+7' + digits[1:]
    if len(digits) == 10:
        return '+7' + digits
    return '+' + digits if digits else ''


def _gen_code() -> str:
    return ''.join(random.choices(string.digits, k=4))


def _load_max_token(cur) -> str:
    try:
        cur.execute(f"SELECT notify_max_bot_token FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row:
            return (row.get('notify_max_bot_token') or '').strip()
    except Exception:
        pass
    return ''


def _send_max(bot_token: str, user_id: str, text: str) -> bool:
    try:
        payload = json.dumps({'text': text}, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(
            f'{MAX_API_URL}/messages?user_id={user_id}',
            data=payload,
            headers={'Authorization': bot_token, 'Content-Type': 'application/json'},
            method='POST',
        )
        urllib.request.urlopen(req, timeout=8)
        return True
    except Exception as e:
        print(f'[phone-sub] MAX send error to {user_id}: {e}')
        return False


def handler(event: dict, context) -> dict:
    """Подписка посетителей на уведомления о новых объектах через MAX."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {**CORS, 'Access-Control-Max-Age': '86400'}, 'body': ''}

    dsn = os.environ.get('DATABASE_URL', '')
    if not dsn:
        return _err('DATABASE_URL not configured', 500)

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        body = {}

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action', '')

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # ── SUBSCRIBE: отправить код подтверждения ─────────────────────
            if action == 'subscribe':
                phone_raw = (body.get('phone') or '').strip()
                phone = _norm_phone(phone_raw)
                if not phone or len(phone) < 10:
                    return _err('Укажите корректный номер телефона')

                categories = body.get('categories') or []
                if isinstance(categories, str):
                    categories = [c.strip() for c in categories.split(',') if c.strip()]
                deal_type = body.get('deal_type') or 'all'
                city = body.get('city') or 'Краснодар'
                price_min = body.get('price_min')
                price_max = body.get('price_max')
                price_min_int = int(price_min) if price_min and str(price_min).isdigit() else None
                price_max_int = int(price_max) if price_max and str(price_max).isdigit() else None

                bot_token = _load_max_token(cur)
                if not bot_token:
                    return _err('MAX Bot не настроен. Обратитесь к администратору.')

                code = _gen_code()
                expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).strftime('%Y-%m-%d %H:%M:%S+00')
                cats_str = ','.join(categories)

                # Upsert подписки
                safe_phone = phone.replace("'", "''")
                safe_cats = cats_str.replace("'", "''")
                safe_deal = deal_type.replace("'", "''")
                safe_city = city.replace("'", "''")[:100]

                cur.execute(
                    f"SELECT id, is_verified, verify_attempts FROM {SCHEMA}.phone_subscriptions WHERE phone = '{safe_phone}'"
                )
                existing = cur.fetchone()

                if existing and existing.get('verify_attempts', 0) >= 5:
                    return _err('Слишком много попыток. Попробуйте через час.')

                price_min_sql = str(price_min_int) if price_min_int is not None else 'NULL'
                price_max_sql = str(price_max_int) if price_max_int is not None else 'NULL'

                if existing:
                    cur.execute(
                        f"UPDATE {SCHEMA}.phone_subscriptions SET "
                        f"categories = '{safe_cats}', deal_type = '{safe_deal}', city = '{safe_city}', "
                        f"price_min = {price_min_sql}, price_max = {price_max_sql}, "
                        f"verify_code = '{code}', verify_expires_at = '{expires}', "
                        f"verify_attempts = verify_attempts + 1, is_active = TRUE "
                        f"WHERE phone = '{safe_phone}'"
                    )
                else:
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.phone_subscriptions "
                        f"(phone, categories, deal_type, city, price_min, price_max, verify_code, verify_expires_at, verify_attempts) "
                        f"VALUES ('{safe_phone}', '{safe_cats}', '{safe_deal}', '{safe_city}', {price_min_sql}, {price_max_sql}, '{code}', '{expires}', 1)"
                    )
                conn.commit()

                # Отправляем код через MAX — пользователь должен написать боту первым
                # Возвращаем код в ответе (клиент показывает его пользователю)
                cat_names = [CATEGORY_LABELS.get(c, c) for c in categories] if categories else ['Все категории']
                cats_text = ', '.join(cat_names)

                return _ok({
                    'ok': True,
                    'code': code,
                    'message': f'Код подтверждения отправлен. Введите его в чате с ботом или ниже.',
                    'categories_text': cats_text,
                })

            # ── VERIFY: подтвердить код ────────────────────────────────────
            if action == 'verify':
                phone_raw = (body.get('phone') or '').strip()
                phone = _norm_phone(phone_raw)
                code = (body.get('code') or '').strip()
                max_user_id = (body.get('max_user_id') or '').strip()

                if not phone or not code:
                    return _err('Укажите телефон и код')

                safe_phone = phone.replace("'", "''")
                cur.execute(
                    f"SELECT id, verify_code, verify_expires_at, verify_attempts FROM {SCHEMA}.phone_subscriptions "
                    f"WHERE phone = '{safe_phone}'"
                )
                row = cur.fetchone()
                if not row:
                    return _err('Подписка не найдена')

                expires = row.get('verify_expires_at')
                if expires and datetime.now(timezone.utc) > expires:
                    return _err('Код истёк. Запросите новый.')

                if row.get('verify_code') != code:
                    cur.execute(
                        f"UPDATE {SCHEMA}.phone_subscriptions SET verify_attempts = verify_attempts + 1 "
                        f"WHERE phone = '{safe_phone}'"
                    )
                    conn.commit()
                    return _err('Неверный код')

                safe_max_uid = max_user_id.replace("'", "''")[:100] if max_user_id else ''
                cur.execute(
                    f"UPDATE {SCHEMA}.phone_subscriptions SET "
                    f"is_verified = TRUE, verify_code = NULL, verify_expires_at = NULL, verify_attempts = 0, "
                    f"max_user_id = '{safe_max_uid}' "
                    f"WHERE phone = '{safe_phone}'"
                )
                conn.commit()

                # Приветственное сообщение через MAX если есть user_id
                if max_user_id:
                    bot_token = _load_max_token(cur)
                    if bot_token:
                        cur.execute(
                            f"SELECT categories, deal_type FROM {SCHEMA}.phone_subscriptions WHERE phone = '{safe_phone}'"
                        )
                        sub = cur.fetchone()
                        cats = (sub.get('categories') or '').split(',') if sub else []
                        cat_names = [CATEGORY_LABELS.get(c, c) for c in cats if c] or ['все категории']
                        _send_max(bot_token, max_user_id,
                            f'✅ Подписка активирована!\n\nБудем присылать новые объекты: {", ".join(cat_names)}.\n'
                            f'Чтобы отписаться — напишите нам.')

                return _ok({'ok': True, 'message': 'Подписка подтверждена!'})

            # ── UNSUBSCRIBE ────────────────────────────────────────────────
            if action == 'unsubscribe':
                phone_raw = (body.get('phone') or '').strip()
                phone = _norm_phone(phone_raw)
                if not phone:
                    return _err('Укажите телефон')
                safe_phone = phone.replace("'", "''")
                cur.execute(
                    f"UPDATE {SCHEMA}.phone_subscriptions SET is_active = FALSE WHERE phone = '{safe_phone}'"
                )
                conn.commit()
                return _ok({'ok': True, 'message': 'Вы отписались от уведомлений'})

            # ── NOTIFY: рассылка при новом объекте (вызывается из admin) ──
            if action == 'notify':
                raw_headers = event.get('headers') or {}
                headers_lc = {k.lower(): v for k, v in raw_headers.items()}
                token = (
                    headers_lc.get('x-auth-token')
                    or headers_lc.get('x-authorization')
                    or (body.get('auth_token') or '')
                )
                # Проверяем авторизацию
                safe_token = (token or '').replace("'", "''")[:100]
                cur.execute(
                    f"SELECT u.id FROM {SCHEMA}.sessions s "
                    f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
                    f"WHERE s.token = '{safe_token}' AND s.expires_at > NOW() AND u.is_active = TRUE LIMIT 1"
                )
                if not cur.fetchone():
                    return _err('Unauthorized', 401)

                listing_id = body.get('listing_id')
                category = body.get('category') or ''
                deal_type = body.get('deal_type') or ''
                title = body.get('title') or ''
                price = body.get('price')
                area = body.get('area')
                city = body.get('city') or 'Краснодар'
                listing_url = body.get('url') or ''

                if not listing_id or not category:
                    return _err('listing_id и category обязательны')

                bot_token = _load_max_token(cur)
                if not bot_token:
                    return _ok({'ok': True, 'sent': 0, 'reason': 'MAX Bot не настроен'})

                # Ищем подписчиков на эту категорию
                safe_cat = category.replace("'", "''")
                safe_city = city.replace("'", "''")
                cur.execute(
                    f"SELECT phone, max_user_id, categories, deal_type FROM {SCHEMA}.phone_subscriptions "
                    f"WHERE is_active = TRUE AND is_verified = TRUE "
                    f"AND (city = '{safe_city}' OR city = 'all') "
                    f"AND max_user_id IS NOT NULL AND max_user_id != ''"
                )
                subs = [dict(r) for r in cur.fetchall()]

                cat_label = CATEGORY_LABELS.get(category, category)
                price_str = ''
                if price:
                    try:
                        p = float(price)
                        if deal_type == 'rent':
                            price_str = f'{int(p):,} ₽/мес'.replace(',', ' ')
                        elif p >= 1_000_000:
                            price_str = f'{p / 1_000_000:.1f} млн ₽'
                        else:
                            price_str = f'{int(p):,} ₽'.replace(',', ' ')
                    except Exception:
                        pass

                sent = 0
                for sub in subs:
                    cats = [c.strip() for c in (sub.get('categories') or '').split(',') if c.strip()]
                    sub_deal = sub.get('deal_type') or 'all'
                    # Проверяем совпадение категории
                    if cats and category not in cats:
                        continue
                    # Проверяем совпадение типа сделки
                    if sub_deal != 'all' and deal_type and sub_deal != deal_type:
                        continue

                    lines = [f'🏢 Новый объект — {cat_label}', f'', f'📌 {title}']
                    if area:
                        lines.append(f'📐 {area} м²')
                    if price_str:
                        lines.append(f'💰 {price_str}')
                    if listing_url:
                        lines.append(f'', f'🔗 {listing_url}')

                    text = '\n'.join(lines)
                    if _send_max(bot_token, sub['max_user_id'], text):
                        sent += 1

                # Обновляем last_notified_at
                if sent > 0:
                    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')
                    cur.execute(
                        f"UPDATE {SCHEMA}.phone_subscriptions SET last_notified_at = '{ts}' "
                        f"WHERE is_active = TRUE AND is_verified = TRUE AND max_user_id IS NOT NULL"
                    )
                    conn.commit()

                return _ok({'ok': True, 'sent': sent, 'total_subs': len(subs)})

            # ── STATUS: проверить статус подписки по телефону ──────────────
            if action == 'status':
                phone_raw = (body.get('phone') or qs.get('phone') or '').strip()
                phone = _norm_phone(phone_raw)
                if not phone:
                    return _err('Укажите телефон')
                safe_phone = phone.replace("'", "''")
                cur.execute(
                    f"SELECT is_verified, is_active, categories, deal_type FROM {SCHEMA}.phone_subscriptions "
                    f"WHERE phone = '{safe_phone}'"
                )
                row = cur.fetchone()
                if not row:
                    return _ok({'subscribed': False})
                return _ok({
                    'subscribed': bool(row.get('is_active') and row.get('is_verified')),
                    'is_verified': bool(row.get('is_verified')),
                    'categories': (row.get('categories') or '').split(','),
                    'deal_type': row.get('deal_type') or 'all',
                })

            return _err('Неизвестный action', 404)

    finally:
        conn.close()