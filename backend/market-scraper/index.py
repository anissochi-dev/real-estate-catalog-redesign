"""
Парсер рынка коммерческой недвижимости Краснодара.
Объединяет market-scraper + market-full в одну функцию.

Источники: arrpro.ru, ayax.ru, cian.ru
Режимы:
  cron / next    — пошаговый парсинг arrpro (1 категория за вызов, без авторизации)
  reset          — сброс прогресса (admin/director)
  stats          — статистика прогресса (admin/director)
  facts          — обновить факты в ai_memory (admin/director)
  full_scan      — сбросить прогресс и начать заново (admin/director)
  progress       — статус по всем задачам (admin/director)
  debug_html     — диагностика HTML структуры (admin/director)
  (ручной запуск без action) — быстрый сбор из выбранных источников (admin/director)
"""

import datetime
import json
import os
import re
import time
import urllib.request
import urllib.error
import gzip
from html.parser import HTMLParser

import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
}

# ── Маппинги категорий ────────────────────────────────────────────────────────

CAT_MAP = {
    'офис': 'office', 'офисн': 'office',
    'торг': 'retail', 'магазин': 'retail', 'торговы': 'retail',
    'склад': 'warehouse',
    'производ': 'industrial', 'цех': 'industrial',
    'общепит': 'catering', 'кафе': 'catering', 'ресторан': 'catering',
    'псн': 'free_purpose', 'свободн': 'free_purpose', 'назначен': 'free_purpose',
    'здани': 'standalone', 'отдельно': 'standalone',
    'земл': 'land',
    'гараж': 'garage', 'автосерв': 'garage',
    'готовый арендн': 'gab', 'арендн бизнес': 'gab', 'габ': 'gab',
}

URL_CAT_MAP = {
    'sklad': 'warehouse', 'ofis': 'office',
    'torgovoe': 'retail', 'torgovlya': 'retail', 'magazin': 'retail',
    'obshchepit': 'catering', 'kafe': 'catering', 'restoran': 'catering',
    'proizvodstvo': 'industrial', 'promyshlennoe': 'industrial',
    'svobodnogo-naznacheniya': 'free_purpose', 'psn': 'free_purpose',
    'zdanie': 'standalone', 'otdelnoe': 'standalone',
    'zemelniy-uchastok': 'land', 'zemlya': 'land',
    'gab': 'gab', 'gotoviy-biznes': 'gab', 'arendnyy-biznes': 'gab',
    'gostinica': 'hotel', 'avtoservis': 'car_service', 'garazh': 'garage',
}

CAT_RU = {
    'office': 'Офис', 'retail': 'Торговое помещение', 'warehouse': 'Склад',
    'industrial': 'Производство', 'catering': 'Общепит', 'free_purpose': 'ПСН',
    'standalone': 'Отдельно стоящее здание', 'land': 'Земельный участок',
    'gab': 'ГАБ', 'hotel': 'Гостиница', 'car_service': 'Автосервис',
    'garage': 'Гараж', 'other': 'Коммерческая недвижимость',
}

DEAL_RU = {'sale': 'Продажа', 'rent': 'Аренда'}

# ── Очередь категорий arrpro ──────────────────────────────────────────────────

QUEUES = [
    ('svobodnogo-naznacheniya', 'sale'),
    ('torgovoe',               'sale'),
    ('ofis',                   'sale'),
    ('sklad',                  'sale'),
    ('zdanie',                 'sale'),
    ('obshchepit',             'sale'),
    ('proizvodstvo',           'sale'),
    ('zemelniy-uchastok',      'sale'),
    ('gab',                    'sale'),
    ('svobodnogo-naznacheniya','rent'),
    ('torgovoe',               'rent'),
    ('ofis',                   'rent'),
    ('sklad',                  'rent'),
    ('obshchepit',             'rent'),
    ('zdanie',                 'rent'),
]

# ── Районы ────────────────────────────────────────────────────────────────────

STREET_DISTRICT_MAP = {
    'фестивальн': 'ФМР', 'фмр': 'ФМР', 'чистяковск': 'ФМР',
    'героя пешков': 'ФМР', 'московск': 'ФМР', 'дзержинск': 'ФМР',
    'шевцов': 'ФМР', 'прокофьев': 'ФМР', 'бабушкин': 'ФМР',
    'ставропольск': 'ФМР', 'гагарин': 'ФМР',
    'цмр': 'ЦМР', 'красн': 'ЦМР', 'октябрьск': 'ЦМР',
    'им. Ленина': 'ЦМР', 'ленин': 'ЦМР', 'мира': 'ЦМР',
    'пушкин': 'ЦМР', 'суворов': 'ЦМР', 'кубанонабережн': 'ЦМР',
    'юмр': 'ЮМР', 'юбилейн': 'ЮМР', 'симферопольск': 'ЮМР',
    'уральск': 'ЮМР', 'адмирала трибуца': 'ЮМР', 'восточно-кругликовск': 'ЮМР',
    'гидростроит': 'Гидрострой', 'новороссийск': 'Гидрострой',
    'колосист': 'Гидрострой', 'звездн': 'Гидрострой',
    'музыкальн': 'Музыкальный', 'им. Петра Метальникова': 'Музыкальный',
    'черёмушк': 'Прикубанский', 'черемушк': 'Прикубанский',
    'прикубанск': 'Прикубанский', 'домбайск': 'Прикубанский',
    'ангарск': 'Прикубанский', 'осокин': 'Прикубанский',
    'индустриальн': 'Прикубанский',
    'карасунск': 'Карасунский', 'ростовское шоссе': 'Карасунский',
    'шоссе нефтяников': 'Карасунский', 'ярославск': 'Карасунский',
    'садовое кольцо': 'Карасунский',
    'западн': 'Западный', 'тургенев': 'Западный',
    'новознаменск': 'Новознаменский',
}


