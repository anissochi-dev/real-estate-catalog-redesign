"""
Импорт объекта недвижимости по URL — специализированные парсеры для АРР, Авито, ЦИАН, Этажи, Аякс + универсальный fallback.
Возвращает максимально заполненные поля объекта: title, description, price, area, address, district,
floor, total_floors, ceiling_height, electricity_kw, utilities, condition, parking, category, deal, images.
"""
import json
import re
import os
import urllib.request
import urllib.error
import urllib.parse
import gzip as _gzip
from html.parser import HTMLParser

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
}
MAX_HTML = 800_000

UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
UA_MAC     = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
UA_BOT     = 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)'


def _ok(body: dict) -> dict:
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, ensure_ascii=False)}

def _err(msg: str, status: int = 400) -> dict:
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


# ─── HTTP ────────────────────────────────────────────────────────────────────

def _fetch(url: str, ua: str = UA_DESKTOP, referer: str = '', extra_headers: dict = None, timeout: int = 20) -> str:
    headers = {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
    }
    if referer:
        headers['Referer'] = referer
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read(MAX_HTML)
        if resp.headers.get('Content-Encoding', '') == 'gzip':
            try:
                raw = _gzip.decompress(raw)
            except Exception:
                pass
        enc = resp.headers.get_content_charset() or 'utf-8'
        try:
            return raw.decode(enc, errors='replace')
        except Exception:
            return raw.decode('utf-8', errors='replace')


# ─── HELPERS ─────────────────────────────────────────────────────────────────

def _clean_price(s) -> int:
    d = re.sub(r'[^\d]', '', str(s))
    return int(d) if d else 0

def _clean_float(s) -> float:
    s = str(s).replace(',', '.').replace(' ', '')
    m = re.search(r'\d+\.?\d*', s)
    return float(m.group()) if m else 0.0

def _strip_tags(html: str) -> str:
    return re.sub(r'<[^>]+>', ' ', html)

def _collapse(s: str) -> str:
    return re.sub(r'\s+', ' ', s).strip()

def _find_price(text: str) -> int:
    for p in [
        r'([\d\s]{3,})\s*₽',
        r'([\d\s]{3,})\s*руб',
        r'(?:цена|стоимость|price)[:\s]*([\d\s]{3,})',
    ]:
        m = re.search(p, text, re.I)
        if m:
            v = _clean_price(m.group(1))
            if v > 500:
                return v
    return 0

def _find_area(text: str) -> float:
    for p in [
        r'([\d,\.]+)\s*м[²2²]',
        r'(?:площадь|площ)[:\s]*([\d,\.]+)',
    ]:
        m = re.search(p, text, re.I)
        if m:
            v = _clean_float(m.group(1))
            if 3 < v < 500000:
                return v
    return 0.0

def _find_ceiling(text: str) -> float:
    m = re.search(r'(?:высота[^:]*потолк|потолк[^\d]*высота)[^\d]*([\d,\.]+)', text, re.I)
    if not m:
        m = re.search(r'([\d,\.]+)\s*м\s*(?:высота|потолк)', text, re.I)
    if m:
        v = _clean_float(m.group(1))
        if 1.5 < v < 30:
            return v
    return 0.0

def _find_floor(text: str):
    m = re.search(r'(?:этаж|floor)[^\d]*([\d]+)\s*(?:из|/|из\s*)([\d]+)', text, re.I)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r'(?:этаж|floor)[^\d]*([\d]+)', text, re.I)
    if m:
        return int(m.group(1)), None
    return None, None

def _find_electricity(text: str) -> float:
    m = re.search(r'([\d,\.]+)\s*кВ[тТ]', text, re.I)
    if m:
        v = _clean_float(m.group(1))
        if 1 < v < 10000:
            return v
    return 0.0

def _detect_deal(text: str, url: str) -> str:
    t = (text + url).lower()
    if any(w in t for w in ['sdam', 'arenda', 'rent', 'аренд', 'сдам', 'сдаётся', 'сдается']):
        return 'rent'
    if any(w in t for w in ['продам', 'продаётся', 'sale', 'prodazha', 'куплю→продам']):
        return 'sale'
    return 'sale'

