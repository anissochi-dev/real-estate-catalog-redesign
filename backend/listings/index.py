"""
Business: API для каталога коммерческой недвижимости — список и детали объектов.
Args: event с httpMethod (GET), queryStringParameters (category, deal, search, min_area, max_price, id); context
Returns: HTTP-ответ с JSON массивом объектов или одним объектом
"""

import json
import os
import time
import psycopg2
from psycopg2.extras import RealDictCursor

_MEM_CACHE: dict = {}
_CACHE_TTL = 180


def _cache_get(key: str):
    entry = _MEM_CACHE.get(key)
    if entry and time.time() - entry['ts'] < _CACHE_TTL:
        return entry['data']
    return None


def _cache_set(key: str, data):
    _MEM_CACHE[key] = {'ts': time.time(), 'data': data}


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
        if action not in ('consent_save', 'consent_check'):
            return {
                'statusCode': 405,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Method not allowed'}),
            }

        # Извлекаем IP из заголовков
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

        def _esc(s):
            return str(s or '').replace("'", "''")[:1000]

        ip_e = _esc(ip)

        # ── consent_check: проверяем по IP есть ли согласие за последний год ──
        if action == 'consent_check':
            if not ip or not ip_e:
                return _ok({'accepted': False})
            # Rate-limit: не более 30 проверок с одного IP в минуту
            conn = psycopg2.connect(dsn)
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT id, accepted_at FROM t_p71821556_real_estate_catalog_.consent_log "
                        "WHERE ip_address = %s "
                        "AND accepted_at > NOW() - INTERVAL '1 year' "
                        "ORDER BY accepted_at DESC LIMIT 1",
                        (ip[:45],)
                    )
                    row = cur.fetchone()
                    if row:
                        return _ok({'accepted': True, 'id': int(row['id'])})
                    return _ok({'accepted': False})
            finally:
                conn.close()

        # ── consent_save ──────────────────────────────────────────────────────
        docs_opened = body.get('documents_opened') or []
        page_url = (body.get('page_url') or '')[:500]
        session_id = (body.get('session_id') or '')[:100]
        ua_clean = (ua or '')[:500]

        if isinstance(docs_opened, list):
            docs_clean = [str(d)[:50] for d in docs_opened if d]
        else:
            docs_clean = []
        docs_json = json.dumps(docs_clean, ensure_ascii=False)

        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Дедуп по IP за последний год — обновляем вместо дублирования
                cur.execute(
                    "SELECT id, documents_opened FROM t_p71821556_real_estate_catalog_.consent_log "
                    "WHERE ip_address = %s "
                    "AND accepted_at > NOW() - INTERVAL '1 year' "
                    "ORDER BY accepted_at DESC LIMIT 1",
                    (ip[:45],)
                )
                existing = cur.fetchone()
                if existing:
                    old_docs = existing.get('documents_opened') or []
                    if isinstance(old_docs, str):
                        try:
                            old_docs = json.loads(old_docs)
                        except Exception:
                            old_docs = []
                    merged = list({*([str(d) for d in old_docs]), *docs_clean})
                    merged_json = json.dumps(merged, ensure_ascii=False)
                    cur.execute(
                        "UPDATE t_p71821556_real_estate_catalog_.consent_log "
                        "SET documents_opened = %s::jsonb, user_agent = %s, "
                        "page_url = %s, session_id = %s, accepted_at = NOW() "
                        "WHERE id = %s RETURNING id",
                        (merged_json, ua_clean, page_url, session_id, int(existing['id']))
                    )
                    new_id = cur.fetchone()['id']
                else:
                    cur.execute(
                        "INSERT INTO t_p71821556_real_estate_catalog_.consent_log "
                        "(ip_address, user_agent, documents_opened, page_url, session_id) "
                        "VALUES (%s, %s, %s::jsonb, %s, %s) RETURNING id",
                        (ip[:45], ua_clean, docs_json, page_url, session_id)
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
                    "home_listings_limit, catalog_page_size, news_list_limit, category_page_size, leads_page_size, "
                    "show_news_on_home, home_news_limit, show_leads_on_home, home_leads_limit "
                    "FROM t_p71821556_real_estate_catalog_.settings ORDER BY id ASC LIMIT 1"
                )
                row = cur.fetchone()
                return _ok({'settings': dict(row) if row else {}}, cache='public, max-age=300, stale-while-revalidate=60')

            if params.get('resource') == 'districts':
                city_f = (params.get('city') or '').strip()[:100]
                if city_f:
                    cur.execute(
                        "SELECT id, name, slug, city, description, sort_order "
                        "FROM t_p71821556_real_estate_catalog_.districts "
                        "WHERE is_active = TRUE AND city = %s "
                        "ORDER BY sort_order ASC, name ASC",
                        (city_f,)
                    )
                else:
                    cur.execute(
                        "SELECT id, name, slug, city, description, sort_order "
                        "FROM t_p71821556_real_estate_catalog_.districts "
                        "WHERE is_active = TRUE "
                        "ORDER BY sort_order ASC, name ASC"
                    )
                districts = [dict(r) for r in cur.fetchall()]
                # Количество активных объектов в каждом районе — параметризованный запрос
                for d in districts:
                    cur.execute(
                        "SELECT COUNT(*) AS c FROM t_p71821556_real_estate_catalog_.listings "
                        "WHERE status = 'active' AND district = %s",
                        (d['name'],)
                    )
                    d['listings_count'] = cur.fetchone()['c']
                return _ok({'districts': districts}, cache='public, max-age=300, stale-while-revalidate=60')

            if params.get('resource') == 'public_purposes':
                cur.execute(
                    "SELECT id, name, slug, icon FROM t_p71821556_real_estate_catalog_.purposes "
                    "WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC"
                )
                return _ok({'purposes': [dict(r) for r in cur.fetchall()]}, cache='public, max-age=3600, stale-while-revalidate=300')

            if params.get('resource') == 'public_land_vri':
                cur.execute(
                    "SELECT id, name, slug FROM t_p71821556_real_estate_catalog_.land_vri "
                    "WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC"
                )
                return _ok({'land_vri': [dict(r) for r in cur.fetchall()]}, cache='public, max-age=3600, stale-while-revalidate=300')

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
                return _ok({'leads': rows}, cache='public, max-age=120, stale-while-revalidate=30')

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

            if params.get('resource') == 'sitemap_index':
                cur.execute(
                    "SELECT site_url FROM t_p71821556_real_estate_catalog_.settings ORDER BY id ASC LIMIT 1"
                )
                row = cur.fetchone()
                base = (row.get('site_url') if row else None) or 'https://biznest.poehali.dev'
                base = base.rstrip('/')
                sitemaps = [
                    f'{base}/listings-sitemap.xml',
                    f'{base}/news-sitemap.xml',
                    f'{base}/pages-sitemap.xml',
                ]
                sitemap_entries = '\n'.join(
                    f'<sitemap><loc>{loc}</loc></sitemap>' for loc in sitemaps
                )
                xml = (
                    '<?xml version="1.0" encoding="UTF-8"?>\n'
                    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                    + sitemap_entries
                    + '\n</sitemapindex>'
                )
                return {
                    'statusCode': 200,
                    'headers': {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/xml; charset=utf-8',
                    },
                    'body': xml,
                }

            if params.get('resource') == 'sitemap':
                cur.execute(
                    "SELECT site_url FROM t_p71821556_real_estate_catalog_.settings ORDER BY id ASC LIMIT 1"
                )
                row = cur.fetchone()
                base = (row.get('site_url') if row else None) or 'https://biznest.poehali.dev'
                base = base.rstrip('/')

                cur.execute(
                    "SELECT id, title, slug, updated_at, is_hot, is_new, image "
                    "FROM t_p71821556_real_estate_catalog_.listings "
                    "WHERE status = 'active' ORDER BY updated_at DESC LIMIT 5000"
                )
                listing_rows = cur.fetchall()

                cur.execute(
                    "SELECT slug, published_at FROM t_p71821556_real_estate_catalog_.news "
                    "WHERE status = 'published' ORDER BY published_at DESC LIMIT 1000"
                )
                news_rows = cur.fetchall()

                category_slugs = [
                    'office', 'retail', 'warehouse', 'restaurant', 'hotel',
                    'business', 'gab', 'production', 'land', 'building',
                    'free_purpose', 'car_service',
                ]

                # Берём районы из справочника (slug уже правильный)
                cur.execute(
                    "SELECT slug FROM t_p71821556_real_estate_catalog_.districts "
                    "WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC"
                )
                district_rows = cur.fetchall()

                items = []
                # Главная
                items.append(f'<url><loc>{base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>')
                # Основные страницы
                for p in ['catalog', 'map', 'network-tenants']:
                    items.append(f'<url><loc>{base}/{p}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>')
                # Категории
                for cat in category_slugs:
                    items.append(
                        f'<url><loc>{base}/catalog/{cat}</loc>'
                        '<changefreq>weekly</changefreq><priority>0.8</priority></url>'
                    )
                # Объекты
                for r in listing_rows:
                    rid = r['id']
                    slug = r.get('slug') or _make_slug(r.get('title') or '', rid)
                    upd = r['updated_at'].date().isoformat() if r.get('updated_at') else ''
                    if r.get('is_hot'):
                        priority = '0.9'
                    elif r.get('is_new'):
                        priority = '0.8'
                    else:
                        priority = '0.7'
                    img_tag = ''
                    if r.get('image'):
                        img_url = str(r['image']).replace('&', '&amp;')
                        img_tag = f'<image:image><image:loc>{img_url}</image:loc></image:image>'
                    items.append(
                        f'<url><loc>{base}/object/{slug}</loc>'
                        + (f'<lastmod>{upd}</lastmod>' if upd else '')
                        + f'<changefreq>weekly</changefreq><priority>{priority}</priority>'
                        + img_tag
                        + '</url>'
                    )
                # Страницы районов из справочника
                for dr in district_rows:
                    d_slug = dr.get('slug') or ''
                    if not d_slug:
                        continue
                    items.append(
                        f'<url><loc>{base}/district/{d_slug}</loc>'
                        '<changefreq>weekly</changefreq><priority>0.7</priority></url>'
                    )
                # Новости
                for n in news_rows:
                    news_slug = n.get('slug') or ''
                    if not news_slug:
                        continue
                    pub = n['published_at'].date().isoformat() if n.get('published_at') else ''
                    items.append(
                        f'<url><loc>{base}/news/{news_slug}</loc>'
                        + (f'<lastmod>{pub}</lastmod>' if pub else '')
                        + '<changefreq>monthly</changefreq><priority>0.6</priority></url>'
                    )

                xml = (
                    '<?xml version="1.0" encoding="UTF-8"?>\n'
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
                    ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
                    + '\n'.join(items)
                    + '\n</urlset>'
                )
                return {
                    'statusCode': 200,
                    'headers': {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/xml; charset=utf-8',
                        'X-Sitemap-Count': str(len(items)),
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
                return _ok({'agents': [dict(r) for r in cur.fetchall()]}, cache='public, max-age=300, stale-while-revalidate=60')

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
                }, cache='public, max-age=300, stale-while-revalidate=60')

            if params.get('resource') == 'public_home_data':
                # Все данные для главной страницы одним запросом
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
                cur.execute(
                    "SELECT COUNT(*) AS c FROM t_p71821556_real_estate_catalog_.leads "
                    "WHERE show_on_main = TRUE AND status IN ('new','in_progress')"
                )
                leads_total = int(cur.fetchone()['c'] or 0)
                return _ok({
                    'stats': {
                        'total': total,
                        'main_city': (row['main_city'] if row else 'Краснодар'),
                        'by_category': by_cat,
                        'by_deal': by_deal,
                    },
                    'leads_count': leads_total,
                }, cache='public, max-age=300, stale-while-revalidate=60')

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
                # Без тяжёлых полей images / video_url — нужна только обложка
                similar_cols = (
                    "id, title, description, category, deal, price, price_per_m2, area, "
                    "payback, profit, floor, total_floors, address, district, lat, lng, "
                    "image, tags, is_hot, is_new, is_exclusive, is_urgent, public_code, "
                    "tenant_name, monthly_rent, yearly_rent, purpose, finishing, "
                    "ceiling_height, electricity_kw, utilities, road_line, "
                    "updated_at, created_at, last_edited_at"
                )
                cur.execute(
                    f"SELECT {similar_cols} FROM t_p71821556_real_estate_catalog_.listings WHERE "
                    + base_where + " ORDER BY " + order_by + " LIMIT 12"
                )
                rows = cur.fetchall()
                if len(rows) < 4:
                    # добиваем без фильтра по цене
                    cur.execute(
                        f"SELECT {similar_cols} FROM t_p71821556_real_estate_catalog_.listings WHERE "
                        f"status = 'active' AND id <> {sid} AND category = '{cat}' AND deal = '{deal}' "
                        f"ORDER BY {order_by} LIMIT 12"
                    )
                    rows = cur.fetchall()
                return _ok({'listings': [_serialize(dict(r)) for r in rows]}, cache='public, max-age=120, stale-while-revalidate=30')

            listing_id = params.get('id')
            if listing_id:
                cur.execute(
                    "SELECT l.*, "
                    "  COALESCE(NULLIF(pc.name, ''), l.owner_name) AS owner_name_final, "
                    "  COALESCE(pc.phone, l.owner_phone) AS owner_phone_final, "
                    "  lv.name AS land_vri_name "
                    "FROM t_p71821556_real_estate_catalog_.listings l "
                    "LEFT JOIN t_p71821556_real_estate_catalog_.phone_contacts pc ON pc.id = l.owner_phone_contact_id "
                    "LEFT JOIN t_p71821556_real_estate_catalog_.land_vri lv ON lv.slug = l.land_vri "
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
                # ВРИ: показываем читаемое имя из справочника (если ВРИ удалён — оставляем slug)
                if d.get('land_vri_name'):
                    d['land_vri'] = d['land_vri_name']
                d.pop('owner_name_final', None)
                d.pop('owner_phone_final', None)
                d.pop('land_vri_name', None)
                return _ok({'listing': _serialize(d)}, cache='public, max-age=120, stale-while-revalidate=30')

            where = ["status = 'active'", "(is_visible IS NULL OR is_visible = TRUE)"]
            category = params.get('category')
            deal = params.get('deal')
            search = params.get('search')
            min_area = params.get('min_area')
            max_price = params.get('max_price')
            limit_param = params.get('limit')
            offset_param = params.get('offset')

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

            where_clause = " AND ".join(where)
            order_clause = (
                " ORDER BY last_edited_at DESC NULLS LAST, is_hot DESC, is_new DESC, "
                "updated_at DESC NULLS LAST, created_at DESC, id DESC"
            )

            # Пагинация
            try:
                limit_val = int(limit_param) if limit_param else None
                offset_val = int(offset_param) if offset_param else 0
            except (ValueError, TypeError):
                limit_val = None
                offset_val = 0

            # In-memory кеш для простых запросов без фильтров
            is_simple = not any([category, deal, search, min_area, max_price])
            cache_key = f"listings:{limit_val}:{offset_val}" if is_simple else None
            if cache_key:
                cached = _cache_get(cache_key)
                if cached:
                    conn.close()
                    return _ok(cached, cache='public, max-age=180, stale-while-revalidate=60')

            # Один запрос: COUNT(*) OVER() + данные — без второго round-trip к БД
            pagination = ""
            if limit_val and limit_val > 0:
                pagination = f" LIMIT {limit_val} OFFSET {offset_val}"

            # Явный список полей БЕЗ тяжёлых images / video_url / SEO-полей.
            # Карточкам нужна только обложка `image`. Доп. фото и галерея
            # подтягиваются на странице объекта через fetchListingById.
            cols = (
                "id, title, description, category, deal, price, price_per_m2, area, "
                "payback, profit, floor, total_floors, address, district, lat, lng, "
                "image, tags, is_hot, is_new, is_exclusive, is_urgent, public_code, "
                "tenant_name, monthly_rent, yearly_rent, purpose, finishing, "
                "ceiling_height, electricity_kw, utilities, road_line, "
                "updated_at, created_at, last_edited_at"
            )

            sql = (
                f"SELECT {cols}, COUNT(*) OVER() AS _total_count "
                f"FROM t_p71821556_real_estate_catalog_.listings "
                f"WHERE {where_clause}{order_clause}{pagination}"
            )
            cur.execute(sql)
            rows = cur.fetchall()
            total = int(rows[0]['_total_count']) if rows else 0
            items = [_serialize({k: v for k, v in dict(r).items() if k != '_total_count'}) for r in rows]

            result = {'listings': items, 'total': total}
            if cache_key:
                _cache_set(cache_key, result)
            return _ok(result, cache='public, max-age=180, stale-while-revalidate=60')
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


def _ok(body: dict, cache: str = 'public, max-age=60, stale-while-revalidate=30') -> dict:
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
            'Cache-Control': cache,
        },
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }