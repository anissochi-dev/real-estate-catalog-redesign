"""
Business: XML-фиды для выгрузки объектов на Яндекс.Недвижимость, Авито, ЦИАН (статические файлы в S3+CDN,
обновляются по крону) + импорт объектов из XML Яндекс.Недвижимости + синхронизация статистики/баланса
кабинета ЦИАН (объединено из backend/cian-api) + синхронизация звонков Яндекс.Недвижимость +
проверка подключения/баланса кабинета Авито (Core API).
Args: event с httpMethod GET/POST, queryStringParameters {action, sync}
Returns: XML текст или JSON, в зависимости от action
"""

import json
import os
import re
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
S3_BUCKET = 'files'
S3_ENDPOINT = 'https://bucket.poehali.dev'
CDN_BASE = 'https://cdn.poehali.dev'
STATIC_REGEN_MINUTES = 20

CIAN_BASE = 'https://public-api.cian.ru'
CIAN_SYNC_INTERVAL_HOURS = 1

YANDEX_REALTY_API_BASE = 'https://api.realty.yandex.net/2.0'
YANDEX_REALTY_PARTNER_TOKEN = 'public-partner-ak0hmqjjk1thu3eutxy8hd1i56mhprpfbb6575qw'
YANDEX_REALTY_SYNC_INTERVAL_HOURS = 1

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


def _safe(s, length=255):
    return (s or '').replace("'", "''")[:length]


def _xml_escape(s):
    if s is None:
        return ''
    s = str(s)
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


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


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _xml_response(content):
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/xml; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
        },
        'body': content,
    }


def _json(data, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(data, ensure_ascii=False, default=str),
    }


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


def _build_feed_xml(cur, feed_slug, fmt, filter_category, filter_deal, market_category_map=None, use_jpg_photos=None, max_listings=None, custom_phone=None):
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
    elif fmt == 'other':
        # Площадки группы «Разное» (realtymag, rucountry и т.п.) — универсальные бесплатные
        # каталоги без API. Один общий флаг «Р» на объекте включает выгрузку сразу во ВСЕ
        # такие площадки одновременно (в отличие от Я/А/Ц, у каждой из которых свой флаг).
        where.append("export_other = TRUE")
    elif fmt in ('market', 'market_vk'):
        # YML-фиды товаров (Яндекс.Маркет, VK Товары) — используют тот же флаг, что и
        # группа «Разное» (отдельного флага на объекте не заводим, чтобы не плодить
        # галочки в карточке).
        where.append("export_other = TRUE")

    cur.execute(f"SELECT * FROM {SCHEMA}.listings WHERE {' AND '.join(where)} ORDER BY created_at DESC")
    listings = [dict(r) for r in cur.fetchall()]
    if max_listings:
        # Ограничение площадки на количество объектов в фиде (например Doska.ru — 100):
        # берём самые свежие (список уже отсортирован по created_at DESC) — по мере
        # появления новых объектов старые автоматически перестают попадать в выгрузку.
        listings = listings[:max_listings]

    cur.execute(f"SELECT slug, name FROM {SCHEMA}.land_vri")
    _vri_map = {r['slug']: r['name'] for r in cur.fetchall()}
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

    cur.execute(f"SELECT * FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
    company = dict(cur.fetchone() or {})
    # Подменный телефон конкретного фида (например для отслеживания звонков с площадки) —
    # если указан, все генераторы формата (_build_yandex/_build_avito/_build_cian/
    # _build_yandex_market) используют его вместо основного телефона компании, т.к. они
    # уже читают company.get('company_phone') — отдельно каждую функцию не меняем.
    if custom_phone:
        company['company_phone'] = custom_phone

    if fmt == 'yandex':
        cur.execute(f"SELECT name, region FROM {SCHEMA}.cities WHERE region IS NOT NULL")
        city_region_map = {r['name']: r['region'] for r in cur.fetchall()}
        return _build_yandex(listings, company, feed_slug, use_jpg_photos, city_region_map)
    if fmt == 'avito':
        return _build_avito(listings, company)
    if fmt == 'cian':
        return _build_cian(listings, company)
    if fmt == 'other':
        # Площадки «Разное» без собственного формата — используем универсальную
        # yandex-схему (её принимает большинство каталогов недвижимости).
        # feed_slug пробрасывается дальше — так у ОДНОЙ конкретной площадки (например
        # 23estate) можно включить индивидуальную особенность через FEED_OVERRIDES,
        # не затрагивая остальные площадки группы «Разное». use_jpg_photos — тот же
        # переключатель, но задаётся пользователем из настроек фида (приоритетнее).
        cur.execute(f"SELECT name, region FROM {SCHEMA}.cities WHERE region IS NOT NULL")
        city_region_map = {r['name']: r['region'] for r in cur.fetchall()}
        return _build_yandex(listings, company, feed_slug, use_jpg_photos, city_region_map)
    if fmt == 'market':
        return _build_yandex_market(listings, company, market_category_map or {})
    if fmt == 'market_vk':
        return _build_vk_market(listings, company, market_category_map or {})
    return None


def _regenerate_static_feeds(cur, conn, force=False):
    """Пересобирает XML для всех активных фидов и заливает готовые файлы в S3.
    Пропускает фид, если он обновлялся меньше STATIC_REGEN_MINUTES назад (если force=False)."""
    cur.execute(f"SELECT * FROM {SCHEMA}.xml_feeds WHERE is_active = TRUE ORDER BY id ASC")
    feeds = [dict(r) for r in cur.fetchall()]
    s3 = None
    results = []

    for feed in feeds:
        last_gen = feed.get('last_generated_at')
        if not force and last_gen:
            elapsed_min = (datetime.now(timezone.utc) - last_gen.replace(tzinfo=timezone.utc)).total_seconds() / 60
            if elapsed_min < STATIC_REGEN_MINUTES:
                results.append({'slug': feed['slug'], 'skipped': True, 'reason': f'{round(elapsed_min, 1)}m ago'})
                continue

        market_category_map = {}
        if feed['format'] in ('market', 'market_vk') and feed.get('market_category_map'):
            try:
                market_category_map = json.loads(feed['market_category_map'])
            except (ValueError, TypeError):
                market_category_map = {}

        xml_content = _build_feed_xml(
            cur, feed['slug'], feed['format'], feed.get('filter_category'), feed.get('filter_deal'),
            market_category_map=market_category_map, use_jpg_photos=feed.get('use_jpg_photos'),
            max_listings=feed.get('max_listings'), custom_phone=feed.get('custom_phone'),
        )
        if xml_content is None:
            results.append({'slug': feed['slug'], 'error': 'Неизвестный формат'})
            continue

        if s3 is None:
            s3 = _s3_client()
        # VK Товары требует, чтобы ссылка на фид оканчивалась на .yml (иначе площадка
        # отклоняет файл при импорте) — остальные форматы сохраняем как .xml, как раньше.
        ext = 'yml' if feed['format'] == 'market_vk' else 'xml'
        key = f"xml-feeds/{feed['slug']}.{ext}"
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=xml_content.encode('utf-8'),
            ContentType='application/xml; charset=utf-8',
            CacheControl='public, max-age=300',
        )
        cdn_url = _cdn_url(key)
        cur.execute(
            f"UPDATE {SCHEMA}.xml_feeds SET cdn_url = '{_safe(cdn_url, 500)}', last_generated_at = NOW() WHERE id = {feed['id']}"
        )
        conn.commit()
        results.append({'slug': feed['slug'], 'cdn_url': cdn_url, 'regenerated': True})

    return results


