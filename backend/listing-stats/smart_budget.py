"""
Business: Smart Budget v2 — анализирует объекты по просмотрам и сроку экспозиции,
рекомендует приоритеты продвижения и рассчитывает бюджет для каждого канала.
Args: event GET; context
Returns: список объектов с приоритетом, рекомендованным бюджетом и каналами
"""

import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}

# Коэффициенты бюджета по цене объекта (% от цены в год → делим на 52 нед)
# Для аренды — от месячной ставки × 12
BUDGET_RATE = 0.003  # 0.3% от стоимости = рекомендованный месячный бюджет

# Минимальный и максимальный бюджет в рублях/мес
BUDGET_MIN = 5_000
BUDGET_MAX = 150_000

# Пороги для приоритетов
PRIORITY_HIGH_DAYS = 30     # висит >30 дней и мало просмотров → ВЫСОКИЙ
PRIORITY_MED_DAYS = 14      # висит >14 дней → СРЕДНИЙ
VIEWS_LOW = 5               # менее 5 просмотров за всё время → нужно продвигать

# Каналы по типу сделки
CHANNELS = {
    'sale': [
        {'name': 'Яндекс.Директ', 'icon': 'Y', 'color': 'red', 'share': 0.4},
        {'name': 'Авито', 'icon': 'A', 'color': 'green', 'share': 0.35},
        {'name': 'ЦИАН', 'icon': 'C', 'color': 'blue', 'share': 0.25},
    ],
    'rent': [
        {'name': 'Авито', 'icon': 'A', 'color': 'green', 'share': 0.45},
        {'name': 'Яндекс.Директ', 'icon': 'Y', 'color': 'red', 'share': 0.35},
        {'name': 'ЦИАН', 'icon': 'C', 'color': 'blue', 'share': 0.20},
    ],
}

CATEGORY_LABELS = {
    'office': 'Офис', 'building': 'Здание', 'warehouse': 'Склад',
    'retail': 'Торговое', 'free_purpose': 'Свободное', 'land': 'Земля',
    'production': 'Производство', 'garage': 'Гараж', 'other': 'Другое',
}


def _calc_budget(price: int, deal: str) -> int:
    """Рассчитывает рекомендованный месячный бюджет на продвижение."""
    if deal == 'rent':
        annual = price * 12
    else:
        annual = price
    budget = int(annual * BUDGET_RATE / 12)
    return max(BUDGET_MIN, min(BUDGET_MAX, budget))


def _priority(days: int, views: int) -> str:
    if days >= PRIORITY_HIGH_DAYS and views < VIEWS_LOW:
        return 'high'
    if days >= PRIORITY_MED_DAYS and views < VIEWS_LOW * 3:
        return 'medium'
    return 'low'


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def handler(event: dict, context) -> dict:
    """Анализирует объекты и возвращает рекомендации по продвижению с бюджетом."""

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(f"""
        SELECT
            l.id, l.title, l.price, l.deal, l.category, l.district, l.slug,
            EXTRACT(DAY FROM NOW() - l.created_at)::int AS days_on_market,
            COALESCE(SUM(CASE WHEN s.event_type='view_site' THEN s.count ELSE 0 END), 0)::int AS views_site,
            COALESCE(SUM(CASE WHEN s.event_type='view_avito' THEN s.count ELSE 0 END), 0)::int AS views_avito,
            COALESCE(SUM(CASE WHEN s.event_type='view_cian' THEN s.count ELSE 0 END), 0)::int AS views_cian,
            COALESCE(SUM(CASE WHEN s.event_type='lead' THEN s.count ELSE 0 END), 0)::int AS leads_count
        FROM {SCHEMA}.listings l
        LEFT JOIN {SCHEMA}.listing_stats s ON s.listing_id = l.id
        WHERE l.status = 'active'
        GROUP BY l.id, l.title, l.price, l.deal, l.category, l.district, l.slug, l.created_at
        ORDER BY days_on_market DESC, views_site ASC
    """)

    rows = cur.fetchall()
    conn.close()

    items = []
    total_budget = 0
    priority_counts = {'high': 0, 'medium': 0, 'low': 0}

    for row in rows:
        days = row['days_on_market'] or 0
        views = row['views_site'] + row['views_avito'] + row['views_cian']
        priority = _priority(days, views)
        budget = _calc_budget(row['price'], row['deal'])
        channels = CHANNELS.get(row['deal'], CHANNELS['sale'])

        channel_breakdown = [
            {
                'name': ch['name'],
                'color': ch['color'],
                'budget': int(budget * ch['share']),
            }
            for ch in channels
        ]

        # Конверсия: лиды / просмотры
        conversion = round(row['leads_count'] / views * 100, 1) if views > 0 else 0

        items.append({
            'id': row['id'],
            'title': row['title'],
            'slug': row['slug'],
            'price': row['price'],
            'deal': row['deal'],
            'category': CATEGORY_LABELS.get(row['category'], row['category']),
            'district': row['district'],
            'days_on_market': days,
            'views_total': views,
            'views_site': row['views_site'],
            'leads_count': row['leads_count'],
            'conversion': conversion,
            'priority': priority,
            'budget': budget,
            'channels': channel_breakdown,
        })

        if priority in ('high', 'medium'):
            total_budget += budget
        priority_counts[priority] += 1

    return _ok({
        'items': items,
        'summary': {
            'total_objects': len(items),
            'priority_high': priority_counts['high'],
            'priority_medium': priority_counts['medium'],
            'priority_low': priority_counts['low'],
            'total_budget_recommended': total_budget,
        },
    })