CAT_MAP = {
    'sklad': 'warehouse', 'склад': 'warehouse', 'warehouse': 'warehouse',
    'office': 'office', 'ofis': 'office', 'офис': 'office',
    'torgovoe': 'retail', 'retail': 'retail', 'магазин': 'retail', 'торгов': 'retail',
    'restoran': 'restaurant', 'кафе': 'restaurant', 'ресторан': 'restaurant',
    'proizvodstvo': 'production', 'производств': 'production',
    'gostinitsa': 'hotel', 'hotel': 'hotel', 'гостиниц': 'hotel',
    'gotovyy-biznes': 'business', 'ready': 'business', 'бизнес': 'business',
    'zemlya': 'land', 'земл': 'land', 'участок': 'land',
    'svobodnogo': 'free_purpose', 'свободн': 'free_purpose',
    'zdanie': 'building', 'здание': 'building',
}

def _detect_category(text: str, url: str) -> str:
    combined = (url + ' ' + text).lower()
    for key, cat in CAT_MAP.items():
        if key in combined:
            return cat
    return 'office'

def _detect_utilities(text: str) -> str:
    found = []
    checks = [
        (['электр', 'электроснабж'], 'электричество'),
        (['водопровод', 'водоснабж', 'вода'], 'вода'),
        (['канализац', 'водоотвед'], 'канализация'),
        (['газ', 'газоснабж'], 'газ'),
        (['отоплен'], 'отопление'),
        (['вентилян', 'вентиляц'], 'вентиляция'),
        (['интернет', 'lan', 'ethernet'], 'интернет'),
    ]
    t = text.lower()
    for kws, label in checks:
        if any(kw in t for kw in kws):
            found.append(label)
    return ', '.join(found)

def _detect_condition(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ['евроремонт', 'euro']):
        return 'euro'
    if any(w in t for w in ['дизайнерск']):
        return 'designer'
    if any(w in t for w in ['чистовая', 'хорош', 'отличн']):
        return 'good'
    if any(w in t for w in ['рабочее', 'нормальн', 'удовлетвор']):
        return 'normal'
    if any(w in t for w in ['требует ремонта', 'нужен ремонт', 'под ремонт']):
        return 'needs_repair'
    if any(w in t for w in ['черновая', 'без отделки', 'shell']):
        return 'rough'
    return ''

def _detect_parking(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ['подземн', 'паркинг']):
        return 'underground'
    if any(w in t for w in ['крытая парковка', 'крытый паркинг']):
        return 'covered'
    if any(w in t for w in ['парковка', 'стоянка', 'автостоянк']):
        return 'outdoor'
    return ''

def _clean_title(raw: str) -> str:
    raw = re.sub(r'\s*[\|\-–—].*$', '', raw).strip()
    raw = re.sub(r'\s+', ' ', raw)
    return raw[:120]

def _clean_desc(raw: str) -> str:
    raw = _collapse(_strip_tags(raw))
    return raw[:8000]


# ─── UNIVERSAL META PARSER ───────────────────────────────────────────────────

class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ''
        self.description = ''
        self.og = {}
        self.images = []
        self.json_ld = []
        self._in_title = False
        self._in_script = False
        self._script_buf = ''
        self._script_type = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title':
            self._in_title = True
        elif tag == 'meta':
            name = a.get('name', '').lower()
            prop = a.get('property', '').lower()
            cnt = a.get('content', '')
            if name == 'description':
                self.description = cnt
            if prop == 'og:title':
                self.og['title'] = cnt
            if prop == 'og:description':
                self.og['description'] = cnt
            if prop in ('og:image', 'og:image:url') and cnt and cnt not in self.images:
                self.images.append(cnt)
        elif tag == 'img':
            src = a.get('src', '') or a.get('data-src', '') or a.get('data-lazy-src', '')
            if src and src.startswith('http') and src not in self.images:
                if any(ext in src.lower() for ext in ('.jpg', '.jpeg', '.png', '.webp')):
                    self.images.append(src)
        elif tag == 'script':
            if 'application/ld+json' in a.get('type', ''):
                self._in_script = True
                self._script_type = 'json-ld'
                self._script_buf = ''

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False
        elif tag == 'script' and self._in_script:
            self._in_script = False
            if self._script_buf.strip():
                try:
                    self.json_ld.append(json.loads(self._script_buf))
                except Exception:
                    pass
            self._script_buf = ''

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_script:
            self._script_buf += data


