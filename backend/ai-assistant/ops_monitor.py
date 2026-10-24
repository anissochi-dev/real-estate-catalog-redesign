"""Пульт наблюдения ВБ: состояние фоновых задач и площадок, перезапуск синхронизации,
ежедневная сводка. Только чтение БД + вызовы готовых функций — без ИИ в контуре управления."""
import json
import urllib.request
from datetime import datetime, timezone, timedelta

SCHEMA = 't_p71821556_real_estate_catalog_'
PLATFORM_SYNC_URL = 'https://functions.poehali.dev/fd00362c-a377-4d94-816c-c5a4abf087cd'
CONDUCTOR_URL = 'https://functions.poehali.dev/1b16aa78-568a-43fe-a121-6caa4639e71c'

PLATFORMS = {
    'cian': ('ЦИАН', 'cian_sync_log', 'cian_stats'),
    'yandex_realty': ('Яндекс.Недвижимость', 'yandex_sync_log', 'yandex_stats'),
    'avito': ('Авито', 'avito_sync_log', 'avito_stats'),
    'youla': ('Юла', 'youla_sync_log', 'youla_stats'),
    'domclick': ('ДомКлик', 'domclick_sync_log', 'domclick_stats'),
}
ALIASES = {
    'циан': 'cian', 'cian': 'cian', 'яндекс': 'yandex_realty', 'yandex': 'yandex_realty',
    'yandex_realty': 'yandex_realty', 'авито': 'avito', 'avito': 'avito', 'юла': 'youla',
    'youla': 'youla', 'домклик': 'domclick', 'domclick': 'domclick',
}
MSK = timezone(timedelta(hours=3))


def _fmt(dt):
    return dt.astimezone(MSK).strftime('%d.%m %H:%M') if dt else '—'


