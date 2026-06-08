"""
Парсер OSM PBF для Краснодара.
Запуск: python parse_krd.py <путь_к_файлу.pbf>

Результат: krasnodar_streets.csv и krasnodar_places.csv
"""
import sys
import csv
import osmium

PBF_FILE = sys.argv[1] if len(sys.argv) > 1 else "561dc2d2-6146-41b2-93ee-0266b7a55bb5.pbf"

# Bbox Краснодара (lat: 44.95-45.20, lon: 38.85-39.25)
LAT_MIN, LAT_MAX = 44.95, 45.20
LON_MIN, LON_MAX = 38.85, 39.25

HIGHWAY_TYPES = {
    'residential', 'primary', 'secondary', 'tertiary',
    'unclassified', 'service', 'living_street', 'trunk',
    'motorway', 'primary_link', 'secondary_link', 'tertiary_link',
    'pedestrian', 'footway', 'cycleway',
}

PLACE_TYPES = {'suburb', 'neighbourhood', 'quarter', 'village', 'hamlet', 'town', 'city'}

# Наши районы из БД — для сравнения
OUR_DISTRICTS = {
    "40 лет Победы", "9-й километр", "Авиагородок", "Аэропорт",
    "Берёзовый п.", "Вавилова", "Витаминкомбинат", "Восточно-Кругликовский",
    "Гидростроителей (ГМР)", "Горхутор", "Губернский", "Догма парк",
    "Дубинка", "Завод измерительных приборов (ЗИП)",
    "Завод радиоизмерительных приборов (РИП)", "Западный обход",
    "Знаменский", "Индустриальный п.", "Калинина сады",
    "Камвольно-суконный комбинат (КСК)", "Кирпичного завода пос.",
    "Кожевенный завод (Кожзавод)", "Колосистый п.", "Комсомольский (КМР)",
    "Краевая клиническая больница (ККБ)", "Красная площадь",
    "Краснодарский п.", "Лазурный п.", "Ленина хутор", "Любимово",
    "Микрохирургия глаза (МХГ)", "Молодёжный", "Московский", "Музыкальный",
    "Народные кварталы", "Немецкая деревня", "Новознаменский п.",
    "Образцово", "Панорама (Стадион Краснодар)", "Пашковский (ПМР)",
    "Петра-Метальникова", "Плодородный п.", "Победитель п.", "Покровка",
    "Почтовый", "Прогресс п.", "Российский п.", "Россинского",
    "Северный п.", "Сельскохозяйственный институт (СХИ)",
    "Славянский (СМР)", "Солнечный остров", "Табачная фабрика (Табачка)",
    "Теплоэлектростанция (ТЭЦ)", "Фестивальный (ФМР)",
    "Хлопчато-бумажный комбинат (ХБК)", "Центральный (ЦМР)",
    "Черёмушки (ЧМР)", "Школьный (ШМР)", "Энка (Жукова)",
    "Юбилейный (ЮМР)", "Южный п.",
}


class KrasnodarHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.streets = {}     # name -> {'type': hw, 'city': city, 'suburb': suburb, count: N}
        self.places = {}      # name -> type
        self.addr_map = {}    # street -> {suburb: count}

    def _in_krasnodar_bbox(self, location):
        try:
            return (LAT_MIN <= location.lat <= LAT_MAX and
                    LON_MIN <= location.lon <= LON_MAX)
        except Exception:
            return False

    def node(self, n):
        tags = dict(n.tags)
        place = tags.get('place', '')
        name  = tags.get('name', '')

        # Районы/посёлки
        if place in PLACE_TYPES and name:
            isin = (tags.get('is_in', '') + tags.get('is_in:city', '')).lower()
            if place in ('suburb', 'neighbourhood', 'quarter') or 'краснодар' in isin:
                if self._in_krasnodar_bbox(n.location):
                    self.places[name] = place

        # Адреса зданий — маппинг улица → микрорайон
        st = tags.get('addr:street', '')
        sub = tags.get('addr:suburb', '') or tags.get('addr:neighbourhood', '')
        if st and sub:
            if st not in self.addr_map:
                self.addr_map[st] = {}
            self.addr_map[st][sub] = self.addr_map[st].get(sub, 0) + 1

    def way(self, w):
        tags = dict(w.tags)
        hw   = tags.get('highway', '')
        name = tags.get('name', '')
        if hw not in HIGHWAY_TYPES or not name:
            return

        city = (tags.get('addr:city', '') or tags.get('is_in:city', '')).lower()
        if city and 'краснодар' not in city:
            return  # явно другой город

        suburb = tags.get('addr:suburb', '') or tags.get('addr:neighbourhood', '')

        if name not in self.streets:
            self.streets[name] = {'type': hw, 'city': city or '?', 'suburb': suburb, 'count': 0}
        self.streets[name]['count'] += 1
        if suburb and not self.streets[name]['suburb']:
            self.streets[name]['suburb'] = suburb

    def relation(self, r):
        tags = dict(r.tags)
        name  = tags.get('name', '')
        place = tags.get('place', '')
        bnd   = tags.get('boundary', '')
        lvl   = tags.get('admin_level', '')
        if not name:
            return
        if place in PLACE_TYPES or (bnd == 'administrative' and lvl in ('8', '9', '10')):
            isin = (tags.get('is_in', '') + tags.get('is_in:city', '')).lower()
            if place in ('suburb', 'neighbourhood', 'quarter') or 'краснодар' in isin or not isin:
                self.places[name] = place or f"adm{lvl}"


