"""
Геолокация и адреса: подсказки DaData, исправление и нормализация районов.

action=suggest    GET  ?query=Красная&city=Краснодар
                  → [{value, full, lat, lon, district}]

action=fix        POST {action: 'fix', mode: 'preview'|'apply', ids?: [int,...]}
                  → {changed_count, not_found_count, changed: [...]}
                  Определяет район по справочнику улиц (street_district_map).

action=normalize  POST {action: 'normalize', mode: 'preview'|'apply'}
                  → {changed_count, already_ok_count, changed: [...]}
                  Нормализует значения district в listings к каноничным названиям
                  из таблицы districts (точное или нечёткое совпадение).

action=audit      POST {action: 'audit', mode: 'preview'|'apply', limit?: int}
                  → {mismatch_count, ok_count, no_geodata_count, items: [...]}
                  Обратное геокодирование через Яндекс Геокодер (lat/lng → адрес).
                  Сравнивает полученный район с сохранённым в listings.district.
                  mode=apply — исправляет расхождения в БД.
"""
import json
import os
import re
import urllib.request
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}


def _ok(body, status=200):
    return {'statusCode': status,
            'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(body, ensure_ascii=False, default=str)}


def _err(msg, status=400):
    return _ok({'error': msg}, status)


# ── Общая логика справочника ──────────────────────────────────────────────────

def _load_street_rules(cur) -> list:
    cur.execute(
        f"SELECT street_pattern, district, house_from, house_to "
        f"FROM {SCHEMA}.street_district_map ORDER BY id ASC"
    )
    return cur.fetchall()


def _find_district(street: str, house_num, rules: list) -> str | None:
    """
    Ищет микрорайон по улице и номеру дома.
    Приоритеты (от высшего к низшему):
      1. Точное совпадение улицы + номер дома в диапазоне
      2. Точное совпадение улицы (без диапазона)
      3. Частичное совпадение + номер дома в диапазоне
      4. Частичное совпадение (без диапазона) — берём с наидлиннейшим паттерном
    """
    street_lower = street.lower().strip()
    best = None          # лучшее совпадение без диапазона (паттерн, район)
    best_pat_len = -1    # длина паттерна для best

    for rule in rules:
        pat = rule['street_pattern'].lower().strip()
        # Точное совпадение улицы имеет наивысший приоритет
        exact = (pat == street_lower)
        partial = (pat in street_lower)
        if not exact and not partial:
            continue

        h_from = rule['house_from']
        h_to = rule['house_to']
        has_range = h_from is not None or h_to is not None

        if has_range and house_num is not None:
            in_range = (h_from is None or house_num >= h_from) and (h_to is None or house_num <= h_to)
            if in_range:
                # Точное совпадение улицы + диапазон — наивысший приоритет, выходим сразу
                if exact:
                    return rule['district']
                # Частичное + диапазон — запоминаем как кандидата
                if best_pat_len < len(pat):
                    best = rule['district']
                    best_pat_len = len(pat)
        elif not has_range:
            # Без диапазона: предпочитаем точное совпадение и более длинный паттерн
            score = (1000 if exact else 0) + len(pat)
            if score > best_pat_len:
                best = rule['district']
                best_pat_len = score

    return best


# ── action=suggest ────────────────────────────────────────────────────────────

def _handle_suggest(event: dict, cur) -> dict:
    params = event.get('queryStringParameters') or {}
    query = params.get('query', '').strip()
    city = params.get('city', 'Краснодар').strip()

    if not query:
        return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
                'body': json.dumps([], ensure_ascii=False)}

    api_key = os.environ.get('DADATA_API_KEY', '')
    secret_key = os.environ.get('DADATA_SECRET_KEY', '')

    payload = json.dumps({
        'query': f'{city}, {query}', 'count': 8,
        'locations': [{'city': city}], 'restrict_value': False,
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
        data=payload,
        headers={'Content-Type': 'application/json', 'Accept': 'application/json',
                 'Authorization': f'Token {api_key}', 'X-Secret': secret_key},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    rules = _load_street_rules(cur)
    suggestions = []
    for s in data.get('suggestions', []):
        value = s.get('value', '')
        d = s.get('data', {})
        street = d.get('street', '') or ''
        house_str = d.get('house', '') or ''
        m = re.match(r'(\d+)', house_str)
        house_num = int(m.group(1)) if m else None
        district = _find_district(street, house_num, rules) or ''

        short = value
        for prefix in ['Россия, ', 'Краснодарский край, ', f'г {city}, ', f'{city}, ']:
            while short.startswith(prefix):
                short = short[len(prefix):]

        suggestions.append({
            'value': short, 'full': value,
            'lat': float(d['geo_lat']) if d.get('geo_lat') else None,
            'lon': float(d['geo_lon']) if d.get('geo_lon') else None,
            'district': district,
        })

    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(suggestions, ensure_ascii=False)}


# ── action=fix ────────────────────────────────────────────────────────────────

def _parse_address(address: str) -> tuple:
    house_match = re.search(r',\s*(\d+)', address)
    house_num = int(house_match.group(1)) if house_match else None
    street = re.sub(r',?\s*\d+.*$', '', address).strip()
    street = re.sub(r'\s+(улица|проспект|шоссе|переулок|бульвар|аллея|проезд)$', '', street, flags=re.IGNORECASE).strip()
    return street, house_num


def _handle_fix(body: dict, cur, conn) -> dict:
    mode = body.get('mode') or body.get('action_mode', 'preview')
    filter_ids = body.get('ids')

    rules = _load_street_rules(cur)

    if filter_ids:
        ids_str = ','.join(str(i) for i in filter_ids)
        cur.execute(
            f"SELECT id, address, district FROM {SCHEMA}.listings "
            f"WHERE status = 'active' AND address IS NOT NULL AND address != '' AND id IN ({ids_str}) ORDER BY id"
        )
    else:
        cur.execute(
            f"SELECT id, address, district FROM {SCHEMA}.listings "
            f"WHERE status = 'active' AND address IS NOT NULL AND address != '' ORDER BY id"
        )

    results, not_found = [], []
    for row in cur.fetchall():
        lid, address, district_old = row['id'], row['address'], row['district']
        street, house_num = _parse_address(address)
        district_new = _find_district(street, house_num, rules)

        entry = {'id': lid, 'address': address, 'street': street,
                 'district_old': district_old, 'district_new': district_new,
                 'changed': district_new is not None and district_new != district_old}

        if mode == 'apply' and district_new and district_new != district_old:
            dn = district_new.replace("'", "''")
            cur.execute(f"UPDATE {SCHEMA}.listings SET district = '{dn}' WHERE id = {lid}")

        (results if district_new is not None else not_found).append(entry)

    if mode == 'apply':
        conn.commit()

    changed = [r for r in results if r['changed']]
    return _ok({
        'mode': mode,
        'total': len(results) + len(not_found),
        'changed_count': len(changed),
        'unchanged_count': len(results) - len(changed),
        'not_found_count': len(not_found),
        'changed': changed,
        'not_found': not_found,
    })


# ── action=normalize ─────────────────────────────────────────────────────────

def _handle_normalize(body: dict, cur, conn) -> dict:
    """
    Нормализует district в listings к каноничным значениям из таблицы districts.
    Алгоритм для каждого объекта:
      1. Точное совпадение → уже ок
      2. ILIKE совпадение (подстрока в обе стороны) → берём каноничное
      3. Не нашли → оставляем как есть, пишем в not_matched
    """
    mode = body.get('mode', 'preview')

    # Загружаем все каноничные названия районов
    cur.execute(
        f"SELECT name FROM {SCHEMA}.districts WHERE is_active = TRUE ORDER BY name ASC"
    )
    canonical = [r['name'] for r in cur.fetchall()]
    canonical_lower = {n.lower(): n for n in canonical}

    # Загружаем все объекты с непустым district
    cur.execute(
        f"SELECT id, district FROM {SCHEMA}.listings "
        f"WHERE district IS NOT NULL AND district != '' ORDER BY id ASC"
    )
    rows = cur.fetchall()

    changed, already_ok, not_matched = [], [], []

    for row in rows:
        lid = row['id']
        current = (row['district'] or '').strip()
        if not current:
            continue

        cur_lower = current.lower()

        # 1. Точное совпадение
        if cur_lower in canonical_lower:
            canon = canonical_lower[cur_lower]
            if current == canon:
                already_ok.append({'id': lid, 'district': current})
            else:
                # Совпадает регистр-нечувствительно, но разный регистр — исправляем
                changed.append({'id': lid, 'district_old': current, 'district_new': canon})
            continue

        # 2. Нечёткое: ищем каноничное имя которое содержит current или наоборот
        best = None
        best_score = -1
        for name in canonical:
            name_l = name.lower()
            if cur_lower in name_l or name_l in cur_lower:
                # Предпочитаем более длинное совпадение (специфичнее)
                score = len(name_l) + (1000 if cur_lower == name_l else 0)
                if score > best_score:
                    best = name
                    best_score = score

        if best:
            if best != current:
                changed.append({'id': lid, 'district_old': current, 'district_new': best})
            else:
                already_ok.append({'id': lid, 'district': current})
        else:
            not_matched.append({'id': lid, 'district': current})

    # Применяем если mode=apply
    if mode == 'apply':
        for item in changed:
            dn = item['district_new'].replace("'", "''")
            cur.execute(
                f"UPDATE {SCHEMA}.listings SET district = '{dn}' WHERE id = {item['id']}"
            )
        conn.commit()
        print(f'[geo normalize] применено {len(changed)} исправлений')

    return _ok({
        'mode': mode,
        'total': len(rows),
        'changed_count': len(changed),
        'already_ok_count': len(already_ok),
        'not_matched_count': len(not_matched),
        'changed': changed,
        'not_matched': not_matched,
    })


# ── action=audit ─────────────────────────────────────────────────────────────

def _geocode_twogis(address: str, city: str, api_key: str) -> dict:
    """
    2GIS Geocoder API: геокодирование адреса → координаты + район.
    2GIS хорошо знает микрорайоны Краснодара (district в ответе).
    Docs: https://docs.2gis.com/ru/api/search/geocoder/overview
    """
    import urllib.parse
    q = urllib.parse.quote(f'{city}, {address}')
    url = (
        f'https://catalog.api.2gis.com/3.0/items/geocode'
        f'?q={q}&fields=items.point,items.address,items.address_name'
        f'&key={api_key}'
    )
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    items = (data.get('result') or {}).get('items') or []
    if not items:
        return {}

    item = items[0]
    point = item.get('point') or {}
    addr = item.get('address') or {}
    components = addr.get('components') or []

    result = {
        'lat': point.get('lat'),
        'lon': point.get('lon'),
        'district': '',
        'city': '',
        'street': '',
        'full': item.get('full_name', '') or item.get('address_name', ''),
    }

    # 2GIS компоненты: тип district содержит микрорайон
    for comp in components:
        t = comp.get('type', '')
        name = comp.get('street_name') or comp.get('name') or ''
        if t == 'district':
            result['district'] = name
        elif t == 'city':
            result['city'] = name
        elif t == 'street':
            result['street'] = name

    return result


def _geocode_dadata_clean(address: str, city: str, api_key: str, secret_key: str) -> dict:
    """
    DaData API /clean/address (стандартизация): точнее чем suggest,
    возвращает city_district для городских адресов.
    """
    payload = json.dumps([f'{city}, {address}']).encode('utf-8')
    req = urllib.request.Request(
        'https://cleaner.dadata.ru/api/v1/clean/address',
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Token {api_key}',
            'X-Secret': secret_key,
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    if not data or not isinstance(data, list):
        return {}

    d = data[0]
    return {
        'geo_lat': d.get('geo_lat'),
        'geo_lon': d.get('geo_lon'),
        'city_district': d.get('city_district_with_type') or d.get('city_district') or '',
        'settlement': d.get('settlement_with_type') or d.get('settlement') or '',
        'street': d.get('street_with_type') or d.get('street') or '',
        'house': d.get('house') or '',
        'full': d.get('result', ''),
        'qc_geo': d.get('qc_geo'),  # 0=точный, 1=улица, 2=город, 4=нет
    }


def _match_district(yandex_district: str, our_district: str, canonical: list) -> str | None:
    """
    Пытается сопоставить район от Яндекса с каноничным названием из справочника.
    Возвращает каноничное название если нашли совпадение, иначе None.
    """
    if not yandex_district:
        return None
    ya = yandex_district.lower().strip()
    # Убираем типовые суффиксы которые Яндекс добавляет
    for suffix in [' микрорайон', ' мкр', ' район', ' квартал', ' посёлок', ' п.', ' пос.']:
        if ya.endswith(suffix):
            ya = ya[:-len(suffix)].strip()

    best = None
    best_score = -1
    for name in canonical:
        n = name.lower()
        # Ищем вхождение в обе стороны
        if ya in n or n in ya:
            score = len(n) + (1000 if ya == n else 0)
            if score > best_score:
                best = name
                best_score = score
    return best


def _handle_audit(body: dict, cur, conn) -> dict:
    """
    Аудит районов через 2GIS + DaData clean.
    Алгоритм для каждого объекта:
      1. Геокодируем адрес через 2GIS → district компонент
      2. Если 2GIS не дал район — пробуем DaData /clean/address
      3. Сопоставляем с каноничным справочником districts
      4. Сравниваем с district в БД
    """
    mode = body.get('mode', 'preview')
    limit = min(int(body.get('limit') or 200), 500)

    twogis_key = os.environ.get('TWOGIS_API_KEY', '')
    dadata_key = os.environ.get('DADATA_API_KEY', '')
    dadata_secret = os.environ.get('DADATA_SECRET_KEY', '')

    if not twogis_key and not dadata_key:
        return _err('Нужен TWOGIS_API_KEY или DADATA_API_KEY', 500)

    # Загружаем всё заранее — один раз, вне цикла
    cur.execute(
        f"SELECT name FROM {SCHEMA}.districts WHERE is_active = TRUE ORDER BY name ASC"
    )
    canonical = [r['name'] for r in cur.fetchall()]

    # Справочник улиц — загружаем один раз
    street_rules = _load_street_rules(cur)

    # Все активные видимые объекты
    cur.execute(f"""
        SELECT id, title, address, district,
               COALESCE(city, 'Краснодар') as city
        FROM {SCHEMA}.listings
        WHERE status = 'active' AND is_visible = TRUE
          AND address IS NOT NULL AND address != ''
        ORDER BY id ASC
        LIMIT {limit}
    """)
    rows = cur.fetchall()

    mismatch, ok_items, no_geodata, errors = [], [], [], []

    for row in rows:
        lid = row['id']
        our = (row['district'] or '').strip()
        address = row['address']
        city = row['city'] or 'Краснодар'

        geo_raw = {}
        source = ''

        # 1. Пробуем 2GIS
        if twogis_key:
            try:
                geo_raw = _geocode_twogis(address, city, twogis_key)
                source = '2gis'
            except Exception as e:
                print(f'[geo audit] id={lid} 2GIS error: {e}')

        # 2. Fallback: DaData /clean/address
        if not geo_raw.get('district') and dadata_key:
            try:
                dd = _geocode_dadata_clean(address, city, dadata_key, dadata_secret)
                if dd.get('city_district') or dd.get('settlement'):
                    geo_raw = {
                        'district': dd.get('settlement') or dd.get('city_district') or '',
                        'city_district': dd.get('city_district', ''),
                        'settlement': dd.get('settlement', ''),
                    }
                    source = 'dadata'
            except Exception as e:
                print(f'[geo audit] id={lid} DaData error: {e}')

        raw_district = geo_raw.get('district', '')
        matched = _match_district(raw_district, our, canonical)

        # 3. Fallback: наш справочник street_district_map
        if not matched:
            street, house_num = _parse_address(address)
            street_match = _find_district(street, house_num, street_rules)
            if street_match:
                matched = street_match
                source = 'street_map'

        item = {
            'id': lid,
            'title': row['title'],
            'address': address,
            'district_db': our,
            'geocoder_district_raw': raw_district,
            'geocoder_matched': matched,
            'source': source,
        }

        if not matched:
            no_geodata.append(item)
        elif matched == our:
            ok_items.append(item)
        else:
            item['district_suggested'] = matched
            mismatch.append(item)
            print(
                f'[geo audit] id={lid} РАСХОЖДЕНИЕ: '
                f'БД="{our}" геокодер="{matched}" '
                f'(raw="{raw_district}" source={source})'
            )

    # Применяем только уверенные исправления (не из street_map — он менее надёжен)
    confirmed = [x for x in mismatch if x.get('source') != 'street_map']

    if mode == 'apply' and confirmed:
        for item in confirmed:
            dn = item['district_suggested'].replace("'", "''")
            cur.execute(
                f"UPDATE {SCHEMA}.listings SET district = '{dn}', updated_at = NOW() "
                f"WHERE id = {item['id']}"
            )
        conn.commit()
        print(f'[geo audit] применено {len(confirmed)} исправлений')

    return _ok({
        'mode': mode,
        'total_checked': len(rows),
        'ok_count': len(ok_items),
        'mismatch_count': len(mismatch),
        'confirmed_mismatch_count': len(confirmed),
        'no_geodata_count': len(no_geodata),
        'error_count': len(errors),
        'mismatch': mismatch,
        'no_geodata_sample': no_geodata[:10],
        'errors': errors,
    })


# ── action=parse_osm ─────────────────────────────────────────────────────────
# Потоковый парсер OSM PBF: читает первые 60 МБ Range-запросом,
# извлекает улицы и районы, сравнивает с нашей БД.

_HW = {'residential','primary','secondary','tertiary','unclassified',
       'service','living_street','trunk','motorway','primary_link','secondary_link'}
_PL = {'suburb','neighbourhood','quarter','village','hamlet','town'}

# Bbox Краснодара: lat 44.95–45.20, lon 38.85–39.25
_KRD_LAT_MIN, _KRD_LAT_MAX = 44.95, 45.20
_KRD_LON_MIN, _KRD_LON_MAX = 38.85, 39.25

# Ключевые слова — если в теге name/is_in/addr:city есть одно из них,
# объект относится к Краснодару
_KRD_KEYWORDS = {'краснодар', 'krasnodar'}

def _is_krasnodar_name(tags: dict) -> bool:
    """Проверяем теги is_in, addr:city, addr:district на принадлежность Краснодару."""
    for key in ('is_in', 'addr:city', 'addr:district', 'addr:place'):
        v = (tags.get(key) or '').lower()
        if any(k in v for k in _KRD_KEYWORDS):
            return True
    return False


def _vi(d, p):
    r = s = 0
    while p < len(d):
        b = d[p]; p += 1; r |= (b & 0x7F) << s
        if not (b & 0x80): return r, p
        s += 7
    return r, p


def _pf(data):
    f = {}; p = 0; n = len(data)
    while p < n:
        try:
            tag, p = _vi(data, p); fn = tag >> 3; wt = tag & 7
            if wt == 0:
                v, p = _vi(data, p); f.setdefault(fn, []).append(v)
            elif wt == 1:
                import struct as _s; v = _s.unpack_from('<Q', data, p)[0]; p += 8; f.setdefault(fn, []).append(v)
            elif wt == 2:
                l, p = _vi(data, p); v = data[p:p+l]; p += l; f.setdefault(fn, []).append(v)
            elif wt == 5:
                import struct as _s; v = _s.unpack_from('<I', data, p)[0]; p += 4; f.setdefault(fn, []).append(v)
            else: break
        except Exception: break
    return f


def _uvi(raw):
    if not raw: return []
    if isinstance(raw, int): return [raw]
    r = []; p = 0
    while p < len(raw): v, p = _vi(raw, p); r.append(v)
    return r


def _st(raw):
    st = []; p = 0; n = len(raw)
    while p < n:
        try:
            tag, p = _vi(raw, p); fn = tag >> 3; wt = tag & 7
            if wt == 2:
                l, p = _vi(raw, p); v = raw[p:p+l]; p += l
                if fn == 1: st.append(v.decode('utf-8', errors='replace'))
            elif wt == 0: _, p = _vi(raw, p)
            elif wt == 1: p += 8
            elif wt == 5: p += 4
            else: break
        except Exception: break
    return st


def _tg(kr, vr, st):
    k = _uvi(kr); v = _uvi(vr)
    return {st[i] if i < len(st) else '': st[j] if j < len(st) else '' for i, j in zip(k, v) if i < len(st)}


def _blk(raw, streets, places, street_suburb, MS=15000, MP=2000):
    """
    Парсит один PrimitiveBlock.
    streets      — set: названия улиц Краснодара
    places       — dict: {name: type} районы/посёлки Краснодара
    street_suburb — dict: {street_name: suburb} маппинг улица→микрорайон из тегов addr:street+addr:suburb
    """
    pb = _pf(raw)
    s = _st(pb.get(1, [b''])[0]) if pb.get(1) else []
    if not s: return

    for pg in pb.get(2, []):
        pgf = _pf(pg)

        # Ways — улицы
        for wd in pgf.get(3, []):
            if len(streets) >= MS: break
            wf = _pf(wd)
            t = _tg(wf.get(2,[b''])[0] if wf.get(2) else b'',
                    wf.get(3,[b''])[0] if wf.get(3) else b'', s)
            nm = t.get('name','')
            if t.get('highway') in _HW and nm:
                # Берём только если есть признак Краснодара или пока нет данных города
                city = (t.get('addr:city','') or t.get('is_in:city','')).lower()
                if not city or 'краснодар' in city:
                    streets.add(nm)
                    # Если есть suburb — сохраняем маппинг
                    sub = t.get('addr:suburb','') or t.get('addr:neighbourhood','')
                    if sub and nm not in street_suburb:
                        street_suburb[nm] = sub

        # Nodes — районы/посёлки
        for nd in pgf.get(1, []):
            if len(places) >= MP: break
            nf = _pf(nd)
            t = _tg(nf.get(2,[b''])[0] if nf.get(2) else b'',
                    nf.get(3,[b''])[0] if nf.get(3) else b'', s)
            pl = t.get('place',''); nm = t.get('name','')
            if pl in _PL and nm:
                isin = (t.get('is_in','') or t.get('is_in:city','')).lower()
                # Только Краснодар: is_in содержит Краснодар ИЛИ это suburb/neighbourhood (они городские)
                if pl in ('suburb','neighbourhood','quarter') or 'краснодар' in isin:
                    places[nm] = pl

        # DenseNodes — узлы с тегами (адреса зданий и т.п.)
        for dd in pgf.get(2, []):
            df = _pf(dd); kv = _uvi(df.get(10,[b''])[0] if df.get(10) else b'')
            cur = {}; i = 0
            while i < len(kv):
                k = kv[i]
                if k == 0:
                    pl = cur.get('place',''); nm = cur.get('name','')
                    if pl in _PL and nm and len(places) < MP:
                        isin = (cur.get('is_in','') or cur.get('is_in:city','')).lower()
                        if pl in ('suburb','neighbourhood','quarter') or 'краснодар' in isin:
                            places[nm] = pl
                    # Маппинг addr:street → addr:suburb из зданий
                    st_name = cur.get('addr:street','')
                    sub = cur.get('addr:suburb','') or cur.get('addr:neighbourhood','')
                    if st_name and sub and st_name not in street_suburb:
                        street_suburb[st_name] = sub
                    cur = {}
                elif i + 1 < len(kv):
                    ks = s[k] if k < len(s) else ''
                    vs = s[kv[i+1]] if kv[i+1] < len(s) else ''
                    if ks: cur[ks] = vs; i += 1
                i += 1

        # Relations — границы микрорайонов
        for rd in pgf.get(4, []):
            if len(places) >= MP: break
            rf = _pf(rd)
            t = _tg(rf.get(2,[b''])[0] if rf.get(2) else b'',
                    rf.get(3,[b''])[0] if rf.get(3) else b'', s)
            nm = t.get('name',''); pl = t.get('place','')
            bnd = t.get('boundary',''); lvl = t.get('admin_level','')
            if nm and (pl in _PL or (bnd == 'administrative' and lvl in ('8','9','10'))):
                isin = (t.get('is_in','') or '').lower()
                if pl in ('suburb','neighbourhood','quarter') or 'краснодар' in isin or not isin:
                    places[nm] = pl or f"adm{lvl}"


def _parse_pbf(data):
    import struct as _s, zlib as _z
    streets = set(); places = {}; street_suburb = {}; p = 0; blks = 0
    while p < len(data):
        if p + 4 > len(data): break
        hl = _s.unpack('>I', data[p:p+4])[0]; p += 4
        if hl > 65536 or p + hl > len(data): break
        hf = _pf(data[p:p+hl]); p += hl
        bt = hf.get(1,[b''])[0]
        if isinstance(bt, bytes): bt = bt.decode('utf-8', errors='replace')
        bs = hf.get(3,[0])[0]
        if p + bs > len(data): break
        bd = data[p:p+bs]; p += bs
        if bt != 'OSMData': continue
        bf = _pf(bd)
        if bf.get(3):
            try: raw = _z.decompress(bf[3][0])
            except Exception: continue
        elif bf.get(1): raw = bf[1][0]
        else: continue
        _blk(raw, streets, places, street_suburb)
        blks += 1
    print(f'[geo parse_osm] блоков={blks} улиц={len(streets)} мест={len(places)} маппингов={len(street_suburb)}')
    return streets, places, street_suburb


def _norm_st(s):
    for sf in [' улица',' проспект',' переулок',' бульвар',' шоссе',
               ' проезд',' аллея',' набережная',' тупик',' площадь',' линия']:
        if s.lower().endswith(sf): return s[:len(s)-len(sf)].strip()
    return s.strip()


def _handle_parse_osm(body: dict, cur) -> dict:
    """
    Скачивает PBF целиком потоково через urllib, накапливает данные в памяти
    построчно — не читает весь файл сразу, парсит блоки на лету.
    """
    url = body.get('url', '').strip()
    if not url: return _err('url обязателен', 400)

    import struct as _s, zlib as _z

    streets = set(); places = {}; street_suburb = {}
    blks = 0; total_bytes = 0
    buf = bytearray()

    import struct as _s, zlib as _z
    print(f'[geo parse_osm] потоковое чтение {url}')
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=55) as r:
            CHUNK = 256 * 1024
            while True:
                chunk = r.read(CHUNK)
                if not chunk: break
                buf.extend(chunk)
                total_bytes += len(chunk)

                # Извлекаем полные PBF-блоки из буфера
                pos = 0
                while pos < len(buf):
                    if pos + 4 > len(buf): break
                    try: hl = _s.unpack('>I', buf[pos:pos+4])[0]
                    except Exception: break
                    if hl > 65536 or pos + 4 + hl > len(buf): break
                    hf = _pf(bytes(buf[pos+4:pos+4+hl]))
                    bt = hf.get(1,[b''])[0]
                    if isinstance(bt, bytes): bt = bt.decode('utf-8', errors='replace')
                    bs = hf.get(3,[0])[0]
                    blob_start = pos + 4 + hl
                    if blob_start + bs > len(buf): break
                    bd = bytes(buf[blob_start:blob_start+bs])
                    pos = blob_start + bs
                    if bt == 'OSMData':
                        bf = _pf(bd)
                        if bf.get(3):
                            try: raw = _z.decompress(bf[3][0])
                            except Exception: continue
                        elif bf.get(1): raw = bf[1][0]
                        else: continue
                        _blk(raw, streets, places, street_suburb)
                        blks += 1
                del buf[:pos]

                if len(streets) >= 15000 and len(places) >= 500:
                    print('[geo parse_osm] лимит, прерываем'); break

        print(f'[geo parse_osm] {total_bytes//1024//1024} МБ, блоков={blks}, улиц={len(streets)}, мест={len(places)}, маппингов={len(street_suburb)}')
    except Exception as e:
        return _err(f'Скачивание/парсинг: {e}', 502)

    cur.execute(f"SELECT DISTINCT street_pattern FROM {SCHEMA}.street_district_map ORDER BY street_pattern")
    our_st = {r['street_pattern'] for r in cur.fetchall()}
    cur.execute(f"SELECT name FROM {SCHEMA}.districts WHERE is_active = TRUE ORDER BY name")
    our_di = {r['name'] for r in cur.fetchall()}

    our_norm = {_norm_st(s).lower(): s for s in our_st}
    missing_st = sorted(
        [{'osm': s, 'base': _norm_st(s)} for s in streets
         if _norm_st(s).lower() not in our_norm and len(_norm_st(s)) > 3],
        key=lambda x: x['base']
    )

    our_dl = {d.lower(): d for d in our_di}
    matched_pl, missing_pl = [], []
    for nm, pt in sorted(places.items()):
        nl = nm.lower()
        if nl in our_dl:
            matched_pl.append({'osm': nm, 'db': our_dl[nl], 'type': pt})
        else:
            fz = next((our_dl[k] for k in our_dl if nl in k or k in nl), None)
            if fz: matched_pl.append({'osm': nm, 'db': fz, 'type': pt, 'fuzzy': True})
            else:   missing_pl.append({'name': nm, 'type': pt})

    # street_suburb: улица → микрорайон из OSM-тегов addr:suburb
    # Оставляем только те которые есть в нашей БД районов
    suburb_mapped = {st: sub for st, sub in street_suburb.items()
                     if sub.lower() in our_dl or any(sub.lower() in k or k in sub.lower() for k in our_dl)}

    return _ok({
        'total_mb': round(total_bytes/1024/1024, 1),
        'blocks_parsed': blks,
        'osm_streets': len(streets),
        'osm_places': len(places),
        'osm_street_suburb_mappings': len(street_suburb),
        'db_streets': len(our_st),
        'db_districts': len(our_di),
        'missing_streets_count': len(missing_st),
        'missing_streets': missing_st[:300],
        'places_matched': matched_pl,
        'places_missing': missing_pl,
        'all_osm_places': sorted(places.keys()),
        'street_suburb_sample': dict(list(suburb_mapped.items())[:100]),
    })


# ── action=overpass_streets ───────────────────────────────────────────────────
# Получает улицы Краснодара через Overpass API (без PBF-файла).
# Сравнивает с нашим street_district_map, возвращает недостающие.

def _norm_street(name: str) -> str:
    """Убирает тип улицы для сравнения."""
    import re as _re
    name = name.strip()
    for suf in ['улица', 'проспект', 'переулок', 'бульвар', 'шоссе', 'проезд',
                'аллея', 'набережная', 'тупик', 'площадь', 'линия', 'микрорайон',
                'квартал', 'переулок', 'дорога', 'тракт']:
        name = _re.sub(rf'\s+{suf}$', '', name, flags=_re.IGNORECASE).strip()
        name = _re.sub(rf'^{suf}\s+', '', name, flags=_re.IGNORECASE).strip()
    return name


def _handle_overpass(body: dict, cur) -> dict:
    """
    action=overpass_streets — загружает улицы Краснодара через Overpass API,
    сравнивает с street_district_map, возвращает список недостающих.
    offset=N — пропустить первые N недостающих улиц (для постраничной загрузки)
    limit=N  — сколько вернуть (по умолчанию 20)

    Стратегия надёжности:
    - Несколько зеркал Overpass (fallback при 504/503)
    - Упрощённый запрос: только основные типы дорог
    - Таймаут 25 сек (влезает в лимит функции 30 сек)
    """
    import urllib.request as _ur, urllib.error as _ue, json as _j, time as _t

    limit_out = int(body.get('limit', 20))
    offset = int(body.get('offset', 0))

    # Зеркала Overpass API — пробуем по очереди
    OVERPASS_MIRRORS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ]

    # Упрощённый запрос — только основные типы, без service/pedestrian/unclassified
    # (их тысячи, они дают 504) — добавим отдельным запросом если нужно
    overpass_query = (
        '[out:json][timeout:25];'
        'way["highway"~"^(residential|primary|secondary|tertiary|living_street|trunk)$"]'
        '["name"](44.95,38.85,45.20,39.25);'
        'out tags;'
    )

    data = None
    last_err = None
    for mirror in OVERPASS_MIRRORS:
        print(f'[geo overpass] запрос к {mirror}...')
        req = _ur.Request(
            mirror,
            data=overpass_query.encode('utf-8'),
            headers={
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'KrasnodarRealEstate/1.0',
            },
            method='POST',
        )
        try:
            with _ur.urlopen(req, timeout=27) as resp:
                data = _j.loads(resp.read().decode('utf-8'))
            print(f'[geo overpass] успех от {mirror}')
            break
        except _ue.HTTPError as e:
            last_err = f'HTTP Error {e.code} от {mirror}'
            print(f'[geo overpass] {last_err}')
            if e.code in (429, 504, 503, 502):
                _t.sleep(1)  # небольшая пауза перед следующим зеркалом
            continue
        except Exception as e:
            last_err = str(e)
            print(f'[geo overpass] ошибка от {mirror}: {e}')
            continue

    if data is None:
        return _err(f'Все зеркала Overpass недоступны. Последняя ошибка: {last_err}', 502)

    osm_streets = set()
    for el in data.get('elements', []):
        nm = (el.get('tags') or {}).get('name', '').strip()
        if nm and len(nm) > 2:
            osm_streets.add(nm)

    print(f'[geo overpass] получено улиц из OSM: {len(osm_streets)}')

    cur.execute(f"SELECT DISTINCT street_pattern FROM {SCHEMA}.street_district_map")
    existing = {r['street_pattern'].lower().strip() for r in cur.fetchall()}

    missing = []
    for nm in sorted(osm_streets):
        base = _norm_street(nm)
        if nm.lower() not in existing and base.lower() not in existing:
            missing.append({'street': nm, 'base': base})

    print(f'[geo overpass] недостающих: {len(missing)}')

    return _ok({
        'osm_total': len(osm_streets),
        'in_map': len(osm_streets) - len(missing),
        'missing_count': len(missing),
        'offset': offset,
        'limit': limit_out,
        'missing': missing[offset:offset + limit_out],
        'has_more': (offset + limit_out) < len(missing),
    })