def _http_json(url, timeout=20):
    with urllib.request.urlopen(urllib.request.Request(url), timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def cron_status(cur):
    now = datetime.now(timezone.utc)
    cur.execute(f"SELECT * FROM {SCHEMA}.cron_jobs WHERE name <> '__global' ORDER BY priority")
    jobs = []
    for r in cur.fetchall():
        j = dict(r)
        cur.execute(
            f"SELECT COUNT(*) AS c FROM {SCHEMA}.cron_runs WHERE job = '{j['name']}' "
            f"AND dispatched_at > NOW() - INTERVAL '24 hours'"
        )
        runs = cur.fetchone()['c']
        last = j.get('last_dispatched_at')
        late = False
        if j.get('enabled') and j.get('run_hour') is None and last:
            late = (now - last).total_seconds() > int(j['interval_sec']) * 6 + 1800
        jobs.append({
            'job': j['name'], 'title': j['title'], 'enabled': j['enabled'],
            'interval_min': round(int(j['interval_sec']) / 60),
            'last_run': _fmt(last), 'runs_24h': runs, 'late': late,
        })
    late = [j['title'] for j in jobs if j['late']]
    msg = f'Фоновых задач: {len(jobs)}. ' + (f'Давно не запускались: {", ".join(late)}.' if late else 'Все запускаются по расписанию.')
    return {'ok': True, 'jobs': jobs, 'message': msg}


def platforms_status(cur):
    now = datetime.now(timezone.utc)
    cur.execute(f"SELECT platform, is_active, platform_off FROM {SCHEMA}.ad_platform_keys")
    keys = {r['platform']: dict(r) for r in cur.fetchall()}
    cur.execute(f"SELECT * FROM {SCHEMA}.platform_sync_state")
    state = {r['platform']: dict(r) for r in cur.fetchall()}
    items = []
    for key, (label, tbl, _) in PLATFORMS.items():
        k = keys.get(key) or {}
        connected = bool(k.get('is_active')) and not k.get('platform_off')
        cur.execute(f"SELECT MAX(synced_at) AS m FROM {SCHEMA}.{tbl} WHERE error IS NULL OR error = ''")
        last_ok = (cur.fetchone() or {}).get('m')
        st = state.get(key) or {}
        if not connected:
            status = 'не подключена'
        elif st.get('paused_until') and st['paused_until'] > now:
            status = f'на паузе до {_fmt(st["paused_until"])} после ошибок'
        elif st.get('consecutive_errors'):
            status = f'ошибка ({st["consecutive_errors"]} подряд)'
        elif last_ok and (now - last_ok) > timedelta(hours=2) and st.get('busy_count'):
            status = 'задерживается из-за перегрузки базы'
        else:
            status = 'в норме'
        items.append({
            'platform': key, 'label': label, 'connected': connected, 'status': status,
            'last_success': _fmt(last_ok),
            'hours_since_success': round((now - last_ok).total_seconds() / 3600, 1) if last_ok else None,
            'last_error': (st.get('last_error') or '')[:200] if st.get('consecutive_errors') else '',
            'db_busy_retries': st.get('busy_count') or 0,
        })
    problems = [f"{i['label']}: {i['status']}" for i in items if i['connected'] and i['status'] != 'в норме']
    msg = 'Все подключённые площадки в норме.' if not problems else 'Проблемы: ' + '; '.join(problems)
    return {'ok': True, 'platforms': items, 'message': msg}


def platform_resync(cur, params):
    raw = str(params.get('platform') or '').strip().lower()
    key = ALIASES.get(raw)
    if not key:
        return {'error': f'Неизвестная площадка «{raw}». Доступны: ЦИАН, Яндекс, Авито, Юла, ДомКлик'}
    label, _, stats_action = PLATFORMS[key]
    try:
        d = _http_json(f'{PLATFORM_SYNC_URL}?action={stats_action}&sync=1', timeout=25)
    except Exception as e:
        return {'error': f'{label}: не удалось запустить синхронизацию — {str(e)[:150]}'}
    if isinstance(d, dict) and d.get('busy'):
        return {'ok': False, 'message': f'{label}: база сейчас перегружена, синхронизация повторится автоматически'}
    err = d.get('error') if isinstance(d, dict) else None
    if err:
        return {'ok': False, 'message': f'{label}: синхронизация завершилась с ошибкой — {str(err)[:200]}'}
    return {'ok': True, 'message': f'{label}: синхронизация выполнена'}


def collect_digest_facts(cur):
    """Факты за сутки для ежедневной сводки (без ИИ)."""
    facts = {'platforms': platforms_status(cur), 'cron': cron_status(cur)}
    cur.execute(
        f"SELECT "
        f"(SELECT COUNT(*) FROM {SCHEMA}.leads WHERE created_at > NOW() - INTERVAL '24 hours') AS leads_24h, "
        f"(SELECT COUNT(*) FROM {SCHEMA}.leads WHERE status = 'new') AS leads_new, "
        f"(SELECT COUNT(*) FROM {SCHEMA}.listings WHERE status = 'active') AS listings_active, "
        f"(SELECT COUNT(*) FROM {SCHEMA}.listings WHERE created_at > NOW() - INTERVAL '24 hours') AS listings_24h, "
        f"(SELECT COUNT(*) FROM {SCHEMA}.phone_contacts WHERE trashed_at > NOW() - INTERVAL '24 hours') AS phones_trashed_24h"
    )
    b = dict(cur.fetchone() or {})
    facts['business'] = b
    facts['для_сводки'] = {
        'заявок поступило за сутки': b.get('leads_24h', 0),
        'заявок ещё не взято в работу (всего, статус «новая»)': b.get('leads_new', 0),
        'активных объектов в каталоге': b.get('listings_active', 0),
        'объектов добавлено за сутки': b.get('listings_24h', 0),
        'номеров удалено в корзину за сутки': b.get('phones_trashed_24h', 0),
    }
    errs = {}
    for key, (label, tbl, _) in PLATFORMS.items():
        cur.execute(
            f"SELECT COUNT(*) FILTER (WHERE error IS NULL OR error = '') AS ok, "
            f"COUNT(*) FILTER (WHERE error IS NOT NULL AND error <> '') AS bad "
            f"FROM {SCHEMA}.{tbl} WHERE synced_at > NOW() - INTERVAL '24 hours'"
        )
        r = dict(cur.fetchone() or {})
        errs[label] = {'успешных': r.get('ok', 0), 'с ошибкой': r.get('bad', 0)}
    facts['sync_24h'] = errs
    return facts


def digest_fallback_text(facts):
    b = facts['business']
    lines = [
        f"Площадки: {facts['platforms']['message']}",
        f"Фоновые задачи: {facts['cron']['message']}",
        f"Заявок за сутки: {b.get('leads_24h', 0)}, необработанных: {b.get('leads_new', 0)}.",
        f"Активных объектов: {b.get('listings_active', 0)}, новых за сутки: {b.get('listings_24h', 0)}.",
    ]
    if b.get('phones_trashed_24h'):
        lines.append(f"Удалено номеров в корзину за сутки: {b['phones_trashed_24h']}.")
    return '\n'.join(lines)


def digest_severity(facts):
    if any(p['connected'] and p['status'].startswith(('ошибка', 'на паузе')) for p in facts['platforms']['platforms']):
        return 'high'
    if any(p['connected'] and p['status'] != 'в норме' for p in facts['platforms']['platforms']) \
            or any(j['late'] for j in facts['cron']['jobs']):
        return 'medium'
    return 'low'
