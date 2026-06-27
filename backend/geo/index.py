"""  # v2
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
import urllib.parse
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

    # Если запрос начинается с обозначения населённого пункта — ищем по краю, а не по городу
    settlement_starts = ('п.', 'пгт.', 'с.', 'ст.', 'х.', 'пос.', 'снт.', 'г.', 'аул')
    query_lower = query.lower().strip()
    is_settlement_query = any(query_lower.startswith(s) for s in settlement_starts)

    if is_settlement_query:
        # Населённый пункт — ищем по всему Краснодарскому краю без привязки к городу
        search_query = f'Краснодарский край, {query}'
        payload = json.dumps({
            'query': search_query, 'count': 8,
            'locations': [{'region': 'Краснодарский край'}],
            'restrict_value': False,
        }).encode('utf-8')
    else:
        search_query = f'{city}, {query}'
        payload = json.dumps({
            'query': search_query, 'count': 8,
            'locations': [{'city': city}],
            'restrict_value': False,
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

    print(f'[suggest] query={search_query!r} is_settlement={is_settlement_query} results={len(data.get("suggestions", []))} raw={json.dumps(data.get("suggestions", [])[:2], ensure_ascii=False)}')

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
        # 1. Убираем федеральный/региональный уровень
        for prefix in ['Россия, ', 'Краснодарский край, ']:
            while short.startswith(prefix):
                short = short[len(prefix):]
        # 2. Убираем «городской округ Краснодар, » и «г Краснодар, »
        for okrug_prefix in [f'городской округ {city}, ', f'г.о. {city}, ', f'г {city}, ', f'г. {city}, ', f'{city}, ']:
            if short.startswith(okrug_prefix):
                short = short[len(okrug_prefix):]
                break
        # 3. Убираем «<Район> район, » / «<Район> р-н, » — НО сохраняем населённый пункт после него
        # Пример: «Динской район, ст. Динская, ул. ...» → «ст. Динская, ул. ...»
        #          «Павловский район, г. Павловская, ул. ...» → «г. Павловская, ул. ...»
        short = re.sub(r'^[А-ЯЁа-яё\s\-]+ (район|р-н), ', '', short)

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
GEO_PROVIDERS = ['yandex', 'dadata', 'maps_co', 'nominatim']

class GeoLimitExceeded(Exception):
    pass


def _geo_quota_check_and_inc(cur, conn, provider: str) -> bool:
    """
    Проверяет дневной лимит провайдера и инкрементирует счётчик.
    Если день изменился — сбрасывает счётчик (сброс в 00:01 по UTC).
    Возвращает True если запрос разрешён, False если лимит исчерпан.
    """
    cur.execute(
        f"SELECT id, requests_used, requests_limit, day_start "
        f"FROM {SCHEMA}.geo_api_quota WHERE provider = %s FOR UPDATE",
        (provider,)
    )
    row = cur.fetchone()
    if not row:
        # Провайдера нет в таблице — создаём с безлимитом
        cur.execute(
            f"INSERT INTO {SCHEMA}.geo_api_quota (provider, requests_used, requests_limit, day_start) "
            f"VALUES (%s, 1, 9999, CURRENT_DATE) ON CONFLICT (provider) DO NOTHING",
            (provider,)
        )
        conn.commit()
        return True

    row_id = row['id']
    used = row['requests_used']
    limit = row['requests_limit']
    day_start = row['day_start']

    import datetime as _dt
    today = _dt.date.today()
    # Сброс счётчика если наступил новый день
    if day_start < today:
        cur.execute(
            f"UPDATE {SCHEMA}.geo_api_quota "
            f"SET requests_used = 1, day_start = CURRENT_DATE, updated_at = NOW() "
            f"WHERE id = %s",
            (row_id,)
        )
        conn.commit()
        print(f'[geo_quota] {provider}: новый день, счётчик сброшен (было {used})')
        return True

    # Проверяем лимит (9999 = без лимита)
    if limit < 9999 and used >= limit:
        print(f'[geo_quota] {provider}: лимит {limit} исчерпан (использовано {used}), пропускаю')
        return False

    # Инкрементируем
    cur.execute(
        f"UPDATE {SCHEMA}.geo_api_quota "
        f"SET requests_used = requests_used + 1, updated_at = NOW() "
        f"WHERE id = %s",
        (row_id,)
    )
    conn.commit()
    return True


def _geo_quota_get_all(cur) -> dict:
    """Возвращает текущие счётчики всех провайдеров."""
    cur.execute(
        f"SELECT provider, requests_used, requests_limit, day_start, updated_at "
        f"FROM {SCHEMA}.geo_api_quota ORDER BY provider"
    )
    result = {}
    import datetime as _dt
    today = _dt.date.today()
    for row in cur.fetchall():
        used = row['requests_used'] if row['day_start'] >= today else 0
        result[row['provider']] = {
            'used': used,
            'limit': row['requests_limit'],
            'day_start': str(row['day_start']),
            'remaining': max(0, row['requests_limit'] - used) if row['requests_limit'] < 9999 else None,
        }
    return result


def _geo_quota_set_limit(cur, conn, provider: str, limit: int):
    """Устанавливает лимит для провайдера."""
    cur.execute(
        f"INSERT INTO {SCHEMA}.geo_api_quota (provider, requests_limit) VALUES (%s, %s) "
        f"ON CONFLICT (provider) DO UPDATE SET requests_limit = EXCLUDED.requests_limit, updated_at = NOW()",
        (provider, limit)
    )
    conn.commit()

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


def _geocode_dadata(street: str, api_key: str, secret_key: str) -> dict:
    """DaData — стандартизация адресов, определяет округ через federal_district / city_district."""
    payload = json.dumps([f'Краснодар, {street}']).encode('utf-8')
    req = urllib.request.Request(
        'https://cleaner.dadata.ru/api/v1/clean/address',
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Token {api_key}',
            'X-Secret': secret_key,
            'User-Agent': 'KrasnodarRealEstate/1.0',
        }
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        status = resp.status
        raw = resp.read().decode('utf-8')
    if status == 402:
        raise GeoLimitExceeded('dadata: 402 Payment Required / лимит исчерпан')
    if status == 429:
        raise GeoLimitExceeded('dadata: 429 Too Many Requests')
    data = json.loads(raw)
    if not data or not isinstance(data, list):
        return {}
    addr = data[0]
    # DaData возвращает city_district для внутригородских округов Краснодара
    city_district = addr.get('city_district', '') or ''
    suburb = addr.get('settlement', '') or ''
    print(f'[dadata] city_district={city_district!r}, settlement={suburb!r}, result_code={addr.get("result_code")}')
    return {
        'suburb':        suburb,
        'quarter':       '',
        'city_district': city_district,
        'neighbourhood': '',
        'raw':           addr,
    }


def _geocode_with_fallback(street: str, providers: list, keys: dict, cur, conn) -> tuple:
    """
    Геокодирует улицу через цепочку провайдеров с авто-переключением.
    Проверяет и инкрементирует дневной счётчик в geo_api_quota.
    Возвращает (geo_dict, used_provider).
    """
    for provider in providers:
        # Проверяем дневной лимит в БД
        allowed = _geo_quota_check_and_inc(cur, conn, provider)
        if not allowed:
            print(f'[geo_okrug] {provider}: дневной лимит исчерпан, переключаюсь...')
            continue
        try:
            if provider == 'yandex':
                key = keys.get('yandex', '')
                if not key:
                    print('[geo_okrug] yandex: нет YANDEX_GEOCODER_KEY, пропускаю')
                    continue
                geo = _geocode_yandex(street, key)
            elif provider == 'dadata':
                key = keys.get('dadata', '')
                secret = keys.get('dadata_secret', '')
                if not key or not secret:
                    print('[geo_okrug] dadata: нет DADATA_API_KEY/DADATA_SECRET_KEY, пропускаю')
                    continue
                geo = _geocode_dadata(street, key, secret)
            elif provider == 'maps_co':
                key = keys.get('maps_co', '')
                if not key:
                    print('[geo_okrug] maps_co: нет MAPS_CO_API_KEY, пропускаю')
                    continue
                geo = _geocode_maps_co(street, key)
            elif provider == 'nominatim':
                geo = _geocode_nominatim(street, '')
            else:
                continue

            return geo, provider

        except GeoLimitExceeded as e:
            print(f'[geo_okrug] {provider}: лимит по API ({e}), переключаюсь...')
            # Обнуляем оставшийся лимит в БД чтобы больше не пытаться сегодня
            cur.execute(
                f"UPDATE {SCHEMA}.geo_api_quota "
                f"SET requests_used = requests_limit, updated_at = NOW() "
                f"WHERE provider = %s AND requests_limit < 9999",
                (provider,)
            )
            conn.commit()
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
    Счётчики запросов хранятся в geo_api_quota, сбрасываются ежедневно в 00:01.

    mode=preview — только показать что найдено, без записи
    mode=apply   — сохранить okrug_id в street_district_map
    limit=N      — обработать не более N уникальных улиц (по умолчанию 30)
    force=true   — перезаписывать даже те у кого okrug_id уже стоит
    providers    — список провайдеров в порядке приоритета
    """
    import time as _time

    mode = body.get('mode', 'preview')
    limit = min(int(body.get('limit') or 30), 500)
    force = body.get('force', False)
    providers = body.get('providers') or GEO_PROVIDERS

    keys = {
        'yandex':        os.environ.get('YANDEX_GEOCODER_KEY', ''),
        'dadata':        os.environ.get('DADATA_API_KEY', ''),
        'dadata_secret': os.environ.get('DADATA_SECRET_KEY', ''),
        'maps_co':       os.environ.get('MAPS_CO_API_KEY', ''),
    }

    delays = {'yandex': 0.1, 'dadata': 0.1, 'maps_co': 0.5, 'nominatim': 1.1}

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

    # Актуальные квоты на момент старта (для ответа)
    quota_before = _geo_quota_get_all(cur)
    print(f'[geo_okrug] улиц: {len(streets)}, провайдеры: {providers}, квоты: {quota_before}')

    results = []
    matched_count = 0
    not_found = []
    provider_stats = {p: 0 for p in providers}

    for street in streets:
        geo, used_provider = _geocode_with_fallback(street, providers, keys, cur, conn)
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

    quota_after = _geo_quota_get_all(cur)

    return _ok({
        'mode': mode,
        'total_streets': len(streets),
        'matched_count': matched_count,
        'not_found_count': len(not_found),
        'okrugs': okrugs,
        'results': results,
        'not_found': not_found,
        'provider_stats': provider_stats,
        'quota': quota_after,
    })


