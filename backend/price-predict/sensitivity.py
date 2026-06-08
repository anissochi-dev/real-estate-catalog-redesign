"""
Анализ чувствительности и рисков.
Матрица чувствительности (2D), стресс-тест, break-even.
Всё — чистая математика без ИИ. GPT только интерпретирует итог.
"""

import json
import urllib.request
from datetime import datetime

YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL = 'yandexgpt-5-pro/latest'


def _npv(cash_flows: list[float], discount_rate: float) -> float:
    """NPV: сумма дисконтированных денежных потоков."""
    return sum(cf / (1 + discount_rate) ** (i + 1) for i, cf in enumerate(cash_flows))


def _irr(cash_flows: list[float], initial: float, tol: float = 1e-6, max_iter: int = 200) -> float | None:
    """IRR методом бисекции: ставка при которой NPV = 0."""
    flows = [-initial] + list(cash_flows)

    def npv_rate(r):
        return sum(f / (1 + r) ** i for i, f in enumerate(flows))

    lo, hi = 0.0001, 10.0
    if npv_rate(lo) < 0:
        return None
    for _ in range(max_iter):
        mid = (lo + hi) / 2
        if abs(hi - lo) < tol:
            return mid
        if npv_rate(mid) > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _calc_noi(rent_rate: float, area: float, vacancy_pct: float, opex_per_m2: float) -> float:
    gross = rent_rate * area * 12
    effective = gross * (1 - vacancy_pct / 100)
    return effective - opex_per_m2 * area * 12


def _calc_value(noi: float, cap_rate_pct: float) -> float:
    return noi / (cap_rate_pct / 100) if cap_rate_pct > 0 else 0


def build_sensitivity_matrix(
    base_rent: float,
    base_vacancy: float,
    area: float,
    opex_per_m2: float,
    cap_rate_pct: float,
    price: float,
) -> dict:
    """
    Матрица чувствительности 2D: ставка аренды × вакантность.
    Строки = вариации аренды (-20% … +20%), колонки = вакантность (0% … 30%).
    Ячейка = стоимость объекта по доходному подходу.
    """
    rent_variations = [-0.20, -0.10, 0, +0.10, +0.20]
    vacancy_values  = [0, 5, 10, 15, 20, 25, 30]

    rows = []
    for rv in rent_variations:
        rent = base_rent * (1 + rv)
        row = {'rent_rate': round(rent, 0), 'rent_delta_pct': round(rv * 100, 0), 'cells': []}
        for vac in vacancy_values:
            noi = _calc_noi(rent, area, vac, opex_per_m2)
            val = _calc_value(noi, cap_rate_pct)
            row['cells'].append({
                'vacancy_pct': vac,
                'noi': round(noi, 0),
                'value': round(val, 0),
                'vs_price_pct': round((val - price) / price * 100, 1) if price > 0 else None,
            })
        rows.append(row)
    return {'vacancy_axis': vacancy_values, 'rows': rows}


def build_stress_test(
    base_rent: float,
    base_vacancy: float,
    area: float,
    opex_per_m2: float,
    cap_rate_pct: float,
    price: float,
    discount_rate: float = 0.12,
    horizon_years: int = 10,
    indexation_pct: float = 7.0,
) -> list[dict]:
    """
    4 стресс-сценария: базовый, умеренный, пессимистичный, кризисный.
    Для каждого: NOI, стоимость, NPV-10 лет, IRR.
    """
    scenarios = [
        {'name': 'Базовый',       'rent_delta': 0,     'vacancy_delta': 0,   'opex_delta': 0,   'caprate_delta': 0},
        {'name': 'Умеренный',     'rent_delta': -0.10, 'vacancy_delta': +5,  'opex_delta': +10, 'caprate_delta': +0.5},
        {'name': 'Пессимистичный','rent_delta': -0.20, 'vacancy_delta': +10, 'opex_delta': +20, 'caprate_delta': +1.5},
        {'name': 'Кризисный',     'rent_delta': -0.35, 'vacancy_delta': +20, 'opex_delta': +30, 'caprate_delta': +3.0},
    ]
    results = []
    for s in scenarios:
        rent    = base_rent * (1 + s['rent_delta'])
        vacancy = min(base_vacancy + s['vacancy_delta'], 95)
        opex    = opex_per_m2 * (1 + s['opex_delta'] / 100)
        cap_r   = cap_rate_pct + s['caprate_delta']

        noi_y1 = _calc_noi(rent, area, vacancy, opex)
        value  = _calc_value(noi_y1, cap_r)

        # Денежные потоки на горизонт лет с индексацией
        idx = indexation_pct / 100
        cash_flows = [noi_y1 * (1 + idx) ** yr for yr in range(horizon_years)]
        # В конце — условная продажа по terminal cap rate
        terminal_value = cash_flows[-1] / (cap_r / 100)
        cash_flows[-1] += terminal_value

        npv = _npv(cash_flows, discount_rate)
        irr = _irr(cash_flows[:-1] + [cash_flows[-1]], price)

        results.append({
            'name': s['name'],
            'rent_rate': round(rent, 0),
            'vacancy_pct': round(vacancy, 1),
            'opex_per_m2': round(opex, 0),
            'cap_rate_pct': round(cap_r, 1),
            'noi': round(noi_y1, 0),
            'value_by_income': round(value, 0),
            'npv_10y': round(npv, 0),
            'irr_pct': round(irr * 100, 1) if irr else None,
            'value_vs_price_pct': round((value - price) / price * 100, 1) if price > 0 else None,
        })
    return results


