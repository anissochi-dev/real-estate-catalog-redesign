"""
Business: Smart Run — умный многошаговый workflow оркестратора ВБ.
Шаги: 1) Страж (скан + авто-блокировка) 2) Инспектор (аудит + авто-SEO) 3) Опечатки
Args: event POST, headers X-Auth-Token; context
Returns: итоговая сводка с числами по всем шагам
"""

import json
import os
import urllib.request

import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'


def _ok(data: dict) -> dict:
    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(data, ensure_ascii=False, default=str),
    }


def _err(code: int, msg: str) -> dict:
    return {
        'statusCode': code,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps({'error': msg}, ensure_ascii=False),
    }


def _sanitize(s: str, max_len: int = 500) -> str:
    return str(s or '').replace("'", "''")[:max_len]


def _get_user(cur, token: str):
    if not token:
        return None
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s "
        f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{token}' AND s.expires_at > NOW() LIMIT 1"
    )
    return cur.fetchone()


def _load_gpt_keys(cur):
    cur.execute(f"SELECT key, value FROM {SCHEMA}.ai_memory WHERE key IN ('yandex_api_key','yandex_folder_id')")
    kv = {r['key']: r['value'] for r in cur.fetchall()}
    return kv.get('yandex_api_key', ''), kv.get('yandex_folder_id', '')


