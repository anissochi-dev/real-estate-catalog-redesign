"""
Business: DevOps-ассистент ВБ — GitHub API интеграция: коммиты, issues, Actions, анализ ошибок.
Args: event с httpMethod (POST), body {action, params}, headers X-Auth-Token; context
Returns: JSON с результатом действия
"""

import json
import os
import urllib.request

import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')
GITHUB_API = 'https://api.github.com'


def _ok(data: dict) -> dict:
    return {'statusCode': 200, 'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, 'body': json.dumps(data, ensure_ascii=False, default=str)}


def _err(code: int, msg: str) -> dict:
    return {'statusCode': code, 'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _github(path: str, method: str = 'GET', data: dict = None) -> dict | list:
    """Запрос к GitHub API v3."""
    token = os.environ.get('GITHUB_TOKEN', '')
    if not token:
        return {'error': 'GITHUB_TOKEN не настроен в секретах проекта'}
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'BIZNEST-VB/1.0',
    }
    try:
        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(f'{GITHUB_API}{path}', data=body, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode())
            return {'error': err_body.get('message', str(e))}
        except Exception:
            return {'error': f'HTTP {e.code}: {e.reason}'}
    except Exception as e:
        return {'error': str(e)[:300]}


def _get_user(cur, token: str):
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s "
        f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{token}' AND s.expires_at > NOW() LIMIT 1"
    )
    return cur.fetchone()


def _first_repo() -> str:
    """Получить full_name первого репо пользователя."""
    data = _github('/user/repos?sort=updated&per_page=1')
    if isinstance(data, list) and data:
        return data[0].get('full_name', '')
    return ''


def _sanitize(s: str, max_len: int = 500) -> str:
    return str(s or '').replace("'", "''")[:max_len]


