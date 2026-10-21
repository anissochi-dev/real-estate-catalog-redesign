"""Построение SQL-условия для поиска объектов в админке.

Понимает:
- текст (адрес, название, район, город, собственник, арендатор, кадастровый номер) —
  без учёта регистра и с е = ё, каждое слово ищется отдельно;
- ID: «301», «#301», «id 301», «№301»;
- телефон в любом формате: «+7 918 203-10-31», «89182031031», «2031031»;
- число без единиц: ID, цена, площадь, цена за м², телефон, номер дома;
- сокращения: «5 млн», «5,5млн», «300 тыс», «300к», «1.2 млрд»;
- площадь: «240 м2», «240 м²», «240 кв.м», «240м», «12 сот»;
- цена за м²: «1500/м2», «1500 за м2»;
- диапазоны: «от 200 м», «до 100000», «до 5 млн», «от 1000 /м2».

Все значения из запроса попадают в SQL только как числа или слова из [0-9a-zа-я],
поэтому SQL-инъекция исключена.
"""

import re

_UP = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯё'
_LO = 'абвгдеежзийклмнопрстуфхцчшщъыьэюяе'


def _norm_sql(expr: str) -> str:
    return f"TRANSLATE(LOWER({expr}), '{_UP}', '{_LO}')"


HAYSTACK = _norm_sql(
    "CONCAT_WS(' ', l.title, l.address, l.real_address, l.district, l.city, "
    "l.owner_name, pc.name, l.tenant_name, l.public_code, l.cadastral_number)"
)
PRICE_TOTAL = "(CASE WHEN l.price_unit = 'm2' THEN l.price * COALESCE(l.area, 0) ELSE l.price END)"
PRICE_M2 = (
    "COALESCE(NULLIF(l.price_per_m2, 0), "
    "CASE WHEN l.price_unit = 'm2' THEN l.price ELSE l.price / NULLIF(l.area, 0) END)"
)

_NUM_RE = re.compile(
    r'(?<![\w.,])'
    r'(?:(?P<op>от|до|>=|<=|>|<)\s*)?'
    r'(?P<num>\d+(?:[ \u00a0]\d{3})*(?:[.,]\d+)?)\s*'
    r'(?P<mult>млрд|млн|миллион\w*|тыс\w*|кк|kk|т|к|k)?\.?\s*'
    r'(?P<unit>(?:/|за)\s*(?:м2|м²|кв\.?\s*м|квм|метр\w*|м)|м2|м²|кв\.?\s*м|квм|метр\w*|м|сот\w*|руб\w*|р|₽)?'
    r'\.?(?![\w²])'
)

_MULT = {'млрд': 1e9, 'кк': 1e6, 'kk': 1e6, 'млн': 1e6, 'миллион': 1e6, 'тыс': 1e3, 'т': 1e3, 'к': 1e3, 'k': 1e3}


def _fmt(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else f'{v:.4f}'


def _phone_cond(digits: str) -> str:
    variants = {digits}
    if len(digits) == 11 and digits[0] in '78':
        variants = {digits[1:]}
    parts = []
    for d in variants:
        like = f"LIKE '%{d}%'"
        parts.append(f"REGEXP_REPLACE(COALESCE(l.owner_phone, ''), '[^0-9]', '', 'g') {like}")
        parts.append(f"REGEXP_REPLACE(COALESCE(l.owner_phone2, ''), '[^0-9]', '', 'g') {like}")
        parts.append(f"REGEXP_REPLACE(COALESCE(pc.phone, ''), '[^0-9]', '', 'g') {like}")
        parts.append(
            "EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.owner_extra_contacts) = 'array' "
            "THEN l.owner_extra_contacts ELSE '[]'::jsonb END) c "
            "WHERE REGEXP_REPLACE(COALESCE(c->>'phone', '') || ' ' || COALESCE(c->>'phone2', ''), '[^0-9]', '', 'g') "
            f"{like})"
        )
    return ' OR '.join(parts)


def _range_between(expr: str, v: float) -> str:
    if float(v).is_integer():
        return f"({expr} >= {_fmt(v)} AND {expr} < {_fmt(v + 1)})"
    return f"ABS({expr} - {_fmt(v)}) < 0.05"


def _any_number_cond(digits: str) -> str:
    n = int(digits)
    parts = []
    if n <= 2147483647:
        parts.append(f"l.id = {n}")
    parts.append(f"l.price = {n}")
    parts.append(f"{PRICE_TOTAL} = {n}")
    parts.append(_range_between('l.area', n))
    parts.append(f"ROUND({PRICE_M2}) = {n}")
    parts.append(f"{HAYSTACK} LIKE '%{digits}%'")
    if len(digits) >= 5:
        parts.append(_phone_cond(digits))
    return '(' + ' OR '.join(parts) + ')'


def _criterion(op: str, num: str, mult: str, unit: str):
    try:
        v = float(num.replace(' ', '').replace('\u00a0', '').replace(',', '.'))
    except ValueError:
        return None
    if mult:
        key = next((k for k in _MULT if mult.startswith(k)), None)
        if key:
            v *= _MULT[key]
    unit = (unit or '').replace(' ', '')
    if unit.startswith('/') or unit.startswith('за'):
        kind = 'ppm'
    elif unit.startswith('сот'):
        kind = 'land'
    elif unit and (unit.startswith('м') or unit.startswith('кв')):
        kind = 'area'
    elif unit or mult or op:
        kind = 'price'
    else:
        return None
    expr = {'ppm': PRICE_M2, 'land': 'l.land_area', 'area': 'l.area', 'price': PRICE_TOTAL}[kind]
    if op in ('от', '>=', '>'):
        return f"{expr} >= {_fmt(v)}"
    if op in ('до', '<=', '<'):
        return f"{expr} <= {_fmt(v)}"
    if kind == 'price':
        return f"(l.price = {_fmt(v)} OR {PRICE_TOTAL} = {_fmt(v)})"
    if kind == 'ppm':
        return f"{PRICE_M2} BETWEEN {_fmt(v * 0.99)} AND {_fmt(v * 1.01)}"
    return _range_between(expr, v)


def build_search_condition(query: str) -> str:
    """Возвращает SQL-условие (без ведущего AND) или пустую строку."""
    s = (query or '').strip().lower().replace('ё', 'е')
    if not s:
        return ''

    m = re.fullmatch(r'(?:id|№|#)\s*(\d{1,9})', s)
    if m:
        return f"l.id = {int(m.group(1))}"

    if re.fullmatch(r'[+\d\s()\-]+', s):
        digits = re.sub(r'\D', '', s)
        if digits:
            return _any_number_cond(digits)

    conds = []

    def _sub(match):
        c = _criterion(match.group('op'), match.group('num'), match.group('mult'), match.group('unit'))
        if c is None:
            return match.group(0)
        conds.append(c)
        return ' '
    rest = _NUM_RE.sub(_sub, s)

    for tok in re.findall(r'[0-9a-zа-я]+', rest):
        if len(tok) < 2 and not tok.isdigit():
            continue
        conds.append(f"{HAYSTACK} LIKE '%{tok}%'")

    if not conds:
        return ''
    return '(' + ' AND '.join(conds) + ')'
