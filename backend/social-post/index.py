"""
Автопостинг объектов и заявок в социальные сети.
Поддерживаемые платформы с прямым API: ВКонтакте, Telegram.
Платформы с подготовкой текста (ручная публикация): Pinterest, LinkedIn,
Яндекс Дзен, TenChat, МАК, dvizhenie.ru.

GET  /?action=settings          — получить все настройки платформ
POST {action:save_settings}     — сохранить настройку платформы
POST {action:post, entity_type, entity_id, platforms[]}  — опубликовать объект/заявку
POST {action:test, platform}    — тест подключения к платформе
GET  /?action=log&entity_type=&entity_id=  — история постов
"""

import json
import os
import urllib.request
import urllib.parse
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
}

ALLOWED_ROLES = ('admin', 'editor', 'manager', 'director')

PLATFORM_LABELS = {
    'vk': 'ВКонтакте',
    'telegram': 'Telegram',
    'pinterest': 'Pinterest',
    'linkedin': 'LinkedIn',
    'yandex_zen': 'Яндекс Дзен',
    'tenchat': 'TenChat',
    'mak': 'МАК',
    'dvizhenie': 'dvizhenie.ru',
}

# Платформы с прямым API-публикацией
API_PLATFORMS = {'vk', 'telegram'}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(msg, status=400):
    return _ok({'error': msg}, status)


def _safe(s, n=500):
    return (s or '').replace("'", "''")[:n]


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s "
        f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _fmt_price(price):
    if not price:
        return '—'
    p = int(price)
    if p >= 1_000_000:
        return f'{p/1_000_000:.1f} млн ₽'
    return f'{p:,} ₽'.replace(',', ' ')


def _build_post_text(template: str, entity_type: str, entity: dict, site_url: str) -> str:
    """Подставляет переменные в шаблон поста."""
    if entity_type == 'listing':
        slug = entity.get('slug') or str(entity.get('id', ''))
        url = f"{site_url.rstrip('/')}/object/{slug}" if site_url else ''
        CAT_LABELS = {
            'office': 'Офис', 'retail': 'Торговое помещение', 'warehouse': 'Склад',
            'restaurant': 'Кафе/Ресторан', 'hotel': 'Гостиница', 'business': 'Готовый бизнес',
            'gab': 'ГАБ', 'production': 'Производство', 'land': 'Земельный участок',
            'building': 'Здание', 'free_purpose': 'Своб. назначение', 'car_service': 'Автосервис',
        }
        DEAL_LABELS = {'sale': 'Продажа', 'rent': 'Аренда', 'business': 'Готовый бизнес'}
        category = CAT_LABELS.get(entity.get('category', ''), entity.get('category', ''))
        deal = DEAL_LABELS.get(entity.get('deal', ''), entity.get('deal', ''))
        desc = (entity.get('description') or '')[:300]
        if len(entity.get('description') or '') > 300:
            desc += '...'
        replacements = {
            '{title}': entity.get('title', ''),
            '{price}': _fmt_price(entity.get('price')),
            '{area}': f"{entity.get('area', '?')} м²",
            '{address}': entity.get('address') or entity.get('district') or entity.get('city') or '',
            '{city}': entity.get('city', 'Краснодар'),
            '{district}': entity.get('district', ''),
            '{description}': desc,
            '{category}': category,
            '{deal}': deal,
            '{url}': url,
            '{owner_name}': entity.get('owner_name') or '',
        }
    else:  # lead
        replacements = {
            '{title}': f"Заявка #{entity.get('id', '')}",
            '{name}': entity.get('name', ''),
            '{phone}': entity.get('phone', ''),
            '{message}': (entity.get('message') or '')[:200],
            '{source}': entity.get('source', ''),
            '{url}': site_url or '',
        }
    text = template
    for k, v in replacements.items():
        text = text.replace(k, str(v) if v else '')
    return text.strip()