def handler(event: dict, context) -> dict:
    """DevOps-ассистент: GitHub коммиты, issues, Actions, анализ ошибок."""

    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if event.get('httpMethod') != 'POST':
        return _err(405, 'Method not allowed')

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    body = json.loads(event.get('body') or '{}')
    action = (body.get('action') or '').strip()
    params = body.get('params') or {}

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ('admin', 'director'):
                return _err(403, 'Только для администратора и директора')

            # ── Проверка подключения к GitHub ────────────────────────────
            if action == 'check_github':
                gh_user = _github('/user')
                if 'error' in (gh_user if isinstance(gh_user, dict) else {}):
                    return _ok({'ok': False, 'error': gh_user['error'],
                                'message': f'Токен не работает: {gh_user["error"]}'})

                repos_data = _github('/user/repos?sort=updated&per_page=10')
                repos = []
                if isinstance(repos_data, list):
                    repos = [
                        {
                            'name': r.get('name'),
                            'full_name': r.get('full_name'),
                            'private': r.get('private'),
                            'default_branch': r.get('default_branch'),
                            'updated_at': (r.get('updated_at') or '')[:10],
                            'open_issues': r.get('open_issues_count', 0),
                        }
                        for r in repos_data
                    ]
                gh_user = dict(gh_user)
                return _ok({
                    'ok': True,
                    'github_user': gh_user.get('login'),
                    'name': gh_user.get('name'),
                    'repos_count': len(repos),
                    'repos': repos,
                    'message': (
                        f'GitHub подключён. Аккаунт: {gh_user.get("login")} ({gh_user.get("name")}). '
                        f'Репозиториев: {len(repos)}.'
                    ),
                })

            # ── Последние коммиты ────────────────────────────────────────
            if action == 'get_commits':
                repo = (params.get('repo') or '').strip() or _first_repo()
                branch = (params.get('branch') or 'main').strip()
                limit = min(int(params.get('limit') or 10), 30)
                if not repo:
                    return _ok({'ok': False, 'error': 'Репозиторий не найден. Укажите repo (owner/repo)'})

                data = _github(f'/repos/{repo}/commits?sha={branch}&per_page={limit}')
                if isinstance(data, dict) and 'error' in data:
                    # Пробуем ветку master
                    if branch == 'main':
                        data = _github(f'/repos/{repo}/commits?sha=master&per_page={limit}')
                        branch = 'master'
                if not isinstance(data, list):
                    return _ok({'ok': False, 'error': str(data)[:200]})

                commits = [
                    {
                        'sha': c['sha'][:7],
                        'message': (c.get('commit', {}).get('message') or '')[:120].split('\n')[0],
                        'author': c.get('commit', {}).get('author', {}).get('name', '?'),
                        'date': (c.get('commit', {}).get('author', {}).get('date') or '')[:10],
                    }
                    for c in data
                ]
                return _ok({
                    'ok': True, 'repo': repo, 'branch': branch,
                    'commits': commits,
                    'message': (
                        f'Последние {len(commits)} коммитов — {repo} ({branch}):\n' +
                        '\n'.join(f"• {c['sha']} [{c['date']}] {c['author']}: {c['message']}" for c in commits)
                    ),
                })

            # ── Issues / баги ────────────────────────────────────────────
            if action == 'get_issues':
                repo = (params.get('repo') or '').strip() or _first_repo()
                state = (params.get('state') or 'open').strip()
                limit = min(int(params.get('limit') or 20), 50)
                if not repo:
                    return _ok({'ok': False, 'error': 'Репозиторий не найден'})

                data = _github(f'/repos/{repo}/issues?state={state}&per_page={limit}')
                if not isinstance(data, list):
                    return _ok({'ok': False, 'error': str(data)[:200]})

                issues = [
                    {
                        'number': i.get('number'),
                        'title': (i.get('title') or '')[:120],
                        'state': i.get('state'),
                        'labels': [lb.get('name') for lb in (i.get('labels') or [])],
                        'created_at': (i.get('created_at') or '')[:10],
                        'author': i.get('user', {}).get('login', '?'),
                    }
                    for i in data if not i.get('pull_request')
                ]
                return _ok({
                    'ok': True, 'repo': repo, 'state': state,
                    'count': len(issues), 'issues': issues,
                    'message': (
                        f'Issues ({state}) в {repo}: {len(issues)}\n' +
                        '\n'.join(
                            f"• #{i['number']} {i['title']} [{', '.join(i['labels']) or 'без метки'}]"
                            for i in issues[:15]
                        )
                    ),
                })

            # ── Создать issue ────────────────────────────────────────────
            if action == 'create_issue':
                repo = (params.get('repo') or '').strip() or _first_repo()
                title = (params.get('title') or '').strip()
                body_text = (params.get('body') or '').strip()
                labels = params.get('labels') or []
                if not repo or not title:
                    return _ok({'ok': False, 'error': 'Укажите repo и title'})

                payload = {'title': title}
                if body_text:
                    payload['body'] = body_text
                if labels:
                    payload['labels'] = labels if isinstance(labels, list) else [labels]

                data = _github(f'/repos/{repo}/issues', method='POST', data=payload)
                if isinstance(data, dict) and data.get('number'):
                    return _ok({
                        'ok': True,
                        'issue_number': data['number'],
                        'url': data.get('html_url', ''),
                        'message': f'Issue #{data["number"]} создан: «{title}»\nURL: {data.get("html_url", "")}',
                    })
                return _ok({'ok': False, 'error': f'Не удалось создать: {str(data)[:200]}'})

            # ── GitHub Actions workflows ─────────────────────────────────
            if action == 'get_workflows':
                repo = (params.get('repo') or '').strip() or _first_repo()
                if not repo:
                    return _ok({'ok': False, 'error': 'Репозиторий не найден'})

                data = _github(f'/repos/{repo}/actions/runs?per_page=15')
                if not isinstance(data, dict):
                    return _ok({'ok': False, 'error': str(data)[:200]})

                runs = [
                    {
                        'id': r.get('id'),
                        'name': (r.get('name') or '')[:60],
                        'status': r.get('status'),
                        'conclusion': r.get('conclusion'),
                        'branch': r.get('head_branch'),
                        'created_at': (r.get('created_at') or '')[:10],
                        'commit_msg': ((r.get('head_commit') or {}).get('message') or '')[:80].split('\n')[0],
                    }
                    for r in (data.get('workflow_runs') or [])
                ]
                failed = [r for r in runs if r.get('conclusion') == 'failure']
                return _ok({
                    'ok': True, 'repo': repo,
                    'total_runs': len(runs), 'failed_count': len(failed),
                    'runs': runs,
                    'message': (
                        f'GitHub Actions {repo}: запусков {len(runs)}, упавших: {len(failed)}.' +
                        (('\nПроблемные: ' + ', '.join(f'«{r["name"]}» ({r["branch"]})' for r in failed)) if failed else '\nВсе сборки успешны.')
                    ),
                })

            # ── Статистика репозитория ───────────────────────────────────
            if action == 'get_repo_stats':
                repo = (params.get('repo') or '').strip() or _first_repo()
                if not repo:
                    return _ok({'ok': False, 'error': 'Репозиторий не найден'})

                repo_info = _github(f'/repos/{repo}')
                langs = _github(f'/repos/{repo}/languages')
                contributors = _github(f'/repos/{repo}/contributors?per_page=5')
                releases = _github(f'/repos/{repo}/releases?per_page=1')

                last_release = None
                if isinstance(releases, list) and releases:
                    r = releases[0]
                    last_release = {
                        'tag': r.get('tag_name'),
                        'name': (r.get('name') or '')[:60],
                        'published': (r.get('published_at') or '')[:10],
                    }

                top_langs = list(langs.keys())[:5] if isinstance(langs, dict) else []
                contribs = [
                    {'login': c.get('login'), 'contributions': c.get('contributions')}
                    for c in (contributors if isinstance(contributors, list) else [])
                ]
                ri = repo_info if isinstance(repo_info, dict) else {}
                stats = {
                    'repo': repo,
                    'description': (ri.get('description') or '')[:200],
                    'stars': ri.get('stargazers_count', 0),
                    'forks': ri.get('forks_count', 0),
                    'open_issues': ri.get('open_issues_count', 0),
                    'default_branch': ri.get('default_branch', 'main'),
                    'languages': top_langs,
                    'contributors': contribs,
                    'last_release': last_release,
                    'created_at': (ri.get('created_at') or '')[:10],
                    'updated_at': (ri.get('updated_at') or '')[:10],
                }
                return _ok({
                    'ok': True, 'stats': stats,
                    'message': (
                        f'Репо {repo}: {", ".join(top_langs) or "?"}, '
                        f'issues: {stats["open_issues"]}, '
                        f'контрибьюторов: {len(contribs)}' +
                        (f', релиз: {last_release["tag"]} ({last_release["published"]})' if last_release else '')
                    ),
                })

            # ── Анализ ошибок из логов + GPT ────────────────────────────
            if action == 'analyze_errors':
                hours = int(params.get('hours') or 24)

                cur.execute(
                    f"SELECT action, response, created_at FROM {SCHEMA}.ai_logs "
                    f"WHERE created_at > NOW() - INTERVAL '{hours} hours' "
                    f"AND (LOWER(response) LIKE '%error%' OR LOWER(response) LIKE '%ошибка%') "
                    f"ORDER BY created_at DESC LIMIT 20"
                )
                error_rows = [dict(r) for r in cur.fetchall()]

                cur.execute(
                    f"SELECT module, action, status, error, created_at "
                    f"FROM {SCHEMA}.agent_tasks "
                    f"WHERE created_at > NOW() - INTERVAL '{hours} hours' AND status='failed' "
                    f"ORDER BY created_at DESC LIMIT 10"
                )
                failed_tasks = [dict(r) for r in cur.fetchall()]
                for t in failed_tasks:
                    if t.get('created_at'):
                        t['created_at'] = t['created_at'].strftime('%d.%m.%Y %H:%M')

                if not error_rows and not failed_tasks:
                    return _ok({
                        'ok': True, 'errors_count': 0, 'failed_tasks_count': 0,
                        'message': f'За последние {hours}ч ошибок не обнаружено.',
                    })

                # GPT-анализ если есть ошибки
                analysis = None
                try:
                    cur.execute(
                        f"SELECT value FROM {SCHEMA}.ai_memory WHERE key='yandex_api_key' LIMIT 1"
                    )
                    key_row = cur.fetchone()
                    cur.execute(
                        f"SELECT value FROM {SCHEMA}.ai_memory WHERE key='yandex_folder_id' LIMIT 1"
                    )
                    folder_row = cur.fetchone()
                    api_key = (key_row or {}).get('value', '')
                    folder_id = (folder_row or {}).get('value', '')

                    if api_key and folder_id and error_rows:
                        err_sample = '\n'.join(
                            f"[{r.get('action')}] {(r.get('response') or '')[:200]}"
                            for r in error_rows[:10]
                        )
                        import urllib.request as _ur2
                        gpt_body = json.dumps({
                            'modelUri': f'gpt://{folder_id}/yandexgpt/rc',
                            'completionOptions': {'stream': False, 'temperature': 0.3, 'maxTokens': 600},
                            'messages': [
                                {'role': 'system', 'text': 'Ты DevOps-аналитик. Анализируй логи кратко и по делу.'},
                                {'role': 'user', 'text': (
                                    f'Проанализируй ошибки из логов системы:\n'
                                    f'1. Основные паттерны\n2. Что срочно\n3. Рекомендации\n\n{err_sample}'
                                )},
                            ],
                        }, ensure_ascii=False).encode()
                        gpt_req = urllib.request.Request(
                            'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
                            data=gpt_body,
                            headers={'Authorization': f'Api-Key {api_key}', 'Content-Type': 'application/json'},
                            method='POST',
                        )
                        with urllib.request.urlopen(gpt_req, timeout=20) as resp:
                            gpt_res = json.loads(resp.read().decode())
                            analysis = gpt_res.get('result', {}).get('alternatives', [{}])[0].get('message', {}).get('text', '')
                except Exception:
                    pass

                summary = f'Ошибок в логах за {hours}ч: {len(error_rows)}, упавших задач: {len(failed_tasks)}'
                cur.execute(
                    f"INSERT INTO {SCHEMA}.agent_reports (module, report_type, summary, severity) "
                    f"VALUES ('devops', 'error_analysis', '{_sanitize(summary)}', "
                    f"'{'critical' if len(error_rows) > 10 else 'warning'}')"
                )
                conn.commit()
                return _ok({
                    'ok': True,
                    'errors_count': len(error_rows),
                    'failed_tasks_count': len(failed_tasks),
                    'failed_tasks': failed_tasks,
                    'analysis': analysis,
                    'message': summary + (f'\n\nАнализ:\n{analysis}' if analysis else ''),
                })

            return _ok({'ok': False, 'error': f'Неизвестное действие: {action}'})

    finally:
        conn.close()
