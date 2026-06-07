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
    """
    Дефолтные бенчмарки по типу объекта. Калиброваны под Краснодар 2025-2026.
    МЕТОДОЛОГИЯ:
    - OPEX: отель/ресторан — только коммунальные расходы и обслуживание здания (не бизнес-расходы).
      При аренде ГАБ арендатор сам несёт бизнес-расходы, собственник платит только за содержание здания.
    - Вакантность: для ГАБ с арендатором — 0-5%, для пустых объектов — рыночная.
    - Налог: дифференцирован по НК РФ и КК.
    - hotel с OPEX 1400 применяется ТОЛЬКО если объект эксплуатируется собственником.
      Если продаётся как ГАБ (есть арендатор) — OPEX ниже (только здание).
    - land: применяется специальная логика апрециации, не аренды.
    """
    type_key = (listing.get('type') or 'office').lower()
    has_tenant = bool(listing.get('monthly_rent') or listing.get('yearly_rent') or listing.get('tenant_name'))

    # Для hotel/restaurant — разделяем OPEX: с арендатором (содержание здания) vs без (операционный бизнес)
    hotel_opex = 350 if has_tenant else 1200   # с ГАБ — только здание; без — бизнес-расходы
    restaurant_opex = 200 if has_tenant else 550

    defaults = {
        # тип: rent_rate ₽/м²/мес, vacancy %, opex ₽/м²/мес, tax % от стоимости, cap rate %, indexation %
        'office':       {'rent_rate': 950,  'vacancy_pct': 10, 'opex_per_m2': 200,          'property_tax_pct': 1.8, 'market_cap_rate_pct': 10.0, 'avg_indexation_pct': 7},
        'retail':       {'rent_rate': 1600, 'vacancy_pct': 7,  'opex_per_m2': 250,          'property_tax_pct': 2.0, 'market_cap_rate_pct': 9.5,  'avg_indexation_pct': 7},
        'warehouse':    {'rent_rate': 600,  'vacancy_pct': 5,  'opex_per_m2': 80,           'property_tax_pct': 1.5, 'market_cap_rate_pct': 12.0, 'avg_indexation_pct': 8},
        'restaurant':   {'rent_rate': 1800, 'vacancy_pct': 10, 'opex_per_m2': restaurant_opex, 'property_tax_pct': 2.0, 'market_cap_rate_pct': 11.0, 'avg_indexation_pct': 7},
        'hotel':        {'rent_rate': 2200, 'vacancy_pct': 25, 'opex_per_m2': hotel_opex,   'property_tax_pct': 2.0, 'market_cap_rate_pct': 11.5, 'avg_indexation_pct': 6},
        'gab':          {'rent_rate': 1200, 'vacancy_pct': 5,  'opex_per_m2': 150,          'property_tax_pct': 1.8, 'market_cap_rate_pct': 10.0, 'avg_indexation_pct': 7},
        'business':     {'rent_rate': 1400, 'vacancy_pct': 8,  'opex_per_m2': 200,          'property_tax_pct': 1.8, 'market_cap_rate_pct': 11.0, 'avg_indexation_pct': 7},
        'production':   {'rent_rate': 500,  'vacancy_pct': 6,  'opex_per_m2': 80,           'property_tax_pct': 1.5, 'market_cap_rate_pct': 12.5, 'avg_indexation_pct': 7},
        'building':     {'rent_rate': 900,  'vacancy_pct': 8,  'opex_per_m2': 160,          'property_tax_pct': 1.8, 'market_cap_rate_pct': 10.5, 'avg_indexation_pct': 7},
        'free_purpose': {'rent_rate': 1050, 'vacancy_pct': 8,  'opex_per_m2': 170,          'property_tax_pct': 1.8, 'market_cap_rate_pct': 10.0, 'avg_indexation_pct': 7},
        'car_service':  {'rent_rate': 700,  'vacancy_pct': 6,  'opex_per_m2': 100,          'property_tax_pct': 1.5, 'market_cap_rate_pct': 12.0, 'avg_indexation_pct': 7},
        'land':         {'rent_rate': 0,    'vacancy_pct': 0,  'opex_per_m2': 5,            'property_tax_pct': 0.3, 'market_cap_rate_pct': 7.0,  'avg_indexation_pct': 8},
    }
    base = defaults.get(type_key, defaults['office'])
    return {
        'rent_rate': base['rent_rate'],
        'vacancy_pct': base['vacancy_pct'],
        'opex_per_m2': base['opex_per_m2'],
        'property_tax_pct': base['property_tax_pct'],
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
    """Нормализуем ответ YandexGPT, fallback по каждому полю отдельно."""
    fallback = _fallback_benchmarks(listing)
    # Если GPT вернул нереалистичный OPEX для отеля/ресторана — принудительно используем fallback
    opex_raw = _clamp(raw.get('opex_per_m2'), 0, 5000, fallback['opex_per_m2'])
    opex_min = fallback['opex_per_m2'] * 0.5  # не даём GPT занизить OPEX более чем вдвое
    opex = max(opex_raw, opex_min)
    return {
        'rent_rate':           _clamp(raw.get('rent_rate'),           50,  15000, fallback['rent_rate']),
        'vacancy_pct':         _clamp(raw.get('vacancy_pct'),          0,   50,   fallback['vacancy_pct']),
        'opex_per_m2':         round(opex, 1),
        'property_tax_pct':    _clamp(raw.get('property_tax_pct'),     0,    5,   fallback['property_tax_pct']),
        'market_cap_rate_pct': _clamp(raw.get('market_cap_rate_pct'),  3,   20,   fallback['market_cap_rate_pct']),
        'avg_indexation_pct':  _clamp(raw.get('avg_indexation_pct'),   0,   20,   fallback['avg_indexation_pct']),
        'comment': str(raw.get('comment') or '')[:300] or fallback['comment'],
        'source': 'yandex_gpt',
    }


def _real_rent_benchmarks(listing: dict) -> dict:
    """
    Если объект уже сдан (есть monthly_rent/yearly_rent) — строим бенчмарки из реальных данных.
    Текущая ставка арендатора используется как rent_rate (факт),
    рыночный потенциал сохраняется в market_rent_rate для справки.
    OPEX и налог берутся из актуальных нормативов по типу объекта.
    """
    area = float(listing.get('area') or 1)
    monthly_rent = float(listing.get('monthly_rent') or 0)
    yearly_rent = float(listing.get('yearly_rent') or 0)

    annual = yearly_rent if yearly_rent > 0 else monthly_rent * 12
    real_rent_rate = round(annual / 12 / area, 2) if area > 0 and annual > 0 else 0

    fallback = _fallback_benchmarks(listing)
    market_rent_rate = fallback['rent_rate']

    # Для ГАБ/отелей с арендатором: если рыночная ставка выше текущей —
    # используем текущую (консервативный сценарий), но фиксируем разрыв.
    rent_rate = real_rent_rate if real_rent_rate > 0 else market_rent_rate
    upside = round((market_rent_rate / rent_rate - 1) * 100, 1) if rent_rate > 0 and market_rent_rate > rent_rate else 0

    tenant = listing.get('tenant_name') or 'есть'
    upside_note = f' Рыночный потенциал +{upside}% при смене арендатора.' if upside > 5 else ''
    comment = (
        f"Реальная аренда: {int(annual):,} ₽/год, арендатор: {tenant}. "
        f"OPEX — нормативный.{upside_note}"
    ).replace(',', ' ')

    return {
        'rent_rate': rent_rate,
        'market_rent_rate': market_rent_rate,  # рыночный потенциал
        'actual_rent_rate': real_rent_rate,     # факт текущего арендатора
        'vacancy_pct': 0,
        'opex_per_m2': fallback['opex_per_m2'],
        'property_tax_pct': fallback['property_tax_pct'],
        'market_cap_rate_pct': fallback['market_cap_rate_pct'],
        'avg_indexation_pct': fallback['avg_indexation_pct'],
        'comment': comment[:400],
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
    """
    Считает NOI/CapRate/NPV(с Terminal Value)/IRR/payback по бенчмаркам и параметрам.
    Terminal Value = NOI года 10 / market_cap_rate (метод прямой капитализации / гордоновская реверсия).
    NPV включает TV — это стандарт DCF-оценки недвижимости.

    Для land: особый режим — доход только от апрециации (рост цены), не от аренды.
    Terminal Value = price × (1 + indexation/100)^10 — оцениваем рост цены земли.
    """
    area = float(listing.get('area') or 0) or 1
    price = float(listing.get('price') or 0) or 1
    is_land = (listing.get('type') or listing.get('category') or '').lower() == 'land'

    rent_rate    = float(params.get('rent_rate',    bench['rent_rate']))
    vacancy_pct  = float(params.get('vacancy_pct',  bench['vacancy_pct']))
    opex_per_m2  = float(params.get('opex_per_m2',  bench['opex_per_m2']))
    tax_pct      = float(params.get('property_tax_pct', bench['property_tax_pct']))
    indexation   = float(params.get('avg_indexation_pct', bench['avg_indexation_pct']))
    market_cap   = float(bench.get('market_cap_rate_pct', 10.0))

    ltv_pct      = float(params.get('ltv_pct', 0))
    loan_rate    = float(params.get('loan_rate_pct', 18))
    loan_years   = float(params.get('loan_years', 10))

    infra_rent_uplift_pct = float(params.get('infra_rent_uplift_pct', 0))
    infra_year            = int(params.get('infra_year', 0))

    cb_rate      = float(params.get('cb_rate_pct', 21))
    risk_premium = float(params.get('risk_premium_pct', 4))
    discount     = cb_rate + risk_premium

    # Для земли — нет арендного дохода, только расходы на содержание и налог
    if is_land and rent_rate == 0:
        gpi = 0.0
    else:
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
        r_m = loan_rate / 100.0 / 12
        n_m = int(loan_years * 12)
        if r_m > 0 and n_m > 0:
            monthly = loan_amount * (r_m * (1 + r_m) ** n_m) / ((1 + r_m) ** n_m - 1)
        else:
            monthly = loan_amount / max(n_m, 1)
        debt_service_annual = monthly * 12

    cumulative = cash_flows[0]
    payback_years = None
    yearly_breakdown = []
    noi_year10 = noi_year1  # будет пересчитан в цикле

    for year in range(1, 11):
        index_factor = (1 + indexation / 100.0) ** (year - 1)
        infra_factor = 1.0
        if infra_year and year >= infra_year:
            infra_factor = 1 + infra_rent_uplift_pct / 100.0
        if is_land and rent_rate == 0:
            rent_year = 0.0
        else:
            rent_year = rent_rate * 12 * area * index_factor * infra_factor
        egi_year    = rent_year * (1 - vacancy_pct / 100.0)
        # OPEX индексируется медленнее аренды (инфраструктурные расходы, не бизнес)
        opex_year   = opex_per_m2 * 12 * area * ((1 + 0.4 * indexation / 100.0) ** (year - 1))
        tax_year    = price * tax_pct / 100.0
        noi_year    = egi_year - opex_year - tax_year
        if year == 10:
            noi_year10 = noi_year

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

    # Terminal Value (реверсия)
    if is_land and rent_rate == 0:
        # Для земли без аренды: TV = апрециация цены (рост земли ≈ indexation% в год)
        terminal_value = price * ((1 + indexation / 100.0) ** 10)
    elif market_cap > 0 and noi_year10 > 0:
        # Метод прямой капитализации: TV = NOI₁₀ / cap_rate
        # Ограничиваем TV: не более 3× от цены покупки (защита от нереалистичных значений)
        terminal_value = min(noi_year10 / (market_cap / 100.0), price * 3)
    else:
        # NOI отрицательный или нулевой — Terminal Value = 0 (актив не окупаем)
        terminal_value = 0

    # NPV без TV (операционный, 10 лет)
    npv_operations = _compute_npv(cash_flows, discount)
    # PV Terminal Value — дисконтируем на 10 лет
    r = discount / 100.0
    pv_terminal = terminal_value / ((1 + r) ** 10) if r > 0 else terminal_value
    # Полный NPV = операционный + PV(Terminal Value)
    npv_total = npv_operations + pv_terminal

    # IRR с учётом продажи актива на год 10 (добавляем TV к последнему CF)
    cash_flows_with_tv = cash_flows[:]
    cash_flows_with_tv[-1] = cash_flows_with_tv[-1] + terminal_value
    irr = _compute_irr(cash_flows_with_tv)

    return {
        'noi_year1': round(noi_year1),
        'cap_rate_pct': round(cap_rate, 2),
        'npv_10y': round(npv_total),
        'npv_operations': round(npv_operations),
        'terminal_value': round(terminal_value),
        'pv_terminal': round(pv_terminal),
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


def load_market_comparables(cur, category: str, district: str) -> dict:
    """
    Загружает рыночные данные аналогов из price_market_snapshots.
    Источники: база системы + АЯХ (ayax.ru) + АРРпро (arrpro.ru) + Этажи (etagi.com) + МореонИнвест.
    Возвращает данные по аренде (rent) для расчёта рыночной ставки
    и данные по продаже (sale) для сравнения цены объекта с рынком.
    """
    result = {'rent': None, 'sale': None, 'sources': [], 'snapshot_date': None}
    try:
        # 1. Ищем по точному району
        for deal in ('rent', 'sale'):
            dist_safe = district.replace("'", "''") if district else ''
            cat_safe = category.replace("'", "''")
            # Сначала пробуем точный район, затем без района
            for dist_filter in ([dist_safe, ''] if dist_safe else ['']):
                cur.execute(f"""
                    SELECT price_per_m2_median, price_median, price_min, price_max,
                           analogs_count, sources, snapshot_date
                    FROM {SCHEMA}.price_market_snapshots
                    WHERE category = '{cat_safe}'
                      AND deal = '{deal}'
                      AND district = '{dist_filter}'
                    ORDER BY snapshot_date DESC
                    LIMIT 1
                """)
                row = cur.fetchone()
                if row and row['analogs_count'] and row['analogs_count'] >= 3:
                    snap = {
                        'price_per_m2': float(row['price_per_m2_median'] or 0),
                        'price_median': float(row['price_median'] or 0) if row['price_median'] else None,
                        'price_min': float(row['price_min'] or 0) if row['price_min'] else None,
                        'price_max': float(row['price_max'] or 0) if row['price_max'] else None,
                        'analogs_count': row['analogs_count'],
                        'district': dist_filter or 'Краснодар (все районы)',
                        'snapshot_date': str(row['snapshot_date']) if row['snapshot_date'] else None,
                    }
                    result[deal] = snap
                    # Собираем источники
                    srcs = row['sources'] if isinstance(row['sources'], list) else []
                    for s in srcs:
                        if s and s not in result['sources']:
                            result['sources'].append(s)
                    if not result['snapshot_date'] and snap['snapshot_date']:
                        result['snapshot_date'] = snap['snapshot_date']
                    break  # нашли подходящий снапшот — не ищем без района
    except Exception as e:
        print(f'[noi_model] load_market_comparables error: {e}')
    return result


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

    # NOI-модель применима только к продаже — для аренды модель неприменима
    if listing.get('deal') == 'rent':
        return {'_status': 400, 'error': 'NOI-модель применима только для объектов на продажу'}

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
    has_tenant = bool(listing.get('tenant_name') or has_real_rent)

    # Загружаем рыночные аналоги из снапшотов (АЯКС, АРРпро, Этажи и др.)
    category = listing.get('category') or ''
    district = listing.get('district') or ''
    comparables = load_market_comparables(cur, category, district)

    # Если есть рыночная ставка аренды из снапшотов — используем для обогащения бенчмарков
    market_rent_snap = comparables.get('rent')
    if market_rent_snap and market_rent_snap.get('price_per_m2', 0) > 0:
        # Ставка аренды в снапшотах — это цена за м²/мес (для объектов в аренде)
        snap_rent_rate = round(market_rent_snap['price_per_m2'] / 12, 1)
        bench['market_rent_rate_snap'] = snap_rent_rate
        bench['comparables_count_rent'] = market_rent_snap['analogs_count']

    # Сравниваем цену продажи объекта с рынком
    market_sale_snap = comparables.get('sale')
    price_vs_market = None
    if market_sale_snap and market_sale_snap.get('price_per_m2', 0) > 0:
        area = float(listing.get('area') or 1)
        price = float(listing.get('price') or 0)
        obj_price_per_m2 = round(price / area) if area > 0 else 0
        market_ppm2 = market_sale_snap['price_per_m2']
        if obj_price_per_m2 > 0 and market_ppm2 > 0:
            diff_pct = round((obj_price_per_m2 / market_ppm2 - 1) * 100, 1)
            price_vs_market = {
                'obj_price_per_m2': obj_price_per_m2,
                'market_price_per_m2': round(market_ppm2),
                'diff_pct': diff_pct,
                'assessment': 'above' if diff_pct > 10 else 'below' if diff_pct < -10 else 'fair',
                'analogs_count': market_sale_snap['analogs_count'],
                'district': market_sale_snap.get('district', ''),
            }

    def _f(v):
        return float(v) if v is not None else None

    def _i(v):
        return int(v) if v is not None else None

    return {
        'listing': {
            'id': listing['id'],
            'title': listing.get('title'),
            'area': _f(listing.get('area')) or 0,
            'price': _f(listing.get('price')) or 0,
            'type': listing.get('type'),
            'deal': listing.get('deal'),
            'monthly_rent': _f(listing.get('monthly_rent')),
            'yearly_rent': _f(listing.get('yearly_rent')),
            'tenant_name': listing.get('tenant_name'),
            'building_class': listing.get('building_class'),
            'building_year': _i(listing.get('building_year')),
            'total_floors': _i(listing.get('total_floors')),
            'has_tenant': has_tenant,
        },
        'benchmarks': bench,
        'scenarios': scenarios,
        'data_source': 'real_rent' if has_real_rent else bench.get('source', 'fallback'),
        'market_rent_rate': bench.get('market_rent_rate'),
        'actual_rent_rate': bench.get('actual_rent_rate'),
        # Данные аналогов с рынка (АЯКС, АРРпро, Этажи и др.)
        'comparables': {
            'rent': comparables.get('rent'),
            'sale': comparables.get('sale'),
            'sources': comparables.get('sources', []),
            'snapshot_date': comparables.get('snapshot_date'),
        },
        'price_vs_market': price_vs_market,
    }