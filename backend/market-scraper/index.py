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
    arrpro.ru структура карточки:
      <a class="props__address" href="/katalog/prodam/sklad/...-131335.php?...">Адрес</a>
      <p class="props__price">43 920 000 руб.</p>
      <p class="props__priceForM">90 000 руб./м²</p>
      <div class="option"><span>Код объекта:</span> 131335.</div>
    Категория берётся из URL-сегмента (/sklad/, /ofis/, /torgovlya/ и т.д.)
    """
    results = []
    seen_ids = set()

    # URL категорий arrpro → наши категории (из реальных URL)
    url_cat_map = {
        'sklad': 'warehouse',
        'ofis': 'office',
        'torgovoe': 'retail', 'torgovlya': 'retail', 'magazin': 'retail',
        'obshchepit': 'catering', 'kafe': 'catering', 'restoran': 'catering',
        'proizvodstvo': 'industrial', 'promyshlennoe': 'industrial',
        'svobodnogo-naznacheniya': 'free_purpose', 'psn': 'free_purpose',
        'zdanie': 'standalone', 'otdelnoe': 'standalone',
        'zemelniy-uchastok': 'land', 'zemlya': 'land',
        'gostinica': 'other', 'avtoservis': 'other',
    }

    # Разбиваем HTML на блоки карточек по якорю props__address
    # Каждая карточка содержит: props__address → props__price → props__priceForM → option(Код объекта)
    card_pattern = re.compile(
        r'href=["\'](/katalog/[^"\']+\.php[^"\']*)["\'][^>]*class=["\']props__address["\']'
        r'|class=["\']props__address["\'][^>]*href=["\']([^"\']+)["\']',
        re.IGNORECASE
    )
    price_pattern = re.compile(r'class=["\']props__price["\'][^>]*>\s*([\d\s]+)\s*руб')
    p2_pattern = re.compile(r'class=["\']props__priceForM["\'][^>]*>\s*([\d\s]+)\s*руб')
    code_pattern = re.compile(r'Код объекта[:\s]+(\d+)')
    # Адрес: внутри <a class="props__address"> после SVG идёт текст адреса
    addr_text_pattern = re.compile(r'class=["\']props__address["\'][^>]*>.*?</svg>\s*([^\n<]{5,120})\s*</a>', re.DOTALL)

    # Находим все URL карточек с их позициями
    # Пример: <a target="_blank" title="Открыть" href="/katalog/prodam/sklad/...-131335.php?#pills-map" class="props__address">
    url_matches = list(re.finditer(
        r'href=["\'](/katalog/[^"\']+\.php[^"\']*)["\'][^>]*class=["\'][^"\']*props__address',
        html, re.IGNORECASE
    ))

    positions = [(m.start(), m.group(1) or m.group(2)) for m in url_matches]

    for idx, (pos, raw_url) in enumerate(positions):
        # Вырезаем блок от текущей карточки до следующей
        next_pos = positions[idx + 1][0] if idx + 1 < len(positions) else pos + 3000
        block = html[max(0, pos - 100): next_pos + 500]

        # URL и ext_id
        obj_url = raw_url.split('?')[0]  # убираем query string
        if not obj_url.startswith('http'):
            obj_url = 'https://krasnodar.arrpro.ru' + obj_url

        id_m = re.search(r'-(\d+)\.php', obj_url)
        ext_id = id_m.group(1) if id_m else None
        if not ext_id:
            code_m = code_pattern.search(block)
            ext_id = code_m.group(1) if code_m else f"arr_{deal_type}_{idx}"

        if ext_id in seen_ids:
            continue
        seen_ids.add(ext_id)

        # deal_type из URL объявления
        if '/prodam/' in obj_url or '/prodayu-' in obj_url or '/prodam-' in obj_url:
            actual_deal = 'sale'
        elif '/snimu/' in obj_url or '/sdam-' in obj_url or '/arenda-' in obj_url:
            actual_deal = 'rent'
        else:
            actual_deal = deal_type

        # Цена
        pm = price_pattern.search(block)
        price = _clean_price(pm.group(1)) if pm else None
        if not price or price < 10000:
            continue

        # Цена за м²
        p2m = p2_pattern.search(block)
        price_per_m2 = float(_clean_price(p2m.group(1))) if p2m else None

        # Площадь из цена/цена_за_м²
        area = None
        if price and price_per_m2 and price_per_m2 > 0:
            area = round(price / price_per_m2, 1)

        # Адрес (текст внутри тега props__address)
        addr_m = addr_text_pattern.search(block)
        address = addr_m.group(1).strip() if addr_m else None

        # Категория из URL
        cat_from_url = None
        for url_seg, cat in url_cat_map.items():
            if url_seg in obj_url:
                cat_from_url = cat
                break
        category = cat_from_url or _detect_category(address or '')

        # Заголовок — строим из категории, площади и адреса (title на сайте нет в HTML)
        cat_ru_t = {'office':'Офис','retail':'Торговое помещение','warehouse':'Склад','industrial':'Производство','catering':'Общепит','free_purpose':'ПСН','standalone':'Здание','land':'Земельный участок','other':'Коммерческая недвижимость'}
        deal_ru_t = {'sale': 'Продажа', 'rent': 'Аренда'}
        title_parts = [deal_ru_t.get(actual_deal, ''), cat_ru_t.get(category, 'Объект')]
        if area: title_parts.append(f'{area} м²')
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
            'district': None,
        })

    return results


def scrape_arrpro(max_pages: int = 5) -> list[dict]:
    results = []
    sources = [
        ('https://krasnodar.arrpro.ru/katalog/prodam/', 'sale'),
        ('https://krasnodar.arrpro.ru/katalog/arenda/', 'rent'),
    ]
    for base_url, deal_type in sources:
        for page in range(1, max_pages + 1):
            url = base_url if page == 1 else f"{base_url}page/{page}/"
            html = _fetch(url)
            if not html or len(html) < 5000:
                break
            items = _parse_arrpro_page(html, deal_type)
            print(f'[arrpro] {deal_type} page={page} items={len(items)}')
            if not items:
                break
            results.extend(items)
    return results


# ── ПАРСЕР AYAX.RU ──────────────────────────────────────────────────────────

def _parse_ayax_object_page(html: str, obj_id: str, deal_type: str) -> dict | None:
    """
    Парсит страницу одного объявления ayax.ru.
    Данные берём из:
      <title>Продажа офисного помещения 80 м²: Краснодар, район, ул. Xxx</title>
      <meta name="description" content="...Цена продажи: 81 600 ₽...">
    """
    # Title: "Продажа|Аренда TYPE AREA м²: CITY, DISTRICT, ADDRESS"
    title_m = re.search(r'<title>([^<]{10,300})</title>', html)
    if not title_m:
        return None
    title_raw = title_m.group(1)

    # Описание с ценой
    desc_m = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']{20,500})["\']', html)
    desc = desc_m.group(1) if desc_m else ''

    # Площадь из title: "80 м²"
    area_m = re.search(r'([\d,\.]+)\s*м²', title_raw)
    area = _clean_area(area_m.group(1)) if area_m else None

    # Цена из description: "Цена продажи: 81 600 ₽" или "Цена аренды: 50 000 ₽/мес"
    price_m = re.search(r'[Цц]ена[^:]*:\s*([\d\s]+)\s*[₽р]', desc)
    price_raw = _clean_price(price_m.group(1)) if price_m else None

    # Определяем — цена за м² или общая (если < 500k и площадь > 10м² — скорее всего за м²)
    price = None
    price_per_m2 = None
    if price_raw and area and area > 0:
        if price_raw < 500_000 and area > 10:
            # Цена за м²
            price_per_m2 = float(price_raw)
            price = int(price_raw * area)
        else:
            price = price_raw
            price_per_m2 = round(price / area, 2) if area > 0 else None

    if not price and not price_per_m2:
        return None

    # Адрес и район из title
    addr_m = re.search(r'Краснодар[,\s]+([^—\n<]{5,150})', title_raw)
    address = addr_m.group(1).strip().rstrip(' ,') if addr_m else None

    # Тип объекта из title
    type_m = re.search(r'(?:Продажа|Аренда)\s+([^0-9]{3,60}?)\s+[\d,\.]+\s*м', title_raw, re.IGNORECASE)
    obj_type = type_m.group(1).strip() if type_m else ''
    category = _detect_category(obj_type or title_raw)

    # Район
    district = None
    dist_m = re.search(r'(?:округ|район)[,\s]+([А-Яа-яёЁ\s\-]{3,40}?)(?:,|мкр|ул\.)', title_raw, re.IGNORECASE)
    if dist_m:
        district = dist_m.group(1).strip()

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
            f"area, address, district, floor, total_floors, condition, description, scraped_at) "
            f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW()) "
            f"ON CONFLICT (source, external_id) DO UPDATE SET "
            f"price=%s, price_per_m2=%s, area=%s, address=%s, district=%s, "
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
                # ON CONFLICT UPDATE
                item.get('price'), item.get('price_per_m2'), item.get('area'),
                (item.get('address') or '')[:300], (item.get('district') or '')[:200],
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

    # Сводные факты по всем источникам (объединённые)
    cur.execute(
        f"SELECT category, deal_type, "
        f"COUNT(*) AS cnt, "
        f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_p2, "
        f"ROUND(MIN(price_per_m2)::numeric, 0) AS min_p2, "
        f"ROUND(MAX(price_per_m2)::numeric, 0) AS max_p2 "
        f"FROM {SCHEMA}.market_listings "
        f"WHERE scraped_at > NOW() - INTERVAL '7 days' "
        f"AND price_per_m2 > 0 "
        f"GROUP BY category, deal_type "
        f"HAVING COUNT(*) >= 3 "
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
        if not avg_p2:
            continue
        cat_label = cat_ru.get(cat, cat)
        dt_label = deal_ru.get(dt, dt)
        facts.append({
            'key': f'market_ext_combined_{cat}_{dt}_p2',
            'value': f'Рынок Краснодара — {cat_label} ({dt_label}): рыночная цена {avg_p2:,} руб/м² (мин {min_p2:,}, макс {max_p2:,}), по {cnt} объявлениям из всех источников'
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
        return {
            'statusCode': 200,
            'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps({
                'html_len': len(html),
                'html_start': html[:500],
                'html_mid': html[len(html)//2:len(html)//2+1000],
                'price_hits': [h[1][:200] for h in price_hits],
                'area_hits': [h[1][:200] for h in area_hits],
                'classes_sample': classes,
            }, ensure_ascii=False),
        }

    # Авторизация (cron не нужна, ручной запуск — нужна)
    is_cron = params.get('action') == 'cron'
    if not is_cron:
        headers = event.get('headers') or {}
        headers_lc = {k.lower(): v for k, v in headers.items()}
        token = headers_lc.get('x-auth-token') or headers_lc.get('x-authorization', '').replace('Bearer ', '')
        if not token:
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Нет токена'})}

        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            f"SELECT u.id, u.role FROM {SCHEMA}.users u "
            f"JOIN {SCHEMA}.sessions s ON s.user_id = u.id "
            f"WHERE s.token = %s AND s.expires_at > NOW() LIMIT 1", (token,)
        )
        user = cur.fetchone()
        cur.close()
        conn.close()
        if not user or user['role'] not in ('admin', 'director'):
            return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Нет доступа'})}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
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