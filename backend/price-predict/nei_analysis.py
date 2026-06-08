"""
НЭИ — Наиболее эффективное использование (Highest and Best Use).
Перебираем альтернативные сценарии использования объекта,
для каждого считаем NOI/Cap Rate/стоимость чисто математически.
YandexGPT только формулирует итоговую рекомендацию (текст).
Юридическая допустимость — детерминированные правила по ВРИ/правам.
"""

import json
import urllib.request
from datetime import datetime, timedelta

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL = 'yandexgpt-5-pro/latest'
CACHE_TTL_DAYS = 14

# Рыночные параметры по сценариям использования (Краснодар 2025)
# rent_rate — ставка аренды ₽/м²/мес, vacancy — вакантность %,
# opex — операционные расходы ₽/м²/мес, cap_rate — рыночный cap rate %
# construction_delta — дополнительные затраты на приведение к этому use-case ₽/м² (CAPEX)
NEI_SCENARIOS = {
    'office': {
        'label': 'Офисный центр',
        'rent_rate': 950,
        'vacancy_pct': 10,
        'opex_per_m2': 200,
        'cap_rate_pct': 10.0,
        'capex_per_m2': 0,       # базовый сценарий — без доп. вложений
        'min_area': 50,
        'max_area': 50000,
    },
    'retail': {
        'label': 'Торговое помещение / стрит-ритейл',
        'rent_rate': 1600,
        'vacancy_pct': 7,
        'opex_per_m2': 250,
        'cap_rate_pct': 9.5,
        'capex_per_m2': 5000,
        'min_area': 30,
        'max_area': 20000,
    },
    'warehouse': {
        'label': 'Складской комплекс',
        'rent_rate': 600,
        'vacancy_pct': 5,
        'opex_per_m2': 80,
        'cap_rate_pct': 12.0,
        'capex_per_m2': 8000,
        'min_area': 200,
        'max_area': 100000,
    },
    'restaurant': {
        'label': 'Кафе / ресторан / фудкорт',
        'rent_rate': 1800,
        'vacancy_pct': 10,
        'opex_per_m2': 300,
        'cap_rate_pct': 11.0,
        'capex_per_m2': 20000,
        'min_area': 50,
        'max_area': 2000,
    },
    'hotel': {
        'label': 'Гостиница / апарт-отель',
        'rent_rate': 2200,
        'vacancy_pct': 25,
        'opex_per_m2': 800,
        'cap_rate_pct': 11.5,
        'capex_per_m2': 35000,
        'min_area': 300,
        'max_area': 20000,
    },
    'free_purpose': {
        'label': 'Помещение свободного назначения (ПСН)',
        'rent_rate': 1100,
        'vacancy_pct': 8,
        'opex_per_m2': 150,
        'cap_rate_pct': 10.5,
        'capex_per_m2': 2000,
        'min_area': 30,
        'max_area': 10000,
    },
    'production': {
        'label': 'Производственный объект',
        'rent_rate': 450,
        'vacancy_pct': 8,
        'opex_per_m2': 60,
        'cap_rate_pct': 12.5,
        'capex_per_m2': 15000,
        'min_area': 300,
        'max_area': 50000,
    },
    'coworking': {
        'label': 'Коворкинг / сервисный офис',
        'rent_rate': 1400,
        'vacancy_pct': 15,
        'opex_per_m2': 350,
        'cap_rate_pct': 12.0,
        'capex_per_m2': 25000,
        'min_area': 100,
        'max_area': 5000,
    },
}

# Коэффициент локации — районы влияют на доходность сценариев по-разному
LOCATION_MULTIPLIERS = {
    'retail': {
        'центральный': 1.30, 'цмр': 1.30, 'фмр': 1.10,
        'прикубанский': 0.90, 'карасунский': 0.85, 'восточный': 0.80,
    },
    'office': {
        'центральный': 1.20, 'цмр': 1.20, 'фмр': 1.10,
        'прикубанский': 0.95, 'карасунский': 0.90, 'восточный': 0.85,
    },
    'warehouse': {
        'центральный': 0.80, 'цмр': 0.80, 'фмр': 0.90,
        'прикубанский': 1.10, 'карасунский': 1.05, 'восточный': 1.15,
    },
    'production': {
        'центральный': 0.70, 'цмр': 0.70, 'фмр': 0.85,
        'прикубанский': 1.15, 'карасунский': 1.10, 'восточный': 1.20,
    },
}

def _location_mult(scenario_key: str, district: str | None) -> float:
    if not district:
        return 1.0
    dl = district.lower()
    mults = LOCATION_MULTIPLIERS.get(scenario_key, {})
    for key, m in mults.items():
        if key in dl:
            return m
    return 1.0


