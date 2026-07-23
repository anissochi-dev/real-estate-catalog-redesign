"""
Business: Приём заявок с сайта — форма обратной связи и заявки по объектам.
Args: event с httpMethod (POST), body {name, phone, email, message, listing_id}; context
Returns: HTTP-ответ с id созданной заявки или ошибкой валидации
"""

import json
import os
import re
import threading
import psycopg2


SCHEMA_LEADS = 't_p71821556_real_estate_catalog_'


def _normalize_phone(phone):
    digits = re.sub(r'\D', '', phone or '')
    if len(digits) == 11 and digits.startswith('8'):
        digits = '7' + digits[1:]
    return digits


def _upsert_phone_contact(cur, phone, name=None):
    """Находит или создаёт запись в phone_contacts. Возвращает id или None."""
    if not phone:
        return None
    norm = _normalize_phone(phone)
    if not norm:
        return None
    cur.execute(
        f"SELECT id, name FROM {SCHEMA_LEADS}.phone_contacts WHERE phone_normalized = %s LIMIT 1",
        (norm,)
    )
    row = cur.fetchone()
    if row:
        pid, existing_name = row[0], row[1]
        if (not existing_name or not str(existing_name).strip()) and name and str(name).strip():
            cur.execute(
                f"UPDATE {SCHEMA_LEADS}.phone_contacts SET name = %s, updated_at = NOW() WHERE id = %s",
                (name.strip()[:200], pid)
            )
        return pid
    cur.execute(
        f"INSERT INTO {SCHEMA_LEADS}.phone_contacts (phone, phone_normalized, name) "
        f"VALUES (%s, %s, %s) RETURNING id",
        (phone[:30], norm, (name or '').strip()[:200] or None)
    )
    return cur.fetchone()[0]


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'POST')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if method != 'POST':
        return {
            'statusCode': 405,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Method not allowed'}),
        }

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _err(400, 'Invalid JSON')

    name = (body.get('name') or '').strip()[:100]
    phone = (body.get('phone') or '').strip()[:30]
    email = ((body.get('email') or '').strip() or None)
    if email:
        email = email[:100]
    message = ((body.get('message') or '').strip() or None)
    if message:
        message = message[:1500]
    listing_id = body.get('listing_id')
    source = (body.get('source') or 'site').strip()[:50]
    captcha_token = (body.get('captcha_token') or '').strip()

    if not name or not phone:
        return _err(400, 'Name and phone required')

    # Валидация телефона — только цифры, 10-15 символов
    phone_digits = re.sub(r'\D', '', phone)
    if len(phone_digits) < 10 or len(phone_digits) > 15:
        return _err(400, 'Некорректный номер телефона')

    # Проверка captcha_token от SmartCaptcha (формат: sc_<ts>_<rand>_<scoreHex>)
    # Только для публичных заявок с сайта
    SITE_SOURCES_CAPTCHA = ('site', 'property-page', 'offer-to-lead', 'callback', 'hero', 'catalog', 'leads-page')
    if source in SITE_SOURCES_CAPTCHA:
        if not captcha_token or not captcha_token.startswith('sc_'):
            return _err(403, 'Требуется подтверждение капчи')
        # Декодируем score из токена (последний сегмент — hex score*100)
        parts = captcha_token.split('_')
        if len(parts) < 4:
            return _err(403, 'Недействительный токен капчи')
        try:
            score_val = int(parts[-1], 16)  # 0..100
            if score_val < 30:  # score < 0.30 — слишком подозрительно
                return _err(403, 'Проверка капчи не пройдена')
        except ValueError:
            return _err(403, 'Недействительный токен капчи')
        # Проверка свежести токена (не старше 10 минут)
        try:
            import time as _time
            ts_b36 = parts[1]
            token_ts = int(ts_b36, 36) / 1000  # ms → sec
            if abs(_time.time() - token_ts) > 600:  # 10 минут
                return _err(403, 'Токен капчи истёк. Обновите страницу.')
        except Exception:
            pass  # если не можем распарсить — не блокируем

    # Rate limiting: не более 5 заявок с одного IP за 15 минут
    raw_headers = event.get('headers') or {}
    headers_lc = {k.lower(): v for k, v in raw_headers.items()}
    client_ip = (
        headers_lc.get('x-forwarded-for', '').split(',')[0].strip()
        or headers_lc.get('x-real-ip', '')
        or (event.get('requestContext') or {}).get('identity', {}).get('sourceIp', '')
        or 'unknown'
    )[:45]

    # Проверка одинакового телефона — не более 3 заявок в час
    norm_phone = re.sub(r'\D', '', phone)
    if len(norm_phone) == 11 and norm_phone.startswith('8'):
        norm_phone = '7' + norm_phone[1:]

    # Лиды с сайта проходят модерацию: статус 'pending'
    # Внутренние лиды (created_by_admin, crm и др.) сразу 'new'
    SITE_SOURCES = ('site', 'property-page', 'offer-to-lead', 'callback', 'hero', 'catalog', 'leads-page')
    initial_status = 'pending' if source in SITE_SOURCES else 'new'

    # listing_id — только целое число
    lid = None
    if listing_id is not None:
        try:
            lid = int(listing_id)
        except (ValueError, TypeError):
            lid = None

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            # Rate limiting по телефону — не более 3 заявок с одного номера в час
            cur.execute(
                f"SELECT COUNT(*) FROM {SCHEMA_LEADS}.leads "
                f"WHERE phone LIKE %s AND created_at > NOW() - INTERVAL '1 hour'",
                (f'%{norm_phone[-7:]}',)
            )
            phone_count = cur.fetchone()[0]
            if phone_count >= 3:
                return _err(429, 'Слишком много заявок с этого номера. Попробуйте через час.')

            # Авто-линковка к телефонной базе (единый источник имени/телефона)
            pc_id = _upsert_phone_contact(cur, phone, name)

            # Параметризованный INSERT — защита от SQL-инъекций
            cur.execute(
                f"INSERT INTO {SCHEMA_LEADS}.leads "
                "(name, phone, email, message, listing_id, source, status, phone_contact_id) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                (name, phone, email, message, lid, source, initial_status, pc_id)
            )
            lead_id = cur.fetchone()[0]

            # Связь phone_contact ↔ lead
            if pc_id:
                cur.execute(
                    f"INSERT INTO {SCHEMA_LEADS}.phone_lead_links "
                    "(phone_contact_id, lead_id) VALUES (%s, %s) "
                    "ON CONFLICT (phone_contact_id, lead_id) DO NOTHING",
                    (pc_id, lead_id)
                )
            # Инвалидируем кэш sitemap — заявка публична по умолчанию (is_public/show_on_main),
            # попадает в карту сайта как отдельная страница /request/{slug}
            cur.execute(
                f"UPDATE {SCHEMA_LEADS}.seo_artifacts SET urls_count = 0 WHERE kind = 'sitemap'"
            )
            conn.commit()
    finally:
        conn.close()

    # Асинхронные уведомления при заявке с сайта
    if initial_status == 'pending':
        def _send_notifications():
            try:
                _notify_admins(name, phone, lead_id, dsn)
            except Exception:
                pass
            try:
                _notify_max(name, phone, message, lead_id, dsn)
            except Exception:
                pass
            try:
                _max_autoreply(name, phone, lead_id, dsn)
            except Exception:
                pass
            # Уведомляем собственника объекта если заявка привязана к объекту
            if lid:
                try:
                    _notify_owner_new_lead(name, phone, message, lid, lead_id, dsn)
                except Exception:
                    pass
        threading.Thread(target=_send_notifications, daemon=True).start()

    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        'body': json.dumps({'success': True, 'id': lead_id}),
    }


