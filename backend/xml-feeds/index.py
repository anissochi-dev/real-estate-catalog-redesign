"""
Business: XML-фиды для выгрузки объектов на площадки (Яндекс.Недвижимость, Авито, ЦИАН, ДомКлик,
«Разное», Маркет, VK Товары) — статические файлы в S3+CDN, собираются порциями до 10 фидов
за вызов (вызов укладывается в 25 с), + импорт объектов из XML Яндекс.Недвижимости.
Синхронизация кабинетов площадок вынесена в функцию platform-sync.
Args: event с httpMethod GET/POST, queryStringParameters {action}
Returns: JSON
"""

import hashlib
import json
import os
import re
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import boto3
from psycopg2.extras import execute_values

from feeds_common import (
    SCHEMA, _auth_token, _clean_title, _get_user, _json, _safe, _split_images, _total_price,
    busy_response, call_elapsed_ms, db_connect, is_rate_limit, start_call, time_left,
)

S3_BUCKET = 'files'
S3_ENDPOINT = 'https://bucket.poehali.dev'
CDN_BASE = 'https://cdn.poehali.dev'
STATIC_REGEN_MINUTES = 20

# Порция: не больше 10 фидов за вызов. Новый фид в порции начинаем, только если до конца
# рабочего окна (20 с от начала вызова) осталось больше FEED_MIN_LEFT_SEC.
FEED_BATCH_SIZE = 10
FEED_WORK_SEC = 20
FEED_MIN_LEFT_SEC = 3
BUILD_LOCK_NAME = 'xml-feeds-build'
BUILD_LOCK_TTL_SEC = 40

# Адрес новой функции синхронизации площадок — сюда пересылается вебхук Юлы,
# зарегистрированный на старом адресе xml-feeds.
PLATFORM_SYNC_URL = 'https://functions.poehali.dev/fd00362c-a377-4d94-816c-c5a4abf087cd'

CONTROL_CHARS_RE = re.compile(r'[\x00-\x08\x0B\x0C\x0E-\x1F]')
XML_DECL_RE = re.compile(r'^<\?xml[^?]*\?>', re.IGNORECASE)
CDATA_RE = re.compile(r'<!\[CDATA\[.*?\]\]>', re.DOTALL)
TAG_RE = re.compile(r'<(/?)([A-Za-z_][\w.-]*)((?:\s+[^<>]*?)?)\s*(/?)>')


def _autofix_xml(text):
    """Чинит типичные косяки XML: BOM, мусор перед декларацией, неэкранированные &/<, управляющие символы."""
    fixes = []
    if not text:
        return text, fixes

    if text.startswith('\ufeff'):
        text = text.lstrip('\ufeff')
        fixes.append('removed BOM')

    stripped = text.lstrip()
    if stripped != text:
        text = stripped
        fixes.append('stripped leading whitespace')

    if CONTROL_CHARS_RE.search(text):
        text = CONTROL_CHARS_RE.sub('', text)
        fixes.append('removed control chars')

    parts = []
    last = 0
    for m in CDATA_RE.finditer(text):
        parts.append(('text', text[last:m.start()]))
        parts.append(('cdata', m.group(0)))
        last = m.end()
    parts.append(('text', text[last:]))

    rebuilt = []
    fixed_amp = 0
    fixed_lt = 0
    for kind, seg in parts:
        if kind == 'cdata':
            rebuilt.append(seg)
            continue
        new_seg = re.sub(r'&(?![a-zA-Z#]+;)', '&amp;', seg)
        if new_seg != seg:
            fixed_amp += 1
        seg = new_seg

        out = []
        i = 0
        n = len(seg)
        while i < n:
            ch = seg[i]
            if ch == '<':
                m = TAG_RE.match(seg, i)
                if m:
                    out.append(m.group(0))
                    i = m.end()
                    continue
                if seg.startswith('<!--', i):
                    end = seg.find('-->', i + 4)
                    if end != -1:
                        out.append(seg[i:end + 3])
                        i = end + 3
                        continue
                if seg.startswith('<?', i):
                    end = seg.find('?>', i + 2)
                    if end != -1:
                        out.append(seg[i:end + 2])
                        i = end + 2
                        continue
                if seg.startswith('<!', i):
                    end = seg.find('>', i + 2)
                    if end != -1:
                        out.append(seg[i:end + 1])
                        i = end + 1
                        continue
                out.append('&lt;')
                fixed_lt += 1
                i += 1
            else:
                out.append(ch)
                i += 1
        rebuilt.append(''.join(out))

    text = ''.join(rebuilt)
    if fixed_amp:
        fixes.append("escaped '&' to '&amp;'")
    if fixed_lt:
        fixes.append(f"escaped {fixed_lt} stray '<' to '&lt;'")

    if not XML_DECL_RE.match(text):
        text = '<?xml version="1.0" encoding="UTF-8"?>\n' + text
        fixes.append('added XML declaration')

    return text, fixes


def _xml_escape(s):
    if s is None:
        return ''
    s = str(s)
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


_CIAN_DESC_DASH_RE = re.compile(r'–')
_CIAN_DESC_STRIP_RE = re.compile(r'[№/\\]')
CIAN_DESC_MIN_LEN = 15
CIAN_DESC_MAX_LEN = 3000


def _clean_cian_description(s):
    """Приводит описание объекта к требованиям ЦИАН (см. документацию xml_import/doc):
    объём 15–3000 символов; символ & запрещён — удаляется; « заменяется на ", – на -;
    символы №, /, \\ удаляются. Возвращает None, если после очистки текст короче 15
    символов (объект в этом случае не пройдёт модерацию ЦИАН из-за слишком короткого описания)."""
    if not s:
        return None
    s = str(s)
    s = s.replace('&', '')
    s = s.replace('«', '"').replace('»', '"')
    s = _CIAN_DESC_DASH_RE.sub('-', s)
    s = _CIAN_DESC_STRIP_RE.sub('', s)
    # ']]>' внутри текста преждевременно закрыл бы CDATA-секцию
    s = s.replace(']]>', ']] >')
    s = re.sub(r'\n{3,}', '\n\n', s).strip()
    if len(s) > CIAN_DESC_MAX_LEN:
        s = s[:CIAN_DESC_MAX_LEN].rstrip()
    if len(s) < CIAN_DESC_MIN_LEN:
        return None
    return s