# ═══════════════════════════════════════════════════════════════════════════════
# УТИЛИТЫ
# ═══════════════════════════════════════════════════════════════════════════════

def _detect_category(text: str) -> str:
    t = (text or '').lower()
    for kw, cat in CAT_MAP.items():
        if kw in t:
            return cat
    return 'other'


def _detect_district(address: str):
    if not address:
        return None
    a = address.lower()
    for kw, dist in STREET_DISTRICT_MAP.items():
        if kw.lower() in a:
            return dist
    return None


def _clean_price(s) -> int | None:
    if not s:
        return None
    s = re.sub(r'[^\d]', '', str(s))
    return int(s) if s else None


def _clean_area(s) -> float | None:
    if not s:
        return None
    m = re.search(r'[\d]+[.,]?[\d]*', str(s).replace(' ', ''))
    return float(m.group().replace(',', '.')) if m else None


def _fetch(url: str, timeout: int = 20) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read(800_000)
            enc = r.headers.get('Content-Encoding', '')
        if enc == 'gzip' or (raw[:2] == b'\x1f\x8b'):
            try:
                raw = gzip.decompress(raw)
            except Exception:
                pass
        for e in ('utf-8', 'cp1251', 'latin-1'):
            try:
                return raw.decode(e, errors='replace')
            except Exception:
                continue
    except Exception as ex:
        print(f'[fetch] {url}: {ex}')
    return ''


def _auth(event) -> dict | None:
    """Проверяет токен, возвращает user или None."""
    headers_ev = event.get('headers') or {}
    headers_lc = {k.lower(): v for k, v in headers_ev.items()}
    token = headers_lc.get('x-auth-token') or headers_lc.get('x-authorization', '').replace('Bearer ', '')
    if not token:
        return None
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.users u "
        f"JOIN {SCHEMA}.sessions s ON s.user_id = u.id "
        f"WHERE s.token = %s AND s.expires_at > NOW() LIMIT 1", (token,)
    )
    user = cur.fetchone()
    cur.close(); conn.close()
    return dict(user) if user and user['role'] in ('admin', 'director') else None


# ═══════════════════════════════════════════════════════════════════════════════
# ПАРСЕР ARRPRO.RU
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_arrpro_page(html: str, deal_type: str) -> list[dict]:
    """
    Парсинг страницы каталога arrpro.ru.
    Лучшая версия из обоих файлов: извлекает цену, площадь, адрес, этаж, линию, состояние.
    """
    results = []
    seen_ids = set()

    url_matches = list(re.finditer(
        r'href=["\'](/katalog/[^"\']+\.php)[^"\']*["\'][^>]*class=["\'][^"\']*props__address',
        html, re.IGNORECASE
    ))
    positions = [(m.start(), m.group(1)) for m in url_matches]

    for idx, (pos, raw_url) in enumerate(positions):
        next_pos = positions[idx + 1][0] if idx + 1 < len(positions) else pos + 4000
        block = html[max(0, pos - 200): next_pos + 200]

        obj_url = 'https://krasnodar.arrpro.ru' + raw_url
        id_m = re.search(r'-(\d+)\.php', obj_url)
        ext_id = id_m.group(1) if id_m else f"arr_{idx}"
        if ext_id in seen_ids:
            continue
        seen_ids.add(ext_id)

        # Тип сделки строго из URL
        if any(x in obj_url for x in ('/prodam/', '/prodayu-', '/prodam-')):
            actual_deal = 'sale'
        elif any(x in obj_url for x in ('/arenda/', '/sdam-', '/snimu-', '/sdam/')):
            actual_deal = 'rent'
        else:
            actual_deal = deal_type

        # Цена
        pm = re.search(r'class=["\']props__price["\'][^>]*>\s*([\d\s]+)\s*руб', block)
        price = _clean_price(pm.group(1)) if pm else None
        if not price or price < 10_000:
            continue

        # Цена за м²
        p2m = re.search(r'class=["\']props__priceForM["\'][^>]*>\s*([\d\s]+)\s*руб', block)
        price_per_m2 = float(_clean_price(p2m.group(1))) if p2m and _clean_price(p2m.group(1)) else None

        # Площадь
        area = None
        area_opt_m = re.search(r'Площадь[:\s]+\s*([\d\s,\.]+)\s*(?:кв\.?\s*м|м²)', block, re.IGNORECASE)
        if area_opt_m:
            area = _clean_area(area_opt_m.group(1))
        elif price and price_per_m2 and price_per_m2 > 0:
            area = round(price / price_per_m2, 1)

        # Адрес
        addr_m = re.search(
            r'class=["\']props__address["\'][^>]*>.*?</(?:svg|use)>\s*</svg>\s*([^\n<]{5,150})\s*</a>',
            block, re.DOTALL
        )
        if not addr_m:
            addr_m2 = re.search(r'props__address[^>]*>(?:[^<]*<[^>]+>)*\s*([А-Яа-яёЁ][^\n<]{4,120})\s*</a>', block, re.DOTALL)
            address = addr_m2.group(1).strip() if addr_m2 else None
        else:
            address = addr_m.group(1).strip()

        # Этаж
        floor = total_floors = None
        floor_m = re.search(r'[Ээ]таж[:\s]+(\d{1,2})(?:\s*из\s*(\d{1,2}))?', block)
        if floor_m:
            f_val = int(floor_m.group(1))
            if 1 <= f_val <= 50:
                floor = f_val
                if floor_m.group(2):
                    total_floors = int(floor_m.group(2))

        # Линия
        road_line = None
        line_map = {'перв': '1 линия', 'втор': '2 линия', 'трет': '3 линия'}
        line_m = re.search(r'[Лл]иния[:\s]+([^\n<,]{3,30})', block)
        if line_m:
            lt = line_m.group(1).strip().lower()
            for kw, val in line_map.items():
                if kw in lt:
                    road_line = val
                    break
            if not road_line:
                digit_m = re.search(r'(\d)', lt)
                road_line = f"{digit_m.group(1)} линия" if digit_m else lt[:20]
        else:
            title_line_m = re.search(r'(\d)\s*лини', block, re.IGNORECASE)
            if title_line_m:
                road_line = f"{title_line_m.group(1)} линия"

        # Состояние
        condition = None
        cond_m = re.search(r'[Сс]остояние[:\s]+([^\n<,]{3,40})', block)
        if cond_m:
            condition = cond_m.group(1).strip()

        # Район
        district = _detect_district(address or '')
        if not district:
            dist_m = re.search(r'[Рр]айон[:\s]+([А-Яа-яёЁ\s\-]{3,40}?)(?:\.|,|<)', block)
            if dist_m:
                district = dist_m.group(1).strip()

        # Категория из URL
        category = 'other'
        for slug, cat in URL_CAT_MAP.items():
            if slug in obj_url:
                category = cat
                break
        if category == 'other' and address:
            category = _detect_category(address)

        title_parts = [CAT_RU.get(category, 'Объект'), DEAL_RU.get(actual_deal, '')]
        if area:
            title_parts.append(f'{area} м²')
        if address:
            title_parts.append(address[:60])
        title = ', '.join(p for p in title_parts if p)

        results.append({
            'source': 'arrpro',
            'external_id': ext_id,
            'url': obj_url,
            'title': title[:500],
            'category': category,
            'deal_type': actual_deal,
            'price': price,
            'price_per_m2': price_per_m2,
            'area': area,
            'address': address,
            'district': district,
            'floor': floor,
            'total_floors': total_floors,
            'condition': condition,
            'road_line': road_line,
        })

    return results


def _init_progress(cur):
    """Инициализирует записи прогресса для всех категорий если их нет."""
    for cat_slug, deal_type in QUEUES:
        cur.execute(
            f"INSERT INTO {SCHEMA}.market_scraper_progress "
            f"(source, category_slug, deal_type, last_page, is_done) "
            f"VALUES ('arrpro', %s, %s, 0, FALSE) "
            f"ON CONFLICT (source, category_slug, deal_type) DO NOTHING",
            (cat_slug, deal_type)
        )


def _has_next_page(html: str, page: int, items_count: int) -> bool:
    """Определяет есть ли следующая страница по нескольким признакам."""
    if re.search(rf'page/{page + 1}/', html):
        return True
    if re.search(rf'PAGEN_\d+={page + 1}', html):
        return True
    total_m = re.search(r'(\d+)\s*предложен', html)
    if total_m:
        total = int(total_m.group(1))
        has = total > page * max(items_count, 1)
        print(f'[arrpro] total_declared={total} page={page} per={items_count} has_next={has}')
        return has
    return False


# ── Пошаговый режим (1 категория за вызов) ───────────────────────────────────

def _scrape_arrpro_step(cur) -> dict:
    """
    Берёт первую незавершённую категорию из очереди и парсит её постранично.
    Обходит все страницы категории за один вызов (до 25 страниц).
    Прогресс сохраняется в market_scraper_progress.
    """
    _init_progress(cur)

    cur.execute(
        f"SELECT category_slug, deal_type, last_page, total_scraped "
        f"FROM {SCHEMA}.market_scraper_progress "
        f"WHERE source='arrpro' AND is_done=FALSE ORDER BY id ASC LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        return {'items': [], 'done': True, 'progress': 'Все категории обработаны'}

    cat_slug  = row['category_slug']
    deal_type = row['deal_type']
    start_page = int(row['last_page'] or 0) + 1

    base = f'https://krasnodar.arrpro.ru/katalog/{"prodam" if deal_type == "sale" else "arenda"}/{cat_slug}/'
    all_items = []
    last_page = start_page - 1
    is_cat_done = False

    for page in range(start_page, start_page + 25):
        url = base if page == 1 else f'{base}page/{page}/'
        html = _fetch(url, timeout=18)
        if not html or len(html) < 5000:
            print(f'[arrpro_step] {deal_type}/{cat_slug} p{page}: empty → done')
            is_cat_done = True
            break
        items = _parse_arrpro_page(html, deal_type)
        print(f'[arrpro_step] {deal_type}/{cat_slug} p{page}: {len(items)} items')
        if not items:
            is_cat_done = True
            break
        all_items.extend(items)
        last_page = page
        if not _has_next_page(html, page, len(items)):
            is_cat_done = True
            break

    cur.execute(
        f"UPDATE {SCHEMA}.market_scraper_progress "
        f"SET last_page=%s, is_done=%s, total_scraped=total_scraped+%s, updated_at=NOW() "
        f"WHERE source='arrpro' AND category_slug=%s AND deal_type=%s",
        (last_page, is_cat_done, len(all_items), cat_slug, deal_type)
    )

    cur.execute(
        f"SELECT COUNT(*) as total, SUM(CASE WHEN is_done THEN 1 ELSE 0 END) as done "
        f"FROM {SCHEMA}.market_scraper_progress WHERE source='arrpro'"
    )
    stat = cur.fetchone()
    total_tasks = int(stat['total'] or 0)
    done_tasks  = int(stat['done'] or 0) + int(is_cat_done)

    progress_str = (
        f'{deal_type}/{cat_slug} стр.{start_page}–{last_page} '
        f'({len(all_items)} объявлений) — задач: {done_tasks}/{total_tasks}'
    )
    return {
        'items': all_items,
        'done': False,
        'is_cat_done': is_cat_done,
        'progress': progress_str,
        'cat': cat_slug,
        'deal': deal_type,
    }


# ── Быстрый режим (ручной запуск, несколько страниц на категорию) ─────────────

def _scrape_arrpro_fast(max_pages: int = 5) -> list[dict]:
    """Быстрый сбор arrpro — до max_pages страниц на категорию."""
    results = []
    sale_cats = ['svobodnogo-naznacheniya', 'ofis', 'sklad', 'torgovoe',
                 'proizvodstvo', 'obshchepit', 'zdanie', 'zemelniy-uchastok']
    rent_cats = ['svobodnogo-naznacheniya', 'ofis', 'sklad', 'torgovoe', 'obshchepit', 'zdanie']

    for deal_type, cats in [('sale', sale_cats), ('rent', rent_cats)]:
        prefix = 'prodam' if deal_type == 'sale' else 'arenda'
        for cat_slug in cats:
            base = f'https://krasnodar.arrpro.ru/katalog/{prefix}/{cat_slug}/'
            for page in range(1, max_pages + 1):
                url = base if page == 1 else f'{base}page/{page}/'
                html = _fetch(url)
                if not html or len(html) < 5000:
                    break
                items = _parse_arrpro_page(html, deal_type)
                print(f'[arrpro_fast] {deal_type}/{cat_slug} p={page}: {len(items)}')
                if not items:
                    break
                results.extend(items)

    seen = set()
    return [r for r in results if r.get('external_id') and not seen.add(r['external_id'])]


# ═══════════════════════════════════════════════════════════════════════════════
# ПАРСЕР AYAX.RU
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_ayax_object_page(html: str, obj_id: str, deal_type: str) -> dict | None:
    """Парсинг страницы одного объявления ayax.ru по title и meta description."""
    title_m = re.search(r'<title>([^<]{10,300})</title>', html)
    if not title_m:
        return None
    title_raw = title_m.group(1)

    desc_m = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']{20,500})["\']', html)
    desc = desc_m.group(1) if desc_m else ''

    area_m = re.search(r'([\d\s,\.]+)\s*м²', title_raw)
    area = _clean_area(area_m.group(1)) if area_m else None

    price = None
    price_m = re.search(r'по стоимости\s+([\d\s]+)\s*руб', desc, re.I)
    if price_m:
        price = _clean_price(price_m.group(1))
    if not price:
        price_m = re.search(r'([\d\s]+)\s*руб\.?/м²', title_raw + ' ' + desc)
        if price_m and area:
            ppm2 = _clean_price(price_m.group(1))
            price = round(ppm2 * area) if ppm2 and area else None
    if not price:
        price_m = re.search(r'([\d\s]{5,})\s*[₽р]', title_raw + ' ' + desc)
        if price_m:
            price = _clean_price(price_m.group(1))
    if not price or price < 10_000:
        return None

    price_per_m2 = round(price / area, 2) if price and area and area > 0 else None

    category = _detect_category(title_raw)
    addr_m = re.search(r'(?:в\s+)?Краснодар[е,\s]+([^—\|<\n,]{5,100})', title_raw)
    address = addr_m.group(1).strip() if addr_m else None
    district = _detect_district(address or '')

    return {
        'source': 'ayax',
        'external_id': obj_id,
        'url': f'https://www.ayax.ru/commercial/{deal_type}/{obj_id}/',
        'title': title_raw[:400],
        'category': category,
        'deal_type': deal_type,
        'price': price,
        'price_per_m2': price_per_m2,
        'area': area,
        'address': address,
        'district': district,
    }


def _scrape_ayax(max_pages: int = 5) -> list[dict]:
    """Сбор из ayax.ru через sitemap — до 20 объектов за вызов."""
    MAX_ITEMS = 20
    results = []
    seen = set()

    sitemap = _fetch('https://www.ayax.ru/sitemap.xml', timeout=8)
    if not sitemap:
        return []

    urls = re.findall(r'<loc>(https://www\.ayax\.ru/commercial/[^<]+)</loc>', sitemap)
    for url in urls:
        deal_type = 'rent' if '/arenda/' in url or '/rent/' in url else 'sale'
        id_m = re.search(r'/(\d+)/?', url)
        if not id_m:
            continue
        obj_id = id_m.group(1)
        if obj_id in seen:
            continue
        seen.add(obj_id)
        html = _fetch(url, timeout=8)
        if not html:
            continue
        item = _parse_ayax_object_page(html, obj_id, deal_type)
        if item:
            results.append(item)
        if len(results) >= MAX_ITEMS:
            break
        time.sleep(0.05)

    print(f'[ayax] parsed {len(results)} objects')
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# ПАРСЕР CIAN.RU
# ═══════════════════════════════════════════════════════════════════════════════

GAB_KEYWORDS = ['готовый арендный', 'арендный бизнес', 'с арендатором',
                'доходность', 'окупаемост', 'арендный поток']


def _scrape_cian_gab(max_items: int = 30) -> list[dict]:
    """Специализированный парсер ЦИАН для ГАБ (готовый арендный бизнес)."""
    results = []
    seen = set()

    sitemap_index = _fetch('https://krasnodar.cian.ru/sitemap.xml', timeout=8)
    if not sitemap_index:
        return []

    all_sitemaps = re.findall(r'<loc>(https://krasnodar\.cian\.ru/[^<]+)</loc>', sitemap_index)
    comm_sitemaps = [s for s in all_sitemaps if 'commercial' in s or 'kommerch' in s][:3]

    obj_urls = []
    for sm_url in comm_sitemaps:
        xml = _fetch(sm_url, timeout=8)
        if not xml:
            continue
        urls = re.findall(r'<loc>(https://krasnodar\.cian\.ru/(?:sale|rent)/commercial/[^<]+)</loc>', xml)
        obj_urls.extend(urls)
        if len(obj_urls) >= 200:
            break

    for url in obj_urls:
        id_m = re.search(r'/(\d+)/?$', url)
        obj_id = id_m.group(1) if id_m else None
        if not obj_id or obj_id in seen:
            continue
        seen.add(obj_id)
        html = _fetch(url, timeout=6)
        if not html:
            continue

        title_m = re.search(r'<title>([^<]{10,400})</title>', html)
        if not title_m:
            continue
        title_raw = title_m.group(1)
        desc_m = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']{20,600})["\']', html)
        desc = desc_m.group(1) if desc_m else ''
        full_text = (title_raw + ' ' + desc).lower()
        if not any(kw in full_text for kw in GAB_KEYWORDS):
            continue

        price_m = re.search(r'([\d\s]{4,})\s*[₽р]', title_raw) or re.search(r'([\d\s]{4,})\s*[₽р]', desc)
        price = _clean_price(price_m.group(1)) if price_m else None
        if not price or price < 500_000:
            continue

        area_m = re.search(r'([\d,\.]+)\s*м²', title_raw)
        area = _clean_area(area_m.group(1)) if area_m else None
        price_per_m2 = round(price / area, 2) if price and area and area > 0 else None

        addr_m = re.search(r'(?:в\s+)?Краснодар[е,\s]+([^—\|<\n]{5,120})', title_raw)
        address = addr_m.group(1).strip() if addr_m else None

        rent_income_m = re.search(r'(?:доход|аренда)[^\d]*([\d\s]{3,})\s*[₽р]', full_text)
        rent_income = _clean_price(rent_income_m.group(1)) if rent_income_m else None
        payback_m = re.search(r'(?:окупаемост|срок)[^\d]*(\d+[\.,]?\d*)\s*(?:лет|год|мес)', full_text)

        results.append({
            'source': 'cian_gab', 'external_id': obj_id, 'url': url,
            'title': title_raw[:400], 'category': 'gab', 'deal_type': 'sale',
            'price': price, 'price_per_m2': price_per_m2, 'area': area,
            'address': address, 'district': _detect_district(address or ''),
            'description': f'Доход: {rent_income} ₽/мес. Окупаемость: {payback_m.group(1) if payback_m else "—"}' if rent_income else desc[:300],
        })
        if len(results) >= max_items:
            break
        time.sleep(0.05)

    print(f'[cian_gab] scanned={len(seen)} gab_found={len(results)}')
    return results


def _scrape_cian(max_items: int = 20) -> list[dict]:
    """Универсальный парсер ЦИАН Краснодар из sitemap."""
    results = []
    seen = set()

    sitemap_index = _fetch('https://krasnodar.cian.ru/sitemap.xml', timeout=8)
    if not sitemap_index:
        return []

    all_sitemaps = re.findall(r'<loc>(https://krasnodar\.cian\.ru/[^<]+)</loc>', sitemap_index)
    comm_sitemaps = [s for s in all_sitemaps if 'commercial' in s or 'kommerch' in s]
    if not comm_sitemaps:
        comm_sitemaps = [s for s in all_sitemaps if 'offer' in s or 'ob' in s][:2]

    obj_urls = []
    for sm_url in comm_sitemaps[:2]:
        xml = _fetch(sm_url, timeout=8)
        if not xml:
            continue
        urls = re.findall(r'<loc>(https://krasnodar\.cian\.ru/(?:sale|rent)/commercial/[^<]+)</loc>', xml)
        obj_urls.extend(urls)
        if len(obj_urls) >= 60:
            break

    for url in obj_urls:
        id_m = re.search(r'/(\d+)/?$', url)
        obj_id = id_m.group(1) if id_m else None
        if not obj_id or obj_id in seen:
            continue
        seen.add(obj_id)
        deal_type = 'rent' if '/rent/' in url else 'sale'
        html = _fetch(url, timeout=6)
        if not html:
            continue
        title_m = re.search(r'<title>([^<]{10,300})</title>', html)
        if not title_m:
            continue
        title_raw = title_m.group(1)
        price_m = re.search(r'([\d\s]+)\s*[₽р](?:/мес|/мес\.)?', title_raw)
        if not price_m:
            desc_m = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']{20,500})["\']', html)
            desc = desc_m.group(1) if desc_m else ''
            price_m = re.search(r'([\d\s]+)\s*[₽р]', desc)
        price = _clean_price(price_m.group(1)) if price_m else None
        if not price or price < 1000:
            continue
        area_m = re.search(r'([\d,\.]+)\s*м²', title_raw)
        area = _clean_area(area_m.group(1)) if area_m else None
        price_per_m2 = round(price / area, 2) if price and area and area > 0 else None
        addr_m = re.search(r'(?:в\s+)?Краснодар[е,\s]+([^—\|<\n]{5,120})', title_raw)
        address = addr_m.group(1).strip() if addr_m else None
        results.append({
            'source': 'cian', 'external_id': obj_id, 'url': url,
            'title': title_raw[:400], 'category': _detect_category(url + ' ' + title_raw),
            'deal_type': deal_type, 'price': price, 'price_per_m2': price_per_m2,
            'area': area, 'address': address, 'district': None,
        })
        if len(results) >= max_items:
            break
        time.sleep(0.05)

    print(f'[cian] parsed {len(results)} objects')
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# СОХРАНЕНИЕ В БД
# ═══════════════════════════════════════════════════════════════════════════════

def _save_listings(cur, items: list[dict]) -> dict:
    """Upsert объявлений в market_listings по (source, external_id)."""
    inserted = updated = 0
    for item in items:
        ext_id = str(item.get('external_id') or '')[:200]
        if not ext_id:
            continue
        cur.execute(
            f"INSERT INTO {SCHEMA}.market_listings "
            f"(source, external_id, url, title, category, deal_type, price, price_per_m2, "
            f"area, address, district, floor, total_floors, condition, description, road_line, scraped_at) "
            f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW()) "
            f"ON CONFLICT (source, external_id) DO UPDATE SET "
            f"price=%s, price_per_m2=%s, area=%s, address=%s, district=%s, "
            f"floor=%s, total_floors=%s, condition=%s, road_line=%s, "
            f"title=%s, category=%s, scraped_at=NOW()",
            (
                item.get('source'), ext_id,
                (item.get('url') or '')[:500], (item.get('title') or '')[:500],
                item.get('category'), item.get('deal_type'),
                item.get('price'), item.get('price_per_m2'), item.get('area'),
                (item.get('address') or '')[:300], (item.get('district') or '')[:200],
                item.get('floor'), item.get('total_floors'),
                (item.get('condition') or '')[:100], (item.get('description') or '')[:1000],
                (item.get('road_line') or '')[:50] or None,
                # ON CONFLICT SET
                item.get('price'), item.get('price_per_m2'), item.get('area'),
                (item.get('address') or '')[:300], (item.get('district') or '')[:200],
                item.get('floor'), item.get('total_floors'),
                (item.get('condition') or '')[:100], (item.get('road_line') or '')[:50] or None,
                (item.get('title') or '')[:500], item.get('category'),
            )
        )
        if cur.rowcount == 1:
            inserted += 1
        else:
            updated += 1
    return {'inserted': inserted, 'updated': updated}


# ═══════════════════════════════════════════════════════════════════════════════
# ГЕНЕРАЦИЯ ФАКТОВ ДЛЯ ai_memory
# ═══════════════════════════════════════════════════════════════════════════════

