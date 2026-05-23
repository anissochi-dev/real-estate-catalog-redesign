"""
Business: Админ API — CRUD объявлений, управление лидами, пользователями, страницами, настройками сайта и телефонной базой с проверкой ролей.
Args: event с httpMethod, queryStringParameters {resource, id, action}, body, headers X-Auth-Token; context
Returns: HTTP-ответ с данными ресурса или ошибкой прав
"""

import json
import os
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _safe(s, length=255):
    return (s or '').replace("'", "''")[:length]


def _str_or_null(v, length=255):
    if v is None or v == '':
        return 'NULL'
    return f"'{_safe(str(v), length)}'"


def _int_or_null(v):
    if v is None or v == '':
        return 'NULL'
    try:
        return str(int(v))
    except Exception:
        return 'NULL'


def _bool(v):
    return 'TRUE' if v else 'FALSE'


def _num_or_null(v):
    if v is None or v == '':
        return 'NULL'
    try:
        return str(float(v))
    except Exception:
        return 'NULL'


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.email, u.name, u.role FROM {SCHEMA}.sessions s "
        f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _load_permissions(cur):
    """Загружает role_permissions из settings как dict {role: {section: {op: bool}}}"""
    try:
        cur.execute(f"SELECT role_permissions FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row and row['role_permissions']:
            return json.loads(row['role_permissions'])
    except Exception:
        pass
    return None


def _can(role, resource, op, permissions=None):
    if role == 'admin':
        return True
    # Сабресурсы listing_comments/listing_history/listing_stats доступны всем сотрудникам
    # на чтение и запись. Финальная проверка идёт внутри обработчиков (например, чат
    # комментариев — только для команды объекта).
    if resource in ('listing_comments', 'listing_history', 'listing_stats', 'listing_documents', 'ai_inpaint'):
        if role in ('director', 'broker', 'office_manager', 'manager', 'editor'):
            return True
    if role == 'admin':
        return True
    # Проверка через кастомные права из БД
    if permissions and role in permissions:
        role_perms = permissions[role]
        if resource in role_perms:
            return bool(role_perms[resource].get(op, False))
        # Проверяем по группе (crm-kanban → crm)
        section_key = resource.split('-')[0] if '-' in resource else resource
        if section_key in role_perms:
            return bool(role_perms[section_key].get(op, False))
        return False
    # Fallback — встроенные права
    if role == 'manager':
        if resource in ('cities', 'purposes', 'xml_feeds'):
            return op == 'read'
        return resource in ('listings', 'leads') and op in ('read', 'create', 'update', 'delete')
    if role == 'editor':
        if resource == 'listings':
            return op in ('read', 'create', 'update')
        if resource in ('pages', 'settings'):
            return op in ('read', 'update')
        if resource in ('cities', 'purposes', 'xml_feeds'):
            return op in ('read', 'create', 'update')
        if resource == 'leads':
            return op == 'read'
        return False
    if role == 'client':
        return resource == 'leads' and op == 'create'
    return False


def handler(event, context):
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    params = event.get('queryStringParameters') or {}
    resource = params.get('resource', '')
    rid = params.get('id')
    action = params.get('action')
    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Требуется авторизация')

            permissions = _load_permissions(cur)
            op = {'GET': 'read', 'POST': 'create', 'PUT': 'update', 'DELETE': 'delete'}.get(method, 'read')
            if not _can(user['role'], resource, op, permissions):
                return _err(403, 'Недостаточно прав')

            if resource == 'listings':
                return _listings(cur, conn, method, rid, event, user)
            if resource == 'leads':
                return _leads(cur, conn, method, rid, action, event, user)
            if resource == 'users':
                return _users(cur, conn, method, rid, event, user)
            if resource == 'pages':
                return _pages(cur, conn, method, rid, event, user)
            if resource == 'settings':
                return _settings(cur, conn, method, event, user)
            if resource == 'cities':
                return _cities(cur, conn, method, rid, event, user)
            if resource == 'purposes':
                return _purposes(cur, conn, method, rid, event, user)
            if resource == 'xml_feeds':
                return _xml_feeds(cur, conn, method, rid, event, user)
            if resource == 'stats':
                return _stats(cur)
            if resource == 'listing_history':
                return _listing_history(cur, method, rid, event, user)
            if resource == 'listing_stats':
                return _listing_stats(cur, rid)
            if resource == 'listings_bulk':
                return _listings_bulk(cur, conn, event, user)
            if resource == 'phones':
                return _phones(cur, conn, method, rid, action, event, user)
            if resource == 'role_permissions':
                return _role_permissions(cur, conn, method, event, user, permissions)
            if resource == 'listing_documents':
                return _listing_documents(cur, conn, method, rid, action, event, user)
            if resource == 'listing_comments':
                return _listing_comments(cur, conn, method, rid, event, user)
            if resource == 'ad_platform_keys':
                return _ad_platform_keys(cur, conn, method, rid, event, user)
            if resource == 'notifications':
                return _notifications(cur, conn, method, action, event, user)
            if resource == 'ai_inpaint':
                return _ai_inpaint(cur, event, user)
            if resource == 'consent_log':
                return _consent_log(cur, conn, method, event, user)

            return _err(400, 'Неизвестный ресурс')
    finally:
        conn.close()


def _consent_log(cur, conn, method, event, user):
    """Журнал принятых согласий. Только admin/director.
    GET ?resource=consent_log — список с фильтрами
    GET ?resource=consent_log&action=stats — счётчики (всего/сегодня/7д/30д)
    GET ?resource=consent_log&action=export — CSV
    """
    if user['role'] not in ('admin', 'director'):
        return _err(403, 'Доступ только для администратора и директора')
    if method != 'GET':
        return _err(405, 'Метод не поддерживается')

    params = event.get('queryStringParameters') or {}
    action = params.get('action') or ''

    # Счётчики
    if action == 'stats':
        cur.execute(
            f"SELECT "
            f"COUNT(*) AS total, "
            f"COUNT(*) FILTER (WHERE accepted_at >= NOW() - INTERVAL '1 day') AS today, "
            f"COUNT(*) FILTER (WHERE accepted_at >= NOW() - INTERVAL '7 days') AS week, "
            f"COUNT(*) FILTER (WHERE accepted_at >= NOW() - INTERVAL '30 days') AS month "
            f"FROM {SCHEMA}.consent_log"
        )
        row = cur.fetchone()
        return _ok({
            'total': int(row['total'] or 0),
            'today': int(row['today'] or 0),
            'week': int(row['week'] or 0),
            'month': int(row['month'] or 0),
        })

    # Фильтры
    where = ['1=1']
    date_from = params.get('date_from')
    date_to = params.get('date_to')
    ip_filter = params.get('ip')
    period = params.get('period')  # today|week|month
    if period == 'today':
        where.append("accepted_at >= NOW() - INTERVAL '1 day'")
    elif period == 'week':
        where.append("accepted_at >= NOW() - INTERVAL '7 days'")
    elif period == 'month':
        where.append("accepted_at >= NOW() - INTERVAL '30 days'")
    if date_from:
        where.append(f"accepted_at >= '{_safe(date_from, 50)}'")
    if date_to:
        where.append(f"accepted_at <= '{_safe(date_to, 50)}'")
    if ip_filter:
        ip_s = _safe(ip_filter, 100)
        where.append(f"ip_address LIKE '%{ip_s}%'")
    where_sql = ' AND '.join(where)

    # CSV-экспорт
    if action == 'export':
        cur.execute(
            f"SELECT id, accepted_at, ip_address, user_agent, documents_opened, page_url, session_id "
            f"FROM {SCHEMA}.consent_log WHERE {where_sql} ORDER BY accepted_at DESC LIMIT 10000"
        )
        rows = cur.fetchall()
        lines = ['id;accepted_at;ip;user_agent;documents_opened;page_url;session_id']
        for r in rows:
            d = dict(r)
            docs = d.get('documents_opened') or []
            if not isinstance(docs, list):
                try:
                    docs = json.loads(docs) if isinstance(docs, str) else []
                except Exception:
                    docs = []
            docs_str = '+'.join(str(x) for x in docs)
            ua = (d.get('user_agent') or '').replace(';', ',').replace('\n', ' ')[:300]
            line = ';'.join([
                str(d.get('id') or ''),
                d.get('accepted_at').isoformat() if d.get('accepted_at') else '',
                d.get('ip_address') or '',
                ua,
                docs_str,
                (d.get('page_url') or '')[:200],
                (d.get('session_id') or '')[:100],
            ])
            lines.append(line)
        csv = '\n'.join(lines)
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="consent_log.csv"',
            },
            'body': csv,
        }

    # Список с пагинацией
    page = max(1, int(params.get('page') or 1))
    limit = min(int(params.get('limit') or 50), 200)
    offset = (page - 1) * limit

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.consent_log WHERE {where_sql}")
    total = int(cur.fetchone()['c'] or 0)

    cur.execute(
        f"SELECT id, accepted_at, ip_address, user_agent, documents_opened, page_url, session_id "
        f"FROM {SCHEMA}.consent_log WHERE {where_sql} "
        f"ORDER BY accepted_at DESC LIMIT {limit} OFFSET {offset}"
    )
    items = []
    for r in cur.fetchall():
        d = dict(r)
        if d.get('accepted_at'):
            try:
                d['accepted_at'] = d['accepted_at'].isoformat()
            except Exception:
                d['accepted_at'] = str(d['accepted_at'])
        items.append(d)
    return _ok({'logs': items, 'total': total, 'page': page, 'limit': limit})


