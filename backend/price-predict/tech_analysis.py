"""
Технический анализ объекта недвижимости.
Оцениваем физический износ, соответствие нормативам, CAPEX на восстановление.
Все расчёты — детерминированные формулы. GPT только интерпретирует.
"""

import json
import urllib.request
from datetime import datetime, timedelta
from ai_client import chat_simple

SCHEMA = 't_p71821556_real_estate_catalog_'
CACHE_TTL_DAYS = 14

# ─── Нормативные требования по категориям ─────────────────────────────────────

# Минимальная высота потолков по СП 118.13330 / отраслевым нормам, м
MIN_CEILING_HEIGHT = {
    'office':       2.7,
    'retail':       3.0,
    'warehouse':    4.5,
    'restaurant':   3.0,
    'hotel':        2.7,
    'production':   4.0,
    'free_purpose': 2.7,
    'building':     2.7,
    'business':     2.7,
    'car_service':  4.5,
}

# Рекомендуемая высота потолков (комфортная), м
REC_CEILING_HEIGHT = {
    'office':       3.0,
    'retail':       4.0,
    'warehouse':    7.0,
    'restaurant':   3.5,
    'hotel':        3.0,
    'production':   6.0,
    'free_purpose': 3.2,
    'building':     3.0,
    'business':     3.0,
    'car_service':  5.5,
}

# Минимальная электрическая мощность кВт на 100 м² площади
MIN_KW_PER_100M2 = {
    'office':       15,
    'retail':       20,
    'warehouse':    5,
    'restaurant':   40,
    'hotel':        25,
    'production':   50,
    'free_purpose': 15,
    'building':     15,
    'business':     20,
    'car_service':  50,
}

# CAPEX-нормативы ₽/м² на доведение до состояния (Краснодар 2025)
CAPEX_TO_CONDITION = {
    # сколько стоит привести к состоянию "евроремонт"
    'needs_repair':  35000,  # требует капремонта → евро
    'bad':           50000,  # аварийное → евро
    'rough':         20000,  # черновая → евро
    'shellcore':     18000,
    'cosmetic':      10000,  # косметика → евро
    'working':       8000,   # рабочее → евро
    'good':          3000,   # хорошее → небольшое обновление
    'euro':          0,
    'new':           0,
}

# CAPEX на замену инженерных систем (% от стоимости замещения) по возрасту
# [возраст лет: % от стоимости замещения на инженерию]
CAPEX_ENGINEERING_BY_AGE = [
    (10,  0),
    (20,  3),
    (30,  8),
    (40,  15),
    (50,  22),
    (100, 30),
]

def _engineering_capex_pct(building_year: int | None) -> float:
    if not building_year:
        return 5.0
    age = max(0, 2025 - building_year)
    for max_age, pct in CAPEX_ENGINEERING_BY_AGE:
        if age <= max_age:
            return float(pct)
    return 30.0


# ─── Проверки ─────────────────────────────────────────────────────────────────

def _check_ceiling(category: str, ceiling: float | None) -> dict:
    min_h = MIN_CEILING_HEIGHT.get(category, 2.7)
    rec_h = REC_CEILING_HEIGHT.get(category, 3.0)
    if not ceiling:
        return {'check': 'ceiling_height', 'level': 'info',
                'message': 'Высота потолков не указана.', 'value': None}
    if ceiling < min_h:
        return {'check': 'ceiling_height', 'level': 'high',
                'message': f'Высота {ceiling}м ниже норматива {min_h}м для данной категории.',
                'value': ceiling, 'norm': min_h}
    if ceiling < rec_h:
        return {'check': 'ceiling_height', 'level': 'low',
                'message': f'Высота {ceiling}м ниже рекомендуемой {rec_h}м — ограничивает арендаторов.',
                'value': ceiling, 'norm': rec_h}
    return {'check': 'ceiling_height', 'level': 'ok',
            'message': f'Высота потолков {ceiling}м соответствует норме.',
            'value': ceiling, 'norm': rec_h}


