"""
router.py — маршрутизация одобренных постов из соцсетей.

После модерации пост уходит в одно из трёх мест:
  leads    — заявка (покупатель/арендатор ищет ИЛИ собственник предлагает)
  listings — объект в каталог (черновик, на модерации)
  market   — рыночная статистика (market_listings, без модерации)
"""

import re
from core import SCHEMA

CATEGORY_MAP = {
    'office': 'office', 'retail': 'retail', 'warehouse': 'warehouse',
    'production': 'production', 'catering': 'catering', 'free_purpose': 'free_purpose',
    'building': 'building', 'land': 'land', 'car_service': 'car_service',
    'gab': 'gab', 'hotel': 'hotel', 'other': 'other',
}

CAT_RU = {
    'office': 'Офис', 'retail': 'Торговое', 'warehouse': 'Склад',
    'production': 'Производство', 'catering': 'Общепит',
    'free_purpose': 'ПСН', 'building': 'Здание', 'land': 'Земля',
    'car_service': 'Автосервис', 'gab': 'ГАБ', 'hotel': 'Гостиница',
    'other': 'Помещение',
}
DEAL_RU = {'sale': 'Продажа', 'rent': 'Аренда'}


def _s(v, limit=None):
    """Экранирует строку для SQL."""
    s = str(v or '').replace("'", "''")
    return s[:limit] if limit else s


def _norm_phone(raw):
    if not raw:
        return ''
    digits = re.sub(r'[^\d]', '', str(raw))
    if len(digits) == 11 and digits.startswith('8'):
        digits = '7' + digits[1:]
    if len(digits) == 10:
        digits = '7' + digits
    return ('+' + digits) if digits else str(raw)


def _make_title(category, deal, area, address):
    parts = [CAT_RU.get(category, 'Помещение'), DEAL_RU.get(deal, '')]
    if area:
        parts.append(str(area) + ' м²')
    if address:
        parts.append(str(address)[:60])
    return ', '.join(p for p in parts if p)


# ═══════════════════════════════════════════════════════════════════════════════
# МАРШРУТ 1: В ЗАЯВКИ
# ═══════════════════════════════════════════════════════════════════════════════

def route_to_leads(conn, post, user_id, override=None):
    """Создаёт заявку в leads из поста соцсети. Возвращает id."""
    override = override or {}

    phone    = _norm_phone(override.get('phone') or post.get('detected_phone') or '')
    name     = str(override.get('name') or post.get('author_name') or 'Из соцсетей')[:100]
    message  = str(override.get('message') or (post.get('raw_text') or ''))[:500]
    budget   = override.get('budget') or post.get('detected_price')
    deal     = post.get('detected_deal') or 'sale'
    lead_type = str(override.get('lead_type') or 'offer')[:20]
    source   = 'social_' + str(post.get('platform') or 'unknown')[:40]

    budget_sql = str(int(budget)) if budget else 'NULL'
    cur = conn.cursor()

    # Контакт по телефону
    phone_contact_id = None
    if phone:
        cur.execute(
            "INSERT INTO " + SCHEMA + ".phone_contacts (phone, name) "
            "VALUES (%s, %s) "
            "ON CONFLICT (phone) DO UPDATE SET "
            "name = CASE WHEN " + SCHEMA + ".phone_contacts.name = '' "
            "THEN EXCLUDED.name ELSE " + SCHEMA + ".phone_contacts.name END "
            "RETURNING id",
            (phone[:30], name)
        )
        row = cur.fetchone()
        if row:
            phone_contact_id = row[0]

    pc_sql = str(phone_contact_id) if phone_contact_id else 'NULL'

    cur.execute(
        "INSERT INTO " + SCHEMA + ".leads "
        "(name, phone, message, source, status, lead_type, budget, phone_contact_id) "
        "VALUES (%s, %s, %s, %s, 'new', %s, " + budget_sql + ", " + pc_sql + ") "
        "RETURNING id",
        (name, phone[:30], message, source[:50], lead_type)
    )
    lead_id = cur.fetchone()[0]

    post_id = post.get('id')
    if post_id:
        cur.execute(
            "UPDATE " + SCHEMA + ".social_posts SET "
            "status='approved_lead', route_to='leads', "
            "result_lead_id=" + str(lead_id) + ", "
            "moderated_by=" + str(user_id) + ", moderated_at=NOW() "
            "WHERE id=" + str(post_id)
        )

    conn.commit()
    cur.close()
    print('[router] пост ' + str(post.get('platform')) + '/' + str(post.get('post_id')) + ' → lead #' + str(lead_id))
    return lead_id


# ═══════════════════════════════════════════════════════════════════════════════
# МАРШРУТ 2: В КАТАЛОГ ОБЪЕКТОВ
# ═══════════════════════════════════════════════════════════════════════════════