def _handle_geo_quota(body: dict, cur, conn) -> dict:
    """
    action=geo_quota — управление дневными лимитами геокодеров.
    GET (mode=get): возвращает текущие счётчики и лимиты
    POST (mode=set_limit): устанавливает лимит для провайдера
    POST (mode=reset): сбрасывает счётчик провайдера вручную
    """
    mode = body.get('mode', 'get')

    if mode == 'get':
        return _ok({'quota': _geo_quota_get_all(cur)})

    if mode == 'set_limit':
        provider = body.get('provider', '')
        limit = int(body.get('limit', 9999))
        if provider not in GEO_PROVIDERS:
            return _err(f'Неизвестный провайдер: {provider}', 400)
        _geo_quota_set_limit(cur, conn, provider, limit)
        return _ok({'quota': _geo_quota_get_all(cur)})

    if mode == 'reset':
        provider = body.get('provider', '')
        if provider not in GEO_PROVIDERS:
            return _err(f'Неизвестный провайдер: {provider}', 400)
        cur.execute(
            f"UPDATE {SCHEMA}.geo_api_quota SET requests_used = 0, day_start = CURRENT_DATE, updated_at = NOW() "
            f"WHERE provider = %s",
            (provider,)
        )
        conn.commit()
        return _ok({'quota': _geo_quota_get_all(cur)})

    return _err(f'Неизвестный mode: {mode}', 400)


