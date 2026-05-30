"""
Инвестиционная NOI-модель.
YandexGPT оценивает рыночные бенчмарки (ставка аренды, вакантность, OPEX, налог,
рыночный cap rate, индексация) по характеристикам объекта.
Считаем NOI, Cap Rate, NPV(10 лет), IRR, payback с учётом кредитного рычага
и 4 сценария «Что-если».
"""

import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL_NAME = 'yandexgpt/rc'
CACHE_TTL_DAYS = 7

DEAL_RU = {'sale': 'продажа', 'rent': 'аренда', 'business': 'готовый бизнес'}
CONDITION_RU = {
    'new': 'новое', 'euro': 'евроремонт', 'good': 'хорошее', 'cosmetic': 'косметика',
    'rough': 'черновая отделка', 'shellcore': 'shell & core',
}
FINISHING_RU = {
    'none': 'без отделки', 'rough': 'черновая', 'pre_finish': 'предчистовая',
    'cosmetic': 'косметический ремонт', 'euro': 'евроремонт', 'designer': 'дизайнерский',
}
PARKING_RU = {'none': 'нет', 'street': 'на улице', 'building': 'в здании'}
ROAD_LINE_RU = {
    '1': 'первая линия (фасад на дорогу)', '2': 'вторая линия',
    '3': 'третья линия и дальше', 'yard': 'во дворе',
}
TYPE_RU = {
    'office': 'офис', 'retail': 'торговое помещение', 'warehouse': 'склад',
    'restaurant': 'кафе/ресторан', 'hotel': 'гостиница', 'business': 'готовый бизнес',
    'gab': 'готовый арендный бизнес', 'production': 'производство',
    'land': 'земельный участок', 'building': 'здание', 'free_purpose': 'свободного назначения',
    'car_service': 'автосервис',
}

SYSTEM_PROMPT = (
    'Ты — аналитик коммерческой недвижимости в Краснодаре. '
    'По характеристикам объекта оцени реалистичные рыночные бенчмарки '
    'на основе текущих ставок Краснодара (источники: krasnodar.restate.ru, CIAN, Avito, '
    'отчёты CBRE, NF Group, IBC Real Estate по сегменту).\n'
    'Верни СТРОГО JSON одной строкой без markdown и комментариев:\n'
    '{"rent_rate":<число ₽/м²/мес>,"vacancy_pct":<0-30>,"opex_per_m2":<число ₽/м²/мес>,'
    '"property_tax_pct":<0.1-2.5>,"market_cap_rate_pct":<6-15>,"avg_indexation_pct":<3-12>,'
    '"comment":"<краткий комментарий, 1 предложение>"}\n'
    'rent_rate — типичная ставка аренды ₽ за м² в месяц для этого сегмента и состояния.\n'
    'vacancy_pct — нормативная вакантность по сегменту (офис ~10%, склад ~5%, ритейл ~7%).\n'
    'opex_per_m2 — операционные расходы (УК, ремонт, страховка) ₽/м²/мес.\n'
    'property_tax_pct — налог на имущество (% от стоимости в год, обычно 1.6-2.2% для коммерции).\n'
    'market_cap_rate_pct — рыночная ставка капитализации по сегменту (офис 9-11%, склад 11-13%).\n'
    'avg_indexation_pct — средняя индексация арендной ставки в год.'
)


def _load_keys(cur):
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if not row:
            return None, None
        return row.get('yandex_api_key'), row.get('yandex_folder_id')
    except Exception:
        return None, None