def _calc_scenario_noi(area: float, params: dict, dist_mult: float) -> dict:
    """Считает NOI, стоимость по доходному подходу, срок окупаемости."""
    rent = params['rent_rate'] * dist_mult
    vacancy = params['vacancy_pct'] / 100
    opex = params['opex_per_m2']
    cap_rate = params['cap_rate_pct'] / 100

    gross_income = rent * area * 12
    vacancy_loss = gross_income * vacancy
    effective_income = gross_income - vacancy_loss
    total_opex = opex * area * 12
    noi = effective_income - total_opex

    # Стоимость через капитализацию
    value_income = noi / cap_rate if cap_rate > 0 else 0

    # С учётом CAPEX: вычитаем затраты на приведение к этому use-case
    capex_total = params['capex_per_m2'] * area
    value_net = value_income - capex_total

    payback_years = (capex_total / noi) if noi > 0 and capex_total > 0 else 0

    return {
        'rent_rate_adj': round(rent, 0),
        'gross_income': round(gross_income, 0),
        'vacancy_loss': round(vacancy_loss, 0),
        'effective_income': round(effective_income, 0),
        'opex_total': round(total_opex, 0),
        'noi': round(noi, 0),
        'cap_rate_pct': params['cap_rate_pct'],
        'value_by_income': round(value_income, 0),
        'capex_required': round(capex_total, 0),
        'value_net_of_capex': round(value_net, 0),
        'payback_capex_years': round(payback_years, 1) if payback_years else None,
        'noi_per_m2': round(noi / area, 0) if area > 0 else 0,
    }


def _filter_feasible(area: float, params: dict) -> bool:
    """Физическая реализуемость — площадь в допустимом диапазоне."""
    return params['min_area'] <= area <= params['max_area']


# Матрица юридической совместимости ВРИ → допустимые сценарии НЭИ
# Ключ — подстрока в land_vri (lower), значение — dict сценарий→статус
# Источник: классификатор ВРИ (Приказ Минэкономразвития №540) + практика Краснодара
VRI_LEGAL_MAP = {
    # Торговля
    'торговл': {
        'retail': 'допустимо', 'office': 'допустимо', 'restaurant': 'допустимо',
        'free_purpose': 'допустимо', 'warehouse': 'ограничено',
        'hotel': 'ограничено', 'production': 'недопустимо', 'coworking': 'допустимо',
    },
    # Офисы / деловое
    'офис': {
        'office': 'допустимо', 'coworking': 'допустимо', 'retail': 'ограничено',
        'free_purpose': 'допустимо', 'hotel': 'ограничено',
        'warehouse': 'недопустимо', 'production': 'недопустимо', 'restaurant': 'ограничено',
    },
    'деловой': {
        'office': 'допустимо', 'coworking': 'допустимо', 'retail': 'допустимо',
        'restaurant': 'допустимо', 'hotel': 'допустимо', 'free_purpose': 'допустимо',
        'warehouse': 'ограничено', 'production': 'недопустимо',
    },
    # Производство / склад
    'производств': {
        'production': 'допустимо', 'warehouse': 'допустимо',
        'office': 'ограничено', 'retail': 'недопустимо',
        'restaurant': 'недопустимо', 'hotel': 'недопустимо',
        'free_purpose': 'ограничено', 'coworking': 'недопустимо',
    },
    'склад': {
        'warehouse': 'допустимо', 'production': 'допустимо',
        'office': 'ограничено', 'retail': 'недопустимо',
        'restaurant': 'недопустимо', 'hotel': 'недопустимо',
        'free_purpose': 'ограничено', 'coworking': 'недопустимо',
    },
    # Общепит
    'общепит': {
        'restaurant': 'допустимо', 'retail': 'допустимо', 'office': 'ограничено',
        'free_purpose': 'допустимо', 'hotel': 'ограничено',
        'warehouse': 'недопустимо', 'production': 'недопустимо', 'coworking': 'ограничено',
    },
    # Гостиница
    'гостиниц': {
        'hotel': 'допустимо', 'office': 'ограничено', 'retail': 'ограничено',
        'restaurant': 'допустимо', 'free_purpose': 'ограничено',
        'warehouse': 'недопустимо', 'production': 'недопустимо', 'coworking': 'ограничено',
    },
    # Сельхоз / рекреация → коммерция недопустима
    'сельскохоз': {k: 'недопустимо' for k in NEI_SCENARIOS},
    'рекреац': {k: 'недопустимо' for k in NEI_SCENARIOS},
    # Жилая зона (ИЖС, МКД) — коммерция ограничена или недопустима
    'жил': {
        'free_purpose': 'ограничено', 'office': 'ограничено', 'retail': 'ограничено',
        'restaurant': 'ограничено', 'hotel': 'ограничено',
        'warehouse': 'недопустимо', 'production': 'недопустимо', 'coworking': 'ограничено',
    },
}

# Корректировка по типу прав собственности
RIGHTS_PENALTY = {
    'short_lease':  'ограничено',   # краткосрочная аренда снижает всё
    'municipal':    'ограничено',   # госсобственность — ограничения
}


def _legal_check(listing: dict, scenario_keys: list) -> dict:
    """
    Детерминированная проверка юридической допустимости каждого сценария.
    Возвращает {scenario_key: 'допустимо'|'ограничено'|'недопустимо'}.
    """
    land_vri = (listing.get('land_vri') or '').lower()
    rights   = (listing.get('property_rights') or '').lower().replace(' ', '_')

    # Находим подходящую строку матрицы по ВРИ
    vri_rules = None
    for keyword, rules in VRI_LEGAL_MAP.items():
        if keyword in land_vri:
            vri_rules = rules
            break

    result = {}
    for key in scenario_keys:
        if vri_rules:
            status = vri_rules.get(key, 'ограничено')
        else:
            # ВРИ не указан → всё условно допустимо, требует проверки
            status = 'ограничено'

        # Права собственности могут понизить статус
        rights_penalty = RIGHTS_PENALTY.get(rights)
        if rights_penalty == 'ограничено' and status == 'допустимо':
            status = 'ограничено'

        result[key] = status

    return result


def _gpt_recommendation(listing: dict, ranked: list, api_key: str, folder_id: str) -> str:
    """GPT формулирует итоговую рекомендацию по НЭИ — только текст."""
    top3 = ranked[:3]
    lines = []
    for s in top3:
        lines.append(
            f"- {s['label']}: NOI {s['noi']:,.0f} ₽/год, "
            f"стоимость {s['value_net_of_capex']:,.0f} ₽, "
            f"юридически: {s.get('legal_status','?')}"
        )
    prompt = (
        f"Объект: {listing.get('area','?')} м², {listing.get('category','?')}, "
        f"район {listing.get('district','?')}.\n"
        f"Топ-3 варианта НЭИ по доходности:\n" + '\n'.join(lines) + "\n\n"
        f"Дай конкретную рекомендацию: какой сценарий является наиболее эффективным "
        f"и почему (учти юридическую допустимость). 3–4 предложения, только текст."
    )
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL}',
        'completionOptions': {'stream': False, 'temperature': 0.3, 'maxTokens': '300'},
        'messages': [
            {'role': 'system', 'text': 'Ты — эксперт по коммерческой недвижимости Краснодара.'},
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


def handle_nei(event: dict, cur, conn, api_key: str, folder_id: str) -> dict:
    """
    action=nei — анализ наиболее эффективного использования.
    GET ?action=nei&id=123  или  POST {action, id}
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

    # Кеш
    cur.execute(
        f"SELECT result, expires_at FROM {SCHEMA}.nei_cache WHERE listing_id = %s",
        (listing_id,)
    )
    cached = cur.fetchone()
    if cached and cached['expires_at'] > datetime.utcnow():
        return {'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': json.dumps({**cached['result'], 'cached': True}, ensure_ascii=False)}

    cur.execute(
        f"SELECT id, title, category, deal, price, area, district, condition, "
        f"building_year, building_class, land_area, land_status, land_vri, property_rights "
        f"FROM {SCHEMA}.listings WHERE id = %s AND status = 'active'",
        (listing_id,)
    )
    row = cur.fetchone()
    if not row:
        return {'statusCode': 404, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Объект не найден'})}

    listing = dict(row)
    area = float(listing['area'] or 0)
    if area <= 0:
        return {'statusCode': 400, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Площадь = 0'})}

    # ── 1. Отбираем физически реализуемые сценарии ──────────────────────────
    feasible_keys = [k for k, p in NEI_SCENARIOS.items() if _filter_feasible(area, p)]

    # ── 2. Считаем NOI и стоимость для каждого (чистая математика) ──────────
    scenarios_calc = []
    for key in feasible_keys:
        p = NEI_SCENARIOS[key]
        dist_mult = _location_mult(key, listing.get('district'))
        calc = _calc_scenario_noi(area, p, dist_mult)
        scenarios_calc.append({
            'key': key,
            'label': p['label'],
            'location_multiplier': round(dist_mult, 2),
            **calc,
        })

    # ── 3. Детерминированная проверка юридической допустимости ──────────────
    legal = _legal_check(listing, feasible_keys)
    for s in scenarios_calc:
        s['legal_status'] = legal.get(s['key'], 'ограничено')

    # ── 4. Ранжируем: только юридически допустимые, по value_net_of_capex ───
    ranked = sorted(
        scenarios_calc,
        key=lambda x: (
            0 if x['legal_status'] == 'допустимо' else (1 if x['legal_status'] == 'ограничено' else 2),
            -x['value_net_of_capex']
        )
    )

    best = ranked[0] if ranked else None

    # ── 5. GPT формулирует итоговую рекомендацию ────────────────────────────
    recommendation = _gpt_recommendation(listing, ranked, api_key, folder_id)

    # Текущий сценарий — для сравнения
    current_key = listing.get('category', '')
    current_scenario = next((s for s in scenarios_calc if s['key'] == current_key), None)

    result = {
        'listing_id': listing_id,
        'method': 'nei',
        'area': area,
        'district': listing.get('district'),
        'current_use': current_key,
        'current_scenario_calc': current_scenario,
        'feasible_count': len(feasible_keys),
        'scenarios': ranked,
        'best_use': best,
        'recommendation': recommendation,
        'cached': False,
        'calculated_at': datetime.utcnow().isoformat(),
    }

    # Кешируем
    expires = datetime.utcnow() + timedelta(days=CACHE_TTL_DAYS)
    cur.execute(
        f"INSERT INTO {SCHEMA}.nei_cache (listing_id, result, expires_at) "
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