def normalize(name):
    """Убирает тип улицы из названия для сравнения."""
    for suf in [' улица', ' проспект', ' переулок', ' бульвар', ' шоссе',
                ' проезд', ' аллея', ' набережная', ' тупик', ' площадь', ' линия']:
        if name.lower().endswith(suf):
            return name[:len(name)-len(suf)].strip()
    return name.strip()


print(f"Читаю файл: {PBF_FILE}")
print("Это займёт 1-2 минуты...")

h = KrasnodarHandler()
h.apply_file(PBF_FILE, locations=True, idx='flex_mem')

print(f"\nНайдено улиц: {len(h.streets)}")
print(f"Найдено мест/районов: {len(h.places)}")
print(f"Маппингов улица→район (из адресов): {len(h.addr_map)}")

# --- Дополняем suburb из addr_map ---
for st, subs in h.addr_map.items():
    best = max(subs, key=subs.get)
    if st in h.streets and not h.streets[st]['suburb']:
        h.streets[st]['suburb'] = best
    elif st not in h.streets:
        # улица встречается только в адресах зданий
        h.streets[st] = {'type': 'addr_only', 'city': '?', 'suburb': best, 'count': subs[best]}

our_norm = {normalize(d).lower(): d for d in OUR_DISTRICTS}

# --- Сохраняем улицы ---
with open('krasnodar_streets.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['street_full', 'street_base', 'highway_type', 'suburb_osm',
                'in_our_db', 'our_db_match', 'segment_count'])
    for name, info in sorted(h.streets.items()):
        base = normalize(name)
        in_db = base.lower() in our_norm
        db_match = our_norm.get(base.lower(), '')
        w.writerow([name, base, info['type'], info['suburb'],
                    'да' if in_db else 'нет', db_match, info['count']])

print(f"→ krasnodar_streets.csv сохранён ({len(h.streets)} строк)")

# --- Сохраняем места ---
with open('krasnodar_places.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['name', 'type', 'in_our_db', 'our_db_match'])
    for name, ptype in sorted(h.places.items()):
        nl = name.lower()
        in_db = nl in {d.lower() for d in OUR_DISTRICTS}
        db_match = next((d for d in OUR_DISTRICTS if d.lower() == nl), '')
        w.writerow([name, ptype, 'да' if in_db else 'нет', db_match])

print(f"→ krasnodar_places.csv сохранён ({len(h.places)} строк)")

# --- Краткая статистика в консоль ---
missing_streets = [n for n, info in h.streets.items() if normalize(n).lower() not in our_norm]
missing_places  = [n for n in h.places if n.lower() not in {d.lower() for d in OUR_DISTRICTS}]

print(f"\n=== ИТОГ ===")
print(f"Улиц в OSM: {len(h.streets)}, из них НЕТ в нашей БД: {len(missing_streets)}")
print(f"Районов/мест в OSM: {len(h.places)}, из них НЕТ в нашей БД: {len(missing_places)}")
print(f"\nМикрорайоны из OSM которых нет в нашей БД:")
for p in sorted(missing_places)[:50]:
    print(f"  - {p} ({h.places[p]})")

print(f"\nПервые 30 улиц которых нет в БД:")
for s in sorted(missing_streets)[:30]:
    print(f"  - {s}")

print("\nГотово! Открой krasnodar_streets.csv и krasnodar_places.csv в Excel.")