def _generate_facts(cur) -> int:
    """
    Генерирует аналитические факты из market_listings → ai_memory.
    Агрегации: по категории/сделке, по районам, по линиям, по этажам.
    """
    facts = []
    cat_ru = CAT_RU
    deal_ru = DEAL_RU

    # По категории и типу сделки
    cur.execute(
        f"SELECT source, category, deal_type, "
        f"COUNT(*) AS cnt, "
        f"ROUND(AVG(price)::numeric, 0) AS avg_price, "
        f"ROUND(MIN(price)::numeric, 0) AS min_price, "
        f"ROUND(MAX(price)::numeric, 0) AS max_price, "
        f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_p2, "
        f"ROUND(MIN(price_per_m2)::numeric, 0) AS min_p2, "
        f"ROUND(MAX(price_per_m2)::numeric, 0) AS max_p2 "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE scraped_at > NOW() - INTERVAL '7 days' AND price > 0 "
        f"GROUP BY source, category, deal_type "
        f"HAVING COUNT(*) >= 3 ORDER BY source, deal_type, cnt DESC LIMIT 60"
    )
    rows = cur.fetchall() or []
    for r in rows:
        src   = r.get('source') or 'unknown'
        cat   = r.get('category') or 'other'
        dt    = r.get('deal_type') or 'sale'
        cnt   = int(r.get('cnt') or 0)
        avg_p = int(r.get('avg_price') or 0)
        avg_2 = int(r.get('avg_p2') or 0)
        min_2 = int(r.get('min_p2') or 0)
        max_2 = int(r.get('max_p2') or 0)
        if not avg_p:
            continue
        suffix = '/мес' if dt == 'rent' else ''
        cat_label  = cat_ru.get(cat, cat)
        deal_label = deal_ru.get(dt, dt)
        facts.append({
            'key': f'market_{src}_{cat}_{dt}',
            'value': (
                f'{cat_label} ({deal_label}, {src}): {cnt} объявлений, '
                f'средняя цена {avg_p:,} руб{suffix}, '
                f'цена за м² {avg_2:,}–{max_2:,} руб/м²{suffix} '
                f'(мин {min_2:,})'
            ),
        })

    # По районам
    cur.execute(
        f"SELECT district, deal_type, category, COUNT(*) AS cnt, "
        f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_p2 "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE scraped_at > NOW() - INTERVAL '7 days' "
        f"AND district IS NOT NULL AND district != '' AND price_per_m2 > 0 "
        f"GROUP BY district, deal_type, category HAVING COUNT(*) >= 2 "
        f"ORDER BY cnt DESC LIMIT 40"
    )
    for r in cur.fetchall() or []:
        dist  = r.get('district') or ''
        dt    = r.get('deal_type') or 'sale'
        cat   = r.get('category') or 'other'
        avg_2 = int(r.get('avg_p2') or 0)
        cnt   = int(r.get('cnt') or 0)
        if not avg_2 or not dist:
            continue
        suffix = '/мес' if dt == 'rent' else ''
        facts.append({
            'key': f'market_ext_dist_{dist.replace(" ","_").lower()}_{cat}_{dt}',
            'value': f'{dist} — {cat_ru.get(cat, cat)} ({deal_ru.get(dt, dt)}): {avg_2:,} руб/м²{suffix} ({cnt} объявлений)',
        })

    # По линии
    cur.execute(
        f"SELECT road_line, deal_type, category, COUNT(*) AS cnt, "
        f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_p2 "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE scraped_at > NOW() - INTERVAL '7 days' "
        f"AND road_line IS NOT NULL AND price_per_m2 > 0 "
        f"GROUP BY road_line, deal_type, category HAVING COUNT(*) >= 2 "
        f"ORDER BY avg_p2 DESC LIMIT 20"
    )
    for r in cur.fetchall() or []:
        rl    = r.get('road_line') or ''
        dt    = r.get('deal_type') or 'sale'
        cat   = r.get('category') or 'other'
        avg_2 = int(r.get('avg_p2') or 0)
        cnt   = int(r.get('cnt') or 0)
        if not avg_2:
            continue
        suffix = '/мес' if dt == 'rent' else ''
        facts.append({
            'key': f'market_ext_line_{rl.replace(" ","_")}_{cat}_{dt}',
            'value': f'{cat_ru.get(cat, cat)} ({deal_ru.get(dt, dt)}), {rl}: {avg_2:,} руб/м²{suffix} ({cnt} объявлений)',
        })

    # По этажам: 1й vs выше
    cur.execute(
        f"SELECT CASE WHEN floor = 1 THEN '1 этаж' ELSE '2+ этаж' END AS floor_group, "
        f"deal_type, category, COUNT(*) AS cnt, "
        f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_p2 "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE scraped_at > NOW() - INTERVAL '7 days' "
        f"AND floor IS NOT NULL AND price_per_m2 > 0 "
        f"GROUP BY floor_group, deal_type, category "
        f"HAVING COUNT(*) >= 2 ORDER BY category, deal_type, avg_p2 DESC LIMIT 30"
    )
    for r in cur.fetchall() or []:
        fg    = r.get('floor_group') or ''
        dt    = r.get('deal_type') or 'sale'
        cat   = r.get('category') or 'other'
        avg_2 = int(r.get('avg_p2') or 0)
        cnt   = int(r.get('cnt') or 0)
        if not avg_2:
            continue
        suffix = '/мес' if dt == 'rent' else ''
        facts.append({
            'key': f'market_ext_floor_{fg.replace(" ","_")}_{cat}_{dt}',
            'value': f'{cat_ru.get(cat, cat)} ({deal_ru.get(dt, dt)}), {fg}: {avg_2:,} руб/м²{suffix} ({cnt} объявлений)',
        })

    # Сохраняем в ai_memory
    for f in facts:
        cur.execute(
            f"INSERT INTO {SCHEMA}.ai_memory (key, value, updated_at) "
            f"VALUES (%s, %s, NOW()) "
            f"ON CONFLICT (key) DO UPDATE SET value=%s, updated_at=NOW()",
            (f['key'], f['value'], f['value'])
        )

    return len(facts)


# ═══════════════════════════════════════════════════════════════════════════════
# HANDLER
# ═══════════════════════════════════════════════════════════════════════════════