# ─── ARRPRO PARSER ───────────────────────────────────────────────────────────

def _parse_arrpro(html: str, url: str) -> dict:
    """arrpro.ru — SSR, данные в мета-тегах и HTML-блоках характеристик."""
    p = MetaParser()
    p.feed(html)

    title = _clean_title(p.og.get('title') or p.title or '')
    # Убираем суффикс "на АРР"
    title = re.sub(r'\s+на\s+АРР\s*$', '', title, flags=re.I).strip()

    description = ''
    # Описание в блоке с классом detail-text или similar
    m = re.search(r'class=["\'][^"\']*(?:detail.text|description|object.desc)[^"\']*["\'][^>]*>(.*?)</(?:div|section|p)>',
                  html, re.I | re.S)
    if m:
        description = _clean_desc(m.group(1))
    if not description:
        description = _clean_desc(p.og.get('description') or p.description or '')

    # Цена: сначала ищем итоговую сумму "405 600 руб" (без /м²), потом fallback
    price = 0
    # og:description обычно содержит "по стоимости 405 600 руб"
    m_og = re.search(r'по стоимости\s+([\d\s]{4,})\s*руб', p.og.get('description', '') + p.description, re.I)
    if m_og:
        price = _clean_price(m_og.group(1))
    if not price:
        # Ищем крупную сумму рядом с "руб" но НЕ после "руб./м²"
        for m_t in re.finditer(r'([\d][\d\s]{4,})\s*руб(?!.*?/\s*м)', html):
            v = _clean_price(m_t.group(1))
            if v > 50000:
                price = v
                break
    if not price:
        price = _find_price(html[:80000])

    area = _find_area(html[:80000])

    # Адрес — ищем в itemprop/data-атрибутах, не захватываем телефоны
    address = ''
    for pat in [
        r'itemprop=["\']streetAddress["\'][^>]*>([^<]{5,100})',
        r'class=["\'][^"\']*address[^"\']*["\'][^>]*>([^<]{5,100})',
        r'(?:ул\.|пр\.|пер\.|просп\.)\s+[\w\-«»"]{3,}(?:\s*/\s*[\w\-«»"]{3,})?',
    ]:
        m_addr = re.search(pat, html, re.I)
        if m_addr:
            candidate = _collapse(m_addr.group(m_addr.lastindex or 0))
            if not re.search(r'\+7|\d{10}|href=|class=', candidate):
                address = candidate[:100]
                break
    if not address:
        # Из slug: .../sdam-sklad-na-uralskoy-130830.php
        slug = url.split('/')[-1].replace('.php', '')
        parts = [p for p in slug.split('-') if not p.isdigit()]
        try:
            idx = parts.index('na')
            address = 'ул. ' + '/'.join(p.title() for p in parts[idx+1:idx+3])
        except (ValueError, IndexError):
            pass

    district = ''
    m_dist = re.search(
        r'itemprop=["\']addressRegion["\'][^>]*>([^<]{3,50})', html, re.I)
    if m_dist:
        district = _collapse(m_dist.group(1))

    images = list(dict.fromkeys(p.images))
    # Ищем большие изображения в gallery / slider
    for img_url in re.findall(r'https?://cdn[^"\s]+\.(?:jpg|jpeg|png|webp)', html, re.I):
        if img_url not in images:
            images.append(img_url)
    # Убираем маленькие thumbnails (resize_cache со 100px)
    images = [u for u in images if '/resize_cache/100' not in u and '/resize_cache/50' not in u][:15]

    ceiling = _find_ceiling(html[:100000])
    floor, total_floors = _find_floor(html[:100000])
    electricity = _find_electricity(html[:100000])
    utilities = _detect_utilities(html[:100000])
    condition = _detect_condition(html[:80000])
    parking = _detect_parking(html[:80000])
    deal = _detect_deal(url + title, url)
    category = _detect_category(url + title, url)

    return {
        'source': 'arrpro.ru',
        'source_reliable': True,
        'title': title,
        'description': description,
        'price': price,
        'area': area,
        'address': address,
        'district': district,
        'floor': floor,
        'total_floors': total_floors,
        'ceiling_height': ceiling or None,
        'electricity_kw': electricity or None,
        'utilities': utilities,
        'condition': condition,
        'parking': parking,
        'deal': deal,
        'category': category,
        'images': images,
        'city': 'Краснодар',
    }


# ─── AYAX PARSER ─────────────────────────────────────────────────────────────

def _parse_ayax(html: str, url: str) -> dict:
    """ayax.ru — SSR, данные в мета-тегах и таблице характеристик."""
    p = MetaParser()
    p.feed(html)

    title = _clean_title(p.og.get('title') or p.title or '')
    title = re.sub(r'\s*[-—|]\s*Аякс.*$', '', title, flags=re.I).strip()

    description = _clean_desc(p.og.get('description') or p.description or '')

    # Описание — ищем в блоке .prop-text или .description
    m = re.search(r'class=["\'][^"\']*prop.?text[^"\']*["\'][^>]*>(.*?)</div>', html, re.I | re.S)
    if m:
        description = _clean_desc(m.group(1)) or description

    price = _find_price(html[:80000])
    area = _find_area(html[:80000])
    ceiling = _find_ceiling(html[:100000])
    floor, total_floors = _find_floor(html[:100000])
    electricity = _find_electricity(html[:100000])
    utilities = _detect_utilities(html[:100000])
    condition = _detect_condition(html[:80000])
    parking = _detect_parking(html[:80000])
    deal = _detect_deal(url + title, url)
    category = _detect_category(url + title, url)

    address = ''
    m_addr = re.search(r'(?:Адрес|адрес)[^:]*:\s*<[^>]*>([^<]{5,100})', html, re.I)
    if m_addr:
        address = _collapse(m_addr.group(1))
    if not address:
        m_addr = re.search(r'(?:Адрес|адрес)[^:]*:\s*([^\n<]{5,80})', html, re.I)
        if m_addr:
            address = _collapse(m_addr.group(1))

    images = list(dict.fromkeys(p.images))
    for img_url in re.findall(r'https?://(?:www\.)?ayax\.ru[^"\s]+\.(?:jpg|jpeg|png|webp)', html, re.I):
        if img_url not in images:
            images.append(img_url)
    images = images[:15]

    return {
        'source': 'ayax.ru',
        'source_reliable': True,
        'title': title,
        'description': description,
        'price': price,
        'area': area,
        'address': address,
        'district': '',
        'floor': floor,
        'total_floors': total_floors,
        'ceiling_height': ceiling or None,
        'electricity_kw': electricity or None,
        'utilities': utilities,
        'condition': condition,
        'parking': parking,
        'deal': deal,
        'category': category,
        'images': images,
        'city': 'Краснодар',
    }


# ─── ETAGI PARSER ────────────────────────────────────────────────────────────

def _parse_etagi(html: str, url: str) -> dict:
    """etagi.com / этажи — данные в JSON-LD и мета-тегах."""
    p = MetaParser()
    p.feed(html)

    title = _clean_title(p.og.get('title') or p.title or '')
    title = re.sub(r'\s*[|—-]\s*Этажи.*$', '', title, flags=re.I).strip()
    description = _clean_desc(p.og.get('description') or p.description or '')

    price = 0
    address = ''
    images_ld = []
    for ld in p.json_ld:
        if not price:
            offers = ld.get('offers', {})
            if isinstance(offers, dict):
                price = _clean_price(str(offers.get('price', 0)))
        loc = ld.get('address', {})
        if isinstance(loc, dict) and not address:
            parts = [loc.get('streetAddress', ''), loc.get('addressLocality', '')]
            address = ', '.join(pp for pp in parts if pp)
        imgs = ld.get('image', [])
        if isinstance(imgs, str):
            imgs = [imgs]
        for img in imgs:
            if img not in images_ld:
                images_ld.append(img)

    if not price:
        price = _find_price(html[:80000])
    area = _find_area(html[:80000])
    ceiling = _find_ceiling(html[:100000])
    floor, total_floors = _find_floor(html[:100000])
    electricity = _find_electricity(html[:100000])
    utilities = _detect_utilities(html[:100000])
    condition = _detect_condition(html[:80000])
    parking = _detect_parking(html[:80000])
    deal = _detect_deal(url + title, url)
    category = _detect_category(url + title, url)

    images = list(dict.fromkeys(images_ld + p.images))[:15]

    return {
        'source': 'etagi.com',
        'source_reliable': True,
        'title': title,
        'description': description,
        'price': price,
        'area': area,
        'address': address,
        'district': '',
        'floor': floor,
        'total_floors': total_floors,
        'ceiling_height': ceiling or None,
        'electricity_kw': electricity or None,
        'utilities': utilities,
        'condition': condition,
        'parking': parking,
        'deal': deal,
        'category': category,
        'images': images,
        'city': 'Краснодар',
    }


# ─── CIAN PARSER ─────────────────────────────────────────────────────────────

def _parse_cian(html: str, url: str) -> dict:
    """cian.ru — данные в JSON-LD и '__initialData__' JS-переменной."""
    p = MetaParser()
    p.feed(html)

    title = _clean_title(p.og.get('title') or p.title or '')
    title = re.sub(r'\s*[|—]\s*ЦИАН.*$', '', title, flags=re.I).strip()
    description = _clean_desc(p.og.get('description') or p.description or '')

    price = 0
    area = 0.0
    address = ''
    images_out = list(p.images)

    # Пробуем JSON из __initialData__
    m_data = re.search(r'window\.__initialData__\s*=\s*(\{.{100,}?\});?\s*(?:window\.|</script>)', html, re.S)
    if m_data:
        try:
            data = json.loads(m_data.group(1))
            offer = (data.get('offerData') or data.get('offer') or {})
            if not offer:
                # Пробуем глубже
                for v in data.values():
                    if isinstance(v, dict) and v.get('bargainTerms'):
                        offer = v
                        break
            price = _clean_price(str((offer.get('bargainTerms') or {}).get('price', 0)))
            area = _clean_float((offer.get('totalArea') or offer.get('area') or 0))
            geo = offer.get('geo') or {}
            address = geo.get('userInput') or geo.get('address') or ''
            for ph in (offer.get('photos') or []):
                src = ph.get('fullUrl') or ph.get('url') or ''
                if src and src not in images_out:
                    images_out.append(src)
        except Exception:
            pass

    if not price:
        price = _find_price(html[:80000])
    if not area:
        area = _find_area(html[:80000])

    ceiling = _find_ceiling(html[:100000])
    floor, total_floors = _find_floor(html[:100000])
    electricity = _find_electricity(html[:100000])
    utilities = _detect_utilities(html[:100000])
    condition = _detect_condition(html[:80000])
    parking = _detect_parking(html[:80000])
    deal = _detect_deal(url + title, url)
    category = _detect_category(url + title, url)

    return {
        'source': 'cian.ru',
        'source_reliable': False,  # ЦИАН часто блокирует
        'title': title,
        'description': description,
        'price': price,
        'area': area,
        'address': address,
        'district': '',
        'floor': floor,
        'total_floors': total_floors,
        'ceiling_height': ceiling or None,
        'electricity_kw': electricity or None,
        'utilities': utilities,
        'condition': condition,
        'parking': parking,
        'deal': deal,
        'category': category,
        'images': images_out[:15],
        'city': '',
    }


# ─── AVITO PARSER ────────────────────────────────────────────────────────────

def _parse_avito(html: str, url: str) -> dict:
    """avito.ru — данные в JSON-LD (schema.org Product) и мета-тегах."""
    p = MetaParser()
    p.feed(html)

    title = _clean_title(p.og.get('title') or p.title or '')
    title = re.sub(r'\s*[|—-]\s*Авито.*$', '', title, flags=re.I).strip()
    description = ''
    for ld in p.json_ld:
        if ld.get('@type') in ('Product', 'Offer', 'RealEstateListing'):
            description = _clean_desc(ld.get('description', ''))
            break
    if not description:
        description = _clean_desc(p.og.get('description') or p.description or '')

    price = 0
    area = 0.0
    address = ''
    images_ld = []
    for ld in p.json_ld:
        offers = ld.get('offers', {})
        if isinstance(offers, dict) and not price:
            price = _clean_price(str(offers.get('price', 0)))
        loc = ld.get('address', {})
        if isinstance(loc, dict) and not address:
            parts = [loc.get('streetAddress', ''), loc.get('addressLocality', '')]
            address = ', '.join(pp for pp in parts if pp)
        imgs = ld.get('image', [])
        if isinstance(imgs, str):
            imgs = [imgs]
        for img in imgs:
            if img not in images_ld:
                images_ld.append(img)

    if not price:
        price = _find_price(html[:80000])
    if not area:
        area = _find_area(html[:80000])
    if not area:
        # Авито хранит площадь в params-блоках
        m = re.search(r'Площадь[^:]*[:\s]*([\d,\.]+)\s*м', html, re.I)
        if m:
            area = _clean_float(m.group(1))

    ceiling = _find_ceiling(html[:100000])
    floor, total_floors = _find_floor(html[:100000])
    electricity = _find_electricity(html[:100000])
    utilities = _detect_utilities(html[:100000])
    condition = _detect_condition(html[:80000])
    parking = _detect_parking(html[:80000])
    deal = _detect_deal(url + title, url)
    category = _detect_category(url + title, url)

    images = list(dict.fromkeys(images_ld + p.images))[:15]

    return {
        'source': 'avito.ru',
        'source_reliable': False,  # Авито блокирует облачные IP
        'title': title,
        'description': description,
        'price': price,
        'area': area,
        'address': address,
        'district': '',
        'floor': floor,
        'total_floors': total_floors,
        'ceiling_height': ceiling or None,
        'electricity_kw': electricity or None,
        'utilities': utilities,
        'condition': condition,
        'parking': parking,
        'deal': deal,
        'category': category,
        'images': images,
        'city': '',
    }


# ─── UNIVERSAL FALLBACK ──────────────────────────────────────────────────────

def _parse_universal(html: str, url: str) -> dict:
    """Универсальный парсер для любых сайтов недвижимости."""
    p = MetaParser()
    p.feed(html)

    title = _clean_title(p.og.get('title') or p.title or '')
    description = _clean_desc(p.og.get('description') or p.description or '')

    # JSON-LD
    price = 0
    address = ''
    images_ld = []
    for ld in p.json_ld:
        offers = ld.get('offers', {})
        if isinstance(offers, dict) and not price:
            price = _clean_price(str(offers.get('price', 0)))
        loc = ld.get('address', {})
        if isinstance(loc, dict) and not address:
            parts = [loc.get('streetAddress', ''), loc.get('addressLocality', '')]
            address = ', '.join(pp for pp in parts if pp)
        elif isinstance(loc, str) and not address:
            address = loc
        imgs = ld.get('image', [])
        if isinstance(imgs, str):
            imgs = [imgs]
        for img in imgs:
            if img not in images_ld:
                images_ld.append(img)

    if not price:
        price = _find_price(html[:80000])
    area = _find_area(html[:80000])
    ceiling = _find_ceiling(html[:100000])
    floor, total_floors = _find_floor(html[:100000])
    electricity = _find_electricity(html[:100000])
    utilities = _detect_utilities(html[:100000])
    condition = _detect_condition(html[:80000])
    parking = _detect_parking(html[:80000])
    deal = _detect_deal(url + title, url)
    category = _detect_category(url + title, url)

    images = list(dict.fromkeys(images_ld + p.images))[:15]

    return {
        'source': urllib.parse.urlparse(url).netloc.replace('www.', ''),
        'source_reliable': True,
        'title': title,
        'description': description,
        'price': price,
        'area': area,
        'address': address,
        'district': '',
        'floor': floor,
        'total_floors': total_floors,
        'ceiling_height': ceiling or None,
        'electricity_kw': electricity or None,
        'utilities': utilities,
        'condition': condition,
        'parking': parking,
        'deal': deal,
        'category': category,
        'images': images,
        'city': '',
    }


# ─── ROUTER ──────────────────────────────────────────────────────────────────

def _route(url: str) -> tuple:
    """Возвращает (parser_fn, fetch_kwargs, blocked_message_or_None)."""
    h = url.lower()
    if 'arrpro.ru' in h:
        return _parse_arrpro, {}, None
    if 'ayax.ru' in h:
        return _parse_ayax, {}, None
    if 'etagi.com' in h or 'этажи.com' in h:
        return _parse_etagi, {}, None
    if 'restate.ru' in h:
        return _parse_universal, {}, None
    if 'cian.ru' in h or 'циан.рф' in h:
        return _parse_cian, {
            'extra_headers': {
                'X-Requested-With': 'XMLHttpRequest',
                'Sec-Fetch-Dest': 'document',
            }
        }, 'ЦИАН часто блокирует серверные запросы. Если данные не загрузились — скопируйте их вручную.'
    if 'avito.ru' in h:
        return _parse_avito, {
            'ua': UA_BOT,
            'referer': 'https://www.avito.ru/',
        }, 'Авито блокирует серверный парсинг. Будет попытка, но часть данных может отсутствовать.'
    return _parse_universal, {}, None


# ─── HANDLER ─────────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """Парсит страницу объекта недвижимости по URL и возвращает полные структурированные данные."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    if event.get('httpMethod', 'POST') != 'POST':
        return _err('Method not allowed', 405)

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err('Invalid JSON body')

    url = (body.get('url') or '').strip()
    if not url:
        return _err('URL не указан')
    if not url.startswith('http'):
        url = 'https://' + url

    parse_fn, fetch_kwargs, warn = _route(url)
    warning = warn or ''

    # Пробуем несколько UA при 403
    user_agents = [UA_DESKTOP, UA_MAC, UA_BOT]
    html = None
    last_err = None
    for ua in user_agents:
        try:
            kw = dict(fetch_kwargs)
            kw.setdefault('ua', ua)
            html = _fetch(url, **kw)
            break
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code not in (403, 429, 503):
                return _err(f'Не удалось открыть страницу: HTTP {e.code}')
        except Exception as e:
            return _err(f'Не удалось открыть страницу: {str(e)[:150]}')

    if html is None:
        domain = urllib.parse.urlparse(url).netloc
        return _err(
            f'{domain} запрещает автоматическое чтение (HTTP 403). '
            'Авито и ЦИАН блокируют серверный парсинг — введите данные вручную или вставьте ссылку на фото.'
        )

    try:
        result = parse_fn(html, url)
    except Exception as e:
        return _err(f'Ошибка парсинга: {str(e)[:150]}')

    result['source_url'] = url
    if warning:
        result['warning'] = warning

    # Убираем None-значения для удобства фронта
    result = {k: v for k, v in result.items() if v is not None and v != '' and v != []}
    result.setdefault('images', [])

    print(f'[import-url] {result.get("source")} → title={result.get("title","")[:60]}, '
          f'price={result.get("price")}, area={result.get("area")}, images={len(result.get("images",[]))}')

    return _ok({'listing': result})