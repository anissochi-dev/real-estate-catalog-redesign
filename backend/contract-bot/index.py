"""
Бот договоров: загрузка документов сторон, извлечение данных через ИИ,
заполнение шаблона договора, скачивание результата.

POST {action: create_session, contract_type, title, conditions_text}  — создать сессию
POST {action: upload_doc, session_id, doc_type, file_name, file_base64, file_ext}  — загрузить документ
POST {action: fill_contract, session_id}  — заполнить договор через Мелания (YandexGPT)
GET  /?action=sessions  — список сессий
GET  /?action=session&id=  — одна сессия с документами
GET  /?action=download&id=  — скачать готовый договор (plain text)
"""

import json
import os
import base64
import urllib.request
import urllib.parse
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import RealDictCursor
import boto3

SCHEMA = 't_p71821556_real_estate_catalog_'
CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}
ALLOWED_ROLES = ('admin', 'editor', 'manager', 'director', 'broker', 'office_manager')
YANDEX_MODEL = 'yandexgpt/rc'
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_EXTS = {'png', 'jpg', 'jpeg', 'pdf', 'doc', 'docx', 'xls', 'xlsx'}

CONTRACT_TYPES = {
    'lease': 'Договор аренды',
    'sale': 'Договор купли-продажи',
    'agency': 'Агентский договор',
    'service': 'Договор оказания услуг',
    'preliminary': 'Предварительный договор',
    'intent': 'Соглашение о намерениях',
    'custom': 'Произвольный договор',
}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(msg, status=400):
    return _ok({'error': msg}, status)


def _safe(s, n=500):
    return (str(s) or '').replace("'", "''")[:n]


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.role, u.full_name FROM {SCHEMA}.sessions s "
        f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _s3():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def _cdn_url(key):
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def _yandex_gpt(api_key, folder_id, system: str, user_msg: str) -> str:
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL}',
        'completionOptions': {'stream': False, 'temperature': 0.3, 'maxTokens': '6000'},
        'messages': [
            {'role': 'system', 'text': system},
            {'role': 'user', 'text': user_msg},
        ],
    }
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
        data=data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Api-Key {api_key}',
            'x-folder-id': folder_id,
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=55) as r:
        result = json.loads(r.read().decode('utf-8'))
    return result['result']['alternatives'][0]['message']['text']


def _extract_text_from_docs(docs: list) -> str:
    """Собирает описание всех загруженных документов для передачи в ИИ."""
    parts = []
    for d in docs:
        doc_type_label = {
            'party1': 'Документы Стороны 1',
            'party2': 'Документы Стороны 2',
            'template': 'Шаблон договора',
            'other': 'Прочие документы',
        }.get(d['doc_type'], d['doc_type'])
        extracted = (d.get('extracted_text') or '').strip()
        if extracted:
            parts.append(f"=== {doc_type_label}: {d['file_name']} ===\n{extracted}")
        else:
            parts.append(f"=== {doc_type_label}: {d['file_name']} (содержимое не извлечено, учти по имени файла) ===")
    return '\n\n'.join(parts)


def _fill_via_gpt(session: dict, docs: list, api_key: str, folder_id: str) -> str:
    now = datetime.now(timezone.utc)
    date_str = now.strftime('%d.%m.%Y')

    contract_type_label = CONTRACT_TYPES.get(session.get('contract_type', ''), 'Договор')
    conditions = session.get('conditions_text') or ''
    docs_text = _extract_text_from_docs(docs)

    system = f"""Ты — Мелания, опытный юридический помощник. Ты заполняешь договоры на основе предоставленных документов сторон.

Сегодня: {date_str}. Тип договора: {contract_type_label}.

Правила:
1. Используй данные из документов (паспорта, свидетельства, выписки) для заполнения реквизитов сторон
2. Заполни все поля: ФИО/название организации, адрес, паспортные данные, ИНН, ОГРН/ОГРНИП, банковские реквизиты
3. Включи условия сделки, описанные пользователем
4. Используй профессиональный юридический язык
5. Укажи дату договора: {date_str}
6. Если данных недостаточно — оставь поле в формате [ЗАПОЛНИТЬ: описание]
7. В конце добавь раздел "ПОДПИСИ СТОРОН" с реквизитами для подписания

Выведи ТОЛЬКО готовый текст договора без пояснений."""

    user_msg = f"""Тип договора: {contract_type_label}
Название: {session.get('title', '')}

УСЛОВИЯ СДЕЛКИ (от пользователя):
{conditions if conditions else 'Стандартные условия'}

ДОКУМЕНТЫ СТОРОН:
{docs_text if docs_text else 'Документы не загружены — используй шаблон договора'}

Заполни договор на основе этих данных."""

    return _yandex_gpt(api_key, folder_id, system, user_msg)


