"""
Финансово-инвестиционные метрики: CoC, Equity Multiple, ликвидность,
сравнение с альтернативами (депозит, облигации), таблица амортизации кредита.
Только математика. GPT — итоговый инвестиционный вывод.
"""

import json
import urllib.request
from datetime import datetime
from ai_client import chat_simple

# Бенчмарки альтернативных инструментов (Россия 2025)
ALTERNATIVE_RETURNS = {
    'deposit_1y':    {'label': 'Банковский депозит 1 год',    'rate_pct': 16.0, 'risk': 'минимальный'},
    'ofz_5y':        {'label': 'ОФЗ 5 лет',                   'rate_pct': 14.5, 'risk': 'низкий'},
    'corp_bonds':    {'label': 'Корпоративные облигации',     'rate_pct': 17.0, 'risk': 'умеренный'},
    'reits':         {'label': 'ЗПИФ недвижимости',           'rate_pct': 10.0, 'risk': 'умеренный'},
    'stock_market':  {'label': 'Акции (индекс МосБиржи)',     'rate_pct': 12.0, 'risk': 'высокий'},
}

# Средние сроки экспозиции (дней до продажи) по категориям Краснодара
LIQUIDITY_DAYS = {
    'retail':       {'fast': 60,  'avg': 180, 'slow': 365},
    'office':       {'fast': 90,  'avg': 240, 'slow': 480},
    'warehouse':    {'fast': 120, 'avg': 270, 'slow': 540},
    'restaurant':   {'fast': 90,  'avg': 210, 'slow': 420},
    'hotel':        {'fast': 180, 'avg': 360, 'slow': 720},
    'production':   {'fast': 180, 'avg': 365, 'slow': 730},
    'free_purpose': {'fast': 60,  'avg': 180, 'slow': 360},
    'business':     {'fast': 60,  'avg': 150, 'slow': 300},
    'building':     {'fast': 180, 'avg': 365, 'slow': 730},
    'land':         {'fast': 180, 'avg': 365, 'slow': 730},
}


def calc_coc_return(annual_noi: float, annual_debt_service: float, equity_invested: float) -> float | None:
    """
    Cash-on-Cash Return = (NOI - обслуживание долга) / собственный капитал.
    Показывает доходность на вложенные собственные средства.
    """
    if equity_invested <= 0:
        return None
    annual_cash_flow = annual_noi - annual_debt_service
    return annual_cash_flow / equity_invested * 100


def calc_equity_multiple(
    total_cash_in: float,
    annual_noi: float,
    annual_debt_service: float,
    hold_years: int,
    terminal_value: float,
    loan_balance_at_exit: float,
) -> float | None:
    """
    Equity Multiple = суммарные поступления / вложенный капитал.
    EM > 2.0 — хорошая инвестиция на 10 лет.
    """
    if total_cash_in <= 0:
        return None
    annual_cf = annual_noi - annual_debt_service
    total_distributions = annual_cf * hold_years
    equity_at_exit = terminal_value - loan_balance_at_exit
    total_return = total_distributions + equity_at_exit
    return total_return / total_cash_in


def calc_loan_schedule(principal: float, rate_annual_pct: float, years: int) -> list[dict]:
    """
    Таблица амортизации аннуитетного кредита.
    Возвращает список по годам: {year, payment, principal_paid, interest_paid, balance}.
    """
    if principal <= 0 or rate_annual_pct <= 0 or years <= 0:
        return []
    r = rate_annual_pct / 100 / 12
    n = years * 12
    monthly = principal * r * (1 + r) ** n / ((1 + r) ** n - 1)
    annual_payment = monthly * 12

    schedule = []
    balance = principal
    for yr in range(1, years + 1):
        interest_yr = 0.0
        principal_yr = 0.0
        for _ in range(12):
            interest_m = balance * r
            principal_m = monthly - interest_m
            interest_yr += interest_m
            principal_yr += principal_m
            balance = max(0.0, balance - principal_m)
        schedule.append({
            'year': yr,
            'annual_payment': round(annual_payment, 0),
            'principal_paid': round(principal_yr, 0),
            'interest_paid': round(interest_yr, 0),
            'balance': round(balance, 0),
        })
    return schedule


