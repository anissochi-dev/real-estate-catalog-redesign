"""
Business: API для каталога коммерческой недвижимости — список и детали объектов.
Args: event с httpMethod (GET), queryStringParameters (category, deal, search, min_area, max_price, id); context
Returns: HTTP-ответ с JSON массивом объектов или одним объектом
"""

import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id, User-Agent',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    params = event.get('queryStringParameters') or {}
    dsn = os.environ['DATABASE_URL']

    # POST разрешён ТОЛЬКО для публичной записи согласия. Всё остальное — только GET.
    if method == 'POST':
        body_raw = event.get('body') or '{}'
        try:
            body = json.loads(body_raw)
        except Exception:
            body = {}
        action = body.get('action') or params.get('action')
        if action != 'consent_save':
            return {
                'statusCode': 405,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Method not allowed'}),
            }

        # Извлекаем IP, User-Agent и поля
        raw_headers = event.get('headers') or {}
        headers_lc = {k.lower(): v for k, v in raw_headers.items()}
        req_ctx = event.get('requestContext') or {}
        identity = req_ctx.get('identity') or {}
        ip = (
            identity.get('sourceIp')
            or headers_lc.get('x-real-ip')
            or headers_lc.get('x-forwarded-for', '').split(',')[0].strip()
            or ''
        )
        ua = headers_lc.get('user-agent') or body.get('user_agent') or ''
        docs_opened = body.get('documents_opened') or []
        page_url = body.get('page_url') or ''
        session_id = body.get('session_id') or ''

        # Безопасное экранирование
        def _esc(s):
            return str(s or '').replace("'", "''")[:1000]

        ip_e = _esc(ip)
        ua_e = _esc(ua)
        pu_e = _esc(page_url)
        sid_e = _esc(session_id)
        # Нормализуем documents_opened — только строки
        if isinstance(docs_opened, list):
            docs_clean = [str(d)[:50] for d in docs_opened if d]
        else:
            docs_clean = []
        docs_json = json.dumps(docs_clean, ensure_ascii=False).replace("'", "''")

        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Дедуп: если за последние 24ч был лог с этим IP+UA — обновляем
                cur.execute(
                    "SELECT id, documents_opened FROM t_p71821556_real_estate_catalog_.consent_log "
                    f"WHERE ip_address = '{ip_e}' AND user_agent = '{ua_e}' "
                    "AND accepted_at > NOW() - INTERVAL '24 hours' "
                    "ORDER BY accepted_at DESC LIMIT 1"
                )
                existing = cur.fetchone()
                if existing:
                    # Объединяем массивы открытых документов
                    old_docs = existing.get('documents_opened') or []
                    if isinstance(old_docs, str):
                        try:
                            old_docs = json.loads(old_docs)
                        except Exception:
                            old_docs = []
                    merged = list({*([str(d) for d in old_docs]), *docs_clean})
                    merged_json = json.dumps(merged, ensure_ascii=False).replace("'", "''")
                    cur.execute(
                        "UPDATE t_p71821556_real_estate_catalog_.consent_log "
                        f"SET documents_opened = '{merged_json}'::jsonb, "
                        f"page_url = '{pu_e}', session_id = '{sid_e}', "
                        f"accepted_at = NOW() WHERE id = {int(existing['id'])} RETURNING id"
                    )
                    new_id = cur.fetchone()['id']
                else:
                    cur.execute(
                        "INSERT INTO t_p71821556_real_estate_catalog_.consent_log "
                        "(ip_address, user_agent, documents_opened, page_url, session_id) "
                        f"VALUES ('{ip_e}', '{ua_e}', '{docs_json}'::jsonb, '{pu_e}', '{sid_e}') "
                        "RETURNING id"
                    )
                    new_id = cur.fetchone()['id']
                conn.commit()
                return _ok({'success': True, 'id': new_id})
        finally:
            conn.close()

    if method != 'GET':
        return {
            'statusCode': 405,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Method not allowed'}),
        }

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if params.get('resource') == 'public_settings':
                cur.execute(
                    "SELECT company_name, company_phone, company_email, company_address, "
                    "hero_title, hero_subtitle, about_text, logo_url, main_city, "
                    "watermark_url, watermark_enabled, watermark_position, watermark_opacity, "
                    "yandex_maps_api_key, yandex_metrika_id, google_analytics_id, "
                    "company_since_year, site_url, seo_keywords, seo_description, "
                    "legal_personal_data, legal_privacy_policy, legal_marketing_consent, "
                    "footer_description, footer_catalog_links, footer_extra_links, footer_legal_info, "
                    "home_listings_limit, catalog_page_size, news_list_limit, category_page_size, leads_page_size "
                    "FROM t_p71821556_real_estate_catalog_.settings ORDER BY id ASC LIMIT 1"
                )
                row = cur.fetchone()
                return _ok({'settings': dict(row) if row else {}})

            if params.get('resource') == 'public_purposes':
                cur.execute(
                    "SELECT id, name, slug, icon FROM t_p71821556_real_estate_catalog_.purposes "
                    "WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC"
                )
                return _ok({'purposes': [dict(r) for r in cur.fetchall()]})

            if params.get('resource') == 'public_leads':
                cur.execute(
                    "SELECT id, name, message, budget, company, created_at "
                    "FROM t_p71821556_real_estate_catalog_.leads "
                    "WHERE show_on_main = TRUE AND status IN ('new','in_progress') "
                    "ORDER BY created_at DESC LIMIT 12"
                )
                rows = []
                for r in cur.fetchall():
                    d = dict(r)
                    if d.get('created_at') is not None:
                        d['created_at'] = d['created_at'].isoformat()
                    rows.append(d)
                return _ok({'leads': rows})

            if params.get('resource') == 'public_leads_full':
                # Полный список заявок с пагинацией, фильтрами и поиском.
                # Доступен без авторизации. Контакты (телефон/email) не отдаём — приватность.
                try:
                    page = max(1, int(params.get('page') or 1))
                except (TypeError, ValueError):
                    page = 1
                try:
                    limit = min(max(int(params.get('limit') or 24), 1), 100)
                except (TypeError, ValueError):
                    limit = 24
                offset = (page - 1) * limit

                where = ["show_on_main = TRUE", "status IN ('new','in_progress')"]
                # Поиск по message/name/company
                q = (params.get('search') or '').strip()
                if q:
                    q_safe = q.replace("'", "''").lower()
                    where.append(
                        f"(LOWER(COALESCE(message,'')) LIKE '%{q_safe}%' "
                        f"OR LOWER(COALESCE(name,'')) LIKE '%{q_safe}%' "
                        f"OR LOWER(COALESCE(company,'')) LIKE '%{q_safe}%' "
                        f"OR LOWER(COALESCE(request_category,'')) LIKE '%{q_safe}%')"
                    )
                # Фильтр по бюджету
                try:
                    min_b = params.get('min_budget')
                    if min_b:
                        where.append(f"budget >= {int(min_b)}")
                except (TypeError, ValueError):
                    pass
                try:
                    max_b = params.get('max_budget')
                    if max_b:
                        where.append(f"budget <= {int(max_b)}")
                except (TypeError, ValueError):
                    pass
                # Фильтр по категории запроса
                cat = (params.get('category') or '').strip()
                if cat:
                    cat_safe = cat.replace("'", "''")
                    where.append(f"request_category = '{cat_safe}'")
                # Фильтр по списку id (для ИИ-поиска)
                ids_param = (params.get('ids') or '').strip()
                if ids_param:
                    try:
                        ids_list = [int(x) for x in ids_param.split(',') if x.strip().isdigit()]
                        if ids_list:
                            ids_sql = ','.join(str(x) for x in ids_list[:50])
                            where.append(f"id IN ({ids_sql})")
                    except Exception:
                        pass

                where_sql = ' AND '.join(where)
                # Сортировка по умолчанию — последние редактированные первыми
                # (updated_at, с фолбэком на created_at).
                sort = (params.get('sort') or 'newest').strip()
                order = {
                    'newest': 'COALESCE(updated_at, created_at) DESC NULLS LAST, id DESC',
                    'budget_desc': 'budget DESC NULLS LAST, COALESCE(updated_at, created_at) DESC',
                    'budget_asc': 'budget ASC NULLS LAST, COALESCE(updated_at, created_at) DESC',
                }.get(sort, 'COALESCE(updated_at, created_at) DESC NULLS LAST, id DESC')

                cur.execute(
                    f"SELECT COUNT(*) AS c FROM t_p71821556_real_estate_catalog_.leads WHERE {where_sql}"
                )
                total = int(cur.fetchone()['c'] or 0)

                cur.execute(
                    f"SELECT id, name, message, budget, company, request_category, lead_type, "
                    f"created_at, updated_at "
                    f"FROM t_p71821556_real_estate_catalog_.leads WHERE {where_sql} "
                    f"ORDER BY {order} LIMIT {limit} OFFSET {offset}"
                )
                rows = []
                for r in cur.fetchall():
                    d = dict(r)
                    for k in ('created_at', 'updated_at'):
                        if d.get(k) is not None:
                            try:
                                d[k] = d[k].isoformat()
                            except Exception:
                                d[k] = str(d[k])
                    rows.append(d)
                return _ok({
                    'leads': rows,
                    'total': total,
                    'page': page,
                    'limit': limit,
                    'pages': (total + limit - 1) // limit if limit else 1,
                })

            if params.get('resource') == 'network_tenants':
                cur.execute(
                    "SELECT id, name, message, budget, company, phone, email, request_category, created_at "
                    "FROM t_p71821556_real_estate_catalog_.leads "
                    "WHERE is_network_tenant = TRUE "
                    "ORDER BY created_at DESC"
                )
                rows = []
                for r in cur.fetchall():
                    d = dict(r)
                    if d.get('created_at') is not None:
                        d['created_at'] = d['created_at'].isoformat()
                    rows.append(d)
                return _ok({'tenants': rows})

            if params.get('resource') == 'sitemap':
                cur.execute(
                    "SELECT site_url FROM t_p71821556_real_estate_catalog_.settings ORDER BY id ASC LIMIT 1"
                )
                row = cur.fetchone()
                base = (row.get('site_url') if row else None) or 'https://biznest.poehali.dev'
                base = base.rstrip('/')
                cur.execute(
                    "SELECT id, title, slug, updated_at FROM t_p71821556_real_estate_catalog_.listings "
                    "WHERE status = 'active' ORDER BY updated_at DESC LIMIT 5000"
                )
                rows = cur.fetchall()
                items = []
                items.append(f'<url><loc>{base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>')
                for p in ['catalog', 'map', 'network-tenants']:
                    items.append(f'<url><loc>{base}/{p}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>')
                for r in rows:
                    rid = r['id']
                    slug = r.get('slug') or _make_slug(r.get('title') or '', rid)
                    upd = r['updated_at'].date().isoformat() if r.get('updated_at') else ''
                    items.append(
                        f'<url><loc>{base}/object/{slug}</loc>'
                        + (f'<lastmod>{upd}</lastmod>' if upd else '')
                        + '<changefreq>weekly</changefreq><priority>0.7</priority></url>'
                    )
                xml = (
                    '<?xml version="1.0" encoding="UTF-8"?>\n'
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                    + '\n'.join(items)
                    + '\n</urlset>'
                )
                return {
                    'statusCode': 200,
                    'headers': {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/xml; charset=utf-8',
                    },
                    'body': xml,
                }

            if params.get('resource') == 'agents':
                cur.execute(
                    "SELECT id, name, phone, avatar, role "
                    "FROM t_p71821556_real_estate_catalog_.users "
                    "WHERE is_active = TRUE AND role IN ('admin','editor','manager','broker','director','office_manager') "
                    "ORDER BY id ASC"
                )
                return _ok({'agents': [dict(r) for r in cur.fetchall()]})

            if params.get('resource') == 'public_stats':
                cur.execute(
                    "SELECT COUNT(*) AS c FROM t_p71821556_real_estate_catalog_.listings WHERE status = 'active'"
                )
                total = cur.fetchone()['c']
                cur.execute(
                    "SELECT main_city FROM t_p71821556_real_estate_catalog_.settings ORDER BY id ASC LIMIT 1"
                )
                row = cur.fetchone()
                cur.execute(
                    "SELECT category, COUNT(*) AS c "
                    "FROM t_p71821556_real_estate_catalog_.listings "
                    "WHERE status = 'active' GROUP BY category"
                )
                by_cat = {r['category']: r['c'] for r in cur.fetchall()}
                cur.execute(
                    "SELECT deal, COUNT(*) AS c "
                    "FROM t_p71821556_real_estate_catalog_.listings "
                    "WHERE status = 'active' GROUP BY deal"
                )
                by_deal = {r['deal']: r['c'] for r in cur.fetchall()}
                return _ok({
                    'total': total,
                    'main_city': (row['main_city'] if row else 'Краснодар'),
                    'by_category': by_cat,
                    'by_deal': by_deal,
                })

            if params.get('resource') == 'similar' and params.get('id'):
                try:
                    sid = int(params.get('id'))
                except (TypeError, ValueError):
                    return _ok({'listings': []})
                cur.execute(
                    "SELECT category, deal, price, district, city "
                    "FROM t_p71821556_real_estate_catalog_.listings WHERE id = "
                    + str(sid)
                )
                src = cur.fetchone()
                if not src:
                    return _ok({'listings': []})
                cat = (src.get('category') or '').replace("'", "''")
                deal = (src.get('deal') or '').replace("'", "''")
                price = src.get('price') or 0
                district = (src.get('district') or '').replace("'", "''")
                price_min = int(float(price) * 0.6) if price else 0
                price_max = int(float(price) * 1.5) if price else 0
                base_where = (
                    f"status = 'active' AND id <> {sid} "
                    f"AND category = '{cat}' AND deal = '{deal}'"
                )
                if price:
                    base_where += f" AND price BETWEEN {price_min} AND {price_max}"
                order_by = (
                    f"CASE WHEN district = '{district}' THEN 0 ELSE 1 END, "
                    f"ABS(price - {int(price) if price else 0}), created_at DESC"
                )
                cur.execute(
                    "SELECT * FROM t_p71821556_real_estate_catalog_.listings WHERE "
                    + base_where + " ORDER BY " + order_by + " LIMIT 12"
                )
                rows = cur.fetchall()
                if len(rows) < 4:
                    # добиваем без фильтра по цене
                    cur.execute(
                        "SELECT * FROM t_p71821556_real_estate_catalog_.listings WHERE "
                        f"status = 'active' AND id <> {sid} AND category = '{cat}' AND deal = '{deal}' "
                        f"ORDER BY {order_by} LIMIT 12"
                    )
                    rows = cur.fetchall()
                return _ok({'listings': [_serialize(dict(r)) for r in rows]})

            listing_id = params.get('id')
            if listing_id:
                cur.execute(
                    "SELECT l.*, "
                    "  COALESCE(NULLIF(pc.name, ''), l.owner_name) AS owner_name_final, "
                    "  COALESCE(pc.phone, l.owner_phone) AS owner_phone_final "
                    "FROM t_p71821556_real_estate_catalog_.listings l "
                    "LEFT JOIN t_p71821556_real_estate_catalog_.phone_contacts pc ON pc.id = l.owner_phone_contact_id "
                    "WHERE l.id = "
                    + str(int(listing_id))
                    + " AND (l.is_visible IS NULL OR l.is_visible = TRUE)"
                )
                row = cur.fetchone()
                if not row:
                    return {
                        'statusCode': 404,
                        'headers': {'Access-Control-Allow-Origin': '*'},
                        'body': json.dumps({'error': 'Not found'}),
                    }
                d = dict(row)
                if d.get('owner_name_final'):
                    d['owner_name'] = d['owner_name_final']
                if d.get('owner_phone_final'):
                    d['owner_phone'] = d['owner_phone_final']
                d.pop('owner_name_final', None)
                d.pop('owner_phone_final', None)
                return _ok({'listing': _serialize(d)})

            where = ["status = 'active'", "(is_visible IS NULL OR is_visible = TRUE)"]
            category = params.get('category')
            deal = params.get('deal')
            search = params.get('search')
            min_area = params.get('min_area')
            max_price = params.get('max_price')

            if category and category != 'all':
                cat_safe = category.replace("'", "''")
                where.append(f"category = '{cat_safe}'")
            if deal and deal != 'all':
                deal_safe = deal.replace("'", "''")
                where.append(f"deal = '{deal_safe}'")
            if search:
                s = search.replace("'", "''").lower()
                where.append(
                    f"(LOWER(title) LIKE '%{s}%' OR LOWER(address) LIKE '%{s}%' OR LOWER(district) LIKE '%{s}%')"
                )
            if min_area:
                try:
                    where.append(f"area >= {int(min_area)}")
                except ValueError:
                    pass
            if max_price:
                try:
                    where.append(f"price <= {int(max_price)}")
                except ValueError:
                    pass

            sql = (
                "SELECT * FROM t_p71821556_real_estate_catalog_.listings WHERE "
                + " AND ".join(where)
                + " ORDER BY last_edited_at DESC NULLS LAST, is_hot DESC, is_new DESC, "
                + "updated_at DESC NULLS LAST, created_at DESC, id DESC"
            )
            cur.execute(sql)
            rows = cur.fetchall()
            items = [_serialize(dict(r)) for r in rows]

            return _ok({'listings': items, 'total': len(items)})
    finally:
        conn.close()