def handler(event: dict, context) -> dict:
    """Парсинг рынка коммерческой недвижимости Краснодара."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    body   = json.loads(event.get('body') or '{}')
    params = event.get('queryStringParameters') or {}
    action = body.get('action') or params.get('action') or ''

    # ── DEBUG: анализ HTML структуры ──────────────────────────────────────────
    if action == 'debug_html':
        url  = body.get('url', 'https://krasnodar.arrpro.ru/katalog/prodam/')
        html = _fetch(url)
        card_m = re.search(r'class=["\']props__item[^"\']*["\']', html)
        first_card = html[card_m.start():card_m.start() + 4000] if card_m else ''
        options = re.findall(r'<div class=["\']option["\'][^>]*>(.*?)</div>', html, re.DOTALL)[:10]
        cat_links = list(set(re.findall(r'href=["\'](/katalog/[^"\'?#]+)["\']', html)))[:30]
        return {
            'statusCode': 200,
            'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps({
                'html_len': len(html), 'html_start': html[:500],
                'first_card': first_card,
                'options_sample': [re.sub(r'<[^>]+>', ' ', o).strip() for o in options],
                'cat_links': sorted(cat_links),
            }, ensure_ascii=False),
        }

    def _json(data, status=200):
        return {
            'statusCode': status,
            'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(data, ensure_ascii=False, default=str),
        }

    # ── CRON: пошаговый без авторизации ──────────────────────────────────────
    if action in ('cron', 'next'):
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            step = _scrape_arrpro_step(cur)
            items = step.get('items') or []
            save  = _save_listings(cur, items) if items else {'inserted': 0, 'updated': 0}

            facts_saved = 0
            if step.get('done'):
                facts_saved = _generate_facts(cur)

            conn.commit()
            return _json({
                'success': True,
                'scraped': len(items), 'inserted': save['inserted'], 'updated': save['updated'],
                'facts_saved': facts_saved, 'progress': step.get('progress'),
                'done': step.get('done', False), 'cat': step.get('cat'), 'deal': step.get('deal'),
            })
        finally:
            conn.close()

    # ── Авторизация для всех остальных действий ───────────────────────────────
    user = _auth(event)
    if not user:
        return _json({'error': 'Нет доступа'}, 401)

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # ── Сброс прогресса ───────────────────────────────────────────────────
        if action in ('reset', 'full_scan'):
            cur.execute(
                f"UPDATE {SCHEMA}.market_scraper_progress "
                f"SET last_page=0, total_scraped=0, is_done=FALSE, updated_at=NOW() "
                f"WHERE source='arrpro'"
            )
            # Инициализируем новые категории если нужно
            _init_progress(cur)
            conn.commit()
            return _json({'success': True, 'message': 'Прогресс сброшен. Cron начнёт полный сбор при следующем вызове.'})

        # ── Статистика / Прогресс ─────────────────────────────────────────────
        if action in ('stats', 'progress'):
            cur.execute(
                f"SELECT category_slug, deal_type, last_page, total_scraped, is_done, updated_at "
                f"FROM {SCHEMA}.market_scraper_progress WHERE source='arrpro' ORDER BY id"
            )
            tasks = [dict(r) for r in cur.fetchall()]
            cur.execute(
                f"SELECT deal_type, category, COUNT(*) as cnt, "
                f"ROUND(AVG(price_per_m2)::numeric,0) as avg_p2 "
                f"FROM {SCHEMA}.market_listings "
                f"WHERE source='arrpro' AND scraped_at > NOW()-INTERVAL '7 days' "
                f"GROUP BY deal_type, category ORDER BY deal_type, cnt DESC"
            )
            by_cat = [dict(r) for r in cur.fetchall()]
            cur.execute(
                f"SELECT COUNT(*) as t FROM {SCHEMA}.market_listings "
                f"WHERE source='arrpro' AND scraped_at > NOW()-INTERVAL '7 days'"
            )
            total = int((cur.fetchone() or {}).get('t') or 0)
            return _json({'tasks': tasks, 'by_category': by_cat, 'total_in_db': total})

        # ── Обновить факты вручную ────────────────────────────────────────────
        if action == 'facts':
            saved = _generate_facts(cur)
            conn.commit()
            return _json({'facts_saved': saved})

        # ── Ручной быстрый сбор из источников ────────────────────────────────
        sources = body.get('sources') or params.get('sources') or 'all'
        if isinstance(sources, str):
            sources = sources.split(',')
        max_pages = int(body.get('max_pages') or params.get('max_pages') or 5)

        all_items = []
        per_source = {}

        if 'all' in sources or 'arrpro' in sources:
            items = _scrape_arrpro_fast(max_pages=max_pages)
            all_items.extend(items)
            per_source['arrpro'] = len(items)

        if 'all' in sources or 'ayax' in sources:
            items = _scrape_ayax(max_pages=max_pages)
            all_items.extend(items)
            per_source['ayax'] = len(items)

        if 'all' in sources or 'cian' in sources:
            items = _scrape_cian(max_items=20)
            all_items.extend(items)
            per_source['cian'] = len(items)

        if 'all' in sources or 'cian_gab' in sources:
            items = _scrape_cian_gab(max_items=30)
            all_items.extend(items)
            per_source['cian_gab'] = len(items)

        save = _save_listings(cur, all_items)
        facts_saved = _generate_facts(cur) if body.get('generate_facts', True) else 0
        conn.commit()

        return _json({
            'success': True,
            'total': len(all_items),
            'inserted': save['inserted'],
            'updated': save['updated'],
            'per_source': per_source,
            'facts_saved': facts_saved,
        })

    finally:
        conn.close()
