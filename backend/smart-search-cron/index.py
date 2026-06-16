"""
Ежедневная переиндексация ИИ-поиска объектов недвижимости.
Запускается в 02:00 МСК (= 23:00 UTC) через внешний cron (ping_cron).
Переиндексирует все объекты у которых эмбеддинг устарел или отсутствует.
"""

import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

SMART_SEARCH_URL = 'https://functions.poehali.dev/32925bd2-c418-4a8c-8e32-97b5385e67da'
TARGET_HOUR_UTC = 23   # 02:00 МСК = 23:00 UTC
BATCH_SIZE = 50        # объектов за один запуск

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Token',
}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json; charset=utf-8'},
        'body': json.dumps(body, ensure_ascii=False),
    }


def _call_reindex(batch: int = BATCH_SIZE) -> dict:
    payload = json.dumps({'action': 'reindex', 'batch': batch}).encode()
    req = urllib.request.Request(
        SMART_SEARCH_URL, data=payload,
        headers={'Content-Type': 'application/json'}, method='POST'
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.loads(resp.read().decode())


def handler(event: dict, context) -> dict:
    """Ежедневная переиндексация ИИ-поиска в 02:00 МСК."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {**CORS, 'Access-Control-Max-Age': '86400'}, 'body': ''}

    headers = event.get('headers') or {}
    headers_lc = {k.lower(): v for k, v in headers.items()}
    qs = event.get('queryStringParameters') or {}
    action = qs.get('action', '')

    # Защита cron-токеном
    cron_token = os.environ.get('CRON_SECRET', '')
    incoming_token = headers_lc.get('x-cron-token', '') or qs.get('token', '')

    now_utc = datetime.now(timezone.utc)
    now_msk = now_utc + timedelta(hours=3)

    # Ручной запуск (force=true) — без проверки времени, только токен
    if action == 'force' or qs.get('force') == 'true':
        if cron_token and incoming_token != cron_token:
            return _ok({'error': 'Unauthorized'}, 403)
        try:
            result = _call_reindex(batch=100)
            return _ok({
                'ok': True,
                'mode': 'force',
                'time_msk': now_msk.strftime('%Y-%m-%d %H:%M'),
                **result,
            })
        except Exception as e:
            return _ok({'error': str(e)}, 500)

    # Cron-режим: проверяем время
    if action == 'cron' or not action:
        # Проверяем токен
        if cron_token and incoming_token != cron_token:
            return _ok({'skipped': True, 'reason': 'bad token'})

        # Проверяем: 02:00–02:59 МСК (23:00–23:59 UTC)
        if now_utc.hour != TARGET_HOUR_UTC:
            return _ok({
                'skipped': True,
                'reason': f'not time yet',
                'now_msk': now_msk.strftime('%H:%M'),
                'target_msk': '02:00',
            })

        try:
            result = _call_reindex(batch=BATCH_SIZE)
            print(f'[smart-search-cron] done={result.get("done")} errors={result.get("errors")} remaining={result.get("remaining")} at {now_msk.strftime("%Y-%m-%d %H:%M")} МСК')
            return _ok({
                'ok': True,
                'mode': 'cron',
                'time_msk': now_msk.strftime('%Y-%m-%d %H:%M'),
                **result,
            })
        except Exception as e:
            print(f'[smart-search-cron] error: {e}')
            return _ok({'error': str(e)}, 500)

    return _ok({'error': 'unknown action'}, 400)