def _fallback_benchmarks(listing: dict) -> dict:
    type_key = (listing.get('type') or 'office').lower()
    defaults = {
        'office':     {'rent_rate': 900,  'vacancy_pct': 10, 'opex_per_m2': 180, 'market_cap_rate_pct': 10.0, 'avg_indexation_pct': 7},
        'retail':     {'rent_rate': 1500, 'vacancy_pct': 7,  'opex_per_m2': 220, 'market_cap_rate_pct': 9.5,  'avg_indexation_pct': 7},
        'warehouse':  {'rent_rate': 550,  'vacancy_pct': 5,  'opex_per_m2': 90,  'market_cap_rate_pct': 12.0, 'avg_indexation_pct': 8},
        'restaurant': {'rent_rate': 1800, 'vacancy_pct': 8,  'opex_per_m2': 250, 'market_cap_rate_pct': 11.0, 'avg_indexation_pct': 7},
        'hotel':      {'rent_rate': 2000, 'vacancy_pct': 25, 'opex_per_m2': 400, 'market_cap_rate_pct': 11.5, 'avg_indexation_pct': 6},
        'gab':        {'rent_rate': 1100, 'vacancy_pct': 5,  'opex_per_m2': 150, 'market_cap_rate_pct': 10.0, 'avg_indexation_pct': 7},
        'business':   {'rent_rate': 1300, 'vacancy_pct': 8,  'opex_per_m2': 200, 'market_cap_rate_pct': 11.0, 'avg_indexation_pct': 7},
        'production': {'rent_rate': 450,  'vacancy_pct': 6,  'opex_per_m2': 80,  'market_cap_rate_pct': 12.5, 'avg_indexation_pct': 7},
    }
    base = defaults.get(type_key, defaults['office'])
    return {
        'rent_rate': base['rent_rate'],
        'vacancy_pct': base['vacancy_pct'],
        'opex_per_m2': base['opex_per_m2'],
        'property_tax_pct': 1.8,
        'market_cap_rate_pct': base['market_cap_rate_pct'],
        'avg_indexation_pct': base['avg_indexation_pct'],
        'comment': 'Оценка по средним данным сегмента (YandexGPT недоступен).',
        'source': 'fallback',
    }


def _clamp(v, lo, hi, default):
    try:
        n = float(v)
        if n != n:
            return default
        return max(lo, min(hi, n))
    except Exception:
        return default


def _normalize_benchmarks(raw: dict, listing: dict) -> dict:
    fallback = _fallback_benchmarks(listing)
    return {
        'rent_rate':         _clamp(raw.get('rent_rate'),        50,   10000, fallback['rent_rate']),
        'vacancy_pct':       _clamp(raw.get('vacancy_pct'),       0,   40,    fallback['vacancy_pct']),
        'opex_per_m2':       _clamp(raw.get('opex_per_m2'),       0,   2000,  fallback['opex_per_m2']),
        'property_tax_pct':  _clamp(raw.get('property_tax_pct'),  0,   5,     fallback['property_tax_pct']),
        'market_cap_rate_pct': _clamp(raw.get('market_cap_rate_pct'), 3, 20,  fallback['market_cap_rate_pct']),
        'avg_indexation_pct':  _clamp(raw.get('avg_indexation_pct'),  0, 20,   fallback['avg_indexation_pct']),
        'comment': str(raw.get('comment') or '')[:300] or fallback['comment'],
        'source': 'yandex_gpt',
    }


def _real_rent_benchmarks(listing: dict) -> dict:
    """
    Если объект уже сдан (есть monthly_rent) — строим бенчмарки из реальных данных.
    Ставка аренды берётся из факта, вакантность = 0 (объект занят), OPEX и налог — нормативные.
    """
    area = float(listing.get('area') or 1)
    monthly_rent = float(listing.get('monthly_rent') or 0)
    yearly_rent = float(listing.get('yearly_rent') or 0)

    # Если есть годовая — используем её, иначе monthly × 12
    annual = yearly_rent if yearly_rent > 0 else monthly_rent * 12
    real_rent_rate = annual / 12 / area if area > 0 else 0

    type_key = (listing.get('type') or 'office').lower()
    fallback = _fallback_benchmarks(listing)

    return {
        'rent_rate': round(real_rent_rate, 2) if real_rent_rate > 0 else fallback['rent_rate'],
        'vacancy_pct': 0,              # объект занят — вакантность = 0
        'opex_per_m2': fallback['opex_per_m2'],
        'property_tax_pct': 1.8,
        'market_cap_rate_pct': fallback['market_cap_rate_pct'],
        'avg_indexation_pct': fallback['avg_indexation_pct'],
        'comment': f"Реальная аренда: {int(annual):,} ₽/год, арендатор: {listing.get('tenant_name') or 'есть'}. OPEX — нормативный.".replace(',', ' '),
        'source': 'real_data',
    }


