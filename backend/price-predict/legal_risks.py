"""
Юридическая экспертиза и оценка правовых рисков объекта.
Все проверки — детерминированные правила по данным из БД.
YandexGPT только формулирует итоговое заключение на человеческом языке.
"""

import json
import urllib.request
from datetime import datetime, timedelta

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL = 'yandexgpt-5-pro/latest'
CACHE_TTL_DAYS = 7

# ─── Справочники рисков ────────────────────────────────────────────────────────

# Риски по типу прав собственности
PROPERTY_RIGHTS_RISKS = {
    'ownership': {
        'level': 'low',
        'label': 'Собственность',
        'issues': [],
    },
    'long_lease': {
        'level': 'medium',
        'label': 'Долгосрочная аренда',
        'issues': [
            'Право аренды — не собственность. Перепродажа = переуступка прав.',
            'Необходимо проверить срок договора аренды и условия досрочного расторжения.',
            'Возможны ограничения на субаренду и улучшения.',
        ],
    },
    'short_lease': {
        'level': 'high',
        'label': 'Краткосрочная аренда',
        'issues': [
            'Краткосрочная аренда не обеспечивает стабильного владения.',
            'Риск невозобновления договора.',
            'Инвестиционная привлекательность существенно снижена.',
        ],
    },
    'shared': {
        'level': 'medium',
        'label': 'Общая долевая собственность (ОДС)',
        'issues': [
            'Требуется согласие всех сособственников на продажу/обременение.',
            'Возможны споры о порядке пользования.',
            'Преимущественное право покупки у сособственников.',
        ],
    },
    'municipal': {
        'level': 'high',
        'label': 'Муниципальная/государственная собственность',
        'issues': [
            'Особый порядок приобретения (приватизация, торги).',
            'Риск изъятия или обременений в публичных интересах.',
        ],
    },
    'unknown': {
        'level': 'high',
        'label': 'Права не указаны',
        'issues': ['Тип права собственности не указан — необходима проверка в Росреестре.'],
    },
}

# Риски по соответствию ВРИ земли и категории объекта
# Матрица: {land_vri_keyword: [допустимые категории объекта]}
VRI_CATEGORY_COMPAT = {
    'жилое': ['hotel', 'free_purpose'],
    'торговля': ['retail', 'restaurant', 'free_purpose', 'office'],
    'офис': ['office', 'free_purpose', 'retail'],
    'производство': ['production', 'warehouse', 'free_purpose'],
    'склад': ['warehouse', 'production', 'free_purpose'],
    'общепит': ['restaurant', 'retail', 'free_purpose'],
    'гостиница': ['hotel', 'free_purpose'],
    'бизнес': ['office', 'retail', 'free_purpose', 'business'],
    'сельскохозяйственн': [],  # несовместимо с коммерческой недвижимостью
    'рекреац': [],
}

def _check_vri_compatibility(category: str, land_vri: str | None) -> dict:
    """Проверяет соответствие ВРИ земли и категории объекта."""
    if not land_vri:
        return {'level': 'medium', 'message': 'ВРИ земельного участка не указан. Необходима проверка в ЕГРН.'}

    vri_lower = land_vri.lower()
    for keyword, allowed_cats in VRI_CATEGORY_COMPAT.items():
        if keyword in vri_lower:
            if not allowed_cats:
                return {
                    'level': 'critical',
                    'message': f'ВРИ "{land_vri}" может быть несовместимо с коммерческим использованием. Требуется смена ВРИ.',
                }
            if category in allowed_cats:
                return {'level': 'ok', 'message': f'ВРИ "{land_vri}" соответствует использованию.'}
            else:
                return {
                    'level': 'high',
                    'message': f'ВРИ "{land_vri}" может не соответствовать категории "{category}". Необходима юридическая проверка.',
                }
    return {'level': 'low', 'message': f'ВРИ "{land_vri}" — соответствие не определено автоматически, рекомендуется проверка.'}


# Риски по этажу (для торговли и ресторанов 1 этаж критичен)
def _check_floor_risk(category: str, floor: int | None, total_floors: int | None) -> dict | None:
    if not floor:
        return None
    if category in ('retail', 'restaurant') and floor > 2:
        return {
            'level': 'medium',
            'message': f'Торговые объекты/рестораны на {floor}-м этаже имеют пониженный трафик и спрос.',
        }
    if category == 'office' and floor == 1 and total_floors and total_floors > 3:
        return {
            'level': 'low',
            'message': 'Офис на 1-м этаже имеет более высокую нагрузку от уличного шума и безопасности.',
        }
    return None