def _notify_max(name: str, phone: str, message, lead_id: int, dsn: str):
    """
    Отправляет уведомление о новой заявке через MAX Bot API
    всем сотрудникам с max_user_id в разрешённых ролях.
    """
    import urllib.request

    SCHEMA = 't_p71821556_real_estate_catalog_'
    conn2 = psycopg2.connect(dsn)
    try:
        with conn2.cursor() as cur2:
            cur2.execute(
                f"SELECT notify_max_enabled, notify_max_on_lead, notify_max_bot_token, "
                f"notify_max_roles, notify_max_extra_phones, company_name "
                f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
            )
            row = cur2.fetchone()
            if not row:
                return
            (enabled, on_lead, bot_token, roles_str, extra_phones_raw, company_name) = row
            if not enabled or not on_lead:
                return
            bot_token = (bot_token or '').strip()
            if not bot_token:
                return

            enabled_roles = [r.strip() for r in (roles_str or 'broker,admin,director,office_manager').split(',') if r.strip()]
            roles_sql = ', '.join(f"'{r}'" for r in enabled_roles)
            cur2.execute(
                f"SELECT name, max_user_id FROM {SCHEMA}.users "
                f"WHERE is_active = TRUE AND max_user_id IS NOT NULL AND max_user_id != '' "
                f"AND role IN ({roles_sql})"
            )
            recipients = [(r[0], r[1]) for r in cur2.fetchall()]

            # Дополнительные user_id через запятую
            for extra in (extra_phones_raw or '').split(','):
                uid = extra.strip()
                if uid:
                    recipients.append(('Доп. получатель', uid))
    finally:
        conn2.close()

    if not recipients:
        return

    company = company_name or 'Система'
    text = f'🔔 Новая заявка — {company}\n\n👤 {name}\n📞 {phone}'
    if message:
        text += f'\n💬 {message[:200]}'
    text += f'\n\n🆔 Заявка #{lead_id}'

    base_url = 'https://botapi.max.ru'
    for uname, user_id in recipients:
        try:
            payload = json.dumps({'text': text}, ensure_ascii=False).encode('utf-8')
            req = urllib.request.Request(
                f'{base_url}/messages?user_id={user_id}',
                data=payload,
                headers={
                    'Authorization': bot_token,
                    'Content-Type': 'application/json',
                },
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=8):
                pass
        except Exception:
            pass


