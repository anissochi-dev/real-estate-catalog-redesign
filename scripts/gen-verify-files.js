/**
 * Скрипт генерации статических файлов верификации из БД.
 * Запускается перед сборкой (prebuild).
 * Читает verification_files из settings и создаёт файлы в public/.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

// Читаем DATABASE_URL из env или из .env файла
let dbUrl = process.env.DATABASE_URL || '';

if (!dbUrl) {
  // Пробуем найти в .env
  const envPath = join(__dirname, '..', '.env');
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, 'utf8');
    const match = env.match(/DATABASE_URL=(.+)/);
    if (match) dbUrl = match[1].trim();
  }
}

if (!dbUrl) {
  console.log('[gen-verify-files] DATABASE_URL не задан, пропускаем');
  process.exit(0);
}

// Динамический импорт pg (может не быть в devDependencies)
let client;
try {
  const { default: pg } = await import('pg');
  client = new pg.Client({ connectionString: dbUrl });
} catch {
  console.log('[gen-verify-files] pg не установлен, пропускаем');
  process.exit(0);
}

try {
  await client.connect();
  const res = await client.query(
    "SELECT verification_files FROM t_p71821556_real_estate_catalog_.settings ORDER BY id ASC LIMIT 1"
  );
  await client.end();

  const row = res.rows[0] || {};
  let files = row.verification_files || [];
  if (typeof files === 'string') {
    try { files = JSON.parse(files); } catch { files = []; }
  }

  if (!Array.isArray(files) || files.length === 0) {
    console.log('[gen-verify-files] нет файлов верификации');
    process.exit(0);
  }

  for (const vf of files) {
    const filename = (vf.filename || '').trim();
    const content = (vf.content || '').trim();
    if (!filename || !content) continue;
    const dest = join(PUBLIC_DIR, filename);
    writeFileSync(dest, content, 'utf8');
    console.log(`[gen-verify-files] создан: public/${filename}`);
  }
} catch (e) {
  console.log(`[gen-verify-files] ошибка: ${e.message}`);
  process.exit(0); // Не блокируем сборку
}
