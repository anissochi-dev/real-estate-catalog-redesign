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


def _blk(raw, streets, places, MS=12000, MP=800):
    import zlib as _z
    pb = _pf(raw)
    s = _st(pb.get(1, [b''])[0]) if pb.get(1) else []
    if not s: return
    for pg in pb.get(2, []):
        pgf = _pf(pg)
        for wd in pgf.get(3, []):
            if len(streets) >= MS: break
            wf = _pf(wd)
            t = _tg(wf.get(2,[b''])[0] if wf.get(2) else b'', wf.get(3,[b''])[0] if wf.get(3) else b'', s)
            if t.get('highway') in _HW and t.get('name'): streets.add(t['name'])
        for nd in pgf.get(1, []):
            if len(places) >= MP: break
            nf = _pf(nd)
            t = _tg(nf.get(2,[b''])[0] if nf.get(2) else b'', nf.get(3,[b''])[0] if nf.get(3) else b'', s)
            if t.get('place') in _PL and t.get('name'): places[t['name']] = t['place']
        for dd in pgf.get(2, []):
            if len(places) >= MP: break
            df = _pf(dd); kv = _uvi(df.get(10,[b''])[0] if df.get(10) else b'')
            cur = {}; i = 0
            while i < len(kv):
                k = kv[i]
                if k == 0:
                    if cur.get('place') in _PL and cur.get('name') and len(places) < MP:
                        places[cur['name']] = cur['place']
                    cur = {}
                elif i + 1 < len(kv):
                    ks = s[k] if k < len(s) else ''; vs = s[kv[i+1]] if kv[i+1] < len(s) else ''
                    if ks: cur[ks] = vs; i += 1
                i += 1
        for rd in pgf.get(4, []):
            if len(places) >= MP: break
            rf = _pf(rd)
            t = _tg(rf.get(2,[b''])[0] if rf.get(2) else b'', rf.get(3,[b''])[0] if rf.get(3) else b'', s)
            if t.get('name') and (t.get('place') in _PL or t.get('boundary') == 'administrative'):
                places[t['name']] = t.get('place') or f"adm:{t.get('admin_level','')}"


def _parse_pbf(data):
    import struct as _s, zlib as _z
    streets = set(); places = {}; p = 0; blks = 0
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
        _blk(raw, streets, places)
        blks += 1
    print(f'[geo parse_osm] блоков={blks} улиц={len(streets)} мест={len(places)}')
    return streets, places


def _norm_st(s):
    for sf in [' улица',' проспект',' переулок',' бульвар',' шоссе',
               ' проезд',' аллея',' набережная',' тупик',' площадь',' линия']:
        if s.lower().endswith(sf): return s[:len(s)-len(sf)].strip()
    return s.strip()


def _handle_parse_osm(body: dict, cur) -> dict:
    url = body.get('url', '').strip()
    if not url: return _err('url обязателен', 400)

    MAX_R = int(body.get('max_mb', 25)) * 1024 * 1024
    MAX_R = min(MAX_R, 55 * 1024 * 1024)
    print(f'[geo parse_osm] скачиваем {url} range=0-{MAX_R}')
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Range': f'bytes=0-{MAX_R-1}'})
        with urllib.request.urlopen(req, timeout=25) as r:
            data = r.read(MAX_R)
        print(f'[geo parse_osm] получено {len(data):,} байт')
    except Exception as e:
        return _err(f'Скачивание: {e}', 502)

    try:
        streets, places = _parse_pbf(data)
    except Exception as e:
        import traceback
        return _err(f'Парсинг: {e} | {traceback.format_exc()[:400]}', 500)

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

    return _ok({
        'read_mb': round(len(data)/1024/1024, 1),
        'osm_streets': len(streets),
        'osm_places': len(places),
        'db_streets': len(our_st),
        'db_districts': len(our_di),
        'missing_streets_count': len(missing_st),
        'missing_streets': missing_st[:300],
        'places_matched': matched_pl,
        'places_missing': missing_pl,
        'all_osm_places': sorted(places.keys()),
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
            else:
                return _err(f'Неизвестный action: {action}. Доступные: suggest, fix, normalize, audit, parse_osm')
    finally:
        conn.close()