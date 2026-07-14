#!/usr/bin/env node
/**
 * Статическая генерация HTML для поисковых ботов.
 *
 * КОНТЕКСТ: package.json и vite.config.ts на этой платформе доступны только на
 * чтение — подключить этот скрипт как шаг сборки (postbuild/closeBundle)
 * невозможно. Поэтому результат сохраняется не в dist/ (эфемерная, пересоздаётся
 * при каждой сборке), а в public/ — эту папку Vite копирует в dist/ ВСЕГДА,
 * без какой-либо конфигурации, это встроенное поведение фреймворка.
 *
 * ВАЖНО про JS-бандл: backend prerender-функция отдаёт HTML с dev-путём
 * `/src/main.tsx`, а реальная сборка использует хэшированные файлы вида
 * `/assets/index-XXXX.js` — хэш меняется при каждой пересборке проекта.
 * Так как мы не можем перезапускать этот скрипт автоматически после каждой
 * сборки (нет доступа к build-хукам), результат НЕ должен зависеть от
 * конкретного хэша, иначе после следующей правки кода все сгенерированные
 * страницы перестанут загружать JS для живых посетителей.
 *
 * Решение: статическая страница не содержит хэш вообще. Вместо этого:
 * 1. Точная SEO-разметка (title, description, canonical, OG, JSON-LD, текст
 *    для ботов внутри #root) — от backend prerender-функции, как обычно.
 * 2. Маленький bootstrap-скрипт в конце body — выполняется только в реальном
 *    браузере (боты не исполняют JS). Он идёт за живым /index.html (всегда
 *    свежий после любой сборки), достаёт оттуда актуальные <script>/<link>
 *    на /assets/*, и вставляет их в документ — React запускается с текущим
 *    хэшем, каким бы он ни был на момент захода.
 * 3. Боты видят статический текст и правильный canonical сразу, без JS.
 *    Живые пользователи получают полностью рабочий SPA с небольшой (десятки мс)
 *    задержкой на один доп. fetch — не хуже текущего поведения по факту,
 *    т.к. sitemap/каталог и так грузят данные асинхронно.
 *
 * Запуск (не требует предварительного vite build — не зависит от dist/):
 *   node scripts/prerender-static.js
 *   node scripts/prerender-static.js --concurrency=5 --dry-run
 *
 * Т.к. автоматического перезапуска после сборки нет, периодически (например
 * при следующих правках сайта) стоит запускать скрипт заново, чтобы обновить
 * title/description/цены на пререндеренных страницах — но даже без обновлений
 * canonical и структура остаются корректными.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

// ── Конфиг ────────────────────────────────────────────────────────────────────

const PRERENDER_URL = 'https://functions.poehali.dev/1111ba70-a6c3-4c58-b8b0-2519af14b7ff';
// Прямой вызов backend-функции — /sitemap.xml на самом домене не отдаёт статику
// (нет физического файла), поэтому берём XML напрямую у генератора.
const SITEMAP_URL   = 'https://functions.poehali.dev/7db3cce2-3ae0-4bbb-bece-5c6076691344?action=sitemap_xml';

const args = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '4');
const TIMEOUT_MS  = 15_000;

// Пути которые генерируем всегда (даже если нет в sitemap). Главную (/) не
// трогаем — она уже покрыта штатным index.html с верным содержимым.
const STATIC_ALWAYS = ['/catalog', '/news', '/map', '/network-tenants', '/leads'];

// Пути которые пропускаем (нет смысла — требуют авторизации или это SPA-утилиты)
const SKIP_PATHS = new Set(['/', '/favorites', '/compare', '/declined', '/login']);

// Bootstrap-скрипт: подтягивает актуальные assets с живого /index.html.
// Выполняется только в браузере (боты HTML не исполняют).
const BOOTSTRAP_SCRIPT = `
<script>
(function(){
  fetch('/index.html', {cache: 'no-store'}).then(function(r){ return r.text(); }).then(function(html){
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var links = doc.querySelectorAll('link[rel="stylesheet"][href^="/assets/"]');
    var scripts = doc.querySelectorAll('script[type="module"][src^="/assets/"]');
    links.forEach(function(l){
      if (!document.querySelector('link[href="' + l.getAttribute('href') + '"]')) {
        var nl = document.createElement('link');
        nl.rel = 'stylesheet'; nl.crossOrigin = 'anonymous';
        nl.href = l.getAttribute('href');
        document.head.appendChild(nl);
      }
    });
    scripts.forEach(function(s){
      var ns = document.createElement('script');
      ns.type = 'module'; ns.crossOrigin = 'anonymous';
      ns.src = s.getAttribute('src');
      document.body.appendChild(ns);
    });
  }).catch(function(){
    // Фолбэк — если fetch не удался, уводим на SPA-роутинг через полный reload
    window.location.reload();
  });
})();
</script>`;

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

/**
 * Проверяет, что ответ — реальный HTML от prerender-функции, а не служебная
 * ошибка инфраструктуры (503 от nginx при rate limit, 502 от edge и т.п.).
 * Такие ошибки тоже содержат </html>, поэтому одной проверки закрывающего
 * тега недостаточно — обязательно должен быть <div id="root">.
 */