def _dadata_street_full(street_name: str, api_key: str, secret_key: str):
    """
    Геокодирует улицу Краснодара через DaData.
    Возвращает dict с полями: street_clean, city_district, lat, lon — или None.
    Использует city_district из ответа DaData напрямую (не зависит от нашего справочника).
    """
    import urllib.request as _ur, json as _j
    for house in ('1', '10', '5', '20'):
        payload = _j.dumps({
            'query': f'Краснодар, {street_name}, {house}',
            'count': 1,
            'locations': [{'city': 'Краснодар'}],
            'restrict_value': False,
        }).encode('utf-8')
        req = _ur.Request(
            'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
            data=payload,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': f'Token {api_key}',
                'X-Secret': secret_key,
            },
            method='POST',
        )
        try:
            with _ur.urlopen(req, timeout=8) as resp:
                data = _j.loads(resp.read().decode('utf-8'))
            suggs = data.get('suggestions', [])
            if not suggs:
                continue
            d = suggs[0].get('data', {})
            street_clean = d.get('street') or ''
            if not street_clean:
                continue
            # city_district_with_type: "Прикубанский округ" / "Центральный округ" и т.д.
            city_district = (
                d.get('city_district') or
                d.get('city_district_with_type') or
                d.get('area') or ''
            ).strip()
            lat = d.get('geo_lat')
            lon = d.get('geo_lon')
            if street_clean:
                return {
                    'street_clean': street_clean,
                    'city_district': city_district,
                    'lat': lat, 'lon': lon,
                }
        except Exception as _e:
            print(f'[dadata] ошибка "{street_name}": {_e}')
    return None


