"""
core.py — единое ядро data-router.
Все маппинги, утилиты и общая логика для всех адаптеров (xlsx, csv, xml, url).
"""

import os
import re
import json
import time
import random
import urllib.request
import urllib.error
import gzip as _gzip
from datetime import datetime

import psycopg2
import psycopg2.extras

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
}

OBJ_TYPE_MAP = {
    'офисное помещение': 'office', 'офис': 'office', 'office': 'office', 'ofis': 'office', 'офисн': 'office',
    'торговое помещение': 'retail', 'торговый': 'retail', 'торгово': 'retail', 'торговля': 'retail',
    'торг': 'retail', 'магазин': 'retail', 'retail': 'retail', 'torgovoe': 'retail',
    'помещение свободного назначения': 'free_purpose', 'свободного назначения': 'free_purpose',
    'свободное': 'free_purpose', 'свободн': 'free_purpose', 'псн': 'free_purpose', 'svobodnogo': 'free_purpose',
    'складское помещение': 'warehouse', 'склад': 'warehouse', 'складск': 'warehouse',
    'warehouse': 'warehouse', 'sklad': 'warehouse',
    'производственное помещение': 'production', 'производство': 'production',
    'производственно': 'production', 'цех': 'production', 'промышленн': 'production',
    'industrial': 'production', 'proizvodstvo': 'production',
    'отдельно стоящее здание': 'building', 'здание': 'building', 'здани': 'building',
    'особняк': 'building', 'building': 'building', 'zdanie': 'building', 'отдельно': 'building',
    'помещение общепита': 'catering', 'общепит': 'catering', 'кафе': 'catering',
    'ресторан': 'catering', 'столовая': 'catering', 'restoran': 'catering', 'restaurant': 'catering',
    'гостиница': 'hotel', 'апартаменты': 'hotel', 'отель': 'hotel', 'хостел': 'hotel',
    'hotel': 'hotel', 'gostinitsa': 'hotel', 'гостиниц': 'hotel',
    'коммерческая земля': 'land', 'земельный участок': 'land', 'земельный': 'land',
    'земля': 'land', 'земл': 'land', 'участок': 'land', 'land': 'land', 'zemlya': 'land',
    'автосервис': 'car_service', 'автомойка': 'car_service', 'автостоянка': 'car_service',
    'парковка': 'car_service', 'гараж': 'car_service', 'автосерв': 'car_service', 'garage': 'car_service',
    'готовый арендный бизнес': 'gab', 'готовый арендн': 'gab', 'арендн бизнес': 'gab',
    'габ': 'gab', 'gab': 'gab', 'gotovyy-biznes': 'gab',
    'другое': 'other', 'иное': 'other', 'прочее': 'other',
}

GAB_TITLE_SIGNALS = [
    'с арендатором', 'арендный бизнес', 'готовый арендный',
    'арендный поток', 'с действующим арендатором', 'доходность', 'окупаемост', 'инвестиционн',
]

DEAL_MAP = {
    'продам': 'sale', 'продажа': 'sale', 'продаётся': 'sale', 'продается': 'sale',
    'продаю': 'sale', 'купить': 'sale', 'sale': 'sale', 'sell': 'sale', 'prodazha': 'sale',
    'сдам': 'rent', 'аренда': 'rent', 'сдаётся': 'rent', 'сдается': 'rent',
    'снять': 'rent', 'сдаю': 'rent', 'rent': 'rent', 'lease': 'rent', 'arenda': 'rent', 'sdam': 'rent',
}

DISTRICT_NORM = {
    'р-н прикубанский': 'Прикубанский', 'р-н прикубанский округ': 'Прикубанский',
    'прикубанский': 'Прикубанский', 'р-н карасунский': 'Карасунский',
    'карасунский': 'Карасунский', 'р-н западный': 'Западный', 'западный': 'Западный',
    'р-н центральный': 'Центральный', 'центральный': 'Центральный',
}