def _check_electricity(category: str, area: float, electricity_kw: float | None) -> dict:
    min_kw_norm = MIN_KW_PER_100M2.get(category, 15) * area / 100
    if not electricity_kw:
        return {'check': 'electricity', 'level': 'info',
                'message': 'Мощность электричества не указана.', 'value': None}
    if electricity_kw < min_kw_norm * 0.7:
        return {'check': 'electricity', 'level': 'high',
                'message': f'Мощность {electricity_kw} кВт существенно ниже нормы {min_kw_norm:.0f} кВт для {area:.0f} м².',
                'value': electricity_kw, 'norm': round(min_kw_norm, 0)}
    if electricity_kw < min_kw_norm:
        return {'check': 'electricity', 'level': 'medium',
                'message': f'Мощность {electricity_kw} кВт ниже рекомендуемой {min_kw_norm:.0f} кВт.',
                'value': electricity_kw, 'norm': round(min_kw_norm, 0)}
    return {'check': 'electricity', 'level': 'ok',
            'message': f'Мощность {electricity_kw} кВт достаточна.',
            'value': electricity_kw, 'norm': round(min_kw_norm, 0)}


def _check_building_age(building_year: int | None, category: str) -> dict:
    if not building_year:
        return {'check': 'building_age', 'level': 'info', 'message': 'Год постройки не указан.', 'age': None}
    age = 2025 - building_year
    life = {'office': 60, 'retail': 60, 'warehouse': 40, 'restaurant': 50,
            'hotel': 60, 'production': 40}.get(category, 60)
    wear_pct = min(age / life * 100, 100)
    if wear_pct >= 80:
        level = 'high'
        msg = f'Здание {building_year} г.п. ({age} лет) — износ ~{wear_pct:.0f}%. Высокая вероятность капитального ремонта.'
    elif wear_pct >= 50:
        level = 'medium'
        msg = f'Здание {building_year} г.п. ({age} лет) — износ ~{wear_pct:.0f}%. Требуется комплексная проверка инженерных систем.'
    elif wear_pct >= 25:
        level = 'low'
        msg = f'Здание {building_year} г.п. ({age} лет) — износ ~{wear_pct:.0f}%. Плановое обслуживание инженерии.'
    else:
        level = 'ok'
        msg = f'Здание {building_year} г.п. ({age} лет) — в норме.'
    return {'check': 'building_age', 'level': level, 'message': msg,
            'age': age, 'wear_pct': round(wear_pct, 1)}


def _check_floor_load(category: str, floor: int | None) -> dict | None:
    """Предупреждение для тяжёлых объектов на верхних этажах."""
    if category in ('warehouse', 'production') and floor and floor > 1:
        return {'check': 'floor_load', 'level': 'medium',
                'message': f'Склад/производство на {floor}-м этаже: необходима проверка нагрузки на перекрытия.'}
    return None


def _calc_capex(listing: dict, area: float, replacement_cost_per_m2: float) -> dict:
    """Рассчитывает CAPEX на восстановление."""
    condition = listing.get('condition') or ''
    capex_finish = CAPEX_TO_CONDITION.get(condition, 5000) * area
    eng_pct = _engineering_capex_pct(listing.get('building_year'))
    capex_engineering = replacement_cost_per_m2 * area * eng_pct / 100
    total_capex = capex_finish + capex_engineering

    return {
        'capex_finishing': round(capex_finish, 0),
        'capex_finishing_per_m2': round(CAPEX_TO_CONDITION.get(condition, 5000), 0),
        'capex_engineering_pct': round(eng_pct, 1),
        'capex_engineering': round(capex_engineering, 0),
        'capex_total': round(total_capex, 0),
        'capex_per_m2': round(total_capex / area, 0) if area else 0,
    }


REPLACEMENT_COST_DEFAULT = {
    'office': 65000, 'retail': 60000, 'warehouse': 32000, 'restaurant': 85000,
    'hotel': 80000, 'production': 35000, 'free_purpose': 55000, 'building': 58000,
}


def _gpt_tech_comment(listing: dict, checks: list, capex: dict, api_key: str, folder_id: str) -> str:
    """GPT интерпретирует технические данные — только текст."""
    issues = [c for c in checks if c.get('level') not in ('ok', 'info')]
    issues_text = '\n'.join([f"[{c['level'].upper()}] {c['message']}" for c in issues]) \
                  or 'Критических технических проблем не выявлено.'
    prompt = (
        f"Объект: {listing.get('category','?')}, {listing.get('area','?')} м², "
        f"год постройки {listing.get('building_year','?')}, состояние: {listing.get('condition','?')}.\n"
        f"Техническая экспертиза выявила:\n{issues_text}\n"
        f"Оценочный CAPEX: {capex['capex_total']:,.0f} ₽ "
        f"({capex['capex_per_m2']:,.0f} ₽/м²).\n\n"
        f"Дай краткий технический комментарий (3–4 предложения): "
        f"на что обратить внимание при осмотре, что проверить у управляющей компании. "
        f"Только текст."
    )
    try:
        return chat_simple(
            'Ты — технический эксперт по коммерческой недвижимости.',
            prompt, api_key, folder_id,
            temperature=0.3, max_tokens=300, timeout=15,
        )
    except Exception:
        return ''


def handle_tech_analysis(event: dict, cur, conn, api_key: str, folder_id: str) -> dict:
    """
    action=tech_analysis — технический анализ объекта.
    GET ?action=tech_analysis&id=123  или  POST {action, id}
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

    cur.execute(
        f"SELECT result, expires_at FROM {SCHEMA}.tech_audit_cache WHERE listing_id = %s",
        (listing_id,)
    )
    cached = cur.fetchone()
    if cached and cached['expires_at'] > datetime.utcnow():
        return {'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': json.dumps({**cached['result'], 'cached': True}, ensure_ascii=False)}

    cur.execute(
        f"SELECT id, title, category, area, district, condition, finishing, "
        f"building_year, building_class, ceiling_height, electricity_kw, "
        f"floor, total_floors, utilities, parking "
        f"FROM {SCHEMA}.listings WHERE id = %s AND status = 'active'",
        (listing_id,)
    )
    row = cur.fetchone()
    if not row:
        return {'statusCode': 404, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Объект не найден'})}

    listing = dict(row)
    category = listing.get('category') or 'free_purpose'
    area = float(listing.get('area') or 0)

    checks = []

    # ── 1. Возраст здания ─────────────────────────────────────────────────────
    checks.append(_check_building_age(listing.get('building_year'), category))

    # ── 2. Высота потолков ────────────────────────────────────────────────────
    ceiling = float(listing.get('ceiling_height') or 0) or None
    checks.append(_check_ceiling(category, ceiling))

    # ── 3. Электрическая мощность ─────────────────────────────────────────────
    elec = float(listing.get('electricity_kw') or 0) or None
    checks.append(_check_electricity(category, area, elec))

    # ── 4. Нагрузка на перекрытия ─────────────────────────────────────────────
    floor_load = _check_floor_load(category, listing.get('floor'))
    if floor_load:
        checks.append(floor_load)

    # ── 5. Парковка ───────────────────────────────────────────────────────────
    parking = listing.get('parking') or ''
    if category in ('office', 'retail', 'business') and parking in ('none', ''):
        checks.append({'check': 'parking', 'level': 'medium',
                       'message': 'Парковка отсутствует или не указана — существенный минус для коммерции.'})
    elif parking:
        checks.append({'check': 'parking', 'level': 'ok',
                       'message': f'Парковка: {parking}.'})

    # ── 6. CAPEX-расчёт ───────────────────────────────────────────────────────
    repl_cost_m2 = float(REPLACEMENT_COST_DEFAULT.get(category, 55000))
    capex = _calc_capex(listing, area, repl_cost_m2)

    # ── 7. Техническая оценка — score ─────────────────────────────────────────
    LEVEL_SCORE = {'high': 15, 'medium': 7, 'low': 3, 'ok': 0, 'info': 0}
    score = sum(LEVEL_SCORE.get(c.get('level', 'ok'), 0) for c in checks)
    if score >= 30:
        tech_rating = 'плохое'
    elif score >= 15:
        tech_rating = 'удовлетворительное'
    elif score >= 5:
        tech_rating = 'хорошее'
    else:
        tech_rating = 'отличное'

    # ── 8. GPT-комментарий ────────────────────────────────────────────────────
    comment = _gpt_tech_comment(listing, checks, capex, api_key, folder_id)

    result = {
        'listing_id': listing_id,
        'method': 'tech_analysis',
        'area': area,
        'category': category,
        'building_year': listing.get('building_year'),
        'condition': listing.get('condition'),
        'checks': checks,
        'tech_score': score,
        'tech_rating': tech_rating,
        'capex': capex,
        'comment': comment,
        'cached': False,
        'calculated_at': datetime.utcnow().isoformat(),
    }

    expires = datetime.utcnow() + timedelta(days=CACHE_TTL_DAYS)
    cur.execute(
        f"INSERT INTO {SCHEMA}.tech_audit_cache (listing_id, result, expires_at) "
        f"VALUES (%s, %s, %s) "
        f"ON CONFLICT (listing_id) DO UPDATE SET result = EXCLUDED.result, "
        f"created_at = NOW(), expires_at = EXCLUDED.expires_at",
        (listing_id, json.dumps(result, ensure_ascii=False, default=str), expires)
    )
    conn.commit()

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(result, ensure_ascii=False, default=str),
    }