"""
ai_client.py — единый AI-модуль проекта (шаблон).

Копируется в каждую бэкенд-функцию при деплое.
Для смены модели — меняем константу ЗДЕСЬ, затем копируем файл во все функции.

Поддерживает:
  - chat()              — генерация текста (YandexGPT), список сообщений
  - chat_simple()       — удобная обёртка system+user → строка
  - chat_with_history() — чат с историей диалога (для ai-chat / агентов)
  - embed()             — векторизация текста (для семантического поиска)
  - search()            — поиск в интернете через Yandex Search API
  - load_keys()         — загрузка ключей из env или БД (fallback)

Совместимость: Python 3.11, только stdlib + psycopg2 (без openai SDK).
"""

import json
import os
import urllib.request
import urllib.error

# ── Модели ────────────────────────────────────────────────────────────────────
# Меняем здесь — обновляется во всех функциях после копирования файла

CHAT_MODEL        = 'yandexgpt-5-pro/latest'     # основная — генерация, анализ
CHAT_MODEL_FAST   = 'yandexgpt-5-lite/latest'    # быстрая/дешёвая — теги, короткие задачи
CHAT_MODEL_PRO    = 'yandexgpt-5-1-pro/latest'   # флагман — сложный анализ, минимум галлюцинаций
VISION_MODEL      = 'qwen2-vl-7b-instruct'        # анализ изображений
EMBED_DOC_MODEL   = 'text-search-doc/latest'      # эмбеддинги документов (индексация)
EMBED_QRY_MODEL   = 'text-search-query/latest'    # эмбеддинги запросов (поиск)

# ── Endpoints ─────────────────────────────────────────────────────────────────
_CHAT_URL  = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
_EMBED_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding'
_SEARCH_URL = 'https://searchapi.yandex.net/v1/newsline'

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
def _headers(api_key: str, folder_id: str = '') -> dict:
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
    ).strip()


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
# chat_with_history() — чат с историей диалога (для агентов и ai-chat)
# ─────────────────────────────────────────────────────────────────────────────
def chat_with_history(
    system: str,
    user: str,
    api_key: str,
    folder_id: str,
    *,
    history: list[dict] | None = None,
    model: str | None = None,
    temperature: float = 0.5,
    max_tokens: int = 600,
    timeout: int = 25,
    max_history: int = 30,
) -> dict:
    """
    Чат с поддержкой истории диалога.

    history — список предыдущих сообщений вида:
              [{'role': 'user'|'assistant'|'ai', 'text': '...'}]
              Роль 'ai' автоматически преобразуется в 'assistant'.

    Возвращает: {'text': str, 'tokens': int}
    """
    messages = []
    if system:
        messages.append({'role': 'system', 'text': system})

    if isinstance(history, list):
        for h in history[-max_history:]:
            if not isinstance(h, dict):
                continue
            role = h.get('role', '')
            text = (h.get('text') or '').strip()
            if not text:
                continue
            if role == 'ai':
                role = 'assistant'
            if role not in ('user', 'assistant'):
                continue
            messages.append({'role': role, 'text': text[:4000]})

    if user:
        messages.append({'role': 'user', 'text': user})

    mdl = model or CHAT_MODEL
    model_uri = f'gpt://{folder_id}/{mdl}' if folder_id else mdl

    payload = {
        'modelUri': model_uri,
        'completionOptions': {
            'stream': False,
            'temperature': float(temperature),
            'maxTokens': str(int(max_tokens)),
        },
        'messages': messages,
    }

    hdrs = _headers(api_key, folder_id)
    req = urllib.request.Request(
        _CHAT_URL,
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers=hdrs,
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    result = data.get('result') or {}
    alternatives = result.get('alternatives') or []
    text = ''
    if alternatives:
        text = ((alternatives[0].get('message') or {}).get('text') or '').strip()
    usage = result.get('usage') or {}
    return {'text': text, 'tokens': int(usage.get('totalTokens', 0))}


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


# ─────────────────────────────────────────────────────────────────────────────
# search() — поиск в интернете через Yandex Search API + GPT-резюме
# ─────────────────────────────────────────────────────────────────────────────
def search(
    query: str,
    search_api_key: str | None = None,
    *,
    max_results: int = 5,
) -> list[dict]:
    """
    Поиск в интернете через Yandex XML Search API.
    Возвращает список {'title': str, 'url': str, 'snippet': str}.

    search_api_key — если None, берётся YANDEX_SEARCH_API_KEY из env.
    """
    key = search_api_key or os.environ.get('YANDEX_SEARCH_API_KEY', '')
    user = os.environ.get('YANDEX_SEARCH_USER', '')
    if not key or not user:
        return []

    import urllib.parse
    params = urllib.parse.urlencode({
        'query': query,
        'l10n': 'ru',
        'sortby': 'rlv',
        'filter': 'moderate',
        'maxpassages': 2,
        'groupby': f'attr=d.mode=flat.groups-on-page={max_results}.docs-in-group=1',
        'user': user,
        'key': key,
    })
    url = f'https://yandex.ru/search/xml?{params}'

    try:
        import xml.etree.ElementTree as ET
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            root = ET.fromstring(resp.read().decode('utf-8'))

        results = []
        for doc in root.findall('.//doc')[:max_results]:
            title   = (doc.findtext('title') or '').strip()
            href    = (doc.findtext('url') or '').strip()
            snippet = ' '.join(
                p.text or '' for p in doc.findall('.//passage')
            ).strip()
            if href:
                results.append({'title': title, 'url': href, 'snippet': snippet})
        return results
    except Exception:
        return []


def search_with_summary(
    query: str,
    api_key: str,
    folder_id: str,
    *,
    search_api_key: str | None = None,
    system: str = 'Ты — помощник. Отвечай кратко и по делу на русском языке.',
    max_results: int = 5,
    max_tokens: int = 600,
    timeout: int = 25,
) -> dict:
    """
    Поиск в интернете + GPT-резюме результатов.
    Возвращает: {'answer': str, 'sources': [{'title', 'url', 'snippet'}]}
    """
    sources = search(query, search_api_key, max_results=max_results)

    if not sources:
        return {'answer': 'Информация в открытых источниках не найдена.', 'sources': []}

    snippets = '\n\n'.join(
        f"{i+1}. {s['title']}\n{s['snippet']}" for i, s in enumerate(sources)
    )
    user_prompt = f"Вопрос: {query}\n\nНайденные данные:\n{snippets}\n\nДай краткий ответ."

    answer = chat_simple(system, user_prompt, api_key, folder_id,
                         max_tokens=max_tokens, timeout=timeout)
    return {'answer': answer, 'sources': sources}
