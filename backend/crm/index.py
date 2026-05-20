"""
CRM-система: управление собственниками, сделками, этапами воронки, активностями и геймификацией.
Доступ: admin, director, broker, office_manager, manager.
Использует DSN-параметр для search_path вместо SET search_path.
"""
import json
import os
import re
import psycopg2
from datetime import datetime, timezone


ALLOWED_ROLES = ('admin', 'director', 'broker', 'office_manager', 'manager')

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-User-Id',
}


SCHEMA = 't_p71821556_real_estate_catalog_'


def get_conn():
    dsn = os.environ['DATABASE_URL']
    if 'options=' not in dsn and '?' not in dsn:
        dsn += f'?options=-csearch_path%3D{SCHEMA}'
    elif '?' in dsn and 'options=' not in dsn:
        dsn += f'&options=-csearch_path%3D{SCHEMA}'
    return psycopg2.connect(dsn)


def ok(data, status=200):
    return {'statusCode': status, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps(data, default=str)}


def err(msg, status=400):
    return {'statusCode': status, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg})}


def get_user(token, conn):
    if not token:
        return None
    cur = conn.cursor()
    cur.execute(
        "SELECT u.id, u.name, u.role, u.email FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = TRUE",
        (token,)
    )
    row = cur.fetchone()
    if not row:
        return None
    return {'id': row[0], 'name': row[1], 'role': row[2], 'email': row[3]}


def normalize_phone(phone):
    if not phone:
        return ''
    return re.sub(r'[^0-9]', '', phone)


def award_points(conn, user_id, points, reason, deal_id=None):
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO crm_points (user_id, points, reason, deal_id) VALUES (%s, %s, %s, %s)",
        (user_id, points, reason, deal_id)
    )


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    token = event.get('headers', {}).get('x-auth-token') or event.get('headers', {}).get('X-Auth-Token')
    method = event.get('httpMethod', 'GET')
    path_parts = [p for p in event.get('path', '/').split('/') if p]
    qs = event.get('queryStringParameters') or {}
    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    # path: /owners, /deals, /stages, /activities, /points, /dashboard
    resource = path_parts[0] if path_parts else 'dashboard'
    resource_id = int(path_parts[1]) if len(path_parts) > 1 and path_parts[1].isdigit() else None
    sub = path_parts[2] if len(path_parts) > 2 else None

    conn = get_conn()
    user = get_user(token, conn)

    if not user or user['role'] not in ALLOWED_ROLES:
        conn.close()
        return err('Нет доступа', 403)

    try:
        result = dispatch(conn, user, method, resource, resource_id, sub, qs, body)
        conn.commit()
        return result
    except Exception as e:
        conn.rollback()
        return err(str(e), 500)
    finally:
        conn.close()


