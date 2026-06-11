"""
data-router — единая точка входа для всех операций импорта данных.

Заменяет: xlsx-reader, market-import, import-url (+ импорт из xml-feeds).

Действия (action):
  XLSX (job-система для больших файлов):
    xlsx_start    — запустить импорт XLSX в фоне → {job_id}
    xlsx_status   — статус job → {status, rows_done, ...}
    xlsx_list     — история импортов → [{...}]
    xlsx_preview  — превью без записи в БД

  CSV:
    csv_import    — импортировать CSV (синхронно)
    csv_preview   — превью без записи
    csv_stats     — статистика по источнику
    csv_clear     — удалить записи источника

  URL:
    url_parse     — спарсить страницу объекта по URL

  XML:
    xml_import    — импортировать XML-фид (Яндекс/Авито/ЦИАН)
    xml_preview   — превью без записи
"""

import json
import os
import sys

# Добавляем папку функции в sys.path чтобы core.py и adapters/ были доступны
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from core import ok, err, cors_ok

from adapter_xlsx import (
    action_start   as xlsx_start,
    action_status  as xlsx_status,
    action_list    as xlsx_list,
    action_preview as xlsx_preview,
)
from adapter_csv import (
    action_import as csv_import,
    action_stats  as csv_stats,
    action_clear  as csv_clear,
)
from adapter_url import action_parse as url_parse
from adapter_xml import action_import as xml_import


# ═══════════════════════════════════════════════════════════════════════════════
# HANDLER
# ═══════════════════════════════════════════════════════════════════════════════

def handler(event: dict, context) -> dict:
    """Единая точка входа data-router. Маршрутизирует по полю action."""

    if event.get('httpMethod') == 'OPTIONS':
        return cors_ok()

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return err('Invalid JSON body')

    action = body.get('action', '').strip()
    if not action:
        return err('Укажите action')

    # ── XLSX ──────────────────────────────────────────────────────────────────

    if action == 'xlsx_start':
        file_url = body.get('file_url', '').strip()
        if not file_url:
            return err('Укажите file_url')
        result = xlsx_start(
            file_url=file_url,
            source=body.get('source', 'xlsx'),
            replace=bool(body.get('replace', False)),
        )
        return ok(result)

    if action == 'xlsx_status':
        job_id = body.get('job_id')
        if not job_id:
            return err('Укажите job_id')
        result = xlsx_status(int(job_id))
        if result is None:
            return err('Job не найден', 404)
        return ok(result)

    if action == 'xlsx_list':
        result = xlsx_list(limit=int(body.get('limit', 20)))
        return ok(result)

    if action == 'xlsx_preview':
        file_url = body.get('file_url', '').strip()
        if not file_url:
            return err('Укажите file_url')
        result = xlsx_preview(
            file_url=file_url,
            source=body.get('source', 'xlsx'),
        )
        return ok(result)

    # ── CSV ───────────────────────────────────────────────────────────────────

    if action in ('csv_import', 'csv_preview'):
        file_url = body.get('file_url', '').strip()
        if not file_url:
            return err('Укажите file_url')
        result = csv_import(
            file_url=file_url,
            source=body.get('source', 'csv'),
            replace=bool(body.get('replace', False)),
            preview=(action == 'csv_preview'),
        )
        return ok(result)

    if action == 'csv_stats':
        result = csv_stats(source=body.get('source', ''))
        return ok(result)

    if action == 'csv_clear':
        source = body.get('source', '').strip()
        if not source:
            return err('Укажите source')
        result = csv_clear(source=source)
        return ok(result)

    # ── URL ───────────────────────────────────────────────────────────────────

    if action == 'url_parse':
        url = body.get('url', '').strip()
        if not url:
            return err('Укажите url')
        result = url_parse(url=url)
        if 'error' in result:
            return err(result['error'])
        return ok(result)

    # ── XML ───────────────────────────────────────────────────────────────────

    if action in ('xml_import', 'xml_preview'):
        result = xml_import(
            source_url=body.get('url', '').strip(),
            xml_text=body.get('xml', ''),
            source=body.get('source', 'xml'),
            target=body.get('target', 'listings'),
            author_id=int(body.get('author_id', 1)),
            preview=(action == 'xml_preview'),
        )
        if 'error' in result:
            return err(result['error'])
        return ok(result)

    # ── Обратная совместимость со старыми action-ами ──────────────────────────
    # Фронтенд xlsx-reader использует эти имена — поддерживаем без изменений

    if action == 'import_market_start':
        file_url = body.get('file_url', '').strip()
        if not file_url:
            return err('Укажите file_url')
        result = xlsx_start(
            file_url=file_url,
            source=body.get('source', 'xlsx'),
            replace=bool(body.get('replace', False)),
        )
        return ok(result)

    if action == 'import_market_status':
        job_id = body.get('job_id')
        if not job_id:
            return err('job_id required')
        result = xlsx_status(int(job_id))
        if result is None:
            return err('job not found', 404)
        return ok(result)

    if action == 'import_market_list':
        result = xlsx_list(limit=20)
        return ok(result)

    return err(f'Неизвестный action: {action}', 400)