function isValidPrerenderHtml(html) {
  return html.includes('</html>') && html.includes('<div id="root">');
}

/** Запрашивает prerender для одного пути с повторными попытками при сбое инфраструктуры */
async function fetchPrerenderHtml(pagePath, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = `${PRERENDER_URL}/?path=${encodeURIComponent(pagePath)}`;
      const res = await fetchWithTimeout(url);
      const html = await res.text();
      if (!isValidPrerenderHtml(html)) {
        throw new Error(`невалидный HTML (HTTP ${res.status}, ${html.length} байт): ${html.slice(0, 120).replace(/\n/g, ' ')}`);
      }
      return { html, status: res.status };
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw new Error(`${pagePath} — ${lastErr.message} (после ${retries} попыток)`);
}

/** Достаёт тег по regex, возвращает '' если не найден */
function extract(html, re) {
  const m = html.match(re);
  return m ? m[0] : '';
}

/**
 * Собирает финальный самодостаточный статический HTML: все SEO-теги и текст
 * из ответа backend prerender-функции + bootstrap-скрипт для реальных браузеров.
 * НЕ зависит от текущего хэша assets — устойчив к будущим пересборкам.
 */
function buildStaticHtml(prerenderHtml) {
  // Берём prerender-ответ backend как основу (там уже все нужные head-теги),
  // но выкидываем dev-путь на /src/main.tsx и три системных script-тега —
  // их подставит bootstrap с актуальными путями и хэшами.
  let html = prerenderHtml
    .replace(/<script type="module" src="\/src\/main\.tsx"><\/script>/, BOOTSTRAP_SCRIPT);
  return html;
}

/** Сохраняет HTML в public/<path>/index.html */
function saveHtml(pagePath, html) {
  const rel = path.join(pagePath.slice(1), 'index.html');
  const dest = path.join(PUBLIC, rel);
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
  log(`Старт статической генерации в public/ (concurrency=${CONCURRENCY}${DRY_RUN ? ', dry-run' : ''})`);

  // 1. Собираем пути
  let paths = [...STATIC_ALWAYS];

  try {
    const sitemapUrls = await fetchSitemapUrls();
    const sitemapPaths = sitemapUrls
      .map(toPath)
      .filter(p => p && !SKIP_PATHS.has(p));
    log(`Sitemap: ${sitemapPaths.length} URL`);
    for (const p of sitemapPaths) {
      if (!paths.includes(p)) paths.push(p);
    }
  } catch (e) {
    warn(`Не удалось загрузить sitemap (${e.message}), работаем только со статическими путями`);
  }

  paths = paths.filter(p => !SKIP_PATHS.has(p));
  log(`Всего путей для генерации: ${paths.length}`);
  console.log('');

  // 2. Генерируем параллельно
  let done = 0, errors = 0, skipped404 = 0;
  const startTs = Date.now();

  const tasks = paths.map(pagePath => async () => {
    try {
      const { html: prerenderHtml, status } = await fetchPrerenderHtml(pagePath);
      if (status === 404) {
        skipped404++;
        warn(`404 у backend для ${pagePath} — пропускаю (SPA fallback отдаст 404.html)`);
        return;
      }
      const finalHtml = buildStaticHtml(prerenderHtml);
      const dest = saveHtml(pagePath, finalHtml);
      done++;
      const rel = path.relative(ROOT, dest);
      ok(`${pagePath} → ${rel} (${(finalHtml.length / 1024).toFixed(1)} КБ)`);
    } catch (e) {
      errors++;
      warn(`ОШИБКА ${pagePath}: ${e.message}`);
    }
  });

  await pLimit(tasks, CONCURRENCY);

  // 3. Итог
  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log('');
  log(`─────────────────────────────────────`);
  log(`Готово за ${elapsed}с: ✓ ${done} страниц, ⊘ ${skipped404} 404, ✗ ${errors} ошибок`);
  if (DRY_RUN) log('(dry-run — файлы НЕ записаны)');
  console.log('');

  if (errors > 0) process.exit(1);
}

main().catch(e => {
  console.error(`[prerender] Критическая ошибка: ${e.message}`);
  process.exit(1);
});