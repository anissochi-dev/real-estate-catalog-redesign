"""
ai_client.py — единый AI-модуль проекта (шаблон).

Копируется в каждую бэкенд-функцию при деплое.
Для смены модели — меняем константу ЗДЕСЬ, затем копируем файл во все функции.

Поддерживает:
  - chat()       — генерация текста (YandexGPT)
  - embed()      — векторизация текста (для семантического поиска)
  - load_keys()  — загрузка ключей из env или БД (fallback)

Совместимость: Python 3.11, только stdlib + psycopg2 (без openai SDK).
"""

import json
import os
import urllib.request
import urllib.error

# ── Модели ────────────────────────────────────────────────────────────────────
# Меняем здесь — обновляется во всех функциях после копирования файла

CHAT_MODEL       = 'yandexgpt-5-pro/latest'    # основная модель — генерация, анализ
CHAT_MODEL_FAST  = 'yandexgpt-5-lite/latest'   # быстрая/дешёвая — теги, короткие задачи
VISION_MODEL     = 'qwen2-vl-7b-instruct'       # анализ изображений
EMBED_DOC_MODEL  = 'text-search-doc/latest'     # эмбеддинги документов (индексация)
EMBED_QRY_MODEL  = 'text-search-query/latest'   # эмбеддинги запросов (поиск)

# ── Endpoints ─────────────────────────────────────────────────────────────────
_CHAT_URL  = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
_EMBED_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding'

# ── DB schema (fallback для load_keys) ───────────────────────────────────────
_SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')


# ─────────────────────────────────────────────────────────────────────────────
# load_keys() — получить api_key + folder_id
# Сначала из env, потом из settings в БД
# ─────────────────────────────────────────────────────────────────────────────
def load_keys(conn=None) -> tuple[str, str]:
    """
    Возвращает (api_key, folder_id).
    1. Пробует AISTUDIO_API_KEY + YANDEX_FOLDER_ID из os.environ
    2. Если нет — читает yandex_api_key + yandex_folder_id из БД settings
    """
    api_key   = os.environ.get('AISTUDIO_API_KEY') or os.environ.get('YANDEX_API_KEY', '')
    folder_id = os.environ.get('YANDEX_FOLDER_ID', '')

    if api_key and folder_id:
        return api_key, folder_id

    if conn is None:
        try:
            import psycopg2
            from psycopg2.extras import RealDictCursor
            conn = psycopg2.connect(os.environ['DATABASE_URL'])
            _close = True
        except Exception:
            return api_key, folder_id
    else:
        _close = False

    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT yandex_api_key, yandex_folder_id FROM {_SCHEMA}.settings ORDER BY id ASC LIMIT 1"
            )
            row = cur.fetchone()
            if row:
                api_key   = api_key   or (row[0] if row[0] else '')
                folder_id = folder_id or (row[1] if row[1] else '')
    except Exception:
        pass
    finally:
        if _close:
            try:
                conn.close()
            except Exception:
                pass

    return api_key, folder_id


# ─────────────────────────────────────────────────────────────────────────────
# _headers() — общие заголовки для запросов к Яндекс AI
# ─────────────────────────────────────────────────────────────────────────────
def _headers(api_key: str, folder_id: str) -> dict:
    h = {
        'Content-Type': 'application/json',
        'Authorization': f'Api-Key {api_key}',
    }
    if folder_id:
        h['x-folder-id'] = folder_id
    return h


# ─────────────────────────────────────────────────────────────────────────────
# chat() — генерация текста через YandexGPT
# ─────────────────────────────────────────────────────────────────────────────
def chat(
    messages: list[dict],
    api_key: str,
    folder_id: str,
    *,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 2000,
    timeout: int = 25,
) -> str:
    """
    Отправляет список сообщений в YandexGPT, возвращает текст ответа.

    messages — [{'role': 'system'|'user'|'assistant', 'text': '...'}]
    model    — если None, используется CHAT_MODEL
    """
    mdl = model or CHAT_MODEL
    model_uri = f'gpt://{folder_id}/{mdl}' if folder_id else mdl

    payload = {
        'modelUri': model_uri,
        'completionOptions': {
            'stream': False,
            'temperature': temperature,
            'maxTokens': str(max_tokens),
        },
        'messages': messages,
    }

    req = urllib.request.Request(
        _CHAT_URL,
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers=_headers(api_key, folder_id),
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        result = json.loads(resp.read().decode())

    return (
        result.get('result', {})
              .get('alternatives', [{}])[0]
              .get('message', {})
              .get('text', '')
    )


# ─────────────────────────────────────────────────────────────────────────────
# chat_simple() — удобная обёртка: system + user → строка ответа
# ─────────────────────────────────────────────────────────────────────────────
def chat_simple(
    system: str,
    user: str,
    api_key: str,
    folder_id: str,
    *,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 2000,
    timeout: int = 25,
) -> str:
    """
    Упрощённый вызов GPT: system prompt + user message → строка ответа.
    """
    messages = []
    if system:
        messages.append({'role': 'system', 'text': system})
    messages.append({'role': 'user', 'text': user})
    return chat(messages, api_key, folder_id,
                model=model, temperature=temperature,
                max_tokens=max_tokens, timeout=timeout)


# ─────────────────────────────────────────────────────────────────────────────
# embed() — векторизация текста для семантического поиска
# ─────────────────────────────────────────────────────────────────────────────
def embed(
    text: str,
    api_key: str,
    folder_id: str,
    *,
    model: str | None = None,
    timeout: int = 15,
) -> list[float]:
    """
    Возвращает вектор (список float) для переданного текста.
    model — EMBED_DOC_MODEL для индексации, EMBED_QRY_MODEL для поиска.
    """
    mdl = model or EMBED_DOC_MODEL
    model_uri = f'emb://{folder_id}/{mdl}' if folder_id else mdl

    payload = {'modelUri': model_uri, 'text': text[:8000]}

    req = urllib.request.Request(
        _EMBED_URL,
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers=_headers(api_key, folder_id),
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode()).get('embedding', [])