def _listings(cur, conn, method, rid, event, user):
    if method == 'GET':
        if rid:
            cur.execute(
                f"SELECT l.*, u.name AS broker_name, u.id AS broker_user_id, "
                f"  pc.name AS pc_owner_name, pc.phone AS pc_owner_phone, pc.photo_url AS pc_owner_photo, "
                f"  pc.company AS pc_owner_company, pc.notes AS pc_owner_notes, "
                f"  pc2.name AS pc2_owner_name, pc2.phone AS pc2_owner_phone "
                f"FROM {SCHEMA}.listings l "
                f"LEFT JOIN {SCHEMA}.users u ON u.id = COALESCE(l.broker_id, l.author_id) "
                f"LEFT JOIN {SCHEMA}.phone_contacts pc ON pc.id = l.owner_phone_contact_id "
                f"LEFT JOIN {SCHEMA}.phone_contacts pc2 ON pc2.id = l.owner_phone2_contact_id "
                f"WHERE l.id = {int(rid)}"
            )
            row = cur.fetchone()
            if not row:
                return _err(404, 'Не найдено')
            row_dict = dict(row)
            # Авто-миграция: если у объекта есть owner_phone, но нет связи — связываем
            if not row_dict.get('owner_phone_contact_id') and row_dict.get('owner_phone'):
                pc_id = _upsert_phone_contact(cur, row_dict.get('owner_phone'),
                                               row_dict.get('owner_name'), user['id'] if user else None)
                if pc_id:
                    cur.execute(
                        f"UPDATE {SCHEMA}.listings SET owner_phone_contact_id = {pc_id} WHERE id = {int(rid)}"
                    )
                    _link_phone_to_listing(cur, pc_id, int(rid), 'owner')
                    row_dict['owner_phone_contact_id'] = pc_id
                    conn.commit()
            # Используем данные из phone_contacts (приоритет)
            if row_dict.get('pc_owner_name'):
                row_dict['owner_name'] = row_dict['pc_owner_name']
            if row_dict.get('pc_owner_phone'):
                row_dict['owner_phone'] = row_dict['pc_owner_phone']
            row_dict['owner_photo_url'] = row_dict.get('pc_owner_photo')
            row_dict['owner_company'] = row_dict.get('pc_owner_company')
            if row_dict.get('pc2_owner_phone'):
                row_dict['owner_phone2'] = row_dict['pc2_owner_phone']
            # Удаляем временные поля
            for k in ('pc_owner_name', 'pc_owner_phone', 'pc_owner_photo', 'pc_owner_company',
                      'pc_owner_notes', 'pc2_owner_name', 'pc2_owner_phone'):
                row_dict.pop(k, None)
            return _ok({'listing': _ser(row_dict)})
        cur.execute(
            f"SELECT l.*, u.name AS broker_name, "
            f"  COALESCE(NULLIF(pc.name, ''), l.owner_name) AS owner_name_final, "
            f"  COALESCE(pc.phone, l.owner_phone) AS owner_phone_final, "
            f"  pc.photo_url AS owner_photo_url, "
            f"  COALESCE(sv.views, 0) AS stats_views, "
            f"  COALESCE(sc.calls, 0) AS stats_calls, "
            f"  COALESCE(sl.leads, 0) AS stats_leads "
            f"FROM {SCHEMA}.listings l "
            f"LEFT JOIN {SCHEMA}.users u ON u.id = COALESCE(l.broker_id, l.author_id) "
            f"LEFT JOIN {SCHEMA}.phone_contacts pc ON pc.id = l.owner_phone_contact_id "
            f"LEFT JOIN ("
            f"  SELECT listing_id, SUM(count) AS views FROM {SCHEMA}.listing_stats "
            f"  WHERE event_type IN ('view','site_view','open') GROUP BY listing_id"
            f") sv ON sv.listing_id = l.id "
            f"LEFT JOIN ("
            f"  SELECT listing_id, SUM(count) AS calls FROM {SCHEMA}.listing_stats "
            f"  WHERE event_type IN ('call','phone_call','phone_click') GROUP BY listing_id"
            f") sc ON sc.listing_id = l.id "
            f"LEFT JOIN ("
            f"  SELECT listing_id, COUNT(*) AS leads FROM {SCHEMA}.leads "
            f"  WHERE listing_id IS NOT NULL GROUP BY listing_id"
            f") sl ON sl.listing_id = l.id "
            f"ORDER BY l.created_at DESC"
        )
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            # Подменяем owner_name/owner_phone значениями из телефонной базы (если связь есть)
            if d.get('owner_name_final'):
                d['owner_name'] = d['owner_name_final']
            if d.get('owner_phone_final'):
                d['owner_phone'] = d['owner_phone_final']
            d.pop('owner_name_final', None)
            d.pop('owner_phone_final', None)
            rows.append(_ser(d))
        return _ok({'listings': rows})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        # Авто-линковка собственника с единой телефонной базой
        owner_pc_id = _upsert_phone_contact(cur, body.get('owner_phone'), body.get('owner_name'), user['id'])
        owner_pc2_id = _upsert_phone_contact(cur, body.get('owner_phone2'), body.get('owner_name'), user['id'])

        sql = (
            f"INSERT INTO {SCHEMA}.listings "
            f"(title, description, category, deal, price, price_per_m2, area, payback, profit, floor, total_floors, address, district, city, lat, lng, image, images, tags, is_hot, is_new, is_exclusive, is_urgent, status, owner_name, owner_phone, owner_phone2, price_unit, purpose, condition, parking, entrance, video_url, video_type, use_watermark, export_yandex, export_avito, export_cian, tenant_name, monthly_rent, yearly_rent, finishing, ceiling_height, electricity_kw, utilities, road_line, author_id, is_visible, rooms, broker_commission, owner_phone_contact_id, owner_phone2_contact_id) VALUES ("
            f"{_str_or_null(body.get('title'), 255)}, {_str_or_null(body.get('description'), 5000)}, "
            f"{_str_or_null(body.get('category'), 50)}, {_str_or_null(body.get('deal'), 20)}, "
            f"{_int_or_null(body.get('price'))}, {_int_or_null(body.get('price_per_m2'))}, "
            f"{_int_or_null(body.get('area'))}, {_int_or_null(body.get('payback'))}, "
            f"{_int_or_null(body.get('profit'))}, {_int_or_null(body.get('floor'))}, "
            f"{_int_or_null(body.get('total_floors'))}, {_str_or_null(body.get('address'), 255)}, "
            f"{_str_or_null(body.get('district'), 100)}, {_str_or_null(body.get('city') or 'Краснодар', 100)}, "
            f"{_num_or_null(body.get('lat'))}, "
            f"{_num_or_null(body.get('lng'))}, {_str_or_null(body.get('image'), 500)}, "
            f"{_str_or_null(body.get('images'), 5000)}, "
            f"{_str_or_null(body.get('tags'), 1000)}, {_bool(body.get('is_hot'))}, "
            f"{_bool(body.get('is_new'))}, {_bool(body.get('is_exclusive'))}, {_bool(body.get('is_urgent'))}, "
            f"{_str_or_null(body.get('status') or 'active', 20)}, "
            f"{_str_or_null(body.get('owner_name'), 150)}, {_str_or_null(body.get('owner_phone'), 30)}, "
            f"{_str_or_null(body.get('owner_phone2'), 30)}, "
            f"{_str_or_null(body.get('price_unit') or 'total', 10)}, "
            f"{_str_or_null(body.get('purpose'), 100)}, {_str_or_null(body.get('condition'), 50)}, "
            f"{_str_or_null(body.get('parking'), 20)}, {_str_or_null(body.get('entrance'), 20)}, "
            f"{_str_or_null(body.get('video_url'), 500)}, {_str_or_null(body.get('video_type'), 20)}, "
            f"{_bool(body.get('use_watermark', True))}, {_bool(body.get('export_yandex'))}, "
            f"{_bool(body.get('export_avito'))}, {_bool(body.get('export_cian'))}, "
            f"{_str_or_null(body.get('tenant_name'), 200)}, "
            f"{_num_or_null(body.get('monthly_rent'))}, {_num_or_null(body.get('yearly_rent'))}, "
            f"{_str_or_null(body.get('finishing'), 100)}, "
            f"{_num_or_null(body.get('ceiling_height'))}, {_num_or_null(body.get('electricity_kw'))}, "
            f"{_str_or_null(body.get('utilities'), 500)}, {_str_or_null(body.get('road_line'), 50)}, "
            f"{user['id']}, {_bool(body.get('is_visible', True))}, {_int_or_null(body.get('rooms'))}, "
            f"{_str_or_null(body.get('broker_commission'), 100)}, "
            f"{owner_pc_id if owner_pc_id else 'NULL'}, "
            f"{owner_pc2_id if owner_pc2_id else 'NULL'}) RETURNING id"
        )
        cur.execute(sql)
        new_id = cur.fetchone()['id']
        # Связь телефон ↔ объект (для системы phonebook)
        if owner_pc_id:
            _link_phone_to_listing(cur, owner_pc_id, new_id, 'owner')
        if owner_pc2_id:
            _link_phone_to_listing(cur, owner_pc2_id, new_id, 'owner')
        conn.commit()
        return _ok({'id': new_id, 'success': True, 'owner_phone_contact_id': owner_pc_id})

    if method == 'PUT' and rid:
        # Спец-actions: pin / unpin (только admin/director)
        action = (event.get('queryStringParameters') or {}).get('action') or body.get('action')
        if action in ('pin', 'unpin'):
            if not user or user.get('role') not in ('admin', 'director'):
                return _err(403, 'Закреплять объекты могут только администратор и директор')
            if action == 'pin':
                # лимит 10 закреплённых
                cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE is_pinned = TRUE")
                cnt_row = cur.fetchone() or {}
                if int(cnt_row.get('c', 0)) >= 10:
                    return _err(400, 'Достигнут лимит закреплённых объектов (10). Открепите один из уже закреплённых.')
                cur.execute(
                    f"UPDATE {SCHEMA}.listings SET is_pinned = TRUE, pinned_at = NOW(), "
                    f"pinned_by = {int(user['id'])}, updated_at = NOW() WHERE id = {int(rid)}"
                )
                _write_history(cur, int(rid), user, 'pinned', {'is_pinned': {'old': False, 'new': True}})
            else:
                cur.execute(
                    f"UPDATE {SCHEMA}.listings SET is_pinned = FALSE, pinned_at = NULL, "
                    f"pinned_by = NULL, updated_at = NOW() WHERE id = {int(rid)}"
                )
                _write_history(cur, int(rid), user, 'unpinned', {'is_pinned': {'old': True, 'new': False}})
            conn.commit()
            return _ok({'success': True, 'action': action})

        # ── Снимаем "до" — для diff и истории ─────────────────────────────────
        diff_cols = [
            'title', 'description', 'category', 'deal', 'price', 'price_per_m2',
            'area', 'payback', 'profit', 'floor', 'total_floors', 'rooms',
            'address', 'district', 'city', 'image', 'images', 'tags', 'status',
            'owner_name', 'owner_phone', 'owner_phone2', 'price_unit', 'purpose',
            'condition', 'parking', 'entrance', 'video_url', 'video_type',
            'tenant_name', 'monthly_rent', 'yearly_rent', 'finishing',
            'ceiling_height', 'electricity_kw', 'utilities', 'road_line',
            'is_hot', 'is_new', 'is_exclusive', 'is_urgent', 'is_visible',
            'use_watermark', 'export_yandex', 'export_avito', 'export_cian',
            'broker_commission', 'broker_id', 'lat', 'lng',
        ]
        cols_sql = ', '.join(diff_cols)
        cur.execute(f"SELECT {cols_sql} FROM {SCHEMA}.listings WHERE id = {int(rid)}")
        before_row = cur.fetchone()
        before = dict(before_row) if before_row else {}

        fields = []
        # Если меняется owner_phone или owner_name — авто-линкуем к phone_contacts
        if 'owner_phone' in body or 'owner_name' in body:
            # Если есть owner_phone в body — берём его, иначе достаём текущий из БД
            new_phone = body.get('owner_phone')
            new_name = body.get('owner_name')
            if new_phone is None or new_name is None:
                cur.execute(f"SELECT owner_phone, owner_name FROM {SCHEMA}.listings WHERE id = {int(rid)}")
                _cur_row = cur.fetchone()
                if _cur_row:
                    if new_phone is None:
                        new_phone = _cur_row['owner_phone']
                    if new_name is None:
                        new_name = _cur_row['owner_name']
            if new_phone:
                pc_id = _upsert_phone_contact(cur, new_phone, new_name, user['id'])
                fields.append(f"owner_phone_contact_id = {pc_id if pc_id else 'NULL'}")
                if pc_id:
                    _link_phone_to_listing(cur, pc_id, int(rid), 'owner')
        if 'owner_phone2' in body:
            new_phone2 = body.get('owner_phone2')
            if new_phone2:
                pc2_id = _upsert_phone_contact(cur, new_phone2, body.get('owner_name'), user['id'])
                fields.append(f"owner_phone2_contact_id = {pc2_id if pc2_id else 'NULL'}")
                if pc2_id:
                    _link_phone_to_listing(cur, pc2_id, int(rid), 'owner')
            else:
                fields.append("owner_phone2_contact_id = NULL")

        for f, length in [('title', 255), ('description', 5000), ('category', 50), ('deal', 20),
                          ('address', 255), ('district', 100), ('city', 100), ('image', 500),
                          ('images', 5000), ('tags', 1000), ('status', 20),
                          ('owner_name', 150), ('owner_phone', 30), ('owner_phone2', 30), ('price_unit', 10),
                          ('purpose', 100), ('condition', 50), ('parking', 20), ('entrance', 20),
                          ('video_url', 500), ('video_type', 20), ('tenant_name', 200),
                          ('finishing', 100), ('utilities', 500), ('road_line', 50)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body.get(f), length)}")
        for f in ('price', 'price_per_m2', 'area', 'payback', 'profit', 'floor', 'total_floors'):
            if f in body:
                fields.append(f"{f} = {_int_or_null(body.get(f))}")
        for f in ('monthly_rent', 'yearly_rent', 'ceiling_height', 'electricity_kw'):
            if f in body:
                fields.append(f"{f} = {_num_or_null(body.get(f))}")
        for f in ('use_watermark', 'export_yandex', 'export_avito', 'export_cian'):
            if f in body:
                fields.append(f"{f} = {_bool(body.get(f))}")
        for f in ('lat', 'lng'):
            if f in body:
                v = body.get(f)
                fields.append(f"{f} = " + ('NULL' if v is None or v == '' else str(float(v))))
        for f in ('is_hot', 'is_new', 'is_exclusive', 'is_urgent', 'is_visible'):
            if f in body:
                fields.append(f"{f} = {_bool(body.get(f))}")
        if 'rooms' in body:
            fields.append(f"rooms = {_int_or_null(body.get('rooms'))}")
        if 'broker_commission' in body:
            fields.append(f"broker_commission = {_str_or_null(body.get('broker_commission'), 100)}")
        if 'broker_id' in body:
            v = body.get('broker_id')
            fields.append(f"broker_id = " + ('NULL' if v is None else str(int(v))))
        if not fields:
            return _err(400, 'Нет полей для обновления')
        # Помечаем как «реально отредактированный человеком из админки»
        fields.append("updated_at = NOW()")
        fields.append("last_edited_at = NOW()")
        if user and user.get('id'):
            fields.append(f"last_edited_by = {int(user['id'])}")
        cur.execute(f"UPDATE {SCHEMA}.listings SET {', '.join(fields)} WHERE id = {int(rid)}")

        # ── Считаем diff и пишем подробную историю ─────────────────────────────
        try:
            cur.execute(f"SELECT {cols_sql} FROM {SCHEMA}.listings WHERE id = {int(rid)}")
            after_row = cur.fetchone()
            after = dict(after_row) if after_row else {}
            diff = {}
            for k in diff_cols:
                ov = before.get(k)
                nv = after.get(k)
                # Нормализуем None и пустые строки
                if ov is None and nv == '':
                    continue
                if nv is None and ov == '':
                    continue
                if ov == nv:
                    continue
                # Для строк сравниваем по содержимому
                if isinstance(ov, str) and isinstance(nv, str) and ov.strip() == nv.strip():
                    continue
                diff[k] = {'old': ov, 'new': nv}
            if diff:
                _write_history(cur, int(rid), user, 'updated', diff)
        except Exception:
            # Не валим основной запрос если diff не получилось снять
            pass

        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        force = event.get('queryStringParameters', {}).get('force') == '1'
        if force and user and user['role'] == 'admin':
            try:
                _hard_delete_listings(cur, [int(rid)])
            except psycopg2.errors.ForeignKeyViolation as e:
                conn.rollback()
                return _err(409, f'Объект нельзя удалить: на него ссылаются другие записи. {str(e)[:200]}')
            except Exception as e:
                conn.rollback()
                return _err(500, f'Ошибка удаления: {type(e).__name__}: {str(e)[:200]}')
        else:
            cur.execute(f"UPDATE {SCHEMA}.listings SET status = 'archived' WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _mask_phone(phone: str) -> str:
    """Маскирует телефон: +7 (XXX) XXX-XX-XX → +7 (XXX) ***-**-XX (последние 2 цифры остаются)."""
    if not phone:
        return ''
    digits = ''.join(c for c in phone if c.isdigit())
    if len(digits) < 4:
        return '***'
    return phone[:-7].rstrip() + ' ***-**-' + digits[-2:] if len(phone) > 7 else '***' + digits[-2:]


def _can_see_phone(lead: dict, user: dict) -> bool:
    """Правила видимости телефона:
    - Сетевики (is_network_tenant=TRUE) — телефон виден всем сотрудникам
    - Брокерские заявки (broker_id IS NOT NULL) — только админу, директору и тому самому брокеру
    - Остальные заявки — всем сотрудникам
    """
    if lead.get('is_network_tenant'):
        return True
    broker_id = lead.get('broker_id')
    if broker_id is None:
        return True
    role = user.get('role', '')
    if role in ('admin', 'director'):
        return True
    return broker_id == user.get('id')


def _apply_phone_visibility(lead: dict, user: dict) -> dict:
    """Скрывает телефон в данных лида, если нет прав."""
    if _can_see_phone(lead, user):
        return lead
    masked = dict(lead)
    masked['phone'] = _mask_phone(lead.get('phone') or '')
    masked['phone_hidden'] = True
    return masked


def _leads(cur, conn, method, rid, action, event, user):
    if method == 'GET':
        if rid:
            cur.execute(f"SELECT * FROM {SCHEMA}.leads WHERE id = {int(rid)}")
            lead = cur.fetchone()
            if not lead:
                return _err(404, 'Не найдено')
            cur.execute(
                f"SELECT id, lead_id, user_id, author_name, comment, created_at "
                f"FROM {SCHEMA}.lead_comments WHERE lead_id = {int(rid)} ORDER BY created_at ASC"
            )
            comments = [dict(r) for r in cur.fetchall()]
            lead_dict = _apply_phone_visibility(dict(lead), user)
            return _ok({'lead': lead_dict, 'comments': comments})

        cur.execute(f"SELECT * FROM {SCHEMA}.leads ORDER BY created_at DESC")
        leads_list = [_apply_phone_visibility(dict(r), user) for r in cur.fetchall()]
        return _ok({'leads': leads_list})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST' and action == 'comment' and rid:
        comment = _safe(body.get('comment') or '', 2000)
        if not comment:
            return _err(400, 'Пустой комментарий')
        author = _safe(user['name'], 150)
        cur.execute(
            f"INSERT INTO {SCHEMA}.lead_comments (lead_id, user_id, author_name, comment) "
            f"VALUES ({int(rid)}, {user['id']}, '{author}', '{comment}')"
        )
        conn.commit()
        return _ok({'success': True})

    if method == 'POST':
        name = _safe(body.get('name') or '', 100)
        phone = _safe(body.get('phone') or '', 30)
        if not name or not phone:
            return _err(400, 'Имя и телефон обязательны')
        cur.execute(
            f"INSERT INTO {SCHEMA}.leads (name, phone, email, message, listing_id, status, source, "
            f"is_network_tenant, budget, show_on_main, company, lead_type) VALUES ("
            f"'{name}', '{phone}', {_str_or_null(body.get('email'), 100)}, "
            f"{_str_or_null(body.get('message'), 2000)}, {_int_or_null(body.get('listing_id'))}, "
            f"{_str_or_null(body.get('status') or 'new', 20)}, "
            f"{_str_or_null(body.get('source') or 'admin', 50)}, "
            f"{_bool(body.get('is_network_tenant'))}, {_int_or_null(body.get('budget'))}, "
            f"{_bool(body.get('show_on_main', True))}, {_str_or_null(body.get('company'), 200)}, "
            f"{_str_or_null(body.get('lead_type') or 'view', 20)}) RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('status', 20), ('email', 100), ('message', 2000), ('name', 100),
                          ('phone', 30), ('company', 200), ('source', 50), ('lead_type', 20)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        for f in ('assigned_to', 'listing_id', 'budget', 'broker_id'):
            if f in body:
                fields.append(f"{f} = {_int_or_null(body[f])}")
        for f in ('is_network_tenant', 'show_on_main'):
            if f in body:
                fields.append(f"{f} = {_bool(body[f])}")
        if not fields:
            return _err(400, 'Нет полей')
        cur.execute(f"UPDATE {SCHEMA}.leads SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"DELETE FROM {SCHEMA}.lead_comments WHERE lead_id = {int(rid)}")
        cur.execute(f"DELETE FROM {SCHEMA}.leads WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _users(cur, conn, method, rid, event, user):
    if method == 'GET':
        cur.execute(
            f"SELECT id, email, name, phone, role, avatar, is_active, created_at "
            f"FROM {SCHEMA}.users ORDER BY created_at DESC"
        )
        return _ok({'users': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('name', 150), ('phone', 30), ('role', 20)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'avatar' in body:
            fields.append(f"avatar = {_str_or_null(body['avatar'], 500)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body['is_active'])}")
        if 'password' in body and body['password']:
            import hashlib
            h = hashlib.sha256(body['password'].encode()).hexdigest()
            fields.append(f"password_hash = '{h}'")
        if not fields:
            return _err(400, 'Нет полей')
        fields.append("updated_at = NOW()")
        cur.execute(f"UPDATE {SCHEMA}.users SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'POST':
        import hashlib
        email = _safe((body.get('email') or '').lower(), 150)
        password = body.get('password') or ''
        name = _safe(body.get('name') or '', 150)
        role = _safe(body.get('role') or 'client', 20)
        if not email or not password or not name:
            return _err(400, 'Заполните email, пароль и имя')
        h = hashlib.sha256(password.encode()).hexdigest()
        cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE email = '{email}'")
        if cur.fetchone():
            return _err(409, 'Email уже используется')
        cur.execute(
            f"INSERT INTO {SCHEMA}.users (email, password_hash, name, role) "
            f"VALUES ('{email}', '{h}', '{name}', '{role}') RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    return _err(400, 'Bad request')


def _pages(cur, conn, method, rid, event, user):
    if method == 'GET':
        cur.execute(f"SELECT * FROM {SCHEMA}.pages ORDER BY id ASC")
        return _ok({'pages': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('title', 255), ('content', 50000), ('meta_description', 500)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'published' in body:
            fields.append(f"published = {_bool(body['published'])}")
        if not fields:
            return _err(400, 'Нет полей')
        fields.append("updated_at = NOW()")
        cur.execute(f"UPDATE {SCHEMA}.pages SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'POST':
        slug = _safe(body.get('slug') or '', 100)
        title = _safe(body.get('title') or '', 255)
        content = _safe(body.get('content') or '', 50000)
        meta = _safe(body.get('meta_description') or '', 500)
        if not slug or not title:
            return _err(400, 'Нужны slug и title')
        cur.execute(
            f"INSERT INTO {SCHEMA}.pages (slug, title, content, meta_description) "
            f"VALUES ('{slug}', '{title}', '{content}', '{meta}') RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    return _err(400, 'Bad request')


def _settings(cur, conn, method, event, user):
    if method == 'GET':
        cur.execute(f"SELECT * FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        s = cur.fetchone()
        return _ok({'settings': dict(s) if s else {}})

    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        fields = []
        for f, length in [('company_name', 255), ('company_phone', 30), ('company_email', 100),
                          ('company_address', 255), ('hero_title', 500), ('hero_subtitle', 1000),
                          ('about_text', 5000), ('logo_url', 500), ('main_city', 100),
                          ('watermark_url', 500), ('watermark_position', 20),
                          ('yandex_metrika_id', 50), ('google_analytics_id', 50),
                          ('yandex_maps_api_key', 200), ('site_url', 255),
                          ('seo_description', 1000), ('seo_keywords', 1000),
                          ('yandex_api_key', 500), ('yandex_folder_id', 100),
                          ('yookassa_shop_id', 100), ('yookassa_secret_key', 500),
                          ('legal_personal_data', 10000), ('legal_privacy_policy', 10000),
                          ('legal_marketing_consent', 10000),
                          ('footer_description', 1000), ('footer_catalog_links', 3000),
                          ('footer_extra_links', 3000), ('footer_legal_info', 2000),
                          # Бренд-кит
                          ('brand_primary_color', 20), ('brand_secondary_color', 20), ('brand_accent_color', 20),
                          ('favicon_url', 500), ('og_image_url', 500), ('apple_touch_icon_url', 500),
                          # Уведомления
                          ('notify_email_recipients', 1000),
                          ('notify_telegram_bot_token', 500), ('notify_telegram_chat_ids', 1000),
                          ('smtp_host', 255), ('smtp_user', 255), ('smtp_password', 500), ('smtp_from', 255)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'company_since_year' in body:
            fields.append(f"company_since_year = {_int_or_null(body['company_since_year'])}")
        if 'watermark_enabled' in body:
            fields.append(f"watermark_enabled = {_bool(body['watermark_enabled'])}")
        if 'watermark_opacity' in body:
            fields.append(f"watermark_opacity = {_int_or_null(body['watermark_opacity'])}")
        if 'smtp_port' in body:
            fields.append(f"smtp_port = {_int_or_null(body['smtp_port'])}")
        for bf in ('notify_email_enabled', 'notify_email_on_lead', 'notify_email_on_deal', 'notify_email_on_complaint',
                   'notify_telegram_enabled', 'notify_telegram_on_lead', 'notify_telegram_on_deal',
                   'notify_telegram_on_complaint'):
            if bf in body:
                fields.append(f"{bf} = {_bool(body[bf])}")
        if 'role_permissions' in body:
            rp = body['role_permissions']
            rp_json = _safe(json.dumps(rp, ensure_ascii=False), 50000)
            fields.append(f"role_permissions = '{rp_json}'")
        if not fields:
            return _err(400, 'Нет полей')
        fields.append("updated_at = NOW()")
        cur.execute(f"UPDATE {SCHEMA}.settings SET {', '.join(fields)} WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _notifications(cur, conn, method, action, event, user):
    """Тестовая отправка уведомлений: email и telegram."""
    if method != 'POST' or action != 'test':
        return _err(400, 'Bad request')
    body = json.loads(event.get('body') or '{}')
    channel = body.get('channel')
    # Загружаем настройки
    cur.execute(f"SELECT * FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
    s = cur.fetchone()
    if not s:
        return _err(400, 'Настройки не найдены')

    if channel == 'telegram':
        token = (s.get('notify_telegram_bot_token') or '').strip()
        chats = (s.get('notify_telegram_chat_ids') or '').strip()
        if not token or not chats:
            return _err(400, 'Заполните токен бота и Chat ID')
        try:
            import urllib.request
            import urllib.parse
            chat_ids = [c.strip() for c in chats.split(',') if c.strip()]
            sent = 0
            errors = []
            for cid in chat_ids:
                try:
                    text = f"🧪 Тестовое сообщение от {s.get('company_name') or 'админ-панели'}.\nЕсли вы видите этот текст — уведомления настроены правильно."
                    data = urllib.parse.urlencode({'chat_id': cid, 'text': text}).encode()
                    req_url = f"https://api.telegram.org/bot{token}/sendMessage"
                    with urllib.request.urlopen(req_url, data=data, timeout=10) as r:
                        if r.status == 200:
                            sent += 1
                        else:
                            errors.append(f"chat {cid}: HTTP {r.status}")
                except Exception as ex:
                    errors.append(f"chat {cid}: {str(ex)[:100]}")
            if sent == 0:
                return _err(400, 'Не удалось отправить: ' + '; '.join(errors))
            return _ok({'success': True, 'message': f'Отправлено в {sent} чат(ов)', 'errors': errors})
        except Exception as ex:
            return _err(500, f'Ошибка Telegram: {str(ex)[:200]}')

    if channel == 'email':
        recipients = (s.get('notify_email_recipients') or '').strip()
        host = (s.get('smtp_host') or '').strip()
        port = s.get('smtp_port') or 465
        smtp_user = (s.get('smtp_user') or '').strip()
        smtp_pass = s.get('smtp_password') or ''
        smtp_from = (s.get('smtp_from') or smtp_user or '').strip()
        if not recipients:
            return _err(400, 'Не указаны получатели')
        if not host or not smtp_user or not smtp_pass:
            return _err(400, 'Заполните SMTP-сервер, логин и пароль')
        try:
            import smtplib
            from email.mime.text import MIMEText
            to_list = [r.strip() for r in recipients.split(',') if r.strip()]
            msg = MIMEText(f'Это тестовое письмо от {s.get("company_name") or "админ-панели"}.\n\nЕсли вы видите этот текст — уведомления настроены правильно.', 'plain', 'utf-8')
            msg['Subject'] = 'Тестовое уведомление'
            msg['From'] = smtp_from
            msg['To'] = ', '.join(to_list)
            if int(port) == 465:
                server = smtplib.SMTP_SSL(host, int(port), timeout=15)
            else:
                server = smtplib.SMTP(host, int(port), timeout=15)
                server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, to_list, msg.as_string())
            server.quit()
            return _ok({'success': True, 'message': f'Письмо отправлено на {len(to_list)} адрес(а)'})
        except Exception as ex:
            return _err(500, f'SMTP-ошибка: {str(ex)[:200]}')

    return _err(400, 'Неизвестный канал')


def _role_permissions(cur, conn, method, event, user, permissions):
    """CRUD для настроек прав ролей"""
    if user['role'] != 'admin':
        return _err(403, 'Только администратор может управлять правами')
    if method == 'GET':
        return _ok({'permissions': permissions or {}})
    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        new_perms = body.get('permissions', {})
        rp_json = _safe(json.dumps(new_perms, ensure_ascii=False), 50000)
        cur.execute(
            f"UPDATE {SCHEMA}.settings SET role_permissions = '{rp_json}', updated_at = NOW() "
            f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)"
        )
        conn.commit()
        return _ok({'success': True})
    return _err(400, 'Bad request')


def _cities(cur, conn, method, rid, event, user):
    if method == 'GET':
        cur.execute(f"SELECT * FROM {SCHEMA}.cities ORDER BY sort_order ASC, name ASC")
        return _ok({'cities': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        name = _safe(body.get('name') or '', 100)
        region = _safe(body.get('region') or '', 150)
        if not name:
            return _err(400, 'Название обязательно')
        cur.execute(f"SELECT id FROM {SCHEMA}.cities WHERE name = '{name}'")
        if cur.fetchone():
            return _err(409, 'Город уже добавлен')
        region_s = "NULL" if not region else f"'{region}'"
        cur.execute(
            f"INSERT INTO {SCHEMA}.cities (name, region) VALUES ('{name}', {region_s}) RETURNING id"
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        return _ok({'id': new_id, 'success': True})

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('name', 100), ('region', 150)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body['is_active'])}")
        if 'sort_order' in body:
            fields.append(f"sort_order = {_int_or_null(body['sort_order'])}")
        if not fields:
            return _err(400, 'Нет полей')
        cur.execute(f"UPDATE {SCHEMA}.cities SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"UPDATE {SCHEMA}.cities SET is_active = FALSE WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _purposes(cur, conn, method, rid, event, user):
    if method == 'GET':
        cur.execute(f"SELECT * FROM {SCHEMA}.purposes ORDER BY sort_order ASC, name ASC")
        return _ok({'purposes': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        name = _safe(body.get('name') or '', 100)
        slug = _safe(body.get('slug') or '', 50)
        icon = _safe(body.get('icon') or '', 50)
        if not name or not slug:
            return _err(400, 'Название и slug обязательны')
        cur.execute(f"SELECT id FROM {SCHEMA}.purposes WHERE slug = '{slug}' OR name = '{name}'")
        if cur.fetchone():
            return _err(409, 'Назначение уже существует')
        icon_s = "NULL" if not icon else f"'{icon}'"
        cur.execute(
            f"INSERT INTO {SCHEMA}.purposes (name, slug, icon) VALUES ('{name}', '{slug}', {icon_s}) RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('name', 100), ('slug', 50), ('icon', 50)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body['is_active'])}")
        if 'sort_order' in body:
            fields.append(f"sort_order = {_int_or_null(body['sort_order'])}")
        if not fields:
            return _err(400, 'Нет полей')
        cur.execute(f"UPDATE {SCHEMA}.purposes SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"DELETE FROM {SCHEMA}.purposes WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _xml_feeds(cur, conn, method, rid, event, user):
    if method == 'GET':
        cur.execute(f"SELECT * FROM {SCHEMA}.xml_feeds ORDER BY id ASC")
        return _ok({'feeds': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        name = _safe(body.get('name') or '', 100)
        platform = _safe(body.get('platform') or '', 50)
        feed_type = _safe(body.get('feed_type') or 'export', 20)
        url = _safe(body.get('url') or '', 500)
        if not name or not platform:
            return _err(400, 'Название и платформа обязательны')
        url_s = "NULL" if not url else f"'{url}'"
        cur.execute(
            f"INSERT INTO {SCHEMA}.xml_feeds (name, platform, feed_type, url) "
            f"VALUES ('{name}', '{platform}', '{feed_type}', {url_s}) RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('name', 100), ('platform', 50), ('feed_type', 20), ('url', 500)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body['is_active'])}")
        if not fields:
            return _err(400, 'Нет полей')
        cur.execute(f"UPDATE {SCHEMA}.xml_feeds SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"DELETE FROM {SCHEMA}.xml_feeds WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _stats(cur):
    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE status = 'active'")
    listings_active = cur.fetchone()['c']
    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads")
    leads_total = cur.fetchone()['c']
    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads WHERE status = 'new'")
    leads_new = cur.fetchone()['c']
    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.users")
    users_total = cur.fetchone()['c']
    cur.execute(f"SELECT category, COUNT(*) AS c FROM {SCHEMA}.listings WHERE status = 'active' GROUP BY category")
    by_cat = [dict(r) for r in cur.fetchall()]
    cur.execute(f"SELECT status, COUNT(*) AS c FROM {SCHEMA}.leads GROUP BY status")
    by_status = [dict(r) for r in cur.fetchall()]
    return _ok({
        'listings_active': listings_active,
        'leads_total': leads_total,
        'leads_new': leads_new,
        'users_total': users_total,
        'by_category': by_cat,
        'leads_by_status': by_status,
    })


def _listing_history(cur, method, rid, event, user):
    if method == 'GET' and rid:
        cur.execute(
            f"SELECT lh.id, lh.listing_id, lh.user_id, lh.user_name, lh.action, lh.changes, lh.created_at "
            f"FROM {SCHEMA}.listing_history lh "
            f"WHERE lh.listing_id = {int(rid)} ORDER BY lh.created_at DESC LIMIT 100"
        )
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            if d.get('created_at'):
                d['created_at'] = d['created_at'].isoformat()
            rows.append(d)
        return _ok({'history': rows})
    if method == 'POST' and rid:
        body = json.loads(event.get('body') or '{}')
        action = _safe(body.get('action') or 'updated', 50)
        changes = json.dumps(body.get('changes') or {}, ensure_ascii=False)
        user_name = _safe(user['name'], 150)
        cur.execute(
            f"INSERT INTO {SCHEMA}.listing_history (listing_id, user_id, user_name, action, changes) "
            f"VALUES ({int(rid)}, {user['id']}, '{user_name}', '{action}', '{changes}')"
        )
        return _ok({'success': True})
    return _err(400, 'Bad request')


def _listing_stats(cur, rid):
    if not rid:
        return _err(400, 'id обязателен')
    lid = int(rid)
    cur.execute(
        f"SELECT COUNT(*) AS total FROM {SCHEMA}.listing_views WHERE listing_id = {lid}"
    )
    total_views = cur.fetchone()['total']
    cur.execute(
        f"SELECT COUNT(*) AS c FROM {SCHEMA}.listing_views "
        f"WHERE listing_id = {lid} AND viewed_at >= NOW() - INTERVAL '30 days'"
    )
    views_30d = cur.fetchone()['c']
    cur.execute(
        f"SELECT COUNT(*) AS c FROM {SCHEMA}.listing_views "
        f"WHERE listing_id = {lid} AND viewed_at >= NOW() - INTERVAL '7 days'"
    )
    views_7d = cur.fetchone()['c']
    cur.execute(
        f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads WHERE listing_id = {lid}"
    )
    leads_total = cur.fetchone()['c']
    cur.execute(
        f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads "
        f"WHERE listing_id = {lid} AND created_at >= NOW() - INTERVAL '30 days'"
    )
    leads_30d = cur.fetchone()['c']
    cur.execute(
        f"SELECT stat_date::text, views_count, leads_count FROM {SCHEMA}.listing_stats_daily "
        f"WHERE listing_id = {lid} ORDER BY stat_date DESC LIMIT 30"
    )
    daily = [dict(r) for r in cur.fetchall()]
    return _ok({
        'total_views': total_views,
        'views_30d': views_30d,
        'views_7d': views_7d,
        'leads_total': leads_total,
        'leads_30d': leads_30d,
        'daily': daily,
    })


def _hard_delete_listings(cur, ids: list):
    """Полное удаление объектов вместе со всеми зависимыми записями.
    Бросает psycopg2.errors.ForeignKeyViolation если есть незачищенные связи (например crm_deals)."""
    if not ids:
        return
    ids_sql = ', '.join(str(int(i)) for i in ids if str(i).isdigit())
    if not ids_sql:
        return
    # Дочерние таблицы — удаляем в порядке зависимости
    dependent_tables = [
        'listing_history',
        'listing_views',
        'listing_stats',
        'listing_stats_daily',
        'phone_listing_links',
        'listing_comments',
        'listing_documents',
        'crm_owner_listings',
    ]
    for tbl in dependent_tables:
        try:
            cur.execute(f"DELETE FROM {SCHEMA}.{tbl} WHERE listing_id IN ({ids_sql})")
        except psycopg2.errors.UndefinedTable:
            # Таблицы может не быть — пропускаем
            continue
    # Для crm_deals и crm_payments listing_id nullable — обнуляем, чтобы сохранить историю сделок
    for tbl in ('crm_deals', 'crm_payments'):
        try:
            cur.execute(f"UPDATE {SCHEMA}.{tbl} SET listing_id = NULL WHERE listing_id IN ({ids_sql})")
        except psycopg2.errors.UndefinedTable:
            continue
        except Exception:
            # Если колонка NOT NULL — придётся удалить
            try:
                cur.execute(f"DELETE FROM {SCHEMA}.{tbl} WHERE listing_id IN ({ids_sql})")
            except Exception:
                pass
    cur.execute(f"DELETE FROM {SCHEMA}.listings WHERE id IN ({ids_sql})")


def _listings_bulk(cur, conn, event, user):
    body = json.loads(event.get('body') or '{}')
    ids = [int(i) for i in (body.get('ids') or []) if str(i).isdigit()]
    op = body.get('op')
    if not ids or not op:
        return _err(400, 'ids и op обязательны')
    ids_sql = ', '.join(str(i) for i in ids)
    if op == 'archive':
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET status = 'archived', updated_at = NOW() WHERE id IN ({ids_sql})"
        )
        for lid in ids:
            _write_history(cur, lid, user, 'archived', {})
    elif op == 'activate':
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET status = 'active', updated_at = NOW() WHERE id IN ({ids_sql})"
        )
        for lid in ids:
            _write_history(cur, lid, user, 'restored', {})
    elif op == 'set_hot':
        val = _bool(body.get('value', True))
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET is_hot = {val}, updated_at = NOW() WHERE id IN ({ids_sql})"
        )
    elif op == 'set_new':
        val = _bool(body.get('value', True))
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET is_new = {val}, updated_at = NOW() WHERE id IN ({ids_sql})"
        )
    elif op == 'delete':
        if user['role'] != 'admin':
            return _err(403, 'Только администратор может удалять объекты')
        try:
            _hard_delete_listings(cur, ids)
        except psycopg2.errors.ForeignKeyViolation as e:
            conn.rollback()
            return _err(409, f'Не удалось удалить — на объекты ссылаются связанные записи. {str(e)[:200]}')
        except Exception as e:
            conn.rollback()
            return _err(500, f'Ошибка удаления: {type(e).__name__}: {str(e)[:200]}')
    elif op == 'set_category':
        cat = _safe(body.get('value') or '', 50)
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET category = '{cat}', updated_at = NOW() WHERE id IN ({ids_sql})"
        )
    elif op == 'set_city':
        city = _safe(body.get('value') or '', 100)
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET city = '{city}', updated_at = NOW() WHERE id IN ({ids_sql})"
        )
    elif op == 'set_broker':
        # Назначить брокера группе объектов — только админ/директор
        if user['role'] not in ('admin', 'director'):
            return _err(403, 'Только администратор или директор может передавать объекты')
        new_broker_id = body.get('value')
        if new_broker_id is None or new_broker_id == '':
            cur.execute(
                f"UPDATE {SCHEMA}.listings SET broker_id = NULL, updated_at = NOW() "
                f"WHERE id IN ({ids_sql})"
            )
        else:
            try:
                bid = int(new_broker_id)
            except Exception:
                return _err(400, 'Некорректный id брокера')
            # Проверяем, что такой пользователь существует и активен
            cur.execute(
                f"SELECT id, name FROM {SCHEMA}.users "
                f"WHERE id = {bid} AND is_active = TRUE"
            )
            target = cur.fetchone()
            if not target:
                return _err(404, 'Брокер не найден или отключён')
            cur.execute(
                f"UPDATE {SCHEMA}.listings SET broker_id = {bid}, updated_at = NOW() "
                f"WHERE id IN ({ids_sql})"
            )
            for lid in ids:
                _write_history(cur, lid, user, 'broker_changed', {'broker_id': bid, 'broker_name': target['name']})
    else:
        return _err(400, f'Неизвестная операция: {op}')
    conn.commit()
    return _ok({'success': True, 'affected': len(ids)})


def _write_history(cur, listing_id, user, action, changes):
    user_name = _safe(user['name'], 150)
    changes_json = json.dumps(changes, ensure_ascii=False, default=str).replace("'", "''")
    # Защита: ограничим длину JSON в логе истории
    if len(changes_json) > 20000:
        changes_json = changes_json[:20000]
    cur.execute(
        f"INSERT INTO {SCHEMA}.listing_history (listing_id, user_id, user_name, action, changes) "
        f"VALUES ({listing_id}, {user['id']}, '{user_name}', '{action}', '{changes_json}')"
    )


def _normalize_phone(phone):
    import re
    digits = re.sub(r'\D', '', phone or '')
    if len(digits) == 11 and digits.startswith('8'):
        digits = '7' + digits[1:]
    return digits


def _upsert_phone_contact(cur, phone, name=None, user_id=None):
    """
    Находит или создаёт запись в phone_contacts по нормализованному номеру.
    Возвращает id записи или None если телефон пустой.
    Эта функция — единый источник истины для всех собственников / контактов.
    """
    if not phone:
        return None
    norm = _normalize_phone(phone)
    if not norm:
        return None
    cur.execute(
        f"SELECT id, name FROM {SCHEMA}.phone_contacts WHERE phone_normalized = '{norm}' LIMIT 1"
    )
    row = cur.fetchone()
    if row:
        pid = row['id'] if isinstance(row, dict) else row[0]
        existing_name = row['name'] if isinstance(row, dict) else row[1]
        # Обновляем имя, если оно было пустое
        if (not existing_name or not str(existing_name).strip()) and name and str(name).strip():
            safe_name = _safe(name, 200)
            cur.execute(
                f"UPDATE {SCHEMA}.phone_contacts SET name = '{safe_name}', updated_at = NOW() WHERE id = {pid}"
            )
        return pid
    # Создаём новую запись
    safe_phone = _safe(phone, 30)
    safe_name = _safe(name, 200) if name else ''
    name_sql = f"'{safe_name}'" if safe_name else 'NULL'
    user_sql = str(int(user_id)) if user_id else 'NULL'
    cur.execute(
        f"INSERT INTO {SCHEMA}.phone_contacts (phone, phone_normalized, name, created_by) "
        f"VALUES ('{safe_phone}', '{norm}', {name_sql}, {user_sql}) RETURNING id"
    )
    new_row = cur.fetchone()
    return new_row['id'] if isinstance(new_row, dict) else new_row[0]


def _link_phone_to_listing(cur, phone_contact_id, listing_id, role='owner'):
    """Создаёт связь phone_listing_links (если её ещё нет)."""
    if not phone_contact_id or not listing_id:
        return
    cur.execute(
        f"INSERT INTO {SCHEMA}.phone_listing_links (phone_contact_id, listing_id, role) "
        f"VALUES ({int(phone_contact_id)}, {int(listing_id)}, '{_safe(role, 50)}') "
        f"ON CONFLICT (phone_contact_id, listing_id) DO NOTHING"
    )


def _phones(cur, conn, method, rid, action, event, user):
    if method == 'GET':
        if action == 'search':
            params = event.get('queryStringParameters') or {}
            q = _safe(params.get('q') or '', 100)
            q_norm = _normalize_phone(q)
            cur.execute(
                f"SELECT pc.*, "
                f"  (SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'status', l.status, 'role', pll.role)) "
                f"   FROM {SCHEMA}.phone_listing_links pll JOIN {SCHEMA}.listings l ON l.id = pll.listing_id "
                f"   WHERE pll.phone_contact_id = pc.id) AS linked_listings, "
                f"  (SELECT json_agg(json_build_object('id', ld.id, 'name', ld.name, 'status', ld.status, 'created_at', ld.created_at)) "
                f"   FROM {SCHEMA}.phone_lead_links pldl JOIN {SCHEMA}.leads ld ON ld.id = pldl.lead_id "
                f"   WHERE pldl.phone_contact_id = pc.id) AS linked_leads "
                f"FROM {SCHEMA}.phone_contacts pc "
                f"WHERE pc.phone_normalized LIKE '%{q_norm}%' OR pc.name ILIKE '%{_safe(q, 100)}%' "
                f"ORDER BY pc.updated_at DESC LIMIT 50"
            )
            rows = [_ser_phone(dict(r)) for r in cur.fetchall()]
            return _ok({'contacts': rows})

        if rid and action == 'history':
            cur.execute(
                f"SELECT pch.*, u.name AS changed_by_name "
                f"FROM {SCHEMA}.phone_contact_history pch "
                f"LEFT JOIN {SCHEMA}.users u ON u.id = pch.changed_by "
                f"WHERE pch.phone_contact_id = {int(rid)} "
                f"ORDER BY pch.changed_at DESC LIMIT 100"
            )
            rows = []
            for r in cur.fetchall():
                d = dict(r)
                d['changed_at'] = d['changed_at'].isoformat() if d.get('changed_at') else None
                rows.append(d)
            return _ok({'history': rows})

        if rid:
            cur.execute(
                f"SELECT pc.*, "
                f"  (SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'status', l.status, 'role', pll.role, 'image', l.image)) "
                f"   FROM {SCHEMA}.phone_listing_links pll JOIN {SCHEMA}.listings l ON l.id = pll.listing_id "
                f"   WHERE pll.phone_contact_id = pc.id) AS linked_listings, "
                f"  (SELECT json_agg(json_build_object('id', ld.id, 'name', ld.name, 'status', ld.status, 'created_at', ld.created_at)) "
                f"   FROM {SCHEMA}.phone_lead_links pldl JOIN {SCHEMA}.leads ld ON ld.id = pldl.lead_id "
                f"   WHERE pldl.phone_contact_id = pc.id) AS linked_leads "
                f"FROM {SCHEMA}.phone_contacts pc WHERE pc.id = {int(rid)}"
            )
            row = cur.fetchone()
            if not row:
                return _err(404, 'Не найдено')
            return _ok({'contact': _ser_phone(dict(row))})

        params = event.get('queryStringParameters') or {}
        page = max(1, int(params.get('page') or 1))
        limit = 50
        offset = (page - 1) * limit
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.phone_contacts")
        total = cur.fetchone()['c']
        cur.execute(
            f"SELECT pc.id, pc.phone, pc.phone_normalized, pc.name, pc.company, pc.notes, pc.tags, pc.created_at, pc.updated_at, "
            f"  (SELECT COUNT(*) FROM {SCHEMA}.phone_listing_links WHERE phone_contact_id = pc.id) AS listings_count, "
            f"  (SELECT COUNT(*) FROM {SCHEMA}.phone_lead_links WHERE phone_contact_id = pc.id) AS leads_count "
            f"FROM {SCHEMA}.phone_contacts pc ORDER BY pc.updated_at DESC LIMIT {limit} OFFSET {offset}"
        )
        rows = [_ser_phone(dict(r)) for r in cur.fetchall()]
        return _ok({'contacts': rows, 'total': total, 'page': page, 'pages': (total + limit - 1) // limit})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST' and action == 'sync':
        synced = _sync_phones(cur, conn)
        return _ok({'success': True, 'synced': synced})

    if method == 'POST' and action == 'link':
        cid = int(rid)
        listing_id = body.get('listing_id')
        lead_id = body.get('lead_id')
        role = _safe(body.get('role') or 'owner', 50)
        if listing_id:
            cur.execute(
                f"INSERT INTO {SCHEMA}.phone_listing_links (phone_contact_id, listing_id, role) "
                f"VALUES ({cid}, {int(listing_id)}, '{role}') ON CONFLICT DO NOTHING"
            )
        if lead_id:
            cur.execute(
                f"INSERT INTO {SCHEMA}.phone_lead_links (phone_contact_id, lead_id) "
                f"VALUES ({cid}, {int(lead_id)}) ON CONFLICT DO NOTHING"
            )
        conn.commit()
        return _ok({'success': True})

    if method == 'POST' and action == 'unlink':
        cid = int(rid)
        listing_id = body.get('listing_id')
        lead_id = body.get('lead_id')
        if listing_id:
            cur.execute(
                f"UPDATE {SCHEMA}.phone_listing_links SET role = role "
                f"WHERE phone_contact_id = {cid} AND listing_id = {int(listing_id)}"
            )
            cur.execute(
                f"DELETE FROM {SCHEMA}.phone_listing_links "
                f"WHERE phone_contact_id = {cid} AND listing_id = {int(listing_id)}"
            )
        if lead_id:
            cur.execute(
                f"DELETE FROM {SCHEMA}.phone_lead_links "
                f"WHERE phone_contact_id = {cid} AND lead_id = {int(lead_id)}"
            )
        conn.commit()
        return _ok({'success': True})

    if method == 'POST':
        phone = _safe(body.get('phone') or '', 30)
        if not phone:
            return _err(400, 'Телефон обязателен')
        norm = _normalize_phone(phone)
        cur.execute(f"SELECT id FROM {SCHEMA}.phone_contacts WHERE phone_normalized = '{norm}'")
        existing = cur.fetchone()
        if existing:
            return _err(409, f'Номер уже существует с id={existing["id"]}')
        name = _safe(body.get('name') or '', 200)
        company = _safe(body.get('company') or '', 200)
        notes = _safe(body.get('notes') or '', 2000)
        tags = _safe(body.get('tags') or '', 500)
        cur.execute(
            f"INSERT INTO {SCHEMA}.phone_contacts (phone, phone_normalized, name, company, notes, tags, created_by) "
            f"VALUES ('{_safe(phone, 30)}', '{norm}', '{name}', '{company}', '{notes}', '{tags}', {user['id']}) RETURNING id"
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        return _ok({'id': new_id, 'success': True})

    if method == 'DELETE' and rid:
        if user['role'] not in ('admin', 'director'):
            return _err(403, 'Нет прав на удаление')
        cid = int(rid)
        cur.execute(f"DELETE FROM {SCHEMA}.phone_lead_links WHERE phone_contact_id = {cid}")
        cur.execute(f"DELETE FROM {SCHEMA}.phone_listing_links WHERE phone_contact_id = {cid}")
        cur.execute(f"DELETE FROM {SCHEMA}.phone_contact_history WHERE phone_contact_id = {cid}")
        cur.execute(f"DELETE FROM {SCHEMA}.phone_contacts WHERE id = {cid}")
        conn.commit()
        return _ok({'success': True})

    if method == 'PUT' and rid:
        cid = int(rid)
        # fetch current values for history
        cur.execute(f"SELECT * FROM {SCHEMA}.phone_contacts WHERE id = {cid}")
        old_row = cur.fetchone()
        if not old_row:
            return _err(404, 'Не найдено')
        old_data = dict(old_row)

        fields = []
        tracked = [('name', 200), ('company', 200), ('notes', 2000), ('tags', 500), ('inn', 12), ('photo_url', 500)]
        for f, length in tracked:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'phone' in body:
            new_phone = _safe(body['phone'], 30)
            new_norm = _normalize_phone(new_phone)
            fields.append(f"phone = '{new_phone}'")
            fields.append(f"phone_normalized = '{new_norm}'")
        if not fields:
            return _err(400, 'Нет полей')
        fields.append("updated_at = NOW()")
        cur.execute(f"UPDATE {SCHEMA}.phone_contacts SET {', '.join(fields)} WHERE id = {cid}")

        # write history for changed fields
        history_fields = [f for f, _ in tracked] + ['phone']
        for hf in history_fields:
            if hf not in body:
                continue
            old_val = str(old_data.get(hf) or '')
            new_val = _safe(str(body.get(hf) or ''), 500)
            if old_val != new_val:
                old_esc = old_val.replace("'", "''")
                new_esc = new_val.replace("'", "''")
                cur.execute(
                    f"INSERT INTO {SCHEMA}.phone_contact_history "
                    f"(phone_contact_id, changed_by, field_name, old_value, new_value) "
                    f"VALUES ({cid}, {user['id']}, '{hf}', '{old_esc}', '{new_esc}')"
                )

        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _sync_phones(cur, conn):
    synced = 0
    cur.execute(
        f"SELECT id, owner_phone, owner_name FROM {SCHEMA}.listings "
        f"WHERE owner_phone IS NOT NULL AND owner_phone != ''"
    )
    listings = cur.fetchall()
    for row in listings:
        phone = row['owner_phone']
        norm = _normalize_phone(phone)
        if not norm:
            continue
        name = row['owner_name'] or ''
        cur.execute(f"SELECT id FROM {SCHEMA}.phone_contacts WHERE phone_normalized = '{norm}'")
        existing = cur.fetchone()
        if existing:
            cid = existing['id']
        else:
            cur.execute(
                f"INSERT INTO {SCHEMA}.phone_contacts (phone, phone_normalized, name) "
                f"VALUES ('{_safe(phone, 30)}', '{norm}', '{_safe(name, 200)}') RETURNING id"
            )
            cid = cur.fetchone()['id']
            synced += 1
        cur.execute(
            f"INSERT INTO {SCHEMA}.phone_listing_links (phone_contact_id, listing_id, role) "
            f"VALUES ({cid}, {row['id']}, 'owner') ON CONFLICT DO NOTHING"
        )
    cur.execute(
        f"SELECT id, phone, name FROM {SCHEMA}.leads WHERE phone IS NOT NULL AND phone != ''"
    )
    leads = cur.fetchall()
    for row in leads:
        phone = row['phone']
        norm = _normalize_phone(phone)
        if not norm:
            continue
        name = row['name'] or ''
        cur.execute(f"SELECT id FROM {SCHEMA}.phone_contacts WHERE phone_normalized = '{norm}'")
        existing = cur.fetchone()
        if existing:
            cid = existing['id']
        else:
            cur.execute(
                f"INSERT INTO {SCHEMA}.phone_contacts (phone, phone_normalized, name) "
                f"VALUES ('{_safe(phone, 30)}', '{norm}', '{_safe(name, 200)}') RETURNING id"
            )
            cid = cur.fetchone()['id']
            synced += 1
        cur.execute(
            f"INSERT INTO {SCHEMA}.phone_lead_links (phone_contact_id, lead_id) "
            f"VALUES ({cid}, {row['id']}) ON CONFLICT DO NOTHING"
        )
    conn.commit()
    return synced


def _ser_phone(row):
    for k in ('created_at', 'updated_at'):
        if row.get(k) is not None:
            row[k] = row[k].isoformat()
    return row


def _ser(row):
    if row.get('tags'):
        row['tags'] = [t.strip() for t in str(row['tags']).split(',') if t.strip()]
    else:
        row['tags'] = []
    for k in ('lat', 'lng'):
        if row.get(k) is not None:
            row[k] = float(row[k])
    for k in ('created_at', 'updated_at'):
        if row.get(k) is not None:
            row[k] = row[k].isoformat()
    return row


def _listing_documents(cur, conn, method, rid, action, event, user):
    ALLOWED = ('admin', 'director', 'broker', 'office_manager', 'manager')
    if user['role'] not in ALLOWED:
        return _err(403, 'Нет прав')
    qs = event.get('queryStringParameters') or {}
    listing_id = qs.get('listing_id') or (rid and str(rid))
    if not listing_id:
        return _err(400, 'Не указан listing_id')
    lid = int(listing_id)

    if method == 'GET':
        cur.execute(
            f"SELECT d.id, d.listing_id, d.name, d.url, d.created_at, u.name AS uploader_name "
            f"FROM {SCHEMA}.listing_documents d "
            f"LEFT JOIN {SCHEMA}.users u ON u.id = d.uploaded_by "
            f"WHERE d.listing_id = {lid} ORDER BY d.created_at DESC"
        )
        docs = []
        for r in cur.fetchall():
            d = dict(r)
            d['created_at'] = d['created_at'].isoformat() if d.get('created_at') else None
            docs.append(d)
        return _ok({'documents': docs})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        name = _safe(body.get('name') or '', 255)
        url = _safe(body.get('url') or '', 1000)
        if not name or not url:
            return _err(400, 'Имя и URL обязательны')
        cur.execute(
            f"INSERT INTO {SCHEMA}.listing_documents (listing_id, uploaded_by, name, url) "
            f"VALUES ({lid}, {user['id']}, '{name}', '{url}') RETURNING id"
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        return _ok({'id': new_id, 'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"SELECT id, uploaded_by FROM {SCHEMA}.listing_documents WHERE id = {int(rid)}")
        doc = cur.fetchone()
        if not doc:
            return _err(404, 'Документ не найден')
        if user['role'] not in ('admin', 'director') and doc['uploaded_by'] != user['id']:
            return _err(403, 'Нельзя удалить чужой документ')
        cur.execute(f"UPDATE {SCHEMA}.listing_documents SET url = url WHERE id = {int(rid)}")
        cur.execute(
            f"INSERT INTO {SCHEMA}.listing_documents (listing_id, uploaded_by, name, url) "
            f"SELECT listing_id, uploaded_by, '[УДАЛЁН] ' || name, url FROM {SCHEMA}.listing_documents WHERE id = {int(rid)}"
        )
        cur.execute(f"DELETE FROM {SCHEMA}.listing_documents WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'PUT' and rid:
        name = _safe(body.get('name') or '', 255)
        if name:
            cur.execute(f"UPDATE {SCHEMA}.listing_documents SET name = '{name}' WHERE id = {int(rid)}")
            conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _is_listing_team_member(cur, listing_id: int, user: dict) -> bool:
    """Проверяет, входит ли пользователь в 'команду объекта'.
    Команда = автор объекта + брокер объекта + админ + директор.
    """
    role = user.get('role', '')
    if role in ('admin', 'director'):
        return True
    cur.execute(
        f"SELECT author_id, broker_id FROM {SCHEMA}.listings WHERE id = {int(listing_id)}"
    )
    row = cur.fetchone()
    if not row:
        return False
    uid = user.get('id')
    return uid == row.get('author_id') or uid == row.get('broker_id')


def _listing_comments(cur, conn, method, rid, event, user):
    qs = event.get('queryStringParameters') or {}
    listing_id = qs.get('listing_id') or (rid and str(rid))
    if not listing_id:
        return _err(400, 'Не указан listing_id')
    lid = int(listing_id)

    # Проверка доступа: только команда объекта может видеть/писать комментарии
    if method in ('GET', 'POST') and not _is_listing_team_member(cur, lid, user):
        return _err(403, 'Чат комментариев доступен только команде объекта (автору, брокеру, директору и админу)')

    if method == 'GET':
        cur.execute(
            f"SELECT c.id, c.listing_id, c.user_id, c.user_name, c.comment, c.is_ai, c.created_at "
            f"FROM {SCHEMA}.listing_comments c WHERE c.listing_id = {lid} ORDER BY c.created_at ASC"
        )
        comments = []
        for r in cur.fetchall():
            d = dict(r)
            d['created_at'] = d['created_at'].isoformat() if d.get('created_at') else None
            comments.append(d)
        return _ok({'comments': comments})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        comment = _safe(body.get('comment') or '', 3000)
        if not comment:
            return _err(400, 'Пустой комментарий')
        is_ai = bool(body.get('is_ai', False))
        uname = _safe(user['name'], 150)
        cur.execute(
            f"INSERT INTO {SCHEMA}.listing_comments (listing_id, user_id, user_name, comment, is_ai) "
            f"VALUES ({lid}, {user['id']}, '{uname}', '{comment}', {str(is_ai).upper()}) RETURNING id"
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        return _ok({'id': new_id, 'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"SELECT user_id FROM {SCHEMA}.listing_comments WHERE id = {int(rid)}")
        c = cur.fetchone()
        if not c:
            return _err(404, 'Не найдено')
        if user['role'] not in ('admin', 'director') and c['user_id'] != user['id']:
            return _err(403, 'Нельзя удалить чужой комментарий')
        cur.execute(f"DELETE FROM {SCHEMA}.listing_comments WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _ai_inpaint(cur, event, user):
    """Стирает лишнее с фото через YandexART (перерисовка по prompt).

    Ожидает POST body: {image_url: string, prompt?: string}
    Возвращает: {ok: true, new_url: string} либо {error: ...}

    Замечание: настоящий *inpaint* (точечная замена области по маске) у Yandex
    отсутствует — мы используем YandexART image generation как ближайший аналог.
    Поэтому пока возвращаем 501, чтобы фронт показал понятное сообщение пользователю.
    """
    method = event.get('httpMethod', 'POST')
    if method != 'POST':
        return _err(405, 'Только POST')

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err(400, 'Некорректное тело запроса')

    image_url = (body.get('image_url') or '').strip()
    if not image_url:
        return _err(400, 'Не указан image_url')

    # Проверяем настройки
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        api_key = (row.get('yandex_api_key') or '').strip() if row else ''
        folder_id = (row.get('yandex_folder_id') or '').strip() if row else ''
    except Exception:
        api_key, folder_id = '', ''

    if not api_key or not folder_id:
        return _err(503,
            'YandexART не настроен. Добавьте API-ключ и Folder ID в Настройки → Интеграции, '
            'и убедитесь, что у сервисного аккаунта есть роль ai.imageGeneration.user.')

    # Сейчас у YandexART нет публичного inpaint API (только полная генерация по prompt).
    # Возвращаем 501 с понятным объяснением, чтобы UI показал тоаст пользователю.
    return _err(501,
        'Очистка фото через ИИ скоро будет доступна. У Yandex пока нет публичного inpaint API — '
        'мы интегрируем его, как только он выйдет, либо подключим стороннее inpaint-решение по запросу.')


def _ad_platform_keys(cur, conn, method, rid, event, user):
    if user['role'] not in ('admin', 'director'):
        return _err(403, 'Нет прав')

    if method == 'GET':
        cur.execute(
            f"SELECT id, platform, api_key, api_secret, extra, is_active, updated_at "
            f"FROM {SCHEMA}.ad_platform_keys ORDER BY platform ASC"
        )
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            d['updated_at'] = d['updated_at'].isoformat() if d.get('updated_at') else None
            rows.append(d)
        return _ok({'platforms': rows})

    body = json.loads(event.get('body') or '{}')

    if method == 'PUT' and rid:
        fields = []
        if 'api_key' in body:
            fields.append(f"api_key = {_str_or_null(body.get('api_key'), 2000)}")
        if 'api_secret' in body:
            fields.append(f"api_secret = {_str_or_null(body.get('api_secret'), 2000)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body.get('is_active'))}")
        if 'extra' in body:
            import json as _json
            extra_json = _json.dumps(body.get('extra') or {}).replace("'", "''")
            fields.append(f"extra = '{extra_json}'::jsonb")
        fields.append("updated_at = NOW()")
        cur.execute(f"UPDATE {SCHEMA}.ad_platform_keys SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')