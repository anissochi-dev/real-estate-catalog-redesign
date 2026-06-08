"""
Затратный подход к оценке недвижимости.
Все вычисления — чистая математика. YandexGPT только интерпретирует результат
и даёт экспертный комментарий.

Формула: Стоимость = (Стоимость замещения - Накопленный износ) + Стоимость земли
Накопленный износ = Физический + Функциональный + Экономический
"""

import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL = 'yandexgpt-5-pro/latest'
CACHE_TTL_DAYS = 14

# Соответствие класса здания → quality_class для справочника
BUILDING_CLASS_MAP = {
    'A': 'A', 'A+': 'A', 'B': 'B', 'B+': 'B', 'B-': 'B',
    'C': 'C', 'C+': 'C', 'D': 'C',
}

# Индекс-дефлятор для пересчёта старого строительства (упрощённо)
# Если год постройки известен — умножаем стоимость замещения на этот коэффициент,
# т.к. восстановление старого здания обходится дороже (перекладка коммуникаций и т.д.)
def _age_cost_multiplier(building_year: int | None) -> float:
    if not building_year:
        return 1.0
    age = max(0, 2025 - building_year)
    if age <= 5:   return 1.0
    if age <= 15:  return 1.05
    if age <= 25:  return 1.10
    if age <= 40:  return 1.18
    return 1.25

# Физический износ (метод срока жизни)
# Формула: Иф = (Хронологический возраст / Нормативный срок службы) × 100%
NORMATIVE_LIFE = {
    'office': 60, 'retail': 60, 'warehouse': 40, 'restaurant': 50,
    'hotel': 60, 'production': 40, 'free_purpose': 60, 'building': 60,
    'business': 50, 'land': 0,
}
CONDITION_WEAR_OVERRIDE = {
    # Если состояние известно — оно важнее формулы по возрасту
    'new':       0,    # новостройка / после кап. ремонта
    'euro':      5,
    'good':      15,
    'cosmetic':  30,
    'working':   40,
    'rough':     50,
    'shellcore': 45,
    'needs_repair': 60,
    'bad':       75,
}

def _physical_wear_pct(building_year: int | None, condition: str | None, category: str) -> float:
    """Физический износ в процентах (0–80)."""
    if condition and condition in CONDITION_WEAR_OVERRIDE:
        return float(CONDITION_WEAR_OVERRIDE[condition])
    if building_year:
        age = max(0, 2025 - building_year)
        life = NORMATIVE_LIFE.get(category, 60)
        wear = min(age / life, 0.80) * 100
        return round(wear, 1)
    return 20.0  # дефолт при отсутствии данных

# Функциональный износ — устаревание планировки/инженерии
# Определяется классом здания и возрастом (не состоянием)
def _functional_wear_pct(building_year: int | None, building_class: str | None, category: str) -> float:
    if not building_year:
        return 5.0
    age = max(0, 2025 - building_year)
    base = 0.0
    if building_class in ('C', 'D') or (not building_class and age > 30):
        base = 10.0
    elif age > 20:
        base = 5.0
    # Склады и производство стареют функционально быстрее
    if category in ('warehouse', 'production') and age > 15:
        base += 5.0
    return min(base, 25.0)

# Экономический (внешний) износ — влияние района, инфраструктуры
DISTRICT_ECONOMIC_WEAR = {
    'центральный': 0,
    'цмр': 0,
    'фмр': 2,
    'прикубанский': 5,
    'карасунский': 7,
    'восточный': 10,
    'западный': 5,
}

def _economic_wear_pct(district: str | None) -> float:
    if not district:
        return 3.0
    dl = district.lower()
    for key, wear in DISTRICT_ECONOMIC_WEAR.items():
        if key in dl:
            return float(wear)
    return 3.0

# Стоимость земли — упрощённая модель по кадастру/рынку
# Используем price_per_m2 аналогов земельных участков или нормативные ставки
LAND_PRICE_PER_M2_KRD = {
    'центральный': 35000,
    'цмр': 35000,
    'фмр': 22000,
    'прикубанский': 15000,
    'карасунский': 12000,
    'восточный': 10000,
    'западный': 12000,
}

def _land_value(land_area_m2: float | None, district: str | None) -> float:
    """Стоимость земли в рублях."""
    if not land_area_m2 or land_area_m2 <= 0:
        return 0.0
    price_per_m2 = 12000.0  # дефолт
    if district:
        dl = district.lower()
        for key, price in LAND_PRICE_PER_M2_KRD.items():
            if key in dl:
                price_per_m2 = float(price)
                break
    return land_area_m2 * price_per_m2