# ── Росреестр PKK helpers ─────────────────────────────────────────────────────

_PKK_TYPES = {
    1: 'Земельный участок',
    2: 'Здание',
    3: 'Сооружение',
    4: 'Объект незавершённого строительства',
    5: 'Помещение',
    6: 'Машиноместо',
    9: 'Единый недвижимый комплекс',
    10: 'Предприятие как имущественный комплекс',
}

_PKK_STATUS = {
    '01': 'Учтён', '06': 'Ранее учтён', '07': 'Временный',
    '08': 'Архивный', '09': 'Аннулированный',
}

_PKK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://pkk.rosreestr.ru/',
    'Origin': 'https://pkk.rosreestr.ru',
}


def _pkk_ssl_ctx():
    """SSL-контекст без верификации для pkk.rosreestr.ru (самоподписанный сертификат)."""
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _pkk_search_by_cn(cn: str) -> dict:
    """Поиск объекта по кадастровому номеру через публичный PKK API Росреестра.
    Endpoint: /api/features/?text=<cn>&tolerance=2&types=[1,2,5,3,6]
    """
    import urllib.parse as _up
    ctx = _pkk_ssl_ctx()
    # Единый endpoint с перечислением типов
    url = (
        f'https://pkk.rosreestr.ru/api/features/'
        f'?text={_up.quote(cn)}&limit=1&tolerance=4'
        f'&types=%5B1%2C2%2C5%2C3%2C6%5D'
    )
    try:
        req = urllib.request.Request(url, headers=_PKK_HEADERS)
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        print(f'[pkk] search cn={cn} response keys={list(data.keys())}')
        # Ответ может быть features[] или results[]
        features = data.get('features') or data.get('results') or []
        if features:
            f = features[0]
            obj_type = f.get('type') or 2
            return {'feature': f, 'obj_type': obj_type}
    except Exception as e:
        print(f'[pkk] search error cn={cn}: {e}')

    # Fallback: перебираем типы по одному
    for obj_type in [1, 2, 5, 3, 6]:
        try:
            url2 = (
                f'https://pkk.rosreestr.ru/api/features/{obj_type}'
                f'?text={_up.quote(cn)}&limit=1&tolerance=4'
            )
            req2 = urllib.request.Request(url2, headers=_PKK_HEADERS)
            with urllib.request.urlopen(req2, timeout=12, context=ctx) as resp2:
                data2 = json.loads(resp2.read().decode('utf-8'))
            features2 = data2.get('features') or data2.get('results') or []
            if features2:
                print(f'[pkk] found type={obj_type} cn={cn}')
                return {'feature': features2[0], 'obj_type': obj_type}
        except Exception as e2:
            print(f'[pkk] type={obj_type} cn={cn} error: {e2}')
    return {}


def _pkk_get_detail(obj_type: int, cn: str) -> dict:
    """Получает детальную карточку объекта из PKK."""
    import urllib.parse as _up
    ctx = _pkk_ssl_ctx()
    try:
        url = f'https://pkk.rosreestr.ru/api/features/{obj_type}/{_up.quote(cn)}'
        req = urllib.request.Request(url, headers=_PKK_HEADERS)
        with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return data.get('feature') or {}
    except Exception as e:
        print(f'[pkk] detail error cn={cn}: {e}')
        return {}


def _pkk_parse_feature(feature: dict, obj_type: int, cn: str) -> dict:
    """Разбирает feature из PKK API в унифицированный формат."""
    attrs = feature.get('attrs') or {}
    center = feature.get('center') or {}

    # Координаты (PKK возвращает в EPSG:3857, нужно конвертировать в WGS84)
    lat, lon = None, None
    cx = center.get('x')
    cy = center.get('y')
    if cx and cy:
        import math
        lon = cx / 20037508.34 * 180
        lat_rad = math.atan(math.exp(cy / 20037508.34 * math.pi)) * 2 - math.pi / 2
        lat = math.degrees(lat_rad)
        lat = round(lat, 7)
        lon = round(lon, 7)

    # Площадь
    area_sqm = None
    area_raw = attrs.get('area_value') or attrs.get('area') or attrs.get('sq') or ''
    if area_raw:
        try:
            area_sqm = float(str(area_raw).replace(',', '.'))
        except (TypeError, ValueError):
            pass

    # Статус
    status_code = str(attrs.get('statecd') or '')
    status = _PKK_STATUS.get(status_code, '')

    # Тип объекта
    type_label = _PKK_TYPES.get(obj_type, '')
    purpose = attrs.get('purpose') or attrs.get('util_by_doc') or ''
    category = attrs.get('category_type') or attrs.get('category') or ''

    # Этажи / год
    floors = None
    year_built = None
    try:
        floors_raw = attrs.get('floors') or attrs.get('floors_count')
        if floors_raw:
            floors = int(str(floors_raw))
    except (TypeError, ValueError):
        pass
    try:
        yr = attrs.get('year_built') or attrs.get('year_created')
        if yr:
            year_built = int(str(yr))
    except (TypeError, ValueError):
        pass

    # Адрес из PKK
    address_str = attrs.get('address') or attrs.get('readable_address') or ''

    return {
        'found': True,
        'cadastral_number': cn,
        'address': address_str,
        'lat': lat,
        'lon': lon,
        'district': '',
        'object_type': type_label,
        'area_sqm': area_sqm,
        'floors': floors,
        'year_built': year_built,
        'status': status,
        'purpose': purpose,
        'category': category,
        'source': 'rosreestr_pkk',
    }


