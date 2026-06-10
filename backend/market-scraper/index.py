"""
Парсер рынка коммерческой недвижимости Краснодара.
Источники: ayax.ru, arrpro.ru (krasnodar.arrpro.ru), cian.ru.
Сохраняет структурированные данные в market_listings.
Запускается по cron или вручную из админки.
"""

import json
import os
import re
import urllib.request
import urllib.error
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
}


def _detect_category(text: str) -> str:
    t = (text or '').lower()
    for kw, cat in CAT_MAP.items():
        if kw in t:
            return cat
    return 'other'


# Улицы/ориентиры → район Краснодара
STREET_DISTRICT_MAP = {
    # ФМР (Фестивальный микрорайон)
    'фестивальн': 'ФМР', 'фмр': 'ФМР', 'чистяковск': 'ФМР',
    'героя пешков': 'ФМР', 'московск': 'ФМР', 'дзержинск': 'ФМР',
    'шевцов': 'ФМР', 'прокофьев': 'ФМР', 'бабушкин': 'ФМР',
    'ставропольск': 'ФМР', 'гагарин': 'ФМР',
    # ЦМР (Центральный микрорайон)
    'цмр': 'ЦМР', 'красн': 'ЦМР', 'октябрьск': 'ЦМР',
    'им. Ленина': 'ЦМР', 'ленин': 'ЦМР', 'мира': 'ЦМР',
    'пушкин': 'ЦМР', 'суворов': 'ЦМР', 'кубанонабережн': 'ЦМР',
    # ЮМР (Юбилейный микрорайон)
    'юмр': 'ЮМР', 'юбилейн': 'ЮМР', 'симферопольск': 'ЮМР',
    'уральск': 'ЮМР', 'адмирала трибуца': 'ЮМР', 'восточно-кругликовск': 'ЮМР',
    # Гидрострой
    'гидростроит': 'Гидрострой', 'новороссийск': 'Гидрострой',
    'колосист': 'Гидрострой', 'звездн': 'Гидрострой',
    # Музыкальный
    'музыкальн': 'Музыкальный', 'им. Петра Метальникова': 'Музыкальный',
    # Черёмушки / Прикубанский
    'черёмушк': 'Прикубанский', 'черемушк': 'Прикубанский',
    'прикубанск': 'Прикубанский', 'домбайск': 'Прикубанский',
    'ангарск': 'Прикубанский', 'осокин': 'Прикубанский',
    'индустриальн': 'Прикубанский',
    # Карасунский / РИП
    'карасунск': 'Карасунский', 'ростовское шоссе': 'Карасунский',
    'шоссе нефтяников': 'Карасунский', 'ярославск': 'Карасунский',
    'садовое кольцо': 'Карасунский',
    # Западный
    'западн': 'Западный', 'тургенев': 'Западный',
    # Новознаменский / Краснодар-3
    'новознаменск': 'Новознаменский',
}

def _detect_district(address: str) -> str | None:
    if not address:
        return None
    a = address.lower()
    for kw, dist in STREET_DISTRICT_MAP.items():
        if kw.lower() in a:
            return dist
    return None


def _clean_price(s: str) -> int | None:
    if not s:
        return None
    s = re.sub(r'[^\d]', '', str(s))
    return int(s) if s else None


def _clean_area(s: str) -> float | None:
    if not s:
        return None
    m = re.search(r'[\d]+[.,]?[\d]*', str(s).replace(' ', ''))
    if m:
        return float(m.group().replace(',', '.'))
    return None


def _fetch(url: str, timeout: int = 15) -> str:
    import gzip
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read(800_000)
            content_encoding = r.headers.get('Content-Encoding', '')
        # Декомпрессия gzip
        if content_encoding == 'gzip' or (raw[:2] == b'\x1f\x8b'):
            try:
                raw = gzip.decompress(raw)
            except Exception:
                pass
        for enc in ('utf-8', 'cp1251', 'latin-1'):
            try:
                return raw.decode(enc, errors='replace')
            except Exception:
                continue
    except Exception:
        return ''
    return ''


# ── Простой HTML-парсер ────────────────────────────────────────────────────

class _TagParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.captures = []
        self._targets = []
        self.current = None

    def set_target(self, tag: str, classes: list[str]):
        self._targets = [(tag, c) for c in classes]

    def handle_starttag(self, tag, attrs):
        attr_dict = dict(attrs)
        cls = attr_dict.get('class', '')
        href = attr_dict.get('href', '')
        self.stack.append({'tag': tag, 'class': cls, 'href': href, 'text': '', 'children': []})

    def handle_data(self, data):
        if self.stack:
            self.stack[-1]['text'] += data

    def handle_endtag(self, tag):
        if not self.stack:
            return
        node = self.stack.pop()
        if self.stack:
            self.stack[-1]['text'] += node['text']
            self.stack[-1]['children'].append(node)
        for t, cls_kw in self._targets:
            if node['tag'] == t and cls_kw in node['class']:
                self.captures.append(node)
                break


def _text_of(node: dict) -> str:
    return re.sub(r'\s+', ' ', node.get('text', '')).strip()


# ── ПАРСЕР ARRPRO.RU ────────────────────────────────────────────────────────

def _parse_arrpro_page(html: str, deal_type: str) -> list[dict]:
    """
    arrpro.ru — парсинг страницы каталога.
    Структура карточки:
      <a class="props__address" href="/katalog/prodam/sklad/prodayu-...-131335.php">Краснодарская ул, д.2</a>
      <p class="props__price">43 920 000 руб.</p>
      <p class="props__priceForM">90 000 руб./м²</p>
      <div class="option"><span>Площадь:</span> 488 кв.м.</div>
      <div class="option"><span>Этаж:</span> 1 из 1</div>
      <div class="option"><span>Линия:</span> 1 линия / первая линия</div>
      <div class="option"><span>Состояние:</span> Хорошее</div>
      <div class="option"><span>Код объекта:</span> 131335</div>
    """
    results = []
    seen_ids = set()

    URL_CAT_MAP = {
        'sklad': 'warehouse',
        'ofis': 'office',
        'torgovoe': 'retail', 'torgovlya': 'retail', 'magazin': 'retail',
        'obshchepit': 'catering', 'kafe': 'catering', 'restoran': 'catering',
        'proizvodstvo': 'industrial', 'promyshlennoe': 'industrial',
        'svobodnogo-naznacheniya': 'free_purpose', 'psn': 'free_purpose',
        'zdanie': 'standalone', 'otdelnoe': 'standalone',
        'zemelniy-uchastok': 'land', 'zemlya': 'land',
        'gostinica': 'other', 'avtoservis': 'other', 'garazh': 'other',
    }
    CAT_RU = {
        'office': 'Офис', 'retail': 'Торговое помещение', 'warehouse': 'Склад',
        'industrial': 'Производство', 'catering': 'Общепит', 'free_purpose': 'ПСН',
        'standalone': 'Отдельно стоящее здание', 'land': 'Земельный участок', 'other': 'Коммерческая недвижимость',
    }
    DEAL_RU = {'sale': 'Продажа', 'rent': 'Аренда'}

    # Находим все карточки по URL в href класса props__address
    url_matches = list(re.finditer(
        r'href=["\'](/katalog/[^"\']+\.php)[^"\']*["\'][^>]*class=["\'][^"\']*props__address',
        html, re.IGNORECASE
    ))
    positions = [(m.start(), m.group(1)) for m in url_matches]

    for idx, (pos, raw_url) in enumerate(positions):
        next_pos = positions[idx + 1][0] if idx + 1 < len(positions) else pos + 4000
        block = html[max(0, pos - 200): next_pos + 200]

        # URL и ID
        obj_url = 'https://krasnodar.arrpro.ru' + raw_url
        id_m = re.search(r'-(\d+)\.php', obj_url)
        ext_id = id_m.group(1) if id_m else f"arr_{idx}"
        if ext_id in seen_ids:
            continue
        seen_ids.add(ext_id)

        # deal_type строго из URL объявления
        if any(x in obj_url for x in ('/prodam/', '/prodayu-', '/prodam-')):
            actual_deal = 'sale'
        elif any(x in obj_url for x in ('/arenda/', '/sdam-', '/snimu-', '/sdam/')):
            actual_deal = 'rent'
        else:
            actual_deal = deal_type

        # Цена (props__price) — общая стоимость
        pm = re.search(r'class=["\']props__price["\'][^>]*>\s*([\d\s]+)\s*руб', block)
        price = _clean_price(pm.group(1)) if pm else None
        if not price or price < 10_000:
            continue

        # Цена за м² (props__priceForM)
        p2m = re.search(r'class=["\']props__priceForM["\'][^>]*>\s*([\d\s]+)\s*руб', block)
        price_per_m2 = float(_clean_price(p2m.group(1))) if p2m and _clean_price(p2m.group(1)) else None

        # Площадь — из option "Площадь: 488 кв.м." или рассчитываем из цены/м²
        area = None
        area_opt_m = re.search(r'Площадь[:\s]+\s*([\d\s,\.]+)\s*(?:кв\.?\s*м|м²)', block, re.IGNORECASE)
        if area_opt_m:
            area = _clean_area(area_opt_m.group(1))
        elif price and price_per_m2 and price_per_m2 > 0:
            area = round(price / price_per_m2, 1)

        # Адрес — текст внутри тега props__address после SVG
        addr_m = re.search(
            r'class=["\']props__address["\'][^>]*>.*?</(?:svg|use)>\s*</svg>\s*([^\n<]{5,150})\s*</a>',
            block, re.DOTALL
        )
        if not addr_m:
            # Запасной вариант — текст после последнего > перед </a>
            addr_m2 = re.search(r'props__address[^>]*>(?:[^<]*<[^>]+>)*\s*([А-Яа-яёЁ][^\n<]{4,120})\s*</a>', block, re.DOTALL)
            address = addr_m2.group(1).strip() if addr_m2 else None
        else:
            address = addr_m.group(1).strip()

        # Этаж — из option "Этаж: 1 из 5" (реалистичный диапазон 1-50)
        floor = None
        total_floors = None
        floor_m = re.search(r'[Ээ]таж[:\s]+(\d{1,2})(?:\s*из\s*(\d{1,2}))?', block)
        if floor_m:
            f_val = int(floor_m.group(1))
            if 1 <= f_val <= 50:
                floor = f_val
                if floor_m.group(2):
                    total_floors = int(floor_m.group(2))

        # Линия — "1 линия", "первая линия", "2 линия"
        line_map = {'перв': '1 линия', 'втор': '2 линия', 'трет': '3 линия'}
        road_line = None
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
            # Линия может быть в заголовке title страницы: "1 линия"
            title_line_m = re.search(r'(\d)\s*лини', block, re.IGNORECASE)
            if title_line_m:
                road_line = f"{title_line_m.group(1)} линия"

        # Состояние
        condition = None
        cond_m = re.search(r'[Сс]остояние[:\s]+([^\n<,]{3,40})', block)
        if cond_m:
            condition = cond_m.group(1).strip()

        # Район — из явного поля или из словаря улиц Краснодара
        district = None
        dist_m = re.search(r'[Рр]айон[:\s]+([А-Яа-яёЁ\s\-]{3,40}?)(?:\.|,|<)', block)
        if dist_m:
            district = dist_m.group(1).strip()
        if not district and address:
            district = _detect_district(address)

        # Категория из URL-сегмента
        category = 'other'
        for seg, cat in URL_CAT_MAP.items():
            if seg in obj_url:
                category = cat
                break
        if category == 'other' and address:
            category = _detect_category(address)

        # Заголовок
        title_parts = [DEAL_RU.get(actual_deal, ''), CAT_RU.get(category, 'Объект')]
        if area: title_parts.append(f'{area} м²')
        if floor: title_parts.append(f'{floor} эт.')
        if road_line: title_parts.append(road_line)
        if address: title_parts.append(address[:60])
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


def scrape_arrpro(max_pages: int = 5) -> list[dict]:
    """
    Быстрый режим: парсит несколько страниц за один вызов.
    Используется при ручном запуске с sources=['arrpro'].
    """
    results = []
    sale_cats = [
        'svobodnogo-naznacheniya', 'ofis', 'sklad', 'torgovoe',
        'proizvodstvo', 'obshchepit', 'zdanie', 'zemelniy-uchastok',
    ]
    rent_cats = [
        'svobodnogo-naznacheniya', 'ofis', 'sklad', 'torgovoe',
        'obshchepit', 'zdanie',
    ]
    for cat_slug in sale_cats:
        for page in range(1, max_pages + 1):
            base = f'https://krasnodar.arrpro.ru/katalog/prodam/{cat_slug}/'
            url = base if page == 1 else f'{base}page/{page}/'
            html = _fetch(url)
            if not html or len(html) < 5000:
                break
            items = _parse_arrpro_page(html, 'sale')
            print(f'[arrpro] sale/{cat_slug} page={page} items={len(items)}')
            if not items:
                break
            results.extend(items)
    for cat_slug in rent_cats:
        for page in range(1, max_pages + 1):
            base = f'https://krasnodar.arrpro.ru/katalog/arenda/{cat_slug}/'
            url = base if page == 1 else f'{base}page/{page}/'
            html = _fetch(url)
            if not html or len(html) < 5000:
                break
            items = _parse_arrpro_page(html, 'rent')
            print(f'[arrpro] rent/{cat_slug} page={page} items={len(items)}')
            if not items:
                break
            results.extend(items)
    seen = set()
    return [r for r in results if r.get('external_id') and not seen.add(r['external_id'])]


def scrape_arrpro_step(cur) -> dict:
    """
    Пошаговый режим для cron: парсит ОДНУ категорию/страницу за вызов.
    Прогресс хранится в market_scraper_progress.
    Возвращает {'items': [...], 'done': bool, 'progress': str}.
    """
    ALL_QUEUES = [
        # (cat_slug, deal_type, base_url)
        ('svobodnogo-naznacheniya', 'sale', 'https://krasnodar.arrpro.ru/katalog/prodam/svobodnogo-naznacheniya/'),
        ('torgovoe',               'sale', 'https://krasnodar.arrpro.ru/katalog/prodam/torgovoe/'),
        ('ofis',                   'sale', 'https://krasnodar.arrpro.ru/katalog/prodam/ofis/'),
        ('sklad',                  'sale', 'https://krasnodar.arrpro.ru/katalog/prodam/sklad/'),
        ('zdanie',                 'sale', 'https://krasnodar.arrpro.ru/katalog/prodam/zdanie/'),
        ('obshchepit',             'sale', 'https://krasnodar.arrpro.ru/katalog/prodam/obshchepit/'),
        ('proizvodstvo',           'sale', 'https://krasnodar.arrpro.ru/katalog/prodam/proizvodstvo/'),
        ('zemelniy-uchastok',      'sale', 'https://krasnodar.arrpro.ru/katalog/prodam/zemelniy-uchastok/'),
        ('svobodnogo-naznacheniya','rent', 'https://krasnodar.arrpro.ru/katalog/arenda/svobodnogo-naznacheniya/'),
        ('torgovoe',               'rent', 'https://krasnodar.arrpro.ru/katalog/arenda/torgovoe/'),
        ('ofis',                   'rent', 'https://krasnodar.arrpro.ru/katalog/arenda/ofis/'),
        ('sklad',                  'rent', 'https://krasnodar.arrpro.ru/katalog/arenda/sklad/'),
        ('obshchepit',             'rent', 'https://krasnodar.arrpro.ru/katalog/arenda/obshchepit/'),
        ('zdanie',                 'rent', 'https://krasnodar.arrpro.ru/katalog/arenda/zdanie/'),
    ]

    # Инициализируем прогресс для новых записей
    for cat_slug, deal_type, _ in ALL_QUEUES:
        cur.execute(
            f"INSERT INTO {SCHEMA}.market_scraper_progress (source, category_slug, deal_type, last_page, is_done) "
            f"VALUES ('arrpro', %s, %s, 0, FALSE) ON CONFLICT (source, category_slug, deal_type) DO NOTHING",
            (cat_slug, deal_type)
        )

    # Берём первую незавершённую задачу
    cur.execute(
        f"SELECT category_slug, deal_type, last_page, total_scraped "
        f"FROM {SCHEMA}.market_scraper_progress "
        f"WHERE source='arrpro' AND is_done=FALSE "
        f"ORDER BY id ASC LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        return {'items': [], 'done': True, 'progress': 'Все категории обработаны'}

    cat_slug = row['category_slug']
    deal_type = row['deal_type']
    next_page = int(row['last_page'] or 0) + 1
    scraped_so_far = int(row['total_scraped'] or 0)

    # Находим base_url для этой задачи
    base_url = next(
        (bu for cs, dt, bu in ALL_QUEUES if cs == cat_slug and dt == deal_type),
        f'https://krasnodar.arrpro.ru/katalog/{"prodam" if deal_type == "sale" else "arenda"}/{cat_slug}/'
    )
    url = base_url if next_page == 1 else f'{base_url}page/{next_page}/'

    html = _fetch(url, timeout=20)
    items = []
    is_last = False

    if not html or len(html) < 5000:
        is_last = True
        print(f'[arrpro_step] {deal_type}/{cat_slug} page={next_page}: empty/failed → done')
    else:
        items = _parse_arrpro_page(html, deal_type)
        print(f'[arrpro_step] {deal_type}/{cat_slug} page={next_page}: {len(items)} items')
        if not items:
            is_last = True
        else:
            # Определяем есть ли следующая страница по нескольким признакам
            # 1. Явная ссылка на следующую страницу
            has_next = bool(re.search(rf'page/{next_page + 1}/', html))
            # 2. Ссылка через PAGEN параметр
            if not has_next:
                has_next = bool(re.search(rf'PAGEN_\d+={next_page + 1}', html))
            # 3. Кол-во объявлений из title: если total > уже собрано+на этой странице
            if not has_next:
                total_m = re.search(r'(\d+)\s*предложен', html)
                if total_m:
                    total_count = int(total_m.group(1))
                    per_page = len(items)
                    collected = new_scraped + per_page
                    has_next = total_count > (next_page * per_page)
                    print(f'[arrpro_step] total={total_count} per_page={per_page} page={next_page} has_next={has_next}')
            if not has_next:
                is_last = True

    new_scraped = scraped_so_far + len(items)
    cur.execute(
        f"UPDATE {SCHEMA}.market_scraper_progress "
        f"SET last_page=%s, total_scraped=%s, is_done=%s, updated_at=NOW() "
        f"WHERE source='arrpro' AND category_slug=%s AND deal_type=%s",
        (next_page, new_scraped, is_last, cat_slug, deal_type)
    )

    # Сколько всего осталось задач
    cur.execute(
        f"SELECT COUNT(*) as total, SUM(CASE WHEN is_done THEN 1 ELSE 0 END) as done "
        f"FROM {SCHEMA}.market_scraper_progress WHERE source='arrpro'"
    )
    stat = cur.fetchone()
    total_tasks = int(stat['total'] or 0)
    done_tasks = int(stat['done'] or 0)

    progress_str = f'{deal_type}/{cat_slug} стр.{next_page} ({len(items)} объявлений) — задач: {done_tasks+int(is_last)}/{total_tasks}'
    return {'items': items, 'done': False, 'is_last_page': is_last, 'progress': progress_str, 'cat': cat_slug, 'deal': deal_type}


# ── ПАРСЕР AYAX.RU ──────────────────────────────────────────────────────────

def _parse_ayax_object_page(html: str, obj_id: str, deal_type: str) -> dict | None:
    """
    ayax.ru — парсинг страницы одного объявления.
    title: "Продажа офисного помещения 80 м²: Краснодар, ФМР, ул. Xxx, д.1"
    title (arrpro-style): "Продаю 1 этаж 1 линия, 78 м² в Краснодаре по цене 200 000 руб./м²"
    description: "Краснодар: продаю ... по стоимости 15 600 000 руб."
    """
    title_m = re.search(r'<title>([^<]{10,300})</title>', html)
    if not title_m:
        return None
    title_raw = title_m.group(1)

    desc_m = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']{20,500})["\']', html)
    desc = desc_m.group(1) if desc_m else ''

    # Площадь из title
    area_m = re.search(r'([\d\s,\.]+)\s*м²', title_raw)
    area = _clean_area(area_m.group(1)) if area_m else None

    # Цена — несколько форматов
    price_raw = None
    # "по цене 200 000 руб./м²" → цена за м²
    ppm2_title = re.search(r'по цене\s*([\d\s]+)\s*руб[./].*?м', title_raw, re.IGNORECASE)
    # "по стоимости 15 600 000 руб" → общая цена
    total_desc = re.search(r'(?:стоимост[ьи]|цена\s*продажи|цена\s*аренды)[^:]*:\s*([\d\s]+)\s*руб', desc, re.IGNORECASE)
    if not total_desc:
        total_desc = re.search(r'[Цц]ена[^:]*:\s*([\d\s]+)\s*[₽р]', desc)

    price = None
    price_per_m2 = None

    if ppm2_title:
        p2_val = _clean_price(ppm2_title.group(1))
        if p2_val and area and area > 0:
            price_per_m2 = float(p2_val)
            price = int(p2_val * area)
    elif total_desc:
        price_raw = _clean_price(total_desc.group(1))
        if price_raw and area and area > 0:
            if price_raw < 500_000 and area > 10:
                price_per_m2 = float(price_raw)
                price = int(price_raw * area)
            else:
                price = price_raw
                price_per_m2 = round(price / area, 2)

    if not price and not price_per_m2:
        return None

    # Тип объекта из title → категория
    type_m = re.search(r'(?:Продажа|Аренда|Продаю|Сдаю)\s+([^0-9:,]{3,60}?)\s+[\d,\.]+\s*м', title_raw, re.IGNORECASE)
    obj_type = type_m.group(1).strip() if type_m else ''
    category = _detect_category(obj_type or title_raw)

    # Адрес — после "Краснодар," в title
    address = None
    addr_m = re.search(r'[Кк]раснодар[еа]?[,:\s]+([^—\|<\n]{5,150})', title_raw)
    if addr_m:
        address = addr_m.group(1).strip().rstrip(' ,.')
        # Убираем хвост " на АРР" / "| ЦИАН" и т.п.
        address = re.sub(r'\s*(?:на\s+АРР|на\s+Аякс|\|.*|по цене.*)$', '', address, flags=re.IGNORECASE).strip()

    # Район — из title или по словарю улиц
    district = None
    dist_m = re.search(r'(?:округ|район)[,\s]+([А-Яа-яёЁ\s\-]{3,40}?)(?:,|мкр|ул\.|\s*$)', title_raw, re.IGNORECASE)
    if dist_m:
        district = dist_m.group(1).strip()
    if not district:
        district = _detect_district(address or title_raw)

    # Этаж из title: "1 этаж", "2 эт."
    floor = None
    total_floors = None
    floor_m = re.search(r'(\d+)\s*этаж', title_raw, re.IGNORECASE)
    if floor_m:
        floor = int(floor_m.group(1))
    floor2_m = re.search(r'этаж\s*(\d+)(?:\s*из\s*(\d+))?', title_raw, re.IGNORECASE)
    if floor2_m:
        floor = int(floor2_m.group(1))
        if floor2_m.group(2):
            total_floors = int(floor2_m.group(2))

    # Линия из title: "1 линия", "первая линия"
    road_line = None
    line_m = re.search(r'(\d+|перв\w*|втор\w*|трет\w*)\s*лини', title_raw, re.IGNORECASE)
    if line_m:
        lt = line_m.group(1).lower()
        lmap = {'перв': '1 линия', 'втор': '2 линия', 'трет': '3 линия'}
        for kw, val in lmap.items():
            if kw in lt:
                road_line = val
                break
        if not road_line and lt.isdigit():
            road_line = f'{lt} линия'

    return {
        'source': 'ayax',
        'external_id': obj_id,
        'url': f'https://www.ayax.ru/commercial/{obj_id}/',
        'title': title_raw[:400],
        'category': category,
        'deal_type': deal_type,
        'price': price,
        'price_per_m2': price_per_m2,
        'area': area,
        'address': address,
        'district': district,
        'floor': floor,
        'total_floors': total_floors,
        'road_line': road_line,
        'condition': None,
    }


def scrape_ayax(max_pages: int = 5) -> list[dict]:
    """
    ayax.ru — Vue SPA. Берём URL из sitemap, парсим title+description каждой страницы.
    max_items ограничено 20 чтобы уложиться в таймаут функции (30 сек).
    Каждый вызов cron берёт следующую порцию через offset в БД.
    """
    import time
    MAX_ITEMS = 20  # жёсткий лимит на вызов

    # Собираем URL из одного sitemap-файла
    commercial_urls = []
    sitemap_url = 'https://www.ayax.ru/sitemap_2_1.xml'
    xml = _fetch(sitemap_url, timeout=8)
    if xml:
        urls = re.findall(r'<loc>(https://www\.ayax\.ru/commercial/(\d+)/)</loc>', xml)
        commercial_urls.extend(urls)
    print(f'[ayax] sitemap: found {len(commercial_urls)} commercial URLs')

    results = []
    seen = set()
    for full_url, obj_id in commercial_urls[:MAX_ITEMS * 3]:
        if obj_id in seen:
            continue
        seen.add(obj_id)
        html = _fetch(full_url, timeout=6)
        if not html:
            continue
        deal_type = 'rent' if re.search(r'[Аа]ренда|[Сс]нять', html[:500]) else 'sale'
        item = _parse_ayax_object_page(html, obj_id, deal_type)
        if item:
            results.append(item)
        if len(results) >= MAX_ITEMS:
            break
        time.sleep(0.05)

    print(f'[ayax] parsed {len(results)} objects')
    return results


# ── ПАРСЕР CIAN.RU (замена moreon, который полностью JS) ─────────────────────

def scrape_moreon(max_pages: int = 5) -> list[dict]:
    """
    moreon-invest.ru — Bitrix с AJAX, данные не доступны без JS.
    Вместо него парсим ЦИАН через страницы объявлений из sitemap.
    """
    return scrape_cian(max_pages=max_pages)


def scrape_cian(max_pages: int = 5) -> list[dict]:
    """
    ЦИАН Краснодар — парсим страницы объявлений из sitemap.
    Лимит 20 объектов за вызов для укладки в таймаут.
    """
    import time
    MAX_ITEMS = 20
    results = []

    sitemap_index = _fetch('https://krasnodar.cian.ru/sitemap.xml', timeout=8)
    if not sitemap_index:
        print('[cian] failed to load sitemap index')
        return []

    all_sitemaps = re.findall(r'<loc>(https://krasnodar\.cian\.ru/[^<]+)</loc>', sitemap_index)
    comm_sitemaps = [s for s in all_sitemaps if 'commercial' in s or 'kommerch' in s]
    if not comm_sitemaps:
        comm_sitemaps = [s for s in all_sitemaps if 'offer' in s or 'ob' in s][:2]

    print(f'[cian] sitemaps found: {len(all_sitemaps)}, commercial: {len(comm_sitemaps)}')

    obj_urls = []
    for sm_url in comm_sitemaps[:2]:
        xml = _fetch(sm_url, timeout=8)
        if not xml:
            continue
        urls = re.findall(r'<loc>(https://krasnodar\.cian\.ru/(?:sale|rent)/commercial/[^<]+)</loc>', xml)
        obj_urls.extend(urls)
        if len(obj_urls) >= 60:
            break

    print(f'[cian] total commercial URLs: {len(obj_urls)}')

    seen = set()
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
        category = _detect_category(url + ' ' + title_raw)
        addr_m = re.search(r'(?:в\s+)?Краснодар[е,\s]+([^—\|<\n]{5,120})', title_raw)
        address = addr_m.group(1).strip() if addr_m else None
        results.append({
            'source': 'cian', 'external_id': obj_id, 'url': url,
            'title': title_raw[:400], 'category': category, 'deal_type': deal_type,
            'price': price, 'price_per_m2': price_per_m2, 'area': area,
            'address': address, 'district': None,
        })
        if len(results) >= MAX_ITEMS:
            break
        time.sleep(0.05)

    print(f'[cian] parsed {len(results)} objects')
    return results


# ── СОХРАНЕНИЕ В БД ─────────────────────────────────────────────────────────

def _save_listings(cur, items: list[dict]) -> dict:
    inserted = 0
    updated = 0
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
                (item.get('url') or '')[:500],
                (item.get('title') or '')[:500],
                item.get('category'), item.get('deal_type'),
                item.get('price'), item.get('price_per_m2'),
                item.get('area'),
                (item.get('address') or '')[:300],
                (item.get('district') or '')[:200],
                item.get('floor'), item.get('total_floors'),
                (item.get('condition') or '')[:100],
                (item.get('description') or '')[:1000],
                (item.get('road_line') or '')[:50] or None,
                # ON CONFLICT UPDATE
                item.get('price'), item.get('price_per_m2'), item.get('area'),
                (item.get('address') or '')[:300], (item.get('district') or '')[:200],
                item.get('floor'), item.get('total_floors'),
                (item.get('condition') or '')[:100],
                (item.get('road_line') or '')[:50] or None,
                (item.get('title') or '')[:500], item.get('category'),
            )
        )
        if cur.rowcount == 1:
            inserted += 1
        else:
            updated += 1
    return {'inserted': inserted, 'updated': updated}


# ── ГЕНЕРАЦИЯ ФАКТОВ ДЛЯ ai_memory ──────────────────────────────────────────

def _generate_market_facts(cur) -> int:
    """Программно генерирует аналитические факты из market_listings и сохраняет в ai_memory."""
    
    # Агрегаты по категории и типу сделки
    cur.execute(
        f"SELECT source, category, deal_type, "
        f"COUNT(*) AS cnt, "
        f"ROUND(AVG(price)::numeric, 0) AS avg_price, "
        f"ROUND(MIN(price)::numeric, 0) AS min_price, "
        f"ROUND(MAX(price)::numeric, 0) AS max_price, "
        f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_p2, "
        f"ROUND(MIN(price_per_m2)::numeric, 0) AS min_p2, "
        f"ROUND(MAX(price_per_m2)::numeric, 0) AS max_p2, "
        f"ROUND(AVG(area)::numeric, 1) AS avg_area "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE scraped_at > NOW() - INTERVAL '7 days' "
        f"AND price > 0 AND area > 0 "
        f"GROUP BY source, category, deal_type "
        f"HAVING COUNT(*) >= 2 "
        f"ORDER BY cnt DESC"
    )
    rows = cur.fetchall() or []

    # Сводка по источнику
    cur.execute(
        f"SELECT source, COUNT(*) AS cnt, "
        f"MAX(scraped_at) AS last_scraped "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE scraped_at > NOW() - INTERVAL '7 days' "
        f"GROUP BY source"
    )
    source_stats = cur.fetchall() or []

    cat_ru = {
        'office': 'Офисная недвижимость', 'retail': 'Торговая недвижимость',
        'warehouse': 'Складская недвижимость', 'industrial': 'Производственные помещения',
        'catering': 'Помещения общепита', 'free_purpose': 'ПСН',
        'standalone': 'Отдельно стоящие здания', 'land': 'Земельные участки',
        'other': 'Прочая коммерческая недвижимость',
    }
    src_ru = {'arrpro': 'АРР Краснодар', 'ayax': 'Аякс', 'moreon': 'Морeon Инвест'}
    deal_ru = {'sale': 'продажа', 'rent': 'аренда'}

    facts = []

    # Сводка по источникам
    for s in source_stats:
        src = s.get('source') or ''
        cnt = int(s.get('cnt') or 0)
        facts.append({
            'key': f'market_ext_{src}_count',
            'value': f'Источник {src_ru.get(src, src)}: собрано {cnt} актуальных объявлений коммерческой недвижимости Краснодара'
        })

    # Факты по категориям
    for r in rows:
        src = r.get('source') or ''
        cat = r.get('category') or 'other'
        dt = r.get('deal_type') or 'sale'
        cnt = int(r.get('cnt') or 0)
        avg_p = int(r.get('avg_price') or 0)
        min_p = int(r.get('min_price') or 0)
        max_p = int(r.get('max_price') or 0)
        avg_p2 = int(r.get('avg_p2') or 0)
        min_p2 = int(r.get('min_p2') or 0)
        max_p2 = int(r.get('max_p2') or 0)
        avg_area = float(r.get('avg_area') or 0)

        cat_label = cat_ru.get(cat, cat)
        dt_label = deal_ru.get(dt, dt)
        src_label = src_ru.get(src, src)
        slug = f"{src}_{cat}_{dt}"

        if avg_p:
            facts.append({
                'key': f'market_ext_{slug}_price',
                'value': f'{cat_label} ({dt_label}) по данным {src_label}: {cnt} объявлений, средняя цена {avg_p:,} ₽, диапазон {min_p:,}–{max_p:,} ₽'
            })
        if avg_p2:
            facts.append({
                'key': f'market_ext_{slug}_p2',
                'value': f'{cat_label} ({dt_label}), {src_label}: средняя цена за м² {avg_p2:,} руб/м², диапазон {min_p2:,}–{max_p2:,} руб/м²'
            })
        if avg_area:
            facts.append({
                'key': f'market_ext_{slug}_area',
                'value': f'{cat_label} ({dt_label}), {src_label}: средняя площадь объявлений {avg_area} м²'
            })

    # Сводные факты по всем источникам (объединённые) — цена/м² по категории
    cur.execute(
        f"SELECT category, deal_type, "
        f"COUNT(*) AS cnt, "
        f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_p2, "
        f"ROUND(MIN(price_per_m2)::numeric, 0) AS min_p2, "
        f"ROUND(MAX(price_per_m2)::numeric, 0) AS max_p2, "
        f"ROUND(AVG(area)::numeric, 0) AS avg_area "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE scraped_at > NOW() - INTERVAL '7 days' "
        f"AND price_per_m2 > 0 "
        f"GROUP BY category, deal_type "
        f"HAVING COUNT(*) >= 2 "
        f"ORDER BY cnt DESC"
    )
    combined = cur.fetchall() or []
    for r in combined:
        cat = r.get('category') or 'other'
        dt = r.get('deal_type') or 'sale'
        cnt = int(r.get('cnt') or 0)
        avg_p2 = int(r.get('avg_p2') or 0)
        min_p2 = int(r.get('min_p2') or 0)
        max_p2 = int(r.get('max_p2') or 0)
        avg_area = int(r.get('avg_area') or 0)
        if not avg_p2:
            continue
        cat_label = cat_ru.get(cat, cat)
        dt_label = deal_ru.get(dt, dt)
        suffix = '/мес' if dt == 'rent' else ''
        facts.append({
            'key': f'market_ext_combined_{cat}_{dt}_p2',
            'value': f'Рынок Краснодара — {cat_label} ({dt_label}): {avg_p2:,} руб/м²{suffix} (мин {min_p2:,}, макс {max_p2:,}), {cnt} объявлений, средняя площадь {avg_area} м²'
        })

    # Аналитика по линии (1/2/3 линия) — влияет на цену
    cur.execute(
        f"SELECT road_line, deal_type, category, "
        f"COUNT(*) AS cnt, "
        f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_p2 "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE scraped_at > NOW() - INTERVAL '7 days' "
        f"AND road_line IS NOT NULL AND price_per_m2 > 0 "
        f"GROUP BY road_line, deal_type, category "
        f"HAVING COUNT(*) >= 2 ORDER BY avg_p2 DESC LIMIT 20"
    )
    line_rows = cur.fetchall() or []
    for r in line_rows:
        rl = r.get('road_line') or ''
        dt = r.get('deal_type') or 'sale'
        cat = r.get('category') or 'other'
        avg_p2 = int(r.get('avg_p2') or 0)
        cnt = int(r.get('cnt') or 0)
        if not avg_p2:
            continue
        cat_label = cat_ru.get(cat, cat)
        dt_label = deal_ru.get(dt, dt)
        suffix = '/мес' if dt == 'rent' else ''
        facts.append({
            'key': f'market_ext_line_{rl.replace(" ", "_")}_{cat}_{dt}',
            'value': f'{cat_label} ({dt_label}), {rl}: средняя цена {avg_p2:,} руб/м²{suffix} ({cnt} объявлений)'
        })

    # Аналитика по этажам — 1й этаж vs выше
    cur.execute(
        f"SELECT CASE WHEN floor = 1 THEN '1 этаж' ELSE '2+ этаж' END AS floor_group, "
        f"deal_type, category, "
        f"COUNT(*) AS cnt, ROUND(AVG(price_per_m2)::numeric, 0) AS avg_p2 "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE scraped_at > NOW() - INTERVAL '7 days' "
        f"AND floor IS NOT NULL AND price_per_m2 > 0 "
        f"GROUP BY floor_group, deal_type, category "
        f"HAVING COUNT(*) >= 2 ORDER BY category, deal_type, avg_p2 DESC LIMIT 30"
    )
    floor_rows = cur.fetchall() or []
    for r in floor_rows:
        fg = r.get('floor_group') or ''
        dt = r.get('deal_type') or 'sale'
        cat = r.get('category') or 'other'
        avg_p2 = int(r.get('avg_p2') or 0)
        cnt = int(r.get('cnt') or 0)
        if not avg_p2:
            continue
        cat_label = cat_ru.get(cat, cat)
        dt_label = deal_ru.get(dt, dt)
        suffix = '/мес' if dt == 'rent' else ''
        facts.append({
            'key': f'market_ext_floor_{fg.replace(" ", "_")}_{cat}_{dt}',
            'value': f'{cat_label} ({dt_label}), {fg}: средняя цена {avg_p2:,} руб/м²{suffix} ({cnt} объявлений)'
        })

    # Сохраняем факты в ai_memory
    saved = 0
    import datetime
    ts = datetime.datetime.utcnow().strftime('%Y-%m-%d')
    for f in facts:
        key = f['key']
        val = f['value']
        cur.execute(
            f"INSERT INTO {SCHEMA}.ai_memory (key, value, updated_at) "
            f"VALUES (%s, %s, NOW()) "
            f"ON CONFLICT (key) DO UPDATE SET value=%s, updated_at=NOW()",
            (key, val, val)
        )
        saved += 1

    return saved


# ── HANDLER ──────────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """Парсинг рынка коммерческой недвижимости Краснодара. Запуск по cron или вручную."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    body = json.loads(event.get('body') or '{}')

    sources = body.get('sources') or params.get('sources') or 'all'
    if isinstance(sources, str):
        sources = sources.split(',')

    max_pages = int(body.get('max_pages') or params.get('max_pages') or 5)
    generate_facts = body.get('generate_facts', True)

    # Debug: показать сырой HTML фрагмент для диагностики
    if body.get('action') == 'debug_html':
        url = body.get('url', 'https://krasnodar.arrpro.ru/katalog/prodam/')
        html = _fetch(url)
        # Ищем блоки с ценами и площадями
        price_hits = [(m.start(), m.group(0)) for m in re.finditer(r'.{0,200}(?:руб|₽).{0,100}', html)][:5]
        area_hits = [(m.start(), m.group(0)) for m in re.finditer(r'.{0,100}(?:м²|кв\.?\s*м|м2).{0,100}', html)][:5]
        # Классы div
        classes = list(set(re.findall(r'class=["\']([^"\']{5,60})["\']', html)))[:30]
        # Вырезаем первую карточку props__item для анализа структуры
        first_card = ''
        card_m = re.search(r'class=["\']props__item[^"\']*["\']', html)
        if card_m:
            start = card_m.start()
            # Берём блок 4000 символов от начала карточки
            first_card = html[start:start+4000]
        # Все option-блоки с характеристиками
        options = re.findall(r'<div class=["\']option["\'][^>]*>(.*?)</div>', html, re.DOTALL)[:10]
        # Все ссылки на категории каталога
        cat_links = list(set(re.findall(r'href=["\'](/katalog/[^"\'?#]+)["\']', html)))[:30]
        return {
            'statusCode': 200,
            'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps({
                'html_len': len(html),
                'html_start': html[:500],
                'first_card': first_card,
                'options_sample': [re.sub(r'<[^>]+>', ' ', o).strip() for o in options],
                'cat_links': sorted(cat_links),
                'classes_sample': classes,
            }, ensure_ascii=False),
        }

    action = body.get('action') or params.get('action') or ''

    # Cron: пошаговый парсинг arrpro (1 страница за вызов, не требует токена)
    if action == 'cron':
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            step = scrape_arrpro_step(cur)
            items = step.get('items') or []
            save_result = _save_listings(cur, items) if items else {'inserted': 0, 'updated': 0}
            # Если всё собрано — обновляем факты
            facts_saved = 0
            if step.get('done') or (step.get('is_last_page') and not items):
                cur.execute(
                    f"SELECT COUNT(*) as total FROM {SCHEMA}.market_scraper_progress "
                    f"WHERE source='arrpro' AND is_done=FALSE"
                )
                remaining = cur.fetchone()
                if not remaining or int(remaining.get('total') or 0) == 0:
                    facts_saved = _generate_market_facts(cur)
            conn.commit()
            return {
                'statusCode': 200,
                'headers': {**CORS, 'Content-Type': 'application/json'},
                'body': json.dumps({
                    'success': True,
                    'scraped': len(items),
                    'inserted': save_result['inserted'],
                    'updated': save_result['updated'],
                    'facts_saved': facts_saved,
                    'progress': step.get('progress'),
                    'done': step.get('done', False),
                }, ensure_ascii=False),
            }
        finally:
            conn.close()

    # Авторизация для ручного запуска
    headers_ev = event.get('headers') or {}
    headers_lc = {k.lower(): v for k, v in headers_ev.items()}
    token = headers_lc.get('x-auth-token') or headers_lc.get('x-authorization', '').replace('Bearer ', '')
    if not token:
        return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Нет токена'})}

    conn_auth = psycopg2.connect(os.environ['DATABASE_URL'])
    cur_auth = conn_auth.cursor(cursor_factory=RealDictCursor)
    cur_auth.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.users u "
        f"JOIN {SCHEMA}.sessions s ON s.user_id = u.id "
        f"WHERE s.token = %s AND s.expires_at > NOW() LIMIT 1", (token,)
    )
    user = cur_auth.fetchone()
    cur_auth.close()
    conn_auth.close()
    if not user or user['role'] not in ('admin', 'director'):
        return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Нет доступа'})}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Запуск полного сбора — сбрасываем прогресс и начинаем заново
        if action == 'full_scan':
            cur.execute(
                f"DELETE FROM {SCHEMA}.market_scraper_progress WHERE source='arrpro'"
            )
            conn.commit()
            return {
                'statusCode': 200,
                'headers': {**CORS, 'Content-Type': 'application/json'},
                'body': json.dumps({'success': True, 'message': 'Прогресс сброшен. Cron начнёт полный сбор при следующем вызове.'}, ensure_ascii=False),
            }

        # Статус прогресса
        if action == 'progress':
            cur.execute(
                f"SELECT category_slug, deal_type, last_page, total_scraped, is_done, updated_at "
                f"FROM {SCHEMA}.market_scraper_progress WHERE source='arrpro' ORDER BY id"
            )
            rows = [dict(r) for r in cur.fetchall()]
            cur.execute(f"SELECT COUNT(*) as cnt FROM {SCHEMA}.market_listings WHERE source='arrpro' AND scraped_at > NOW() - INTERVAL '7 days'")
            total = cur.fetchone()
            return {
                'statusCode': 200,
                'headers': {**CORS, 'Content-Type': 'application/json'},
                'body': json.dumps({'tasks': rows, 'total_in_db': int(total['cnt'] or 0)}, ensure_ascii=False, default=str),
            }

        all_items = []
        per_source = {}

        if 'all' in sources or 'arrpro' in sources:
            items = scrape_arrpro(max_pages=max_pages)
            all_items.extend(items)
            per_source['arrpro'] = len(items)

        if 'all' in sources or 'ayax' in sources:
            items = scrape_ayax(max_pages=max_pages)
            all_items.extend(items)
            per_source['ayax'] = len(items)

        if 'all' in sources or 'moreon' in sources:
            items = scrape_moreon(max_pages=max_pages)
            all_items.extend(items)
            per_source['moreon'] = len(items)

        save_result = _save_listings(cur, all_items)
        conn.commit()

        facts_saved = 0
        if generate_facts and all_items:
            facts_saved = _generate_market_facts(cur)
            conn.commit()

        return {
            'statusCode': 200,
            'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps({
                'success': True,
                'scraped': len(all_items),
                'per_source': per_source,
                'inserted': save_result['inserted'],
                'updated': save_result['updated'],
                'facts_saved': facts_saved,
            }, ensure_ascii=False),
        }
    finally:
        conn.close()