def _gpt_benchmarks(listing: dict, api_key: str, folder_id: str) -> dict:
    # Если есть реальная аренда — используем факт, ИИ не нужен
    if listing.get('monthly_rent') or listing.get('yearly_rent'):
        return _real_rent_benchmarks(listing)

    if not api_key or not folder_id:
        return _fallback_benchmarks(listing)

    type_key = (listing.get('type') or '').lower()
    deal_key = (listing.get('deal') or '').lower()
    parts = [
        f"Тип: {TYPE_RU.get(type_key, type_key or 'коммерческая недвижимость')}",
        f"Сделка: {DEAL_RU.get(deal_key, deal_key or 'не указано')}",
        f"Площадь: {listing.get('area') or 0} м²",
    ]
    if listing.get('address'):
        parts.append(f"Адрес: {listing['address']}")
    if listing.get('city'):
        parts.append(f"Город: {listing['city']}")
    if listing.get('district'):
        parts.append(f"Район: {listing['district']}")
    if listing.get('floor') and listing.get('total_floors'):
        parts.append(f"Этаж: {listing['floor']} из {listing['total_floors']}")
    elif listing.get('floor'):
        parts.append(f"Этаж: {listing['floor']}")
    if listing.get('total_floors'):
        parts.append(f"Этажность здания: {listing['total_floors']}")
    if listing.get('building_class'):
        parts.append(f"Класс здания: {listing['building_class']}")
    if listing.get('building_year'):
        parts.append(f"Год постройки: {listing['building_year']}")
    if listing.get('condition'):
        label = CONDITION_RU.get(listing['condition'], listing['condition'])
        parts.append(f"Состояние: {label}")
    if listing.get('finishing'):
        label = FINISHING_RU.get(listing['finishing'], listing['finishing'])
        parts.append(f"Отделка: {label}")
    if listing.get('ceiling_height'):
        parts.append(f"Высота потолков: {listing['ceiling_height']} м")
    if listing.get('parking'):
        label = PARKING_RU.get(listing['parking'], listing['parking'])
        parts.append(f"Парковка: {label}")
    if listing.get('road_line'):
        label = ROAD_LINE_RU.get(str(listing['road_line']), listing['road_line'])
        parts.append(f"Линия улицы: {label}")
    if listing.get('rooms'):
        parts.append(f"Помещений/секций: {listing['rooms']}")
    if listing.get('purpose'):
        parts.append(f"Назначение: {listing['purpose']}")
    if listing.get('price'):
        parts.append(f"Цена продажи: {listing['price']:,} ₽".replace(',', ' '))

    user_text = '\n'.join(parts)
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL_NAME}',
        'completionOptions': {'stream': False, 'temperature': 0.2, 'maxTokens': '400'},
        'messages': [
            {'role': 'system', 'text': SYSTEM_PROMPT},
            {'role': 'user', 'text': user_text},
        ],
    }
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
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode())
        alts = (data.get('result') or {}).get('alternatives') or []
        text = ((alts[0].get('message') or {}).get('text') or '').strip() if alts else ''
        if not text:
            return _fallback_benchmarks(listing)
        text = text.replace('```json', '').replace('```', '').strip()
        try:
            parsed = json.loads(text)
        except Exception:
            return _fallback_benchmarks(listing)
        return _normalize_benchmarks(parsed, listing)
    except Exception:
        return _fallback_benchmarks(listing)


def _compute_npv(cash_flows: list, discount_pct: float) -> float:
    r = discount_pct / 100.0
    return sum(cf / ((1 + r) ** i) for i, cf in enumerate(cash_flows))


def _compute_irr(cash_flows: list) -> float:
    if not cash_flows or cash_flows[0] >= 0:
        return 0.0
    lo, hi = -0.49, 2.0
    for _ in range(80):
        mid = (lo + hi) / 2
        npv = sum(cf / ((1 + mid) ** i) for i, cf in enumerate(cash_flows))
        if abs(npv) < 1e-3:
            return mid * 100
        if npv > 0:
            lo = mid
        else:
            hi = mid
    return ((lo + hi) / 2) * 100


