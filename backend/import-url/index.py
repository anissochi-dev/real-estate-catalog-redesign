"""Импорт объекта недвижимости по URL сайта — парсинг страницы и возврат структурированных данных."""
import json
import re
import os
import urllib.request
import urllib.error
from html.parser import HTMLParser


CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-User-Id',
}


def _ok(body: dict, status: int = 200) -> dict:
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, ensure_ascii=False)}


def _err(msg: str, status: int = 400) -> dict:
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


class MetaParser(HTMLParser):
    """Извлекает мета-теги, title, og-теги и JSON-LD из HTML."""

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
            content = a.get('content', '')
            if name == 'description':
                self.description = content
            if prop == 'og:title':
                self.og['title'] = content
            if prop == 'og:description':
                self.og['description'] = content
            if prop == 'og:image':
                if content and content not in self.images:
                    self.images.append(content)
            if prop == 'og:price:amount':
                self.og['price'] = content
            if prop == 'product:price:amount':
                self.og['price'] = content
        elif tag == 'img':
            src = a.get('src', '')
            if src and src.startswith('http') and src not in self.images:
                if any(ext in src.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                    self.images.append(src)
        elif tag == 'script':
            stype = a.get('type', '')
            if 'application/ld+json' in stype:
                self._in_script = True
                self._script_type = 'json-ld'
                self._script_buf = ''

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False
        elif tag == 'script' and self._in_script:
            self._in_script = False
            if self._script_type == 'json-ld' and self._script_buf.strip():
                try:
                    data = json.loads(self._script_buf)
                    self.json_ld.append(data)
                except Exception:
                    pass
            self._script_buf = ''
            self._script_type = ''

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_script:
            self._script_buf += data


def _fetch_html(url: str) -> str:
    # Пробуем несколько User-Agent подряд — некоторые сайты блокируют ботов
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    ]
    last_err = None
    for ua in user_agents:
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0',
            })
            import gzip as _gzip
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read()
                enc_header = resp.headers.get('Content-Encoding', '')
                if enc_header == 'gzip':
                    try:
                        raw = _gzip.decompress(raw)
                    except Exception:
                        pass
                enc = resp.headers.get_content_charset() or 'utf-8'
                try:
                    return raw.decode(enc, errors='replace')
                except Exception:
                    return raw.decode('utf-8', errors='replace')
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code not in (403, 429, 503):
                raise
            continue
        except Exception as e:
            raise
    raise last_err


def _clean_price(raw: str) -> int:
    digits = re.sub(r'[^\d]', '', str(raw))
    return int(digits) if digits else 0


def _extract_price_from_text(text: str) -> int:
    """Ищет цену в тексте страницы: число перед ₽/руб."""
    patterns = [
        r'([\d\s]{4,})\s*₽',
        r'([\d\s]{4,})\s*руб',
        r'Цена[:\s]*([\d\s]{4,})',
        r'Стоимость[:\s]*([\d\s]{4,})',
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            val = _clean_price(m.group(1))
            if val > 1000:
                return val
    return 0


def _extract_area_from_text(text: str) -> float:
    patterns = [
        r'([\d,\.]+)\s*м[²2]',
        r'Площадь[:\s]*([\d,\.]+)',
        r'площадь[:\s]*([\d,\.]+)',
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            val = m.group(1).replace(',', '.')
            try:
                return float(val)
            except Exception:
                pass
    return 0.0


def _parse_product_ld(ld: dict) -> dict:
    result = {}
    t = ld.get('@type', '')
    if t in ('Product', 'Offer', 'RealEstateListing', 'Apartment', 'House', 'LandForSale', 'CommercialProperty'):
        result['title'] = ld.get('name', '')
        result['description'] = ld.get('description', '')
        offers = ld.get('offers', {})
        if isinstance(offers, dict):
            result['price'] = _clean_price(str(offers.get('price', 0)))
        imgs = ld.get('image', [])
        if isinstance(imgs, str):
            imgs = [imgs]
        result['images'] = imgs
        result['address'] = ''
        loc = ld.get('address', {})
        if isinstance(loc, dict):
            parts = [loc.get('streetAddress', ''), loc.get('addressLocality', '')]
            result['address'] = ', '.join(p for p in parts if p)
        elif isinstance(loc, str):
            result['address'] = loc
    return result


def handler(event: dict, context) -> dict:
    """Парсит страницу объекта недвижимости по URL и возвращает структурированные данные для импорта."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    if method != 'POST':
        return _err('Method not allowed', 405)

    body = {}
    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err('Invalid JSON body')

    url = (body.get('url') or '').strip()
    if not url:
        return _err('URL не указан')
    if not url.startswith('http'):
        url = 'https://' + url

    try:
        html = _fetch_html(url)
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return _err(
                'Сайт запрещает автоматическое чтение (HTTP 403). '
                'Попробуйте скопировать данные вручную или использовать другую ссылку. '
                'Авито и ЦИАН блокируют парсинг — скопируйте ссылку на фото и введите данные вручную.'
            )
        return _err(f'Не удалось открыть страницу: HTTP {e.code}')
    except Exception as e:
        return _err(f'Не удалось открыть страницу: {str(e)[:120]}')

    parser = MetaParser()
    try:
        parser.feed(html)
    except Exception:
        pass

    title = (parser.og.get('title') or parser.title or '').strip()
    title = re.sub(r'\s*[\|\-–—].*$', '', title).strip()

    description = (parser.og.get('description') or parser.description or '').strip()

    price = 0
    for ld in parser.json_ld:
        parsed = _parse_product_ld(ld)
        if parsed.get('price'):
            price = parsed['price']
            break
    if not price:
        price = _extract_price_from_text(html[:50000])

    area = _extract_area_from_text(html[:50000])

    images = list(dict.fromkeys(parser.images[:10]))

    address = ''
    for ld in parser.json_ld:
        parsed = _parse_product_ld(ld)
        if parsed.get('address'):
            address = parsed['address']
            break

    result = {
        'title': title[:120],
        'description': description[:5000],
        'price': price,
        'area': area,
        'images': images,
        'address': address,
        'source_url': url,
    }

    return _ok({'listing': result})