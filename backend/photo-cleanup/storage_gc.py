"""
Безопасная очистка хранилища.

Файл считается используемым, если его «основа» (имя без суффиксов _wm/_thumb/_medium
и без расширения) упоминается хоть где-то в базе: объекты, новости, партнёры, настройки,
документы, пользователи и т.д. Проверка не зависит от отметок при загрузке.

Ничейный файл сначала попадает в карантин (orphan_since). Удаляется, только если
пролежал в карантине QUARANTINE_DAYS и всё ещё нигде не используется.
Вместе с фото удаляется его копия для фидов (xml-feeds-photos/{основа}.jpg).
"""
import json
import os
import re

SCHEMA = 't_p71821556_real_estate_catalog_'
BUCKET = 'files'
QUARANTINE_DAYS = 7
MIN_AGE_HOURS = 24
DELETE_LIMIT = 300
MIN_USED_BASES = 100
QUERY_BATCH = 40
MANAGED_FOLDERS = ('photos', 'logos', 'watermarks', 'documents')

# Служебные таблицы самого учёта — в них упоминания не считаются использованием.
SKIP_TABLES = ('s3_photo_refs', 's3_orphans_log', 'print_files')
TEXT_TYPES = ('text', 'character varying', 'jsonb', 'json', 'ARRAY')

_SUFFIX_RE = re.compile(r'(_wm|_thumb|_medium)?\.[A-Za-z0-9]+$')
_TOKEN_RE = re.compile(r'bucket/(?:photos|logos|watermarks|documents|xml-feeds-photos)/([A-Za-z0-9_\-]+?)(?:_wm|_thumb|_medium)?\.[A-Za-z0-9]+')


def base_of(s3_key: str) -> str:
    name = s3_key.rsplit('/', 1)[-1]
    return _SUFFIX_RE.sub('', name)


def collect_used_bases(cur) -> set:
    """Собирает «основы» всех файлов, которые упоминаются в любой текстовой колонке базы."""
    types_sql = ', '.join(f"'{x}'" for x in TEXT_TYPES)
    skip_sql = ', '.join(f"'{x}'" for x in SKIP_TABLES)
    cur.execute(
        "SELECT c.table_name, c.column_name FROM information_schema.columns c "
        "JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name "
        f"WHERE c.table_schema = '{SCHEMA}' AND t.table_type = 'BASE TABLE' "
        f"AND c.data_type IN ({types_sql}) AND c.table_name NOT IN ({skip_sql})"
    )
    by_table = {}
    for table, col in cur.fetchall():
        if not re.fullmatch(r'[a-z0-9_]+', table) or not re.fullmatch(r'[A-Za-z0-9_]+', col):
            continue
        by_table.setdefault(table, []).append(col)
    parts = []
    for table, cols in by_table.items():
        for c in cols:
            parts.append(f"SELECT {c}::text AS v FROM {SCHEMA}.{table} WHERE {c}::text LIKE '%bucket/%'")
    used = set()
    # Достаём полное имя файла (жадно), а «основу» вычисляем в Python — так нет
    # разночтений с ленивыми квантификаторами в регулярках PostgreSQL.
    pattern = r'bucket/(?:photos|logos|watermarks|documents|xml-feeds-photos)/([A-Za-z0-9_-]+[.][A-Za-z0-9]+)'
    for i in range(0, len(parts), QUERY_BATCH):
        union = ' UNION ALL '.join(parts[i:i + QUERY_BATCH])
        cur.execute(
            f"SELECT DISTINCT (regexp_matches(v, '{pattern}', 'g'))[1] FROM ({union}) s"
        )
        used.update(base_of(r[0]) for r in cur.fetchall() if r[0])
    return used