def compute_model(listing: dict, bench: dict, params: dict) -> dict:
    """Считает NOI/CapRate/NPV/IRR/payback по бенчмаркам и параметрам."""
    area = float(listing.get('area') or 0) or 1
    price = float(listing.get('price') or 0) or 1

    rent_rate    = float(params.get('rent_rate',    bench['rent_rate']))
    vacancy_pct  = float(params.get('vacancy_pct',  bench['vacancy_pct']))
    opex_per_m2  = float(params.get('opex_per_m2',  bench['opex_per_m2']))
    tax_pct      = float(params.get('property_tax_pct', bench['property_tax_pct']))
    indexation   = float(params.get('avg_indexation_pct', bench['avg_indexation_pct']))

    ltv_pct      = float(params.get('ltv_pct', 0))
    loan_rate    = float(params.get('loan_rate_pct', 18))
    loan_years   = float(params.get('loan_years', 10))

    infra_rent_uplift_pct = float(params.get('infra_rent_uplift_pct', 0))
    infra_year            = int(params.get('infra_year', 0))

    cb_rate      = float(params.get('cb_rate_pct', 21))
    risk_premium = float(params.get('risk_premium_pct', 4))
    discount     = cb_rate + risk_premium

    gpi = rent_rate * 12 * area
    egi = gpi * (1 - vacancy_pct / 100.0)
    opex_total = opex_per_m2 * 12 * area
    tax_total  = price * tax_pct / 100.0
    noi_year1  = egi - opex_total - tax_total

    cap_rate = (noi_year1 / price) * 100.0 if price else 0

    cash_flows = [-price]
    debt_service_annual = 0
    loan_amount = 0
    if ltv_pct > 0:
        loan_amount = price * (ltv_pct / 100.0)
        cash_flows[0] = -(price - loan_amount)
        r = loan_rate / 100.0 / 12
        n = int(loan_years * 12)
        if r > 0 and n > 0:
            monthly = loan_amount * (r * (1 + r) ** n) / ((1 + r) ** n - 1)
        else:
            monthly = loan_amount / max(n, 1)
        debt_service_annual = monthly * 12

    cumulative = cash_flows[0]
    payback_years = None
    yearly_breakdown = []
    for year in range(1, 11):
        index_factor = (1 + indexation / 100.0) ** (year - 1)
        infra_factor = 1.0
        if infra_year and year >= infra_year:
            infra_factor = 1 + infra_rent_uplift_pct / 100.0
        rent_year   = rent_rate * 12 * area * index_factor * infra_factor
        egi_year    = rent_year * (1 - vacancy_pct / 100.0)
        opex_year   = opex_per_m2 * 12 * area * ((1 + 0.5 * indexation / 100.0) ** (year - 1))
        tax_year    = price * tax_pct / 100.0
        noi_year    = egi_year - opex_year - tax_year

        debt_year = debt_service_annual if year <= loan_years else 0
        cash_year = noi_year - debt_year
        cash_flows.append(cash_year)
        cumulative += cash_year
        yearly_breakdown.append({
            'year': year,
            'noi': round(noi_year),
            'debt_service': round(debt_year),
            'cash_flow': round(cash_year),
            'cumulative': round(cumulative),
        })
        if payback_years is None and cumulative >= 0:
            prev_cum = cumulative - cash_year
            if cash_year > 0:
                frac = -prev_cum / cash_year
                payback_years = (year - 1) + max(0, min(1, frac))
            else:
                payback_years = year

    npv = _compute_npv(cash_flows, discount)
    irr = _compute_irr(cash_flows)

    return {
        'noi_year1': round(noi_year1),
        'cap_rate_pct': round(cap_rate, 2),
        'npv_10y': round(npv),
        'irr_pct': round(irr, 2),
        'payback_years': round(payback_years, 1) if payback_years is not None else None,
        'discount_pct': round(discount, 2),
        'loan_amount': round(loan_amount),
        'debt_service_annual': round(debt_service_annual),
        'gpi_year1': round(gpi),
        'egi_year1': round(egi),
        'opex_year1': round(opex_total),
        'tax_year1': round(tax_total),
        'yearly': yearly_breakdown,
    }


