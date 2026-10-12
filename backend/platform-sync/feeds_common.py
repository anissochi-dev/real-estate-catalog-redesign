"""Общий код функций xml-feeds и platform-sync.

ВАЖНО: файл существует в ДВУХ одинаковых копиях — backend/xml-feeds/feeds_common.py и
backend/platform-sync/feeds_common.py (каждая облачная функция собирается только из своей
папки). Меняете одну копию — скопируйте и во вторую.

Содержит:
- подключение к БД с автоповтором при «rate limit exceeded» (лимит частоты запросов БД);
- общий лимит времени вызова (браузер и шлюз обрывают запрос на ~30-й секунде);
- общие помощники (_safe, _json, _get_user, _clean_title, _split_images, _total_price).
"""

import json
import re
import time

import psycopg2
import psycopg2.extensions
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

# Жёсткий предел одного вызова: дольше 25 с нельзя — браузер/шлюз обрывают запрос (499).
CALL_LIMIT_SEC = 25
DB_RETRY_DELAYS = (1, 2, 3)

_call = {'t0': time.monotonic(), 'deadline': time.monotonic() + CALL_LIMIT_SEC}


def start_call(work_sec):
    """Отмечает начало вызова. work_sec — сколько секунд от старта отведено на работу
    (остаток до CALL_LIMIT_SEC — запас на запись результата и ответ)."""
    now = time.monotonic()
    _call['t0'] = now
    _call['deadline'] = now + work_sec


def call_elapsed_ms():
    return int((time.monotonic() - _call['t0']) * 1000)


def time_left():
    return _call['deadline'] - time.monotonic()


def budget_exceeded(start_ts, budget_sec):
    """Собственный бюджет шага ИЛИ общий предел вызова — что наступит раньше."""
    now = time.monotonic()
    return (now - start_ts > budget_sec) or now >= _call['deadline']


def http_timeout(default):
    """Тайм-аут внешнего запроса не дольше остатка времени вызова (минимум 2 с)."""
    return max(2.0, min(float(default), time_left() + 2.0))


def is_rate_limit(e):
    s = str(e).lower()
    return 'rate limit' in s


def _is_read(query):
    q = query.decode('utf-8', 'ignore') if isinstance(query, (bytes, bytearray)) else str(query)
    head = q.lstrip()[:10].upper()
    return head.startswith('SELECT') or head.startswith('WITH') or head.startswith('SHOW')


class RetryConnection(psycopg2.extensions.connection):
    """Соединение, которое помнит, были ли незакоммиченные записи в текущей транзакции."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._dirty = False

    def commit(self):
        super().commit()
        self._dirty = False

    def rollback(self):
        super().rollback()
        self._dirty = False


class RetryCursor(RealDictCursor):
    """Курсор с повтором запроса при «rate limit exceeded» (пауза 1/2/3 с).

    Повторяет только если в текущей транзакции ещё не было незакоммиченных записей —
    иначе откат стёр бы их, и повтор одного запроса дал бы полуготовые данные. В этом
    случае ошибка пробрасывается выше, и вызывающий код повторяет свою порцию целиком."""

    def execute(self, query, vars=None):
        conn = self.connection
        for i in range(len(DB_RETRY_DELAYS) + 1):
            try:
                res = super().execute(query, vars)
                if not _is_read(query):
                    conn._dirty = True
                return res
            except (psycopg2.errors.QueryCanceled, psycopg2.OperationalError) as e:
                if not is_rate_limit(e) or i == len(DB_RETRY_DELAYS):
                    raise
                had_writes = getattr(conn, '_dirty', False)
                try:
                    conn.rollback()
                except Exception:
                    pass
                if had_writes:
                    raise
                print(f'[db] rate limit, повтор через {DB_RETRY_DELAYS[i]} с')
                time.sleep(DB_RETRY_DELAYS[i])


def db_connect(dsn):
    for i in range(len(DB_RETRY_DELAYS) + 1):
        try:
            return psycopg2.connect(dsn, connection_factory=RetryConnection, cursor_factory=RetryCursor)
        except psycopg2.OperationalError as e:
            if not is_rate_limit(e) or i == len(DB_RETRY_DELAYS):
                raise
            time.sleep(DB_RETRY_DELAYS[i])


def busy_response():
    """Ответ «сервер занят» — фронтенд показывает «Сервер занят, повторяю…» и повторяет."""
    return _json({'error': 'Сервер занят, повторите через несколько секунд', 'busy': True}, 503)


def _safe(s, length=255):
    return (s or '').replace("'", "''")[:length]


def _json(data, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(data, ensure_ascii=False, default=str),
    }


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _auth_token(event, params=None):
    h = event.get('headers') or {}
    return h.get('X-Auth-Token') or h.get('x-auth-token') or (params or {}).get('token') or ''


_TITLE_DASH_RE = re.compile(r'[–—/]')
_TITLE_STRIP_RE = re.compile(r'[№\\&*#@^_~`|<>{}\[\]]')


def _clean_title(s):
    """Убирает из названия объекта спецсимволы, запрещённые/проблемные для площадок
    (ЦИАН, Авито и т.д.): «»→", тире –/— и слэш /→- (чтобы не терять номера домов вида
    22/3), № \\ & и прочий XML-непригодный мусор — удаляются.
    Используется единообразно во ВСЕХ фидах, чтобы название никогда не улетало со спецсимволами."""
    if not s:
        return ''
    s = str(s)
    s = s.replace('«', '"').replace('»', '"')
    s = _TITLE_DASH_RE.sub('-', s)
    s = _TITLE_STRIP_RE.sub('', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _split_images(row):
    if row.get('images'):
        return [u.strip() for u in str(row['images']).split('|') if u.strip()]
    if row.get('image'):
        return [row['image']]
    return []


def _total_price(l):
    """Возвращает итоговую цену объекта в рублях.

    Если price_unit == 'm2' — умножаем на площадь. НО защищаемся от кривых данных:
    если price уже больше 200 000 ₽ (явно не цена за м²), считаем что это уже итоговая цена.
    Это предотвращает выгрузку нереальных сумм (миллиарды) при ошибочно проставленном
    price_unit на объектах с уже общей ценой.

    Если price_unit == 'sotka' (актуально для земли) — умножаем на площадь участка в сотках
    (land_area), с той же защитой от кривых данных.
    """
    raw = l.get('price') or 0
    try:
        price = float(raw)
    except (TypeError, ValueError):
        return 0
    if l.get('price_unit') == 'm2' and l.get('area'):
        try:
            area = float(l['area'])
        except (TypeError, ValueError):
            area = 0
        # Адекватная цена за м² для коммерческой недвижимости — до 200 000 ₽.
        # Если price > 200 000 при unit=m2, значит данные кривые и в price уже итоговая сумма.
        if 0 < price <= 200_000 and area > 0:
            return int(price * area)
    if l.get('price_unit') == 'sotka' and l.get('land_area'):
        try:
            sotki = float(l['land_area'])
        except (TypeError, ValueError):
            sotki = 0
        # Адекватная цена за сотку — до 50 млн ₽. Если price выше, значит это уже итоговая сумма.
        if 0 < price <= 50_000_000 and sotki > 0:
            return int(price * sotki)
    return int(price)
