"""
core.py — ядро social-parser.
Антибан-лимиты, HTTP с куки, парсинг текста объявления, сохранение в market_listings.
"""

import os
import re
import json
import time
import random
import datetime
import urllib.request
import urllib.error
import urllib.parse
import gzip as _gzip

import psycopg2
import psycopg2.extras

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}

# ═══════════════════════════════════════════════════════════════════════════════
# АНТИБАН — ЛИМИТЫ ПО ПЛАТФОРМАМ
# ═══════════════════════════════════════════════════════════════════════════════
# Ключевые принципы:
#  1. Случайные паузы (не ровные интервалы — выглядит как бот)
#  2. Рабочие часы — не парсим ночью
#  3. Лимиты в час и в сутки
#  4. При 429/403 — экспоненциальная пауза

LIMITS = {
    'vk': {
        'pause_min': 2.0,       # мин пауза между запросами (сек)
        'pause_max': 5.0,       # макс пауза
        'per_hour': 200,        # запросов в час
        'per_day': 1000,        # запросов в сутки
        'work_hours': (9, 23),  # рабочие часы (МСК)
        'block_pause_min': 30,  # пауза при бане (мин)
    },
    'ok': {
        'pause_min': 3.0,
        'pause_max': 6.0,
        'per_hour': 150,
        'per_day': 800,
        'work_hours': (9, 23),
        'block_pause_min': 60,
    },
    'telegram': {
        'pause_min': 0.5,       # Telegram мягче
        'pause_max': 2.0,
        'per_hour': 500,
        'per_day': 3000,
        'work_hours': (0, 24),  # круглосуточно
        'block_pause_min': 5,
    },
}

# User-Agent пул — имитируем реальные браузеры
UA_POOL = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
]

MAX_HTML = 800_000


# ═══════════════════════════════════════════════════════════════════════════════
# БАЗА ДАННЫХ
# ═══════════════════════════════════════════════════════════════════════════════

def get_conn():
    return psycopg2.connect(
        os.environ['DATABASE_URL'],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def get_session(conn, platform: str) -> dict | None:
    """Возвращает активную незаблокированную сессию для платформы."""
    cur = conn.cursor()
    cur.execute(
        f"SELECT * FROM {SCHEMA}.social_sessions "
        f"WHERE platform=%s AND is_active=TRUE AND is_blocked=FALSE "
        f"AND (blocked_until IS NULL OR blocked_until < NOW()) "
        f"ORDER BY last_request_at ASC NULLS FIRST LIMIT 1",
        (platform,)
    )
    row = cur.fetchone()
    cur.close()
    return dict(row) if row else None


def mark_blocked(conn, session_id: int, minutes: int = 60):
    """Помечает сессию как заблокированную на N минут."""
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {SCHEMA}.social_sessions "
        f"SET is_blocked=TRUE, blocked_until=NOW()+INTERVAL '{minutes} minutes', updated_at=NOW() "
        f"WHERE id=%s",
        (session_id,)
    )
    conn.commit()
    cur.close()
    print(f'[social] session {session_id} blocked for {minutes} min')


def increment_counters(conn, session_id: int):
    """Увеличивает счётчики запросов сессии."""
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {SCHEMA}.social_sessions "
        f"SET requests_today=requests_today+1, requests_hour=requests_hour+1, "
        f"last_request_at=NOW(), updated_at=NOW() WHERE id=%s",
        (session_id,)
    )
    conn.commit()
    cur.close()


def reset_hour_counters(conn):
    """Сбрасывает счётчики за час (вызывается при начале нового часа)."""
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {SCHEMA}.social_sessions "
        f"SET requests_hour=0, last_reset_at=NOW() "
        f"WHERE last_reset_at < NOW() - INTERVAL '1 hour'"
    )
    conn.commit()
    cur.close()


def get_sources(conn, platform: str) -> list[dict]:
    """Возвращает активные источники для платформы."""
    cur = conn.cursor()
    cur.execute(
        f"SELECT * FROM {SCHEMA}.social_parser_sources "
        f"WHERE platform=%s AND is_active=TRUE ORDER BY last_parsed_at ASC NULLS FIRST",
        (platform,)
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    return rows


def update_source(conn, source_id_db: int, posts_found: int):
    """Обновляет время последнего парсинга источника."""
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {SCHEMA}.social_parser_sources "
        f"SET last_parsed_at=NOW(), posts_found=posts_found+%s "
        f"WHERE id=%s",
        (posts_found, source_id_db)
    )
    conn.commit()
    cur.close()