def _match_district_fuzzy(raw: str, known_districts: list) -> str:
    """
    Нечёткое сопоставление raw-строки района из DaData с известными районами из districts.
    1. Точное совпадение (без учёта регистра)
    2. raw входит в known или known входит в raw
    3. Первое слово совпадает
    Возвращает canonical name или ''.
    """
    if not raw:
        return ''
    raw_l = raw.lower().strip()
    # Точное совпадение
    for d in known_districts:
        if d.lower() == raw_l:
            return d
    # raw входит в название района или наоборот
    for d in known_districts:
        dl = d.lower()
        if raw_l in dl or dl in raw_l:
            return d
    # Первое слово raw совпадает с первым словом района
    raw_word = raw_l.split()[0] if raw_l.split() else ''
    if len(raw_word) >= 4:
        for d in known_districts:
            if d.lower().split()[0] == raw_word:
                return d
    return ''


def _handle_ai_map(body: dict, cur, conn) -> dict:
    """
    action=ai_map_streets — принимает список улиц [{street, base}, ...],
    геокодирует каждую через DaData и сохраняет в street_district_map.
    Определяет район из city_district DaData, сопоставляет с таблицей districts.
    streets=[...] — список объектов {street, base} (макс 20)
    """
    streets = body.get('streets', [])
    if not streets:
        return _err('streets обязателен')
    if len(streets) > 20:
        streets = streets[:20]

    dadata_key = os.environ.get('DADATA_API_KEY', '')
    dadata_secret = os.environ.get('DADATA_SECRET_KEY', '')
    if not dadata_key:
        return _err('Нет DADATA_API_KEY')

    # Загружаем список известных районов из таблицы districts
    cur.execute(f"SELECT name FROM {SCHEMA}.districts WHERE is_active = TRUE")
    known_districts = [r['name'] for r in cur.fetchall()]

    # Загружаем существующие паттерны чтобы не дублировать
    cur.execute(f"SELECT DISTINCT street_pattern FROM {SCHEMA}.street_district_map")
    existing = {r['street_pattern'].lower().strip() for r in cur.fetchall()}

    added = []; skipped = []

    for s in streets:
        street_name = s.get('street', '')
        if not street_name:
            continue

        # Пропускаем если уже есть
        pattern = _norm_street(street_name)
        if pattern.lower() in existing or street_name.lower() in existing:
            skipped.append(f'{street_name} (уже есть)')
            continue

        # DaData геокодирует улицу
        result = _dadata_street_full(street_name, dadata_key, dadata_secret)
        if not result:
            skipped.append(street_name)
            continue

        # DaData возвращает несколько полей района — берём все и пробуем сопоставить
        raw_district = result['city_district'] or ''
        district = _match_district_fuzzy(raw_district, known_districts)

        if not district:
            print(f'[geo dadata] "{street_name}" → raw_district="{raw_district}" — не сопоставлен')
            skipped.append(f'{street_name} (район не определён: {raw_district!r})')
            continue

        try:
            cur.execute(
                f"INSERT INTO {SCHEMA}.street_district_map (street_pattern, district, note) "
                f"VALUES (%s, %s, 'dadata') ON CONFLICT DO NOTHING",
                (pattern, district)
            )
            added.append({'street': street_name, 'pattern': pattern, 'district': district})
            existing.add(pattern.lower())
            print(f'[geo dadata] ✓ "{street_name}" → "{district}" (raw: {raw_district!r})')
        except Exception as ex:
            skipped.append(f'{street_name}: {ex}')

    conn.commit()
    print(f'[geo dadata] добавлено={len(added)}, пропущено={len(skipped)}')

    return _ok({
        'added_count': len(added),
        'skipped_count': len(skipped),
        'added': added,
        'skipped': skipped[:20],
    })