def _gpt_short(prompt: str, system: str, api_key: str, folder_id: str) -> str:
    """Быстрый вызов YandexGPT (короткая модель)."""
    body = json.dumps({
        'modelUri': f'gpt://{folder_id}/yandexgpt-5-pro/latest' if folder_id else 'yandexgpt-5-pro/latest',
        'completionOptions': {'stream': False, 'temperature': 0.3, 'maxTokens': 400},
        'messages': [
            {'role': 'system', 'text': system},
            {'role': 'user', 'text': prompt[:3000]},
        ],
    }, ensure_ascii=False).encode()
    try:
        req = urllib.request.Request(
            YANDEX_GPT_URL, data=body,
            headers={'Authorization': f'Api-Key {api_key}', 'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read().decode())
            return result.get('result', {}).get('alternatives', [{}])[0].get('message', {}).get('text', '')
    except Exception:
        return ''


def _step_guardian(cur) -> dict:
    """Шаг 1: Страж — скан + авто-блокировка угроз."""
    # XSS
    cur.execute(
        f"SELECT id, title FROM {SCHEMA}.listings "
        f"WHERE description ~ '<script|<iframe|onerror=|onclick=|javascript:' "
        f"OR title ~ '<script|<iframe|onerror=' LIMIT 20"
    )
    xss_items = [dict(r) for r in cur.fetchall()]

    # Спам-телефоны (>3 заявок за 24ч)
    cur.execute(
        f"SELECT phone, COUNT(*) AS cnt FROM {SCHEMA}.leads "
        f"WHERE created_at > NOW() - INTERVAL '24 hours' AND phone IS NOT NULL "
        f"GROUP BY phone HAVING COUNT(*) > 3 ORDER BY cnt DESC LIMIT 20"
    )
    spam_phones = [dict(r) for r in cur.fetchall()]

    # SQL-инъекции в заявках
    cur.execute(
        f"SELECT id, phone FROM {SCHEMA}.leads "
        f"WHERE message ~ 'SELECT |INSERT |DROP |UNION |--$|<script' "
        f"OR name ~ '<script|SELECT ' LIMIT 10"
    )
    injections = [dict(r) for r in cur.fetchall()]

    # Аномальные объекты
    cur.execute(
        f"SELECT id, title FROM {SCHEMA}.listings "
        f"WHERE status='active' AND (price = 0 OR area = 0 OR author_id IS NULL) LIMIT 20"
    )
    anomalies = [dict(r) for r in cur.fetchall()]

    # Авто-блокировка спам-телефонов
    blocked = []
    for sp in spam_phones[:10]:
        phone = (sp.get('phone') or '').strip()
        if not phone:
            continue
        ph_safe = _sanitize(phone, 50)
        reason = _sanitize(f'Авто-блок: {sp.get("cnt","?")} заявок за 24ч', 200)
        cur.execute(
            f"INSERT INTO {SCHEMA}.agent_blocks (block_type, value, reason, blocked_by) "
            f"VALUES ('phone', '{ph_safe}', '{reason}', 'smart_run') "
            f"ON CONFLICT (block_type, value) DO UPDATE SET is_active=TRUE, reason='{reason}', blocked_at=NOW()"
        )
        blocked.append(phone)

    # Авто-блокировка телефонов из SQL-инъекций
    for inj in injections[:5]:
        lead_id = inj.get('id')
        phone = (inj.get('phone') or '').strip()
        if phone and phone not in blocked:
            ph_safe = _sanitize(phone, 50)
            reason = _sanitize(f'Авто-блок: инъекция в заявке #{lead_id}', 200)
            cur.execute(
                f"INSERT INTO {SCHEMA}.agent_blocks (block_type, value, reason, blocked_by) "
                f"VALUES ('phone', '{ph_safe}', '{reason}', 'smart_run') "
                f"ON CONFLICT (block_type, value) DO UPDATE SET is_active=TRUE, reason='{reason}', blocked_at=NOW()"
            )
            blocked.append(phone)

    total_threats = len(xss_items) + len(spam_phones) + len(injections)
    severity = 'critical' if total_threats > 5 else ('warning' if total_threats > 0 else 'info')

    # Сохраняем отчёт
    summary = (
        f"XSS: {len(xss_items)}, спам-телефоны: {len(spam_phones)}, "
        f"инъекции: {len(injections)}, аномалии: {len(anomalies)}. Заблокировано: {len(blocked)}."
    )
    cur.execute(
        f"INSERT INTO {SCHEMA}.agent_reports (module, report_type, summary, severity) "
        f"VALUES ('guardian', 'smart_run_scan', '{_sanitize(summary, 500)}', '{severity}')"
    )

    return {
        'xss': len(xss_items),
        'spam_phones': len(spam_phones),
        'injections': len(injections),
        'anomalies': len(anomalies),
        'blocked': blocked,
        'total_threats': total_threats,
        'severity': severity,
        'message': f"🛡️ Угроз: {total_threats}. Заблокировано: {len(blocked)}.",
    }


def _step_inspector(cur, api_key: str, folder_id: str) -> dict:
    """Шаг 2: Инспектор — аудит + авто-SEO для объектов без мета."""
    # SEO-статистика
    cur.execute(
        f"SELECT "
        f"COUNT(*) FILTER (WHERE seo_title IS NULL OR seo_title='') AS no_seo_title, "
        f"COUNT(*) FILTER (WHERE seo_description IS NULL OR seo_description='') AS no_seo_desc, "
        f"COUNT(*) FILTER (WHERE COALESCE(LENGTH(description),0) < 50) AS short_desc, "
        f"COUNT(*) FILTER (WHERE LENGTH(title) > 70) AS long_title, "
        f"COUNT(*) AS total "
        f"FROM {SCHEMA}.listings WHERE status='active'"
    )
    seo_stat = dict(cur.fetchone() or {})

    # Битые данные
    cur.execute(
        f"SELECT COUNT(*) AS cnt FROM {SCHEMA}.listings "
        f"WHERE status='active' AND (price <= 0 OR area <= 0 OR COALESCE(address,'') = '')"
    )
    broken_count = (cur.fetchone() or {}).get('cnt', 0)

    # Дубли
    cur.execute(
        f"SELECT COUNT(*) AS cnt FROM ("
        f"SELECT LOWER(title) FROM {SCHEMA}.listings "
        f"WHERE status='active' GROUP BY LOWER(title) HAVING COUNT(*) > 1"
        f") AS dupes"
    )
    dupes_count = (cur.fetchone() or {}).get('cnt', 0)

    # Старые необработанные лиды
    cur.execute(
        f"SELECT COUNT(*) AS cnt FROM {SCHEMA}.leads "
        f"WHERE status='new' AND created_at < NOW() - INTERVAL '7 days'"
    )
    old_leads = (cur.fetchone() or {}).get('cnt', 0)

    no_seo = int(seo_stat.get('no_seo_title') or 0)
    seo_fixed = 0

    # Авто-генерация SEO (до 20 объектов)
    if no_seo > 0 and api_key and folder_id:
        cur.execute(
            f"SELECT id, title, description, category, deal, area, district "
            f"FROM {SCHEMA}.listings "
            f"WHERE status='active' AND (seo_title IS NULL OR seo_title='') "
            f"ORDER BY id DESC LIMIT 20"
        )
        rows = [dict(r) for r in cur.fetchall()]
        for row in rows:
            ctx = (
                f"{row.get('title','')} — "
                f"{row.get('category','')} {row.get('deal','')} "
                f"{row.get('area','')}м² {row.get('district','')}. "
                f"{(row.get('description') or '')[:300]}"
            )
            text = _gpt_short(
                f'TITLE: SEO-заголовок до 65 символов\nDESCRIPTION: описание до 155 символов\n\nДанные: {ctx}',
                'SEO-специалист недвижимости', api_key, folder_id,
            )
            seo_t, seo_d = '', ''
            for line in (text or '').splitlines():
                if line.startswith('TITLE:'):
                    seo_t = line[6:].strip()[:65]
                elif line.startswith('DESCRIPTION:'):
                    seo_d = line[12:].strip()[:155]
            if seo_t or seo_d:
                sets = []
                if seo_t:
                    sets.append(f"seo_title='{_sanitize(seo_t, 100)}'")
                if seo_d:
                    sets.append(f"seo_description='{_sanitize(seo_d, 300)}'")
                cur.execute(
                    f"UPDATE {SCHEMA}.listings SET {', '.join(sets)}, updated_at=NOW() "
                    f"WHERE id={row['id']}"
                )
                seo_fixed += 1

    severity = (
        'critical' if int(seo_stat.get('short_desc') or 0) + broken_count > 20
        else 'warning' if no_seo + broken_count > 5 else 'info'
    )
    summary = (
        f"Без SEO: {no_seo} → исправлено: {seo_fixed}. "
        f"Коротких описаний: {seo_stat.get('short_desc',0)}. "
        f"Битых данных: {broken_count}. Дублей: {dupes_count}. "
        f"Старых лидов: {old_leads}."
    )
    cur.execute(
        f"INSERT INTO {SCHEMA}.agent_reports (module, report_type, summary, severity) "
        f"VALUES ('inspector', 'smart_run_audit', '{_sanitize(summary, 500)}', '{severity}')"
    )

    return {
        'no_seo': no_seo,
        'seo_fixed': seo_fixed,
        'short_desc': int(seo_stat.get('short_desc') or 0),
        'broken_data': broken_count,
        'duplicates': dupes_count,
        'old_leads': old_leads,
        'severity': severity,
        'message': f"🔍 Без SEO: {no_seo} → исправлено: {seo_fixed}. Битых данных: {broken_count}. Старых лидов: {old_leads}.",
    }


def _step_typos(cur, api_key: str, folder_id: str) -> dict:
    """Шаг 3: Проверка опечаток через GPT (до 5 объектов)."""
    cur.execute(
        f"SELECT id, title, description FROM {SCHEMA}.listings "
        f"WHERE status='active' AND LENGTH(description) > 100 "
        f"ORDER BY updated_at DESC LIMIT 5"
    )
    rows = [dict(r) for r in cur.fetchall()]

    results = []
    has_errors = 0
    for row in rows:
        if not api_key or not folder_id:
            break
        text = (row.get('description') or '')[:1500]
        answer = _gpt_short(
            f'Найди орфографические ошибки в тексте объявления о недвижимости. '
            f'Перечисли до 5 ошибок в формате «ошибка» → «исправление». '
            f'Если ошибок нет — ответь: ОК.\n\nТекст:\n{text}',
            'Корректор текста', api_key, folder_id,
        )
        typo_text = (answer or '').strip()
        has_typo = typo_text and typo_text.upper() != 'ОК' and '→' in typo_text
        results.append({
            'id': row['id'],
            'title': (row.get('title') or '')[:60],
            'typos': typo_text,
            'has_errors': has_typo,
        })
        if has_typo:
            has_errors += 1

    if has_errors > 0:
        summary = f"Опечатки в {has_errors} из {len(results)} проверенных объектов"
        cur.execute(
            f"INSERT INTO {SCHEMA}.agent_reports (module, report_type, summary, data, severity) "
            f"VALUES ('inspector', 'smart_run_typos', '{_sanitize(summary, 300)}', "
            f"'{_sanitize(json.dumps(results, ensure_ascii=False), 4000)}', 'warning')"
        )

    return {
        'checked': len(results),
        'has_errors': has_errors,
        'results': results,
        'message': (
            f"✍️ Проверено: {len(results)}, с ошибками: {has_errors}."
            + (' Опечатки сохранены в отчёт.' if has_errors else ' Ошибок не найдено.')
        ),
    }


def handler(event: dict, context) -> dict:
    """Smart Run — полный умный workflow оркестратора."""

    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if event.get('httpMethod') != 'POST':
        return _err(405, 'Method not allowed')

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ('admin', 'director'):
                return _err(403, 'Только для администратора и директора')

            api_key, folder_id = _load_gpt_keys(cur)

            # ── Шаг 1: Страж ──────────────────────────────────────────
            s1 = _step_guardian(cur)
            conn.commit()  # сохраняем блокировки сразу

            # ── Шаг 2: Инспектор ──────────────────────────────────────
            s2 = _step_inspector(cur, api_key, folder_id)
            conn.commit()  # сохраняем SEO-исправления

            # ── Шаг 3: Опечатки ───────────────────────────────────────
            s3 = _step_typos(cur, api_key, folder_id)

            # ── Итоговая сводка ────────────────────────────────────────
            total_actions = len(s1['blocked']) + s2['seo_fixed']
            overall_severity = (
                'critical' if s1['severity'] == 'critical' or s2['severity'] == 'critical'
                else 'warning' if s1['total_threats'] > 0 or s2['no_seo'] > 5
                else 'info'
            )

            summary = (
                f"🛡️ Безопасность: угроз {s1['total_threats']}, заблокировано {len(s1['blocked'])}.\n"
                f"🔍 Аудит: без SEO {s2['no_seo']} → исправлено {s2['seo_fixed']}, "
                f"битых данных {s2['broken_data']}, необработанных лидов {s2['old_leads']}.\n"
                f"✍️ Опечатки: проверено {s3['checked']}, найдено ошибок в {s3['has_errors']} объектах.\n"
                f"⚡ Итого авто-исправлено: {total_actions} действий."
            )

            # Итоговый отчёт в БД
            cur.execute(
                f"INSERT INTO {SCHEMA}.agent_reports (module, report_type, summary, severity) "
                f"VALUES ('dispatcher', 'smart_run', '{_sanitize(summary, 1000)}', '{overall_severity}')"
            )
            cur.execute(
                f"INSERT INTO {SCHEMA}.agent_tasks (module, action, status, created_by) "
                f"VALUES ('dispatcher', 'smart_run', 'done', {user['id']})"
            )
            cur.execute(
                f"UPDATE {SCHEMA}.agent_modules SET last_run_at=NOW() WHERE module='dispatcher'"
            )
            conn.commit()

            return _ok({
                'ok': True,
                'severity': overall_severity,
                'steps': {
                    'guardian': s1,
                    'inspector': s2,
                    'typos': s3,
                },
                'totals': {
                    'threats_found': s1['total_threats'],
                    'blocked': len(s1['blocked']),
                    'seo_fixed': s2['seo_fixed'],
                    'typos_found': s3['has_errors'],
                    'total_actions': total_actions,
                },
                'message': f'✅ Smart Run завершён.\n\n{summary}',
            })

    finally:
        conn.close()