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
from ai_client import chat_simple, load_keys
from analogs_fetcher import fetch_external_analogs

SCHEMA = 't_p71821556_real_estate_catalog_'
CACHE_TTL_DAYS = 90
MIN_ANALOGS = 35
AREA_DELTA_PCT = 0.20  # ±20% по площади

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

# Публичный словарь дефолтных бенчмарков — импортируется sensitivity.py и financial_metrics.py
DEFAULT_BENCHMARKS = {
    'office':       {'rent_rate': 950,  'vacancy_pct': 10, 'opex_per_m2': 200, 'cap_rate_pct': 10.0, 'indexation_pct': 7},
    'retail':       {'rent_rate': 1600, 'vacancy_pct': 7,  'opex_per_m2': 250, 'cap_rate_pct': 9.5,  'indexation_pct': 7},
    'warehouse':    {'rent_rate': 600,  'vacancy_pct': 5,  'opex_per_m2': 80,  'cap_rate_pct': 12.0, 'indexation_pct': 8},
    'restaurant':   {'rent_rate': 1800, 'vacancy_pct': 10, 'opex_per_m2': 300, 'cap_rate_pct': 11.0, 'indexation_pct': 7},
    'hotel':        {'rent_rate': 2200, 'vacancy_pct': 25, 'opex_per_m2': 800, 'cap_rate_pct': 11.5, 'indexation_pct': 6},
    'gab':          {'rent_rate': 1200, 'vacancy_pct': 5,  'opex_per_m2': 150, 'cap_rate_pct': 10.0, 'indexation_pct': 7},
    'business':     {'rent_rate': 1400, 'vacancy_pct': 8,  'opex_per_m2': 200, 'cap_rate_pct': 11.0, 'indexation_pct': 7},
    'production':   {'rent_rate': 500,  'vacancy_pct': 6,  'opex_per_m2': 80,  'cap_rate_pct': 12.5, 'indexation_pct': 7},
    'building':     {'rent_rate': 900,  'vacancy_pct': 8,  'opex_per_m2': 160, 'cap_rate_pct': 10.5, 'indexation_pct': 7},
    'free_purpose': {'rent_rate': 1050, 'vacancy_pct': 8,  'opex_per_m2': 170, 'cap_rate_pct': 10.0, 'indexation_pct': 7},
    'car_service':  {'rent_rate': 700,  'vacancy_pct': 6,  'opex_per_m2': 100, 'cap_rate_pct': 12.0, 'indexation_pct': 7},
    'land':         {'rent_rate': 0,    'vacancy_pct': 0,  'opex_per_m2': 5,   'cap_rate_pct': 7.0,  'indexation_pct': 8},
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
    return load_keys()


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
    Объект сдан в аренду (ГАБ-режим): арендатор платит фиксированную плату,
    собственник несёт только налоговую нагрузку.

    МЕТОДОЛОГИЯ ГАБ:
    - Доход = фактическая арендная плата (из поля monthly_rent / yearly_rent)
    - OPEX = 0: все операционные расходы (коммуналка, персонал, ремонт) несёт АРЕНДАТОР
    - Налог = 6% УСН «Доходы» от годовой аренды (типично для ИП-арендодателей)
      Это реальная нагрузка: 6% от дохода, а не от кадастровой стоимости
    - Вакантность = 0: объект занят арендатором
    - property_tax_pct используется ТОЛЬКО для расчёта налога на имущество физлица
      (0.5% от кадастра ≈ ~0.5% от цены), добавляем отдельно

    При самостоятельном управлении (без арендатора) расчёт другой —
    тогда используется fallback с полным OPEX отеля/ресторана.
    """
    area = float(listing.get('area') or 1)
    monthly_rent = float(listing.get('monthly_rent') or 0)
    yearly_rent = float(listing.get('yearly_rent') or 0)

    annual = yearly_rent if yearly_rent > 0 else monthly_rent * 12
    monthly = monthly_rent if monthly_rent > 0 else (yearly_rent / 12 if yearly_rent > 0 else 0)
    real_rent_rate = round(annual / 12 / area, 2) if area > 0 and annual > 0 else 0

    fallback = _fallback_benchmarks(listing)
    market_rent_rate = fallback['rent_rate']

    # Налоговая нагрузка собственника-ГАБ:
    # УСН 6% от дохода — стандарт для ИП-арендодателей в РФ
    # Выражаем в % от стоимости объекта для совместимости с моделью
    price = float(listing.get('price') or 1)
    usn_annual = annual * 0.06  # 6% УСН от годового дохода
    # Дополнительно налог на имущество физлица/ООО (~0.5% от кадастра ≈ от цены)
    property_tax_annual = price * 0.005
    total_tax_as_pct = round((usn_annual + property_tax_annual) / price * 100, 3) if price > 0 else 0.5

    # Апсайд: разрыв текущей ставки с рынком
    upside = round((market_rent_rate / real_rent_rate - 1) * 100, 1) if real_rent_rate > 0 and market_rent_rate > real_rent_rate else 0
    upside_note = f' Рыночный потенциал +{upside}% при смене арендатора.' if upside > 5 else ''

    tenant = listing.get('tenant_name') or 'компания'
    comment = (
        f"ГАБ: арендатор ({tenant}) платит {int(monthly):,} ₽/мес. "
        f"OPEX = 0 (все расходы на арендаторе). "
        f"Налог: УСН 6% + налог на имущество ≈ {int(usn_annual + property_tax_annual):,} ₽/год.{upside_note}"
    ).replace(',', ' ')

    return {
        'rent_rate': real_rent_rate,
        'market_rent_rate': market_rent_rate,
        'actual_rent_rate': real_rent_rate,
        'vacancy_pct': 0,
        'opex_per_m2': 0,           # OPEX = 0: арендатор несёт все расходы
        'property_tax_pct': round(total_tax_as_pct, 3),  # суммарная налоговая нагрузка как % от цены
        'market_cap_rate_pct': fallback['market_cap_rate_pct'],
        'avg_indexation_pct': fallback['avg_indexation_pct'],
        'comment': comment[:500],
        'source': 'real_data',
        'is_gab': True,             # флаг: объект в аренде, считаем по ГАБ-методологии
        'usn_annual': round(usn_annual),
        'property_tax_annual': round(property_tax_annual),
        'net_income_annual': round(annual - usn_annual - property_tax_annual),
    }


def _gpt_comment_only(listing: dict, bench: dict, api_key: str, folder_id: str) -> str:
    """
    GPT формулирует ТОЛЬКО текстовый комментарий к уже рассчитанным бенчмаркам.
    Не возвращает цифры, не влияет на расчёты.
    """
    if not api_key or not folder_id:
        return ''
    type_key = (listing.get('type') or listing.get('category') or '').lower()
    prompt = (
        f"Объект: {TYPE_RU.get(type_key, type_key)}, {listing.get('area', '?')} м², "
        f"район {listing.get('district', '?')}, состояние {listing.get('condition', '?')}.\n"
        f"Применены бенчмарки: аренда {bench['rent_rate']} ₽/м²/мес, "
        f"вакантность {bench['vacancy_pct']}%, OPEX {bench['opex_per_m2']} ₽/м²/мес, "
        f"cap rate {bench['market_cap_rate_pct']}%.\n"
        f"Напиши 1–2 предложения: почему эти параметры актуальны для данного объекта "
        f"и на что обратить внимание инвестору. Только текст."
    )
    try:
        return chat_simple(
            'Ты — аналитик коммерческой недвижимости Краснодара. Отвечай кратко.',
            prompt, api_key, folder_id,
            max_tokens=200, timeout=15,
        )
    except Exception:
        return ''


def _get_benchmarks(listing: dict, api_key: str, folder_id: str, cur=None, conn=None) -> dict:
    """
    Возвращает бенчмарки для объекта. Все числа — из детерминированного кода.
    Приоритет источников (от высшего к низшему):
      0. Реальные аналоги из БД (listings + market_listings, ≥35 шт, иерархия адрес→район→город)
      1. Реальные данные арендатора (monthly_rent / yearly_rent) — для ГАБ
      2. price_history — cap_rate и vacancy по категории и району (актуальная аналитика)
      3. price_history_biweekly — реальная индексация (CAGR за 5+ лет)
      4. DEFAULT_BENCHMARKS + атрибутные поправки (детерминированные коэффициенты)
    YandexGPT добавляет только текстовый комментарий — не влияет на цифры.
    """
    # Если есть реальная аренда — используем факт, GPT не нужен
    if listing.get('monthly_rent') or listing.get('yearly_rent'):
        return _real_rent_benchmarks(listing)

    type_key = (listing.get('type') or listing.get('category') or '').lower()
    district = listing.get('district') or ''

    # База: DEFAULT_BENCHMARKS по типу объекта
    bench = _fallback_benchmarks(listing)

    # ── Слой 0: реальные аналоги из БД (приоритет над всем) ────────────────────
    _conn_ref = conn  # передаём в fetch_external_analogs для сохранения в market_listings
    analogs_meta = {}
    if cur:
        analogs_result = find_real_analogs(cur, listing)
        analogs_meta = {
            'analogs_count': analogs_result['count'],
            'analogs_source_level': analogs_result.get('source_level'),
            'analogs_sources': analogs_result.get('sources', []),
            'area_range': analogs_result.get('area_range'),
        }
        if analogs_result['count'] < MIN_ANALOGS:
            print(f'[noi_model] analogs в БД: {analogs_result["count"]} < {MIN_ANALOGS}, дозапрос с внешних сайтов...')
            try:
                ext_result = fetch_external_analogs(listing, cur, _conn_ref, need=MIN_ANALOGS)
                if ext_result['count'] > 0:
                    # Повторяем поиск в БД — новые данные уже сохранены в market_listings
                    analogs_result2 = find_real_analogs(cur, listing)
                    if analogs_result2['count'] > analogs_result['count']:
                        analogs_result = analogs_result2
                    analogs_meta['external_scraped'] = ext_result['count']
                    analogs_meta['external_source'] = ext_result.get('source', 'none')
                    print(f'[noi_model] после дозапроса: {analogs_result["count"]} аналогов')
            except Exception as e:
                print(f'[noi_model] внешний дозапрос ошибка: {e}')

        if analogs_result['count'] >= MIN_ANALOGS:
            # Ставка аренды из реальных аналогов (только для аренды)
            if analogs_result.get('rent_rate_median') and (listing.get('deal') or '') == 'rent':
                bench['rent_rate'] = analogs_result['rent_rate_median']
                bench['rent_source'] = f"реальные аналоги ({analogs_result['count']} шт, уровень: {analogs_result.get('source_level')})"
            # Цена за м² из аналогов (для продажи — используем для расчёта cap rate)
            if analogs_result.get('price_per_m2_median') and (listing.get('deal') or '') == 'sale':
                bench['market_price_per_m2'] = analogs_result['price_per_m2_median']
                bench['price_source'] = f"реальные аналоги ({analogs_result['count']} шт, уровень: {analogs_result.get('source_level')})"
            print(f'[noi_model] analogs: count={analogs_result["count"]}, level={analogs_result.get("source_level")}, rent_median={analogs_result.get("rent_rate_median")}')
        else:
            print(f'[noi_model] итого аналогов: {analogs_result["count"]} — используем детерминированные бенчмарки')

    # ── Слой 1: price_history — cap_rate и vacancy по категории+район ──────────
    if cur:
        db_bench = load_district_benchmarks(cur, type_key, district)
        if db_bench:
            if db_bench.get('cap_rate'):
                bench['market_cap_rate_pct'] = round(db_bench['cap_rate'], 2)
                bench['cap_rate_source'] = f"price_history ({db_bench.get('district_found', 'Краснодар')})"
            if db_bench.get('vacancy'):
                bench['vacancy_pct'] = round(db_bench['vacancy'], 1)
                bench['vacancy_source'] = f"price_history ({db_bench.get('district_found', 'Краснодар')})"
            if db_bench.get('rent_per_m2_year') and db_bench['rent_per_m2_year'] > 0:
                # Переводим ₽/м²/год → ₽/м²/мес
                bench['rent_rate'] = round(db_bench['rent_per_m2_year'] / 12, 0)
                bench['rent_source'] = f"price_history ({db_bench.get('district_found', 'Краснодар')})"
            print(f'[noi_model] district_bench {type_key}/{district}: {db_bench}')

    # ── Слой 2: price_history_biweekly — реальная индексация (CAGR) ────────────
    if cur:
        real_idx = load_real_indexation(cur, type_key)
        if real_idx is not None:
            bench['avg_indexation_pct'] = real_idx
            bench['indexation_source'] = 'price_history_biweekly (CAGR 5+ лет)'

    # ── Слой 3: атрибутные поправки (детерминированные правила) ────────────────
    condition = (listing.get('condition') or '').lower()
    road_line = str(listing.get('road_line') or '')
    building_class = (listing.get('building_class') or '').upper()
    floor = int(listing.get('floor') or 0)

    # Поправка на состояние → влияет на ставку аренды
    CONDITION_RENT_DELTA = {
        'new': 1.15, 'euro': 1.10, 'good': 1.05, 'cosmetic': 1.0,
        'working': 0.92, 'rough': 0.80, 'shellcore': 0.82, 'needs_repair': 0.70,
    }
    rent_mult = CONDITION_RENT_DELTA.get(condition, 1.0)
    bench['rent_rate'] = round(bench['rent_rate'] * rent_mult, 0)

    # Поправка на класс здания → аренда и cap rate
    CLASS_ADJUSTMENTS = {
        'A':  {'rent_mult': 1.25, 'cap_rate_delta': -1.0},
        'B+': {'rent_mult': 1.10, 'cap_rate_delta': -0.5},
        'B':  {'rent_mult': 1.0,  'cap_rate_delta':  0.0},
        'C':  {'rent_mult': 0.80, 'cap_rate_delta': +1.0},
        'D':  {'rent_mult': 0.65, 'cap_rate_delta': +2.0},
    }
    if building_class in CLASS_ADJUSTMENTS:
        adj = CLASS_ADJUSTMENTS[building_class]
        bench['rent_rate'] = round(bench['rent_rate'] * adj['rent_mult'], 0)
        bench['market_cap_rate_pct'] = round(bench['market_cap_rate_pct'] + adj['cap_rate_delta'], 2)

    # Поправка на линию улицы → ритейл/ресторан/ПСН
    if type_key in ('retail', 'restaurant', 'free_purpose') and road_line:
        ROAD_LINE_RENT = {'1': 1.20, '2': 1.0, '3': 0.85, 'yard': 0.75}
        bench['rent_rate'] = round(bench['rent_rate'] * ROAD_LINE_RENT.get(road_line, 1.0), 0)

    # Поправка на этаж → ритейл/ресторан выше 2-го этажа теряет
    if type_key in ('retail', 'restaurant') and floor > 2:
        bench['rent_rate'] = round(bench['rent_rate'] * 0.85, 0)
        bench['vacancy_pct'] = min(bench['vacancy_pct'] + 5, 40)

    # GPT добавляет только текстовый комментарий
    bench['comment'] = _gpt_comment_only(listing, bench, api_key, folder_id) \
                       or f"Бенчмарки по рыночным данным Краснодара для сегмента {type_key}, район {district or 'не указан'}."

    # Определяем итоговый источник данных
    has_real_analogs = analogs_meta.get('analogs_count', 0) >= MIN_ANALOGS
    bench['source'] = 'real_analogs+db' if has_real_analogs else 'deterministic+db'

    # Прикрепляем мета-данные об аналогах к бенчмаркам
    bench['analogs_meta'] = analogs_meta

    return bench


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

    def _calc_year(year):
        """Рассчитывает денежный поток для произвольного года."""
        idx = (1 + indexation / 100.0) ** (year - 1)
        infra = 1.0
        if infra_year and year >= infra_year:
            infra = 1 + infra_rent_uplift_pct / 100.0
        if is_land and rent_rate == 0:
            rent_y = 0.0
        else:
            rent_y = rent_rate * 12 * area * idx * infra
        egi_y  = rent_y * (1 - vacancy_pct / 100.0)
        opex_y = opex_per_m2 * 12 * area * ((1 + 0.4 * indexation / 100.0) ** (year - 1))
        tax_y  = price * tax_pct / 100.0
        noi_y  = egi_y - opex_y - tax_y
        debt_y = debt_service_annual if year <= loan_years else 0
        return noi_y, debt_y, noi_y - debt_y

    for year in range(1, 11):
        noi_year, debt_year, cash_year = _calc_year(year)
        if year == 10:
            noi_year10 = noi_year

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

    # Продолжаем считать окупаемость до 30 лет (без записи в yearly)
    if payback_years is None:
        for year in range(11, 31):
            _, _, cash_year = _calc_year(year)
            cumulative += cash_year
            if cumulative >= 0:
                prev_cum = cumulative - cash_year
                if cash_year > 0:
                    frac = -prev_cum / cash_year
                    payback_years = (year - 1) + max(0, min(1, frac))
                else:
                    payback_years = float(year)
                break

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


def build_scenarios(listing: dict, bench: dict, cb_rate: float | None = None) -> dict:
    """5 предзаготовленных сценариев Что-если для сравнения с базовым."""
    # Базовая ставка ЦБ: из macro_indicators если есть, иначе 21%
    base_cb = cb_rate if cb_rate is not None else 21.0
    base_params = {'cb_rate_pct': base_cb}
    base    = compute_model(listing, bench, base_params)
    cb_high = compute_model(listing, bench, {'cb_rate_pct': base_cb + 4})
    cb_low  = compute_model(listing, bench, {'cb_rate_pct': max(base_cb - 6, 5)})
    metro   = compute_model(listing, bench, {**base_params, 'infra_rent_uplift_pct': 15, 'infra_year': 3})
    leverage= compute_model(listing, bench, {**base_params, 'ltv_pct': 50, 'loan_rate_pct': base_cb + 1, 'loan_years': 10})
    growth  = compute_model(listing, bench, {**base_params, 'avg_indexation_pct': bench['avg_indexation_pct'] + 3})
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

    # Вычисляем confidence_score: 1.0 если ≥35 реальных аналогов, иначе пропорционально
    analogs_meta = benchmarks.get('analogs_meta') or {}
    analogs_count = analogs_meta.get('analogs_count', 0)
    confidence = round(min(1.0, analogs_count / MIN_ANALOGS), 3) if analogs_count > 0 else 0.0
    analogs_source_level = analogs_meta.get('analogs_source_level') or 'none'

    cur.execute(
        f"INSERT INTO {SCHEMA}.noi_benchmarks_cache "
        f"(listing_id, benchmarks, expires_at, analogs_count, analogs_source_level, confidence_score) "
        f"VALUES (%s, %s, %s, %s, %s, %s) "
        f"ON CONFLICT (listing_id) DO UPDATE "
        f"SET benchmarks = EXCLUDED.benchmarks, expires_at = EXCLUDED.expires_at, "
        f"analogs_count = EXCLUDED.analogs_count, analogs_source_level = EXCLUDED.analogs_source_level, "
        f"confidence_score = EXCLUDED.confidence_score, created_at = NOW()",
        (listing_id, json.dumps(benchmarks, ensure_ascii=False), expires,
         analogs_count, analogs_source_level, confidence),
    )
    conn.commit()


def find_real_analogs(cur, listing: dict) -> dict:
    """
    Ищет аналоги объекта с иерархией: адрес → район → округ.
    Источники: listings + market_listings.
    Параметры отбора: категория, тип сделки, площадь ±20%.
    Дополнительные фильтры: этажность, состояние, арендная ставка (если есть), коммуникации.
    Возвращает dict с полями: analogs, count, source_level, rent_rate_median, price_per_m2_median.
    """
    import statistics as _stat

    category = (listing.get('category') or listing.get('type') or '').lower()
    deal = (listing.get('deal') or '').lower()
    area = float(listing.get('area') or 0)
    address = (listing.get('address') or '').strip()
    district = (listing.get('district') or '').strip()
    floor = listing.get('floor')
    condition = (listing.get('condition') or '').lower()
    has_rent = bool(listing.get('monthly_rent') or listing.get('yearly_rent'))

    if not category or area <= 0:
        return {'analogs': [], 'count': 0, 'source_level': None}

    area_lo = round(area * (1 - AREA_DELTA_PCT), 1)
    area_hi = round(area * (1 + AREA_DELTA_PCT), 1)

    # Маппинг deal для market_listings
    deal_ml = 'rent' if deal == 'rent' else 'sale'

    # Маппинг категорий listings → market_listings
    CAT_ALIAS_ML = {
        'office': ['office'],
        'retail': ['retail', 'free_purpose'],
        'warehouse': ['warehouse'],
        'restaurant': ['catering', 'other'],
        'hotel': ['hotel', 'standalone'],
        'gab': ['free_purpose', 'retail', 'office'],
        'business': ['free_purpose', 'retail', 'office'],
        'production': ['industrial', 'warehouse'],
        'building': ['standalone', 'other'],
        'free_purpose': ['free_purpose', 'retail'],
        'car_service': ['other'],
        'land': ['land'],
    }
    cats_ml = CAT_ALIAS_ML.get(category, [category])
    cats_ml_sql = ','.join(f"'{c}'" for c in cats_ml)

    # Дополнительные фильтры
    condition_clause_l = f"AND condition = '{condition.replace(chr(39), chr(39)*2)}'" if condition else ''
    condition_clause_ml = f"AND condition ILIKE '%{condition.replace(chr(39), chr(39)*2)}%'" if condition else ''
    rent_clause = 'AND monthly_rent > 0' if has_rent else ''

    # Ключевое слово района (берём аббревиатуру в скобках: "Черёмушки (ЧМР)" → "ЧМР")
    dist_kw = district.split('(')[-1].replace(')', '').strip() if '(' in district else district.split()[0] if district else ''

    # Короткое слово адреса (улица без номера дома)
    addr_kw = ''
    if address:
        parts = address.replace('ул.', '').replace('пр.', '').replace('пр-т', '').split(',')
        addr_kw = parts[0].strip()[:30] if parts else ''

    def _fetch_listings(where_extra: str) -> list:
        deal_safe = deal.replace("'", "''")
        cat_safe = category.replace("'", "''")
        try:
            cur.execute(f"""
                SELECT id, price, price_per_m2, area, address, district,
                       monthly_rent, yearly_rent, floor, total_floors, condition,
                       utilities, deal, category, 'own' AS src
                FROM {SCHEMA}.listings
                WHERE category = '{cat_safe}'
                  AND deal = '{deal_safe}'
                  AND area BETWEEN {area_lo} AND {area_hi}
                  AND status IN ('active', 'archived')
                  AND price > 0 AND area > 0
                  {rent_clause}
                  {condition_clause_l}
                  {where_extra}
                ORDER BY ABS(area - {area}) ASC
                LIMIT 100
            """)
            return cur.fetchall() or []
        except Exception as e:
            print(f'[find_real_analogs] listings error: {e}')
            return []

    def _fetch_market(where_extra: str) -> list:
        try:
            cur.execute(f"""
                SELECT id, price, price_per_m2, area, address, district,
                       NULL AS monthly_rent, NULL AS yearly_rent,
                       floor, total_floors, condition,
                       NULL AS utilities, deal_type AS deal, category,
                       source AS src
                FROM {SCHEMA}.market_listings
                WHERE deal_type = '{deal_ml}'
                  AND category IN ({cats_ml_sql})
                  AND area BETWEEN {area_lo} AND {area_hi}
                  AND price_per_m2 > 0
                  {condition_clause_ml}
                  {where_extra}
                ORDER BY scraped_at DESC
                LIMIT 100
            """)
            return cur.fetchall() or []
        except Exception as e:
            print(f'[find_real_analogs] market_listings error: {e}')
            return []

    def _dict(r):
        if hasattr(r, '_asdict'):
            return r._asdict()
        if hasattr(r, 'keys'):
            return dict(r)
        return r

    analogs = []
    source_level = None

    # Уровень 1: по адресу (улице)
    if addr_kw and len(analogs) < MIN_ANALOGS:
        addr_safe = addr_kw.replace("'", "''")
        rows = _fetch_listings(f"AND address ILIKE '%{addr_safe}%'")
        rows += _fetch_market(f"AND address ILIKE '%{addr_safe}%'")
        seen = set()
        for r in rows:
            d = _dict(r)
            key = f"{d.get('src','?')}_{d.get('id','?')}"
            if key not in seen:
                seen.add(key)
                analogs.append(d)
        if len(analogs) >= MIN_ANALOGS:
            source_level = 'address'
            print(f'[find_real_analogs] level=address, found={len(analogs)}')

    # Уровень 2: по району
    if dist_kw and len(analogs) < MIN_ANALOGS:
        dist_safe = dist_kw.replace("'", "''")
        rows = _fetch_listings(f"AND district ILIKE '%{dist_safe}%'")
        rows += _fetch_market(f"AND district ILIKE '%{dist_safe}%'")
        seen_ids = {f"{_dict(a).get('src','?')}_{_dict(a).get('id','?')}" for a in analogs}
        for r in rows:
            d = _dict(r)
            key = f"{d.get('src','?')}_{d.get('id','?')}"
            if key not in seen_ids:
                seen_ids.add(key)
                analogs.append(d)
        if len(analogs) >= MIN_ANALOGS:
            source_level = 'district'
            print(f'[find_real_analogs] level=district, found={len(analogs)}')

    # Уровень 3: без фильтра по локации (весь город)
    if len(analogs) < MIN_ANALOGS:
        rows = _fetch_listings('')
        rows += _fetch_market('')
        seen_ids = {f"{_dict(a).get('src','?')}_{_dict(a).get('id','?')}" for a in analogs}
        for r in rows:
            d = _dict(r)
            key = f"{d.get('src','?')}_{d.get('id','?')}"
            if key not in seen_ids:
                seen_ids.add(key)
                analogs.append(d)
        if analogs:
            source_level = source_level or 'city'
            print(f'[find_real_analogs] level=city, found={len(analogs)}')

    # Считаем медианы по пулу аналогов
    import statistics as _stat
    rent_rates = []
    prices_per_m2 = []
    for a in analogs:
        d = _dict(a) if not isinstance(a, dict) else a
        # Арендная ставка ₽/м²/мес
        mr = float(d.get('monthly_rent') or 0)
        yr = float(d.get('yearly_rent') or 0)
        ar = float(d.get('area') or 0)
        if mr > 0 and ar > 0:
            rent_rates.append(mr / ar)
        elif yr > 0 and ar > 0:
            rent_rates.append(yr / 12 / ar)
        # Цена за м²
        ppm2 = float(d.get('price_per_m2') or 0)
        if ppm2 > 0:
            prices_per_m2.append(ppm2)

    # Отсекаем выбросы (10–90 перцентиль)
    def _trim(lst):
        if len(lst) < 2:
            return lst
        srt = sorted(lst)
        lo_i = max(0, int(len(srt) * 0.10))
        hi_i = min(len(srt) - 1, int(len(srt) * 0.90))
        return srt[lo_i:hi_i + 1]

    rent_rates = _trim(rent_rates)
    prices_per_m2 = _trim(prices_per_m2)

    sources = list({(a.get('src') or 'own') for a in analogs})

    return {
        'analogs': analogs[:50],
        'count': len(analogs),
        'source_level': source_level,
        'rent_rate_median': round(_stat.median(rent_rates), 1) if rent_rates else None,
        'price_per_m2_median': round(_stat.median(prices_per_m2)) if prices_per_m2 else None,
        'sources': sources,
        'area_range': [area_lo, area_hi],
    }


def load_market_comparables(cur, category: str, district: str, area: float = 0) -> dict:
    """
    Загружает рыночные аналоги из market_listings (свежие данные с arrpro, ayax и др.).
    Аренда и продажа строго разделены по deal_type.
    Для аренды возвращает price_per_m2 = ₽/м²/мес.
    Для продажи возвращает price_per_m2 = ₽/м².
    area — площадь объекта для фильтра ±50% (отсекает нерелевантные по масштабу объекты).
    Дополнительно — fallback на price_market_snapshots если в market_listings мало данных.
    """
    import statistics as _stat

    result = {'rent': None, 'sale': None, 'sources': [], 'snapshot_date': None}

    # Маппинг категорий: наши типы → категории market_listings
    # ВАЖНО: 'other' исключён — содержит 10 000+ мусорных записей ЦИАН с нерелевантными ставками
    CAT_ALIAS = {
        'hotel': ['hotel', 'standalone'],
        'restaurant': ['catering'],
        'office': ['office'],
        'retail': ['retail', 'free_purpose'],
        'warehouse': ['warehouse'],
        'free_purpose': ['free_purpose', 'retail'],
        'production': ['industrial', 'warehouse'],
        'building': ['standalone'],
        'gab': ['free_purpose', 'retail', 'office'],
        'business': ['free_purpose', 'retail', 'office'],
        'car_service': ['industrial'],
        'land': ['land'],
    }
    cats = CAT_ALIAS.get(category, [category])
    cats_sql = ','.join(f"'{c}'" for c in cats)

    # Фильтр по площади: ±50% от площади объекта (убирает промзоны 25 000 м² при здании 850 м²)
    # Минимальный порог: не менее 50 м²
    area_filter = ''
    if area and area > 0:
        area_lo = max(50, round(area * 0.5))
        area_hi = round(area * 2.0)
        area_filter = f'AND area BETWEEN {area_lo} AND {area_hi}'

    # Минимальный порог цены за м²: для аренды — не менее 100 ₽/м²/мес (отсекает ошибочные записи)
    MIN_RENT_P2 = 100   # ₽/м²/мес — ниже нет реального рынка в Краснодаре
    MIN_SALE_P2 = 5000  # ₽/м² — ниже нет реального рынка

    try:
        for deal in ('sale', 'rent'):
            min_p2 = MIN_RENT_P2 if deal == 'rent' else MIN_SALE_P2
            # Сначала пробуем с районом, затем без
            dist_filters = []
            if district:
                # Берём первое слово района для нечёткого поиска (ФМР, ЦМР и т.д.)
                dist_kw = district.split('(')[-1].replace(')', '').strip() if '(' in district else district.split()[0]
                dist_filters.append(dist_kw)
            dist_filters.append(None)  # fallback без района

            for dist_kw in dist_filters:
                dist_clause = f"AND district ILIKE '%{dist_kw.replace(chr(39), chr(39)*2)}%'" if dist_kw else ''
                cur.execute(f"""
                    SELECT price_per_m2, price, area, address, district, source
                    FROM {SCHEMA}.market_listings
                    WHERE deal_type = '{deal}'
                      AND category IN ({cats_sql})
                      AND price_per_m2 >= {min_p2}
                      AND scraped_at > NOW() - INTERVAL '90 days'
                      {area_filter}
                      {dist_clause}
                    ORDER BY scraped_at DESC
                    LIMIT 50
                """)
                rows = cur.fetchall() or []
                if len(rows) < 2:
                    continue

                prices = [float(r['price_per_m2']) for r in rows if r.get('price_per_m2')]
                if not prices:
                    continue

                # Отсекаем выбросы (10%-90% перцентиль)
                srt = sorted(prices)
                lo = srt[max(0, int(len(srt) * 0.1))]
                hi = srt[min(len(srt)-1, int(len(srt) * 0.9))]
                filtered = [p for p in srt if lo <= p <= hi] or srt

                median_p2 = round(_stat.median(filtered))
                all_prices = [float(r['price']) for r in rows if r.get('price') and r['price'] > 0]
                srcs = list({r.get('source', '') for r in rows if r.get('source')})

                result[deal] = {
                    'price_per_m2': median_p2,
                    'price_median': round(_stat.median(all_prices)) if all_prices else None,
                    'price_min': round(min(filtered)),
                    'price_max': round(max(filtered)),
                    'analogs_count': len(rows),
                    'district': dist_kw or 'Краснодар',
                    'snapshot_date': None,
                    'sources': srcs,
                }
                for s in srcs:
                    if s and s not in result['sources']:
                        result['sources'].append(s)
                break  # нашли — не идём дальше

        # Fallback: если нет данных в market_listings — берём из снапшотов (только продажа)
        if result['sale'] is None:
            cat_safe = category.replace("'", "''")
            cur.execute(f"""
                SELECT price_per_m2_median, analogs_count, sources, snapshot_date
                FROM {SCHEMA}.price_market_snapshots
                WHERE category = '{cat_safe}' AND deal = 'sale'
                ORDER BY snapshot_date DESC LIMIT 1
            """)
            row = cur.fetchone()
            if row and row.get('analogs_count', 0) >= 2:
                result['sale'] = {
                    'price_per_m2': float(row['price_per_m2_median'] or 0),
                    'analogs_count': row['analogs_count'],
                    'district': 'Краснодар',
                    'snapshot_date': str(row['snapshot_date']) if row['snapshot_date'] else None,
                    'sources': row['sources'] if isinstance(row['sources'], list) else [],
                }

    except Exception as e:
        print(f'[noi_model] load_market_comparables error: {e}')

    return result


def load_district_benchmarks(cur, category: str, district: str) -> dict:
    """
    Загружает cap_rate, vacancy_rate и аренду из price_history по категории и району.
    Ищет сначала по точному совпадению района, затем по ключевому слову, затем по всему Краснодару.
    Возвращает dict с полями: cap_rate, vacancy, rent_per_m2_year (или None если нет данных).
    """
    result = {}
    if not category:
        return result

    # Маппинг категорий: наши типы → категории price_history
    CAT_ALIAS = {
        'hotel': 'hotel', 'restaurant': 'restaurant', 'office': 'office',
        'retail': 'retail', 'warehouse': 'warehouse', 'free_purpose': 'retail',
        'production': 'warehouse', 'building': 'office', 'gab': 'retail',
        'business': 'retail', 'car_service': 'warehouse', 'land': 'land',
    }
    ph_cat = CAT_ALIAS.get(category, category)
    cat_safe = ph_cat.replace("'", "''")

    # Ключевое слово района для нечёткого поиска
    dist_kw = ''
    if district:
        dist_kw = district.split('(')[-1].replace(')', '').strip() if '(' in district else district.split()[0]

    # Маппинг синонимов районов: как записано в listings → что ищем в price_history
    DISTRICT_ALIASES = {
        'фмр': 'ФМР', 'фестивальн': 'ФМР',
        'цмр': 'ЦМР', 'центральн': 'ЦМР',
        'юмр': 'ЮМР', 'юбилейн': 'ЮМР',
        'гмр': 'ГМР', 'гидростроит': 'ГМР',
        'пмр': 'Пашковский', 'пашковск': 'Пашковский',
        'черёмушк': 'Черемушки', 'черемушк': 'Черемушки',
        'кмр': 'Черемушки',  # нет точного соответствия — берём ближний
    }

    # Нормализуем ключевое слово района
    dist_search = dist_kw
    if dist_kw:
        dl = dist_kw.lower()
        for alias_key, alias_val in DISTRICT_ALIASES.items():
            if alias_key in dl:
                dist_search = alias_val
                break

    try:
        max_year_q = f"SELECT MAX(year) FROM {SCHEMA}.price_history WHERE category = '{cat_safe}'"

        # Шаг 1: точный район
        if dist_search:
            dist_s = dist_search.replace("'", "''")
            cur.execute(f"""
                SELECT avg_price_per_m2, avg_rent_per_m2_year, avg_cap_rate, vacancy_rate
                FROM {SCHEMA}.price_history
                WHERE category = '{cat_safe}'
                  AND year = ({max_year_q})
                  AND district_name ILIKE '%{dist_s}%'
                ORDER BY year DESC LIMIT 1
            """)
            row = cur.fetchone()
            if row and any(row.get(f) for f in ('avg_cap_rate', 'vacancy_rate', 'avg_rent_per_m2_year')):
                if row.get('avg_cap_rate'): result['cap_rate'] = float(row['avg_cap_rate'])
                if row.get('vacancy_rate'): result['vacancy'] = float(row['vacancy_rate'])
                if row.get('avg_rent_per_m2_year'): result['rent_per_m2_year'] = float(row['avg_rent_per_m2_year'])
                if row.get('avg_price_per_m2'): result['price_per_m2'] = float(row['avg_price_per_m2'])
                result['district_found'] = dist_search

        # Шаг 2: fallback — среднее по всем районам для этой категории (не первая строка!)
        if not result:
            cur.execute(f"""
                SELECT
                  ROUND(AVG(avg_cap_rate)::numeric, 2) as avg_cap_rate,
                  ROUND(AVG(vacancy_rate)::numeric, 1) as vacancy_rate,
                  ROUND(AVG(avg_rent_per_m2_year)::numeric, 0) as avg_rent_per_m2_year,
                  ROUND(AVG(avg_price_per_m2)::numeric, 0) as avg_price_per_m2
                FROM {SCHEMA}.price_history
                WHERE category = '{cat_safe}'
                  AND year = ({max_year_q})
                  AND avg_rent_per_m2_year IS NOT NULL
            """)
            row = cur.fetchone()
            if row and any(row.get(f) for f in ('avg_cap_rate', 'vacancy_rate', 'avg_rent_per_m2_year')):
                if row.get('avg_cap_rate'): result['cap_rate'] = float(row['avg_cap_rate'])
                if row.get('vacancy_rate'): result['vacancy'] = float(row['vacancy_rate'])
                if row.get('avg_rent_per_m2_year'): result['rent_per_m2_year'] = float(row['avg_rent_per_m2_year'])
                if row.get('avg_price_per_m2'): result['price_per_m2'] = float(row['avg_price_per_m2'])
                result['district_found'] = f'Краснодар (среднее, район не найден: {dist_kw or "не указан"})'
                print(f'[noi_model] district_bench fallback avg for {ph_cat}: rent={result.get("rent_per_m2_year")} vac={result.get("vacancy")}')

    except Exception as e:
        print(f'[noi_model] load_district_benchmarks error: {e}')
    return result


def load_real_indexation(cur, category: str) -> float | None:
    """
    Считает реальную среднегодовую индексацию из price_history_biweekly.
    Берёт первую и последнюю точку за последние 5 лет и вычисляет CAGR.
    """
    CAT_ALIAS = {
        'hotel': 'standalone', 'restaurant': 'catering', 'office': 'office',
        'retail': 'retail', 'warehouse': 'warehouse', 'free_purpose': 'free_purpose',
        'production': 'industrial', 'building': 'standalone', 'gab': 'retail',
        'business': 'free_purpose', 'car_service': 'industrial', 'land': None,
    }
    bw_cat = CAT_ALIAS.get(category, category)
    if not bw_cat:
        return None
    cat_safe = bw_cat.replace("'", "''")
    try:
        # Используем аренду — CAGR ставки аренды = реальная индексация для инвестора
        # Если аренды нет в biweekly — берём продажу как прокси (более консервативная оценка)
        for deal_t in ('rent', 'sale'):
            cur.execute(f"""
                SELECT date_recorded, price_per_m2
                FROM {SCHEMA}.price_history_biweekly
                WHERE category = '{cat_safe}' AND deal_type = '{deal_t}' AND price_per_m2 > 0
                  AND date_recorded >= NOW() - INTERVAL '6 years'
                ORDER BY date_recorded ASC LIMIT 1
            """)
            first = cur.fetchone()
            cur.execute(f"""
                SELECT date_recorded, price_per_m2
                FROM {SCHEMA}.price_history_biweekly
                WHERE category = '{cat_safe}' AND deal_type = '{deal_t}' AND price_per_m2 > 0
                ORDER BY date_recorded DESC LIMIT 1
            """)
            last = cur.fetchone()
            if first and last:
                break
        if not first or not last:
            return None
        p0 = float(first['price_per_m2'])
        p1 = float(last['price_per_m2'])
        if p0 <= 0 or p1 <= 0:
            return None
        # Количество лет между точками
        days = (last['date_recorded'] - first['date_recorded']).days
        years = days / 365.25
        if years < 1:
            return None
        cagr = ((p1 / p0) ** (1 / years) - 1) * 100
        # Если использовали продажу как прокси — ставки аренды исторически растут ~60% от роста цен
        if deal_t == 'sale':
            cagr = cagr * 0.6
        # Ограничиваем реалистичным диапазоном для индексации арендной ставки: 3–12%
        cagr = max(3.0, min(12.0, round(cagr, 1)))
        print(f'[noi_model] indexation {bw_cat}/{deal_t}: p0={p0:.0f} p1={p1:.0f} years={years:.1f} CAGR={cagr}%')
        return cagr
    except Exception as e:
        print(f'[noi_model] load_real_indexation error: {e}')
        return None


def load_macro_cb_rate(cur) -> float | None:
    """Возвращает актуальную ставку ЦБ из macro_indicators."""
    try:
        cur.execute(f"""
            SELECT key_rate FROM {SCHEMA}.macro_indicators
            WHERE key_rate IS NOT NULL
            ORDER BY date_recorded DESC LIMIT 1
        """)
        row = cur.fetchone()
        if row and row.get('key_rate'):
            rate = float(row['key_rate'])
            if 0 < rate < 50:
                return rate
    except Exception as e:
        print(f'[noi_model] load_macro_cb_rate error: {e}')
    return None


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
        bench = _get_benchmarks(listing, api_key, folder_id, cur=cur, conn=conn)
        try:
            save_cache(cur, conn, listing_id, bench)
        except Exception:
            pass

    # Ставка ЦБ из macro_indicators — используется как базовая ставка дисконтирования
    cb_rate = load_macro_cb_rate(cur)
    if cb_rate is not None:
        bench['cb_rate_from_db'] = cb_rate

    scenarios = build_scenarios(listing, bench, cb_rate=cb_rate)

    has_real_rent = bool(listing.get('monthly_rent') or listing.get('yearly_rent'))
    has_tenant = bool(listing.get('tenant_name') or has_real_rent)

    # Загружаем рыночные аналоги из снапшотов (АЯКС, АРРпро, Этажи и др.)
    category = listing.get('category') or ''
    district = listing.get('district') or ''
    obj_area = float(listing.get('area') or 0)
    comparables = load_market_comparables(cur, category, district, area=obj_area)

    # Рыночная ставка аренды из market_listings — уже в ₽/м²/мес, делить не нужно
    market_rent_snap = comparables.get('rent')
    if market_rent_snap and market_rent_snap.get('price_per_m2', 0) > 0:
        snap_rent_rate = round(market_rent_snap['price_per_m2'], 1)
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
        'analogs_meta': bench.get('analogs_meta') or {},
    }