def save_to_market(conn, records: list[dict]) -> tuple[int, int]:
    """Сохраняет найденные объявления в market_listings."""
    if not records:
        return 0, 0
    inserted = updated = 0
    cur = conn.cursor()
    for rec in records:
        ext_id = str(rec.get('external_id') or '')[:200]
        if not ext_id:
            continue
        cur.execute(
            f"INSERT INTO {SCHEMA}.market_listings "
            f"(source, external_id, url, title, category, deal_type, "
            f"price, price_per_m2, area, address, district, phone, description, scraped_at) "
            f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW()) "
            f"ON CONFLICT (source, external_id) DO UPDATE SET "
            f"price=EXCLUDED.price, title=EXCLUDED.title, description=EXCLUDED.description, "
            f"phone=EXCLUDED.phone, scraped_at=NOW()",
            (
                rec.get('source', 'social')[:50],
                ext_id,
                (rec.get('url') or '')[:500] or None,
                (rec.get('title') or '')[:500] or None,
                rec.get('category', 'other'),
                rec.get('deal_type', 'sale'),
                rec.get('price'),
                rec.get('price_per_m2'),
                rec.get('area'),
                (rec.get('address') or '')[:500] or None,
                (rec.get('district') or '')[:200] or None,
                (rec.get('phone') or '')[:50] or None,
                (rec.get('description') or '')[:1000] or None,
            )
        )
        if cur.rowcount == 1:
            inserted += 1
        else:
            updated += 1
    conn.commit()
    cur.close()
    return inserted, updated


def log_run(conn, platform: str, source_id: str, status: str,
            posts_found: int = 0, posts_saved: int = 0, error_msg: str = '') -> int:
    """Создаёт запись в social_parser_log. Возвращает id записи."""
    cur = conn.cursor()
    cur.execute(
        f"INSERT INTO {SCHEMA}.social_parser_log "
        f"(platform, source_id, status, posts_found, posts_saved, error_msg, finished_at) "
        f"VALUES (%s,%s,%s,%s,%s,%s,NOW()) RETURNING id",
        (platform, source_id, status, posts_found, posts_saved, error_msg or None)
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    return row['id'] if row else 0


# ═══════════════════════════════════════════════════════════════════════════════
# HTTP С АНТИБАН-ЗАЩИТОЙ
# ═══════════════════════════════════════════════════════════════════════════════

def _build_headers(platform: str, cookies_str: str = '', referer: str = '') -> dict:
    """Строит заголовки запроса с куки и случайным UA."""
    headers = {
        'User-Agent': random.choice(UA_POOL),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
    }
    if referer:
        headers['Referer'] = referer
    if cookies_str:
        # cookies_str — JSON строка {'key': 'value', ...}
        try:
            cookies = json.loads(cookies_str)
            cookie_header = '; '.join(f'{k}={v}' for k, v in cookies.items())
            headers['Cookie'] = cookie_header
        except Exception:
            pass
    # Специфичные заголовки по платформе
    if platform == 'vk':
        headers['Referer'] = referer or 'https://vk.com/'
    elif platform == 'ok':
        headers['Referer'] = referer or 'https://ok.ru/'
    return headers


def safe_fetch(url: str, platform: str, conn, session: dict,
               timeout: int = 20) -> str | None:
    """
    HTTP GET с антибан-защитой:
    1. Проверяет лимиты сессии
    2. Случайная пауза
    3. При 429/403 — блокирует сессию и возвращает None
    4. Инкрементирует счётчики при успехе
    """
    limits = LIMITS.get(platform, LIMITS['vk'])
    session_id = session['id']

    # Проверяем рабочие часы
    hour_now = datetime.datetime.now().hour
    wh_start, wh_end = limits['work_hours']
    if wh_end < 24 and not (wh_start <= hour_now < wh_end):
        print(f'[{platform}] вне рабочих часов ({hour_now}:00), пропускаем')
        return None

    # Проверяем лимиты
    if (session.get('requests_hour') or 0) >= limits['per_hour']:
        print(f'[{platform}] лимит часа исчерпан ({limits["per_hour"]} req/h)')
        return None
    if (session.get('requests_today') or 0) >= limits['per_day']:
        print(f'[{platform}] лимит суток исчерпан ({limits["per_day"]} req/day)')
        return None

    # Случайная пауза (имитация живого пользователя)
    pause = random.uniform(limits['pause_min'], limits['pause_max'])
    time.sleep(pause)

    cookies_str = session.get('cookies') or ''
    headers = _build_headers(platform, cookies_str, url)

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(MAX_HTML)
            if resp.headers.get('Content-Encoding', '') == 'gzip':
                try:
                    raw = _gzip.decompress(raw)
                except Exception:
                    pass
            enc = resp.headers.get_content_charset() or 'utf-8'
            html = raw.decode(enc, errors='replace')

        # Успех — инкрементируем счётчики
        increment_counters(conn, session_id)
        # Обновляем кэш счётчиков в session dict
        session['requests_hour'] = (session.get('requests_hour') or 0) + 1
        session['requests_today'] = (session.get('requests_today') or 0) + 1
        return html

    except urllib.error.HTTPError as e:
        if e.code == 429:
            # Rate limit — пауза пропорционально Retry-After
            retry_after = int(e.headers.get('Retry-After', limits['block_pause_min'] * 60))
            pause_min = min(retry_after // 60 * 2, limits['block_pause_min'] * 2)
            print(f'[{platform}] 429 Rate Limit, блокируем на {pause_min} мин')
            mark_blocked(conn, session_id, pause_min)
        elif e.code == 403:
            print(f'[{platform}] 403 Forbidden, блокируем на {limits["block_pause_min"]} мин')
            mark_blocked(conn, session_id, limits['block_pause_min'])
        else:
            print(f'[{platform}] HTTP {e.code}: {url}')
        return None
    except Exception as ex:
        print(f'[{platform}] ошибка: {ex}: {url}')
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# ПАРСИНГ ТЕКСТА ОБЪЯВЛЕНИЯ
# ═══════════════════════════════════════════════════════════════════════════════

# Ключевые слова — это объявление о коммерческой недвижимости
REALESTATE_KEYWORDS = [
    'сдам', 'сдаю', 'аренда', 'арендую', 'продам', 'продаю', 'продажа',
    'офис', 'склад', 'торгов', 'помещение', 'здание', 'псн', 'свободн',
    'производств', 'общепит', 'гараж', 'земел', 'участок', 'габ',
    'арендный бизнес', 'готовый бизнес', 'м²', 'кв.м', 'кв м',
    'руб/м', 'руб./м', '₽/м', 'коммерч',
]

DEAL_KEYWORDS_RENT = ['сдам', 'сдаю', 'аренда', 'снять', 'rent', 'арендую']
DEAL_KEYWORDS_SALE = ['продам', 'продаю', 'продажа', 'купить', 'sale']

CAT_KEYWORDS = {
    'office':       ['офис', 'офисн'],
    'retail':       ['торгов', 'магазин', 'торгово', 'ритейл'],
    'warehouse':    ['склад', 'складск'],
    'production':   ['производств', 'цех', 'промышл'],
    'catering':     ['общепит', 'кафе', 'ресторан', 'столов'],
    'free_purpose': ['псн', 'свободн', 'назначен'],
    'building':     ['здание', 'здани', 'отдельно стоящ'],
    'land':         ['земел', 'участок', 'земля'],
    'car_service':  ['автосерв', 'автомойк', 'гараж'],
    'gab':          ['арендный бизнес', 'готовый бизнес', 'с арендатором', 'доходность', 'окупаемост'],
}

DISTRICT_MAP = {
    'фмр': 'ФМР', 'фестивальн': 'ФМР', 'чистяковск': 'ФМР',
    'цмр': 'ЦМР', 'центр': 'ЦМР', 'красная': 'ЦМР',
    'юмр': 'ЮМР', 'юбилейн': 'ЮМР',
    'гидростроит': 'Гидрострой',
    'музыкальн': 'Музыкальный',
    'прикубанск': 'Прикубанский', 'черёмушк': 'Прикубанский', 'черемушк': 'Прикубанский',
    'карасунск': 'Карасунский', 'ростовск': 'Карасунский',
    'западн': 'Западный',
    'новознаменск': 'Новознаменский',
}


def is_realestate_post(text: str) -> bool:
    """Быстрая проверка — это объявление о коммерческой недвижимости?"""
    t = (text or '').lower()
    matches = sum(1 for kw in REALESTATE_KEYWORDS if kw in t)
    return matches >= 2  # минимум 2 ключевых слова


def parse_post_text(text: str, source: str, post_id: str, url: str = '') -> dict | None:
    """
    Извлекает структурированные данные из текста поста.
    Возвращает словарь для market_listings или None если не объявление.
    """
    if not is_realestate_post(text):
        return None

    t = text.lower()

    # Тип сделки
    deal_type = 'sale'
    if any(kw in t for kw in DEAL_KEYWORDS_RENT):
        deal_type = 'rent'
    elif any(kw in t for kw in DEAL_KEYWORDS_SALE):
        deal_type = 'sale'

    # Категория (первое совпадение с приоритетом GAB)
    category = 'other'
    for cat, keywords in CAT_KEYWORDS.items():
        if any(kw in t for kw in keywords):
            category = cat
            break

    # Цена
    price = None
    for pattern in [
        r'([\d\s]{4,})\s*(?:руб|₽|р\.)',
        r'([\d\s]{4,})\s*(?:т\.?р|тыс)',  # 500 тр = 500 000
    ]:
        m = re.search(pattern, text, re.I)
        if m:
            raw = re.sub(r'[^\d]', '', m.group(1))
            if raw:
                v = int(raw)
                # если "тр" или "тыс" — умножаем на 1000
                if 'тыс' in m.group(0).lower() or 'т.р' in m.group(0).lower() or ' тр' in m.group(0).lower():
                    if v < 100_000:
                        v *= 1000
                if deal_type == 'sale' and 100_000 <= v <= 5_000_000_000:
                    price = v
                    break
                elif deal_type == 'rent' and 3_000 <= v <= 10_000_000:
                    price = v
                    break

    # Площадь
    area = None
    for pattern in [r'([\d,\.]+)\s*м[²2²]', r'([\d,\.]+)\s*кв\.?\s*м']:
        m = re.search(pattern, text, re.I)
        if m:
            try:
                v = float(m.group(1).replace(',', '.'))
                if 1 <= v <= 200_000:
                    area = v
                    break
            except Exception:
                pass

    # Цена за м²
    price_per_m2 = None
    m_ppm2 = re.search(r'([\d\s,\.]+)\s*(?:руб|₽)\s*/\s*м', text, re.I)
    if m_ppm2:
        try:
            price_per_m2 = float(re.sub(r'[^\d.,]', '', m_ppm2.group(1)).replace(',', '.'))
        except Exception:
            pass
    if not price_per_m2 and price and area and area > 0:
        price_per_m2 = round(price / area, 2)

    # Адрес (ищем ул., пр., пер., переулок, улица)
    address = None
    addr_patterns = [
        r'(?:ул\.?|улица|пр\.?|просп\.?|переулок|пер\.?|бульвар|бул\.?)\s+[А-Яа-яёЁ\w\-«»"]{2,}(?:\s*[,/]\s*д?\.?\s*\d+[а-яА-Я]?)?',
        r'[А-Яа-яёЁ][А-Яа-яёЁ\s\-]{4,30}(?:ул|улица|пр|просп|переулок|пер)',
    ]
    for p in addr_patterns:
        m = re.search(p, text, re.I)
        if m:
            address = m.group(0).strip()[:200]
            break

    # Район
    district = None
    for kw, dist in DISTRICT_MAP.items():
        if kw in t:
            district = dist
            break

    # Телефон
    phone = None
    phone_m = re.search(r'(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}', text)
    if phone_m:
        phone = re.sub(r'[^\d+]', '', phone_m.group(0))[:20]

    # Заголовок — первая строка текста
    title = text.strip().split('\n')[0][:200]

    return {
        'source': source,
        'external_id': f'{source}_{post_id}',
        'url': url or None,
        'title': title,
        'description': text[:1000],
        'category': category,
        'deal_type': deal_type,
        'price': price,
        'price_per_m2': price_per_m2,
        'area': area,
        'address': address,
        'district': district,
        'phone': phone,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# АВТОРИЗАЦИЯ
# ═══════════════════════════════════════════════════════════════════════════════

def check_auth(event: dict) -> dict | None:
    """Проверяет X-Auth-Token, возвращает user или None."""
    headers_ev = event.get('headers') or {}
    headers_lc = {k.lower(): v for k, v in headers_ev.items()}
    token = (
        headers_lc.get('x-auth-token') or
        headers_lc.get('x-authorization', '').replace('Bearer ', '')
    )
    if not token:
        return None
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.users u "
        f"JOIN {SCHEMA}.sessions s ON s.user_id=u.id "
        f"WHERE s.token=%s AND s.expires_at>NOW() LIMIT 1",
        (token,)
    )
    user = cur.fetchone()
    cur.close()
    conn.close()
    if user and user['role'] in ('admin', 'director'):
        return dict(user)
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# HTTP-ОТВЕТЫ
# ═══════════════════════════════════════════════════════════════════════════════

def ok(body: dict) -> dict:
    return {
        'statusCode': 200,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }

def err(msg: str, status: int = 400) -> dict:
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps({'error': msg}, ensure_ascii=False),
    }

def cors_ok() -> dict:
    return {'statusCode': 200, 'headers': CORS, 'body': ''}