def route_to_listings(conn, post, user_id, override=None):
    """Создаёт объект в listings (черновик). Возвращает id."""
    override = override or {}

    category = CATEGORY_MAP.get(
        str(override.get('category') or post.get('detected_category') or 'other'), 'other'
    )
    deal     = str(override.get('deal') or post.get('detected_deal') or 'sale')
    price    = override.get('price') or post.get('detected_price')
    area     = override.get('area') or post.get('detected_area')
    address  = str(override.get('address') or post.get('detected_address') or '')[:300]
    district = str(override.get('district') or post.get('detected_district') or '')[:100]
    phone    = _norm_phone(override.get('phone') or post.get('detected_phone') or '')[:30]
    desc     = str(override.get('description') or (post.get('raw_text') or ''))[:3000]
    title    = str(override.get('title') or _make_title(category, deal, area, address))[:500]
    status   = str(override.get('status') or 'moderation')

    photos   = post.get('photos') or []
    image    = str(photos[0])[:500] if photos else ''
    images   = '|'.join(str(p) for p in photos[:20]) if photos else ''

    price_sql = str(int(price)) if price else 'NULL'
    area_sql  = str(float(area)) if area else 'NULL'

    cur = conn.cursor()
    cur.execute(
        "INSERT INTO " + SCHEMA + ".listings "
        "(title, description, category, deal, price, area, address, district, "
        "owner_phone, image, images, status, author_id) "
        "VALUES (%s, %s, %s, %s, " + price_sql + ", " + area_sql + ", "
        "%s, %s, %s, %s, %s, %s, " + str(user_id) + ") "
        "RETURNING id",
        (title, desc, category, deal, address, district, phone, image, images, status)
    )
    listing_id = cur.fetchone()[0]

    post_id = post.get('id')
    if post_id:
        cur.execute(
            "UPDATE " + SCHEMA + ".social_posts SET "
            "status='approved_listing', route_to='listings', "
            "result_listing_id=" + str(listing_id) + ", "
            "moderated_by=" + str(user_id) + ", moderated_at=NOW() "
            "WHERE id=" + str(post_id)
        )

    conn.commit()
    cur.close()
    print('[router] пост → listing #' + str(listing_id))
    return listing_id


# ═══════════════════════════════════════════════════════════════════════════════
# МАРШРУТ 3: В РЫНОЧНУЮ СТАТИСТИКУ
# ═══════════════════════════════════════════════════════════════════════════════

def route_to_market(conn, post, user_id=0):
    """Сохраняет пост в market_listings для рыночной статистики."""
    platform = str(post.get('platform') or 'unknown')
    source   = 'social_' + platform
    ext_id   = platform + '_' + str(post.get('post_id') or '')
    category = CATEGORY_MAP.get(str(post.get('detected_category') or 'other'), 'other')
    deal     = str(post.get('detected_deal') or 'sale')
    price    = post.get('detected_price')
    area     = post.get('detected_area')
    ppm2     = round(price / area, 2) if price and area and float(area) > 0 else None
    address  = str(post.get('detected_address') or '')[:500]
    district = str(post.get('detected_district') or '')[:200]
    phone    = _norm_phone(post.get('detected_phone') or '')[:50]
    title    = str(post.get('raw_text') or '')[:500].split('\n')[0]
    url      = str(post.get('post_url') or '')[:500]

    price_sql = str(int(price)) if price else 'NULL'
    area_sql  = str(float(area)) if area else 'NULL'
    ppm2_sql  = str(ppm2) if ppm2 else 'NULL'

    cur = conn.cursor()
    cur.execute(
        "INSERT INTO " + SCHEMA + ".market_listings "
        "(source, external_id, url, title, category, deal_type, "
        "price, price_per_m2, area, address, district, phone, scraped_at) "
        "VALUES (%s, %s, %s, %s, %s, %s, "
        + price_sql + ", " + ppm2_sql + ", " + area_sql + ", "
        "%s, %s, %s, NOW()) "
        "ON CONFLICT (source, external_id) DO UPDATE SET "
        "price=" + price_sql + ", scraped_at=NOW() "
        "RETURNING id",
        (source[:50], ext_id[:200], url, title, category, deal,
         address, district, phone)
    )
    row = cur.fetchone()
    market_id = row[0] if row else 0

    post_id = post.get('id')
    if post_id:
        cur.execute(
            "UPDATE " + SCHEMA + ".social_posts SET "
            "status='approved_listing', route_to='market', "
            "moderated_by=" + str(user_id) + ", moderated_at=NOW() "
            "WHERE id=" + str(post_id)
        )

    conn.commit()
    cur.close()
    return market_id


# ═══════════════════════════════════════════════════════════════════════════════
# ОТКЛОНЕНИЕ
# ═══════════════════════════════════════════════════════════════════════════════

def reject_post(conn, post_id, user_id, reason=''):
    """Отклоняет пост из очереди модерации."""
    reason_safe = str(reason or '')[:500].replace("'", "''")
    cur = conn.cursor()
    cur.execute(
        "UPDATE " + SCHEMA + ".social_posts SET "
        "status='rejected', "
        "reject_reason='" + reason_safe + "', "
        "moderated_by=" + str(user_id) + ", moderated_at=NOW() "
        "WHERE id=" + str(post_id) + " AND status='pending'"
    )
    affected = cur.rowcount
    conn.commit()
    cur.close()
    return affected > 0
