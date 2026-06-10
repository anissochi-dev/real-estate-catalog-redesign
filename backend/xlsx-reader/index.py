import json
import os
import io
import urllib.request
import psycopg2
import psycopg2.extras
import openpyxl
from datetime import datetime

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')

COL_MAP = {
    'Отдельно стоящие здания за м2':        'standalone',
    'Производственные помещения за м2':      'industrial',
    'Торговые помещения и площади за м2':    'retail',
    'Помещения общепита за м2':              'catering',
    'Помещение свободного назначения за м2': 'free_purpose',
    'Складские помещения и комплексы за м2': 'warehouse',
    'Офисные помещения за м2':               'office',
}

RENT_FILE_KEYS = {
    '3f76641e-b047-4808-b575-4e245201e491.xlsx',
    'c1a2e6d7-4c98-4c21-9c9c-a6a8f264a839.xlsx',
    '5b5762ac-c687-4578-820f-4dcfbc8a6f23.xlsx',
}


def _parse_date(s: str):
    for fmt in ('%d.%m.%Y', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except Exception:
            pass
    return None


def _is_rent(url: str) -> bool:
    return any(k in url for k in RENT_FILE_KEYS)


def handler(event: dict, context) -> dict:
    """Читает xlsx файлы с CDN и импортирует данные в price_history_biweekly."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400'}, 'body': ''}

    body = json.loads(event.get('body') or '{}')
    urls = body.get('urls', [])
    preview_only = body.get('preview_only', False)

    all_rows = []
    errors = []

    for url in urls:
        deal_type = 'rent' if _is_rent(url) else 'sale'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                wb.close()
                continue
            header = [str(c).strip() if c else '' for c in rows[0]]

            data_cols = []
            for i, h in enumerate(header):
                if h in ('Даты', 'Изменение', ''):
                    continue
                category = COL_MAP.get(h, h.lower().replace(' ', '_').replace('/', '_'))
                data_cols.append((i, category))

            for row in rows[1:]:
                if not row or not row[0]:
                    continue
                date_val = _parse_date(str(row[0]))
                if not date_val:
                    continue
                for col_idx, category in data_cols:
                    if col_idx >= len(row) or row[col_idx] is None:
                        continue
                    try:
                        price = float(str(row[col_idx]).replace(',', '.').replace(' ', ''))
                    except Exception:
                        continue
                    change = None
                    next_idx = col_idx + 1
                    if next_idx < len(row) and row[next_idx]:
                        try:
                            change = float(str(row[next_idx]).replace('%', '').replace('+', '').strip())
                        except Exception:
                            pass
                    all_rows.append({
                        'date': date_val, 'category': category,
                        'deal_type': deal_type, 'price': price, 'change': change,
                    })
            wb.close()
        except Exception as e:
            errors.append({'url': url, 'error': str(e)})

    if preview_only:
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
            'body': json.dumps({
                'total_rows': len(all_rows),
                'errors': errors,
                'sample': [{'date': str(r['date']), 'category': r['category'], 'deal_type': r['deal_type'], 'price': r['price']} for r in all_rows[:20]],
            }, ensure_ascii=False),
        }

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()
    inserted = 0
    skipped = 0
    for r in all_rows:
        try:
            cur.execute(
                f"INSERT INTO {SCHEMA}.price_history_biweekly "
                f"(date_recorded, category, deal_type, price_per_m2, change_pct, source) "
                f"VALUES (%s, %s, %s, %s, %s, 'xlsx_import') "
                f"ON CONFLICT (date_recorded, category, deal_type) DO NOTHING",
                (r['date'], r['category'], r['deal_type'], r['price'], r['change'])
            )
            inserted += cur.rowcount
        except Exception as e:
            skipped += 1
            errors.append({'row': str(r['date']) + '/' + r['category'], 'error': str(e)[:100]})
    conn.commit()
    cur.close()
    conn.close()

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps({'success': True, 'inserted': inserted, 'skipped': skipped, 'total_parsed': len(all_rows), 'errors': errors[:10]}, ensure_ascii=False),
    }