def build_breakeven(
    area: float,
    opex_per_m2: float,
    cap_rate_pct: float,
    price: float,
    vacancy_pct: float,
) -> dict:
    """
    Break-even анализ: минимальная ставка аренды при которой:
    1) NOI > 0 (операционный break-even)
    2) Стоимость ≥ цене продавца (инвестиционный break-even)
    """
    # Операционный BE: rent × area × 12 × (1 - vac) = opex × area × 12
    vac = vacancy_pct / 100
    be_operational = opex_per_m2 / (1 - vac) if (1 - vac) > 0 else 0

    # Инвестиционный BE: value = price → NOI_be = price × cap_rate
    # NOI_be = (rent_be × area × 12 × (1-vac)) - opex × area × 12
    # rent_be = (NOI_be / (area × 12 × (1-vac))) + opex / (1-vac)
    noi_needed = price * (cap_rate_pct / 100)
    be_investment = (noi_needed / (area * 12 * (1 - vac)) + opex_per_m2 / (1 - vac)) if area > 0 and (1 - vac) > 0 else 0

    return {
        'breakeven_operational_rent': round(be_operational, 0),
        'breakeven_investment_rent': round(be_investment, 0),
        'noi_needed_for_price': round(noi_needed, 0),
    }


def _gpt_risk_summary(listing: dict, stress: list, breakeven: dict, api_key: str, folder_id: str) -> str:
    """GPT формулирует итоговый вывод по рискам — только текст."""
    base = stress[0]
    pessim = stress[2]
    crisis = stress[3]
    prompt = (
        f"Объект: {listing.get('category','?')}, {listing.get('area','?')} м², "
        f"цена {listing.get('price',0):,.0f} ₽, район {listing.get('district','?')}.\n"
        f"Базовый сценарий: NOI={base['noi']:,.0f} ₽, IRR={base.get('irr_pct','?')}%.\n"
        f"Пессимистичный: NOI={pessim['noi']:,.0f} ₽, стоимость ниже цены на {abs(pessim.get('value_vs_price_pct') or 0):.0f}%.\n"
        f"Кризисный: NOI={crisis['noi']:,.0f} ₽.\n"
        f"Break-even аренда: {breakeven['breakeven_investment_rent']:,.0f} ₽/м²/мес.\n\n"
        f"Дай краткий вывод об инвестиционных рисках (3–4 предложения): "
        f"насколько устойчива инвестиция, при каких условиях она перестаёт быть привлекательной. "
        f"Только текст."
    )
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL}',
        'completionOptions': {'stream': False, 'temperature': 0.3, 'maxTokens': '300'},
        'messages': [
            {'role': 'system', 'text': 'Ты — инвестиционный аналитик недвижимости. Отвечай кратко.'},
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


def handle_sensitivity(event: dict, cur, conn, api_key: str, folder_id: str) -> dict:
    """
    action=sensitivity — анализ чувствительности и стресс-тест.
    Принимает id объекта + параметры NOI-модели (или берёт дефолты).
    POST {action, id, rent_rate?, vacancy_pct?, opex_per_m2?, cap_rate_pct?, discount_rate?}
    """
    from noi_model import DEFAULT_BENCHMARKS  # дефолтные бенчмарки из NOI-модели

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

    cur.execute(
        f"SELECT id, category, deal, price, area, district, monthly_rent, yearly_rent "
        f"FROM t_p71821556_real_estate_catalog_.listings WHERE id = %s AND status = 'active'",
        (listing_id,)
    )
    row = cur.fetchone()
    if not row:
        return {'statusCode': 404, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Объект не найден'})}

    listing = dict(row)
    category = listing.get('category') or 'office'
    area = float(listing.get('area') or 0)
    price = float(listing.get('price') or 0)

    # Берём параметры из запроса или из дефолтных бенчмарков
    bench = DEFAULT_BENCHMARKS.get(category, DEFAULT_BENCHMARKS.get('office', {}))
    rent_rate    = float(body.get('rent_rate')    or bench.get('rent_rate', 900))
    vacancy_pct  = float(body.get('vacancy_pct')  or bench.get('vacancy_pct', 10))
    opex_per_m2  = float(body.get('opex_per_m2')  or bench.get('opex_per_m2', 200))
    cap_rate_pct = float(body.get('cap_rate_pct') or bench.get('cap_rate_pct', 10))
    discount_rate = float(body.get('discount_rate') or 0.12)
    indexation   = float(body.get('indexation_pct') or bench.get('indexation_pct', 7))

    # ── 1. Матрица чувствительности ───────────────────────────────────────────
    matrix = build_sensitivity_matrix(rent_rate, vacancy_pct, area, opex_per_m2, cap_rate_pct, price)

    # ── 2. Стресс-тест ────────────────────────────────────────────────────────
    stress = build_stress_test(rent_rate, vacancy_pct, area, opex_per_m2, cap_rate_pct,
                               price, discount_rate, 10, indexation)

    # ── 3. Break-even ──────────────────────────────────────────────────────────
    breakeven = build_breakeven(area, opex_per_m2, cap_rate_pct, price, vacancy_pct)

    # ── 4. GPT-вывод ──────────────────────────────────────────────────────────
    risk_summary = _gpt_risk_summary(listing, stress, breakeven, api_key, folder_id)

    result = {
        'listing_id': listing_id,
        'method': 'sensitivity',
        'inputs': {
            'area': area, 'price': price, 'category': category,
            'rent_rate': rent_rate, 'vacancy_pct': vacancy_pct,
            'opex_per_m2': opex_per_m2, 'cap_rate_pct': cap_rate_pct,
            'discount_rate': discount_rate, 'indexation_pct': indexation,
        },
        'sensitivity_matrix': matrix,
        'stress_test': stress,
        'breakeven': breakeven,
        'risk_summary': risk_summary,
        'calculated_at': datetime.utcnow().isoformat(),
    }

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(result, ensure_ascii=False),
    }