def scan(conn) -> dict:
    """Пересчитывает учёт: используемые файлы — прикреплены, ничейные — в карантин.
    Возвращает статистику и список ключей, готовых к удалению."""
    folders_sql = ', '.join(f"'{f}'" for f in MANAGED_FOLDERS)
    with conn.cursor() as cur:
        used = collect_used_bases(cur)
        # Защита: если поиск ничего не нашёл (ошибка доступа, пустой ответ) — ничего не трогаем.
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.listings WHERE COALESCE(images::text, '') LIKE '%bucket/%'")
        listings_with_photos = cur.fetchone()[0]
        if listings_with_photos and len(used) < MIN_USED_BASES:
            raise RuntimeError(f'Найдено подозрительно мало используемых файлов ({len(used)}) — очистка остановлена')
        cur.execute(
            f"SELECT id, s3_key, is_orphan, orphan_since, "
            f"uploaded_at < NOW() - INTERVAL '{MIN_AGE_HOURS} hours' AS old_enough, "
            f"orphan_since IS NOT NULL AND orphan_since < NOW() - INTERVAL '{QUARANTINE_DAYS} days' AS quarantine_over, "
            f"keep_forever "
            f"FROM {SCHEMA}.s3_photo_refs WHERE split_part(s3_key, '/', 1) IN ({folders_sql})"
        )
        rows = cur.fetchall()

    to_attach, to_quarantine, to_release, ready = [], [], [], []
    in_quarantine = used_count = fresh_count = 0
    for rid, key, is_orphan, orphan_since, old_enough, quarantine_over, keep_forever in rows:
        if keep_forever or base_of(key) in used:
            used_count += 1
            if is_orphan:
                to_attach.append(rid)
            if orphan_since is not None:
                to_release.append(rid)
            continue
        if not old_enough:
            fresh_count += 1
            continue
        if orphan_since is None:
            to_quarantine.append(rid)
            in_quarantine += 1
        elif quarantine_over:
            ready.append((rid, key))
        else:
            in_quarantine += 1

    with conn.cursor() as cur:
        for chunk_start in range(0, len(to_attach), 1000):
            ids = ', '.join(str(i) for i in to_attach[chunk_start:chunk_start + 1000])
            cur.execute(
                f"UPDATE {SCHEMA}.s3_photo_refs SET is_orphan = FALSE, "
                f"attached_at = COALESCE(attached_at, NOW()) WHERE id IN ({ids})"
            )
        for chunk_start in range(0, len(to_release), 1000):
            ids = ', '.join(str(i) for i in to_release[chunk_start:chunk_start + 1000])
            cur.execute(f"UPDATE {SCHEMA}.s3_photo_refs SET orphan_since = NULL WHERE id IN ({ids})")
        for chunk_start in range(0, len(to_quarantine), 1000):
            ids = ', '.join(str(i) for i in to_quarantine[chunk_start:chunk_start + 1000])
            cur.execute(
                f"UPDATE {SCHEMA}.s3_photo_refs SET is_orphan = TRUE, orphan_since = NOW() "
                f"WHERE id IN ({ids})"
            )
    conn.commit()

    return {
        'total_tracked': len(rows),
        'used': used_count,
        'fresh': fresh_count,
        'newly_attached': len(to_attach),
        'newly_quarantined': len(to_quarantine),
        'in_quarantine': in_quarantine,
        'ready_to_delete': ready,
    }


def delete_ready(conn, s3_client, ready: list, limit: int = DELETE_LIMIT) -> dict:
    """Удаляет файлы, отлежавшие карантин, вместе с копиями для фидов."""
    batch = ready[:limit]
    removed_ids, removed_keys, failed = [], [], []
    feed_bases = set()
    for rid, key in batch:
        try:
            s3_client.delete_object(Bucket=BUCKET, Key=key)
            removed_ids.append(rid)
            removed_keys.append(key)
            if key.startswith('photos/'):
                feed_bases.add(base_of(key))
        except Exception as e:
            failed.append({'key': key, 'error': str(e)[:200]})
    for b in feed_bases:
        try:
            s3_client.delete_object(Bucket=BUCKET, Key=f'xml-feeds-photos/{b}.jpg')
        except Exception:
            pass
    if removed_ids:
        with conn.cursor() as cur:
            ids = ', '.join(str(i) for i in removed_ids)
            cur.execute(f"DELETE FROM {SCHEMA}.s3_photo_refs WHERE id IN ({ids})")
        conn.commit()
    return {
        'removed': len(removed_ids),
        'removed_keys': removed_keys,
        'failed': failed,
        'left': max(0, len(ready) - len(batch)),
    }


def save_log(conn, stats: dict, removed: int, removed_keys: list, status: str, error=None):
    ready_keys = [k for _, k in stats['ready_to_delete']]
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO {SCHEMA}.s3_orphans_log "
            "(total_s3, used_s3, orphan_s3, removed_s3, orphan_size_mb, removed_size_mb, "
            "orphan_keys, removed_keys, status, error_msg, quarantine_s3) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                stats['total_tracked'], stats['used'], len(ready_keys), removed,
                round(len(ready_keys) * 0.15, 3), round(removed * 0.15, 3),
                json.dumps(ready_keys[:500]), json.dumps(removed_keys[:500]),
                status, error, stats['in_quarantine'],
            )
        )
    conn.commit()
