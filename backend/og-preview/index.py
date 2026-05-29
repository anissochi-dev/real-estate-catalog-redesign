"""
Генерирует HTML-страницу с og/twitter/vk мета-тегами для объекта недвижимости.
Используется для корректного шаринга в соцсетях и мессенджерах (боты не выполняют JS).
Args: GET ?id=<listing_id>
Returns: HTML с og-тегами + redirect на SPA
"""

import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
SITE_URL = 'https://bmn.su'
SITE_NAME = 'Бизнес. Маркетинг. Недвижимость.'
DEFAULT_IMAGE = 'https://cdn.poehali.dev/projects/4bce74f4-4dd7-424e-85e7-ff08f8399357/files/og-image-1779575751349.png'


def _html(title: str, description: str, image: str, url: str) -> str:
    t = title.replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')
    d = description.replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')
    i = image.replace('"', '&quot;')
    u = url.replace('"', '&quot;')
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>{t}</title>
<meta name="description" content="{d}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="{SITE_NAME}">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:url" content="{u}">
<meta property="og:image" content="{i}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ru_RU">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{i}">
<meta property="vk:image" content="{i}">
<meta http-equiv="refresh" content="0;url={u}">
<link rel="canonical" href="{u}">
</head>
<body>
<p><a href="{u}">{t}</a></p>
</body>
</html>"""


def handler(event: dict, context) -> dict:
    cors = {'Access-Control-Allow-Origin': '*'}

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {**cors, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'}, 'body': ''}

    params = event.get('queryStringParameters') or {}
    listing_id = params.get('id')

    if not listing_id:
        return {'statusCode': 302, 'headers': {'Location': SITE_URL, **cors}, 'body': ''}

    try:
        listing_id = int(listing_id)
    except (ValueError, TypeError):
        return {'statusCode': 302, 'headers': {'Location': SITE_URL, **cors}, 'body': ''}

    page_url = f'{SITE_URL}/property/{listing_id}'

    try:
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            f"SELECT title, description, seo_title, seo_description, image, images, city "
            f"FROM {SCHEMA}.listings "
            f"WHERE id = {listing_id} AND status = 'active' AND (is_visible IS NULL OR is_visible = TRUE)"
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
    except Exception:
        row = None

    if not row:
        return {'statusCode': 302, 'headers': {'Location': SITE_URL, **cors}, 'body': ''}

    d = dict(row)

    og_title = d.get('seo_title') or d.get('title') or SITE_NAME
    city = d.get('city') or 'Краснодар'
    if city and city not in og_title:
        og_title = f"{og_title} — {city} | {SITE_NAME}"

    raw_desc = d.get('seo_description') or d.get('description') or ''
    og_desc = raw_desc[:160] if raw_desc else SITE_NAME

    image = DEFAULT_IMAGE
    raw_images = d.get('images')
    if raw_images:
        try:
            imgs = json.loads(raw_images)
            if isinstance(imgs, list) and imgs:
                image = imgs[0]
        except (json.JSONDecodeError, TypeError):
            parts = [p.strip() for p in str(raw_images).split(',') if p.strip()]
            if parts:
                image = parts[0]
    if image == DEFAULT_IMAGE and d.get('image'):
        image = d['image']

    html = _html(og_title, og_desc, image, page_url)
    return {
        'statusCode': 200,
        'headers': {**cors, 'Content-Type': 'text/html; charset=utf-8'},
        'body': html,
    }