def _post_vk(token_info: dict, text: str, image_url: str = '') -> dict:
    """Публикует пост в группу/на страницу ВКонтакте через API."""
    access_token = (token_info.get('access_token') or '').strip()
    owner_id = (token_info.get('token_extra') or '').strip()  # ID группы (отрицательный) или пользователя
    if not access_token:
        return {'error': 'Не указан токен ВКонтакте'}

    params = {
        'access_token': access_token,
        'v': '5.199',
        'message': text,
        'from_group': '1',
    }
    if owner_id:
        params['owner_id'] = owner_id

    attachments = []

    # Загружаем картинку если есть
    if image_url:
        try:
            # Получаем сервер для загрузки фото
            upload_params = {**params, 'group_id': owner_id.lstrip('-') if owner_id else ''}
            req = urllib.request.Request(
                'https://api.vk.com/method/photos.getWallUploadServer?' + urllib.parse.urlencode(upload_params),
                headers={'Content-Type': 'application/json'}, method='GET'
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                upload_data = json.loads(r.read().decode())
            upload_url = (upload_data.get('response') or {}).get('upload_url', '')
            if upload_url:
                # Скачиваем изображение
                with urllib.request.urlopen(image_url, timeout=15) as img_r:
                    img_bytes = img_r.read()
                # Загружаем на ВК-сервер
                boundary = 'boundaryboundary'
                body = (
                    f'--{boundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo.jpg"\r\n'
                    f'Content-Type: image/jpeg\r\n\r\n'
                ).encode() + img_bytes + f'\r\n--{boundary}--\r\n'.encode()
                upload_req = urllib.request.Request(
                    upload_url, data=body,
                    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
                )
                with urllib.request.urlopen(upload_req, timeout=30) as up_r:
                    up_data = json.loads(up_r.read().decode())
                # Сохраняем фото
                save_params = {
                    'access_token': access_token, 'v': '5.199',
                    'server': up_data.get('server', ''),
                    'photo': up_data.get('photo', ''),
                    'hash': up_data.get('hash', ''),
                    'group_id': owner_id.lstrip('-') if owner_id else '',
                }
                save_req = urllib.request.Request(
                    'https://api.vk.com/method/photos.saveWallPhoto',
                    data=urllib.parse.urlencode(save_params).encode(),
                    headers={'Content-Type': 'application/x-www-form-urlencoded'}
                )
                with urllib.request.urlopen(save_req, timeout=15) as sv_r:
                    sv_data = json.loads(sv_r.read().decode())
                photos = sv_data.get('response') or []
                if photos:
                    p = photos[0]
                    attachments.append(f"photo{p['owner_id']}_{p['id']}")
        except Exception as e:
            print(f'[social-post] VK photo upload error: {e}')

    if attachments:
        params['attachments'] = ','.join(attachments)

    post_data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(
        'https://api.vk.com/method/wall.post',
        data=post_data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
        if 'error' in data:
            return {'error': f"VK API: {data['error'].get('error_msg', 'Ошибка')}"}
        post_id = str((data.get('response') or {}).get('post_id', ''))
        return {'ok': True, 'post_id': post_id}
    except Exception as e:
        return {'error': str(e)[:200]}


def _post_telegram(token_info: dict, text: str, image_url: str = '') -> dict:
    """Публикует пост в Telegram-канал через Bot API."""
    bot_token = (token_info.get('access_token') or '').strip()
    chat_id = (token_info.get('token_extra') or '').strip()
    if not bot_token or not chat_id:
        return {'error': 'Не указан токен бота или chat_id канала'}

    try:
        if image_url:
            # Отправляем фото с подписью
            params = {
                'chat_id': chat_id,
                'photo': image_url,
                'caption': text[:1024],
                'parse_mode': 'Markdown',
            }
            api_url = f'https://api.telegram.org/bot{bot_token}/sendPhoto'
        else:
            params = {
                'chat_id': chat_id,
                'text': text[:4096],
                'parse_mode': 'Markdown',
                'disable_web_page_preview': False,
            }
            api_url = f'https://api.telegram.org/bot{bot_token}/sendMessage'

        data = urllib.parse.urlencode(params).encode()
        req = urllib.request.Request(api_url, data=data,
                                     headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with urllib.request.urlopen(req, timeout=15) as r:
            result = json.loads(r.read().decode())
        if not result.get('ok'):
            return {'error': f"TG: {result.get('description', 'Ошибка')}"}
        post_id = str((result.get('result') or {}).get('message_id', ''))
        return {'ok': True, 'post_id': post_id}
    except Exception as e:
        return {'error': str(e)[:200]}


def _prepare_manual_post(platform: str, text: str, image_url: str = '') -> dict:
    """Для платформ без API — возвращает готовый текст для ручной публикации."""
    links = {
        'pinterest': 'https://www.pinterest.ru/',
        'linkedin': 'https://www.linkedin.com/',
        'yandex_zen': 'https://dzen.ru/',
        'tenchat': 'https://tenchat.ru/',
        'mak': 'https://mak.ru/',
        'dvizhenie': 'https://dvizhenie.ru/',
    }
    return {
        'ok': True,
        'manual': True,
        'post_id': 'manual',
        'text': text,
        'image_url': image_url,
        'publish_url': links.get(platform, ''),
        'message': f'Текст готов. Опубликуйте вручную на {PLATFORM_LABELS.get(platform, platform)}',
    }


def _get_entity(cur, entity_type: str, entity_id: int) -> dict:
    if entity_type == 'listing':
        cur.execute(
            f"SELECT id, title, category, deal, price, area, address, district, city, "
            f"description, slug, image, owner_name "
            f"FROM {SCHEMA}.listings WHERE id = {entity_id}"
        )
    else:
        cur.execute(
            f"SELECT id, name, phone, message, source "
            f"FROM {SCHEMA}.leads WHERE id = {entity_id}"
        )
    row = cur.fetchone()
    return dict(row) if row else {}


def _log_post(cur, conn, platform, entity_type, entity_id, status, text, post_id='', error=''):
    text_safe = _safe(text, 4000)
    post_id_safe = _safe(post_id, 199)
    error_safe = _safe(error, 999)
    cur.execute(
        f"INSERT INTO {SCHEMA}.social_post_log "
        f"(platform, entity_type, entity_id, status, post_text, post_id, error_message) "
        f"VALUES ('{_safe(platform,50)}', '{_safe(entity_type,20)}', {entity_id}, "
        f"'{status}', '{text_safe}', '{post_id_safe}', '{error_safe}')"
    )
    conn.commit()


def handler(event: dict, context) -> dict:
    """Автопостинг объектов и заявок в социальные сети"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    qs = event.get('queryStringParameters') or {}
    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
    method = event.get('httpMethod', 'GET')

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    action = qs.get('action') or body.get('action', '')

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            user = _get_user(cur, token)
            if not user or user['role'] not in ALLOWED_ROLES:
                return _err('Нет доступа', 403)

            # ── ПОЛУЧИТЬ НАСТРОЙКИ ──────────────────────────────────────
            if action == 'settings' and method == 'GET':
                cur.execute(f"SELECT * FROM {SCHEMA}.social_posting_settings ORDER BY id")
                rows = cur.fetchall()
                result = []
                for r in rows:
                    d = dict(r)
                    # Маскируем токен
                    if d.get('access_token'):
                        tok = d['access_token']
                        d['access_token_masked'] = tok[:6] + '***' + tok[-4:] if len(tok) > 10 else '***'
                        d['has_token'] = True
                    else:
                        d['has_token'] = False
                    d.pop('access_token', None)
                    result.append(d)
                return _ok({'settings': result})

            # ── СОХРАНИТЬ НАСТРОЙКИ ─────────────────────────────────────
            if action == 'save_settings':
                if user['role'] not in ('admin', 'director'):
                    return _err('Только администратор', 403)
                platform = _safe(body.get('platform', ''), 50)
                if not platform:
                    return _err('Укажите платформу')
                fields = []
                if 'is_enabled' in body:
                    fields.append(f"is_enabled = {bool(body['is_enabled'])}")
                if 'access_token' in body and body['access_token']:
                    fields.append(f"access_token = '{_safe(body['access_token'], 2000)}'")
                if 'token_extra' in body:
                    fields.append(f"token_extra = '{_safe(body['token_extra'], 500)}'")
                if 'auto_on_listing' in body:
                    fields.append(f"auto_on_listing = {bool(body['auto_on_listing'])}")
                if 'auto_on_lead' in body:
                    fields.append(f"auto_on_lead = {bool(body['auto_on_lead'])}")
                if 'post_template' in body:
                    fields.append(f"post_template = '{_safe(body['post_template'], 2000)}'")
                fields.append("updated_at = NOW()")
                if fields:
                    cur.execute(
                        f"UPDATE {SCHEMA}.social_posting_settings "
                        f"SET {', '.join(fields)} WHERE platform = '{platform}'"
                    )
                conn.commit()
                return _ok({'ok': True})

            # ── ТЕСТ ПОДКЛЮЧЕНИЯ ────────────────────────────────────────
            if action == 'test':
                platform = body.get('platform', '')
                cur.execute(
                    f"SELECT access_token, token_extra FROM {SCHEMA}.social_posting_settings "
                    f"WHERE platform = '{_safe(platform, 50)}'"
                )
                row = cur.fetchone()
                if not row:
                    return _err('Платформа не найдена')
                tok_info = dict(row)

                if platform == 'vk':
                    req = urllib.request.Request(
                        f"https://api.vk.com/method/users.get?access_token={tok_info.get('access_token','')}&v=5.199",
                        headers={'Content-Type': 'application/json'}, method='GET'
                    )
                    with urllib.request.urlopen(req, timeout=10) as r:
                        data = json.loads(r.read().decode())
                    if 'error' in data:
                        return _err(f"VK: {data['error'].get('error_msg','')}")
                    resp = (data.get('response') or [{}])[0]
                    return _ok({'ok': True, 'message': f"ВКонтакте: подключён как {resp.get('first_name','')} {resp.get('last_name','')}"})

                elif platform == 'telegram':
                    bot_token = (tok_info.get('access_token') or '').strip()
                    req = urllib.request.Request(
                        f'https://api.telegram.org/bot{bot_token}/getMe',
                        headers={'Content-Type': 'application/json'}, method='GET'
                    )
                    with urllib.request.urlopen(req, timeout=10) as r:
                        data = json.loads(r.read().decode())
                    if not data.get('ok'):
                        return _err(f"TG: {data.get('description','Ошибка')}")
                    bot = data.get('result', {})
                    return _ok({'ok': True, 'message': f"Telegram: бот @{bot.get('username','')} подключён"})

                else:
                    return _ok({'ok': True, 'message': f"{PLATFORM_LABELS.get(platform, platform)}: ручная публикация, токен не требуется"})

            # ── ОПУБЛИКОВАТЬ ─────────────────────────────────────────────
            if action == 'post':
                entity_type = body.get('entity_type', 'listing')
                entity_id = int(body.get('entity_id', 0))
                platforms_req = body.get('platforms') or []
                if not entity_id:
                    return _err('Укажите entity_id')

                # Получаем объект/заявку
                entity = _get_entity(cur, entity_type, entity_id)
                if not entity:
                    return _err('Объект не найден', 404)

                # Получаем site_url
                cur.execute(f"SELECT site_url, logo_url FROM {SCHEMA}.settings ORDER BY id LIMIT 1")
                s = cur.fetchone()
                site_url = (s.get('site_url') or 'https://biznest.poehali.dev') if s else ''
                logo_url = (s.get('logo_url') or '') if s else ''

                # Получаем настройки включённых платформ
                if platforms_req:
                    plat_filter = "'" + "','".join(_safe(p, 50) for p in platforms_req) + "'"
                    cur.execute(
                        f"SELECT * FROM {SCHEMA}.social_posting_settings "
                        f"WHERE platform IN ({plat_filter}) AND is_enabled = TRUE"
                    )
                else:
                    trigger = 'auto_on_listing' if entity_type == 'listing' else 'auto_on_lead'
                    cur.execute(
                        f"SELECT * FROM {SCHEMA}.social_posting_settings "
                        f"WHERE is_enabled = TRUE AND {trigger} = TRUE"
                    )
                settings_list = cur.fetchall()

                results = []
                for ps in settings_list:
                    ps = dict(ps)
                    platform = ps['platform']
                    template = ps.get('post_template') or '{title}\n{price}\n{url}'
                    text = _build_post_text(template, entity_type, entity, site_url)

                    # Изображение
                    image_url = ''
                    if entity_type == 'listing':
                        image_url = entity.get('image') or logo_url
                    if not image_url:
                        image_url = logo_url

                    if platform == 'vk':
                        result = _post_vk(ps, text, image_url)
                    elif platform == 'telegram':
                        result = _post_telegram(ps, text, image_url)
                    else:
                        result = _prepare_manual_post(platform, text, image_url)

                    status = 'ok' if result.get('ok') else 'error'
                    _log_post(cur, conn, platform, entity_type, entity_id,
                              status, text, result.get('post_id', ''),
                              result.get('error', ''))
                    results.append({'platform': platform, 'label': PLATFORM_LABELS.get(platform, platform), **result})

                return _ok({'results': results, 'total': len(results)})

            # ── ЛОГ ПОСТОВ ──────────────────────────────────────────────
            if action == 'log' and method == 'GET':
                entity_type = qs.get('entity_type', '')
                entity_id = qs.get('entity_id', '')
                where = ''
                if entity_type and entity_id:
                    where = f"WHERE entity_type = '{_safe(entity_type,20)}' AND entity_id = {int(entity_id)}"
                cur.execute(
                    f"SELECT id, platform, entity_type, entity_id, status, post_id, "
                    f"error_message, created_at FROM {SCHEMA}.social_post_log {where} "
                    f"ORDER BY created_at DESC LIMIT 100"
                )
                return _ok({'log': [dict(r) for r in cur.fetchall()]})

            return _err('Неизвестный action', 404)
    finally:
        conn.close()