# Риски отсутствия данных
def _check_missing_data(listing: dict) -> list:
    issues = []
    critical_fields = {
        'address':          ('medium', 'Адрес не указан — невозможна идентификация объекта в ЕГРН.'),
        'property_rights':  ('high',   'Вид права собственности не указан.'),
        'building_year':    ('low',    'Год постройки не указан — невозможна оценка физического износа.'),
        'owner_name':       ('medium', 'Имя правообладателя не указано.'),
    }
    for field, (level, msg) in critical_fields.items():
        if not listing.get(field):
            issues.append({'check': field, 'level': level, 'message': msg})
    return issues


# Риски по сроку публикации (долго висит = возможные проблемы)
def _check_days_on_market(created_at) -> dict | None:
    if not created_at:
        return None
    days = (datetime.utcnow() - created_at.replace(tzinfo=None)).days if hasattr(created_at, 'replace') else 0
    if days > 365:
        return {
            'level': 'medium',
            'message': f'Объект в продаже более {days} дней. Возможны скрытые юридические или технические проблемы.',
        }
    if days > 180:
        return {
            'level': 'low',
            'message': f'Объект в продаже {days} дней. Рекомендуется уточнить причины длительной экспозиции.',
        }
    return None


RISK_LEVEL_ORDER = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3, 'ok': 4}
RISK_LEVEL_SCORE = {'critical': 30, 'high': 15, 'medium': 7, 'low': 3, 'ok': 0}

def _overall_risk(checks: list) -> dict:
    """Агрегирует все проверки в общий уровень риска и score."""
    score = sum(RISK_LEVEL_SCORE.get(c.get('level', 'ok'), 0) for c in checks)
    worst = min(checks, key=lambda c: RISK_LEVEL_ORDER.get(c.get('level', 'ok'), 4), default=None)
    worst_level = worst['level'] if worst else 'ok'

    if score >= 30 or worst_level == 'critical':
        overall = 'critical'
        label = 'Критические риски'
    elif score >= 20 or worst_level == 'high':
        overall = 'high'
        label = 'Высокие риски'
    elif score >= 10:
        overall = 'medium'
        label = 'Умеренные риски'
    elif score > 0:
        overall = 'low'
        label = 'Низкие риски'
    else:
        overall = 'ok'
        label = 'Существенных рисков не выявлено'

    return {'level': overall, 'label': label, 'score': score}


def _gpt_conclusion(listing: dict, checks: list, overall: dict, api_key: str, folder_id: str) -> str:
    """GPT формулирует юридическое заключение — только текст, выводы по уже готовым данным."""
    issues_text = '\n'.join([
        f"[{c['level'].upper()}] {c['message']}"
        for c in checks if c.get('level') not in ('ok',)
    ]) or 'Существенных нарушений не выявлено.'

    prompt = (
        f"Объект: {listing.get('category','?')}, {listing.get('area','?')} м², "
        f"район {listing.get('district','?')}, права: {listing.get('property_rights','?')}, "
        f"ВРИ: {listing.get('land_vri','не указан')}.\n\n"
        f"Выявленные риски:\n{issues_text}\n"
        f"Общий уровень риска: {overall['label']} (score={overall['score']}).\n\n"
        f"Дай краткое юридическое заключение (3–5 предложений): что нужно проверить "
        f"в первую очередь, какие документы запросить у продавца. Только текст."
    )
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL}',
        'completionOptions': {'stream': False, 'temperature': 0.3, 'maxTokens': '350'},
        'messages': [
            {'role': 'system', 'text': 'Ты — юрист по недвижимости. Отвечай кратко и конкретно.'},
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


def handle_legal_risks(event: dict, cur, conn, api_key: str, folder_id: str) -> dict:
    """
    action=legal_risks — юридическая экспертиза объекта.
    GET ?action=legal_risks&id=123  или  POST {action, id}
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
        f"SELECT result, expires_at FROM {SCHEMA}.legal_risk_cache WHERE listing_id = %s",
        (listing_id,)
    )
    cached = cur.fetchone()
    if cached and cached['expires_at'] > datetime.utcnow():
        return {'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': json.dumps({**cached['result'], 'cached': True}, ensure_ascii=False)}

    cur.execute(
        f"SELECT id, title, category, deal, price, area, district, address, "
        f"property_rights, land_vri, land_status, building_year, floor, total_floors, "
        f"owner_name, created_at "
        f"FROM {SCHEMA}.listings WHERE id = %s AND status = 'active'",
        (listing_id,)
    )
    row = cur.fetchone()
    if not row:
        return {'statusCode': 404, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Объект не найден'})}

    listing = dict(row)
    checks = []

    # ── 1. Права собственности ───────────────────────────────────────────────
    rights_key = (listing.get('property_rights') or 'unknown').lower().replace(' ', '_')
    rights_info = PROPERTY_RIGHTS_RISKS.get(rights_key, PROPERTY_RIGHTS_RISKS['unknown'])
    if rights_info['level'] != 'low' or rights_info['issues']:
        for issue in (rights_info['issues'] or [f"Права: {rights_info['label']}"]):
            checks.append({
                'check': 'property_rights',
                'level': rights_info['level'],
                'category': 'Права собственности',
                'message': issue,
            })
    else:
        checks.append({
            'check': 'property_rights',
            'level': 'ok',
            'category': 'Права собственности',
            'message': f'Тип права "{rights_info["label"]}" — стандартный, без ограничений.',
        })

    # ── 2. ВРИ земли ─────────────────────────────────────────────────────────
    vri_check = _check_vri_compatibility(listing.get('category', ''), listing.get('land_vri'))
    checks.append({
        'check': 'land_vri',
        'category': 'ВРИ земельного участка',
        **vri_check,
    })

    # ── 3. Этаж ──────────────────────────────────────────────────────────────
    floor_check = _check_floor_risk(
        listing.get('category', ''), listing.get('floor'), listing.get('total_floors')
    )
    if floor_check:
        checks.append({'check': 'floor', 'category': 'Этажность', **floor_check})

    # ── 4. Отсутствующие данные ──────────────────────────────────────────────
    checks.extend(_check_missing_data(listing))

    # ── 5. Срок экспозиции ───────────────────────────────────────────────────
    dom_check = _check_days_on_market(listing.get('created_at'))
    if dom_check:
        checks.append({'check': 'days_on_market', 'category': 'Срок экспозиции', **dom_check})

    # ── 6. Что проверить в Росреестре — статический чек-лист ────────────────
    checklist = [
        {'item': 'Выписка ЕГРН на объект', 'priority': 'обязательно'},
        {'item': 'Выписка ЕГРН на земельный участок (если есть)', 'priority': 'обязательно'},
        {'item': 'Проверка обременений и арестов (раздел 4 ЕГРН)', 'priority': 'обязательно'},
        {'item': 'Проверка правопреемства (история смены собственников)', 'priority': 'рекомендуется'},
        {'item': 'Проверка продавца на банкротство (ЕФРСБ)', 'priority': 'обязательно'},
        {'item': 'Проверка решений суда (ГАС Правосудие)', 'priority': 'рекомендуется'},
        {'item': 'Технический план / кадастровый паспорт', 'priority': 'обязательно'},
        {'item': 'Разрешение на ввод в эксплуатацию', 'priority': 'рекомендуется'},
    ]
    if listing.get('deal') == 'rent':
        checklist.append({'item': 'Договор аренды: срок, условия расторжения, суб-аренда', 'priority': 'обязательно'})
    if listing.get('property_rights') == 'shared':
        checklist.append({'item': 'Нотариальный отказ сособственников от преим. права покупки', 'priority': 'обязательно'})

    # ── 7. Агрегация ─────────────────────────────────────────────────────────
    overall = _overall_risk(checks)

    # ── 8. GPT-заключение ────────────────────────────────────────────────────
    conclusion = _gpt_conclusion(listing, checks, overall, api_key, folder_id)

    result = {
        'listing_id': listing_id,
        'method': 'legal_risks',
        'overall': overall,
        'checks': checks,
        'checklist': checklist,
        'conclusion': conclusion,
        'cached': False,
        'calculated_at': datetime.utcnow().isoformat(),
    }

    expires = datetime.utcnow() + timedelta(days=CACHE_TTL_DAYS)
    cur.execute(
        f"INSERT INTO {SCHEMA}.legal_risk_cache (listing_id, result, expires_at) "
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