# ── action=cadastre_by_address ────────────────────────────────────────────────

def _handle_cadastre_by_address(event: dict) -> dict:
    """
    Получает кадастровый номер по адресу.
    Шаг 1: DaData suggest — иногда возвращает cadastral_number напрямую.
    Шаг 2: если нет — ищем через ЕГРН API (api-assist.com/search_by_address).
    GET ?query=<полный адрес>
    """
    params = event.get('queryStringParameters') or {}
    query = (params.get('query') or '').strip()
    if not query:
        return _err('query обязателен', 400)

    # Координаты можно передать явно (из DaData-подсказки на фронте)
    hint_lat = float(params['hint_lat']) if params.get('hint_lat') else None
    hint_lon = float(params['hint_lon']) if params.get('hint_lon') else None

    dadata_key = os.environ.get('DADATA_API_KEY', '')
    dadata_secret = os.environ.get('DADATA_SECRET_KEY', '')
    egrn_key = os.environ.get('EGRN_API_KEY', '')

    lat, lon, address, cn = hint_lat, hint_lon, '', ''

    # Шаг 1: DaData — координаты + попытка получить кадастровый номер
    try:
        payload = json.dumps({'query': query, 'count': 1}).encode('utf-8')
        req = urllib.request.Request(
            'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
            data=payload,
            headers={'Content-Type': 'application/json', 'Accept': 'application/json',
                     'Authorization': f'Token {dadata_key}', 'X-Secret': dadata_secret},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        sugg = data.get('suggestions', [])
        if sugg:
            d = sugg[0].get('data', {})
            cn = (d.get('cadastral_number') or '').strip()
            lat = float(d['geo_lat']) if d.get('geo_lat') else None
            lon = float(d['geo_lon']) if d.get('geo_lon') else None
            address = sugg[0].get('value', '')
    except Exception as e:
        print(f'[cadastre_by_address] DaData error: {e}')

    if cn:
        return _ok({'found': True, 'cadastral_number': cn, 'address': address, 'lat': lat, 'lon': lon, 'source': 'dadata', 'objects': [{'cadastral_number': cn, 'address': address}]})

    # Шаг 2: ЕГРН API search_by_address
    if not egrn_key:
        print(f'[cadastre_by_address] no EGRN_API_KEY, giving up for: {query}')
        return _ok({'found': False})

    def _egrn_search(addr: str):
        egrn_url = f'https://service.api-assist.com/parser/egrn_api/search_by_address?key={egrn_key}&address={urllib.parse.quote(addr)}'
        req2 = urllib.request.Request(egrn_url, headers={'Accept': 'application/json'})
        with urllib.request.urlopen(req2, timeout=15) as resp2:
            return json.loads(resp2.read().decode('utf-8'))

    # Извлекаем ТОЛЬКО цифровой номер помещения/квартиры из запроса
    room_match = re.search(r'(?:помещ|помещение|кв|квартира|оф|офис|пом|ком|комната)\.?\s*(\d+)', query, flags=re.IGNORECASE)
    room_num = room_match.group(1).strip() if room_match else None

    # Обрезаем суффикс помещения — получаем адрес здания
    short = re.sub(r',?\s*(помещ|помещение|кв|квартира|оф|офис|пом|ком|комната)\.?\s*\S+.*$', '', query, flags=re.IGNORECASE).strip()
    has_room = short and short != query

    # Извлекаем город из запроса для фильтрации записей ЕГРН из других городов
    def _extract_city(q: str) -> str:
        """Возвращает название города из запроса (после г/г./город)."""
        m = re.search(r'(?:^|,)\s*г\.?\s+([А-ЯЁа-яё\-]+)', q)
        return m.group(1).lower() if m else ''

    def _city_matches(rec_addr: str, city: str) -> bool:
        """True если адрес из ЕГРН содержит нужный город, или город не определён."""
        if not city:
            return True
        return city in rec_addr.lower()

    query_city = _extract_city(query)

    def _make_result(objects_list: list, main_cn: str, main_addr: str):
        """Собирает итоговый ответ с массивом объектов и координатами."""
        res_lat, res_lon = lat, lon
        if not res_lat or not res_lon:
            yandex_key = os.environ.get('YANDEX_GEOCODER_KEY', '')
            geo = _yandex_geocode_cadastre(main_cn, yandex_key)
            if geo.get('lat'):
                res_lat, res_lon = geo['lat'], geo['lon']
        return _ok({
            'found': True,
            'cadastral_number': main_cn,
            'address': main_addr,
            'lat': res_lat,
            'lon': res_lon,
            'source': 'egrn_api',
            'objects': objects_list,
        })

    def _return_found(cn: str, found_address: str):
        return _make_result([{'cadastral_number': cn, 'address': found_address}], cn, found_address)

    # Если есть номер помещения — пробуем варианты написания: "пом. N" и "кв. N"
    if has_room and room_num:
        for suffix in [f'пом. {room_num}', f'кв. {room_num}']:
            addr_try = f'{short}, {suffix}'
            try:
                egrn_data = _egrn_search(addr_try)
                records = egrn_data.get('records', []) if egrn_data.get('success') == 1 else []
                print(f'[cadastre_by_address] EGRN try="{addr_try}" records={len(records)}')
                if records:
                    # Берём первую запись — запрос уже специфичный (дом + помещение)
                    rec = records[0]
                    cn = (rec.get('cad_number') or '').strip()
                    if cn:
                        return _return_found(cn, rec.get('address', address))
            except Exception as e:
                print(f'[cadastre_by_address] EGRN try="{addr_try}" error: {e}')

    # Запрашиваем по адресу здания (с нормализацией корпуса к → /к)
    def _normalize_korpus(addr: str) -> str:
        return re.sub(r'\bд\.?\s*(\d+[\w]*)\s+к\.?\s*(\d+)', r'д. \1/\2', addr, flags=re.IGNORECASE)

    addr_to_search = _normalize_korpus(short if has_room else query)
    try:
        egrn_data = _egrn_search(addr_to_search)
        records = egrn_data.get('records', []) if egrn_data.get('success') == 1 else []
        print(f'[cadastre_by_address] EGRN addr="{addr_to_search}" records={len(records)} room_num={room_num}')

        if records:
            # Если есть номер помещения — ищем конкретное помещение
            if room_num:
                # Два прохода: сначала с фильтром по городу, потом без (fallback)
                for strict_city in ([True, False] if query_city else [False]):
                    for rec in records:
                        rec_addr = rec.get('address', '')
                        if strict_city and not _city_matches(rec_addr, query_city):
                            continue
                        if re.search(r'(?:кв|пом|помещ|оф)\.?\s*' + room_num + r'\b', rec_addr, re.IGNORECASE):
                            cn = (rec.get('cad_number') or '').strip()
                            if cn:
                                return _return_found(cn, rec_addr)
                        if re.search(r',\s*' + room_num + r'\s*$', rec_addr):
                            cn = (rec.get('cad_number') or '').strip()
                            if cn:
                                return _return_found(cn, rec_addr)
                # Помещение не найдено — берём первое здание из правильного города
                for rec in records:
                    if _city_matches(rec.get('address', ''), query_city):
                        cn = (rec.get('cad_number') or '').strip()
                        if cn:
                            return _return_found(cn, rec.get('address', address))
                matched = records[0]
                cn = (matched.get('cad_number') or '').strip()
                if cn:
                    return _return_found(cn, matched.get('address', address))
            else:
                # Нет помещения — определяем типы объектов через details_by_number
                # Сначала фильтруем по городу, потом пропускаем дубли и помещения
                seen_cn = set()
                candidates = []
                for rec in records[:15]:
                    cn_r = (rec.get('cad_number') or '').strip()
                    addr_r = rec.get('address', '')
                    if not cn_r or cn_r in seen_cn:
                        continue
                    if not _city_matches(addr_r, query_city):
                        continue
                    if re.search(r'(?:кв|пом|помещ)\.?\s*\d+', addr_r, re.IGNORECASE):
                        continue
                    seen_cn.add(cn_r)
                    candidates.append({'cadastral_number': cn_r, 'address': addr_r})
                    if len(candidates) >= 8:
                        break
                # Если с фильтром по городу ничего — берём без фильтра
                if not candidates:
                    for rec in records[:15]:
                        cn_r = (rec.get('cad_number') or '').strip()
                        addr_r = rec.get('address', '')
                        if not cn_r or cn_r in seen_cn:
                            continue
                        if re.search(r'(?:кв|пом|помещ)\.?\s*\d+', addr_r, re.IGNORECASE):
                            continue
                        seen_cn.add(cn_r)
                        candidates.append({'cadastral_number': cn_r, 'address': addr_r})
                        if len(candidates) >= 8:
                            break

                # Запрашиваем типы для каждого кандидата
                ALLOWED_TYPES = {'Здание', 'Земельный участок', 'Сооружение', 'Помещение', 'Объект незавершённого строительства'}
                objects_with_type = []
                for cand in candidates:
                    try:
                        det_url = f'https://service.api-assist.com/parser/egrn_api/details_by_number?key={egrn_key}&cadNumber={urllib.parse.quote(cand["cadastral_number"])}'
                        req_det = urllib.request.Request(det_url, headers={'Accept': 'application/json'})
                        with urllib.request.urlopen(req_det, timeout=10) as resp_det:
                            det_data = json.loads(resp_det.read().decode('utf-8'))
                        if det_data.get('success') == 1 and det_data.get('records'):
                            r = det_data['records'][0]
                            obj_type = r.get('type', '')
                            objects_with_type.append({
                                'cadastral_number': cand['cadastral_number'],
                                'address': r.get('address', cand['address']),
                                'type': obj_type,
                                'area': r.get('area', ''),
                            })
                    except Exception as e:
                        print(f'[cadastre_by_address] details error for {cand["cadastral_number"]}: {e}')
                        objects_with_type.append({**cand, 'type': '', 'area': ''})

                # Оставляем уникальные типы (одно здание + один участок + etc.)
                seen_types = set()
                objects_list = []
                main_cn, main_addr = '', address
                # Приоритет: сначала Здание, потом Земельный участок, потом остальные
                type_priority = ['Здание', 'Земельный участок', 'Сооружение', 'Объект незавершённого строительства', '']
                objects_with_type.sort(key=lambda x: type_priority.index(x['type']) if x['type'] in type_priority else 99)
                for obj in objects_with_type:
                    t = obj['type']
                    if t and t in seen_types:
                        continue
                    if t:
                        seen_types.add(t)
                    objects_list.append(obj)
                    if not main_cn:
                        main_cn = obj['cadastral_number']
                        main_addr = obj['address']

                if objects_list:
                    print(f'[cadastre_by_address] returning {len(objects_list)} typed objects')
                    return _make_result(objects_list, main_cn, main_addr)
    except Exception as e:
        print(f'[cadastre_by_address] EGRN API error: {e}')

    # Стратегия 3: подбираем альтернативные типы улиц (ул ↔ пр-д/проезд/пер/пл/ш)
    # Также нормализуем "д N к M" → "д. N/M" (корпус в ЕГРН часто пишется через слэш)
    def _normalize_korpus(addr: str) -> str:
        return re.sub(r'\bд\.?\s*(\d+[\w]*)\s+к\.?\s*(\d+)', r'д. \1/\2', addr, flags=re.IGNORECASE)

    STREET_ALTERNATES = [
        (r'\bул\.?\s+', ['проезд ', 'пр-д ', 'переулок ', 'пер. ', 'шоссе ', 'площадь ', 'бульвар ']),
        (r'\bпроезд\s+', ['ул. ', 'переулок ', 'пер. ']),
        (r'\bпр-д\s+', ['ул. ', 'проезд ', 'переулок ']),
        (r'\bпереулок\s+', ['ул. ', 'проезд ']),
        (r'\bпер\.\s+', ['ул. ', 'проезд ']),
    ]
    # Пробуем с нормализацией корпуса на исходном запросе сначала
    norm_query = _normalize_korpus(addr_to_search if 'addr_to_search' in dir() else query)
    if norm_query != (addr_to_search if 'addr_to_search' in dir() else query):
        try:
            egrn_data_norm = _egrn_search(norm_query)
            records_norm = egrn_data_norm.get('records', []) if egrn_data_norm.get('success') == 1 else []
            print(f'[cadastre_by_address] norm addr="{norm_query}" records={len(records_norm)}')
            if records_norm:
                first = records_norm[0]
                cn_n = (first.get('cad_number') or '').strip()
                if cn_n:
                    return _return_found(cn_n, first.get('address', address))
        except Exception as e_n:
            print(f'[cadastre_by_address] norm error: {e_n}')

    addr_for_alt = _normalize_korpus(addr_to_search if 'addr_to_search' in dir() else query)
    for pattern, replacements in STREET_ALTERNATES:
        if re.search(pattern, addr_for_alt, re.IGNORECASE):
            for repl in replacements:
                alt_addr = _normalize_korpus(re.sub(pattern, repl, addr_for_alt, count=1, flags=re.IGNORECASE))
                if alt_addr == addr_for_alt:
                    continue
                try:
                    egrn_data2 = _egrn_search(alt_addr)
                    records2 = egrn_data2.get('records', []) if egrn_data2.get('success') == 1 else []
                    print(f'[cadastre_by_address] alt addr="{alt_addr}" records={len(records2)}')
                    if records2:
                        seen_cn2 = set()
                        candidates2 = []
                        for rec in records2[:15]:
                            cn_r = (rec.get('cad_number') or '').strip()
                            addr_r = rec.get('address', '')
                            if not cn_r or cn_r in seen_cn2:
                                continue
                            if re.search(r'(?:кв|пом|помещ)\.?\s*\d+', addr_r, re.IGNORECASE):
                                continue
                            seen_cn2.add(cn_r)
                            candidates2.append({'cadastral_number': cn_r, 'address': addr_r})
                            if len(candidates2) >= 8:
                                break
                        if not candidates2:
                            continue
                        objects_with_type2 = []
                        for cand in candidates2:
                            try:
                                det_url2 = f'https://service.api-assist.com/parser/egrn_api/details_by_number?key={egrn_key}&cadNumber={urllib.parse.quote(cand["cadastral_number"])}'
                                req_det2 = urllib.request.Request(det_url2, headers={'Accept': 'application/json'})
                                with urllib.request.urlopen(req_det2, timeout=10) as resp_det2:
                                    det_data2 = json.loads(resp_det2.read().decode('utf-8'))
                                if det_data2.get('success') == 1 and det_data2.get('records'):
                                    r2 = det_data2['records'][0]
                                    objects_with_type2.append({
                                        'cadastral_number': cand['cadastral_number'],
                                        'address': r2.get('address', cand['address']),
                                        'type': r2.get('type', ''),
                                        'area': r2.get('area', ''),
                                    })
                            except Exception:
                                objects_with_type2.append({**cand, 'type': '', 'area': ''})
                        seen_types2 = set()
                        objects_list2 = []
                        main_cn2, main_addr2 = '', address
                        type_priority2 = ['Здание', 'Земельный участок', 'Сооружение', 'Объект незавершённого строительства', '']
                        objects_with_type2.sort(key=lambda x: type_priority2.index(x['type']) if x['type'] in type_priority2 else 99)
                        for obj in objects_with_type2:
                            t = obj['type']
                            if t and t in seen_types2:
                                continue
                            if t:
                                seen_types2.add(t)
                            objects_list2.append(obj)
                            if not main_cn2:
                                main_cn2 = obj['cadastral_number']
                                main_addr2 = obj['address']
                        if objects_list2:
                            print(f'[cadastre_by_address] alt returning {len(objects_list2)} objects')
                            return _make_result(objects_list2, main_cn2, main_addr2)
                except Exception as e2:
                    print(f'[cadastre_by_address] alt error for "{alt_addr}": {e2}')
            break  # пробуем только первый подходящий pattern

    # Стратегия 4: PKK Росреестра по координатам (если есть hint_lat/hint_lon)
    if hint_lat and hint_lon:
        try:
            import ssl
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            pkk_url = f'https://pkk.rosreestr.ru/api/features/1?text={hint_lat}%2C{hint_lon}&tolerance=50&limit=5&srs=4326'
            req_pkk = urllib.request.Request(pkk_url, headers={
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://pkk.rosreestr.ru/',
            })
            with urllib.request.urlopen(req_pkk, timeout=10, context=ctx) as resp_pkk:
                pkk_data = json.loads(resp_pkk.read().decode('utf-8'))
            features = pkk_data.get('features') or []
            print(f'[cadastre_by_address] PKK by coords features={len(features)}')
            if features:
                cn_pkk = features[0].get('attrs', {}).get('cn') or features[0].get('id', '')
                addr_pkk = features[0].get('attrs', {}).get('address', '')
                if cn_pkk:
                    return _make_result(
                        [{'cadastral_number': cn_pkk, 'address': addr_pkk, 'type': 'Здание', 'area': ''}],
                        cn_pkk, addr_pkk
                    )
        except Exception as e_pkk:
            print(f'[cadastre_by_address] PKK coords error: {e_pkk}')

    print(f'[cadastre_by_address] not found for: {query}')
    return _ok({'found': False})


# ── action=by_cadastre ────────────────────────────────────────────────────────

def _yandex_geocode_cadastre(cn: str, api_key: str) -> dict:
    """
    Геокодирование кадастрового номера через Яндекс HTTP Geocoder API.
    Яндекс поддерживает кадастровые номера как поисковый запрос.
    Возвращает { lat, lon, address, district } или {}.
    """
    import urllib.parse as _up
    if not api_key:
        return {}
    try:
        url = (
            f'https://geocode-maps.yandex.ru/1.x/'
            f'?apikey={api_key}'
            f'&geocode={_up.quote(cn)}'
            f'&format=json&results=1&lang=ru_RU'
        )
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        members = (
            data.get('response', {})
                .get('GeoObjectCollection', {})
                .get('featureMember', [])
        )
        if not members:
            return {}

        geo = members[0].get('GeoObject', {})
        pos = geo.get('Point', {}).get('pos', '')
        if not pos:
            return {}

        lon_str, lat_str = pos.split()
        lat = float(lat_str)
        lon = float(lon_str)

        # Адрес
        meta = geo.get('metaDataProperty', {}).get('GeocoderMetaData', {})
        address_str = meta.get('text') or geo.get('name') or geo.get('description') or ''
        for prefix in ['Россия, ', 'Краснодарский край, ']:
            if address_str.startswith(prefix):
                address_str = address_str[len(prefix):]

        # Район из компонентов
        district = ''
        comps = meta.get('Address', {}).get('Components', [])
        dists = [c['name'] for c in comps if c.get('kind') == 'district']
        district = (
            next((n for n in dists if re.search(r'микрорайон|мкр|квартал|жилмассив', n, re.I)), None)
            or (dists[-1] if dists else '')
        )

        return {
            'lat': round(lat, 7),
            'lon': round(lon, 7),
            'address': address_str,
            'district': district,
        }
    except Exception as e:
        print(f'[yandex_geocode_cadastre] error cn={cn}: {e}')
        return {}


def _handle_by_cadastre(event: dict) -> dict:
    """
    Поиск объекта по кадастровому номеру.
    Стратегия:
      1. Яндекс HTTP Geocoder (с ключом) — поддерживает кадастровые номера напрямую
      2. PKK Росреестра как fallback (если Яндекс не нашёл)
    GET ?query=<кадастровый_номер>
    → { address, lat, lon, district, cadastral_number, object_type, status, ... }
    """
    params = event.get('queryStringParameters') or {}
    query = (params.get('query') or '').strip()
    if not query:
        return _err('query обязателен', 400)

    api_key = os.environ.get('DADATA_API_KEY', '')
    secret_key = os.environ.get('DADATA_SECRET_KEY', '')

    # Стратегия 1: DaData suggest — кадастровый номер как поисковый запрос адреса.
    # DaData возвращает адрес и координаты если номер есть в базе ФИАС/ПКК.
    try:
        payload = json.dumps({'query': query, 'count': 1}).encode('utf-8')
        req = urllib.request.Request(
            'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
            data=payload,
            headers={'Content-Type': 'application/json', 'Accept': 'application/json',
                     'Authorization': f'Token {api_key}', 'X-Secret': secret_key},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            d = json.loads(resp.read().decode('utf-8'))
        sugg = d.get('suggestions', [])
        if sugg:
            s = sugg[0]
            sd = s.get('data', {}) or {}
            lat = float(sd['geo_lat']) if sd.get('geo_lat') else None
            lon = float(sd['geo_lon']) if sd.get('geo_lon') else None
            addr = s.get('value') or ''
            for prefix in ['Россия, ', 'Краснодарский край, ']:
                if addr.startswith(prefix):
                    addr = addr[len(prefix):]
            district = sd.get('city_district') or sd.get('settlement') or ''
            fias_level = sd.get('fias_level', '')
            level_labels = {'8': 'Здание', '9': 'Помещение', '7': 'Земельный участок', '6': 'Строение'}
            object_type = level_labels.get(str(fias_level), '')

            # Кадастровые номера связанных объектов
            house_cadnum = sd.get('house_cadnum') or ''
            flat_cadnum  = sd.get('flat_cadnum')  or ''
            stead_cadnum = sd.get('stead_cadnum') or ''

            # Площадь помещения (flat_area) — есть для квартир/помещений
            area_sqm = None
            raw_area = sd.get('flat_area')
            if raw_area:
                try: area_sqm = float(str(raw_area).replace(',', '.'))
                except (ValueError, TypeError): pass

            # Этаж помещения
            floor = None
            if sd.get('floor'):
                try: floor = int(sd['floor'])
                except (ValueError, TypeError): pass

            # Кол-во квартир/помещений в здании
            flat_count = None
            if sd.get('house_flat_count'):
                try: flat_count = int(sd['house_flat_count'])
                except (ValueError, TypeError): pass

            # Цена м² по рынку
            sqm_price = None
            if sd.get('square_meter_price'):
                try: sqm_price = int(sd['square_meter_price'])
                except (ValueError, TypeError): pass

            # Почтовый индекс и округ
            postal_code = sd.get('postal_code') or ''
            city_district = sd.get('city_district_with_type') or sd.get('city_district') or ''

            if lat and lon:
                return _ok({
                    'found': True,
                    'cadastral_number': query,
                    'house_cadnum': house_cadnum,
                    'flat_cadnum': flat_cadnum,
                    'stead_cadnum': stead_cadnum,
                    'address': addr,
                    'lat': lat,
                    'lon': lon,
                    'district': district,
                    'city_district': city_district,
                    'postal_code': postal_code,
                    'object_type': object_type,
                    'area_sqm': area_sqm,
                    'floor': floor,
                    'flat_count': flat_count,
                    'sqm_price': sqm_price,
                    'floors': None,
                    'year_built': None,
                    'status': '',
                    'source': 'dadata_suggest',
                })
    except Exception as e:
        print(f'[by_cadastre] DaData error: {e}')

    # Стратегия 2: ЕГРН API details_by_number → адрес → геокодируем через DaData
    egrn_key = os.environ.get('EGRN_API_KEY', '')
    if egrn_key:
        try:
            egrn_url = f'https://service.api-assist.com/parser/egrn_api/details_by_number?key={egrn_key}&cadNumber={urllib.parse.quote(query)}'
            req3 = urllib.request.Request(egrn_url, headers={'Accept': 'application/json'})
            with urllib.request.urlopen(req3, timeout=15) as resp3:
                egrn_det = json.loads(resp3.read().decode('utf-8'))
            print(f'[by_cadastre] EGRN details success={egrn_det.get("success")}')
            if egrn_det.get('success') == 1 and egrn_det.get('records'):
                rec = egrn_det['records'][0]
                egrn_addr = rec.get('address', '')
                # Геокодируем адрес через DaData для получения координат
                geo_lat, geo_lon = None, None
                if egrn_addr and api_key:
                    try:
                        payload2 = json.dumps({'query': egrn_addr, 'count': 1}).encode('utf-8')
                        req4 = urllib.request.Request(
                            'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
                            data=payload2,
                            headers={'Content-Type': 'application/json', 'Accept': 'application/json',
                                     'Authorization': f'Token {api_key}', 'X-Secret': secret_key},
                            method='POST',
                        )
                        with urllib.request.urlopen(req4, timeout=8) as resp4:
                            dd = json.loads(resp4.read().decode('utf-8'))
                        sugg2 = dd.get('suggestions', [])
                        if sugg2:
                            sd2 = sugg2[0].get('data', {})
                            geo_lat = float(sd2['geo_lat']) if sd2.get('geo_lat') else None
                            geo_lon = float(sd2['geo_lon']) if sd2.get('geo_lon') else None
                    except Exception as e:
                        print(f'[by_cadastre] DaData geocode error: {e}')

                area_sqm = None
                try:
                    if rec.get('area'): area_sqm = float(rec['area'])
                except (ValueError, TypeError): pass

                return _ok({
                    'found': True,
                    'cadastral_number': query,
                    'address': egrn_addr,
                    'lat': geo_lat,
                    'lon': geo_lon,
                    'district': '',
                    'object_type': rec.get('type', ''),
                    'area_sqm': area_sqm,
                    'floor': rec.get('floor'),
                    'status': rec.get('status', ''),
                    'source': 'egrn_details',
                })
        except Exception as e:
            print(f'[by_cadastre] EGRN details error: {e}')

    return _ok({'found': False, 'cadastral_number': query})


# ── EGRN (перенесено из функции egrn) ────────────────────────────────────────

_EGRN_BASE = 'https://service.api-assist.com'


def _handle_egrn(params: dict) -> dict:
    """ЕГРН API: данные объекта (action=egrn_details) и лимиты (action=egrn_stat)."""
    api_key = os.environ.get('EGRN_API_KEY', '')
    if not api_key:
        return _err('EGRN_API_KEY не настроен', 500)

    action = params.get('action', '')

    if action == 'egrn_stat':
        req = urllib.request.Request(
            f'{_EGRN_BASE}/stat/?key={api_key}',
            headers={'Accept': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode())
        stat = next((s for s in data if s.get('service') == 'egrn'), data[0] if data else {})
        return _ok({
            'day_used': stat.get('day_request_count', 0),
            'day_limit': stat.get('day_limit', 0),
            'month_used': stat.get('month_request_count', 0),
            'month_limit': stat.get('month_limit', 0),
            'paid_till': stat.get('paid_till', ''),
        })

    # action=egrn_details
    cad_number = params.get('cadNumber', '').strip()
    if not cad_number:
        return _err('Укажите cadNumber')
    url = f'{_EGRN_BASE}/parser/egrn_api/details_by_number?key={api_key}&cadNumber={urllib.parse.quote(cad_number)}'
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read().decode())
    if not data.get('success'):
        return _ok({'success': 0, 'message': 'Объект не найден или данные временно недоступны'})
    records = data.get('records', [])
    if not records:
        return _ok({'success': 0, 'message': 'Нет данных по объекту'})
    rec = records[0]
    return _ok({
        'success': 1,
        'type': rec.get('type', ''),
        'status': rec.get('status', ''),
        'ownership': rec.get('ownership', ''),
        'cad_number': rec.get('cad_number', ''),
        'cad_quarter': rec.get('cad_quarter', ''),
        'area': rec.get('area', ''),
        'floor': rec.get('floor', ''),
        'address': rec.get('address', ''),
        'purpose': rec.get('purpose', ''),
        'reg_date': rec.get('reg_date', ''),
        'cad_cost': rec.get('cad_cost', ''),
        'cad_cost_det_date': rec.get('cad_cost_det_date', ''),
        'encumbrances': rec.get('encumbrances', []),
        'rights': rec.get('rights', []),
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

    # Кадастровые запросы не требуют БД — обрабатываем отдельно
    if action == 'cadastre_by_address':
        return _handle_cadastre_by_address(event)
    if action == 'by_cadastre':
        return _handle_by_cadastre(event)

    # EGRN API (перенесено из функции egrn) — без БД
    if action in ('egrn_details', 'egrn_stat'):
        return _handle_egrn(params)

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
            elif action == 'geo_quota':
                return _handle_geo_quota(body, cur, conn)
            else:
                return _err(f'Неизвестный action: {action}. Доступные: suggest, fix, normalize, audit, parse_osm, overpass_streets, ai_map_streets, geo_okrug, geo_quota, cadastre_by_address, by_cadastre')
    finally:
        conn.close()