STREET_DISTRICT_MAP = {
    'фестивальн': 'ФМР', 'фмр': 'ФМР', 'чистяковск': 'ФМР', 'героя пешков': 'ФМР',
    'московск': 'ФМР', 'дзержинск': 'ФМР', 'ставропольск': 'ФМР', 'гагарин': 'ФМР',
    'цмр': 'ЦМР', 'красн': 'ЦМР', 'октябрьск': 'ЦМР', 'ленин': 'ЦМР',
    'мира': 'ЦМР', 'пушкин': 'ЦМР', 'суворов': 'ЦМР', 'кубанонабережн': 'ЦМР',
    'юмр': 'ЮМР', 'юбилейн': 'ЮМР', 'симферопольск': 'ЮМР', 'уральск': 'ЮМР',
    'адмирала трибуца': 'ЮМР', 'восточно-кругликовск': 'ЮМР',
    'гидростроит': 'Гидрострой', 'новороссийск': 'Гидрострой', 'колосист': 'Гидрострой',
    'музыкальн': 'Музыкальный',
    'черёмушк': 'Прикубанский', 'черемушк': 'Прикубанский', 'прикубанск': 'Прикубанский',
    'домбайск': 'Прикубанский', 'ангарск': 'Прикубанский', 'индустриальн': 'Прикубанский',
    'карасунск': 'Карасунский', 'ростовское шоссе': 'Карасунский',
    'шоссе нефтяников': 'Карасунский', 'ярославск': 'Карасунский',
    'западн': 'Западный', 'тургенев': 'Западный',
    'новознаменск': 'Новознаменский',
}

LIMITS = {
    'min_price_sale': 100_000, 'max_price_sale': 5_000_000_000,
    'min_price_rent': 3_000,   'max_price_rent': 10_000_000,
    'min_area': 1, 'max_area': 200_000, 'fresh_days': 365,
    'lat_min': 44.0, 'lat_max': 45.7, 'lng_min': 38.5, 'lng_max': 39.5,
}

UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
UA_MAC     = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
UA_BOT     = 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)'
UA_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'
UA_POOL    = [UA_DESKTOP, UA_MAC, UA_FIREFOX]
MAX_HTML   = 800_000


def parse_numeric(v):
    if v is None: return 0.0
    if isinstance(v, (int, float)): return float(v)
    s = str(v).strip()
    s = re.sub(r'[^\d.,]', '', s)
    if not s: return 0.0
    dots = s.count('.'); commas = s.count(',')
    if dots > 1:   s = s.replace('.', '')
    elif commas > 1: s = s.replace(',', '')
    elif dots == 1 and commas == 1:
        if s.rfind('.') > s.rfind(','): s = s.replace(',', '')
        else: s = s.replace('.', '').replace(',', '.')
    else: s = s.replace(',', '.')
    try: return float(s)
    except: return 0.0

def parse_price(v):
    d = re.sub(r'[^\d]', '', str(v or ''))
    return int(d) if d else 0

def parse_area(v, title='', description=''):
    if v is not None:
        a = parse_numeric(v)
        if LIMITS['min_area'] <= a <= LIMITS['max_area']: return a
    for text in [title, description]:
        if not text: continue
        for pattern in [r'(\d+[\.,]?\d*)\s*м[²2²]', r'(\d+[\.,]?\d*)\s*кв\.?\s*м', r'(\d+[\.,]?\d*)\s*sq\.?\s*m']:
            m = re.search(pattern, str(text).lower())
            if m:
                a = parse_numeric(m.group(1))
                if LIMITS['min_area'] <= a <= LIMITS['max_area']: return a
    return 0.0

def parse_floor(text):
    m = re.search(r'(?:этаж|floor)[^\d]*([\d]+)\s*(?:из|/)\s*([\d]+)', text, re.I)
    if m: return int(m.group(1)), int(m.group(2))
    m = re.search(r'(?:этаж|floor)[^\d]*([\d]+)', text, re.I)
    if m: return int(m.group(1)), None
    return None, None

def parse_ceiling(text):
    m = re.search(r'(?:высота[^:]*потолк|потолк[^\d]*высота)[^\d]*([\d,\.]+)', text, re.I)
    if not m: m = re.search(r'([\d,\.]+)\s*м\s*(?:высота|потолк)', text, re.I)
    if m:
        v = parse_numeric(m.group(1))
        if 1.5 < v < 30: return v
    return 0.0