def calc_liquidity(category: str, price: float, district: str | None) -> dict:
    """
    Оценка ликвидности: срок экспозиции, дисконт при срочной продаже.
    """
    liq = LIQUIDITY_DAYS.get(category, LIQUIDITY_DAYS.get('free_purpose'))

    # Корректировка по цене (дорогие объекты продаются дольше)
    price_factor = 1.0
    if price > 100_000_000:
        price_factor = 1.5
    elif price > 50_000_000:
        price_factor = 1.2
    elif price < 10_000_000:
        price_factor = 0.85

    # Корректировка по локации
    district_factor = 1.0
    if district:
        dl = district.lower()
        if any(x in dl for x in ('центральн', 'цмр', 'фмр')):
            district_factor = 0.85
        elif any(x in dl for x in ('восточн', 'прикубан')):
            district_factor = 1.2

    avg_days = round(liq['avg'] * price_factor * district_factor)
    fast_days = round(liq['fast'] * price_factor * district_factor)

    # Дисконт при срочной продаже (за 30 дней)
    if avg_days > 180:
        emergency_discount_pct = 25
    elif avg_days > 90:
        emergency_discount_pct = 15
    else:
        emergency_discount_pct = 10

    if avg_days <= 90:
        liquidity_label = 'высокая'
    elif avg_days <= 270:
        liquidity_label = 'средняя'
    else:
        liquidity_label = 'низкая'

    return {
        'avg_days_to_sell': avg_days,
        'fast_days_to_sell': fast_days,
        'emergency_discount_pct': emergency_discount_pct,
        'emergency_price': round(price * (1 - emergency_discount_pct / 100), 0),
        'liquidity_label': liquidity_label,
    }


def compare_alternatives(noi: float, price: float, irr_pct: float | None) -> list[dict]:
    """
    Сравнивает доходность объекта с альтернативными инструментами.
    """
    cap_rate = noi / price * 100 if price > 0 else 0
    effective_rate = irr_pct or cap_rate

    result = []
    for key, alt in ALTERNATIVE_RETURNS.items():
        delta = effective_rate - alt['rate_pct']
        result.append({
            'instrument': alt['label'],
            'rate_pct': alt['rate_pct'],
            'risk': alt['risk'],
            'vs_property_delta_pct': round(delta, 1),
            'property_better': delta > 0,
        })
    return sorted(result, key=lambda x: x['rate_pct'], reverse=True)


def _gpt_investment_verdict(listing, metrics, alternatives, liquidity, api_key, folder_id) -> str:
    """GPT формулирует итоговый инвестиционный вердикт — только текст."""
    alts_text = '\n'.join([
        f"- {a['instrument']}: {a['rate_pct']}% ({'+' if a['property_better'] else ''}{a['vs_property_delta_pct']}%)"
        for a in alternatives[:4]
    ])
    prompt = (
        f"Объект: {listing.get('category','?')}, {listing.get('area','?')} м², "
        f"цена {listing.get('price',0):,.0f} ₽, район {listing.get('district','?')}.\n"
        f"Финансовые метрики:\n"
        f"- Cap Rate: {metrics.get('cap_rate_pct','?')}%\n"
        f"- CoC Return: {metrics.get('coc_return_pct','?')}%\n"
        f"- Equity Multiple (10 лет): {metrics.get('equity_multiple','?')}\n"
        f"- Ликвидность: {liquidity['liquidity_label']} (~{liquidity['avg_days_to_sell']} дней)\n"
        f"Альтернативные инструменты:\n{alts_text}\n\n"
        f"Дай инвестиционный вердикт (3–5 предложений): "
        f"стоит ли вкладывать, как объект выглядит на фоне альтернатив, "
        f"для какого инвестора подходит. Только текст."
    )
    try:
        return chat_simple(
            'Ты — инвестиционный аналитик. Отвечай конкретно и по делу.',
            prompt, api_key, folder_id,
            max_tokens=350, timeout=15,
        )
    except Exception:
        return ''


def handle_financial_metrics(event: dict, cur, conn, api_key: str, folder_id: str) -> dict:
    """
    action=financial_metrics — финансово-инвестиционный анализ.
    POST {action, id, noi?, ltv_pct?, loan_rate_pct?, loan_years?, irr_pct?, hold_years?}
    """
    from noi_model import DEFAULT_BENCHMARKS

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
    price    = float(listing.get('price') or 0)
    area     = float(listing.get('area') or 0)

    bench = DEFAULT_BENCHMARKS.get(category, DEFAULT_BENCHMARKS.get('office', {}))

    # Параметры кредита
    ltv_pct     = float(body.get('ltv_pct')     or 60)
    loan_rate   = float(body.get('loan_rate_pct') or 18.0)
    loan_years  = int(body.get('loan_years')    or 10)
    hold_years  = int(body.get('hold_years')    or 10)
    irr_pct     = body.get('irr_pct')

    # NOI
    if body.get('noi'):
        noi = float(body['noi'])
    else:
        rent   = bench.get('rent_rate', 900)
        vac    = bench.get('vacancy_pct', 10) / 100
        opex   = bench.get('opex_per_m2', 200)
        noi    = (rent * area * 12 * (1 - vac)) - (opex * area * 12)

    cap_rate_pct = noi / price * 100 if price > 0 else 0

    # ── 1. Параметры кредита ──────────────────────────────────────────────────
    loan_amount  = price * ltv_pct / 100
    equity       = price - loan_amount

    schedule = calc_loan_schedule(loan_amount, loan_rate, loan_years)
    annual_debt_service = schedule[0]['annual_payment'] if schedule else 0
    loan_balance_at_exit = schedule[-1]['balance'] if schedule else 0

    # ── 2. CoC Return ─────────────────────────────────────────────────────────
    coc = calc_coc_return(noi, annual_debt_service, equity)

    # ── 3. Equity Multiple ────────────────────────────────────────────────────
    cap_r = bench.get('cap_rate_pct', 10) / 100
    idx   = bench.get('indexation_pct', 7) / 100
    noi_terminal = noi * (1 + idx) ** hold_years
    terminal_value = noi_terminal / cap_r if cap_r > 0 else 0
    em = calc_equity_multiple(equity, noi, annual_debt_service, hold_years, terminal_value, loan_balance_at_exit)

    # ── 4. Ликвидность ────────────────────────────────────────────────────────
    liquidity = calc_liquidity(category, price, listing.get('district'))

    # ── 5. Сравнение с альтернативами ─────────────────────────────────────────
    irr_val = float(irr_pct) if irr_pct else None
    alternatives = compare_alternatives(noi, price, irr_val)

    metrics = {
        'price': price,
        'area': area,
        'noi': round(noi, 0),
        'cap_rate_pct': round(cap_rate_pct, 2),
        'loan_amount': round(loan_amount, 0),
        'equity_invested': round(equity, 0),
        'ltv_pct': ltv_pct,
        'loan_rate_pct': loan_rate,
        'annual_debt_service': round(annual_debt_service, 0),
        'coc_return_pct': round(coc, 2) if coc is not None else None,
        'equity_multiple': round(em, 2) if em is not None else None,
        'hold_years': hold_years,
        'terminal_value': round(terminal_value, 0),
    }

    # ── 6. GPT-вердикт ────────────────────────────────────────────────────────
    verdict = _gpt_investment_verdict(listing, metrics, alternatives, liquidity, api_key, folder_id)

    result = {
        'listing_id': listing_id,
        'method': 'financial_metrics',
        'metrics': metrics,
        'loan_schedule': schedule[:5] + ([{'note': f'...ещё {len(schedule)-5} лет'}] if len(schedule) > 5 else []),
        'loan_schedule_full': schedule,
        'liquidity': liquidity,
        'alternatives': alternatives,
        'investment_verdict': verdict,
        'calculated_at': datetime.utcnow().isoformat(),
    }

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(result, ensure_ascii=False),
    }