def dispatch(conn, user, method, resource, resource_id, sub, qs, body):
    cur = conn.cursor()

    # ── DASHBOARD ──────────────────────────────────────────────────────────────
    if resource == 'dashboard':
        cur.execute("SELECT COUNT(*) FROM crm_deals")
        total_deals = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM crm_deals WHERE closed_at IS NOT NULL AND stage_id IN (SELECT id FROM crm_stages WHERE is_win = TRUE)")
        won_deals = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM crm_owners")
        total_owners = cur.fetchone()[0]
        cur.execute("SELECT COALESCE(SUM(commission), 0) FROM crm_deals WHERE stage_id IN (SELECT id FROM crm_stages WHERE is_win = TRUE)")
        total_commission = float(cur.fetchone()[0])
        cur.execute(
            "SELECT u.id, u.name, u.avatar, COALESCE(SUM(p.points),0) as total_points "
            "FROM users u LEFT JOIN crm_points p ON p.user_id = u.id "
            "WHERE u.role IN ('broker','director','office_manager') "
            "GROUP BY u.id, u.name, u.avatar ORDER BY total_points DESC LIMIT 5"
        )
        leaderboard = [{'id': r[0], 'name': r[1], 'avatar': r[2], 'points': int(r[3])} for r in cur.fetchall()]
        cur.execute(
            "SELECT s.id, s.name, s.color, COUNT(d.id) as cnt "
            "FROM crm_stages s LEFT JOIN crm_deals d ON d.stage_id = s.id "
            "GROUP BY s.id, s.name, s.color, s.position ORDER BY s.position"
        )
        funnel = [{'id': r[0], 'name': r[1], 'color': r[2], 'count': int(r[3])} for r in cur.fetchall()]
        return ok({'total_deals': total_deals, 'won_deals': won_deals, 'total_owners': total_owners,
                   'total_commission': total_commission, 'leaderboard': leaderboard, 'funnel': funnel})

    # ── STAGES ─────────────────────────────────────────────────────────────────
    if resource == 'stages':
        if method == 'GET':
            cur.execute("SELECT id, name, color, position, is_terminal, is_win FROM crm_stages ORDER BY position")
            rows = cur.fetchall()
            return ok([{'id': r[0], 'name': r[1], 'color': r[2], 'position': r[3], 'is_terminal': r[4], 'is_win': r[5]} for r in rows])
        if method == 'POST' and user['role'] in ('admin', 'director'):
            cur.execute(
                "INSERT INTO crm_stages (name, color, position, is_terminal, is_win) VALUES (%s,%s,%s,%s,%s) RETURNING id",
                (body['name'], body.get('color','#6366f1'), body.get('position',0), body.get('is_terminal',False), body.get('is_win',False))
            )
            new_id = cur.fetchone()[0]
            return ok({'id': new_id})
        if method == 'PUT' and resource_id and user['role'] in ('admin', 'director'):
            fields = []
            vals = []
            for f in ('name', 'color', 'position', 'is_terminal', 'is_win'):
                if f in body:
                    fields.append(f'{f} = %s')
                    vals.append(body[f])
            if fields:
                vals.append(resource_id)
                cur.execute(f"UPDATE crm_stages SET {', '.join(fields)} WHERE id = %s", vals)
            return ok({'ok': True})

    # ── OWNERS ─────────────────────────────────────────────────────────────────
    if resource == 'owners':
        if method == 'GET' and not resource_id:
            search = qs.get('search', '')
            page = int(qs.get('page', 1))
            limit = int(qs.get('limit', 30))
            offset = (page - 1) * limit
            where = ''
            params = []
            if search:
                where = "WHERE o.name ILIKE %s OR o.phone ILIKE %s OR o.company ILIKE %s"
                params = [f'%{search}%', f'%{search}%', f'%{search}%']
            cur.execute(f"""
                SELECT o.id, o.name, o.phone, o.email, o.company, o.inn, o.source, o.notes,
                       o.created_at, u.name as creator,
                       COUNT(DISTINCT ol.listing_id) as listings_count,
                       COUNT(DISTINCT d.id) as deals_count
                FROM crm_owners o
                LEFT JOIN users u ON u.id = o.created_by
                LEFT JOIN crm_owner_listings ol ON ol.owner_id = o.id
                LEFT JOIN crm_deals d ON d.owner_id = o.id
                {where}
                GROUP BY o.id, u.name
                ORDER BY o.created_at DESC
                LIMIT %s OFFSET %s
            """, params + [limit, offset])
            rows = cur.fetchall()
            cur.execute(f"SELECT COUNT(*) FROM crm_owners o {where}", params)
            total = cur.fetchone()[0]
            owners = []
            for r in rows:
                owners.append({'id': r[0], 'name': r[1], 'phone': r[2], 'email': r[3],
                                'company': r[4], 'inn': r[5], 'source': r[6], 'notes': r[7],
                                'created_at': r[8], 'creator': r[9],
                                'listings_count': int(r[10]), 'deals_count': int(r[11])})
            return ok({'owners': owners, 'total': total, 'page': page, 'limit': limit})

        if method == 'GET' and resource_id:
            cur.execute("""
                SELECT o.id, o.name, o.phone, o.phone_normalized, o.email, o.company, o.inn,
                       o.source, o.notes, o.created_at, o.updated_at, u.name as creator
                FROM crm_owners o LEFT JOIN users u ON u.id = o.created_by
                WHERE o.id = %s
            """, (resource_id,))
            r = cur.fetchone()
            if not r:
                return err('Не найден', 404)
            owner = {'id': r[0], 'name': r[1], 'phone': r[2], 'phone_normalized': r[3],
                     'email': r[4], 'company': r[5], 'inn': r[6], 'source': r[7],
                     'notes': r[8], 'created_at': r[9], 'updated_at': r[10], 'creator': r[11]}
            cur.execute("""
                SELECT l.id, l.title, l.address, l.price, l.status, ol.role
                FROM crm_owner_listings ol JOIN listings l ON l.id = ol.listing_id
                WHERE ol.owner_id = %s
            """, (resource_id,))
            owner['listings'] = [{'id': r[0], 'title': r[1], 'address': r[2], 'price': r[3], 'status': r[4], 'role': r[5]} for r in cur.fetchall()]
            cur.execute("""
                SELECT d.id, d.title, s.name as stage, d.amount, d.commission, d.created_at
                FROM crm_deals d LEFT JOIN crm_stages s ON s.id = d.stage_id
                WHERE d.owner_id = %s ORDER BY d.created_at DESC
            """, (resource_id,))
            owner['deals'] = [{'id': r[0], 'title': r[1], 'stage': r[2], 'amount': r[3], 'commission': r[4], 'created_at': r[5]} for r in cur.fetchall()]
            return ok(owner)

        if method == 'POST':
            phone = body.get('phone', '')
            norm = normalize_phone(phone)
            if not norm:
                return err('Телефон обязателен')
            cur.execute("SELECT id, name FROM crm_owners WHERE regexp_replace(phone, '[^0-9]', '', 'g') = %s", (norm,))
            dup = cur.fetchone()
            if dup:
                return ok({'duplicate': True, 'existing': {'id': dup[0], 'name': dup[1]}}, 409)
            cur.execute(
                "INSERT INTO crm_owners (name, phone, phone_normalized, email, company, inn, source, notes, created_by) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                (body['name'], phone, norm, body.get('email'), body.get('company'),
                 body.get('inn'), body.get('source','manual'), body.get('notes'), user['id'])
            )
            new_id = cur.fetchone()[0]
            award_points(conn, user['id'], 5, 'Добавлен собственник')
            return ok({'id': new_id}, 201)

        if method == 'PUT' and resource_id:
            fields, vals = [], []
            for f in ('name', 'phone', 'email', 'company', 'inn', 'source', 'notes'):
                if f in body:
                    fields.append(f'{f} = %s')
                    vals.append(body[f])
                    if f == 'phone':
                        fields.append('phone_normalized = %s')
                        vals.append(normalize_phone(body[f]))
            if fields:
                fields.append('updated_at = NOW()')
                vals.append(resource_id)
                cur.execute(f"UPDATE crm_owners SET {', '.join(fields)} WHERE id = %s", vals)
            return ok({'ok': True})

        if method == 'DELETE' and resource_id and user['role'] in ('admin', 'director'):
            cur.execute("UPDATE crm_deals SET owner_id = NULL WHERE owner_id = %s", (resource_id,))
            cur.execute("UPDATE crm_activities SET owner_id = NULL WHERE owner_id = %s", (resource_id,))
            cur.execute("UPDATE crm_payments SET owner_id = NULL WHERE owner_id = %s", (resource_id,))
            cur.execute("UPDATE crm_owner_listings SET owner_id = NULL WHERE owner_id = %s", (resource_id,))
            cur.execute("UPDATE crm_owners SET name = '[удалён]', phone = '0', email = NULL WHERE id = %s", (resource_id,))
            return ok({'ok': True})

    # ── DEALS ──────────────────────────────────────────────────────────────────
    if resource == 'deals':
        if method == 'GET' and not resource_id:
            stage_id = qs.get('stage_id')
            assigned = qs.get('assigned_to')
            search = qs.get('search', '')
            where_parts = []
            params = []
            if stage_id:
                where_parts.append('d.stage_id = %s')
                params.append(int(stage_id))
            if assigned:
                where_parts.append('d.assigned_to = %s')
                params.append(int(assigned))
            if search:
                where_parts.append('d.title ILIKE %s')
                params.append(f'%{search}%')
            if user['role'] == 'broker':
                where_parts.append('d.assigned_to = %s')
                params.append(user['id'])
            where = ('WHERE ' + ' AND '.join(where_parts)) if where_parts else ''
            cur.execute(f"""
                SELECT d.id, d.title, d.stage_id, s.name as stage_name, s.color,
                       d.owner_id, o.name as owner_name, o.phone as owner_phone,
                       d.listing_id, l.title as listing_title,
                       d.assigned_to, u.name as assignee_name,
                       d.amount, d.commission, d.source, d.notes, d.created_at, d.updated_at
                FROM crm_deals d
                LEFT JOIN crm_stages s ON s.id = d.stage_id
                LEFT JOIN crm_owners o ON o.id = d.owner_id
                LEFT JOIN listings l ON l.id = d.listing_id
                LEFT JOIN users u ON u.id = d.assigned_to
                {where}
                ORDER BY d.updated_at DESC
            """, params)
            rows = cur.fetchall()
            deals = []
            for r in rows:
                deals.append({
                    'id': r[0], 'title': r[1], 'stage_id': r[2], 'stage_name': r[3], 'stage_color': r[4],
                    'owner_id': r[5], 'owner_name': r[6], 'owner_phone': r[7],
                    'listing_id': r[8], 'listing_title': r[9],
                    'assigned_to': r[10], 'assignee_name': r[11],
                    'amount': float(r[12]) if r[12] else None,
                    'commission': float(r[13]) if r[13] else None,
                    'source': r[14], 'notes': r[15], 'created_at': r[16], 'updated_at': r[17]
                })
            return ok(deals)

        if method == 'GET' and resource_id:
            cur.execute("""
                SELECT d.id, d.title, d.stage_id, s.name as stage_name, s.color,
                       d.owner_id, o.name as owner_name, o.phone as owner_phone,
                       d.listing_id, l.title as listing_title,
                       d.assigned_to, u.name as assignee_name,
                       d.amount, d.commission, d.source, d.notes,
                       d.closed_at, d.created_at, d.updated_at
                FROM crm_deals d
                LEFT JOIN crm_stages s ON s.id = d.stage_id
                LEFT JOIN crm_owners o ON o.id = d.owner_id
                LEFT JOIN listings l ON l.id = d.listing_id
                LEFT JOIN users u ON u.id = d.assigned_to
                WHERE d.id = %s
            """, (resource_id,))
            r = cur.fetchone()
            if not r:
                return err('Сделка не найдена', 404)
            deal = {
                'id': r[0], 'title': r[1], 'stage_id': r[2], 'stage_name': r[3], 'stage_color': r[4],
                'owner_id': r[5], 'owner_name': r[6], 'owner_phone': r[7],
                'listing_id': r[8], 'listing_title': r[9],
                'assigned_to': r[10], 'assignee_name': r[11],
                'amount': float(r[12]) if r[12] else None,
                'commission': float(r[13]) if r[13] else None,
                'source': r[14], 'notes': r[15], 'closed_at': r[16],
                'created_at': r[17], 'updated_at': r[18]
            }
            cur.execute("""
                SELECT a.id, a.type, a.content, a.scheduled_at, a.done_at, a.created_at,
                       u.name as user_name
                FROM crm_activities a LEFT JOIN users u ON u.id = a.user_id
                WHERE a.deal_id = %s ORDER BY a.created_at DESC
            """, (resource_id,))
            deal['activities'] = [
                {'id': r[0], 'type': r[1], 'content': r[2], 'scheduled_at': r[3],
                 'done_at': r[4], 'created_at': r[5], 'user_name': r[6]}
                for r in cur.fetchall()
            ]
            return ok(deal)

        if method == 'POST':
            if not body.get('title'):
                return err('Название сделки обязательно')
            cur.execute("SELECT id, position FROM crm_stages ORDER BY position LIMIT 1")
            first_stage = cur.fetchone()
            stage_id = body.get('stage_id', first_stage[0] if first_stage else None)
            cur.execute(
                "INSERT INTO crm_deals (title, stage_id, owner_id, listing_id, assigned_to, amount, commission, source, notes, created_by) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                (body['title'], stage_id, body.get('owner_id'), body.get('listing_id'),
                 body.get('assigned_to', user['id']), body.get('amount'), body.get('commission'),
                 body.get('source'), body.get('notes'), user['id'])
            )
            new_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO crm_activities (deal_id, user_id, type, content) VALUES (%s,%s,'note',%s)",
                (new_id, user['id'], f'Сделка создана пользователем {user["name"]}')
            )
            award_points(conn, user['id'], 10, 'Создана сделка', new_id)
            return ok({'id': new_id}, 201)

        if method == 'PUT' and resource_id:
            cur.execute("SELECT stage_id, assigned_to FROM crm_deals WHERE id = %s", (resource_id,))
            old = cur.fetchone()
            if not old:
                return err('Не найдено', 404)
            old_stage_id = old[0]
            fields, vals = [], []
            for f in ('title', 'stage_id', 'owner_id', 'listing_id', 'assigned_to', 'amount', 'commission', 'source', 'notes'):
                if f in body:
                    fields.append(f'{f} = %s')
                    vals.append(body[f])
            if 'stage_id' in body and body['stage_id'] != old_stage_id:
                cur.execute("SELECT name, is_win, is_terminal FROM crm_stages WHERE id = %s", (body['stage_id'],))
                new_stage = cur.fetchone()
                if new_stage:
                    cur.execute(
                        "INSERT INTO crm_activities (deal_id, user_id, type, content) VALUES (%s,%s,'stage_change',%s)",
                        (resource_id, user['id'], f'Этап изменён на «{new_stage[0]}»')
                    )
                    if new_stage[2]:
                        fields.append('closed_at = NOW()')
                    if new_stage[1]:
                        award_points(conn, user['id'], 50, 'Сделка выиграна', resource_id)
            if fields:
                fields.append('updated_at = NOW()')
                vals.append(resource_id)
                cur.execute(f"UPDATE crm_deals SET {', '.join(fields)} WHERE id = %s", vals)
            return ok({'ok': True})

    # ── ACTIVITIES ─────────────────────────────────────────────────────────────
    if resource == 'activities':
        if method == 'GET':
            deal_id = qs.get('deal_id')
            limit = int(qs.get('limit', 50))
            where = 'WHERE a.deal_id = %s' if deal_id else ''
            params = [int(deal_id)] if deal_id else []
            if user['role'] == 'broker':
                broker_cond = 'AND a.user_id = %s' if deal_id else 'WHERE a.user_id = %s'
                where = where + broker_cond
                params.append(user['id'])
            cur.execute(f"""
                SELECT a.id, a.deal_id, d.title as deal_title, a.owner_id, o.name as owner_name,
                       a.user_id, u.name as user_name, a.type, a.content,
                       a.scheduled_at, a.done_at, a.created_at
                FROM crm_activities a
                LEFT JOIN crm_deals d ON d.id = a.deal_id
                LEFT JOIN crm_owners o ON o.id = a.owner_id
                LEFT JOIN users u ON u.id = a.user_id
                {where}
                ORDER BY a.created_at DESC LIMIT %s
            """, params + [limit])
            rows = cur.fetchall()
            return ok([{
                'id': r[0], 'deal_id': r[1], 'deal_title': r[2], 'owner_id': r[3], 'owner_name': r[4],
                'user_id': r[5], 'user_name': r[6], 'type': r[7], 'content': r[8],
                'scheduled_at': r[9], 'done_at': r[10], 'created_at': r[11]
            } for r in rows])

        if method == 'POST':
            cur.execute(
                "INSERT INTO crm_activities (deal_id, owner_id, user_id, type, content, scheduled_at) "
                "VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
                (body.get('deal_id'), body.get('owner_id'), user['id'],
                 body.get('type','note'), body.get('content'), body.get('scheduled_at'))
            )
            new_id = cur.fetchone()[0]
            award_points(conn, user['id'], 2, f'Активность: {body.get("type","note")}', body.get('deal_id'))
            return ok({'id': new_id}, 201)

        if method == 'PUT' and resource_id:
            cur.execute("UPDATE crm_activities SET done_at = NOW() WHERE id = %s", (resource_id,))
            return ok({'ok': True})

    # ── POINTS / LEADERBOARD ───────────────────────────────────────────────────
    if resource == 'points':
        if method == 'GET':
            period = qs.get('period', 'month')
            if period == 'month':
                date_filter = "AND p.created_at >= date_trunc('month', NOW())"
            elif period == 'week':
                date_filter = "AND p.created_at >= date_trunc('week', NOW())"
            else:
                date_filter = ''
            cur.execute(f"""
                SELECT u.id, u.name, u.avatar, u.role,
                       COALESCE(SUM(p.points), 0) as total_points,
                       COUNT(DISTINCT d.id) as deals_won
                FROM users u
                LEFT JOIN crm_points p ON p.user_id = u.id {date_filter}
                LEFT JOIN crm_deals d ON d.assigned_to = u.id
                    AND d.stage_id IN (SELECT id FROM crm_stages WHERE is_win = TRUE)
                WHERE u.role IN ('broker', 'director', 'office_manager', 'manager')
                  AND u.is_active = TRUE
                GROUP BY u.id, u.name, u.avatar, u.role
                ORDER BY total_points DESC
            """)
            rows = cur.fetchall()
            return ok([{
                'id': r[0], 'name': r[1], 'avatar': r[2], 'role': r[3],
                'points': int(r[4]), 'deals_won': int(r[5])
            } for r in rows])

    # ── EVENTS (Календарь) ─────────────────────────────────────────────────────
    if resource == 'events':
        if method == 'GET' and not resource_id:
            year = qs.get('year')
            month = qs.get('month')
            if year and month:
                cur.execute("""
                    SELECT e.id, e.title, e.description, e.event_type, e.starts_at, e.ends_at,
                           e.is_done, e.deal_id, e.owner_id, e.listing_id,
                           e.created_by, e.assigned_to, e.created_at,
                           cb.name as creator_name, at.name as assigned_name,
                           d.title as deal_title, o.name as owner_name,
                           l.title as listing_title
                    FROM crm_events e
                    LEFT JOIN users cb ON cb.id = e.created_by
                    LEFT JOIN users at ON at.id = e.assigned_to
                    LEFT JOIN crm_deals d ON d.id = e.deal_id
                    LEFT JOIN crm_owners o ON o.id = e.owner_id
                    LEFT JOIN listings l ON l.id = e.listing_id
                    WHERE EXTRACT(YEAR FROM e.starts_at) = %s
                      AND EXTRACT(MONTH FROM e.starts_at) = %s
                    ORDER BY e.starts_at ASC
                """, (int(year), int(month)))
            else:
                cur.execute("""
                    SELECT e.id, e.title, e.description, e.event_type, e.starts_at, e.ends_at,
                           e.is_done, e.deal_id, e.owner_id, e.listing_id,
                           e.created_by, e.assigned_to, e.created_at,
                           cb.name as creator_name, at.name as assigned_name,
                           d.title as deal_title, o.name as owner_name,
                           l.title as listing_title
                    FROM crm_events e
                    LEFT JOIN users cb ON cb.id = e.created_by
                    LEFT JOIN users at ON at.id = e.assigned_to
                    LEFT JOIN crm_deals d ON d.id = e.deal_id
                    LEFT JOIN crm_owners o ON o.id = e.owner_id
                    LEFT JOIN listings l ON l.id = e.listing_id
                    WHERE e.starts_at >= NOW() - INTERVAL '7 days'
                    ORDER BY e.starts_at ASC
                    LIMIT 100
                """)
            rows = cur.fetchall()
            def row_to_event(r):
                return {
                    'id': r[0], 'title': r[1], 'description': r[2], 'event_type': r[3],
                    'starts_at': r[4], 'ends_at': r[5], 'is_done': r[6],
                    'deal_id': r[7], 'owner_id': r[8], 'listing_id': r[9],
                    'created_by': r[10], 'assigned_to': r[11], 'created_at': r[12],
                    'creator_name': r[13], 'assigned_name': r[14],
                    'deal_title': r[15], 'owner_name': r[16], 'listing_title': r[17],
                }
            return ok([row_to_event(r) for r in rows])

        if method == 'GET' and resource_id:
            cur.execute("""
                SELECT e.id, e.title, e.description, e.event_type, e.starts_at, e.ends_at,
                       e.is_done, e.deal_id, e.owner_id, e.listing_id,
                       e.created_by, e.assigned_to, e.created_at,
                       cb.name, at.name, d.title, o.name, l.title
                FROM crm_events e
                LEFT JOIN users cb ON cb.id = e.created_by
                LEFT JOIN users at ON at.id = e.assigned_to
                LEFT JOIN crm_deals d ON d.id = e.deal_id
                LEFT JOIN crm_owners o ON o.id = e.owner_id
                LEFT JOIN listings l ON l.id = e.listing_id
                WHERE e.id = %s
            """, (resource_id,))
            r = cur.fetchone()
            if not r:
                return err('Не найдено', 404)
            return ok({
                'id': r[0], 'title': r[1], 'description': r[2], 'event_type': r[3],
                'starts_at': r[4], 'ends_at': r[5], 'is_done': r[6],
                'deal_id': r[7], 'owner_id': r[8], 'listing_id': r[9],
                'created_by': r[10], 'assigned_to': r[11], 'created_at': r[12],
                'creator_name': r[13], 'assigned_name': r[14],
                'deal_title': r[15], 'owner_name': r[16], 'listing_title': r[17],
            })

        if method == 'POST':
            if not body.get('title') or not body.get('starts_at'):
                return err('Укажите title и starts_at')
            cur.execute("""
                INSERT INTO crm_events
                  (title, description, event_type, starts_at, ends_at,
                   deal_id, owner_id, listing_id, lead_id, created_by, assigned_to)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id
            """, (
                body['title'], body.get('description'), body.get('event_type', 'note'),
                body['starts_at'], body.get('ends_at'),
                body.get('deal_id'), body.get('owner_id'), body.get('listing_id'),
                body.get('lead_id'),
                user['id'], body.get('assigned_to', user['id'])
            ))
            new_id = cur.fetchone()[0]
            return ok({'id': new_id}, 201)

        if method == 'PUT' and resource_id:
            fields = []
            vals = []
            for f in ('title', 'description', 'event_type', 'starts_at', 'ends_at',
                      'is_done', 'deal_id', 'owner_id', 'listing_id', 'lead_id', 'assigned_to'):
                if f in body:
                    fields.append(f'{f} = %s')
                    vals.append(body[f])
            if fields:
                fields.append('updated_at = NOW()')
                vals.append(resource_id)
                cur.execute(f"UPDATE crm_events SET {', '.join(fields)} WHERE id = %s", vals)
            return ok({'ok': True})

        if method == 'DELETE' and resource_id:
            cur.execute("UPDATE crm_events SET is_done = TRUE WHERE id = %s", (resource_id,))
            return ok({'ok': True})

    # ── LEADS SEARCH (для связки с событиями) ──────────────────────────────────
    if resource == 'leads':
        if method == 'GET':
            search = qs.get('search', '')
            limit = min(int(qs.get('limit', 8)), 20)
            if search:
                q_s = search.replace("'", "''")[:100]
                cur.execute(
                    f"SELECT id, name, phone, status FROM t_p71821556_real_estate_catalog_.leads "
                    f"WHERE (name ILIKE '%{q_s}%' OR phone ILIKE '%{q_s}%') "
                    f"ORDER BY created_at DESC LIMIT {limit}"
                )
            else:
                cur.execute(
                    f"SELECT id, name, phone, status FROM t_p71821556_real_estate_catalog_.leads "
                    f"ORDER BY created_at DESC LIMIT {limit}"
                )
            rows = [{'id': r[0], 'name': r[1], 'phone': r[2], 'status': r[3]} for r in cur.fetchall()]
            return ok({'leads': rows})

    return err('Неизвестный маршрут', 404)