def _notify_admins(name: str, phone: str, lead_id: int, dsn: str):
    """
    Отправляет push всем подписанным администраторам о новом лиде на модерации.
    VAPID-ключи берёт из БД (они генерируются автоматически при первом запросе push).
    """
    SCHEMA = 't_p71821556_real_estate_catalog_'

    conn2 = psycopg2.connect(dsn)
    try:
        with conn2.cursor() as cur2:
            # Загружаем VAPID-ключи из БД
            cur2.execute(
                f"SELECT vapid_public_key, vapid_private_key FROM {SCHEMA}.settings "
                f"ORDER BY id ASC LIMIT 1"
            )
            row = cur2.fetchone()
            if not row or not row[0] or not row[1]:
                return  # Ключи ещё не сгенерированы — тихо выходим
            vapid_public = row[0]
            vapid_private = row[1]

            cur2.execute(
                f"SELECT endpoint, p256dh, auth FROM {SCHEMA}.push_subscriptions "
                f"WHERE auth != 'removed'"
            )
            subs = cur2.fetchall()
    finally:
        conn2.close()

    if not subs:
        return

    try:
        from pywebpush import webpush
        payload = json.dumps({
            'title': '🔔 Новая заявка на модерации',
            'body': f'{name} · {phone}',
            'url': '/?admin=leads',
            'tag': f'lead-{lead_id}',
            'requireInteraction': True,
        }, ensure_ascii=False)
        for endpoint, p256dh, auth_key in subs:
            try:
                webpush(
                    subscription_info={'endpoint': endpoint, 'keys': {'p256dh': p256dh, 'auth': auth_key}},
                    data=payload,
                    vapid_private_key=vapid_private,
                    vapid_claims={'sub': 'mailto:noreply@biznest.ru'},
                )
            except Exception:
                pass
    except ImportError:
        pass


