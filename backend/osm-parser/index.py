"""
Одноразовый парсер OSM PBF файла.
Скачивает PBF по URL, разбирает структуру через osmium/pyosmium,
извлекает улицы (highway + name) и районы (place=suburb/neighbourhood).
Возвращает списки для сравнения с street_district_map.
"""
import json
import os
import struct
import urllib.request
import io
import zlib

CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'}


def _ok(body):
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(body, ensure_ascii=False, default=str)}


def _err(code, msg):
    return _ok({'error': msg})


# ── OSM PBF парсер (без внешних зависимостей, только stdlib) ─────────────────

def _read_varint(data, pos):
    result, shift = 0, 0
    while True:
        b = data[pos]; pos += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80):
            return result, pos
        shift += 7


def _read_pbf_message(data, pos, end):
    """Читает поля protobuf сообщения, возвращает dict {field_num: [values]}."""
    fields = {}
    while pos < end:
        tag, pos = _read_varint(data, pos)
        field_num = tag >> 3
        wire_type = tag & 0x07
        if wire_type == 0:  # varint
            val, pos = _read_varint(data, pos)
            fields.setdefault(field_num, []).append(val)
        elif wire_type == 1:  # 64-bit
            val = struct.unpack_from('<Q', data, pos)[0]; pos += 8
            fields.setdefault(field_num, []).append(val)
        elif wire_type == 2:  # length-delimited
            length, pos = _read_varint(data, pos)
            val = data[pos:pos + length]; pos += length
            fields.setdefault(field_num, []).append(val)
        elif wire_type == 5:  # 32-bit
            val = struct.unpack_from('<I', data, pos)[0]; pos += 4
            fields.setdefault(field_num, []).append(val)
        else:
            break
    return fields


def _parse_stringtable(data):
    """Парсит StringTable из OSM PBF блока."""
    strings = []
    pos, end = 0, len(data)
    while pos < end:
        tag, pos = _read_varint(data, pos)
        field_num = tag >> 3
        wire_type = tag & 0x07
        if wire_type == 2:
            length, pos = _read_varint(data, pos)
            val = data[pos:pos + length]; pos += length
            if field_num == 1:  # s field
                strings.append(val.decode('utf-8', errors='replace'))
        elif wire_type == 0:
            _, pos = _read_varint(data, pos)
        elif wire_type == 1:
            pos += 8
        elif wire_type == 5:
            pos += 4
        else:
            break
    return strings


def _parse_dense_nodes(data, strings):
    """Парсит DenseNodes — возвращает список тегов узлов."""
    fields = _read_pbf_message(data, 0, len(data))
    # keys_vals — field 10, чередующиеся индексы ключей и значений (0 = разделитель)
    keys_vals = list(fields.get(10, [b''])[0]) if fields.get(10) else []
    if isinstance(keys_vals, (bytes, bytearray)):
        # packed varint
        kv = []
        pos = 0
        while pos < len(keys_vals):
            v, pos = _read_varint(keys_vals, pos)
            kv.append(v)
        keys_vals = kv

    nodes_tags = []
    cur_tags = {}
    i = 0
    while i < len(keys_vals):
        k = keys_vals[i]
        if k == 0:
            nodes_tags.append(cur_tags)
            cur_tags = {}
        else:
            if i + 1 < len(keys_vals):
                v = keys_vals[i + 1]
                key_str = strings[k] if k < len(strings) else ''
                val_str = strings[v] if v < len(strings) else ''
                cur_tags[key_str] = val_str
                i += 1
        i += 1
    if cur_tags:
        nodes_tags.append(cur_tags)
    return nodes_tags


def _parse_primitive_group(data, strings):
    """Парсит PrimitiveGroup — извлекает имена улиц и районов."""
    fields = _read_pbf_message(data, 0, len(data))
    streets = set()
    places = {}

    # Ways (field 3)
    for way_data in fields.get(3, []):
        wf = _read_pbf_message(way_data, 0, len(way_data))
        # tags: keys (field 2), vals (field 3) — packed varint
        keys_raw = wf.get(2, [b''])[0] if wf.get(2) else b''
        vals_raw = wf.get(3, [b''])[0] if wf.get(3) else b''

        def unpack_packed(raw):
            if not raw:
                return []
            if isinstance(raw, int):
                return [raw]
            result, pos = [], 0
            while pos < len(raw):
                v, pos = _read_varint(raw, pos)
                result.append(v)
            return result

        keys = unpack_packed(keys_raw)
        vals = unpack_packed(vals_raw)

        tags = {}
        for k, v in zip(keys, vals):
            ks = strings[k] if k < len(strings) else ''
            vs = strings[v] if v < len(strings) else ''
            tags[ks] = vs

        highway = tags.get('highway', '')
        name = tags.get('name', '')
        if highway and name and highway in (
            'residential', 'primary', 'secondary', 'tertiary',
            'unclassified', 'service', 'living_street', 'trunk', 'motorway'
        ):
            # Извлекаем базовое название (убираем тип улицы)
            clean = name
            for suffix in [' улица', ' проспект', ' переулок', ' бульвар',
                           ' шоссе', ' проезд', ' аллея', ' набережная',
                           ' тупик', ' площадь', ' квартал']:
                if clean.lower().endswith(suffix):
                    clean = clean[:len(clean) - len(suffix)].strip()
            streets.add(name)  # полное название

    # Relations / Nodes для place=suburb, neighbourhood
    for node_data in fields.get(1, []):  # nodes
        nf = _read_pbf_message(node_data, 0, len(node_data))
        keys_raw = nf.get(2, [b''])[0] if nf.get(2) else b''
        vals_raw = nf.get(3, [b''])[0] if nf.get(3) else b''

        def unpack2(raw):
            if not raw: return []
            if isinstance(raw, int): return [raw]
            r, pos = [], 0
            while pos < len(raw):
                v, pos = _read_varint(raw, pos)
                r.append(v)
            return r

        keys = unpack2(keys_raw)
        vals = unpack2(vals_raw)
        tags = {strings[k] if k < len(strings) else '': strings[v] if v < len(strings) else ''
                for k, v in zip(keys, vals)}
        place = tags.get('place', '')
        name = tags.get('name', '')
        if place in ('suburb', 'neighbourhood', 'quarter') and name:
            places[name] = place

    return streets, places