# ── action=geo_okrug ─────────────────────────────────────────────────────────

# Список геокодеров — порядок = приоритет fallback
GEO_PROVIDERS = ['yandex', 'maps_co', 'nominatim']

class GeoLimitExceeded(Exception):
    pass

def _geocode_yandex(street: str, api_key: str) -> dict:
    """Яндекс Геокодер HTTP API — бесплатный с ограничениями.
    Яндекс возвращает district-компоненты типа:
      'Прикубанский внутригородской округ', 'Центральный округ' и т.д.
    Все district-компоненты складываем в city_district и suburb для совместимости с _match_okrug.
    """
    import urllib.parse as _up
    q = _up.quote(f'Краснодар, {street}')
    url = (
        f'https://geocode-maps.yandex.ru/1.x/'
        f'?apikey={api_key}&geocode={q}&format=json&lang=ru_RU&results=1'
        f'&ll=38.9766,45.0355&spn=0.5,0.5&rspn=1'
    )
    req = urllib.request.Request(url, headers={'User-Agent': 'KrasnodarRealEstate/1.0'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        status = resp.status
        raw = resp.read().decode('utf-8')
    if status == 403:
        raise GeoLimitExceeded('yandex: 403 Forbidden / лимит исчерпан')
    if status == 429:
        raise GeoLimitExceeded('yandex: 429 Too Many Requests')
    data = json.loads(raw)
    members = (
        data.get('response', {})
            .get('GeoObjectCollection', {})
            .get('featureMember', [])
    )
    if not members:
        return {}
    obj = members[0].get('GeoObject', {})
    meta = obj.get('metaDataProperty', {}).get('GeocoderMetaData', {})
    addr = meta.get('Address', {})
    components = addr.get('Components', [])
    # Яндекс хранит округ в компонентах kind='district'
    # Может быть несколько (район + округ), берём все
    districts = [c['name'] for c in components if c.get('kind') == 'district']
    # Первый district обычно округ, второй — район внутри округа
    city_district = districts[0] if districts else ''
    suburb = districts[1] if len(districts) > 1 else city_district
    result = {
        'suburb':        suburb,
        'quarter':       '',
        'city_district': city_district,
        'neighbourhood': '',
        'raw':           {'components': components, 'address': addr.get('formatted', '')},
    }
    print(f'[yandex] компоненты: {[(c.get("kind"), c.get("name")) for c in components]} → city_district={city_district!r}')
    return result


def _geocode_maps_co(street: str, api_key: str) -> dict:
    """geocode.maps.co (Nominatim-совместимый) — ищет улицу в Краснодаре."""
    import urllib.parse as _up
    q = _up.quote(f'Краснодар, {street}')
    url = (
        f'https://geocode.maps.co/search'
        f'?q={q}&api_key={api_key}&format=json&addressdetails=1&limit=1&accept-language=ru'
    )
    req = urllib.request.Request(url, headers={'User-Agent': 'KrasnodarRealEstate/1.0'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        status = resp.status
        raw = resp.read().decode('utf-8')
    if status == 429:
        raise GeoLimitExceeded('maps_co: 429 Too Many Requests')
    data = json.loads(raw)
    if not data or not isinstance(data, list):
        return {}
    addr = data[0].get('address') or {}
    return {
        'suburb':        addr.get('suburb', ''),
        'quarter':       addr.get('quarter', ''),
        'city_district': addr.get('city_district', ''),
        'neighbourhood': addr.get('neighbourhood', ''),
        'raw':           addr,
    }


def _geocode_nominatim(street: str, api_key: str) -> dict:
    """Nominatim OSM — полностью бесплатный, без ключа, лимит 1 rps."""
    import urllib.parse as _up
    q = _up.quote(f'Краснодар, {street}')
    url = (
        f'https://nominatim.openstreetmap.org/search'
        f'?q={q}&format=json&addressdetails=1&limit=1&accept-language=ru'
    )
    req = urllib.request.Request(url, headers={'User-Agent': 'KrasnodarRealEstate/1.0'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    if not data or not isinstance(data, list):
        return {}
    addr = data[0].get('address') or {}
    return {
        'suburb':        addr.get('suburb', ''),
        'quarter':       addr.get('quarter', ''),
        'city_district': addr.get('city_district', ''),
        'neighbourhood': addr.get('neighbourhood', ''),
        'raw':           addr,
    }


def _geocode_with_fallback(street: str, providers: list, provider_limits: dict, keys: dict) -> tuple:
    """
    Геокодирует улицу через цепочку провайдеров с авто-переключением при превышении лимита.
    Возвращает (geo_dict, used_provider).
    provider_limits = {provider: remaining_count}  — уменьшается при каждом запросе
    """
    for provider in providers:
        limit_left = provider_limits.get(provider, 9999)
        if limit_left <= 0:
            print(f'[geo_okrug] {provider}: лимит исчерпан, переключаюсь...')
            continue
        try:
            if provider == 'yandex':
                key = keys.get('yandex', '')
                if not key:
                    print('[geo_okrug] yandex: нет YANDEX_GEOCODER_KEY, пропускаю')
                    provider_limits['yandex'] = 0
                    continue
                geo = _geocode_yandex(street, key)
            elif provider == 'maps_co':
                key = keys.get('maps_co', '')
                if not key:
                    print('[geo_okrug] maps_co: нет MAPS_CO_API_KEY, пропускаю')
                    provider_limits['maps_co'] = 0
                    continue
                geo = _geocode_maps_co(street, key)
            elif provider == 'nominatim':
                geo = _geocode_nominatim(street, '')
            else:
                continue

            provider_limits[provider] = limit_left - 1
            return geo, provider

        except GeoLimitExceeded as e:
            print(f'[geo_okrug] {provider}: лимит по API ({e}), переключаюсь...')
            provider_limits[provider] = 0
            continue
        except Exception as e:
            print(f'[geo_okrug] {provider}: ошибка для "{street}": {e}')
            continue

    return {}, None


def _match_okrug(geo: dict, okrugs: list):
    """
    Сопоставляет поля suburb/quarter/city_district из геокодера с 4 округами.
    Возвращает строку из okrugs или None.
    """
    candidates = [
        geo.get('city_district', ''),
        geo.get('suburb', ''),
        geo.get('quarter', ''),
        geo.get('neighbourhood', ''),
    ]
    for raw in candidates:
        if not raw:
            continue
        raw_l = raw.lower().strip()
        for okrug in okrugs:
            ok_l = okrug['name'].lower()
            ok_first = ok_l.split()[0]
            if ok_first in raw_l or raw_l in ok_l:
                return okrug
    return None


def _handle_geo_okrug(body: dict, cur, conn) -> dict:
    """
    action=geo_okrug — определяет округ для улиц через цепочку геокодеров с авто-fallback.

    mode=preview — только показать что найдено, без записи
    mode=apply   — сохранить okrug_id в street_district_map
    limit=N      — обработать не более N уникальных улиц (по умолчанию 30)
    force=true   — перезаписывать даже те у кого okrug_id уже стоит
    providers    — список провайдеров в порядке приоритета, напр. ["yandex","maps_co","nominatim"]
    provider_limits — лимиты запросов: {"yandex": 1000, "maps_co": 500, "nominatim": 9999}
    """
    import time as _time

    mode = body.get('mode', 'preview')
    limit = min(int(body.get('limit') or 30), 500)
    force = body.get('force', False)

    # Провайдеры и лимиты из запроса (UI передаёт)
    providers = body.get('providers') or GEO_PROVIDERS
    raw_limits = body.get('provider_limits') or {}
    provider_limits = {
        'yandex':    int(raw_limits.get('yandex', 9999)),
        'maps_co':   int(raw_limits.get('maps_co', 9999)),
        'nominatim': int(raw_limits.get('nominatim', 9999)),
    }
    keys = {
        'yandex':  os.environ.get('YANDEX_GEOCODER_KEY', ''),
        'maps_co': os.environ.get('MAPS_CO_API_KEY', ''),
    }

    # Задержки между запросами (сек) по провайдеру
    delays = {'yandex': 0.1, 'maps_co': 0.5, 'nominatim': 1.1}

    # Загружаем округа
    cur.execute(
        f"SELECT id, name FROM {SCHEMA}.districts WHERE is_okrug = TRUE AND is_active = TRUE ORDER BY sort_order"
    )
    okrugs = [dict(r) for r in cur.fetchall()]
    if not okrugs:
        return _err('Не найдены округа (is_okrug=true)', 500)

    # Улицы без округа
    if force:
        cur.execute(
            f"SELECT DISTINCT street_pattern FROM {SCHEMA}.street_district_map ORDER BY street_pattern LIMIT {limit}"
        )
    else:
        cur.execute(
            f"SELECT DISTINCT street_pattern FROM {SCHEMA}.street_district_map "
            f"WHERE okrug_id IS NULL ORDER BY street_pattern LIMIT {limit}"
        )
    streets = [r['street_pattern'] for r in cur.fetchall()]

    print(f'[geo_okrug] улиц: {len(streets)}, провайдеры: {providers}, лимиты: {provider_limits}')

    results = []
    matched_count = 0
    not_found = []
    provider_stats = {p: 0 for p in providers}

    for street in streets:
        geo, used_provider = _geocode_with_fallback(street, providers, provider_limits, keys)
        if used_provider is None:
            not_found.append(street)
            results.append({'street': street, 'okrug': None, 'okrug_id': None,
                            'suburb': '', 'quarter': '', 'city_district': '', 'provider': None})
            continue

        provider_stats[used_provider] = provider_stats.get(used_provider, 0) + 1
        okrug = _match_okrug(geo, okrugs)

        entry = {
            'street': street,
            'okrug': okrug['name'] if okrug else None,
            'okrug_id': okrug['id'] if okrug else None,
            'suburb': geo.get('suburb', ''),
            'quarter': geo.get('quarter', ''),
            'city_district': geo.get('city_district', ''),
            'provider': used_provider,
        }
        results.append(entry)

        if okrug:
            matched_count += 1
            if mode == 'apply':
                cur.execute(
                    f"UPDATE {SCHEMA}.street_district_map "
                    f"SET okrug_id = {okrug['id']} "
                    f"WHERE street_pattern = %s",
                    (street,)
                )
            print(f'[geo_okrug] ✓ [{used_provider}] "{street}" → {okrug["name"]}')
        else:
            not_found.append(street)
            print(f'[geo_okrug] ? [{used_provider}] "{street}" — не определён')

        _time.sleep(delays.get(used_provider, 0.5))

    if mode == 'apply':
        conn.commit()
        print(f'[geo_okrug] сохранено okrug_id для {matched_count} улиц')

    return _ok({
        'mode': mode,
        'total_streets': len(streets),
        'matched_count': matched_count,
        'not_found_count': len(not_found),
        'okrugs': okrugs,
        'results': results,
        'not_found': not_found,
        'provider_stats': provider_stats,
        'provider_limits_remaining': provider_limits,
    })


# ── Handler ───────────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    # Определяем action: из query-строки, тела или по HTTP-методу
    action = params.get('action') or body.get('action') or (
        'suggest' if event.get('httpMethod') == 'GET' else 'fix'
    )

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if action == 'suggest':
                return _handle_suggest(event, cur)
            elif action == 'fix':
                return _handle_fix(body, cur, conn)
            elif action == 'normalize':
                return _handle_normalize(body, cur, conn)
            elif action == 'audit':
                return _handle_audit(body, cur, conn)
            elif action == 'parse_osm':
                return _handle_parse_osm(body, cur)
            elif action == 'overpass_streets':
                return _handle_overpass(body, cur)
            elif action == 'ai_map_streets':
                return _handle_ai_map(body, cur, conn)
            elif action == 'geo_okrug':
                return _handle_geo_okrug(body, cur, conn)
            else:
                return _err(f'Неизвестный action: {action}. Доступные: suggest, fix, normalize, audit, parse_osm, overpass_streets, ai_map_streets, geo_okrug')
    finally:
        conn.close()