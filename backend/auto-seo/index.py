"""
Автоматическая SEO-оптимизация объектов недвижимости.
Режимы:
  status       — статистика + настройки расписания + последние логи
  run          — запустить оптимизацию немедленно (вручную)
  preview      — предпросмотр без записи в БД
  schedule_get — получить настройки расписания
  schedule_set — сохранить настройки расписания
  cron         — вызывается автоматически (без авторизации, проверяет токен cron)
  log          — история запусков

Args: POST {action, limit?, listing_id?, ...}, headers X-Auth-Token
Returns: {processed, skipped, errors} или {status} или {schedule} и т.д.
"""

import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL_NAME = 'yandexgpt/rc'

SEO_SYSTEM_PROMPT = (
    'Ты — SEO-специалист агентства коммерческой недвижимости BIZNEST в Краснодаре. '
    'По данным объекта сгенерируй:\n'
    '1) seo_title — заголовок страницы до 65 символов: тип+площадь+район+действие+город. '
    'Пример: "Аренда офиса 120 м² в центре Краснодара | BIZNEST"\n'
    '2) seo_description — описание для выдачи до 155 символов: '
    'ключевые характеристики + УТП + призыв к действию. '
    'Пример: "Светлый офис 120 м² с евроремонтом, парковкой, охраной 24/7 в центре Краснодара. '
    'Арендуйте сейчас — звоните!"\n'
    'Без markdown, без кавычек, на русском языке.\n'
    'Формат строго:\nTITLE: <заголовок>\nDESCRIPTION: <описание>'
)

DEAL_RU = {'sale': 'Продажа', 'rent': 'Аренда', 'business': 'Готовый бизнес'}
CAT_RU = {
    'office': 'офиса', 'retail': 'магазина', 'warehouse': 'склада',
    'restaurant': 'кафе/ресторана', 'hotel': 'гостиницы', 'business': 'готового бизнеса',
    'gab': 'готового арендного бизнеса', 'production': 'производственного помещения',
    'land': 'земельного участка', 'building': 'здания', 'free_purpose': 'помещения свободного назначения',
    'car_service': 'автосервиса',
}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _safe(s, length=255):
    return (s or '').replace("'", "''")[:length]


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _load_keys(cur):
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row:
            return row.get('yandex_api_key') or '', row.get('yandex_folder_id') or ''
    except Exception:
        pass
    return os.environ.get('YANDEX_API_KEY', ''), os.environ.get('YANDEX_FOLDER_ID', '')


def _gpt(system: str, user_text: str, api_key: str, folder_id: str) -> dict:
    if not api_key or not folder_id:
        return {'error': 'YandexGPT не настроен'}
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL_NAME}',
        'completionOptions': {'stream': False, 'temperature': 0.4, 'maxTokens': '500'},
        'messages': [{'role': 'system', 'text': system}, {'role': 'user', 'text': user_text}],
    }
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
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode())
        alts = (data.get('result') or {}).get('alternatives') or []
        text = ((alts[0].get('message') or {}).get('text') or '').strip() if alts else ''
        return {'text': text}
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {'error': 'YandexGPT отклонил ключ (401). Проверьте API-ключ в Настройки → Интеграции'}
        if e.code == 403:
            return {'error': 'YandexGPT: нет прав (403). Нужна роль ai.languageModels.user у сервисного аккаунта'}
        if e.code == 429:
            return {'error': 'YandexGPT: превышен лимит (429). Уменьшите размер пакета или подождите'}
        try:
            body_text = e.read().decode('utf-8', errors='replace')[:200]
        except Exception:
            body_text = ''
        return {'error': f'YandexGPT ошибка {e.code}: {body_text}'}
    except urllib.error.URLError as e:
        return {'error': f'Не удалось связаться с YandexGPT: {e.reason}'}
    except Exception as e:
        return {'error': f'{type(e).__name__}: {str(e)[:200]}'}


