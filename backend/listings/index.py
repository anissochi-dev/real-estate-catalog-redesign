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
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if method != 'GET':
        return {
            'statusCode': 405,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Method not allowed'}),
        }

    params = event.get('queryStringParameters') or {}
    dsn = os.environ['DATABASE_URL']

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if params.get('resource') == 'public_settings':
                cur.execute(
                    "SELECT company_name, company_phone, company_email, company_address, "
                    "hero_title, hero_subtitle, about_text, logo_url, main_city, "
                    "watermark_url, watermark_enabled, watermark_position, watermark_opacity, "
                    "yandex_maps_api_key, yandex_metrika_id, google_analytics_id, "
                    "company_since_year, site_url, seo_keywords, seo_description "
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

            listing_id = params.get('id')
            if listing_id:
                cur.execute(
                    "SELECT * FROM t_p71821556_real_estate_catalog_.listings WHERE id = "
                    + str(int(listing_id))
                )
                row = cur.fetchone()
                if not row:
                    return {
                        'statusCode': 404,
                        'headers': {'Access-Control-Allow-Origin': '*'},
                        'body': json.dumps({'error': 'Not found'}),
                    }
                item = _serialize(dict(row))
                return _ok({'listing': item})

            where = ["status = 'active'"]
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
                + " ORDER BY is_hot DESC, is_new DESC, created_at DESC"
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
    for k in ('lat', 'lng', 'monthly_rent', 'yearly_rent'):
        if row.get(k) is not None:
            try:
                row[k] = float(row[k])
            except (TypeError, ValueError):
                row[k] = None
    for k in ('created_at', 'updated_at'):
        if row.get(k) is not None:
            row[k] = row[k].isoformat()

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
        'body': json.dumps(body, ensure_ascii=False),
    }