def parse_electricity(text):
    m = re.search(r'([\d,\.]+)\s*кВ[тТ]', text, re.I)
    if m:
        v = parse_numeric(m.group(1))
        if 1 < v < 10000: return v
    return 0.0

def ppm2(price, area):
    if price > 0 and area > 0: return round(price / area, 2)
    return 0.0

def map_category(raw, title='', url=''):
    t = (title or '').lower()
    if any(sig in t for sig in GAB_TITLE_SIGNALS): return 'gab'
    s = (raw or '').lower().strip()
    if s:
        for key, val in OBJ_TYPE_MAP.items():
            if key in s: return val
    u = (url or '').lower()
    if u:
        for key, val in OBJ_TYPE_MAP.items():
            if key in u: return val
    return 'other'

def map_deal(raw, url=''):
    combined = ((raw or '') + ' ' + (url or '')).lower()
    for key, val in DEAL_MAP.items():
        if key in combined: return val
    return 'sale'

def norm_district(raw, address=''):
    if not raw and not address: return ''
    if raw:
        s = raw.lower().strip()
        if s in DISTRICT_NORM: return DISTRICT_NORM[s]
        for kw, dist in STREET_DISTRICT_MAP.items():
            if kw.lower() in s: return dist
        if raw.strip(): return raw.strip()
    if address:
        a = address.lower()
        for kw, dist in STREET_DISTRICT_MAP.items():
            if kw.lower() in a: return dist
    return ''

def detect_utilities(text):
    found = []
    t = (text or '').lower()
    for keywords, label in [
        (['электр'], 'электричество'), (['водопровод', 'вода'], 'вода'),
        (['канализац'], 'канализация'), (['газ'], 'газ'),
        (['отоплен'], 'отопление'), (['вентиляц'], 'вентиляция'), (['интернет'], 'интернет'),
    ]:
        if any(kw in t for kw in keywords): found.append(label)
    return ', '.join(found)

def detect_condition(text):
    t = (text or '').lower()
    if any(w in t for w in ['дизайнерск', 'люкс']): return 'designer'
    if any(w in t for w in ['евроремонт', 'евро', 'отличн']): return 'euro'
    if any(w in t for w in ['хорош', 'аккуратн']): return 'good'
    if any(w in t for w in ['требует ремонта', 'нужен ремонт']): return 'needs_repair'
    if any(w in t for w in ['черновая', 'без отделки']): return 'rough'
    if any(w in t for w in ['удовлетворит', 'обычн']): return 'normal'
    return ''

def detect_parking(text):
    t = (text or '').lower()
    if any(w in t for w in ['подземн', 'паркинг']): return 'underground'
    if any(w in t for w in ['крытая', 'навес']): return 'covered'
    if any(w in t for w in ['открытая', 'стоянка']): return 'outdoor'
    return ''

def validate_record(rec):
    price = rec.get('price') or 0
    area  = rec.get('area') or 0
    deal  = rec.get('deal_type', 'sale')
    if not price: return False, 'нет цены'
    if deal == 'sale':
        if not (LIMITS['min_price_sale'] <= price <= LIMITS['max_price_sale']):
            return False, f'цена продажи вне диапазона ({price:,})'
    elif deal == 'rent':
        if not (LIMITS['min_price_rent'] <= price <= LIMITS['max_price_rent']):
            return False, f'цена аренды вне диапазона ({price:,})'
    if area and not (LIMITS['min_area'] <= area <= LIMITS['max_area']):
        return False, f'площадь вне диапазона ({area})'
    return True, ''

def valid_date(date_str):
    try:
        d = datetime.fromisoformat(str(date_str)[:10])
        return (datetime.now() - d).days <= LIMITS['fresh_days']
    except: return True

def valid_coords(lat, lng):
    if not lat or not lng: return False
    return (LIMITS['lat_min'] < lat < LIMITS['lat_max'] and
            LIMITS['lng_min'] < lng < LIMITS['lng_max'])