def _s3_client():
    return boto3.client(
        's3',
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def _cdn_url(key):
    project_id = os.environ['AWS_ACCESS_KEY_ID']
    return f"{CDN_BASE}/projects/{project_id}/bucket/{key}"


class FeedCache:
    """Данные, общие для всех фидов одного вызова: читаются из БД ОДИН раз.
    Раньше каждый фид заново читал объекты, настройки, города и справочник ВРИ —
    около 250 запросов на проход по 51 фиду, что упиралось в лимит частоты БД."""

    def __init__(self, cur):
        self.cur = cur
        self._listings = {}
        self._company = None
        self._vri = None
        self._regions = None

    def listings(self, where_sql):
        if where_sql not in self._listings:
            self.cur.execute(f"SELECT * FROM {SCHEMA}.listings WHERE {where_sql} ORDER BY created_at DESC")
            self._listings[where_sql] = [dict(r) for r in self.cur.fetchall()]
        # Свежие копии строк на каждый фид — генераторы форматов меняют поля объекта.
        return [dict(r) for r in self._listings[where_sql]]

    def company(self):
        if self._company is None:
            self.cur.execute(f"SELECT * FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
            self._company = dict(self.cur.fetchone() or {})
        return dict(self._company)

    def vri_map(self):
        if self._vri is None:
            self.cur.execute(f"SELECT slug, name FROM {SCHEMA}.land_vri")
            self._vri = {r['slug']: r['name'] for r in self.cur.fetchall()}
        return self._vri

    def city_region_map(self):
        if self._regions is None:
            self.cur.execute(f"SELECT name, region FROM {SCHEMA}.cities WHERE region IS NOT NULL")
            self._regions = {r['name']: r['region'] for r in self.cur.fetchall()}
        return self._regions


def _build_feed_xml(cache, feed_slug, fmt, filter_category, filter_deal, market_category_map=None, use_jpg_photos=None, max_listings=None, custom_phone=None):
    """Собирает XML для одной площадки из текущего состояния БД.
    Набор объектов зависит от ФОРМАТА (fmt), а не от slug — так несколько фидов
    с разными названиями (например «М2» и «Яндекс.Недвижимость») могут использовать
    один и тот же формат yandex и брать один и тот же набор объектов с галочкой экспорта."""
    where = ["status = 'active'", "(is_visible IS NULL OR is_visible = TRUE)"]
    if filter_category:
        where.append(f"category = '{_safe(filter_category, 50)}'")
    if filter_deal:
        where.append(f"deal = '{_safe(filter_deal, 20)}'")
    if fmt == 'yandex':
        where.append("export_yandex = TRUE")
    elif fmt == 'avito':
        where.append("export_avito = TRUE")
    elif fmt == 'cian':
        where.append("export_cian = TRUE")
    elif fmt == 'youla':
        # Юла — отдельная платная площадка со своим независимым флагом на объекте
        # (как у Я/А/Ц), формат XML использует ту же yandex-схему.
        where.append("export_youla = TRUE")
    elif fmt == 'domclick':
        # ДомКлик — свой независимый флаг на объекте (ручной выбор, как у Авито),
        # формат XML использует ту же yandex-схему, выгружается от лица агентства.
        where.append("export_domclick = TRUE")
    elif fmt == 'other':
        # Площадки группы «Разное» (realtymag, rucountry и т.п.) — универсальные бесплатные
        # каталоги без API. Один общий флаг «Р» на объекте включает выгрузку сразу во ВСЕ
        # такие площадки одновременно (в отличие от Я/А/Ц/Ю, у каждой из которых свой флаг).
        where.append("export_other = TRUE")
    elif fmt in ('market', 'market_vk'):
        # YML-фиды товаров (Яндекс.Маркет, VK Товары) — используют тот же флаг, что и
        # группа «Разное» (отдельного флага на объекте не заводим, чтобы не плодить
        # галочки в карточке).
        where.append("export_other = TRUE")

    # ORDER BY created_at DESC — единая точка сортировки для ВСЕХ форматов и площадок:
    # самые свежие (недавно добавленные на сайт) объекты всегда идут первыми в фиде.
    # Одинаковая выборка (например у 43 фидов «Разное») читается из БД один раз за вызов.
    listings = cache.listings(' AND '.join(where))

    # dnr.red принимает только объекты в аренду (единственная категория площадки —
    # id=339) — фильтруем ДО среза max_listings, иначе лимит отрезал бы самые свежие
    # объекты по ВСЕМ сделкам (включая продажу), а не по аренде, и в фид могло попасть
    # меньше объектов, чем реально доступно и разрешено площадкой.
    if fmt == 'other' and feed_slug == 'dnr-red':
        listings = [l for l in listings if l.get('deal') == 'rent']

    if max_listings:
        # Ограничение площадки на количество объектов в фиде (например Doska.ru — 100,
        # dnr.red — 50): берём самые свежие (список уже отсортирован по created_at DESC,
        # для dnr.red — уже отфильтрован по аренде) — по мере появления новых объектов
        # старые автоматически перестают попадать в выгрузку.
        listings = listings[:max_listings]

    _vri_map = cache.vri_map()
    for l in listings:
        for k in ('created_at', 'updated_at', 'feed_bump_at'):
            if l.get(k):
                l[k] = l[k].isoformat()
        if l.get('category') == 'land' and not l.get('land_area') and l.get('area'):
            try:
                l['land_area'] = round(float(l['area']) / 100, 2)
            except (TypeError, ValueError):
                pass
        if l.get('land_vri') and l['land_vri'] in _vri_map:
            # Сохраняем исходный slug (нужен ЦИАН-фиду для маппинга на PermittedUseType),
            # а само поле land_vri заменяем на человекочитаемое название для Яндекс/Авито.
            l['_land_vri_slug'] = l['land_vri']
            l['land_vri'] = _vri_map[l['land_vri']]

    company = cache.company()
    # Подменный телефон конкретного фида (например для отслеживания звонков с площадки) —
    # если указан, все генераторы формата (_build_yandex/_build_avito/_build_cian/
    # _build_yandex_market) используют его вместо основного телефона компании, т.к. они
    # уже читают company.get('company_phone') — отдельно каждую функцию не меняем.
    if custom_phone:
        company['company_phone'] = custom_phone

    if fmt == 'yandex':
        city_region_map = cache.city_region_map()
        return _build_yandex(listings, company, feed_slug, use_jpg_photos, city_region_map)
    if fmt == 'avito':
        return _build_avito(listings, company)
    if fmt == 'cian':
        return _build_cian(listings, company)
    if fmt == 'youla':
        # Юла — формат совпадает с Яндекс.Недвижимостью (та же XML-схема принимается).
        city_region_map = cache.city_region_map()
        return _build_yandex(listings, company, feed_slug, use_jpg_photos, city_region_map)
    if fmt == 'domclick':
        # ДомКлик принимает тот же формат Яндекс.Недвижимости. Выгружаем от лица
        # агентства (agent_category по умолчанию 'agency') — как основной Яндекс-фид.
        city_region_map = cache.city_region_map()
        return _build_yandex(listings, company, feed_slug, use_jpg_photos, city_region_map)
    if fmt == 'other':
        # dnr.red — единственная площадка группы «Разное» со своим собственным
        # форматом XML (items-import-export), а не Yandex-схемой. Определяем
        # по slug, не заводя отдельный формат в БД.
        if feed_slug == 'dnr-red':
            return _build_dnr_red(listings, company)
        # Остальные площадки «Разное» без собственного формата — используем универсальную
        # yandex-схему (её принимает большинство каталогов недвижимости).
        # feed_slug пробрасывается дальше — так у ОДНОЙ конкретной площадки (например
        # 23estate) можно включить индивидуальную особенность через FEED_OVERRIDES,
        # не затрагивая остальные площадки группы «Разное». use_jpg_photos — тот же
        # переключатель, но задаётся пользователем из настроек фида (приоритетнее).
        # agent_category='owner' — для «Разное» объявления выгружаются от лица
        # собственника (а не агентства), в отличие от основного Яндекс-фида.
        # Значение должно быть строго из допустимого перечня схемы Яндекса
        # (владелец/owner/агентство/agency/застройщик/developer) — 'private' не входит
        # в перечень и валится как cvc-enumeration-valid при проверке фида.
        city_region_map = cache.city_region_map()
        return _build_yandex(listings, company, feed_slug, use_jpg_photos, city_region_map, agent_category='owner')
    if fmt == 'market':
        return _build_yandex_market(listings, company, market_category_map or {})
    if fmt == 'market_vk':
        return _build_vk_market(listings, company, market_category_map or {})
    return None


def _bump_feed_dates(cur, conn):
    """Раз в сутки, начиная с settings.feed_bump_cron_hour/minute (UTC), проставляет
    feed_bump_at = NOW() всем активным и видимым объектам, у которых включена
    выгрузка хотя бы на одну площадку (Яндекс/Авито/ЦИАН/Юла/ДомКлик/Разное — все
    44+ площадки группы «Разное» используют общий флаг export_other). Это поднимает
    дату объявления (creation-date/DateBegin) в фидах площадок на сегодняшнюю, НЕ
    трогая updated_at — сортировка «новые/обновлённые» на сайте и история
    редактирования в админке не затрагиваются.

    По умолчанию: 06:00 UTC = 09:00 МСК.

    Срабатывает при ПЕРВОМ вызове после наступления целевого времени в текущие
    сутки (сравнение last_at с точной меткой «сегодня, target_hour:target_minute»),
    а не в узком окне в минутах — так обновление не пропускается, даже если
    платформенный крон (раз в 20 минут) не попадает ровно в нужную минуту.
    """
    cur.execute(
        f"SELECT feed_bump_cron_enabled, feed_bump_cron_hour, feed_bump_cron_minute, "
        f"feed_bump_cron_last_at FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
    )
    s = cur.fetchone() or {}
    if not s.get('feed_bump_cron_enabled', True):
        return {'skipped': True, 'reason': 'disabled'}

    now_utc = datetime.now(timezone.utc)
    target_hour = int(s.get('feed_bump_cron_hour') if s.get('feed_bump_cron_hour') is not None else 6)
    target_minute = int(s.get('feed_bump_cron_minute') if s.get('feed_bump_cron_minute') is not None else 0)
    target_dt_today = now_utc.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
    last_at = s.get('feed_bump_cron_last_at')

    time_ok = now_utc >= target_dt_today
    already_ran = bool(last_at) and last_at >= target_dt_today

    if not time_ok or already_ran:
        return {'skipped': True, 'time_ok': time_ok, 'already_ran': already_ran}

    cur.execute(
        f"UPDATE {SCHEMA}.listings SET feed_bump_at = NOW() "
        f"WHERE status = 'active' AND (is_visible IS NULL OR is_visible = TRUE) "
        f"AND (export_yandex = TRUE OR export_avito = TRUE OR export_cian = TRUE "
        f"OR export_youla = TRUE OR export_domclick = TRUE OR export_other = TRUE)"
    )
    updated = cur.rowcount
    cur.execute(f"UPDATE {SCHEMA}.settings SET feed_bump_cron_last_at = NOW() WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id LIMIT 1)")
    conn.commit()
    return {'skipped': False, 'updated': updated}


# ── Индивидуальные настройки отдельных площадок группы «Разное» ────────────
# По умолчанию все площадки используют общую (стандартную) схему _build_yandex.
# Чтобы поменять поведение только для ОДНОЙ конкретной площадки — не трогая
# остальные — добавь её slug сюда с нужными флагами.
FEED_OVERRIDES = {
    '23estate': {'clean_photos': True},
    'gdeetotdom': {'clean_photos': True},
    'remospro': {'clean_photos': True},
    'akula': {'clean_photos': True},
}


# Фото с наложенным водяным знаком: .../photos/{token}_wm.webp
_CLEAN_PHOTO_WM_RE = re.compile(r'/bucket/photos/([A-Za-z0-9_\-]+)_wm\.webp$')


# Фото БЕЗ водяного знака, загруженное как есть: .../photos/{token}.webp
# (исключаем _thumb.webp/_medium.webp — это уменьшенные версии, не отдельные оригиналы)
_CLEAN_PHOTO_PLAIN_RE = re.compile(r'/bucket/photos/([A-Za-z0-9_\-]+)\.webp$')


_CLEAN_PHOTO_EXCLUDE_RE = re.compile(r'_(thumb|medium)$')


def _clean_photo_url(url):
    """Возвращает ссылку на JPG-копию без логотипа из папки xml-feeds-photos/{token}.jpg
    (сохраняется отдельно при загрузке фото, см. backend/upload) — как для фото с
    наложенным водяным знаком (_wm.webp), так и для фото, изначально загруженных
    без него (обычный .webp). Внешние ссылки и не-photos пути возвращает как есть."""
    m = _CLEAN_PHOTO_WM_RE.search(url)
    if not m:
        m = _CLEAN_PHOTO_PLAIN_RE.search(url)
        if m and _CLEAN_PHOTO_EXCLUDE_RE.search(m.group(1)):
            return url  # это _thumb/_medium версия, не отдельное фото — не трогаем
    if not m:
        return url
    token = m.group(1)
    return re.sub(r'/bucket/photos/.*$', f'/bucket/xml-feeds-photos/{token}.jpg', url)


def _split_images_for_feed(row, feed_slug, use_jpg_photos=None):
    """Как _split_images, но переключает на чистые JPG-копии (без ватермарки и webp) —
    либо по флагу use_jpg_photos, заданному пользователем в настройках фида (приоритет),
    либо по старому зашитому списку FEED_OVERRIDES (для площадок, настроенных до того,
    как появился флаг в БД — их поведение остаётся прежним без миграции данных)."""
    images = _split_images(row)
    clean = use_jpg_photos if use_jpg_photos is not None else FEED_OVERRIDES.get(feed_slug, {}).get('clean_photos')
    if clean:
        images = [_clean_photo_url(u) for u in images]
    return images


_TOKEN_FROM_URL_RE = re.compile(r'/bucket/photos/([A-Za-z0-9_\-]+?)(?:_wm)?\.webp$')


def _backfill_feed_photos_jpg(cur, offset=0, batch_limit=60, dry_run=False):
    """Для площадок с clean_photos=True (см. FEED_OVERRIDES) фид ссылается на JPG-копии
    из папки xml-feeds-photos/{token}.jpg — они создаются автоматически при КАЖДОЙ новой
    загрузке фото (см. backend/upload). Для фото, загруженных ДО того, как площадка попала
    в FEED_OVERRIDES, копии могло не быть — эта функция досоздаёт JPG-файлы из уже имеющихся
    в S3 webp-оригиналов, ничего не трогая в самой БД.
    Хранилище (bucket.poehali.dev) не отдаёт список объектов (list_objects_v2 возвращает
    пусто даже для заведомо непустых префиксов — судя по всему нет прав ListBucket), поэтому
    проверить, каких JPG не хватает, нельзя — вместо этого функция идёт по ВСЕМ токенам
    батчами со смещением (offset) и просто перезаписывает JPG (put_object идемпотентен,
    лишние перезаписи безвредны). Вызывать повторно с новым offset, пока done=false."""
    from PIL import Image
    import io

    cur.execute(
        f"SELECT id, images, image FROM {SCHEMA}.listings "
        f"WHERE (images IS NOT NULL AND images != '') OR (image IS NOT NULL AND image != '')"
    )
    rows = [dict(r) for r in cur.fetchall()]

    tokens = {}
    for row in rows:
        for url in _split_images(row):
            m = _TOKEN_FROM_URL_RE.search(url)
            if m:
                tokens[m.group(1)] = url

    ordered = sorted(tokens.items())
    total = len(ordered)

    if dry_run:
        return {'total_tokens': total, 'offset': offset, 'created': 0, 'failed': 0, 'done': True}

    s3 = _s3_client()
    batch = ordered[offset:offset + batch_limit]
    created = 0
    failed = 0
    for token, source_url in batch:
        try:
            key = source_url.split('/bucket/', 1)[1]
            obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
            data = obj['Body'].read()
            img = Image.open(io.BytesIO(data)).convert('RGB')
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=88, optimize=True)
            s3.put_object(
                Bucket=S3_BUCKET, Key=f"xml-feeds-photos/{token}.jpg", Body=buf.getvalue(),
                ContentType='image/jpeg', CacheControl='public, max-age=31536000',
            )
            created += 1
        except Exception:
            failed += 1

    next_offset = offset + len(batch)
    return {
        'total_tokens': total, 'offset': offset, 'next_offset': next_offset,
        'created': created, 'failed': failed, 'done': next_offset >= total,
    }


# Значение <commercial-type> для YRL-фида Яндекса (только для category=commercial).
# Точный список допустимых значений подтверждён валидатором Яндекс.Вебмастера:
# office, retail, warehouse, free purpose, land, manufacturing, auto repair,
# business, legal address, public catering, hotel.
YANDEX_COMMERCIAL_TYPE_MAP = {
    'office': 'office',
    'retail': 'retail',
    'warehouse': 'warehouse',
    'restaurant': 'public catering',
    'hotel': 'hotel',
    'business': 'business',
    'gab': 'business',
    'production': 'manufacturing',
    'land': 'land',
    'building': 'free purpose',
    'free_purpose': 'free purpose',
    'car_service': 'auto repair',
}


AVITO_OBJECT_TYPE_MAP = {
    'office': 'Офисное помещение',
    'retail': 'Торговое помещение',
    'warehouse': 'Складское помещение',
    'restaurant': 'Помещение общественного питания',
    'hotel': 'Гостиница',
    'business': 'Помещение свободного назначения',
    'gab': 'Помещение свободного назначения',
    'production': 'Производственное помещение',
    'land': 'Помещение свободного назначения',
    'building': 'Здание',
    'free_purpose': 'Помещение свободного назначения',
    'car_service': 'Автосервис',
}


# ── Актуальная схема Авито (XML formatVersion=3, категория «Коммерческая
# недвижимость»), сверено с официальными шаблонами Авито от 01.08.2026
# (документы «авито аренда.docx» / «авито продажа.docx»).

# PropertyRights в новой схеме — «кто размещает» (Собственник/Посредник),
# а НЕ право собственности как было раньше.
AVITO_PROPERTY_RIGHTS = {
    'ownership': 'Собственник',
    'lease': 'Посредник',
    'sublease': 'Посредник',
}


AVITO_ENTRANCE_MAP = {
    'street': 'С улицы',
    'yard': 'Со двора',
}


AVITO_PARKING_TYPE_MAP = {
    'none': 'Нет',
    'street': 'На улице',
    'building': 'В здании',
}


# Планировка — обязательна для категории «Офисное помещение».
AVITO_LAYOUT_MAP = {
    'cabinet': 'Кабинетная',
    'open': 'Открытая',
}


# Decoration — обязателен для большинства категорий, допустимо 3 значения.
AVITO_DECORATION_MAP = {
    'new': 'Офисная', 'euro': 'Офисная', 'good': 'Чистовая',
    'cosmetic': 'Чистовая', 'rough': 'Без отделки', 'shellcore': 'Без отделки',
    'none': 'Без отделки',
}


# BuildingType — обязателен, допустимо 5 значений. Если пользователь не указал явно
# (поле building_type на вкладке «Дополнительное») — берём «Другой» по умолчанию.
AVITO_BUILDING_TYPE_DEFAULT = 'Другой'


AVITO_BUILDING_TYPE_MAP = {
    'business_center': 'Бизнес-центр',
    'shopping_center': 'Торговый центр',
    'admin_building': 'Административное здание',
    'residential': 'Жилой дом',
    'other': 'Другой',
}


# Deposit (залог, в месяцах) — используется только для аренды.
AVITO_DEPOSIT_MAP = {
    'none': 'Без залога',
    '0.5': '0,5 месяца',
    '1': '1 месяц',
    '1.5': '1,5 месяца',
    '2': '2 месяца',
    '2.5': '2,5 месяца',
    '3': '3 месяца',
}


_HEATING_RE = re.compile(r'Отопление:\s*([^,]+)')


AVITO_HEATING_MAP = {
    'центральное': 'Центральное',
    'автономное': 'Автономное',
    'газовое': 'Газовое',
    'электрическое': 'Электрическое',
    'печное': 'Печное',
}


def _avito_heating(l):
    """Извлекает тип отопления из текстового поля utilities (см. _HEATING_RE) и
    сопоставляет с допустимым значением Авито. Возвращает None, если не удалось определить."""
    utilities = l.get('utilities') or ''
    m = _HEATING_RE.search(utilities)
    if not m:
        return None
    val = m.group(1).strip().lower()
    for key, mapped in AVITO_HEATING_MAP.items():
        if key in val:
            return mapped
    return None


CIAN_CATEGORY_MAP_SALE = {
    'office': 'officeSale',
    'retail': 'shoppingAreaSale',
    'warehouse': 'warehouseSale',
    'restaurant': 'freeAppointmentObjectSale',
    'hotel': 'freeAppointmentObjectSale',
    'business': 'businessSale',
    'gab': 'businessSale',
    'production': 'industrySale',
    # ВАЖНО: landSale/landRent — категория для ЗАГОРОДНОЙ (дачной/садовой) земли, у нас же
    # исключительно коммерческая земля — правильная категория commercialLandSale/Rent.
    'land': 'commercialLandSale',
    'building': 'buildingSale',
    'free_purpose': 'freeAppointmentObjectSale',
    'car_service': 'freeAppointmentObjectSale',
}


CIAN_CATEGORY_MAP_RENT = {
    'office': 'officeRent',
    'retail': 'shoppingAreaRent',
    'warehouse': 'warehouseRent',
    'restaurant': 'freeAppointmentObjectRent',
    'hotel': 'freeAppointmentObjectRent',
    'business': 'officeRent',
    'gab': 'officeRent',
    'production': 'industryRent',
    'land': 'commercialLandRent',
    'building': 'buildingRent',
    'free_purpose': 'freeAppointmentObjectRent',
    'car_service': 'freeAppointmentObjectRent',
}


# Уточнение назначения (тег <Specialty>) — задаётся справочником
# https://www.cian.ru/xml_import/commercial-possible-appointments.xml
# ОБЯЗАТЕЛЕН для freeAppointmentObjectRent/Sale (free_purpose/restaurant/hotel/car_service)
# и для businessSale (business/gab) — без него ЦИАН отклоняет объявление на модерации.
# Для retail — тег необязателен, но заполняем для точности фильтрации на площадке.
# ВЫВЕРЕНО по официальной документации ЦИАН (xml_import/doc, разделы по каждой категории):
# у office/land/building/warehouse/production тега Specialty НЕТ ВООБЩЕ в схеме — раньше
# он ошибочно добавлялся для office.
CIAN_SPECIALTY = {
    'car_service': 'carService',
    'restaurant': 'publicCatering',
    'hotel': 'hotel',
    'free_purpose': 'flexiblePurpose',
    'business': 'readyMadeBusiness',
    'gab': 'rentalBusiness',
    'retail': 'shop',
}


# Маппинг типа входа (наше поле entrance: street/yard) → тег InputType ЦИАН.
# ВЫВЕРЕНО по документации: тег InputType есть ТОЛЬКО у building/retail/free_purpose —
# у office/warehouse/production/land в схеме его нет вообще.
CIAN_INPUT_TYPE = {
    'street': 'commonFromStreet',
    'yard': 'commonFromYard',
}


CIAN_INPUT_TYPE_CATEGORIES = ('building', 'retail', 'free_purpose')


# Состояние объекта (тег <ConditionType>) — заменяет ошибочно использовавшийся ранее
# <Decoration> (тот существует ТОЛЬКО в схеме shoppingAreaSale — продажа торговой площади,
# и больше нигде). У каждой категории СВОЙ ограниченный список допустимых значений
# (сверено по офиц. документации ЦИАН для каждой категории аренды отдельно):
#   office                        — cosmeticRepairsRequired/finishing/majorRepairsRequired/office
#   retail, building              — cosmeticRepairsRequired/design/finishing/majorRepairsRequired/typical
#   warehouse, production         — cosmeticRepairsRequired/majorRepairsRequired/typical (без чистовой/дизайнерской!)
#   free_purpose                  — весь набор значений (все 6)
# Наше поле condition/finishing даёт более широкую палитру, поэтому для каждой категории —
# свой маппинг с проекцией на допустимый список (при отсутствии точного соответствия
# берём наиболее близкое допустимое значение, а не то, что вызовет ошибку валидации).
CIAN_CONDITION_TYPE_OFFICE = {
    'new': 'office', 'euro': 'office', 'good': 'cosmeticRepairsRequired',
    'cosmetic': 'finishing', 'rough': 'majorRepairsRequired', 'shellcore': 'majorRepairsRequired',
}


CIAN_CONDITION_TYPE_FULL = {  # retail, building
    'new': 'design', 'euro': 'design', 'good': 'cosmeticRepairsRequired',
    'cosmetic': 'finishing', 'rough': 'majorRepairsRequired', 'shellcore': 'typical',
}


CIAN_CONDITION_TYPE_INDUSTRIAL = {  # warehouse, production — нет finishing/design/office
    'new': 'typical', 'euro': 'typical', 'good': 'cosmeticRepairsRequired',
    'cosmetic': 'cosmeticRepairsRequired', 'rough': 'majorRepairsRequired', 'shellcore': 'majorRepairsRequired',
}


CIAN_CONDITION_TYPE_FREE_PURPOSE = {  # free_purpose — полный набор значений
    'new': 'design', 'euro': 'design', 'good': 'cosmeticRepairsRequired',
    'cosmetic': 'finishing', 'rough': 'majorRepairsRequired', 'shellcore': 'typical',
}


CIAN_CONDITION_TYPE_BY_CATEGORY = {
    'office': CIAN_CONDITION_TYPE_OFFICE,
    'retail': CIAN_CONDITION_TYPE_FULL,
    'building': CIAN_CONDITION_TYPE_FULL,
    'warehouse': CIAN_CONDITION_TYPE_INDUSTRIAL,
    'production': CIAN_CONDITION_TYPE_INDUSTRIAL,
    'free_purpose': CIAN_CONDITION_TYPE_FREE_PURPOSE,
}


# Линия домов (наше поле road_line: '1'/'2'/'3') → тег ЦИАН Building.HouseLineType.
# По документации есть ТОЛЬКО у building и retail.
CIAN_HOUSE_LINE_TYPE = {'1': 'first', '2': 'second', '3': 'other'}


CIAN_HOUSE_LINE_TYPE_CATEGORIES = ('building', 'retail')


LAND_STATUS_YANDEX = {
    'izhs': 'ИЖС',
    'lph': 'ЛПХ',
    'snt': 'СНТ',
    'dni': 'ДНТ',
    'commercial': 'Коммерческое',
    'agricultural': 'Сельскохозяйственное',
    'industrial': 'Промышленное',
}


# ЦИАН для категории «Коммерческая земля» (commercialLandSale/Rent) использует СВОЙ отдельный
# классификатор статуса земли (тег Land.Status) — три значения вместо наших семи.
# Соответствие подобрано по смыслу: наши бытовые статусы (ИЖС/ЛПХ/СНТ/ДНТ/коммерческое) — это
# земли населённых пунктов, сельхоз — сельхозназначение, промышленное — промышленность/транспорт.
CIAN_LAND_STATUS = {
    'izhs': 'settlements',
    'lph': 'settlements',
    'snt': 'settlements',
    'dni': 'settlements',
    'commercial': 'settlements',
    'agricultural': 'forAgriculturalPurposes',
    'industrial': 'industryTransportCommunications',
}


# Наш справочник land_vri (см. таблицу land_vri) → фиксированный список ЦИАН PermittedUseType.
CIAN_PERMITTED_USE_TYPE = {
    'izhs': 'individualHousingConstruction',
    'lph': 'agricultural',
    'kfh': 'agricultural',
    'agricultural': 'agricultural',
    'commercial': 'businessManagement',
    'office': 'businessManagement',
    'trade': 'shoppingCenters',
    'retail': 'shoppingCenters',
    'industrial': 'industry',
    'warehouse': 'warehouses',
    'hospitality': 'hotelAmenities',
    'multi': 'highriseBuildings',
    'recreation': 'leisure',
    'public_catering': 'publicUseOfCapitalConstruction',
    'transport': 'serviceVehicles',
}


# Подъездные пути к земельному участку (наше поле driveway_type) → тег ЦИАН Land.DrivewayType
CIAN_DRIVEWAY_TYPE = {
    'asphalt': 'asphalt',
    'ground': 'ground',
    'none': 'no',
}


CONDITION_YANDEX = {
    'new': 'отличное',
    'euro': 'отличное',
    'good': 'хорошее',
    'cosmetic': 'удовлетворительное',
    'rough': 'требует ремонта',
    'shellcore': 'требует ремонта',
}


# Наше поле condition → тег Яндекса <renovation> (более развёрнутый список,
# чем <quality> выше — оба тега передаются одновременно, схема это разрешает).
# Значения строго по документации Яндекса: дизайнерский/евро/с отделкой/
# требует ремонта/хороший/частичный ремонт/черновая отделка.
CONDITION_TO_RENOVATION_YANDEX = {
    'new': 'дизайнерский',
    'euro': 'евро',
    'good': 'с отделкой',
    'cosmetic': 'частичный ремонт',
    'rough': 'черновая отделка',
    'shellcore': 'черновая отделка',
}


# Наше поле entrance (street/yard — «с улицы»/«со двора») → тег Яндекса
# <entrance-type> (common/separate — «общий»/«отдельный»). Прямого смыслового
# соответствия нет (это разные признаки), берём ближайшее приближение:
# отдельный вход со двора чаще означает обособленный вход → separate,
# вход с улицы чаще общий для здания → common.
ENTRANCE_TO_YANDEX = {
    'street': 'common',
    'yard': 'separate',
}


# Тип здания (наше поле building_type, справочник BUILDING_TYPES) → тег Яндекса
# <commercial-building-type>. Точные значения по официальной документации
# Яндекс.Недвижимости (слова разделены ПРОБЕЛОМ, не подчёркиванием!):
# business center, detached building, residential building, shopping center, warehouse.
# У Яндекса нет прямых аналогов «Административное здание» и «Другой» — эти два
# варианта в фид не передаём (поле необязательное).
YANDEX_BUILDING_TYPE_MAP = {
    'business_center': 'business center',
    'shopping_center': 'shopping center',
    'residential': 'residential building',
    'warehouse': 'warehouse',
}


# Наше поле purpose (справочник PURPOSE_LIST, значения через |) → тег Яндекса <purpose>.
# У Яндекса строго ограниченный список из 6 значений (bank, beauty shop, food store,
# medical center, show room, touragency) — сопоставляем только те наши варианты, что
# совпадают по смыслу однозначно; остальные (их большинство) прямого аналога не имеют
# и в фид не передаются.
YANDEX_PURPOSE_MAP = {
    'Салон красоты': 'beauty shop',
    'Продуктовый магазин': 'food store',
    'Медицинский центр': 'medical center',
}


# Ключи нашего текстового поля utilities → соответствующий булев тег Яндекса.
# Некоторые пункты (вода/газ/электричество/отопление/канализация) у Яндекса —
# это просто факт наличия (true), конкретный вид (скважина/магистральный и т.д.)
# в схеме фида отдельно не передаётся.
_YANDEX_UTILITY_TAG_MAP = {
    'Вода': 'water-supply',
    'Канализация': 'sewerage-supply',
    'Отопление': 'heating-supply',
    'Газ': 'gas-supply',
    'Электричество': 'electricity-supply',
    'Интернет': 'internet',
    'Вентиляция': 'ventilation',
    'Пожарная сигнализация': 'fire-alarm',
    'Кондиционирование': 'air-conditioner',
}


# Значения-исключения, при которых коммуникация считается ОТСУТСТВУЮЩЕЙ,
# а не присутствующей (для пунктов, где один из вариантов — явное «нет»).
_YANDEX_UTILITY_ABSENT_VALUES = {'Отсутствует', 'Нет'}


def _parse_utilities_for_yandex(utilities: str) -> dict:
    """Разбирает наше текстовое поле utilities вида
    "Вода: Центральная, Электричество: 220В, ..." на отдельные булевы теги
    Яндекса (water-supply, electricity-supply и т.д.) — тег добавляется
    только если соответствующий пункт заполнен и не равен «Отсутствует»/«Нет».
    """
    result = {}
    if not utilities:
        return result
    for part in utilities.split(','):
        part = part.strip()
        if ':' not in part:
            continue
        key, _, value = part.partition(':')
        key = key.strip()
        value = value.strip()
        tag = _YANDEX_UTILITY_TAG_MAP.get(key)
        if not tag or not value:
            continue
        if value in _YANDEX_UTILITY_ABSENT_VALUES:
            continue
        result[tag] = 'true'
    return result


# YML-фид недвижимости (param "Отделка") принимает только 3 значения:
# Черновая / Чистовая / Под ключ — используется в _build_yandex_market.
CONDITION_TO_FINISHING_MARKET = {
    'new': 'Под ключ',
    'euro': 'Под ключ',
    'good': 'Чистовая',
    'cosmetic': 'Чистовая',
    'rough': 'Черновая',
    'shellcore': 'Черновая',
}


FINISHING_CIAN = {
    'none': 'no',
    'rough': 'rough',
    'pre_finish': 'roughFinish',
    'cosmetic': 'cosmetic',
    'euro': 'euro',
    'designer': 'design',
}


# Маппинг condition (из вкладки "Основное") → ЦИАН-значения отделки
# Используется как fallback если finishing не заполнен вручную
CONDITION_TO_FINISHING_CIAN = {
    'new': 'design',        # Дизайнерский ремонт
    'euro': 'euro',         # Евроремонт
    'good': 'cosmetic',     # Косметический ремонт
    'cosmetic': 'roughFinish',  # Предчистовая
    'rough': 'no',          # Без отделки
    'shellcore': 'rough',   # Черновая
}


# {название нашего города: dnr.red city id} — только Краснодарский край.
DNR_RED_CITY_IDS = {
    'Краснодар': 2734, 'Абинск': 2735, 'Абрау-Дюрсо': 2736, 'Агроном': 2737,
    'Азовская': 2738, 'Алексеевская': 2739, 'Анапа': 2740, 'Анапская': 2741,
    'Анастасиевская': 2742, 'Апшеронск': 2743, 'Армавир': 2744, 'Архангельская': 2745,
    'Архипо-Осиповка': 2746, 'Атаманская': 2747, 'Афипский': 2748, 'Ахтанизовская': 2749,
    'Ахтарский': 2750, 'Ахтырский': 2751, 'Батуринская': 2752, 'Белая Глина': 2753,
    'Белозерный': 2754, 'Белореченск': 2755, 'Березанская': 2756, 'Березовый': 2757,
    'Бесскорбная': 2758, 'Бриньковская': 2759, 'Брюховецкая': 2760, 'Варениковская': 2761,
    'Васюринская': 2762, 'Великовечное': 2763, 'Венцы': 2764, 'Верхнебаканский': 2765,
    'Веселое': 2766, 'Виноградный': 2767, 'Витязево': 2768, 'Владимирская': 2769,
    'Вознесенская': 2770, 'Воронежская': 2771, 'Выселки': 2772, 'Высокое': 2773,
    'Вышестеблиевская': 2774, 'Гайдук': 2775, 'Геленджик': 2776, 'Гирей': 2777,
    'Глубокий': 2778, 'Голубицкая': 2779, 'Горное Лоо': 2780, 'Горячий Ключ': 2781,
    'Гостагаевская': 2782, 'Гривенская': 2783, 'Губская': 2784, 'Гулькевичи': 2785,
    'Двубратский': 2786, 'Джигинка': 2787, 'Джубга кп': 2788, 'Дивноморское': 2789,
    'Динская': 2790, 'Дмитриевская': 2791, 'Днепровская': 2792, 'Должанская': 2793,
    'Дятьковская': 2794, 'Ейск': 2795, 'Елизаветинская': 2796, 'Заветный': 2797,
    'Ивановская': 2798, 'Ильинская': 2799, 'Ильский': 2800, 'Индустриальный': 2801,
    'Кабардинка': 2802, 'Кавказская': 2803, 'Казанская': 2804, 'Калинино': 2805,
    'Калининская': 2806, 'Калниболотская': 2807, 'Камышеватская': 2808, 'Каневская': 2809,
    'Канеловская': 2810, 'Киевское': 2811, 'Кирпильская': 2812, 'Кисляковская': 2813,
    'Ковалевское': 2814, 'Коноково': 2815, 'Константиновская': 2816, 'Копанская': 2817,
    'Кореновск': 2818, 'Коржевский': 2819, 'Красная Поляна': 2821, 'Красное': 2822,
    'Красносельский': 2823, 'Кропоткин': 2824, 'Крыловская': 2825, 'Крымск': 2827,
    'Кубанский': 2828, 'Курганинск': 2829, 'Курчанская': 2830, 'Кущевская': 2831,
    'Лабинск': 2832, 'Ладожская': 2833, 'Ленина': 2834, 'Ленинградская': 2835,
    'Львовское': 2836, 'Майкопское': 2837, 'Марьянская': 2838, 'Медведовская': 2839,
    'Мингрельская': 2840, 'Мирской': 2841, 'Михайловская': 2842, 'Мостовской': 2843,
    'Мысхако': 2844, 'Натухаевская': 2845, 'Небуг': 2846, 'Незамаевская': 2847,
    'Некрасовская': 2848, 'Нефтегорск': 2849, 'Нижнебаканская': 2850, 'Нижнешиловское': 2851,
    'Новоалексеевская': 2852, 'Новобейсугская': 2853, 'Нововеличковская': 2854, 'Новодеревянковская': 2855,
    'Новоджерелиевская': 2856, 'Новодмитриевская': 2857, 'Новокорсунская': 2858, 'Новокубанск': 2859,
    'Новолабинская': 2860, 'Новолеушковская': 2861, 'Новомалороссийская': 2862, 'Новоминская': 2863,
    'Новомихайловский кп': 2864, 'Новомышастовская': 2865, 'Новониколевская': 2866, 'Новоплатнировская': 2867,
    'Новопокровская': 2868, 'Новорождественская': 2869, 'Новороссийск': 2870, 'Новотитаровская': 2871,
    'Новоукраинский': 2872, 'Новоукраинское': 2873, 'Новощербиновская': 2874, 'Октябрьская': 2875,
    'Ольгинская': 2876, 'Орел-Изумруд': 2877, 'Отрадная': 2878, 'Отрадо-Кубанское': 2879,
    'Отрадо-Ольгинское': 2880, 'Павловская': 2881, 'Парковый': 2882, 'Пашковский': 2883,
    'Передовая': 2884, 'Переправная': 2885, 'Переясловская': 2886, 'Петровская': 2887,
    'Петропавловская': 2888, 'Пластуновская': 2889, 'Платнировская': 2890, 'Полтавская': 2891,
    'Попутная': 2892, 'Привольная': 2893, 'Прикубанский': 2894, 'Приморско-Ахтарск': 2895,
    'Прочноокопская': 2896, 'Псебай': 2897, 'Пшехская': 2898, 'Раевская': 2899,
    'Раздольная': 2900, 'Роговская': 2901, 'Родниковская': 2902, 'Рязанская': 2903,
    'Саратовская': 2904, 'Северская': 2905, 'Сенной': 2906, 'Славянск-на-Кубани': 2907,
    'Смоленская': 2908, 'Советская': 2909, 'Совхозный': 2910, 'Соколовское': 2911,
    'Сочи': 2912, 'Спокойная': 2913, 'Старая Станица': 2914, 'Старовеличковская': 2915,
    'Стародеревянковская': 2916, 'Староджерелиевская': 2917, 'Старокорсунская': 2918, 'Старолеушковская': 2919,
    'Староминская': 2920, 'Старомышастовская': 2921, 'Старонижестеблиевская': 2922, 'Старотитаровская': 2923,
    'Старощербиновская': 2924, 'Стрелка': 2925, 'Супсех': 2926, 'Тамань': 2927,
    'Тбилисская': 2928, 'Темижбекская': 2929, 'Темиргоевская': 2930, 'Темрюк': 2931,
    'Терновская': 2932, 'Тимашевск': 2933, 'Тихорецк': 2934, 'Троицкая': 2935,
    'Трудобеликовский': 2936, 'Туапсе': 2937, 'Удобная': 2938, 'Упорная': 2939,
    'Успенская': 2940, 'Успенское': 2941, 'Усть-Лабинск': 2942, 'Фастовецкая': 2943,
    'Хадыженск': 2944, 'Холмская': 2945, 'Цибанобалка': 2946, 'Чамлыкская': 2947,
    'Челбасская': 2948, 'Черноерковская': 2949, 'Черноморский': 2950, 'Шедок': 2951,
    'Шепси': 2952, 'Широчанка': 2953, 'Шкуринская': 2954, 'Южный': 2955,
    'Юровка': 2957, 'Ярославская': 2958, 'Ясенская': 2959,
}


def _dnr_red_city_id(city_name):
    """ID города площадки dnr.red по названию (Краснодарский край) — если
    город не найден в справочнике, используем Краснодар как безопасный дефолт
    (у нас все текущие объекты и так в Краснодаре)."""
    return DNR_RED_CITY_IDS.get((city_name or '').strip(), DNR_RED_CITY_IDS['Краснодар'])


def _build_dnr_red(listings, company):
    """Строит XML-фид для площадки dnr.red (формат items-import-export —
    собственный формат площадки, НЕ имеет отношения к схеме Яндекс.Недвижимости).
    Площадка принимает только ОДНУ категорию недвижимости — id=339 «Аренда
    помещений свободного назначения», поэтому выгружаем только объекты в
    аренду (deal=rent), независимо от типа помещения (офис/склад/ритейл и т.д.).

    Справочные блоки categories/currencies/cities/params (id категорий, городов,
    валюты, параметров) в реальную выгрузку НЕ включаются — по прямому указанию
    площадки они нужны только для примера в личном кабинете, чтобы видеть id
    перед интеграцией. При загрузке фида сразу после <listings> должен идти
    <items> — сами id используются inline внутри каждого <item> (category,
    geo/city, price/currency)."""
    company_name = _xml_escape(company.get('company_name', 'BIZNEST'))

    raw_phone = company.get('company_phone', '') or ''
    digits = re.sub(r'\D', '', raw_phone)
    if digits.startswith('8') and len(digits) == 11:
        digits = '7' + digits[1:]
    phone = f'+{digits}' if len(digits) == 11 and digits.startswith('7') else ''

    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append('<listings type="items-import-export">')

    out.append('<items>')
    for l in listings:
        if l.get('deal') != 'rent':
            continue  # площадка принимает только аренду (единственная категория — 339)

        # external="1" — по требованию площадки для загружаемых через фид объявлений.
        out.append(f'<item id="{l["id"]}" external="1" publicated="true">')
        title = _clean_title(l.get('title') or '')
        out.append(f'<title>{_xml_escape(title)}</title>')
        if l.get('description'):
            out.append(f'<description>{_xml_escape(l["description"])}</description>')
        out.append('<category title="Аренда помещений свободного назначения">339</category>')
        # owner_type: 2 — от агентства/посредника (у площадки нет отдельного
        # смысла «собственник» для юрлица, используем единое значение для всех).
        out.append('<owner_type>2</owner_type>')

        out.append('<geo delivery="0">')
        city_id = _dnr_red_city_id(l.get('city'))
        city_name = l.get('city') or 'Краснодар'
        out.append(f'<city id="{city_id}">{_xml_escape(city_name)}</city>')
        addr = _xml_escape(l['address']) if l.get('address') else ''
        out.append(f'<addr>{addr}</addr>')
        if l.get('lat') and l.get('lng'):
            out.append(f'<lat>{l["lat"]}</lat>')
            out.append(f'<lon>{l["lng"]}</lon>')
        out.append('</geo>')

        price_val = _total_price(l)
        out.append(
            f'<price currency="2" free="0" exchange="0" mod="1" agreed="0" '
            f'from="0" from_to="0" price_to="{price_val}.000000">{price_val}.000000</price>'
        )

        images = _split_images_for_feed(l, 'dnr-red', use_jpg_photos=True)
        if images:
            out.append('<images>')
            for img in images:
                out.append(f'<image>{_xml_escape(img)}</image>')
            out.append('</images>')

        out.append('<contacts>')
        out.append(f'<name>{_xml_escape(company_name)}</name>')
        if phone:
            out.append('<phones>')
            out.append(f'<phone>{phone}</phone>')
            out.append('</phones>')
        out.append('</contacts>')

        out.append('<video/>')

        out.append('<params>')
        area_val = int(l['area']) if l.get('area') else 0
        floor_val = int(l['floor']) if l.get('floor') is not None else 0
        floors_total_val = int(l['total_floors']) if l.get('total_floors') else 0
        out.append(f'<param field="1" type="10" value="0" title="Площадь">{area_val}</param>')
        out.append(f'<param field="2" type="10" value="0" title="Этаж">{floor_val}</param>')
        out.append(f'<param field="3" type="10" value="0" title="Этажность">{floors_total_val}</param>')
        out.append('</params>')

        out.append('</item>')
    out.append('</items>')

    out.append('</listings>')
    return '\n'.join(out)


def _build_yandex(listings, company, feed_slug=None, use_jpg_photos=None, city_region_map=None, agent_category='agency'):
    company_name = _xml_escape(company.get('company_name', 'BIZNEST'))
    email = _xml_escape(company.get('company_email', ''))
    site_url = (company.get('site_url') or '').rstrip('/')
    now = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S+00:00')
    city_region_map = city_region_map or {}

    # Телефон строго в формате +7XXXXXXXXXX (только цифры, код страны + 10 цифр)
    raw_phone = company.get('company_phone', '') or ''
    digits = re.sub(r'\D', '', raw_phone)
    if digits.startswith('8') and len(digits) == 11:
        digits = '7' + digits[1:]
    phone = f'+{digits}' if len(digits) == 11 and digits.startswith('7') else ''

    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append('<realty-feed xmlns="http://webmaster.yandex.ru/schemas/feed/realty/2010-06">')
    out.append(f'<generation-date>{now}</generation-date>')

    for l in listings:
        deal_map = {'sale': 'продажа', 'rent': 'аренда', 'business': 'продажа'}
        # Основной тип берём из категории объекта; если категория неизвестна —
        # безопасное значение 'free purpose' (оно есть в перечне Яндекса).
        commercial_types = [YANDEX_COMMERCIAL_TYPE_MAP.get(l.get('category'), 'free purpose')]
        # «Юридический адрес» — дополнительное значение commercial-type только для
        # аренды (по документации Яндекса элемент может повторяться). Реальный тип
        # объекта НЕ заменяем: подмена основного типа на 'legal address' приводила
        # к отклонению объявления валидатором («Ошибка в типе объявления»).
        if l.get('deal') == 'rent' and l.get('legal_address_provided'):
            commercial_types.append('legal address')
        deal = deal_map.get(l.get('deal'), 'продажа')

        # creation-date в строгом ISO 8601: YYYY-MM-DDTHH:mm:ss+00:00 (без микросекунд).
        # Берём feed_bump_at (дата авто-«поднятия» для площадок), если он проставлен,
        # иначе — обычную дату создания объекта.
        creation_date = now
        raw_created = l.get('feed_bump_at') or l.get('created_at')
        if raw_created:
            try:
                dt = datetime.fromisoformat(str(raw_created).replace('Z', '+00:00'))
                if dt.tzinfo is None:
                    creation_date = dt.strftime('%Y-%m-%dT%H:%M:%S+00:00')
                else:
                    creation_date = dt.strftime('%Y-%m-%dT%H:%M:%S%z')
                    creation_date = creation_date[:-2] + ':' + creation_date[-2:]
            except (ValueError, TypeError):
                pass

        out.append(f'<offer internal-id="{l["id"]}">')
        out.append(f'<type>{deal}</type>')
        out.append('<category>commercial</category>')
        for ct in commercial_types:
            out.append(f'<commercial-type>{ct}</commercial-type>')
        # deal-status обязателен только для аренды; для продажи не передаётся.
        # Читаем реальные данные из property_rights (Права на объект):
        # sublease → subrent (субаренда), иначе — прямая аренда (значение
        # по умолчанию для ownership/lease и не заполненного поля).
        if l.get('deal') == 'rent':
            deal_status = 'subrent' if l.get('property_rights') == 'sublease' else 'direct rent'
            out.append(f'<deal-status>{deal_status}</deal-status>')
        out.append(f'<creation-date>{creation_date}</creation-date>')

        # Адрес, геолокация и метро — всё внутри <location>
        out.append('<location>')
        out.append('<country>Россия</country>')
        city_name = l.get('city') or 'Краснодар'
        region_name = city_region_map.get(city_name)
        if region_name:
            out.append(f'<region>{_xml_escape(region_name)}</region>')
        out.append(f'<locality-name>{_xml_escape(city_name)}</locality-name>')
        if l.get('district'):
            out.append(f'<sub-locality-name>{_xml_escape(l["district"])}</sub-locality-name>')
        if l.get('address'):
            out.append(f'<address>{_xml_escape(l["address"])}</address>')
        if l.get('lat') and l.get('lng'):
            out.append(f'<latitude>{l["lat"]}</latitude>')
            out.append(f'<longitude>{l["lng"]}</longitude>')
        if l.get('subway_station'):
            out.append('<metro>')
            out.append(f'<name>{_xml_escape(l["subway_station"])}</name>')
            if l.get('subway_distance'):
                out.append(f'<time-on-foot>{l["subway_distance"]}</time-on-foot>')
            out.append('</metro>')
        out.append('</location>')

        # Агент. organization — юрлицо агентства; обязателен для Юлы (схема
        # «Недвижимость (Яндекс)» мапит его в provider.name), для Яндекса —
        # необязательное доп. поле по той же официальной схеме.
        out.append('<sales-agent>')
        out.append(f'<name>{company_name}</name>')
        if agent_category != 'owner':
            out.append(f'<organization>{company_name}</organization>')
        if phone:
            out.append(f'<phone>{phone}</phone>')
        if email:
            out.append(f'<email>{email}</email>')
        out.append(f'<category>{agent_category}</category>')
        out.append('</sales-agent>')

        # Ссылка на карточку объекта на сайте
        if site_url and l.get('slug'):
            out.append(f'<url>{_xml_escape(site_url)}/object/{l["slug"]}</url>')

        # Номер лота — используем ID объекта (тот же номер, что виден клиенту на сайте)
        out.append(f'<lot-number>{l["id"]}</lot-number>')

        # Кадастровый номер объекта
        if l.get('cadastral_number'):
            out.append(f'<cadastral-number>{_xml_escape(str(l["cadastral_number"]))}</cadastral-number>')

        # Цена (unit не передаём — value всегда итоговая сумма, а не цена за м²)
        out.append('<price>')
        price_val = _total_price(l)
        out.append(f'<value>{price_val}</value>')
        out.append('<currency>RUB</currency>')
        if l.get('deal') == 'rent':
            out.append('<period>month</period>')
        # Форма налогообложения арендодателя — из чекбокса «НДС» (has_vat).
        # True → плательщик НДС, False → работает по УСН. Тег только для аренды
        # (по документации Яндекса), если чекбокс не заполнен — не передаём.
        if l.get('deal') == 'rent' and l.get('has_vat') is not None:
            out.append(f'<taxation-form>{"НДС" if l["has_vat"] else "УСН"}</taxation-form>')
        out.append('</price>')

        # Комиссия для клиента — по умолчанию у нас все объекты выгружаются
        # без комиссии (агентское вознаграждение не входит в стоимость для
        # арендатора/покупателя на площадке).
        out.append('<commission>0</commission>')

        # Залог — заполняем реальными данными, если менеджер указал сумму
        # или количество месяцев залога; иначе передаём «нет». НЕ путать с
        # торгом — в схеме Яндекса для коммерции тега «торг» не существует.
        if l.get('deal') == 'rent':
            has_deposit = bool(l.get('deposit_amount')) or (l.get('deposit_months') and l['deposit_months'] != 'none')
            out.append(f'<rent-pledge>{"да" if has_deposit else "нет"}</rent-pledge>')

        # Площадь
        if l.get('area'):
            out.append(f'<area><value>{l["area"]}</value><unit>кв. м</unit></area>')
        if l.get('min_area'):
            out.append(f'<lot-area><value>{l["min_area"]}</value><unit>кв. м</unit></lot-area>')

        # Земельный участок
        if l.get('category') == 'land':
            if l.get('land_area'):
                out.append(f'<lot-area><value>{l["land_area"]}</value><unit>сот.</unit></lot-area>')
            if l.get('land_status') and l['land_status'] in LAND_STATUS_YANDEX:
                out.append(f'<lot-type>{LAND_STATUS_YANDEX[l["land_status"]]}</lot-type>')
            if l.get('land_vri'):
                out.append(f'<permitted-land-use>{_xml_escape(str(l["land_vri"]))}</permitted-land-use>')

        # Этажность (floors-total по схеме Яндекса должен быть >= 1 — некорректные
        # отрицательные/нулевые значения в БД просто не выгружаем, а не шлём как есть)
        if l.get('floor') is not None:
            out.append(f'<floor>{l["floor"]}</floor>')
        if l.get('total_floors') is not None and l['total_floors'] >= 1:
            out.append(f'<floors-total>{l["total_floors"]}</floors-total>')

        # Состояние / отделка
        if l.get('condition') and l['condition'] in CONDITION_YANDEX:
            out.append(f'<quality>{CONDITION_YANDEX[l["condition"]]}</quality>')

        # Класс здания (office-class: A/A+/B/B+/C/C+)
        if l.get('building_class'):
            out.append(f'<office-class>{_xml_escape(l["building_class"])}</office-class>')

        # Год постройки
        if l.get('building_year'):
            out.append(f'<built-year>{l["building_year"]}</built-year>')

        # Высота потолков
        if l.get('ceiling_height'):
            out.append(f'<ceiling-height>{l["ceiling_height"]}</ceiling-height>')

        # Электрическая мощность в кВт (целое число)
        if l.get('electricity_kw'):
            try:
                out.append(f'<electric-capacity>{int(float(l["electricity_kw"]))}</electric-capacity>')
            except (TypeError, ValueError):
                pass

        # Парковка — факт наличия охраняемой парковки
        if l.get('parking') and l['parking'] != 'none':
            out.append('<parking>true</parking>')

        # Описание
        if l.get('description'):
            out.append(f'<description>{_xml_escape(l["description"])}</description>')

        # Фото — не меньше двух по требованиям Яндекса
        images = _split_images_for_feed(l, feed_slug, use_jpg_photos)
        for img in images:
            out.append(f'<image>{_xml_escape(img)}</image>')

        # Видео — по документации Яндекса тег video-review поддерживает ссылки как на
        # YouTube, так и на RuTube, но актуальная XSD-схема их валидатора пока не
        # содержит rutube-video-review-url (проверка его отклоняет). online-show — это
        # НЕ поле для ссылки, а флаг «доступен онлайн-показ» (1/0), поэтому ссылку
        # туда класть нельзя. Пока RuTube не появится в схеме — просто не выгружаем
        # такое видео (единичные случаи, не критично для карточки объекта).
        video_url = l.get('video_url') or ''
        video_url_lower = video_url.lower()
        if video_url and 'youtu' in video_url_lower:
            out.append('<video-review>')
            out.append(f'<youtube-video-review-url>{_xml_escape(video_url)}</youtube-video-review-url>')
            out.append('</video-review>')

        # Тип здания
        building_type_yandex = YANDEX_BUILDING_TYPE_MAP.get(l.get('building_type'))
        if building_type_yandex:
            out.append(f'<commercial-building-type>{building_type_yandex}</commercial-building-type>')

        # Назначение объекта — тег может повторяться, но у нас с Яндексом совпадает
        # только несколько вариантов, поэтому берём все подходящие из выбранных менеджером
        if l.get('purpose'):
            for p in str(l['purpose']).split('|'):
                p = p.strip()
                purpose_yandex = YANDEX_PURPOSE_MAP.get(p)
                if purpose_yandex:
                    out.append(f'<purpose>{purpose_yandex}</purpose>')

        # Коммуникации — разбираем текстовое поле utilities на отдельные булевы теги
        utilities_flags = _parse_utilities_for_yandex(l.get('utilities') or '')
        for tag, value in utilities_flags.items():
            out.append(f'<{tag}>{value}</{tag}>')

        # Коммунальные платежи включены в стоимость аренды — общий чекбокс
        # «Коммуналка включена» (не путать с avito_utilities_included, который
        # заполняется отдельно только в блоке настроек для Авито).
        if l.get('deal') == 'rent' and l.get('utilities_included') is not None:
            out.append(f'<utilities-included>{"true" if l["utilities_included"] else "false"}</utilities-included>')

        # Вход в помещение — приближённый маппинг (см. комментарий у ENTRANCE_TO_YANDEX)
        entrance_yandex = ENTRANCE_TO_YANDEX.get(l.get('entrance'))
        if entrance_yandex:
            out.append(f'<entrance-type>{entrance_yandex}</entrance-type>')

        # Ремонт — более развёрнутый тег, чем <quality> выше, оба передаются одновременно
        renovation_yandex = CONDITION_TO_RENOVATION_YANDEX.get(l.get('condition'))
        if renovation_yandex:
            out.append(f'<renovation>{renovation_yandex}</renovation>')

        # Пропускная система — поле access_type появляется в БД только после
        # миграции (Этап 2 доработки фида); на старых записях просто отсутствует.
        if l.get('access_type') == 'controlled':
            out.append('<access-control-system>true</access-control-system>')
        elif l.get('access_type') == 'free':
            out.append('<access-control-system>false</access-control-system>')

        # Мебель в помещении
        if l.get('has_furniture'):
            out.append('<room-furniture>true</room-furniture>')

        out.append('</offer>')

    out.append('</realty-feed>')
    return '\n'.join(out)


# Справочник категорий Яндекс.Бизнеса (карточка на Картах, раздел «Товары и услуги»),
# нужен для блока <categories> в шапке фида — id берём из category_map, названия отсюда.
YANDEX_BUSINESS_CATEGORY_NAMES = {
    '41': 'Офис', '42': 'Торговое помещение', '43': 'Помещение свободного назначения',
    '44': 'Склад', '45': 'Производственное помещение', '46': 'Участок коммерческого назначения',
    '47': 'Общепит', '48': 'Автосервис', '49': 'Гостиница', '50': 'Готовый бизнес',
    '51': 'Юридический адрес', '6': 'Коммерческое помещение',
}


def _market_conversion_score(l):
    """«Конверсия» — обязательный параметр YML-фида недвижимости Яндекса: произвольное
    число, чем больше, тем заметнее показывается предложение. Реальной статистики
    конверсии у нас нет, поэтому считаем условный рейтинг качества карточки —
    чем больше у объекта заполненных полей и фото, тем выше число (базовые 30 + бонусы)."""
    score = 30
    images = _split_images(l)
    score += min(len(images), 10) * 3  # до +30 за фото
    if l.get('description') and len(l['description']) > 200:
        score += 10
    if l.get('area'):
        score += 5
    if l.get('address'):
        score += 5
    if l.get('lat') and l.get('lng'):
        score += 5
    if l.get('subway_station'):
        score += 5
    if l.get('floor') is not None and l.get('total_floors'):
        score += 5
    if l.get('building_year'):
        score += 5
    return score


def _build_yandex_market(listings, company, category_map):
    """Строит YML-фид недвижимости для Яндекса (раздел «Недвижимость» в поиске —
    https://yandex.ru/support/webmaster/search-appearance/realty.html), а НЕ фид
    Яндекс.Бизнеса. Формат требует обязательный блок <sets> и привязку каждого offer
    к сету через set-ids, param «Тип предложения» (Продажа/Аренда) и param «Конверсия».
    Тег категории — <categoryId> (объявляется в <categories>), до 10 фото на offer.
    category_map — словарь {category объекта: categoryId из кабинета}, задаётся
    пользователем в настройках фида (объекты без соответствия в фид не попадают)."""
    company_name = _xml_escape(company.get('company_name') or 'Магазин')
    site_url = (company.get('site_url') or '').rstrip('/')
    now = datetime.utcnow().strftime('%Y-%m-%d %H:%M')

    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append(f'<yml_catalog date="{now}">')
    out.append('<shop>')
    out.append(f'<name>{company_name}</name>')
    out.append(f'<company>{company_name}</company>')
    if site_url:
        out.append(f'<url>{_xml_escape(site_url)}</url>')
    out.append('<currencies><currency id="RUB" rate="1"/></currencies>')

    # Блок категорий — только те, что реально используются (по значениям category_map)
    used_cat_ids = sorted(set(str(v) for v in category_map.values() if v))
    if used_cat_ids:
        out.append('<categories>')
        for cat_id in used_cat_ids:
            cat_name = _xml_escape(YANDEX_BUSINESS_CATEGORY_NAMES.get(cat_id, f'Категория {cat_id}'))
            out.append(f'<category id="{_xml_escape(cat_id)}">{cat_name}</category>')
        out.append('</categories>')

    # Один общий сет на весь фид — сет обязателен, но в отличие от category
    # у offer может быть привязка сразу к нескольким сетам через запятую в set-ids.
    out.append('<sets><set id="1"><name>Коммерческая недвижимость</name></set></sets>')

    out.append('<offers>')

    for l in listings:
        market_cat_id = category_map.get(l.get('category'))
        if not market_cat_id:
            continue  # без соответствия категории пропускаем — иначе фид отклонят

        out.append(f'<offer id="{l["id"]}" available="true">')
        if site_url and l.get('slug'):
            out.append(f'<url>{_xml_escape(site_url)}/object/{l["slug"]}</url>')

        price_val = _total_price(l)
        if price_val > 0:
            out.append(f'<price>{price_val}</price>')
        out.append('<currencyId>RUB</currencyId>')
        out.append(f'<categoryId>{_xml_escape(str(market_cat_id))}</categoryId>')
        out.append('<set-ids>1</set-ids>')

        # Все фото объекта, до 10 штук (ограничение формата)
        images = _split_images(l)[:10]
        for img in images:
            out.append(f'<picture>{_xml_escape(img)}</picture>')

        title = _clean_title(l.get('title') or '')
        if title:
            out.append(f'<name>{_xml_escape(title)}</name>')

        if l.get('description'):
            desc = _xml_escape(l['description'])[:3000]
            out.append(f'<description>{desc}</description>')

        out.append(f'<param name="Конверсия">{_market_conversion_score(l)}</param>')
        deal_label = 'Аренда' if l.get('deal') == 'rent' else 'Продажа'
        out.append(f'<param name="Тип предложения">{deal_label}</param>')

        # Параметры объекта
        if l.get('area'):
            out.append(f'<param name="Площадь">{l["area"]}</param>')
        if l.get('category') == 'land' and l.get('land_area'):
            out.append(f'<param name="Площадь участка" unit="сотки">{l["land_area"]}</param>')
        if l.get('address'):
            addr = l['address']
            if l.get('city') and l['city'] not in addr:
                addr = f'{l["city"]}, {addr}'
            out.append(f'<param name="Адрес">{_xml_escape(addr)}</param>')
        elif l.get('city'):
            out.append(f'<param name="Адрес">{_xml_escape(l["city"])}</param>')
        if l.get('lat') and l.get('lng'):
            out.append(f'<param name="Широта">{l["lat"]}</param>')
            out.append(f'<param name="Долгота">{l["lng"]}</param>')
        if l.get('building_year'):
            out.append(f'<param name="Год постройки">{l["building_year"]}</param>')
        if l.get('floor') is not None:
            out.append(f'<param name="Этаж">{l["floor"]}</param>')
        if l.get('total_floors') is not None:
            out.append(f'<param name="Число этажей">{l["total_floors"]}</param>')
        if l.get('rooms') is not None:
            out.append(f'<param name="Число комнат">{l["rooms"]}</param>')
        if l.get('subway_station'):
            unit_attr = ' unit="Пешком"' if l.get('subway_distance') else ''
            out.append(f'<param name="Расстояние до метро"{unit_attr}>{l.get("subway_distance") or ""}</param>')
        if l.get('condition') and l['condition'] in CONDITION_TO_FINISHING_MARKET:
            out.append(f'<param name="Отделка">{CONDITION_TO_FINISHING_MARKET[l["condition"]]}</param>')
        if l.get('created_at'):
            try:
                dt = datetime.fromisoformat(str(l['created_at']).replace('Z', '+00:00'))
                out.append(f'<param name="Дата публикации">{dt.strftime("%Y-%m-%dT%H:%M:%S%z") or dt.isoformat()}</param>')
            except (ValueError, TypeError):
                pass
        if l.get('owner_name'):
            out.append(f'<param name="Название риелтора">{_xml_escape(l["owner_name"])}</param>')
        if l.get('owner_phone'):
            out.append(f'<param name="Телефон риелтора">{_xml_escape(l["owner_phone"])}</param>')
        if company.get('company_phone'):
            out.append(f'<param name="Телефон объекта">{_xml_escape(company["company_phone"])}</param>')
        if site_url:
            out.append(f'<param name="Сайт объекта">{_xml_escape(site_url)}</param>')

        out.append('</offer>')

    out.append('</offers>')
    out.append('</shop>')
    out.append('</yml_catalog>')
    return '\n'.join(out)


_HTML_TAG_RE = re.compile(r'<[^>]+>')


def _strip_html(s):
    """Убирает HTML-теги из названия/описания — площадки вроде VK Товары отклоняют
    карточки с посторонней разметкой в тексте (требование «нет кода/HTML-меток»)."""
    if not s:
        return ''
    return _HTML_TAG_RE.sub(' ', str(s))


def _build_vk_market(listings, company, category_map):
    """Строит YML-фид «Товары» для сообщества ВКонтакте (импорт через личный кабинет
    группы: Управление → Товары → Импортировать из файла). Формат — тот же YML
    (Yandex Market Language), что и у _build_yandex_market, но с жёсткими лимитами VK:
    не более 2 <param> на товар (у Яндекс.Маркета их может быть 10+), название/описание
    без HTML-разметки, картинки ТОЛЬКО JPG/PNG/GIF — WEBP не поддерживается площадкой,
    поэтому используются чистые JPG-копии фото (_split_images_for_feed с clean=True),
    иначе VK пропускает все товары как «без изображений». category_map — словарь
    {category объекта: categoryId в кабинете VK}, обычно один и тот же id для всех
    категорий (в VK нет отдельных типов коммерческой недвижимости — есть общая
    категория «Коммерческая недвижимость»)."""
    # Название специально короткое ("БМН"), а не полное company_name из настроек
    # (как у остальных фидов) — так просил заказчик именно для фида VK.
    company_name = 'БМН'
    site_url = (company.get('site_url') or '').rstrip('/')
    now = datetime.utcnow().strftime('%Y-%m-%d %H:%M')

    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append(f'<yml_catalog date="{now}">')
    out.append('<shop>')
    out.append(f'<name>{company_name}</name>')
    out.append(f'<company>{company_name}</company>')
    if site_url:
        out.append(f'<url>{_xml_escape(site_url)}</url>')
    out.append('<currencies><currency id="RUB" rate="1"/></currencies>')

    used_cat_ids = sorted(set(str(v) for v in category_map.values() if v))
    if used_cat_ids:
        out.append('<categories>')
        for cat_id in used_cat_ids:
            out.append(f'<category id="{_xml_escape(cat_id)}">Коммерческая недвижимость</category>')
        out.append('</categories>')

    out.append('<offers>')

    for l in listings:
        # VK хранит одну общую категорию недвижимости — ключ "*" в market_category_map
        # покрывает все типы объектов сразу, но поддерживаем и точечное соответствие
        # по category, если пользователь его настроит.
        vk_cat_id = category_map.get(l.get('category')) or category_map.get('*')
        if not vk_cat_id:
            continue  # без категории объект отклонят при импорте

        out.append(f'<offer id="{l["id"]}" available="true">')
        if site_url and l.get('slug'):
            out.append(f'<url>{_xml_escape(site_url)}/object/{l["slug"]}</url>')

        price_val = _total_price(l)
        if price_val > 0:
            out.append(f'<price>{price_val}</price>')
        out.append('<currencyId>RUB</currencyId>')
        out.append(f'<categoryId>{_xml_escape(str(vk_cat_id))}</categoryId>')

        # Картинки — обязательны (товары без фото VK пропускает при импорте) и должны
        # быть JPG/PNG/GIF: use_jpg_photos=True принудительно переключает на чистые
        # JPG-копии вместо исходных WEBP, которые VK не поддерживает. Лимит 5 штук —
        # жёсткое ограничение VK: товары с бОльшим числом фото площадка отбрасывает
        # целиком при импорте (проверено на реальной загрузке).
        images = _split_images_for_feed(l, None, use_jpg_photos=True)[:5]
        for img in images:
            out.append(f'<picture>{_xml_escape(img)}</picture>')

        title = _strip_html(_clean_title(l.get('title') or ''))
        if title:
            out.append(f'<name>{_xml_escape(title)}</name>')

        if l.get('description'):
            desc = _xml_escape(_strip_html(l['description']))[:3000]
            out.append(f'<description>{desc}</description>')

        # TODO: временно отключено по просьбе заказчика (param «Тип сделки» и
        # «Площадь») — проверяем, не в них ли причина ошибки при загрузке в VK.
        # deal_label = 'Аренда' if l.get('deal') == 'rent' else 'Продажа'
        # out.append(f'<param name="Тип сделки">{deal_label}</param>')
        # area_range = _area_range_label(l.get('area'))
        # if area_range:
        #     out.append(f'<param name="Площадь">{area_range}</param>')

        out.append('</offer>')

    out.append('</offers>')
    out.append('</shop>')
    out.append('</yml_catalog>')
    return '\n'.join(out)


def _build_avito(listings, company):
    """Строит XML-фид Авито (formatVersion=3, категория «Коммерческая недвижимость»)
    по актуальной схеме площадки (сверено с официальными шаблонами Авито от 01.08.2026:
    «авито аренда.docx» / «авито продажа.docx»). Схема для Сдам/Продам отличается набором
    полей условий сделки (RentalType/LeaseDeposit для аренды, TransactionType для продажи),
    остальные поля — общие."""
    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append('<Ads formatVersion="3" target="Avito.ru">')

    for l in listings:
        is_rent = l.get('deal') == 'rent'
        out.append('<Ad>')
        out.append(f'<Id>{l["id"]}</Id>')
        # AvitoId — заполняется вручную, только если это уже размещённое на Авито
        # объявление (например, добавлено не через автозагрузку или сменился Id).
        # Если поле пустое — тег не выводим, и Авито создаст новое объявление
        # вместо обновления существующего.
        if l.get('avito_ad_id'):
            out.append(f'<AvitoId>{l["avito_ad_id"]}</AvitoId>')
        # Дата "поднятия" объявления для Авито: feed_bump_at (авто-обновление),
        # иначе дата создания объекта.
        date_begin = (l.get('feed_bump_at') or l.get('created_at') or '')[:10]
        out.append(f'<DateBegin>{date_begin}</DateBegin>')

        # Контакт
        company_phone = company.get('company_phone', '')
        if company_phone:
            out.append(f'<ContactPhone>{_xml_escape(company_phone)}</ContactPhone>')

        # Заголовок и описание
        out.append(f'<Description><![CDATA[{l.get("description", "")}]]></Description>')

        # Фото
        imgs = _split_images(l)
        if imgs:
            out.append('<Images>')
            for img in imgs[:40]:
                out.append(f'<Image url="{_xml_escape(img)}"/>')
            out.append('</Images>')

        # Видео
        if l.get('video_url'):
            out.append(f'<VideoURL>{_xml_escape(l["video_url"])}</VideoURL>')

        # Адрес (новая схема: строка целиком + отдельные плоские координаты)
        addr_parts = [p for p in [l.get('city') or 'Краснодар', l.get('district'), l.get('address')] if p]
        out.append(f'<Address>{_xml_escape(", ".join(addr_parts))}</Address>')
        if l.get('lat') and l.get('lng'):
            out.append(f'<Longitude>{l["lng"]}</Longitude>')
            out.append(f'<Latitude>{l["lat"]}</Latitude>')

        out.append('<Category>Коммерческая недвижимость</Category>')
        if l.get('title'):
            out.append(f'<Title>{_xml_escape(_clean_title(l["title"]))}</Title>')

        # Доп. категории — до 2 значений, хранятся через | в additional_categories
        if l.get('additional_categories'):
            for ac in str(l['additional_categories']).split('|'):
                ac = ac.strip()
                ac_label = AVITO_OBJECT_TYPE_MAP.get(ac)
                if ac_label:
                    out.append(f'<AdditionalCategory>{_xml_escape(ac_label)}</AdditionalCategory>')

        # Способ связи — по умолчанию только звонки для Авито
        out.append('<ContactMethod>По телефону</ContactMethod>')

        # Цена
        price_val = _total_price(l)
        out.append(f'<Price>{price_val}</Price>')

        out.append(f'<OperationType>{"Сдам" if is_rent else "Продам"}</OperationType>')
        object_type = AVITO_OBJECT_TYPE_MAP.get(l.get('category'), 'Помещение свободного назначения')
        out.append(f'<ObjectType>{_xml_escape(object_type)}</ObjectType>')

        # Что сдаёте / Планировка — обязательные поля Авито для категории «Офисное помещение»
        if l.get('category') == 'office':
            out.append('<OfficeType>Помещение под офис</OfficeType>')
            layout = AVITO_LAYOUT_MAP.get(l.get('office_layout'))
            if layout:
                out.append(f'<Layout>{layout}</Layout>')

        # Права размещения (Собственник/Посредник) — обязательное поле
        rights = AVITO_PROPERTY_RIGHTS.get(l.get('property_rights'), 'Собственник')
        out.append(f'<PropertyRights>{rights}</PropertyRights>')

        # Вход
        entrance = AVITO_ENTRANCE_MAP.get(l.get('entrance'))
        if entrance:
            out.append(f'<Entrance>{entrance}</Entrance>')

        # Этаж — обязательное поле Авито для большинства категорий коммерции.
        # Если этаж не указан, но здание одноэтажное — подставляем 1 (единственно
        # возможный вариант), иначе оставляем как есть (реальный этаж неизвестен).
        avito_floor = l.get('floor')
        if avito_floor is None and l.get('total_floors') == 1:
            avito_floor = 1
        if avito_floor is not None:
            out.append(f'<Floor>{avito_floor}</Floor>')

        # Площадь
        if l.get('area'):
            out.append(f'<Square>{l["area"]}</Square>')

        # Высота потолков
        if l.get('ceiling_height'):
            out.append(f'<CeilingHeight>{l["ceiling_height"]}</CeilingHeight>')

        # Отделка — обязательна для большинства категорий
        decoration = AVITO_DECORATION_MAP.get(l.get('finishing') or l.get('condition'))
        if decoration:
            out.append(f'<Decoration>{decoration}</Decoration>')

        # Электросеть
        if l.get('electricity_kw'):
            try:
                out.append(f'<PowerGridCapacity>{int(float(l["electricity_kw"]))}</PowerGridCapacity>')
            except (TypeError, ValueError):
                pass

        # Отопление/освещение/розетки
        heating = _avito_heating(l)
        if heating:
            out.append(f'<Heating>{heating}</Heating>')

        # Тип здания — обязателен для большинства категорий. Если пользователь указал
        # тип явно (вкладка «Дополнительное», обязательно при export_avito) — используем
        # его, иначе безопасное значение по умолчанию из справочника.
        building_type_val = AVITO_BUILDING_TYPE_MAP.get(l.get('building_type'), AVITO_BUILDING_TYPE_DEFAULT)
        out.append(f'<BuildingType>{building_type_val}</BuildingType>')

        # Класс здания (только office/warehouse по схеме, но площадка игнорирует
        # тег для остальных категорий без ошибки — оставляем как есть при наличии данных)
        if l.get('building_class') and l.get('category') in ('office', 'warehouse'):
            out.append(f'<BuildingClass>{_xml_escape(l["building_class"])}</BuildingClass>')

        # Парковка — обязательна для большинства категорий
        parking_type = AVITO_PARKING_TYPE_MAP.get(l.get('parking'), 'Нет')
        out.append(f'<ParkingType>{parking_type}</ParkingType>')

        if is_rent:
            # Аренда: тип аренды обязателен, залог — опционален
            out.append('<RentalType>Прямая</RentalType>')
            deposit_label = AVITO_DEPOSIT_MAP.get(l.get('deposit_months'))
            if deposit_label:
                out.append(f'<Deposit>{deposit_label}</Deposit>')
            if l.get('rent_holidays'):
                out.append('<RentHolidays>Да</RentHolidays>')
            if l.get('avito_utilities_included') is not None:
                out.append(f'<UtilitiesIncluded>{"Да" if l["avito_utilities_included"] else "Нет"}</UtilitiesIncluded>')
        else:
            # Продажа: тип сделки обязателен. Переуступка права аренды — альтернативное
            # значение TransactionType (сверено с шаблоном Авито от 27.08.2026).
            if l.get('is_assignment'):
                out.append('<TransactionType>Переуступка права аренды</TransactionType>')
            else:
                out.append('<TransactionType>Продажа</TransactionType>')
            if l.get('is_auction'):
                out.append('<Auction>Да</Auction>')
            if l.get('is_share_sale'):
                out.append('<ShareInSale>Да</ShareInSale>')

        # НДС — общее поле для продажи и аренды
        if l.get('has_vat') is not None:
            out.append(f'<VAT>{"Да" if l["has_vat"] else "Нет"}</VAT>')

        # Ссылка на ZIP-архив с выпиской из ЕГРН — ускоряет модерацию на Авито.
        # Поле необязательное, передаём только если менеджер загрузил архив.
        if l.get('egrn_zip_url'):
            out.append(f'<EgrnExtractionLink><![CDATA[{l["egrn_zip_url"]}]]></EgrnExtractionLink>')

        out.append('</Ad>')

    out.append('</Ads>')
    return '\n'.join(out)


def _build_cian(listings, company):
    # Разбираем телефон компании для блока Phones
    raw_phone = company.get('company_phone', '') or ''
    # Очищаем от пробелов, скобок, тире
    import re as _re
    digits = _re.sub(r'\D', '', raw_phone)
    if digits.startswith('8') and len(digits) == 11:
        digits = '7' + digits[1:]
    cian_country_code = '+' + digits[:1] if digits else '+7'
    cian_phone_number = digits[1:] if len(digits) > 1 else ''

    out = ['<?xml version="1.0" encoding="UTF-8"?>']
    out.append('<feed>')
    out.append('<feed_version>2</feed_version>')

    for l in listings:
        deal = l.get('deal', 'sale')
        category = l.get('category', 'office')
        if deal == 'rent':
            cian_cat = CIAN_CATEGORY_MAP_RENT.get(category, 'officeRent')
        else:
            cian_cat = CIAN_CATEGORY_MAP_SALE.get(category, 'officeSale')

        out.append('<object>')
        out.append(f'<ExternalId>{l["id"]}</ExternalId>')
        out.append(f'<Category>{cian_cat}</Category>')

        # Уточнение назначения (Specialty) — обязательно для части категорий, см. CIAN_SPECIALTY выше
        if category in CIAN_SPECIALTY:
            out.append('<Specialty>')
            out.append('<Types>')
            out.append(f'<String>{CIAN_SPECIALTY[category]}</String>')
            out.append('</Types>')
            out.append('</Specialty>')

        # Телефон агентства (обязательный тег ЦИАН)
        if cian_phone_number:
            out.append('<Phones>')
            out.append('<PhoneSchema>')
            out.append(f'<CountryCode>{cian_country_code}</CountryCode>')
            out.append(f'<Number>{cian_phone_number}</Number>')
            out.append('</PhoneSchema>')
            out.append('</Phones>')

        # Описание — очищаем под требования ЦИАН (запрет &, замена «/–, удаление №//\\, длина 15-3000)
        _cian_desc = _clean_cian_description(l.get('description'))
        if _cian_desc:
            out.append(f'<Description><![CDATA[{_cian_desc}]]></Description>')

        # Заголовок (title)
        if l.get('title'):
            out.append(f'<Title>{_xml_escape(_clean_title(l["title"]))}</Title>')

        # Адрес — плоская строка: "Город, Район, Улица"
        addr_parts = [l.get('city') or 'Краснодар']
        if l.get('district'):
            addr_parts.append(l['district'])
        if l.get('address'):
            addr_parts.append(l['address'])
        out.append(f'<Address>{_xml_escape(", ".join(addr_parts))}</Address>')

        # Кадастровый номер объекта
        if l.get('cadastral_number'):
            out.append(f'<CadastralNumber>{_xml_escape(l["cadastral_number"])}</CadastralNumber>')

        is_land = category == 'land'

        # Тип входа в помещение — ЕСТЬ ТОЛЬКО у building/retail/free_purpose (сверено по
        # офиц. документации ЦИАН для каждой категории отдельно). У office/warehouse/
        # production/land тега InputType в схеме нет вообще.
        if category in CIAN_INPUT_TYPE_CATEGORIES and l.get('entrance') and l['entrance'] in CIAN_INPUT_TYPE:
            out.append(f'<InputType>{CIAN_INPUT_TYPE[l["entrance"]]}</InputType>')

        # Витринные окна — по документации есть у «Торговая площадь» И «Помещение свободного
        # назначения» (не только retail, как было раньше).
        if category in ('retail', 'free_purpose') and l.get('has_shop_windows'):
            out.append('<HasShopWindows>true</HasShopWindows>')

        # Координаты — отдельный блок
        if l.get('lat') and l.get('lng'):
            out.append('<Coordinates>')
            out.append(f'<Lat>{l["lat"]}</Lat>')
            out.append(f'<Lng>{l["lng"]}</Lng>')
            out.append('</Coordinates>')

        # Площадь: для категории «Здание» (продажа/аренда здания целиком) ЦИАН требует
        # TotalArea внутри тега <Building>, а не на верхнем уровне объекта. Для земли площадь
        # передаётся отдельным блоком <Land><Area> (ниже), TotalArea к ней не относится.
        is_whole_building = category == 'building'
        if l.get('area') and not is_whole_building and not is_land:
            out.append(f'<TotalArea>{l["area"]}</TotalArea>')
        if l.get('min_area') and not is_land:
            out.append(f'<MinArea>{l["min_area"]}</MinArea>')

        # Земельный участок (категория commercialLandSale/Rent) — своя отдельная схема,
        # не пересекается с Building/InputType/FloorNumber. Порядок и вложенность строго
        # по документации ЦИАН (xml_import/doc, раздел «Коммерческая земля»):
        # <Land><Area><AreaUnitType><Status></Land>, затем PermittedUseType и DrivewayType
        # уже ВНЕ тега Land, на верхнем уровне объекта.
        if is_land and l.get('land_area'):
            out.append('<Land>')
            out.append(f'<Area>{l["land_area"]}</Area>')
            out.append('<AreaUnitType>sotka</AreaUnitType>')
            _cian_land_status = CIAN_LAND_STATUS.get(l.get('land_status') or '', 'settlements')
            out.append(f'<Status>{_cian_land_status}</Status>')
            out.append('</Land>')
            _vri_slug = l.get('_land_vri_slug') or l.get('land_vri')
            if _vri_slug and _vri_slug in CIAN_PERMITTED_USE_TYPE:
                out.append(f'<PermittedUseType>{CIAN_PERMITTED_USE_TYPE[_vri_slug]}</PermittedUseType>')
            if l.get('driveway_type') and l['driveway_type'] in CIAN_DRIVEWAY_TYPE:
                out.append(f'<DrivewayType>{CIAN_DRIVEWAY_TYPE[l["driveway_type"]]}</DrivewayType>')

        # Этаж объекта — самостоятельный тег. По документации ЦИАН тега FloorNumber НЕТ
        # у категории «Здание» (buildingSale/Rent) — там передаётся только этажность всего
        # здания через Building.FloorsCount. Land тоже не имеет этого тега.
        if not is_land and category != 'building' and l.get('floor') is not None:
            out.append(f'<FloorNumber>{l["floor"]}</FloorNumber>')

        # ЦИАН требует обёртку <Building> для коммерческих категорий, КРОМЕ земли — у земли
        # своей схемы Building вообще нет (иначе фид не проходит валидацию: "Поле 'Building'
        # обязательно"). Все характеристики здания — этажность, высота потолков, класс,
        # год постройки, лифты, парковка — по документации ЦИАН идут ВНУТРИ этого тега.
        _building_class_map = {'A': 'a', 'A+': 'aPlus', 'B': 'b', 'B-': 'bMinus', 'B+': 'bPlus', 'C': 'c'}
        _house_line = CIAN_HOUSE_LINE_TYPE.get(str(l.get('road_line') or '')) if category in CIAN_HOUSE_LINE_TYPE_CATEGORIES else None
        _has_building_data = not is_land and (
            (is_whole_building and l.get('area')) or l.get('total_floors') is not None or
            l.get('ceiling_height') or l.get('building_year') or l.get('building_class') or
            l.get('passenger_lifts') or l.get('cargo_lifts') or l.get('parking') not in (None, '', 'none') or
            _house_line
        )
        if _has_building_data:
            out.append('<Building>')
            if is_whole_building and l.get('area'):
                out.append(f'<TotalArea>{l["area"]}</TotalArea>')
            if l.get('total_floors') is not None:
                out.append(f'<FloorsCount>{l["total_floors"]}</FloorsCount>')
            if l.get('building_year'):
                out.append(f'<BuildYear>{l["building_year"]}</BuildYear>')
            if l.get('ceiling_height'):
                out.append(f'<CeilingHeight>{l["ceiling_height"]}</CeilingHeight>')
            if l.get('passenger_lifts'):
                out.append(f'<PassengerLiftsCount>{int(l["passenger_lifts"])}</PassengerLiftsCount>')
            if l.get('cargo_lifts'):
                out.append(f'<CargoLiftsCount>{int(l["cargo_lifts"])}</CargoLiftsCount>')
            if l.get('parking') in ('building', 'street'):
                out.append('<Parking>')
                out.append(f'<Type>{"underground" if l["parking"] == "building" else "open"}</Type>')
                out.append('</Parking>')
            # Линия домов — только у building/retail (см. CIAN_HOUSE_LINE_TYPE_CATEGORIES)
            if _house_line:
                out.append(f'<HouseLineType>{_house_line}</HouseLineType>')
            if l.get('building_class') in _building_class_map:
                out.append(f'<ClassType>{_building_class_map[l["building_class"]]}</ClassType>')
            out.append('</Building>')

        # Состояние объекта — тег <ConditionType>, у каждой категории свой ограниченный
        # список допустимых значений (см. CIAN_CONDITION_TYPE_BY_CATEGORY выше). Тег
        # <Decoration> раньше ошибочно отправлялся для всех категорий, но по документации
        # ЦИАН он существует ТОЛЬКО в схеме продажи торговой площади (shoppingAreaSale) —
        # оставляем его только там, дополнительно к ConditionType.
        _condition_map = CIAN_CONDITION_TYPE_BY_CATEGORY.get(category)
        if _condition_map and l.get('condition') in _condition_map:
            out.append(f'<ConditionType>{_condition_map[l["condition"]]}</ConditionType>')
        if category == 'retail' and deal != 'rent':
            _decoration = None
            if l.get('finishing') and l['finishing'] in FINISHING_CIAN:
                _decoration = FINISHING_CIAN[l['finishing']]
            elif l.get('condition') and l['condition'] in CONDITION_TO_FINISHING_CIAN:
                _decoration = CONDITION_TO_FINISHING_CIAN[l['condition']]
            if _decoration:
                out.append(f'<Decoration>{_decoration}</Decoration>')

        # Мебель — по документации ЦИАН тег РАЗНЫЙ по категориям: office использует enum
        # <FurniturePresence>no/yes</FurniturePresence>, а building/retail — boolean
        # <HasFurniture>true</HasFurniture>. У склада/производства/своб.назначения тега
        # мебели в схеме нет вообще.
        if l.get('has_furniture'):
            if category == 'office':
                out.append('<FurniturePresence>yes</FurniturePresence>')
            elif category in ('building', 'retail'):
                out.append('<HasFurniture>true</HasFurniture>')

        # Апартаменты
        if l.get('is_apartments'):
            out.append('<IsApartments>true</IsApartments>')

        # Метро
        if l.get('subway_station'):
            out.append('<Undergrounds>')
            out.append('<Underground>')
            out.append(f'<StationName>{_xml_escape(l["subway_station"])}</StationName>')
            if l.get('subway_distance'):
                out.append(f'<Time>{l["subway_distance"]}</Time>')
                out.append('<TransportType>walk</TransportType>')
            out.append('</Underground>')
            out.append('</Undergrounds>')

        # Цена: _total_price() ВСЕГДА возвращает итоговую сумму за объект целиком
        # (даже если в БД цена изначально хранилась за м²/сотку — она уже умножена на площадь).
        out.append('<BargainTerms>')
        price_val = _total_price(l)
        out.append(f'<Price>{price_val}</Price>')
        if is_land:
            # У земли (commercialLandSale/Rent) своя схема BargainTerms: для продажи —
            # только Price/Currency/VatType (без ContractType — у земли его нет), для аренды —
            # совпадает с обычной арендой коммерции (см. ветку ниже), залог — SecurityDeposit.
            # Порядок строго по документации ЦИАН (xml_import/doc, «Коммерческая земля»).
            if deal == 'rent':
                out.append('<PriceType>all</PriceType>')
                out.append('<Currency>rur</Currency>')
                out.append('<PaymentPeriod>monthly</PaymentPeriod>')
                out.append('<VatType>included</VatType>')
                out.append('<LeaseType>direct</LeaseType>')
                out.append('<LeaseTermType>longTerm</LeaseTermType>')
                if l.get('prepay_months'):
                    out.append(f'<PrepayMonths>{l["prepay_months"]}</PrepayMonths>')
                out.append('<ClientFee>0</ClientFee>')
                if l.get('deposit_amount'):
                    out.append(f'<SecurityDeposit>{int(l["deposit_amount"])}</SecurityDeposit>')
                out.append('<AgentFee>0</AgentFee>')
            else:
                out.append('<Currency>rur</Currency>')
                out.append('<VatType>included</VatType>')
        elif deal == 'rent':
            # Схема BargainTerms для аренды коммерческих категорий (офис/склад/здание/
            # торговая площадь/производство/помещение своб. назначения) — сверено с офиц.
            # документацией ЦИАН (xml_import/doc) для каждой из этих категорий: порядок строго
            # Price → PriceType → Currency → PaymentPeriod → VatType → LeaseType → LeaseTermType →
            # PrepayMonths → ClientFee → SecurityDeposit → AgentFee. Тегов BargainAllowed и
            # UtilitiesTerms в этой схеме НЕТ ВООБЩЕ (это теги схемы жилой аренды flatRent) —
            # раньше они ошибочно добавлялись сюда. VatType обязателен всегда, а не опционален.
            out.append('<PriceType>all</PriceType>')
            out.append('<Currency>rur</Currency>')
            out.append('<PaymentPeriod>monthly</PaymentPeriod>')
            out.append('<VatType>included</VatType>')
            out.append('<LeaseType>direct</LeaseType>')
            # Срок аренды не хранится и не отображается в админке/на сайте — всегда «длительный».
            out.append('<LeaseTermType>longTerm</LeaseTermType>')
            if l.get('prepay_months'):
                out.append(f'<PrepayMonths>{l["prepay_months"]}</PrepayMonths>')
            # Комиссия — служебное поле карточки объекта (broker_commission) не публикуется
            # в открытых фидах ни при каких условиях. Без явных ClientFee/AgentFee ЦИАН
            # сам подставляет 100%, поэтому всегда передаём 0.
            out.append('<ClientFee>0</ClientFee>')
            if l.get('deposit_amount'):
                out.append(f'<SecurityDeposit>{int(l["deposit_amount"])}</SecurityDeposit>')
            out.append('<AgentFee>0</AgentFee>')
        else:
            # Схема BargainTerms для ПРОДАЖИ коммерческих категорий — принципиально другая
            # и НАМНОГО короче схемы аренды: только Price → Currency → VatType → ContractType.
            # Здесь НЕТ PriceType/ClientFee/AgentFee/BargainAllowed — по документации ЦИАН
            # (сверено для officeSale/warehouseSale/buildingSale/businessSale и т.д., единообразно).
            out.append('<Currency>rur</Currency>')
            out.append('<VatType>included</VatType>')
            out.append('<ContractType>sale</ContractType>')
        out.append('</BargainTerms>')

        # Фото
        imgs = _split_images(l)
        if imgs:
            out.append('<Photos>')
            for img in imgs[:50]:
                out.append(f'<PhotoSchema><FullUrl>{_xml_escape(img)}</FullUrl></PhotoSchema>')
            out.append('</Photos>')

        # Видео — ЦИАН принимает только ссылку на полноценное видео с VK (не VK Клип) или RUTUBE,
        # структура тега строго <Videos><VideoSchema><Url> (см. документацию xml_import/doc).
        _video_url = l.get('video_url') or ''
        _is_vk_clip = 'vkvideo.ru/clip' in _video_url.lower() or 'vk.com/clip' in _video_url.lower()
        if _video_url and not _is_vk_clip and ('vkvideo.ru' in _video_url.lower() or 'vk.com/video' in _video_url.lower() or 'rutube.ru' in _video_url.lower()):
            out.append('<Videos>')
            out.append(f'<VideoSchema><Url>{_xml_escape(_video_url)}</Url></VideoSchema>')
            out.append('</Videos>')

        # Дополнительные данные для модератора ЦИАН (не публикуются в объявлении, ускоряют модерацию)
        if l.get('owner_name') or l.get('owner_phone') or l.get('address'):
            out.append('<ExtraData>')
            if l.get('owner_name'):
                out.append(f'<HomeOwnerName>{_xml_escape(l["owner_name"])}</HomeOwnerName>')
            if l.get('owner_phone'):
                out.append(f'<HomeOwnerPhone>{_xml_escape(l["owner_phone"])}</HomeOwnerPhone>')
            if l.get('address'):
                out.append(f'<ExactAddress>{_xml_escape(", ".join(addr_parts))}</ExactAddress>')
            out.append('</ExtraData>')

        out.append('</object>')

    out.append('</feed>')
    return '\n'.join(out)


def _feeds_queue(cur):
    """Активные фиды в порядке очереди: давно не собиравшиеся — первыми."""
    cur.execute(
        f"SELECT * FROM {SCHEMA}.xml_feeds WHERE is_active = TRUE "
        f"ORDER BY last_generated_at ASC NULLS FIRST, id ASC"
    )
    return [dict(r) for r in cur.fetchall()]


def _feed_is_due(feed, force_before, stale_before):
    """Нужно ли пересобирать фид сейчас.
    force_before — «пересобрать всё, что собрано раньше этой метки» (кнопка в админке,
    сохранение объекта); stale_before — то же после ежедневного «поднятия» дат."""
    last = feed.get('last_generated_at')
    if last is None:
        return True
    last_aware = last.replace(tzinfo=timezone.utc) if last.tzinfo is None else last
    for mark in (force_before, stale_before):
        if mark is not None:
            mark_aware = mark.replace(tzinfo=timezone.utc) if mark.tzinfo is None else mark
            if last_aware < mark_aware:
                return True
    return (datetime.now(timezone.utc) - last_aware).total_seconds() / 60 >= STATIC_REGEN_MINUTES


def _build_batch(cur, conn, force_before=None, stale_before=None):
    """Собирает ОДНУ порцию: не больше FEED_BATCH_SIZE фидов и не дольше рабочего окна вызова.

    Запоминание места остановки: фиды обходятся от давно не собиравшихся к свежим, а
    собранный фид получает last_generated_at = NOW() — поэтому следующий вызов сам
    продолжает с первого несобранного. Отметки пишутся ОДНИМ запросом на порцию; если
    вызов оборвался — теряется только текущая порция (её фиды останутся «старыми» и
    соберутся первыми в следующем вызове).

    Пропуск неизменённых: у каждого фида хранится отпечаток содержимого (sha256 без
    строки с датой генерации). Совпал — файл в хранилище не перезаливается, фид только
    помечается свежим."""
    queue = _feeds_queue(cur)
    due = [f for f in queue if _feed_is_due(f, force_before, stale_before)]
    batch = due[:FEED_BATCH_SIZE]
    cache = FeedCache(cur)
    s3 = None
    done_rows = []
    results = []
    for feed in batch:
        if time_left() < FEED_MIN_LEFT_SEC:
            results.append({'slug': feed['slug'], 'skipped': True, 'reason': 'deferred (time budget)'})
            continue
        market_category_map = {}
        if feed['format'] in ('market', 'market_vk') and feed.get('market_category_map'):
            try:
                market_category_map = json.loads(feed['market_category_map'])
            except (ValueError, TypeError):
                market_category_map = {}
        xml_content = _build_feed_xml(
            cache, feed['slug'], feed['format'], feed.get('filter_category'), feed.get('filter_deal'),
            market_category_map=market_category_map, use_jpg_photos=feed.get('use_jpg_photos'),
            max_listings=feed.get('max_listings'), custom_phone=feed.get('custom_phone'),
        )
        if xml_content is None:
            results.append({'slug': feed['slug'], 'error': 'Неизвестный формат'})
            continue
        # VK Товары требует, чтобы ссылка на фид оканчивалась на .yml (иначе площадка
        # отклоняет файл при импорте) — остальные форматы сохраняем как .xml.
        ext = 'yml' if feed['format'] == 'market_vk' else 'xml'
        key = f"xml-feeds/{feed['slug']}.{ext}"
        cdn_url = _cdn_url(key)
        content_hash = _content_hash(xml_content)
        uploaded = content_hash != feed.get('content_hash') or feed.get('cdn_url') != cdn_url
        if uploaded:
            if s3 is None:
                s3 = _s3_client()
            # no-store — жёсткий запрет кэширования: с no-cache/max-age CDN отдавал
            # некоторые фиды недельной давности (edge-узел не всегда уважал ревалидацию).
            s3.put_object(
                Bucket=S3_BUCKET, Key=key, Body=xml_content.encode('utf-8'),
                ContentType='application/xml; charset=utf-8', CacheControl='no-store',
            )
        done_rows.append((feed['id'], cdn_url, content_hash, uploaded))
        results.append({'slug': feed['slug'], 'cdn_url': cdn_url, 'regenerated': True, 'uploaded': uploaded})

    if done_rows:
        _mark_feeds_built(cur, conn, done_rows)
    remaining = sum(1 for f in due) - len(done_rows)
    return results, remaining, len(queue)


def _mark_feeds_built(cur, conn, rows):
    """Отметки о сборке всей порции — одним запросом."""
    values = ', '.join(
        f"({int(fid)}, '{_safe(url, 500)}', '{_safe(h, 64)}', {'TRUE' if up else 'FALSE'})"
        for fid, url, h, up in rows
    )
    cur.execute(
        f"UPDATE {SCHEMA}.xml_feeds AS t SET cdn_url = v.url, content_hash = v.h, last_generated_at = NOW(), "
        f"content_uploaded_at = CASE WHEN v.up THEN NOW() ELSE t.content_uploaded_at END "
        f"FROM (VALUES {values}) AS v(id, url, h, up) WHERE t.id = v.id"
    )
    conn.commit()


_GEN_DATE_RE = re.compile(r'<generation-date>[^<]*</generation-date>|<yml_catalog date="[^"]*">')


def _content_hash(xml_content):
    """Отпечаток содержимого фида без меняющейся при каждой сборке даты генерации."""
    return hashlib.sha256(_GEN_DATE_RE.sub('', xml_content).encode('utf-8')).hexdigest()


def _build_state(cur):
    cur.execute(f"SELECT * FROM {SCHEMA}.feed_build_state WHERE name = 'main'")
    return dict(cur.fetchone() or {})


def _save_build_state(cur, conn, run_ms, built, uploaded, error=None):
    cur.execute(
        f"UPDATE {SCHEMA}.feed_build_state SET last_run_at = NOW(), last_run_ms = %s, last_built = %s, "
        f"last_uploaded = %s, last_error = %s, updated_at = NOW() WHERE name = 'main'",
        (run_ms, built, uploaded, (error or None) and error[:500])
    )
    conn.commit()


def _request_full_rebuild(cur, conn):
    """«Пересобрать всё»: каждый фид, собранный раньше этой метки, войдёт в ближайшие порции."""
    cur.execute(f"UPDATE {SCHEMA}.feed_build_state SET force_before = NOW(), updated_at = NOW() WHERE name = 'main'")
    conn.commit()


def _take_lock(cur, conn, rid):
    cur.execute(
        f"UPDATE {SCHEMA}.cron_locks SET locked_until = NOW() + INTERVAL '{BUILD_LOCK_TTL_SEC} seconds', "
        f"locked_by = %s, updated_at = NOW() "
        f"WHERE name = '{BUILD_LOCK_NAME}' AND (locked_until IS NULL OR locked_until < NOW()) RETURNING name",
        (rid,)
    )
    got = cur.fetchone() is not None
    conn.commit()
    return got


def _release_lock(cur, conn, rid):
    try:
        conn.rollback()
        cur.execute(
            f"UPDATE {SCHEMA}.cron_locks SET locked_until = NULL, updated_at = NOW() "
            f"WHERE name = '{BUILD_LOCK_NAME}' AND locked_by = %s", (rid,)
        )
        conn.commit()
    except Exception:
        pass


def _run_build(cur, conn, rid, source, force=False):
    """Один вызов сборки: поднятие дат (раз в сутки) → одна порция фидов → состояние."""
    if not _take_lock(cur, conn, rid):
        print(json.dumps({'event': 'feeds_busy', 'source': source}, ensure_ascii=False))
        return _json({'ok': True, 'skipped': True, 'reason': 'already_running'})
    try:
        if force:
            _request_full_rebuild(cur, conn)
        bump = _bump_feed_dates(cur, conn)
        stale_before = None
        if bump.get('updated', 0) > 0 or bump.get('already_ran'):
            cur.execute(f"SELECT feed_bump_cron_last_at FROM {SCHEMA}.settings ORDER BY id LIMIT 1")
            stale_before = (cur.fetchone() or {}).get('feed_bump_cron_last_at')
        state = _build_state(cur)
        results, remaining, total = _build_batch(cur, conn, state.get('force_before'), stale_before)
        built = sum(1 for r in results if r.get('regenerated'))
        uploaded = sum(1 for r in results if r.get('uploaded'))
        run_ms = call_elapsed_ms()
        _save_build_state(cur, conn, run_ms, built, uploaded)
        print(json.dumps({'event': 'feeds_batch', 'source': source, 'built': built, 'uploaded': uploaded,
                          'remaining': remaining, 'total': total, 'duration_ms': run_ms}, ensure_ascii=False))
        return _json({
            'ok': True, 'results': results, 'built': built, 'uploaded': uploaded,
            'remaining': remaining, 'total': total, 'done': remaining <= 0,
            'feed_bump': bump, 'duration_ms': run_ms,
        })
    except Exception as e:
        try:
            conn.rollback()
            _save_build_state(cur, conn, call_elapsed_ms(), 0, 0, f'{type(e).__name__}: {e}')
        except Exception:
            pass
        raise
    finally:
        _release_lock(cur, conn, rid)


CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id, X-Cron-Token',
    'Access-Control-Max-Age': '86400',
}

# Команды кабинетов площадок, переехавшие в platform-sync: старый адрес их больше
# не обслуживает (сайт и админка уже ходят на новый), но вебхук Юлы пересылается.
_MOVED_ACTIONS = {
    'cian_stats', 'cian_sync', 'cian_cron', 'yandex_stats', 'yandex_sync', 'yandex_cron',
    'avito_stats', 'avito_sync', 'avito_cron', 'youla_stats', 'youla_sync', 'youla_cron',
    'domclick_stats', 'domclick_sync', 'domclick_cron', 'youla_recreate', 'youla_claim_reset',
    'sync_health', 'other_platforms',
}


def _forward_youla_webhook(event):
    """Юла шлёт вебхуки на старый адрес (зарегистрирован в её поддержке) — пересылаем
    в platform-sync как есть, вместе с заголовками CloudEvents (Ce-Type и др.)."""
    hdrs = {k: v for k, v in (event.get('headers') or {}).items()
            if k.lower().startswith('ce-') or k.lower() == 'content-type'}
    body = event.get('body') or ''
    if event.get('isBase64Encoded'):
        import base64
        body = base64.b64decode(body).decode('utf-8', 'replace')
    req = urllib.request.Request(
        f'{PLATFORM_SYNC_URL}?action=youla_webhook', data=body.encode('utf-8'), method='POST', headers=hdrs,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return {'statusCode': r.status, 'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                    'body': r.read().decode('utf-8', 'replace')}
    except urllib.error.HTTPError as e:
        return {'statusCode': e.code, 'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': e.read().decode('utf-8', 'replace')}


def handler(event, context):
    """XML-фиды: сборка порциями (до 10 фидов за вызов, не дольше 25 с) и импорт из XML."""
    start_call(FEED_WORK_SEC)
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    headers_lc = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    expected = os.environ.get('CRON_SECRET', '')
    is_schedule = bool(expected) and headers_lc.get('x-cron-token') == expected
    if is_schedule and 'action' not in params:
        params = {**params, 'action': 'cron'}
    action = params.get('action', '')
    rid = str(getattr(context, 'request_id', None) or uuid.uuid4())

    if method == 'POST' and action == 'youla_webhook':
        return _forward_youla_webhook(event)
    if action in _MOVED_ACTIONS:
        return _json({'error': 'Команда перенесена в функцию platform-sync', 'moved_to': PLATFORM_SYNC_URL}, 410)

    try:
        conn = db_connect(os.environ['DATABASE_URL'])
    except Exception as e:
        if is_rate_limit(e):
            return busy_response()
        raise
    try:
        with conn.cursor() as cur:
            if method == 'GET' and action == 'cron':
                # Автоматический запуск (браузер посетителя или расписание): одна порция фидов.
                return _run_build(cur, conn, rid, 'schedule' if is_schedule else 'visitor')

            if method == 'GET' and action in ('generate_static', 'build_status'):
                user = _get_user(cur, _auth_token(event, params))
                if not user or user['role'] not in ('admin', 'editor'):
                    return _json({'error': 'Нет прав'}, 403)
                if action == 'build_status':
                    st = _build_state(cur)
                    cur.execute(
                        f"SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE last_generated_at < NOW() - INTERVAL '40 minutes' "
                        f"OR last_generated_at IS NULL) AS stale FROM {SCHEMA}.xml_feeds WHERE is_active = TRUE"
                    )
                    return _json({'ok': True, 'state': st, **dict(cur.fetchone() or {})})
                # «Пересобрать сейчас»: first=1 — ставит все фиды в очередь, далее админка
                # вызывает порции подряд, пока done=false (каждая порция — отдельный вызов ≤ 25 с).
                return _run_build(cur, conn, rid, 'admin', force=params.get('first') == '1')

            if method == 'GET' and action in ('backfill_feed_photos', 'backfill_feed_photos_dry'):
                # Разовое дозаполнение JPG-копий (xml-feeds-photos/) для фото, загруженных
                # ДО включения clean_photos у площадки (например gdeetotdom).
                user = _get_user(cur, _auth_token(event, params))
                if not user or user['role'] not in ('admin', 'editor'):
                    return _json({'error': 'Нет прав'}, 403)
                dry = action == 'backfill_feed_photos_dry'
                try:
                    offset = int(params.get('offset') or 0)
                except (TypeError, ValueError):
                    offset = 0
                result = _backfill_feed_photos_jpg(cur, offset=offset, dry_run=dry)
                return _json({'ok': True, 'dry_run': dry, **result})

            if method == 'GET':
                # Фиды отдаются только готовыми статическими файлами с CDN (см. cdn_url в xml_feeds).
                return _json({'error': 'Используйте статическую ссылку на файл (cdn_url) из раздела XML фиды в админке'}, 410)

            if method == 'POST':
                # Импорт объектов из XML Яндекс.Недвижимости (текст или ссылка).
                user = _get_user(cur, _auth_token(event))
                if not user or user['role'] not in ('admin', 'editor'):
                    return _json({'error': 'Нет прав'}, 403)
                body = json.loads(event.get('body') or '{}')
                xml_text = body.get('xml', '')
                source_url = (body.get('url') or '').strip()

                if not xml_text and source_url:
                    if not source_url.startswith(('http://', 'https://')):
                        return _json({'error': 'URL должен начинаться с http:// или https://'}, 400)
                    try:
                        req = urllib.request.Request(
                            source_url,
                            headers={'User-Agent': 'BIZNEST-XML-Importer/1.0'},
                        )
                        with urllib.request.urlopen(req, timeout=25) as resp:
                            raw = resp.read()
                        head = raw[:200].decode('ascii', errors='ignore')
                        m = re.search(r'encoding=["\']([^"\']+)["\']', head, re.IGNORECASE)
                        enc = (m.group(1) if m else 'utf-8').lower()
                        try:
                            xml_text = raw.decode(enc, errors='replace')
                        except (LookupError, UnicodeDecodeError):
                            xml_text = raw.decode('utf-8', errors='replace')
                    except urllib.error.HTTPError as e:
                        return _json({'error': f'HTTP {e.code} при загрузке {source_url}'}, 400)
                    except urllib.error.URLError as e:
                        return _json({'error': f'Не удалось загрузить XML: {str(e.reason)[:200]}'}, 400)
                    except Exception as e:
                        return _json({'error': f'Ошибка загрузки: {str(e)[:200]}'}, 400)

                if not xml_text:
                    return _json({'error': 'Пустой XML'}, 400)

                xml_text = re.sub(r'\sxmlns="[^"]+"', '', xml_text, count=1)
                autofix_report = []
                try:
                    root = ET.fromstring(xml_text)
                except ET.ParseError:
                    fixed_text, autofix_report = _autofix_xml(xml_text)
                    try:
                        root = ET.fromstring(fixed_text)
                    except ET.ParseError as e:
                        return _json({
                            'error': f'Ошибка парсинга XML: {str(e)[:200]}',
                            'autofix_attempted': autofix_report,
                        }, 400)

                rows = []
                errors = []
                for offer in root.findall('.//offer'):
                    try:
                        otype = (offer.findtext('type') or '').lower()
                        deal = 'rent' if 'аренд' in otype else 'sale'
                        category = 'office'
                        cat_text = (offer.findtext('category') or '').lower()
                        if 'торг' in cat_text:
                            category = 'retail'
                        elif 'склад' in cat_text:
                            category = 'warehouse'
                        elif 'производ' in cat_text:
                            category = 'production'
                        elif 'земл' in cat_text or 'участ' in cat_text:
                            category = 'land'
                        elif 'здани' in cat_text:
                            category = 'building'
                        elif 'свободн' in cat_text or 'псн' in cat_text:
                            category = 'free_purpose'

                        title = offer.findtext('description') or 'Без названия'
                        title = title[:255].strip().split('\n')[0]
                        description = offer.findtext('description') or ''
                        price_val = offer.findtext('price/value') or '0'
                        try:
                            price = int(float(price_val))
                        except Exception:
                            price = 0
                        area_val = offer.findtext('area/value') or '0'
                        try:
                            area = int(float(area_val))
                        except Exception:
                            area = 0
                        city = offer.findtext('location/locality-name') or 'Краснодар'
                        address = offer.findtext('location/address') or ''
                        floor_val = offer.findtext('floor')
                        floor = int(floor_val) if floor_val and floor_val.isdigit() else None
                        floors_total_val = offer.findtext('floors-total')
                        total_floors = int(floors_total_val) if floors_total_val and floors_total_val.isdigit() else None
                        ceiling_val = offer.findtext('ceiling-height')
                        ceiling_height = float(ceiling_val) if ceiling_val else None
                        built_year_val = offer.findtext('built-year')
                        building_year = int(built_year_val) if built_year_val and built_year_val.isdigit() else None
                        building_class = offer.findtext('building-class') or None

                        images = [img.text.strip() for img in offer.findall('image') if img.text]
                        first_img = images[0] if images else ''
                        images_str = '|'.join(images)

                        # Метро
                        subway_station = offer.findtext('.//metro/name') or None
                        subway_time = offer.findtext('.//metro/time-on-foot')
                        subway_distance = int(subway_time) if subway_time and subway_time.isdigit() else None

                        lat_val = offer.findtext('location/latitude')
                        lng_val = offer.findtext('location/longitude')
                        lat = float(lat_val) if lat_val else None
                        lng = float(lng_val) if lng_val else None

                        rows.append((
                            title[:255], description[:5000], category, deal, price, area,
                            address[:255], city[:100], first_img[:500], images_str[:5000],
                            'active', user['id'], user['id'], floor, total_floors, ceiling_height,
                            building_year, (building_class or None) and building_class[:10],
                            (subway_station or None) and subway_station[:150], subway_distance, lat, lng,
                        ))
                    except Exception as e:
                        errors.append(str(e)[:100])

                # Все объекты — одним запросом (раньше INSERT на каждый объект в цикле).
                if rows:
                    execute_values(cur, f"""
                        INSERT INTO {SCHEMA}.listings
                        (title, description, category, deal, price, area, address, city, image, images, status,
                         author_id, broker_id, floor, total_floors, ceiling_height, building_year, building_class,
                         subway_station, subway_distance, lat, lng)
                        VALUES %s
                    """, rows)
                conn.commit()
                return _json({
                    'imported': len(rows),
                    'errors': errors[:5],
                    'autofix_applied': autofix_report,
                })

            return _json({'error': 'Method not allowed'}, 405)
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        if is_rate_limit(e):
            print(f'[xml-feeds] rate limit: action={action}')
            return busy_response()
        print(f'[xml-feeds] unhandled error: {type(e).__name__}: {e}\n{traceback.format_exc()}')
        return _json({'error': f'Internal error: {type(e).__name__}: {str(e)[:300]}'}, 500)
    finally:
        conn.close()