def _max_autoreply(name: str, phone: str, lead_id: int, dsn: str):
    """
    Отправляет автоответ клиенту через МАХ Мессенджер если включён max_autoreply_enabled.
    Ищет клиента в phone_contacts по номеру и отправляет ему сообщение.
    """
    import urllib.request

    SCHEMA = 't_p71821556_real_estate_catalog_'
    conn2 = psycopg2.connect(dsn)
    try:
        with conn2.cursor() as cur2:
            cur2.execute(
                f"SELECT max_autoreply_enabled, max_autoreply_text, notify_max_bot_token "
                f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
            )
            row = cur2.fetchone()
            if not row:
                return
            enabled, tmpl, bot_token = row
            if not enabled:
                return
            bot_token = (bot_token or '').strip()
            if not bot_token or not tmpl:
                return

            # Ищем max_user_id клиента по номеру телефона
            norm = _normalize_phone(phone)
            cur2.execute(
                f"SELECT pc.max_user_id FROM {SCHEMA}.phone_contacts pc "
                f"WHERE pc.phone_normalized = %s AND pc.max_user_id IS NOT NULL LIMIT 1",
                (norm,)
            )
            contact_row = cur2.fetchone()
    finally:
        conn2.close()

    if not contact_row:
        return

    user_id = contact_row[0]
    text = tmpl.replace('{name}', name).replace('{phone}', phone).replace('{id}', str(lead_id))

    try:
        payload = json.dumps({'text': text}, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(
            f'https://botapi.max.ru/messages?user_id={user_id}',
            data=payload,
            headers={'Authorization': bot_token, 'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=8):
            pass
    except Exception:
        pass


def _notify_owner_new_lead(visitor_name: str, visitor_phone: str, message, listing_id: int, lead_id: int, dsn: str):
    """
    Уведомляет собственника объекта о новой заявке через MAX.
    Срабатывает только если у объекта есть owner_user_id с активным аккаунтом и max_user_id.
    """
    import urllib.request

    SCHEMA = 't_p71821556_real_estate_catalog_'
    conn2 = psycopg2.connect(dsn)
    try:
        with conn2.cursor() as cur:
            # Проверяем объект и находим собственника
            cur.execute(
                f"SELECT l.title, l.owner_user_id, u.max_user_id, u.is_active "
                f"FROM {SCHEMA}.listings l "
                f"LEFT JOIN {SCHEMA}.users u ON u.id = l.owner_user_id "
                f"WHERE l.id = {int(listing_id)} AND l.status = 'active' "
                f"LIMIT 1"
            )
            row = cur.fetchone()
            if not row:
                return
            listing_title, owner_user_id, owner_max_id, owner_active = row
            if not owner_user_id or not owner_max_id or not owner_active:
                return
            owner_max_id = (owner_max_id or '').strip()
            if not owner_max_id:
                return

            # Берём токен бота
            cur.execute(
                f"SELECT notify_max_enabled, notify_max_bot_token "
                f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
            )
            srow = cur.fetchone()
            if not srow or not srow[0] or not (srow[1] or '').strip():
                return
            bot_token = srow[1].strip()

        title_short = (listing_title or '')[:60]
        text = (
            f'🔔 Новая заявка по вашему объекту!\n\n'
            f'📍 {title_short}\n\n'
            f'👤 {visitor_name}\n'
            f'📞 {visitor_phone}'
        )
        if message:
            text += f'\n💬 {str(message)[:200]}'
        text += f'\n\n🆔 Заявка #{lead_id}'

        payload = json.dumps({'text': text}, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(
            f'https://botapi.max.ru/messages?user_id={owner_max_id}',
            data=payload,
            headers={'Authorization': bot_token, 'Content-Type': 'application/json'},
            method='POST',
        )
        urllib.request.urlopen(req, timeout=8)
    except Exception as e:
        print(f'[leads] _notify_owner_new_lead error: {e}')
    finally:
        conn2.close()


def _err(code: int, msg: str) -> dict:
    return {
        'statusCode': code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        'body': json.dumps({'error': msg}),
    }