def dedup_key(source, ext_id, address, area, price):
    if ext_id: return f'{source}::{ext_id}'
    addr_norm = (address or '').lower().strip()
    bucket = round((area or 0) / 10) * 10
    return f'{source}::{addr_norm}::{bucket}::{price}'

def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def upsert_batch(conn, records):
    if not records: return 0, 0
    inserted = updated = 0
    cur = conn.cursor()
    for rec in records:
        ext_id = (str(rec.get('external_id') or '')[:200] or
                  f"dr_{rec.get('source','x')}_{(rec.get('address') or '')[:40]}_{int(rec.get('area') or 0)}")
        cur.execute(
            f"INSERT INTO {SCHEMA}.market_listings "
            f"(source,external_id,url,title,category,deal_type,price,price_per_m2,area,address,district,"
            f"floor,total_floors,description,condition,phone,lat,lng,scraped_at) "
            f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW()) "
            f"ON CONFLICT (source,external_id) DO UPDATE SET "
            f"price=EXCLUDED.price,price_per_m2=EXCLUDED.price_per_m2,area=EXCLUDED.area,"
            f"category=EXCLUDED.category,deal_type=EXCLUDED.deal_type,address=EXCLUDED.address,"
            f"district=EXCLUDED.district,title=EXCLUDED.title,condition=EXCLUDED.condition,"
            f"phone=EXCLUDED.phone,lat=EXCLUDED.lat,lng=EXCLUDED.lng,scraped_at=NOW()",
            (
                rec.get('source','manual')[:50], ext_id, (rec.get('url') or '')[:500] or None,
                (rec.get('title') or '')[:500] or None, rec.get('category','other'), rec.get('deal_type','sale'),
                rec.get('price'), rec.get('price_per_m2'), rec.get('area'),
                (rec.get('address') or '')[:500] or None, (rec.get('district') or '')[:200] or None,
                rec.get('floor'), rec.get('total_floors'),
                (rec.get('description') or '')[:1000] or None, (rec.get('condition') or '')[:100] or None,
                (rec.get('phone') or '')[:50] or None, rec.get('lat'), rec.get('lng'),
            )
        )
        if cur.rowcount == 1: inserted += 1
        else: updated += 1
    conn.commit(); cur.close()
    return inserted, updated

def job_update(conn, job_id, **kwargs):
    if not kwargs: return
    sets = ', '.join(f'{k}=%s' for k in kwargs)
    vals = list(kwargs.values()) + [job_id]
    cur = conn.cursor()
    cur.execute(f'UPDATE {SCHEMA}.import_jobs SET {sets}, updated_at=NOW() WHERE id=%s', vals)
    conn.commit(); cur.close()

def fetch(url, ua=UA_DESKTOP, referer='', extra_headers=None, timeout=30):
    headers = {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive', 'Cache-Control': 'no-cache',
    }
    if referer: headers['Referer'] = referer
    if extra_headers: headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read(MAX_HTML)
        if resp.headers.get('Content-Encoding', '') == 'gzip':
            try: raw = _gzip.decompress(raw)
            except: pass
        enc = resp.headers.get_content_charset() or 'utf-8'
        try: return raw.decode(enc, errors='replace')
        except: return raw.decode('utf-8', errors='replace')

def fetch_bytes(url, timeout=180):
    req = urllib.request.Request(url, headers={'User-Agent': UA_DESKTOP})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def random_ua(): return random.choice(UA_POOL)
def random_pause(min_s=1.0, max_s=3.0): time.sleep(random.uniform(min_s, max_s))

def strip_tags(html): return re.sub(r'<[^>]+>', ' ', html)
def collapse(s): return re.sub(r'\s+', ' ', s).strip()
def clean_title(raw, max_len=120): return collapse(strip_tags(raw or ''))[:max_len]
def clean_desc(raw, max_len=1000): return collapse(strip_tags(raw or ''))[:max_len]

def ok(body):
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(body, ensure_ascii=False, default=str)}

def err(msg, status=400):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps({'error': msg}, ensure_ascii=False)}

def cors_ok():
    return {'statusCode': 200, 'headers': CORS, 'body': ''}