def _get_construction_cost(cur, category: str, building_class: str | None) -> float | None:
    """Получает стоимость строительства из справочника."""
    qc = BUILDING_CLASS_MAP.get(building_class or 'B', 'B')
    cur.execute(
        f"SELECT cost_per_m2 FROM {SCHEMA}.construction_cost_ref "
        f"WHERE category = %s AND quality_class = %s "
        f"ORDER BY valid_year DESC LIMIT 1",
        (category, qc)
    )
    row = cur.fetchone()
    if row:
        return float(row['cost_per_m2'])
    # Fallback: берём класс B
    cur.execute(
        f"SELECT cost_per_m2 FROM {SCHEMA}.construction_cost_ref "
        f"WHERE category = %s ORDER BY valid_year DESC LIMIT 1",
        (category,)
    )
    row = cur.fetchone()
    return float(row['cost_per_m2']) if row else None


def _gpt_comment(listing: dict, result: dict, api_key: str, folder_id: str) -> str:
    """YandexGPT интерпретирует результаты расчёта — только текст, не цифры."""
    prompt = (
        f"Объект: {listing.get('category','?')}, {listing.get('area','?')} м², "
        f"район {listing.get('district','?')}, год постройки {listing.get('building_year','?')}, "
        f"состояние: {listing.get('condition','?')}.\n"
        f"Затратный подход дал:\n"
        f"- Стоимость замещения: {result['replacement_cost']:,.0f} ₽\n"
        f"- Физический износ: {result['physical_wear_pct']}% ({result['physical_wear_rub']:,.0f} ₽)\n"
        f"- Функциональный износ: {result['functional_wear_pct']}% ({result['functional_wear_rub']:,.0f} ₽)\n"
        f"- Экономический износ: {result['economic_wear_pct']}% ({result['economic_wear_rub']:,.0f} ₽)\n"
        f"- Стоимость земли: {result['land_value']:,.0f} ₽\n"
        f"- Итоговая стоимость: {result['total_value']:,.0f} ₽\n"
        f"- Цена продавца: {listing.get('price',0):,.0f} ₽\n\n"
        f"Дай краткий экспертный комментарий (3–5 предложений): насколько цена продавца "
        f"соответствует затратной стоимости, какие факторы износа существенны, "
        f"есть ли красные флаги. Только текст, без заголовков и списков."
    )
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL}',
        'completionOptions': {'stream': False, 'temperature': 0.3, 'maxTokens': '300'},
        'messages': [
            {'role': 'system', 'text': 'Ты — эксперт-оценщик недвижимости. Отвечай кратко и по делу.'},
            {'role': 'user',   'text': prompt},
        ],
    }
    try:
        req = urllib.request.Request(
            YANDEX_GPT_URL,
            data=json.dumps(payload).encode(),
            headers={
                'Authorization': f'Api-Key {api_key}',
                'Content-Type': 'application/json',
                'x-folder-id': folder_id,
            },
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
        alts = (data.get('result') or {}).get('alternatives') or []
        return ((alts[0].get('message') or {}).get('text') or '').strip() if alts else ''
    except Exception:
        return ''


def handle_cost_approach(event: dict, cur, conn, api_key: str, folder_id: str) -> dict:
    """
    action=cost_approach — затратный подход для объекта.
    GET ?action=cost_approach&id=123  или  POST {action, id}
    Возвращает: replacement_cost, wear_*, land_value, total_value, comment (GPT).
    """
    params = event.get('queryStringParameters') or {}
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    listing_id = int(body.get('id') or params.get('id') or 0)
    if not listing_id:
        return {'statusCode': 400, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'id обязателен'})}

    # Проверяем кеш
    cur.execute(
        f"SELECT result, expires_at FROM {SCHEMA}.cost_approach_cache WHERE listing_id = %s",
        (listing_id,)
    )
    cached = cur.fetchone()
    if cached and cached['expires_at'] > datetime.utcnow():
        return {'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': json.dumps({**cached['result'], 'cached': True}, ensure_ascii=False)}

    # Загружаем объект
    cur.execute(
        f"SELECT id, title, category, deal, price, area, district, condition, "
        f"building_year, building_class, land_area, land_status, land_vri, "
        f"floor, total_floors, ceiling_height, electricity_kw, finishing "
        f"FROM {SCHEMA}.listings WHERE id = %s AND status = 'active'",
        (listing_id,)
    )
    row = cur.fetchone()
    if not row:
        return {'statusCode': 404, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Объект не найден'})}

    listing = dict(row)
    category = listing['category'] or 'free_purpose'
    area = float(listing['area'] or 0)

    if area <= 0:
        return {'statusCode': 400, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Площадь объекта = 0'})}

    # ── 1. Стоимость замещения ──────────────────────────────────────────────
    cost_per_m2 = _get_construction_cost(cur, category, listing.get('building_class'))
    if not cost_per_m2:
        cost_per_m2 = 50000.0  # абсолютный fallback

    age_mult = _age_cost_multiplier(listing.get('building_year'))
    replacement_cost = area * cost_per_m2 * age_mult

    # ── 2. Накопленный износ ────────────────────────────────────────────────
    phys_pct  = _physical_wear_pct(listing.get('building_year'), listing.get('condition'), category)
    func_pct  = _functional_wear_pct(listing.get('building_year'), listing.get('building_class'), category)
    econ_pct  = _economic_wear_pct(listing.get('district'))

    # Совокупный износ — не просто сумма, а последовательное применение
    # Иобщ = 1 - (1 - Иф/100)(1 - Ифун/100)(1 - Иэк/100)
    total_wear_pct = (1 - (1 - phys_pct/100) * (1 - func_pct/100) * (1 - econ_pct/100)) * 100
    total_wear_pct = min(total_wear_pct, 80.0)  # не более 80%

    phys_rub  = replacement_cost * phys_pct / 100
    func_rub  = replacement_cost * (1 - phys_pct/100) * func_pct / 100
    econ_rub  = replacement_cost * (1 - phys_pct/100) * (1 - func_pct/100) * econ_pct / 100
    total_wear_rub = phys_rub + func_rub + econ_rub

    depreciated_cost = replacement_cost - total_wear_rub

    # ── 3. Стоимость земли ──────────────────────────────────────────────────
    land_area_m2 = float(listing.get('land_area') or 0)
    land_value = _land_value(land_area_m2, listing.get('district'))

    # ── 4. Итог ──────────────────────────────────────────────────────────────
    total_value = depreciated_cost + land_value
    price = float(listing.get('price') or 0)
    delta_pct = ((price - total_value) / total_value * 100) if total_value > 0 else None

    if delta_pct is None:
        price_vs_cost = 'нет данных'
    elif delta_pct < -20:
        price_vs_cost = 'значительно ниже затратной стоимости'
    elif delta_pct < -5:
        price_vs_cost = 'ниже затратной стоимости'
    elif delta_pct <= 15:
        price_vs_cost = 'соответствует затратной стоимости'
    elif delta_pct <= 40:
        price_vs_cost = 'выше затратной стоимости'
    else:
        price_vs_cost = 'значительно выше затратной стоимости'

    result = {
        'listing_id': listing_id,
        'method': 'cost_approach',
        # Входные данные
        'area': area,
        'category': category,
        'building_year': listing.get('building_year'),
        'building_class': listing.get('building_class'),
        'condition': listing.get('condition'),
        'district': listing.get('district'),
        'land_area_m2': land_area_m2,
        # Стоимость замещения
        'cost_per_m2_ref': round(cost_per_m2, 0),
        'age_multiplier': round(age_mult, 3),
        'replacement_cost': round(replacement_cost, 0),
        # Износ
        'physical_wear_pct': round(phys_pct, 1),
        'physical_wear_rub': round(phys_rub, 0),
        'functional_wear_pct': round(func_pct, 1),
        'functional_wear_rub': round(func_rub, 0),
        'economic_wear_pct': round(econ_pct, 1),
        'economic_wear_rub': round(econ_rub, 0),
        'total_wear_pct': round(total_wear_pct, 1),
        'total_wear_rub': round(total_wear_rub, 0),
        'depreciated_cost': round(depreciated_cost, 0),
        # Земля
        'land_value': round(land_value, 0),
        # Итог
        'total_value': round(total_value, 0),
        'total_value_per_m2': round(total_value / area, 0) if area else 0,
        # Сравнение с ценой продавца
        'asking_price': price,
        'delta_pct': round(delta_pct, 1) if delta_pct is not None else None,
        'price_vs_cost': price_vs_cost,
        'comment': '',
        'cached': False,
        'calculated_at': datetime.utcnow().isoformat(),
    }

    # ── 5. GPT-комментарий (только текст, цифры уже посчитаны) ─────────────
    result['comment'] = _gpt_comment(listing, result, api_key, folder_id)

    # ── 6. Сохраняем в кеш ──────────────────────────────────────────────────
    expires = datetime.utcnow() + timedelta(days=CACHE_TTL_DAYS)
    cur.execute(
        f"INSERT INTO {SCHEMA}.cost_approach_cache (listing_id, result, expires_at) "
        f"VALUES (%s, %s, %s) "
        f"ON CONFLICT (listing_id) DO UPDATE SET result = EXCLUDED.result, "
        f"created_at = NOW(), expires_at = EXCLUDED.expires_at",
        (listing_id, json.dumps(result, ensure_ascii=False), expires)
    )
    conn.commit()

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(result, ensure_ascii=False),
    }