def parse_osm_pbf(data: bytes):
    """
    Полный парсер OSM PBF бинарного формата.
    Возвращает (streets: set, places: dict).
    """
    all_streets = set()
    all_places = {}
    pos = 0

    while pos < len(data):
        if pos + 4 > len(data):
            break

        # BlobHeader length (big-endian int32)
        header_len = struct.unpack('>I', data[pos:pos + 4])[0]
        pos += 4

        if pos + header_len > len(data):
            break

        # BlobHeader
        header_data = data[pos:pos + header_len]
        pos += header_len

        hf = _read_pbf_message(header_data, 0, len(header_data))
        blob_type = hf.get(1, [b''])[0]
        if isinstance(blob_type, bytes):
            blob_type = blob_type.decode('utf-8', errors='replace')
        blob_size = hf.get(3, [0])[0]
        if isinstance(blob_size, list):
            blob_size = blob_size[0] if blob_size else 0

        if pos + blob_size > len(data):
            break

        # Blob
        blob_data = data[pos:pos + blob_size]
        pos += blob_size

        if blob_type != 'OSMData':
            continue

        # Распаковываем blob
        bf = _read_pbf_message(blob_data, 0, len(blob_data))
        if bf.get(3):  # zlib_data
            raw = zlib.decompress(bf[3][0])
        elif bf.get(1):  # raw
            raw = bf[1][0]
        else:
            continue

        # PrimitiveBlock
        pb = _read_pbf_message(raw, 0, len(raw))

        # StringTable (field 1)
        st_data = pb.get(1, [b''])[0]
        strings = _parse_stringtable(st_data) if st_data else []

        # PrimitiveGroup (field 2)
        for pg_data in pb.get(2, []):
            streets, places = _parse_primitive_group(pg_data, strings)
            all_streets.update(streets)
            all_places.update(places)

    return all_streets, all_places


def handler(event: dict, context) -> dict:
    """Парсит OSM PBF файл и возвращает улицы и районы для сравнения с БД."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err(400, 'Invalid JSON')

    pbf_url = body.get('url', '').strip()
    if not pbf_url:
        return _err(400, 'url обязателен')

    # Скачиваем PBF
    try:
        req = urllib.request.Request(pbf_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as resp:
            pbf_data = resp.read()
        print(f'[osm-parser] скачано {len(pbf_data)} байт')
    except Exception as e:
        return _err(502, f'Ошибка скачивания: {str(e)[:200]}')

    # Парсим
    try:
        streets, places = parse_osm_pbf(pbf_data)
        print(f'[osm-parser] улиц: {len(streets)}, районов: {len(places)}')
    except Exception as e:
        return _err(500, f'Ошибка парсинга: {str(e)[:200]}')

    # Загружаем нашу базу из БД для сравнения
    import psycopg2
    from psycopg2.extras import RealDictCursor
    SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')

    try:
        with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"SELECT DISTINCT street_pattern FROM {SCHEMA}.street_district_map ORDER BY street_pattern")
                our_streets = {r['street_pattern'] for r in cur.fetchall()}
                cur.execute(f"SELECT name FROM {SCHEMA}.districts WHERE is_active = TRUE ORDER BY name")
                our_districts = {r['name'] for r in cur.fetchall()}
    except Exception as e:
        return _err(500, f'Ошибка БД: {str(e)[:200]}')

    # Анализ: улицы из OSM которых нет в нашем справочнике
    osm_streets_sorted = sorted(streets)
    osm_places_sorted = sorted(places.keys())

    # Нормализуем для сравнения
    def normalize(s):
        s = s.lower().strip()
        for suf in [' улица', ' проспект', ' переулок', ' бульвар', ' шоссе',
                    ' проезд', ' аллея', ' набережная', ' тупик', ' площадь']:
            if s.endswith(suf):
                s = s[:len(s)-len(suf)].strip()
        return s

    our_norm = {normalize(s): s for s in our_streets}
    missing_streets = []
    for s in osm_streets_sorted:
        n = normalize(s)
        if n and n not in our_norm and len(n) > 3:
            missing_streets.append(s)

    our_dist_norm = {d.lower(): d for d in our_districts}
    missing_places = []
    for p in osm_places_sorted:
        if p.lower() not in our_dist_norm:
            missing_places.append({'name': p, 'type': places[p]})

    return _ok({
        'osm_streets_count': len(streets),
        'osm_places_count': len(places),
        'our_streets_count': len(our_streets),
        'our_districts_count': len(our_districts),
        'streets_missing_in_our_db': missing_streets[:200],
        'places_missing_in_our_db': missing_places[:100],
        'osm_places_all': osm_places_sorted[:200],
        'file_size_mb': round(len(pbf_data) / 1024 / 1024, 2),
    })