def _bump_feed_dates(cur, conn):
    """Раз в сутки, в окне settings.feed_bump_cron_hour/minute (UTC), проставляет
    feed_bump_at = NOW() всем активным и видимым объектам, у которых включена
    выгрузка хотя бы на одну площадку (Яндекс/Авито/ЦИАН/Разное). Это поднимает
    дату объявления в фидах площадок, НЕ трогая updated_at — сортировка «новые/
    обновлённые» на сайте и история редактирования в админке не затрагиваются.

    По умолчанию: 06:23 UTC = 09:23 МСК.
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
    target_minute = int(s.get('feed_bump_cron_minute') if s.get('feed_bump_cron_minute') is not None else 23)
    last_at = s.get('feed_bump_cron_last_at')
    already_ran = last_at and hasattr(last_at, 'date') and last_at.date() >= now_utc.date()
    time_ok = now_utc.hour == target_hour and abs(now_utc.minute - target_minute) <= 5

    if not time_ok or already_ran:
        return {'skipped': True, 'time_ok': time_ok, 'already_ran': already_ran}

    cur.execute(
        f"UPDATE {SCHEMA}.listings SET feed_bump_at = NOW() "
        f"WHERE status = 'active' AND (is_visible IS NULL OR is_visible = TRUE) "
        f"AND (export_yandex = TRUE OR export_avito = TRUE OR export_cian = TRUE OR export_other = TRUE)"
    )
    updated = cur.rowcount
    cur.execute(f"UPDATE {SCHEMA}.settings SET feed_bump_cron_last_at = NOW() WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id LIMIT 1)")
    conn.commit()
    return {'skipped': False, 'updated': updated}


def _split_images(row):
    if row.get('images'):
        return [u.strip() for u in str(row['images']).split('|') if u.strip()]
    if row.get('image'):
        return [row['image']]
    return []


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


# ── Маппинги категорий ──────────────────────────────────────────────────────

YANDEX_CATEGORY_MAP = {
    'office': 'офисное помещение',
    'retail': 'торговое помещение',
    'warehouse': 'складское помещение',
    'restaurant': 'помещение свободного назначения',
    'hotel': 'помещение свободного назначения',
    'business': 'готовый бизнес',
    'gab': 'готовый бизнес',
    'production': 'производственное помещение',
    'land': 'земля',
    'building': 'здание',
    'free_purpose': 'помещение свободного назначения',
    'car_service': 'производственное помещение',
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


def _build_yandex(listings, company, feed_slug=None, use_jpg_photos=None, city_region_map=None):
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
        commercial_type = YANDEX_COMMERCIAL_TYPE_MAP.get(l.get('category'), 'office')
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
        out.append(f'<commercial-type>{commercial_type}</commercial-type>')
        # deal-status обязателен только для аренды; для продажи не передаётся
        if l.get('deal') == 'rent':
            out.append('<deal-status>direct rent</deal-status>')
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

        # Агент
        out.append('<sales-agent>')
        out.append(f'<name>{company_name}</name>')
        if phone:
            out.append(f'<phone>{phone}</phone>')
        if email:
            out.append(f'<email>{email}</email>')
        out.append('<category>agency</category>')
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
        out.append('</price>')

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

        # Этажность
        if l.get('floor') is not None:
            out.append(f'<floor>{l["floor"]}</floor>')
        if l.get('total_floors') is not None:
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

        # Видео — YouTube или RuTube
        video_url = l.get('video_url') or ''
        video_url_lower = video_url.lower()
        if video_url and 'youtu' in video_url_lower:
            out.append('<video-review>')
            out.append(f'<youtube-video-review-url>{_xml_escape(video_url)}</youtube-video-review-url>')
            out.append('</video-review>')
        elif video_url and 'rutube' in video_url_lower:
            out.append('<video-review>')
            out.append(f'<rutube-video-review-url>{_xml_escape(video_url)}</rutube-video-review-url>')
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


_VK_AREA_BUCKETS = [10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000]


def _area_range_label(area):
    """Переводит точную площадь объекта в диапазон («50-75 м²») вместо точного числа.
    У VK лимит 50 уникальных значений на param — если отдавать площадь как есть
    (у каждого объекта своё значение), лимит почти всегда превышается и площадка
    ругается на «свойство с бОльшим числом значений». Фиксированная сетка диапазонов
    держит количество уникальных значений заведомо ниже лимита."""
    try:
        val = float(area)
    except (TypeError, ValueError):
        return None
    if val <= 0:
        return None
    prev = 0
    for bucket in _VK_AREA_BUCKETS:
        if val <= bucket:
            return f'{prev}-{bucket} м²'
        prev = bucket
    return f'{_VK_AREA_BUCKETS[-1]}+ м²'


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

        # Не более 2 param — жёсткий лимит VK (у Яндекс.Маркета их может быть много больше)
        deal_label = 'Аренда' if l.get('deal') == 'rent' else 'Продажа'
        out.append(f'<param name="Тип сделки">{deal_label}</param>')
        area_range = _area_range_label(l.get('area'))
        if area_range:
            out.append(f'<param name="Площадь">{area_range}</param>')

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


# ── ЦИАН: синхронизация статистики/баланса/услуг через public-api.cian.ru ───
# (объединено из backend/cian-api). Сами объекты выгружаются через XML выше,
# этот блок только ЧИТАЕТ данные кабинета (статистика, баланс, услуги, звонки).

def _cian_get(path, token):
    url = f'{CIAN_BASE}{path}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


def _cian_chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def _cian_sync(cur, conn, token):
    """Синхронизирует объявления, статистику, услуги, звонки и баланс ЦИАН → БД."""
    offers_count = stats_count = services_count = calls_count = 0

    all_offers = []
    page = 1
    while True:
        data, err = _cian_get(f'/v2/get-my-offers?page={page}&pageSize=100', token)
        if err or not data:
            break
        result = data.get('result') or {}
        items = result.get('announcements') or []
        all_offers.extend(items)
        total = result.get('totalCount', 0)
        if len(all_offers) >= total or not items:
            break
        page += 1
        if page > 20:
            break

    for o in all_offers:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.cian_offers (id, status, source, creation_date, synced_at, archived_at)
            VALUES (%s,%s,%s,%s, NOW(), NULL)
            ON CONFLICT (id) DO UPDATE SET
                status=EXCLUDED.status, source=EXCLUDED.source,
                creation_date=EXCLUDED.creation_date, synced_at=NOW(),
                archived_at=NULL
        """, (o.get('id'), o.get('status'), o.get('source'), o.get('creationDate')))
    offers_count = len(all_offers)
    offer_ids = [o['id'] for o in all_offers if o.get('id')]

    # Объявления, которых больше нет в ответе ЦИАН (сняты с публикации, ушли в архив на
    # стороне ЦИАН, удалены вручную и т.п.) — НЕ удаляем, а помечаем как архивные, сохраняя
    # всю историю просмотров/звонков/услуг. Так они не засоряют активный дашборд, но
    # статистика по ним не теряется — их можно посмотреть во вкладке «Архив».
    # Защита: если API вернул пустой список (сбой/ошибка авторизации), ничего не трогаем.
    if offer_ids:
        keep_ids_sql = ','.join(str(oid) for oid in offer_ids)
        cur.execute(f"""
            UPDATE {SCHEMA}.cian_offers SET archived_at = NOW()
            WHERE id NOT IN ({keep_ids_sql}) AND archived_at IS NULL
        """)

    for batch in _cian_chunks(offer_ids, 50):
        qs = '&'.join(f'offerIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-my-offers-detail?{qs}', token)
        if err or not data:
            continue
        for item in (data.get('result') or {}).get('offers') or []:
            ext_id = item.get('externalId')
            try:
                ext_id_int = int(ext_id) if ext_id else None
            except (ValueError, TypeError):
                ext_id_int = None
            cur.execute(f"""
                UPDATE {SCHEMA}.cian_offers SET external_id = %s, url = %s WHERE id = %s
            """, (ext_id_int, item.get('url'), item.get('id')))

    for batch in _cian_chunks(offer_ids, 50):
        qs = '&'.join(f'offersIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-views-statistics?{qs}', token)
        if err or not data:
            continue
        for s in (data.get('result') or {}).get('statistics') or []:
            cur.execute(f"""
                INSERT INTO {SCHEMA}.cian_offer_stats
                    (offer_id, add_to_favorites, calls, chats, phone_shows, phone_views, phone_views_and_chats, responses, shows_base, synced_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
                ON CONFLICT (offer_id) DO UPDATE SET
                    add_to_favorites=EXCLUDED.add_to_favorites, calls=EXCLUDED.calls, chats=EXCLUDED.chats,
                    phone_shows=EXCLUDED.phone_shows, phone_views=EXCLUDED.phone_views,
                    phone_views_and_chats=EXCLUDED.phone_views_and_chats, responses=EXCLUDED.responses,
                    shows_base=EXCLUDED.shows_base, synced_at=NOW()
            """, (
                s.get('offerId'), s.get('addToFavorites', 0), s.get('calls', 0), s.get('chats', 0),
                s.get('phoneShows', 0), s.get('phoneViews', 0), s.get('phoneViewsAndChats', 0),
                s.get('responses', 0), s.get('showsBase', 0),
            ))
            stats_count += 1

    for batch in _cian_chunks(offer_ids, 50):
        qs = '&'.join(f'offerIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-offer-active-services?{qs}', token)
        if err or not data:
            continue
        for item in (data.get('result') or {}).get('items') or []:
            oid = item.get('offerId')
            for svc in item.get('services') or []:
                for stype in svc.get('serviceTypes') or []:
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.cian_offer_services (offer_id, service_type, price, paid_till, auto_prolong, synced_at)
                        VALUES (%s,%s,%s,%s,%s, NOW())
                        ON CONFLICT (offer_id, service_type) DO UPDATE SET
                            price=EXCLUDED.price, paid_till=EXCLUDED.paid_till,
                            auto_prolong=EXCLUDED.auto_prolong, synced_at=NOW()
                    """, (oid, stype, svc.get('price'), svc.get('paidTill'), svc.get('autoProlongEnabled', False)))
                    services_count += 1

    date_to = datetime.now().strftime('%Y-%m-%d')
    date_from = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    page = 1
    while True:
        data, err = _cian_get(
            f'/v2/get-calls-report?dateFrom={date_from}&dateTo={date_to}&page={page}&pageSize=100', token,
        )
        if err or not data:
            break
        result = data.get('result') or {}
        calls = result.get('calls') or []
        for c in calls:
            offer = c.get('offer') or {}
            ext_id = offer.get('externalId')
            try:
                ext_id_int = int(ext_id) if ext_id else None
            except (ValueError, TypeError):
                ext_id_int = None
            cur.execute(f"""
                INSERT INTO {SCHEMA}.cian_calls
                    (call_id, offer_id, external_id, source_phone, destination_phone, calltracking_phone,
                     duration, status, call_datetime, employee_id, synced_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
                ON CONFLICT (call_id) DO UPDATE SET
                    offer_id=EXCLUDED.offer_id, external_id=EXCLUDED.external_id,
                    source_phone=EXCLUDED.source_phone, destination_phone=EXCLUDED.destination_phone,
                    calltracking_phone=EXCLUDED.calltracking_phone, duration=EXCLUDED.duration,
                    status=EXCLUDED.status, call_datetime=EXCLUDED.call_datetime,
                    employee_id=EXCLUDED.employee_id, synced_at=NOW()
            """, (
                c.get('callId'), offer.get('id'), ext_id_int, c.get('sourcePhone'), c.get('destinationPhone'),
                c.get('calltrackingPhone'), c.get('duration'), c.get('status'), c.get('datetime'), c.get('employeeId'),
            ))
            calls_count += 1
        total = result.get('totalCount', 0)
        if page * 100 >= total or not calls:
            break
        page += 1
        if page > 20:
            break

    bdata, berr = _cian_get('/v1/get-my-balance', token)
    if not berr and bdata:
        bres = bdata.get('result') or {}
        bonuses = sum(float(b.get('amount', 0) or 0) for b in (bres.get('bonuses') or []))
        auction_pts = sum(float(b.get('amount', 0) or 0) for b in (bres.get('auctionPoints') or []))
        cur.execute(f"""
            INSERT INTO {SCHEMA}.cian_balance (total_balance, bonuses_amount, auction_points_amount, synced_at)
            VALUES (%s,%s,%s, NOW())
        """, (bres.get('totalBalance', 0), bonuses, auction_pts))

    conn.commit()

    cur.execute(f"""
        INSERT INTO {SCHEMA}.cian_sync_log (synced_at, offers_count, stats_count, services_count, calls_count)
        VALUES (NOW(), %s, %s, %s, %s)
    """, (offers_count, stats_count, services_count, calls_count))
    conn.commit()

    return {'offers_count': offers_count, 'stats_count': stats_count, 'services_count': services_count, 'calls_count': calls_count}


def _cian_read_from_db(cur):
    """Читает все данные кабинета ЦИАН из БД и возвращает в формате для фронтенда.
    Объявления делятся на активные (archived_at IS NULL) и архивные — история
    просмотров/звонков/услуг сохраняется по обеим группам."""
    cur.execute(f"""
        SELECT o.id, o.external_id, o.status, o.source, o.url, o.creation_date, o.archived_at,
               l.title, l.slug, l.category, l.deal, l.price, l.image,
               COALESCE(s.add_to_favorites, 0) AS add_to_favorites,
               COALESCE(s.calls, 0) AS calls,
               COALESCE(s.chats, 0) AS chats,
               COALESCE(s.phone_shows, 0) AS phone_shows,
               COALESCE(s.responses, 0) AS responses,
               COALESCE(s.shows_base, 0) AS views
        FROM {SCHEMA}.cian_offers o
        LEFT JOIN {SCHEMA}.listings l ON l.id = o.external_id
        LEFT JOIN {SCHEMA}.cian_offer_stats s ON s.offer_id = o.id
        ORDER BY o.id DESC
    """)
    all_offers = [dict(r) for r in cur.fetchall()]

    cur.execute(f"SELECT offer_id, service_type, price, paid_till, auto_prolong FROM {SCHEMA}.cian_offer_services")
    services_by_offer = {}
    service_type_counts = {}
    for r in cur.fetchall():
        d = dict(r)
        services_by_offer.setdefault(d['offer_id'], []).append(d)
        service_type_counts[d['service_type']] = service_type_counts.get(d['service_type'], 0) + 1

    cur.execute(f"""
        SELECT offer_id, external_id, source_phone, duration, status, call_datetime
        FROM {SCHEMA}.cian_calls
        ORDER BY call_datetime DESC
    """)
    calls_by_offer = {}
    for r in cur.fetchall():
        d = dict(r)
        calls_by_offer.setdefault(d['offer_id'], []).append(d)

    cur.execute(f"SELECT * FROM {SCHEMA}.cian_balance ORDER BY synced_at DESC LIMIT 1")
    balance = dict(cur.fetchone() or {})

    cur.execute(f"SELECT * FROM {SCHEMA}.cian_sync_log ORDER BY synced_at DESC LIMIT 1")
    last_sync = dict(cur.fetchone() or {})

    for o in all_offers:
        o['services'] = services_by_offer.get(o['id'], [])
        o['calls_list'] = calls_by_offer.get(o['id'], [])

    offers = [o for o in all_offers if not o.get('archived_at')]
    archived_offers = [o for o in all_offers if o.get('archived_at')]

    published = [o for o in offers if o.get('status') == 'published']
    total_views = sum(o.get('views', 0) for o in offers)
    total_calls = sum(o.get('calls', 0) for o in offers)
    total_favs = sum(o.get('add_to_favorites', 0) for o in offers)

    return {
        'ok': True,
        'last_sync': last_sync,
        'balance': balance,
        'summary': {
            'offers_count': len(offers),
            'published_count': len(published),
            'total_views': total_views,
            'total_calls': total_calls,
            'total_favorites': total_favs,
            'services_by_type': service_type_counts,
            'archived_count': len(archived_offers),
        },
        'offers': offers,
        'archived_offers': archived_offers,
    }


def _cian_handle(cur, conn, params):
    """Обрабатывает action=cian_stats|cian_sync|cian_cron: читает/синхронизирует кабинет ЦИАН."""
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    cur.execute(f"SELECT api_key, is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'cian' LIMIT 1")
    row = cur.fetchone()
    token = (row.get('api_key') or '').strip() if row else ''
    is_active = bool(row.get('is_active')) if row else False

    if not token:
        return _json({'error': 'ЦИАН не настроен: заполните API Token в Настройках → Интеграции → Площадки'}, 400)

    if action == 'cian_cron' or force_sync:
        if action == 'cian_cron':
            if not is_active:
                return _json({'ok': True, 'skipped': True, 'reason': 'Интеграция выключена'})
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.cian_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < CIAN_SYNC_INTERVAL_HOURS:
                    return _json({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        result = _cian_sync(cur, conn, token)
        data = _cian_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.cian_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        result = _cian_sync(cur, conn, token)
        data = _cian_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    return _json(_cian_read_from_db(cur))


# ── Яндекс.Недвижимость: синхронизация звонков через Public Partner API ─────
# https://yandex.ru/support/realty-partner/ru/api-calls — только список звонков.

def _yandex_calls_get(oauth_token, client_id, agency_id, date_from, date_to):
    qs = urllib.parse.urlencode({
        'clientId': client_id,
        'agencyId': agency_id,
        'fromDate': date_from,
        'toDate': date_to,
        'pageNum': '0',
        'pageSize': '500',
    })
    url = f'{YANDEX_REALTY_API_BASE}/publicPartner/calls?{qs}'
    req = urllib.request.Request(url, headers={
        'accept': 'application/json',
        'X-Authorization': f'Vertis {YANDEX_REALTY_PARTNER_TOKEN}',
        'Authorization': f'OAuth {oauth_token}',
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode()[:300]
        except Exception:
            body = ''
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


def _yandex_calls_sync(cur, conn, oauth_token, client_id, agency_id):
    """Синхронизирует звонки Яндекс.Недвижимости за последние 30 дней → БД."""
    date_to = datetime.now().strftime('%Y-%m-%d')
    date_from = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

    data, err = _yandex_calls_get(oauth_token, client_id, agency_id, date_from, date_to)
    if err:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.yandex_sync_log (synced_at, calls_count, error)
            VALUES (NOW(), 0, %s)
        """, (err[:500],))
        conn.commit()
        return {'calls_count': 0, 'error': err}

    calls = (data or {}).get('calls') or []
    calls_count = 0
    for c in calls:
        obj_name = c.get('objectName') or ''
        ext_id_match = re.search(r'\b(\d{4,})\b', obj_name)
        ext_id = int(ext_id_match.group(1)) if ext_id_match else None
        cur.execute(f"""
            INSERT INTO {SCHEMA}.yandex_calls
                (external_id, object_name, incoming_phone, internal_phone, wait_duration, call_duration,
                 revenue, object_type, campaign_tariff, client_tariff, call_timestamp, synced_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
            ON CONFLICT (call_timestamp, incoming_phone, internal_phone) DO UPDATE SET
                object_name=EXCLUDED.object_name, wait_duration=EXCLUDED.wait_duration,
                call_duration=EXCLUDED.call_duration, revenue=EXCLUDED.revenue,
                object_type=EXCLUDED.object_type, synced_at=NOW()
        """, (
            ext_id, obj_name, c.get('incomingPhone'), c.get('internalPhone'),
            c.get('waitDuration'), c.get('callDuration'), c.get('revenue'),
            c.get('objectType'), c.get('campaignTariff'), c.get('clientTariff'), c.get('timestamp'),
        ))
        calls_count += 1
    conn.commit()

    cur.execute(f"""
        INSERT INTO {SCHEMA}.yandex_sync_log (synced_at, calls_count)
        VALUES (NOW(), %s)
    """, (calls_count,))
    conn.commit()

    return {'calls_count': calls_count}


def _yandex_calls_read_from_db(cur):
    """Читает статистику звонков Яндекс.Недвижимости из БД для фронтенда."""
    cur.execute(f"""
        SELECT c.external_id, c.object_name, c.incoming_phone, c.internal_phone,
               c.wait_duration, c.call_duration, c.revenue, c.object_type,
               c.campaign_tariff, c.client_tariff, c.call_timestamp,
               l.title, l.slug, l.category, l.deal, l.price, l.image
        FROM {SCHEMA}.yandex_calls c
        LEFT JOIN {SCHEMA}.listings l ON l.id = c.external_id
        ORDER BY c.call_timestamp DESC
        LIMIT 500
    """)
    calls = [dict(r) for r in cur.fetchall()]

    cur.execute(f"SELECT * FROM {SCHEMA}.yandex_sync_log ORDER BY synced_at DESC LIMIT 1")
    last_sync = dict(cur.fetchone() or {})

    total_calls = len(calls)
    total_duration = sum(c.get('call_duration') or 0 for c in calls)
    unique_objects = len({c['external_id'] for c in calls if c.get('external_id')})

    return {
        'ok': True,
        'last_sync': last_sync,
        'summary': {
            'total_calls': total_calls,
            'total_duration': total_duration,
            'unique_objects': unique_objects,
        },
        'calls': calls,
    }


def _yandex_calls_handle(cur, conn, params):
    """Обрабатывает action=yandex_stats|yandex_cron: читает/синхронизирует звонки Яндекс.Недвижимости."""
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    cur.execute(f"SELECT api_key, extra, is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'yandex_realty' LIMIT 1")
    row = cur.fetchone()
    oauth_token = (row.get('api_key') or '').strip() if row else ''
    extra = row.get('extra') or {} if row else {}
    client_id = (extra.get('client_id') or '').strip()
    agency_id = (extra.get('agency_id') or '').strip()
    is_active = bool(row.get('is_active')) if row else False

    if not oauth_token or not client_id:
        return _json({'error': 'Яндекс.Недвижимость не настроена: заполните OAuth Token и Client ID в Настройках → Интеграции → Площадки'}, 400)

    if action == 'yandex_cron' or force_sync:
        if action == 'yandex_cron':
            if not is_active:
                return _json({'ok': True, 'skipped': True, 'reason': 'Интеграция выключена'})
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.yandex_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < YANDEX_REALTY_SYNC_INTERVAL_HOURS:
                    return _json({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        result = _yandex_calls_sync(cur, conn, oauth_token, client_id, agency_id)
        data = _yandex_calls_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.yandex_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        result = _yandex_calls_sync(cur, conn, oauth_token, client_id, agency_id)
        data = _yandex_calls_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    return _json(_yandex_calls_read_from_db(cur))


# ── Авито: проверка подключения + баланс кошелька через api.avito.ru ────────
# Этап 1: только авторизация (OAuth client_credentials) и чтение баланса —
# без синхронизации объявлений (публикация объектов остаётся через XML-фид).

AVITO_BASE = 'https://api.avito.ru'
AVITO_SYNC_INTERVAL_HOURS = 1


def _avito_get_token(client_id, client_secret):
    """Получает OAuth-токен Авито (grant_type=client_credentials, живёт 24 часа)."""
    body = urllib.parse.urlencode({
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
    }).encode()
    req = urllib.request.Request(
        f'{AVITO_BASE}/token/', data=body, method='POST',
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode())
            return data.get('access_token'), None
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode()[:300]
        except Exception:
            err_body = ''
        return None, f'HTTP {e.code}: {err_body}'
    except Exception as e:
        return None, str(e)


def _avito_get(path, token):
    req = urllib.request.Request(f'{AVITO_BASE}{path}', headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


def _avito_post(path, token, payload):
    """POST-запрос к Авито API (используется для статистики по объявлениям)."""
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f'{AVITO_BASE}{path}', data=data, method='POST',
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


def _avito_sync(cur, conn, client_id, client_secret):
    """Проверяет ключи Авито: получает токен, данные аккаунта и баланс кошелька → БД."""
    token, err = _avito_get_token(client_id, client_secret)
    if err or not token:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.avito_sync_log (synced_at, error)
            VALUES (NOW(), %s)
        """, (err[:500] if err else 'Не удалось получить токен',))
        conn.commit()
        return {'error': err or 'Не удалось получить токен'}

    account, acc_err = _avito_get('/core/v1/accounts/self', token)
    if acc_err or not account:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.avito_sync_log (synced_at, error)
            VALUES (NOW(), %s)
        """, (acc_err[:500] if acc_err else 'Не удалось получить данные аккаунта',))
        conn.commit()
        return {'error': acc_err or 'Не удалось получить данные аккаунта'}

    account_id = account.get('id')
    account_name = account.get('name') or account.get('email') or ''

    balance_real = None
    balance_bonus = None
    balance_data = None
    if account_id:
        balance_data, bal_err = _avito_get(f'/core/v1/accounts/{account_id}/balance/', token)
        if balance_data and not bal_err:
            balance_real = balance_data.get('real')
            balance_bonus = balance_data.get('bonus')

    cur.execute(f"""
        INSERT INTO {SCHEMA}.avito_sync_log
            (synced_at, account_id, account_name, balance_real, balance_bonus, raw_response)
        VALUES (NOW(), %s, %s, %s, %s, %s)
    """, (account_id, account_name, balance_real, balance_bonus,
          json.dumps({'account': account, 'balance': balance_data})))
    conn.commit()

    return {
        'account_id': account_id,
        'account_name': account_name,
        'balance_real': balance_real,
        'balance_bonus': balance_bonus,
    }


# ── Авито: отчёт по автозагрузке (фиду) ──────────────────────────────────────
# GET /autoload/v3/reports/last_completed_report — сводка по последнему завершённому
# циклу обработки XML-фида (без user_id в пути — определяется по токену).
# GET /autoload/v2/reports/items?query=id1,id2,... — статус конкретных объявлений
# по их Id из фида (ad_id = наш listing.id), до 100 штук за запрос.

AVITO_STATUS_LABELS = {
    'active': 'Активно на Авито',
    'old': 'Истёк срок размещения',
    'blocked': 'Заблокировано',
    'rejected': 'Отклонено (нарушения)',
    'archived': 'В архиве',
    'removed': 'Удалено навсегда',
}

AVITO_REPORT_STATUS_LABELS = {
    'processing': 'Обрабатывается',
    'success': 'Загружено без ошибок',
    'success_warning': 'Загружено, есть замечания',
    'error': 'Загрузка не удалась',
}


def _avito_fetch_report(cur, conn, token):
    """Запрашивает сводный отчёт последней автозагрузки (v3) и статусы объявлений,
    выгружаемых на Авито (v2 reports/items, по спискам Id из нашей БД, максимум 100
    за запрос) — сохраняет всё в avito_report_log + avito_item_status."""
    summary, err = _avito_get('/autoload/v3/reports/last_completed_report', token)
    if err:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.avito_report_log (fetched_at, error)
            VALUES (NOW(), %s)
        """, (err[:500],))
        conn.commit()
        return {'error': err}

    section_stats = (summary or {}).get('section_stats') or {}
    events = (summary or {}).get('events') or []
    cur.execute(f"""
        INSERT INTO {SCHEMA}.avito_report_log
            (fetched_at, report_status, started_at, finished_at, total_ads, messages)
        VALUES (NOW(), %s, %s, %s, %s, %s)
    """, (
        (summary or {}).get('status'), (summary or {}).get('started_at'), (summary or {}).get('finished_at'),
        section_stats.get('count'), json.dumps({'section_stats': section_stats, 'events': events}, default=str),
    ))
    conn.commit()

    cur.execute(f"SELECT id FROM {SCHEMA}.listings WHERE export_avito = TRUE AND status = 'active'")
    listing_ids = [r['id'] for r in cur.fetchall()]
    if not listing_ids:
        return {
            'status': (summary or {}).get('status'), 'total_ads': section_stats.get('count'),
            'items_checked': 0,
        }

    checked = 0
    for i in range(0, len(listing_ids), 100):
        batch = listing_ids[i:i + 100]
        query = ','.join(str(x) for x in batch)
        data, ierr = _avito_get(f'/autoload/v2/reports/items?query={urllib.parse.quote(query)}', token)
        if ierr or not data:
            continue
        for item in (data.get('items') or []):
            ad_id = item.get('ad_id')
            if not ad_id or not str(ad_id).isdigit():
                continue
            msgs = item.get('messages') or []
            msg_text = '; '.join(m.get('description', '') for m in msgs if m.get('description'))
            section = item.get('section') or {}
            cur.execute(f"""
                INSERT INTO {SCHEMA}.avito_item_status
                    (listing_id, avito_id, url, status, status_detail, status_message, checked_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (listing_id) DO UPDATE SET
                    avito_id = EXCLUDED.avito_id, url = EXCLUDED.url,
                    status = EXCLUDED.status, status_detail = EXCLUDED.status_detail,
                    status_message = EXCLUDED.status_message, checked_at = NOW()
            """, (int(ad_id), item.get('avito_id'), item.get('url'),
                  item.get('avito_status'), section.get('title'), msg_text or None))
            checked += 1
    conn.commit()

    return {
        'status': (summary or {}).get('status'), 'total_ads': section_stats.get('count'),
        'items_checked': checked,
    }


def _avito_fetch_stats(cur, conn, token, account_id):
    """Запрашивает статистику просмотров/контактов по всем объявлениям, у которых есть
    avito_id (из avito_item_status), за последние 30 дней, и обновляет счётчики."""
    cur.execute(f"SELECT listing_id, avito_id FROM {SCHEMA}.avito_item_status WHERE avito_id IS NOT NULL")
    rows = [dict(r) for r in cur.fetchall()]
    if not rows:
        return {'skipped': True, 'reason': 'Нет объявлений с avito_id — сначала выполните fetch_report'}

    id_to_listing = {int(r['avito_id']): r['listing_id'] for r in rows}
    item_ids = list(id_to_listing.keys())[:200]  # лимит API — не более 200 за раз

    date_to = datetime.now(timezone.utc).date()
    date_from = date_to - timedelta(days=30)
    payload = {
        'dateFrom': date_from.isoformat(),
        'dateTo': date_to.isoformat(),
        'itemIds': item_ids,
        'fields': ['uniqViews', 'uniqContacts', 'uniqFavorites'],
        'periodGrouping': 'month',
    }
    data, err = _avito_post(f'/stats/v1/accounts/{account_id}/items', token, payload)
    if err or not data:
        return {'error': err or 'Пустой ответ'}

    result_items = ((data.get('result') or {}).get('items')) or []
    updated = 0
    for item in result_items:
        avito_id = item.get('itemId') or item.get('item_id')
        listing_id = id_to_listing.get(int(avito_id)) if avito_id else None
        if not listing_id:
            continue
        stats_list = item.get('stats') or []
        views = sum(int(s.get('uniqViews') or s.get('uniq_views') or 0) for s in stats_list)
        contacts = sum(int(s.get('uniqContacts') or s.get('uniq_contacts') or 0) for s in stats_list)
        favorites = sum(int(s.get('uniqFavorites') or s.get('uniq_favorites') or 0) for s in stats_list)
        cur.execute(f"""
            UPDATE {SCHEMA}.avito_item_status
            SET uniq_views = %s, uniq_contacts = %s, uniq_favorites = %s
            WHERE listing_id = %s
        """, (views, contacts, favorites, listing_id))
        updated += 1
    conn.commit()
    return {'updated': updated, 'requested': len(item_ids)}


def _avito_read_from_db(cur):
    """Читает последнюю проверку подключения Авито + последний отчёт автозагрузки +
    статусы/статистику по объявлениям из БД для фронтенда."""
    cur.execute(f"SELECT * FROM {SCHEMA}.avito_sync_log ORDER BY synced_at DESC LIMIT 1")
    last = cur.fetchone()
    if not last:
        return {'ok': True, 'connected': False, 'last_sync': None, 'last_report': None, 'items': []}
    last = dict(last)
    last['synced_at'] = last['synced_at'].isoformat() if last.get('synced_at') else None
    last.pop('raw_response', None)

    cur.execute(f"SELECT * FROM {SCHEMA}.avito_report_log ORDER BY fetched_at DESC LIMIT 1")
    report = cur.fetchone()
    if report:
        report = dict(report)
        report['fetched_at'] = report['fetched_at'].isoformat() if report.get('fetched_at') else None
        report['started_at'] = report['started_at'].isoformat() if report.get('started_at') else None
        report['finished_at'] = report['finished_at'].isoformat() if report.get('finished_at') else None
        report['status_label'] = AVITO_REPORT_STATUS_LABELS.get(report.get('report_status'), report.get('report_status'))

    cur.execute(f"""
        SELECT s.listing_id, s.avito_id, s.url, s.status, s.status_detail, s.status_message,
               s.uniq_views, s.uniq_contacts, s.uniq_favorites, s.checked_at,
               l.title, l.city, l.category, l.deal
        FROM {SCHEMA}.avito_item_status s
        JOIN {SCHEMA}.listings l ON l.id = s.listing_id
        ORDER BY s.checked_at DESC
    """)
    items = []
    for r in cur.fetchall():
        d = dict(r)
        d['checked_at'] = d['checked_at'].isoformat() if d.get('checked_at') else None
        d['status_label'] = AVITO_STATUS_LABELS.get(d.get('status'), d.get('status'))
        items.append(d)

    return {
        'ok': True,
        'connected': bool(last.get('account_id')) and not last.get('error'),
        'last_sync': last,
        'last_report': report,
        'items': items,
    }
    return {
        'ok': True,
        'connected': bool(last.get('account_id')) and not last.get('error'),
        'last_sync': last,
    }


def _avito_full_sync(cur, conn, client_id, client_secret):
    """Полная синхронизация: баланс кошелька + отчёт по автозагрузке (статусы объявлений) +
    статистика просмотров/контактов. Токен запрашивается один раз и переиспользуется."""
    sync_result = _avito_sync(cur, conn, client_id, client_secret)
    if sync_result.get('error') or not sync_result.get('account_id'):
        return {'sync': sync_result}

    account_id = sync_result['account_id']
    token, err = _avito_get_token(client_id, client_secret)
    if err or not token:
        return {'sync': sync_result, 'report': {'error': err or 'Не удалось получить токен'}}

    report_result = _avito_fetch_report(cur, conn, token)
    stats_result = _avito_fetch_stats(cur, conn, token, account_id)
    return {'sync': sync_result, 'report': report_result, 'stats': stats_result}


def _avito_handle(cur, conn, params):
    """Обрабатывает action=avito_stats|avito_sync|avito_cron: проверяет подключение, баланс,
    отчёт по автозагрузке и статистику просмотров/контактов Авито."""
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    cur.execute(f"SELECT api_key, api_secret, is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'avito' LIMIT 1")
    row = cur.fetchone()
    client_id = (row.get('api_key') or '').strip() if row else ''
    client_secret = (row.get('api_secret') or '').strip() if row else ''
    is_active = bool(row.get('is_active')) if row else False

    if not client_id or not client_secret:
        return _json({'error': 'Авито не настроено: заполните Client ID и Client Secret в Настройках → Интеграции → Площадки'}, 400)

    if action == 'avito_cron' or force_sync:
        if action == 'avito_cron':
            if not is_active:
                return _json({'ok': True, 'skipped': True, 'reason': 'Интеграция выключена'})
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.avito_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < AVITO_SYNC_INTERVAL_HOURS:
                    return _json({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        full_result = _avito_full_sync(cur, conn, client_id, client_secret)
        data = _avito_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': full_result})

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.avito_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        full_result = _avito_full_sync(cur, conn, client_id, client_secret)
        data = _avito_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': full_result})

    return _json(_avito_read_from_db(cur))


def handler(event, context):
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if method == 'GET' and params.get('action') == 'cron':
                # Публичный пинг-крон: вызывается автоматически платформой раз в час (см. function.json)
                # + дублируется пингом из браузера (useCrons.ts) как подстраховка.
                # Пересобирает статические файлы в S3 (раз в 10 мин) и параллельно синхронизирует
                # кабинеты ЦИАН, Яндекс.Недвижимость и Авито (раз в час, если подключены и включены).
                # Перед сборкой — проверяем окно авто-обновления даты объявлений (раз в сутки).
                bump_result = _bump_feed_dates(cur, conn)
                results = _regenerate_static_feeds(cur, conn, force=bump_result.get('updated', 0) > 0)
                cur.execute(f"SELECT is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'cian' LIMIT 1")
                row = cur.fetchone()
                cian_result = None
                if row and row.get('is_active'):
                    cian_result = _cian_handle(cur, conn, {'action': 'cian_cron'})
                cur.execute(f"SELECT is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'yandex_realty' LIMIT 1")
                row = cur.fetchone()
                yandex_result = None
                if row and row.get('is_active'):
                    yandex_result = _yandex_calls_handle(cur, conn, {'action': 'yandex_cron'})
                cur.execute(f"SELECT is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'avito' LIMIT 1")
                row = cur.fetchone()
                avito_result = None
                if row and row.get('is_active'):
                    avito_result = _avito_handle(cur, conn, {'action': 'avito_cron'})
                return _json({
                    'ok': True, 'results': results,
                    'feed_bump': bump_result,
                    'cian': json.loads(cian_result['body']) if cian_result else None,
                    'yandex': json.loads(yandex_result['body']) if yandex_result else None,
                    'avito': json.loads(avito_result['body']) if avito_result else None,
                })

            if method == 'GET' and params.get('action') == 'generate_static':
                # Ручной принудительный пересчёт (из админки).
                headers = event.get('headers') or {}
                token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
                user = _get_user(cur, token)
                if not user or user['role'] not in ('admin', 'editor'):
                    return _json({'error': 'Нет прав'}, 403)
                results = _regenerate_static_feeds(cur, conn, force=True)
                return _json({'ok': True, 'results': results})

            if method == 'GET' and params.get('action') in ('backfill_feed_photos', 'backfill_feed_photos_dry'):
                # Разовое дозаполнение JPG-копий (xml-feeds-photos/) для фото, загруженных
                # ДО включения clean_photos у площадки (например gdeetotdom) — без этого
                # часть старых ссылок в её фиде вела бы на несуществующий файл.
                headers = event.get('headers') or {}
                token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
                user = _get_user(cur, token)
                if not user or user['role'] not in ('admin', 'editor'):
                    return _json({'error': 'Нет прав'}, 403)
                dry = params.get('action') == 'backfill_feed_photos_dry'
                try:
                    offset = int(params.get('offset') or 0)
                except (TypeError, ValueError):
                    offset = 0
                result = _backfill_feed_photos_jpg(cur, offset=offset, dry_run=dry)
                return _json({'ok': True, 'dry_run': dry, **result})

            if method == 'GET' and params.get('action') in ('cian_stats', 'cian_sync', 'cian_cron'):
                # Статистика/баланс/услуги кабинета ЦИАН (объединено из backend/cian-api).
                return _cian_handle(cur, conn, params)

            if method == 'GET' and params.get('action') in ('yandex_stats', 'yandex_sync', 'yandex_cron'):
                # Статистика звонков кабинета Яндекс.Недвижимость (Public Partner API).
                return _yandex_calls_handle(cur, conn, params)

            if method == 'GET' and params.get('action') in ('avito_stats', 'avito_sync', 'avito_cron'):
                # Проверка подключения и баланс кошелька кабинета Авито (Core API).
                return _avito_handle(cur, conn, params)

            if method == 'GET' and params.get('action') == 'other_platforms':
                # Вкладка «Разное»: список площадок формата 'other' (realtymag, rucountry и т.п.)
                # с количеством и списком выгружаемых на них объектов (флаг export_other) и статусом
                # автостатистики — площадка либо поддерживает передачу цифр через API, либо нет.
                cur.execute(
                    f"SELECT id, slug, name, is_active, cdn_url, last_generated_at, supports_stats "
                    f"FROM {SCHEMA}.xml_feeds WHERE format = 'other' ORDER BY id ASC"
                )
                feeds = [dict(r) for r in cur.fetchall()]
                cur.execute(
                    f"SELECT id, title, image, category, deal, city, status "
                    f"FROM {SCHEMA}.listings WHERE export_other = TRUE AND status = 'active' "
                    f"AND (is_visible IS NULL OR is_visible = TRUE) "
                    f"ORDER BY created_at DESC"
                )
                shared_listings = [dict(r) for r in cur.fetchall()]
                for f in feeds:
                    f['listings_count'] = len(shared_listings)
                    f['listings'] = shared_listings
                    f['stats'] = None  # ручного ввода нет; появится, когда площадка подключит API
                return _json({'platforms': feeds})

            if method == 'GET':
                # Фиды отдаются только готовыми статическими файлами с CDN (см. cdn_url в xml_feeds).
                # Генерация "на лету" по ?feed=slug удалена — используйте ссылку из админки.
                return _json({'error': 'Используйте статическую ссылку на файл (cdn_url) из раздела XML фиды в админке'}, 410)

            if method == 'POST':
                headers = event.get('headers') or {}
                token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
                user = _get_user(cur, token)
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

                imported = 0
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

                        cur.execute(
                            f"INSERT INTO {SCHEMA}.listings "
                            f"(title, description, category, deal, price, area, address, city, image, images, status, author_id, broker_id, "
                            f"floor, total_floors, ceiling_height, building_year, building_class, subway_station, subway_distance, lat, lng) "
                            f"VALUES ('{_safe(title, 255)}', '{_safe(description, 5000)}', "
                            f"'{category}', '{deal}', {price}, {area}, "
                            f"'{_safe(address, 255)}', '{_safe(city, 100)}', "
                            f"'{_safe(first_img, 500)}', '{_safe(images_str, 5000)}', "
                            f"'active', {user['id']}, {user['id']}, "
                            f"{floor if floor is not None else 'NULL'}, "
                            f"{total_floors if total_floors is not None else 'NULL'}, "
                            f"{ceiling_height if ceiling_height is not None else 'NULL'}, "
                            f"{building_year if building_year is not None else 'NULL'}, "
                            f"{'NULL' if not building_class else chr(39) + _safe(building_class, 10) + chr(39)}, "
                            f"{'NULL' if not subway_station else chr(39) + _safe(subway_station, 150) + chr(39)}, "
                            f"{subway_distance if subway_distance is not None else 'NULL'}, "
                            f"{lat if lat is not None else 'NULL'}, "
                            f"{lng if lng is not None else 'NULL'})"
                        )
                        imported += 1
                    except Exception as e:
                        errors.append(str(e)[:100])

                conn.commit()
                return _json({
                    'imported': imported,
                    'errors': errors[:5],
                    'autofix_applied': autofix_report,
                })

            return _json({'error': 'Method not allowed'}, 405)
    finally:
        conn.close()