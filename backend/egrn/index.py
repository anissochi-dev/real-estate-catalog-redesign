import json
import os
import urllib.request
import urllib.parse

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

BASE_URL = 'https://service.api-assist.com'


def _ok(data: dict) -> dict:
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(data, ensure_ascii=False)}


def _err(msg: str, code: int = 400) -> dict:
    return {'statusCode': code, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))


def handler(event: dict, context) -> dict:
    """ЕГРН API: получение данных объекта и лимитов по кадастровому номеру."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    api_key = os.environ.get('EGRN_API_KEY', '')
    if not api_key:
        return _err('EGRN_API_KEY не настроен', 500)

    params = event.get('queryStringParameters') or {}
    action = params.get('action', 'details')

    # action=stat — лимиты запросов
    if action == 'stat':
        url = f'{BASE_URL}/stat/?key={api_key}'
        data = _fetch(url)
        # data — список, берём первый элемент с service=egrn
        stat = next((s for s in data if s.get('service') == 'egrn'), data[0] if data else {})
        return _ok({
            'day_used': stat.get('day_request_count', 0),
            'day_limit': stat.get('day_limit', 0),
            'month_used': stat.get('month_request_count', 0),
            'month_limit': stat.get('month_limit', 0),
            'paid_till': stat.get('paid_till', ''),
        })

    # action=details — данные объекта по кадастровому номеру
    cad_number = params.get('cadNumber', '').strip()
    if not cad_number:
        return _err('Укажите cadNumber')

    url = f'{BASE_URL}/parser/egrn_api/details_by_number?key={api_key}&cadNumber={urllib.parse.quote(cad_number)}'
    data = _fetch(url)

    if not data.get('success'):
        return _ok({'success': 0, 'message': 'Объект не найден или данные временно недоступны'})

    records = data.get('records', [])
    if not records:
        return _ok({'success': 0, 'message': 'Нет данных по объекту'})

    r = records[0]
    return _ok({
        'success': 1,
        'type': r.get('type', ''),
        'status': r.get('status', ''),
        'ownership': r.get('ownership', ''),
        'cad_number': r.get('cad_number', ''),
        'cad_quarter': r.get('cad_quarter', ''),
        'area': r.get('area', ''),
        'floor': r.get('floor', ''),
        'address': r.get('address', ''),
        'purpose': r.get('purpose', ''),
        'reg_date': r.get('reg_date', ''),
        'cad_cost': r.get('cad_cost', ''),
        'cad_cost_det_date': r.get('cad_cost_det_date', ''),
        'encumbrances': r.get('encumbrances', []),
        'rights': r.get('rights', []),
    })