def build_scenarios(listing: dict, bench: dict) -> dict:
    """5 предзаготовленных сценариев Что-если для сравнения с базовым."""
    base = compute_model(listing, bench, {})
    cb_high  = compute_model(listing, bench, {'cb_rate_pct': 25})
    cb_low   = compute_model(listing, bench, {'cb_rate_pct': 15})
    metro    = compute_model(listing, bench, {'infra_rent_uplift_pct': 15, 'infra_year': 3})
    leverage = compute_model(listing, bench, {'ltv_pct': 50, 'loan_rate_pct': 22, 'loan_years': 10})
    growth   = compute_model(listing, bench, {'avg_indexation_pct': bench['avg_indexation_pct'] + 3})
    return {
        'base': base,
        'cb_up_4pct':   cb_high,
        'cb_down_6pct': cb_low,
        'metro_open':   metro,
        'leverage_50':  leverage,
        'growth_high':  growth,
    }


def load_cached(cur, listing_id: int):
    try:
        cur.execute(
            f"SELECT benchmarks FROM {SCHEMA}.noi_benchmarks_cache "
            f"WHERE listing_id = %s AND expires_at > NOW()",
            (listing_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        b = row['benchmarks']
        # JSONB может прийти уже как dict, либо как строка
        if isinstance(b, str):
            return json.loads(b)
        return b
    except Exception:
        return None


def save_cache(cur, conn, listing_id: int, benchmarks: dict):
    expires = datetime.now() + timedelta(days=CACHE_TTL_DAYS)
    cur.execute(
        f"INSERT INTO {SCHEMA}.noi_benchmarks_cache (listing_id, benchmarks, expires_at) "
        f"VALUES (%s, %s, %s) "
        f"ON CONFLICT (listing_id) DO UPDATE "
        f"SET benchmarks = EXCLUDED.benchmarks, expires_at = EXCLUDED.expires_at, created_at = NOW()",
        (listing_id, json.dumps(benchmarks, ensure_ascii=False), expires),
    )
    conn.commit()


def load_listing(cur, listing_id: int):
    cur.execute(
        f"SELECT id, title, address, area, price, deal, category, floor, total_floors, rooms, "
        f"condition, purpose, lat, lng, city, district, building_class, building_year, "
        f"finishing, ceiling_height, parking, road_line, monthly_rent, yearly_rent, tenant_name "
        f"FROM {SCHEMA}.listings WHERE id = %s",
        (listing_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    d = dict(row)
    d['type'] = d.get('category')
    return d


def handle_noi_request(cur, conn, qs: dict) -> dict:
    """Обработчик ?action=noi_model&listing_id=...&refresh=0|1"""
    listing_id_raw = qs.get('listing_id') or qs.get('id')
    if not listing_id_raw:
        return {'_status': 400, 'error': 'Не указан listing_id'}
    try:
        listing_id = int(listing_id_raw)
    except Exception:
        return {'_status': 400, 'error': 'listing_id должен быть числом'}

    refresh = qs.get('refresh') in ('1', 'true', 'yes')

    listing = load_listing(cur, listing_id)
    if not listing:
        return {'_status': 404, 'error': 'Объект не найден'}

    bench = None if refresh else load_cached(cur, listing_id)
    if bench is None:
        api_key, folder_id = _load_keys(cur)
        bench = _gpt_benchmarks(listing, api_key, folder_id)
        try:
            save_cache(cur, conn, listing_id, bench)
        except Exception:
            pass

    scenarios = build_scenarios(listing, bench)

    has_real_rent = bool(listing.get('monthly_rent') or listing.get('yearly_rent'))

    return {
        'listing': {
            'id': listing['id'],
            'title': listing.get('title'),
            'area': float(listing.get('area') or 0),
            'price': float(listing.get('price') or 0),
            'type': listing.get('type'),
            'deal': listing.get('deal'),
            'monthly_rent': listing.get('monthly_rent'),
            'yearly_rent': listing.get('yearly_rent'),
            'tenant_name': listing.get('tenant_name'),
            'building_class': listing.get('building_class'),
            'building_year': listing.get('building_year'),
            'total_floors': listing.get('total_floors'),
        },
        'benchmarks': bench,
        'scenarios': scenarios,
        'data_source': 'real_rent' if has_real_rent else bench.get('source', 'fallback'),
    }