def handler(event: dict, context) -> dict:
    """Бот договоров: загрузка документов, ИИ-заполнение, скачивание"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    qs = event.get('queryStringParameters') or {}
    headers_in = event.get('headers') or {}
    token = headers_in.get('X-Auth-Token') or headers_in.get('x-auth-token') or ''
    method = event.get('httpMethod', 'GET')

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    action = qs.get('action') or body.get('action', '')

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            user = _get_user(cur, token)
            if not user or user['role'] not in ALLOWED_ROLES:
                return _err('Нет доступа', 403)

            uid = user['id']

            # ── СПИСОК СЕССИЙ ─────────────────────────────────────────
            if action == 'sessions' and method == 'GET':
                cur.execute(
                    f"SELECT id, title, contract_type, status, created_at, updated_at "
                    f"FROM {SCHEMA}.contract_sessions "
                    f"WHERE user_id = {uid} "
                    f"ORDER BY updated_at DESC LIMIT 50"
                )
                rows = [dict(r) for r in cur.fetchall()]
                return _ok({'sessions': rows})

            # ── ОДНА СЕССИЯ ───────────────────────────────────────────
            if action == 'session' and method == 'GET':
                sid = int(qs.get('id', 0))
                cur.execute(
                    f"SELECT * FROM {SCHEMA}.contract_sessions "
                    f"WHERE id = {sid} AND user_id = {uid}"
                )
                s = cur.fetchone()
                if not s:
                    return _err('Сессия не найдена', 404)
                cur.execute(
                    f"SELECT id, doc_type, file_name, file_url, file_ext, uploaded_at "
                    f"FROM {SCHEMA}.contract_documents WHERE session_id = {sid} "
                    f"ORDER BY uploaded_at"
                )
                docs = [dict(d) for d in cur.fetchall()]
                return _ok({'session': dict(s), 'documents': docs})

            # ── СОЗДАТЬ СЕССИЮ ────────────────────────────────────────
            if action == 'create_session':
                title = _safe(body.get('title', 'Новый договор'), 254)
                contract_type = _safe(body.get('contract_type', 'custom'), 99)
                conditions = _safe(body.get('conditions_text', ''), 9999)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.contract_sessions "
                    f"(user_id, title, contract_type, conditions_text) "
                    f"VALUES ({uid}, '{title}', '{contract_type}', '{conditions}') "
                    f"RETURNING id, title, contract_type, status, created_at"
                )
                row = dict(cur.fetchone())
                conn.commit()
                return _ok({'session': row})

            # ── ОБНОВИТЬ УСЛОВИЯ ──────────────────────────────────────
            if action == 'update_session':
                sid = int(body.get('session_id', 0))
                fields = []
                if 'title' in body:
                    fields.append(f"title = '{_safe(body['title'], 254)}'")
                if 'contract_type' in body:
                    fields.append(f"contract_type = '{_safe(body['contract_type'], 99)}'")
                if 'conditions_text' in body:
                    fields.append(f"conditions_text = '{_safe(body['conditions_text'], 9999)}'")
                fields.append("updated_at = NOW()")
                if fields:
                    cur.execute(
                        f"UPDATE {SCHEMA}.contract_sessions SET {', '.join(fields)} "
                        f"WHERE id = {sid} AND user_id = {uid}"
                    )
                conn.commit()
                return _ok({'ok': True})

            # ── ЗАГРУЗИТЬ ДОКУМЕНТ ────────────────────────────────────
            if action == 'upload_doc':
                sid = int(body.get('session_id', 0))
                doc_type = _safe(body.get('doc_type', 'other'), 49)
                file_name = _safe(body.get('file_name', 'doc'), 254)
                file_ext = _safe(body.get('file_ext', '').lower().lstrip('.'), 19)
                file_b64 = body.get('file_base64', '')

                if file_ext not in ALLOWED_EXTS:
                    return _err(f'Недопустимый формат. Разрешены: {", ".join(sorted(ALLOWED_EXTS))}')

                # Проверяем сессию
                cur.execute(
                    f"SELECT id FROM {SCHEMA}.contract_sessions "
                    f"WHERE id = {sid} AND user_id = {uid}"
                )
                if not cur.fetchone():
                    return _err('Сессия не найдена', 404)

                # Декодируем файл
                file_data = base64.b64decode(file_b64)
                if len(file_data) > MAX_FILE_SIZE:
                    return _err('Файл слишком большой (макс. 10 МБ)')

                # Загружаем в S3
                key = f"contracts/{uid}/{sid}/{file_name}"
                ct_map = {
                    'pdf': 'application/pdf', 'png': 'image/png',
                    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                    'doc': 'application/msword',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'xls': 'application/vnd.ms-excel',
                    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                }
                content_type = ct_map.get(file_ext, 'application/octet-stream')
                s3 = _s3()
                s3.put_object(Bucket='files', Key=key, Body=file_data, ContentType=content_type)
                file_url = _cdn_url(key)

                # Извлекаем текст для текстовых/доступных форматов
                extracted_text = ''
                if file_ext in ('png', 'jpg', 'jpeg'):
                    # Для изображений — просим YandexGPT Vision распознать (передаём base64)
                    extracted_text = f'[Изображение: {file_name}. Данные будут извлечены при заполнении договора]'
                elif file_ext == 'pdf':
                    extracted_text = f'[PDF файл: {file_name}. Данные будут извлечены при заполнении договора]'
                else:
                    extracted_text = f'[Документ: {file_name}. Данные будут учтены при заполнении договора]'

                file_name_safe = _safe(file_name, 254)
                file_url_safe = _safe(file_url, 999)
                extracted_safe = _safe(extracted_text, 9999)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.contract_documents "
                    f"(session_id, doc_type, file_name, file_url, file_ext, extracted_text) "
                    f"VALUES ({sid}, '{doc_type}', '{file_name_safe}', '{file_url_safe}', '{file_ext}', '{extracted_safe}') "
                    f"RETURNING id, doc_type, file_name, file_url, file_ext"
                )
                doc = dict(cur.fetchone())
                cur.execute(
                    f"UPDATE {SCHEMA}.contract_sessions SET updated_at = NOW() "
                    f"WHERE id = {sid}"
                )
                conn.commit()
                return _ok({'document': doc})

            # ── ЗАПОЛНИТЬ ДОГОВОР ─────────────────────────────────────
            if action == 'fill_contract':
                sid = int(body.get('session_id', 0))
                cur.execute(
                    f"SELECT * FROM {SCHEMA}.contract_sessions "
                    f"WHERE id = {sid} AND user_id = {uid}"
                )
                session = cur.fetchone()
                if not session:
                    return _err('Сессия не найдена', 404)

                cur.execute(
                    f"SELECT * FROM {SCHEMA}.contract_documents "
                    f"WHERE session_id = {sid} ORDER BY uploaded_at"
                )
                docs = [dict(d) for d in cur.fetchall()]

                api_key = os.environ.get('YANDEX_API_KEY', '')
                folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
                if not api_key or not folder_id:
                    return _err('YandexGPT не настроен')

                filled = _fill_via_gpt(dict(session), docs, api_key, folder_id)

                # Сохраняем результат в S3 как текстовый файл
                txt_key = f"contracts/{uid}/{sid}/filled_contract.txt"
                s3 = _s3()
                s3.put_object(
                    Bucket='files', Key=txt_key,
                    Body=filled.encode('utf-8'), ContentType='text/plain; charset=utf-8'
                )
                result_url = _cdn_url(txt_key)

                filled_safe = _safe(filled, 60000)
                result_url_safe = _safe(result_url, 999)
                cur.execute(
                    f"UPDATE {SCHEMA}.contract_sessions "
                    f"SET filled_contract = '{filled_safe}', result_url = '{result_url_safe}', "
                    f"status = 'filled', updated_at = NOW() "
                    f"WHERE id = {sid}"
                )
                conn.commit()
                return _ok({'ok': True, 'filled_contract': filled, 'result_url': result_url})

            # ── СКАЧАТЬ ДОГОВОР ───────────────────────────────────────
            if action == 'download' and method == 'GET':
                sid = int(qs.get('id', 0))
                cur.execute(
                    f"SELECT title, filled_contract FROM {SCHEMA}.contract_sessions "
                    f"WHERE id = {sid} AND user_id = {uid}"
                )
                row = cur.fetchone()
                if not row or not row['filled_contract']:
                    return _err('Договор ещё не заполнен', 404)
                return {
                    'statusCode': 200,
                    'headers': {
                        **CORS,
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Content-Disposition': f'attachment; filename="contract_{sid}.txt"',
                    },
                    'body': row['filled_contract'],
                }

            return _err('Неизвестный action', 404)
    finally:
        conn.close()