def _build_prompt(listing: dict) -> str:
    deal = DEAL_RU.get(listing.get('deal', ''), listing.get('deal', ''))
    cat = CAT_RU.get(listing.get('category', ''), listing.get('category', ''))
    area = listing.get('area') or ''
    price = listing.get('price') or ''
    district = listing.get('district') or ''
    city = listing.get('city') or 'Краснодар'
    desc = (listing.get('description') or '')[:400]
    title = listing.get('title') or ''

    parts = [
        f'Тип сделки: {deal}',
        f'Тип объекта: {cat}',
        f'Площадь: {area} м²' if area else '',
        f'Цена: {price} ₽' if price else '',
        f'Район: {district}' if district else '',
        f'Город: {city}',
        f'Название: {title}' if title else '',
        f'Описание: {desc}' if desc else '',
    ]
    return '\n'.join(p for p in parts if p)


def _parse_seo(text: str) -> tuple:
    seo_title, seo_desc = '', ''
    for line in text.splitlines():
        line = line.strip()
        if line.upper().startswith('TITLE:'):
            seo_title = line[6:].strip()[:70]
        elif line.upper().startswith('DESCRIPTION:'):
            seo_desc = line[12:].strip()[:160]
    return seo_title, seo_desc


def _process_listing(cur, conn, listing: dict, api_key: str, folder_id: str, dry_run: bool = False) -> dict:
    lid = listing['id']
    prompt = _build_prompt(listing)
    result = _gpt(SEO_SYSTEM_PROMPT, prompt, api_key, folder_id)

    if 'error' in result:
        return {'id': lid, 'status': 'error', 'error': result['error']}

    seo_title, seo_desc = _parse_seo(result['text'])
    if not seo_title and not seo_desc:
        return {'id': lid, 'status': 'error', 'error': 'Не удалось распарсить ответ ИИ'}

    if not dry_run:
        st = _safe(seo_title, 120)
        sd = _safe(seo_desc, 300)
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET "
            f"seo_title = '{st}', seo_description = '{sd}', updated_at = NOW() "
            f"WHERE id = {int(lid)}"
        )
        conn.commit()

    return {'id': lid, 'status': 'ok', 'seo_title': seo_title, 'seo_description': seo_desc}


def _run_batch(cur, conn, api_key: str, folder_id: str, limit: int, dry_run: bool,
               listing_id=None, triggered_by: str = 'manual') -> dict:
    """Запускает пакетную оптимизацию, пишет лог в БД."""
    started = datetime.now(timezone.utc)

    # Создаём запись лога
    cur.execute(
        f"INSERT INTO {SCHEMA}.seo_run_log (triggered_by, dry_run, started_at) "
        f"VALUES ('{_safe(triggered_by, 50)}', {'TRUE' if dry_run else 'FALSE'}, NOW()) "
        f"RETURNING id"
    )
    log_id = cur.fetchone()['id']
    conn.commit()

    if listing_id:
        cur.execute(
            f"SELECT id, title, category, deal, price, area, district, city, description "
            f"FROM {SCHEMA}.listings WHERE id = {int(listing_id)} AND status = 'active'"
        )
    else:
        cur.execute(
            f"SELECT id, title, category, deal, price, area, district, city, description "
            f"FROM {SCHEMA}.listings WHERE status = 'active' "
            f"AND (seo_title IS NULL OR seo_title = '') "
            f"ORDER BY id DESC LIMIT {limit}"
        )

    listings = [dict(r) for r in cur.fetchall()]

    if not listings:
        cur.execute(
            f"UPDATE {SCHEMA}.seo_run_log SET processed=0, errors=0, total=0, "
            f"finished_at=NOW() WHERE id={log_id}"
        )
        conn.commit()
        return {'processed': 0, 'errors': 0, 'total': 0, 'results': [], 'log_id': log_id,
                'message': 'Все активные объекты уже имеют SEO-данные'}

    results = []
    processed = 0
    errors = 0
    for lst in listings:
        r = _process_listing(cur, conn, lst, api_key, folder_id, dry_run)
        results.append(r)
        if r['status'] == 'ok':
            processed += 1
        else:
            errors += 1

    # Обновляем лог
    details_json = _safe(json.dumps(results[:20], ensure_ascii=False), 5000)
    cur.execute(
        f"UPDATE {SCHEMA}.seo_run_log SET processed={processed}, errors={errors}, "
        f"total={len(listings)}, finished_at=NOW(), "
        f"details='{details_json}' WHERE id={log_id}"
    )
    # Обновляем расписание
    if not dry_run:
        cur.execute(
            f"UPDATE {SCHEMA}.seo_schedule SET last_run_at=NOW(), "
            f"last_run_processed={processed}, last_run_errors={errors} "
            f"WHERE id=1"
        )
    conn.commit()

    return {
        'processed': processed,
        'errors': errors,
        'total': len(listings),
        'dry_run': dry_run,
        'log_id': log_id,
        'results': results,
    }