_RU_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}


def _make_slug(title: str, listing_id: int) -> str:
    s = (title or '').lower()
    out = []
    for ch in s:
        out.append(_RU_MAP.get(ch, ch))
    s = ''.join(out)
    clean = []
    for ch in s:
        if ch.isalnum():
            clean.append(ch)
        elif ch in (' ', '-', '_'):
            clean.append('-')
    s = ''.join(clean)
    while '--' in s:
        s = s.replace('--', '-')
    s = s.strip('-')[:80].rstrip('-') or 'object'
    return f"{s}-{listing_id}"


def _serialize(row: dict) -> dict:
    if row.get('tags'):
        row['tags'] = [t.strip() for t in str(row['tags']).split(',') if t.strip()]
    else:
        row['tags'] = []
    for k in ('lat', 'lng', 'monthly_rent', 'yearly_rent', 'ceiling_height', 'electricity_kw'):
        if row.get(k) is not None:
            try:
                row[k] = float(row[k])
            except (TypeError, ValueError):
                row[k] = None
    # Сериализуем ВСЕ datetime-поля автоматически — БД может вернуть их в разных колонках
    for k, v in list(row.items()):
        if hasattr(v, 'isoformat'):
            try:
                row[k] = v.isoformat()
            except Exception:
                row[k] = str(v)

    # Авто-вывод одного из арендных потоков из другого
    mr = row.get('monthly_rent')
    yr = row.get('yearly_rent')
    if mr and not yr:
        row['yearly_rent'] = round(mr * 12, 2)
    elif yr and not mr:
        row['monthly_rent'] = round(yr / 12, 2)

    # Авто-расчёт окупаемости (месяцы), если не задана:
    # price / (monthly_rent or profit)
    if not row.get('payback'):
        income = row.get('monthly_rent') or row.get('profit')
        price = row.get('price')
        try:
            if income and price and float(income) > 0:
                row['payback'] = int(round(float(price) / float(income)))
        except (TypeError, ValueError):
            pass

    return row


def _ok(body: dict) -> dict:
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }