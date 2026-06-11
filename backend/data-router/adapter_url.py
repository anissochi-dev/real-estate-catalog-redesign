"""
adapter_url.py — парсинг одного URL объекта недвижимости.
Специализированные парсеры: arrpro.ru, ayax.ru, etagi.com, cian.ru, avito.ru + universal fallback.
Все HTTP-утилиты и классификаторы — из core.py.
"""

import json
import re
import urllib.parse
import urllib.error
from html.parser import HTMLParser

from core import (
    UA_DESKTOP, UA_MAC, UA_BOT,
    fetch,
    map_category, map_deal,
    parse_floor, parse_ceiling, parse_electricity,
    detect_utilities, detect_condition, detect_parking,
    collapse, clean_title, clean_desc,
)


def _clean_price(s):
    d = re.sub(r'[^\d]', '', str(s))
    return int(d) if d else 0

def _clean_float(s):
    s = str(s).replace(',', '.').replace(' ', '')
    m = re.search(r'\d+\.?\d*', s)
    return float(m.group()) if m else 0.0

def _find_price(text):
    for p in [r'([\d\s]{3,})\s*₽', r'([\d\s]{3,})\s*руб',
              r'(?:цена|стоимость|price)[:\s]*([\d\s]{3,})']:
        m = re.search(p, text, re.I)
        if m:
            v = _clean_price(m.group(1))
            if v > 500:
                return v
    return 0

def _find_area(text):
    for p in [r'([\d,\.]+)\s*м[²2²]', r'(?:площадь|площ)[:\s]*([\d,\.]+)']:
        m = re.search(p, text, re.I)
        if m:
            v = _clean_float(m.group(1))
            if 3 < v < 500_000:
                return v
    return 0.0


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ''; self.description = ''; self.og = {}
        self.images = []; self.json_ld = []
        self._in_title = False; self._in_script = False; self._script_buf = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title':
            self._in_title = True
        elif tag == 'meta':
            name = a.get('name', '').lower(); prop = a.get('property', '').lower(); cnt = a.get('content', '')
            if name == 'description': self.description = cnt
            if prop == 'og:title': self.og['title'] = cnt
            if prop == 'og:description': self.og['description'] = cnt
            if prop in ('og:image', 'og:image:url') and cnt and cnt not in self.images:
                self.images.append(cnt)
        elif tag == 'img':
            src = a.get('src') or a.get('data-src') or a.get('data-lazy-src') or ''
            if src.startswith('http') and src not in self.images:
                if any(ext in src.lower() for ext in ('.jpg', '.jpeg', '.png', '.webp')):
                    self.images.append(src)
        elif tag == 'script':
            if 'application/ld+json' in a.get('type', ''):
                self._in_script = True; self._script_buf = ''

    def handle_endtag(self, tag):
        if tag == 'title': self._in_title = False
        elif tag == 'script' and self._in_script:
            self._in_script = False
            if self._script_buf.strip():
                try: self.json_ld.append(json.loads(self._script_buf))
                except Exception: pass
            self._script_buf = ''

    def handle_data(self, data):
        if self._in_title: self.title += data
        if self._in_script: self._script_buf += data


def _base(source, reliable):
    return {'source': source, 'source_reliable': reliable, 'title': '', 'description': '',
            'price': 0, 'area': 0.0, 'address': '', 'district': '', 'floor': None,
            'total_floors': None, 'ceiling_height': None, 'electricity_kw': None,
            'utilities': '', 'condition': '', 'parking': '', 'deal': 'sale',
            'category': 'office', 'images': [], 'city': ''}


def _enrich(res, html, url):
    h80 = html[:80_000]; h100 = html[:100_000]
    if not res.get('price'):       res['price']         = _find_price(h80)
    if not res.get('area'):        res['area']          = _find_area(h80)
    if not res.get('ceiling_height'): res['ceiling_height'] = parse_ceiling(h100) or None
    if res.get('floor') is None:   res['floor'], res['total_floors'] = parse_floor(h100)
    if not res.get('electricity_kw'): res['electricity_kw'] = parse_electricity(h100) or None
    if not res.get('utilities'):   res['utilities']     = detect_utilities(h100)
    if not res.get('condition'):   res['condition']     = detect_condition(h80)
    if not res.get('parking'):     res['parking']       = detect_parking(h80)
    if not res.get('deal'):        res['deal']          = map_deal(url + res.get('title', ''), url)
    if not res.get('category') or res.get('category') == 'office':
        res['category'] = map_category('', title=res.get('title', ''), url=url)


def _parse_arrpro(html, url):
    p = MetaParser(); p.feed(html)
    res = _base('arrpro.ru', True); res['city'] = 'Краснодар'
    title = clean_title(p.og.get('title') or p.title or '', 120)
    res['title'] = re.sub(r'\s+на\s+АРР\s*$', '', title, flags=re.I).strip()
    m = re.search(r'class=["\'][^"\']*(?:detail.text|description|object.desc)[^"\']*["\'][^>]*>(.*?)</(?:div|section|p)>', html, re.I|re.S)
    res['description'] = clean_desc(m.group(1) if m else (p.og.get('description') or p.description or ''), 8000)
    m_og = re.search(r'по стоимости\s+([\d\s]{4,})\s*руб', p.og.get('description', '') + p.description, re.I)
    if m_og: res['price'] = _clean_price(m_og.group(1))
    if not res['price']:
        for m_t in re.finditer(r'([\d][\d\s]{4,})\s*руб(?!.*?/\s*м)', html):
            v = _clean_price(m_t.group(1))
            if v > 50_000: res['price'] = v; break
    for pat in [r'itemprop=["\']streetAddress["\'][^>]*>([^<]{5,100})',
                r'class=["\'][^"\']*address[^"\']*["\'][^>]*>([^<]{5,100})',
                r'(?:ул\.|пр\.|пер\.|просп\.)\s+[\w\-«»"]{3,}']:
        m_addr = re.search(pat, html, re.I)
        if m_addr:
            cand = collapse(m_addr.group(m_addr.lastindex or 0))
            if not re.search(r'\+7|\d{10}|href=|class=', cand):
                res['address'] = cand[:100]; break
    m_dist = re.search(r'itemprop=["\']addressRegion["\'][^>]*>([^<]{3,50})', html, re.I)
    if m_dist: res['district'] = collapse(m_dist.group(1))
    images = list(dict.fromkeys(p.images))
    for img_url in re.findall(r'https?://cdn[^"\s]+\.(?:jpg|jpeg|png|webp)', html, re.I):
        if img_url not in images: images.append(img_url)
    res['images'] = [u for u in images if '/resize_cache/100' not in u and '/resize_cache/50' not in u][:15]
    res['deal'] = map_deal(url + res['title'], url)
    res['category'] = map_category('', title=res['title'], url=url)
    _enrich(res, html, url)
    return res


def _parse_ayax(html, url):
    p = MetaParser(); p.feed(html)
    res = _base('ayax.ru', True); res['city'] = 'Краснодар'
    title = clean_title(p.og.get('title') or p.title or '', 120)
    res['title'] = re.sub(r'\s*[-—|]\s*Аякс.*$', '', title, flags=re.I).strip()
    res['description'] = clean_desc(p.og.get('description') or p.description or '', 8000)
    m = re.search(r'class=["\'][^"\']*prop.?text[^"\']*["\'][^>]*>(.*?)</div>', html, re.I|re.S)
    if m: res['description'] = clean_desc(m.group(1), 8000) or res['description']
    m_addr = re.search(r'(?:Адрес|адрес)[^:]*:\s*<[^>]*>([^<]{5,100})', html, re.I)
    if not m_addr: m_addr = re.search(r'(?:Адрес|адрес)[^:]*:\s*([^\n<]{5,80})', html, re.I)
    if m_addr: res['address'] = collapse(m_addr.group(1))
    images = list(dict.fromkeys(p.images))
    for img_url in re.findall(r'https?://(?:www\.)?ayax\.ru[^"\s]+\.(?:jpg|jpeg|png|webp)', html, re.I):
        if img_url not in images: images.append(img_url)
    res['images'] = images[:15]
    res['deal'] = map_deal(url + res['title'], url)
    res['category'] = map_category('', title=res['title'], url=url)
    _enrich(res, html, url)
    return res


def _parse_etagi(html, url):
    p = MetaParser(); p.feed(html)
    res = _base('etagi.com', True)
    title = clean_title(p.og.get('title') or p.title or '', 120)
    res['title'] = re.sub(r'\s*[|—-]\s*Этажи.*$', '', title, flags=re.I).strip()
    res['description'] = clean_desc(p.og.get('description') or p.description or '', 8000)
    images_ld = []
    for ld in p.json_ld:
        if not res['price']:
            offers = ld.get('offers', {})
            if isinstance(offers, dict): res['price'] = _clean_price(str(offers.get('price', 0)))
        if not res['address']:
            loc = ld.get('address', {})
            if isinstance(loc, dict):
                res['address'] = ', '.join(pp for pp in [loc.get('streetAddress',''), loc.get('addressLocality','')] if pp)
        imgs = ld.get('image', [])
        if isinstance(imgs, str): imgs = [imgs]
        for img in imgs:
            if img not in images_ld: images_ld.append(img)
    res['images'] = list(dict.fromkeys(images_ld + p.images))[:15]
    res['deal'] = map_deal(url + res['title'], url)
    res['category'] = map_category('', title=res['title'], url=url)
    _enrich(res, html, url)
    return res


def _parse_cian(html, url):
    p = MetaParser(); p.feed(html)
    res = _base('cian.ru', False)
    title = clean_title(p.og.get('title') or p.title or '', 120)
    res['title'] = re.sub(r'\s*[|—]\s*ЦИАН.*$', '', title, flags=re.I).strip()
    res['description'] = clean_desc(p.og.get('description') or p.description or '', 8000)
    images_out = list(p.images)
    m_data = re.search(r'window\.__initialData__\s*=\s*(\{.{100,}?\});?\s*(?:window\.|</script>)', html, re.S)
    if m_data:
        try:
            data = json.loads(m_data.group(1))
            offer = data.get('offerData') or data.get('offer') or {}
            if not offer:
                for v in data.values():
                    if isinstance(v, dict) and v.get('bargainTerms'): offer = v; break
            res['price'] = _clean_price(str((offer.get('bargainTerms') or {}).get('price', 0)))
            res['area']  = _clean_float(offer.get('totalArea') or offer.get('area') or 0)
            geo = offer.get('geo') or {}
            res['address'] = geo.get('userInput') or geo.get('address') or ''
            for ph in (offer.get('photos') or []):
                src = ph.get('fullUrl') or ph.get('url') or ''
                if src and src not in images_out: images_out.append(src)
        except Exception: pass
    res['images'] = images_out[:15]
    res['deal'] = map_deal(url + res['title'], url)
    res['category'] = map_category('', title=res['title'], url=url)
    _enrich(res, html, url)
    return res


def _parse_avito(html, url):
    p = MetaParser(); p.feed(html)
    res = _base('avito.ru', False)
    title = clean_title(p.og.get('title') or p.title or '', 120)
    res['title'] = re.sub(r'\s*[|—-]\s*Авито.*$', '', title, flags=re.I).strip()
    images_ld = []
    for ld in p.json_ld:
        if ld.get('@type') in ('Product', 'Offer', 'RealEstateListing') and not res.get('description'):
            res['description'] = clean_desc(ld.get('description', ''), 8000)
        offers = ld.get('offers', {})
        if isinstance(offers, dict) and not res['price']:
            res['price'] = _clean_price(str(offers.get('price', 0)))
        loc = ld.get('address', {})
        if isinstance(loc, dict) and not res['address']:
            res['address'] = ', '.join(pp for pp in [loc.get('streetAddress',''), loc.get('addressLocality','')] if pp)
        imgs = ld.get('image', [])
        if isinstance(imgs, str): imgs = [imgs]
        for img in imgs:
            if img not in images_ld: images_ld.append(img)
    if not res['description']:
        res['description'] = clean_desc(p.og.get('description') or p.description or '', 8000)
    if not res['area']:
        m = re.search(r'Площадь[^:]*[:\s]*([\d,\.]+)\s*м', html, re.I)
        if m: res['area'] = _clean_float(m.group(1))
    res['images'] = list(dict.fromkeys(images_ld + p.images))[:15]
    res['deal'] = map_deal(url + res['title'], url)
    res['category'] = map_category('', title=res['title'], url=url)
    _enrich(res, html, url)
    return res


def _parse_universal(html, url):
    p = MetaParser(); p.feed(html)
    domain = urllib.parse.urlparse(url).netloc.replace('www.', '')
    res = _base(domain, True)
    res['title'] = clean_title(p.og.get('title') or p.title or '', 120)
    res['description'] = clean_desc(p.og.get('description') or p.description or '', 8000)
    images_ld = []
    for ld in p.json_ld:
        offers = ld.get('offers', {})
        if isinstance(offers, dict) and not res['price']:
            res['price'] = _clean_price(str(offers.get('price', 0)))
        loc = ld.get('address', {})
        if isinstance(loc, dict) and not res['address']:
            res['address'] = ', '.join(pp for pp in [loc.get('streetAddress',''), loc.get('addressLocality','')] if pp)
        elif isinstance(loc, str) and not res['address']:
            res['address'] = loc
        imgs = ld.get('image', [])
        if isinstance(imgs, str): imgs = [imgs]
        for img in imgs:
            if img not in images_ld: images_ld.append(img)
    res['images'] = list(dict.fromkeys(images_ld + p.images))[:15]
    res['deal'] = map_deal(url + res['title'], url)
    res['category'] = map_category('', title=res['title'], url=url)
    _enrich(res, html, url)
    return res


def _route(url):
    h = url.lower()
    if 'arrpro.ru' in h:   return _parse_arrpro, {}, None
    if 'ayax.ru' in h:     return _parse_ayax, {}, None
    if 'etagi.com' in h:   return _parse_etagi, {}, None
    if 'restate.ru' in h:  return _parse_universal, {}, None
    if 'cian.ru' in h or 'циан.рф' in h:
        return _parse_cian, {'extra_headers': {'X-Requested-With': 'XMLHttpRequest'}}, \
               'ЦИАН часто блокирует серверные запросы. Если данные не загрузились — введите вручную.'
    if 'avito.ru' in h:
        return _parse_avito, {'ua': UA_BOT, 'referer': 'https://www.avito.ru/'}, \
               'Авито блокирует серверный парсинг. Будет попытка, но часть данных может отсутствовать.'
    return _parse_universal, {}, None


def action_parse(url):
    if not url.startswith('http'):
        url = 'https://' + url
    parse_fn, fetch_kwargs, warning = _route(url)
    html = None
    for ua in [UA_DESKTOP, UA_MAC, UA_BOT]:
        try:
            kw = dict(fetch_kwargs)
            kw.setdefault('ua', ua)
            html = fetch(url, **kw)
            break
        except urllib.error.HTTPError as e:
            if e.code not in (403, 429, 503):
                return {'error': f'Не удалось открыть страницу: HTTP {e.code}'}
        except Exception as e:
            return {'error': f'Не удалось открыть страницу: {str(e)[:150]}'}
    if html is None:
        domain = urllib.parse.urlparse(url).netloc
        return {'error': f'{domain} запрещает автоматическое чтение (HTTP 403). Введите данные вручную.'}
    try:
        result = parse_fn(html, url)
    except Exception as e:
        return {'error': f'Ошибка парсинга: {str(e)[:150]}'}
    result['source_url'] = url
    if warning: result['warning'] = warning
    result = {k: v for k, v in result.items() if v is not None and v != '' and v != []}
    result.setdefault('images', [])
    return {'listing': result}