def _should_run_now(schedule: dict) -> bool:
    """Проверяет, нужно ли запустить SEO сейчас по расписанию."""
    if not schedule.get('is_enabled'):
        return False

    now = datetime.now(timezone.utc)
    run_hour = schedule.get('run_hour', 3)

    # Запускаем только в указанный час UTC
    if now.hour != run_hour:
        return False

    last_run = schedule.get('last_run_at')
    if last_run:
        if isinstance(last_run, str):
            from datetime import datetime as dt
            try:
                last_run = dt.fromisoformat(last_run.replace('Z', '+00:00'))
            except Exception:
                last_run = None
        if last_run:
            # Не запускать чаще раза в сутки (защита от двойного срабатывания в один час)
            diff = now - last_run.replace(tzinfo=timezone.utc) if last_run.tzinfo is None else now - last_run
            if diff.total_seconds() < 23 * 3600 + 30 * 60:  # 23ч30мин — окно одного часа уже точно прошло
                return False

    return True


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Cron-Token',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
    cron_token = headers.get('X-Cron-Token') or headers.get('x-cron-token') or ''

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or 'status'

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Ping-режим: вызывается с сайта при каждом открытии страницы.
            # Публичный — без авторизации. Сам проверяет расписание и запускает если пора.
            # Защита от флуда: запуск не чаще раза в 23 часа (проверяется через last_run_at).
            if action == 'ping':
                cur.execute(f"SELECT * FROM {SCHEMA}.seo_schedule ORDER BY id ASC LIMIT 1")
                schedule_row = cur.fetchone()
                if not schedule_row:
                    return _ok({'skipped': True, 'reason': 'no_schedule'})
                schedule = dict(schedule_row)
                if not _should_run_now(schedule):
                    return _ok({'skipped': True, 'reason': 'not_time'})
                api_key, folder_id = _load_keys(cur)
                if not api_key or not folder_id:
                    return _ok({'skipped': True, 'reason': 'no_gpt'})
                limit_val = schedule.get('batch_limit', 20)
                result = _run_batch(cur, conn, api_key, folder_id, limit_val, dry_run=False, triggered_by='schedule')
                return _ok({**result, 'triggered': True})

            # Cron-режим: запускается внешним планировщиком (с токеном) или вручную авторизованным
            if action == 'cron':
                expected_cron_token = os.environ.get('CRON_SECRET', '')
                if expected_cron_token and cron_token == expected_cron_token:
                    pass  # токен верный
                else:
                    user = _get_user(cur, token)
                    if not user or user['role'] not in ('admin', 'editor'):
                        return _err(403, 'Нет доступа')

                cur.execute(f"SELECT * FROM {SCHEMA}.seo_schedule ORDER BY id ASC LIMIT 1")
                schedule = cur.fetchone()
                if not schedule:
                    return _ok({'skipped': True, 'reason': 'Расписание не настроено'})

                schedule = dict(schedule)
                if not _should_run_now(schedule):
                    return _ok({'skipped': True, 'reason': 'Не время запуска или расписание отключено'})

                api_key, folder_id = _load_keys(cur)
                if not api_key or not folder_id:
                    return _err(503, 'YandexGPT не настроен')

                limit = schedule.get('batch_limit', 20)
                result = _run_batch(cur, conn, api_key, folder_id, limit, dry_run=False, triggered_by='schedule')
                return _ok({**result, 'triggered_by': 'schedule'})

            # Все остальные действия — требуют авторизации
            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ('admin', 'editor'):
                return _err(403, 'Только для admin/editor')

            api_key, folder_id = _load_keys(cur)

            if action == 'status':
                cur.execute(
                    f"SELECT "
                    f"COUNT(*) FILTER (WHERE status='active') AS total_active,"
                    f"COUNT(*) FILTER (WHERE status='active' AND (seo_title IS NULL OR seo_title='')) AS no_seo_title,"
                    f"COUNT(*) FILTER (WHERE status='active' AND (seo_description IS NULL OR seo_description='')) AS no_seo_desc,"
                    f"COUNT(*) FILTER (WHERE status='active' AND (description IS NULL OR LENGTH(description)<50)) AS no_desc "
                    f"FROM {SCHEMA}.listings"
                )
                row = dict(cur.fetchone())

                # Расписание
                cur.execute(f"SELECT * FROM {SCHEMA}.seo_schedule ORDER BY id ASC LIMIT 1")
                schedule_row = cur.fetchone()
                schedule = dict(schedule_row) if schedule_row else {}

                # Последние 5 запусков
                cur.execute(
                    f"SELECT id, triggered_by, processed, errors, total, dry_run, started_at, finished_at "
                    f"FROM {SCHEMA}.seo_run_log ORDER BY started_at DESC LIMIT 5"
                )
                logs = [dict(r) for r in cur.fetchall()]

                return _ok({
                    'status': row,
                    'schedule': schedule,
                    'recent_logs': logs,
                    'gpt_configured': bool(api_key and folder_id),
                })

            if action == 'schedule_get':
                cur.execute(f"SELECT * FROM {SCHEMA}.seo_schedule ORDER BY id ASC LIMIT 1")
                row = cur.fetchone()
                return _ok({'schedule': dict(row) if row else {}})

            if action == 'schedule_set':
                is_enabled = bool(body.get('is_enabled', True))
                run_hour = max(0, min(23, int(body.get('run_hour', 3))))
                batch_limit = max(1, min(50, int(body.get('batch_limit', 20))))
                cur.execute(
                    f"UPDATE {SCHEMA}.seo_schedule SET "
                    f"is_enabled={'TRUE' if is_enabled else 'FALSE'}, "
                    f"run_hour={run_hour}, batch_limit={batch_limit}, "
                    f"updated_at=NOW() WHERE id=1"
                )
                conn.commit()
                return _ok({'ok': True, 'message': 'Расписание сохранено'})

            if action == 'log':
                limit_log = min(int(body.get('limit') or qs.get('limit') or 20), 100)
                cur.execute(
                    f"SELECT id, triggered_by, processed, errors, total, dry_run, started_at, finished_at "
                    f"FROM {SCHEMA}.seo_run_log ORDER BY started_at DESC LIMIT {limit_log}"
                )
                logs = [dict(r) for r in cur.fetchall()]
                return _ok({'logs': logs})

            if action in ('run', 'preview'):
                dry_run = action == 'preview'
                limit = min(int(body.get('limit') or qs.get('limit') or 10), 50)
                listing_id = body.get('listing_id') or qs.get('listing_id')

                if not api_key or not folder_id:
                    return _err(503, 'YandexGPT не настроен. Добавьте ключи в Настройки → Интеграции.')

                triggered_by = 'preview' if dry_run else 'manual'
                result = _run_batch(
                    cur, conn, api_key, folder_id, limit, dry_run,
                    listing_id=listing_id, triggered_by=triggered_by
                )

                if 'message' in result:
                    return _ok(result)

                return _ok(result)

    finally:
        conn.close()

    return _err(400, 'Неизвестное действие')