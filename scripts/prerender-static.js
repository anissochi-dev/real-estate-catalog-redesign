#!/usr/bin/env node
/**
 * Статическая генерация HTML для поисковых ботов.
 *
 * Алгоритм:
 * 1. Читает sitemap.xml из живого сайта (или локального dist/sitemap.xml)
 * 2. Для каждого URL вызывает prerender-функцию с параметром ?path=
 * 3. Сохраняет HTML в dist/<path>/index.html
 *
 * Запуск:
 *   node scripts/prerender-static.js
 *   node scripts/prerender-static.js --concurrency=5 --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// ── Конфиг ────────────────────────────────────────────────────────────────────

const PRERENDER_URL = 'https://functions.poehali.dev/1111ba70-a6c3-4c58-b8b0-2519af14b7ff';
const SITEMAP_URL   = 'https://bmn.su/sitemap.xml';
const SITE_ORIGIN   = 'https://bmn.su';

const args = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '4');
const TIMEOUT_MS  = 15_000;

// Пути которые генерируем всегда (даже если нет в sitemap)
const STATIC_ALWAYS = ['/', '/catalog', '/news', '/map', '/network-tenants', '/leads'];

// Пути которые пропускаем (нет смысла — требуют авторизации или это SPA-утилиты)
const SKIP_PATHS = new Set(['/favorites', '/compare', '/declined', '/login']);

// ── Утилиты ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[prerender] ${msg}`); }
function warn(msg) { console.warn(`[prerender] ⚠  ${msg}`); }
function ok(msg)  { console.log(`[prerender] ✓  ${msg}`); }

async function fetchWithTimeout(url, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Читает sitemap.xml и извлекает все <loc> */
async function fetchSitemapUrls() {
  log(`Читаю sitemap: ${SITEMAP_URL}`);
  const res = await fetchWithTimeout(SITEMAP_URL);
  if (!res.ok) throw new Error(`sitemap вернул HTTP ${res.status}`);
  const xml = await res.text();
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map(m => m[1].trim());
}

/** Конвертирует абсолютный URL в pathname */
function toPath(absUrl) {
  try {
    return new URL(absUrl).pathname.replace(/\/$/, '') || '/';
  } catch {
    return null;
  }
}

/** Запрашивает prerender для одного пути и возвращает HTML */
async function prerenderPath(pagePath) {
  const url = `${PRERENDER_URL}/?path=${encodeURIComponent(pagePath)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} для ${pagePath}`);
  }
  const html = await res.text();
  if (!html.includes('</html>')) {
    throw new Error(`Неполный HTML для ${pagePath} (${html.length} байт)`);
  }
  return { html, status: res.status };
}

/** Сохраняет HTML в dist/<path>/index.html */
function saveHtml(pagePath, html) {
  // / → dist/index.html
  // /object/slug-123 → dist/object/slug-123/index.html
  const rel = pagePath === '/' ? 'index.html' : path.join(pagePath.slice(1), 'index.html');
  const dest = path.join(DIST, rel);
  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html, 'utf8');
  }
  return dest;
}

/** Параллельная очередь с ограничением concurrency */
async function pLimit(tasks, limit) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        results[i] = await tasks[i]();
      } catch (e) {
        results[i] = { error: e };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── Основная логика ───────────────────────────────────────────────────────────

async function main() {
  console.log('');
  log(`Старт статической генерации (concurrency=${CONCURRENCY}${DRY_RUN ? ', dry-run' : ''})`);

  // 1. Собираем пути
  let paths = [...STATIC_ALWAYS];

  try {
    const sitemapUrls = await fetchSitemapUrls();
    const sitemapPaths = sitemapUrls
      .map(toPath)
      .filter(p => p && !SKIP_PATHS.has(p));
    log(`Sitemap: ${sitemapPaths.length} URL`);
    // Добавляем пути из sitemap (без дублей)
    for (const p of sitemapPaths) {
      if (!paths.includes(p)) paths.push(p);
    }
  } catch (e) {
    warn(`Не удалось загрузить sitemap (${e.message}), работаем только со статическими путями`);
  }

  // Убираем пути из чёрного списка
  paths = paths.filter(p => !SKIP_PATHS.has(p));
  log(`Всего путей для генерации: ${paths.length}`);
  console.log('');

  // 2. Проверяем dist/
  if (!DRY_RUN && !fs.existsSync(DIST)) {
    throw new Error(`Папка dist/ не найдена. Сначала запусти: bun run build`);
  }

  // 3. Генерируем параллельно
  let done = 0, errors = 0;
  const startTs = Date.now();

  const tasks = paths.map(pagePath => async () => {
    try {
      const { html, status } = await prerenderPath(pagePath);
      const dest = saveHtml(pagePath, html);
      done++;
      const rel = path.relative(ROOT, dest);
      if (status === 404) {
        warn(`404 ${pagePath} → ${rel}`);
      } else {
        ok(`${pagePath} → ${rel} (${(html.length / 1024).toFixed(1)} КБ)`);
      }
    } catch (e) {
      errors++;
      warn(`ОШИБКА ${pagePath}: ${e.message}`);
    }
  });

  await pLimit(tasks, CONCURRENCY);

  // 4. Итог
  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log('');
  log(`─────────────────────────────────────`);
  log(`Готово за ${elapsed}с: ✓ ${done} страниц, ✗ ${errors} ошибок`);
  if (DRY_RUN) log('(dry-run — файлы НЕ записаны)');
  console.log('');

  if (errors > 0) process.exit(1);
}

main().catch(e => {
  console.error(`[prerender] Критическая ошибка: ${e.message}`);
  process.exit(1);
});
