import { useState } from 'react';
import { toast } from 'sonner';

const PRERENDER_URL = 'https://functions.poehali.dev/1111ba70-a6c3-4c58-b8b0-2519af14b7ff';

// Страницы которые всегда генерируем + пропускаем
const PRERENDER_STATIC = ['/', '/catalog', '/news', '/map', '/network-tenants', '/leads'];
const PRERENDER_SKIP = new Set(['/favorites', '/compare', '/declined', '/login']);

export function usePrerender() {
  const [prerenderRunning, setPrerenderRunning] = useState(false);
  const [prerenderLog, setPrerenderLog] = useState<string[]>([]);
  const [prerenderDone, setPrerenderDone] = useState(0);
  const [prerenderErrors, setPrerenderErrors] = useState(0);
  const [prerenderTotal, setPrerenderTotal] = useState(0);
  const [prerenderFinished, setPrerenderFinished] = useState(false);

  const runPrerender = async () => {
    setPrerenderRunning(true);
    setPrerenderLog([]);
    setPrerenderDone(0);
    setPrerenderErrors(0);
    setPrerenderFinished(false);

    // Собираем пути из sitemap — читаем напрямую через sitemap-функцию (минуя CORS)
    const paths: string[] = [...PRERENDER_STATIC];
    try {
      const sitemapFnUrl = 'https://functions.poehali.dev/7db3cce2-3ae0-4bbb-bece-5c6076691344?action=sitemap_xml';
      const r = await fetch(sitemapFnUrl);
      const xml = await r.text();
      const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
      const sitemapPaths = matches
        .map(m => { try { return new URL(m[1].trim()).pathname.replace(/\/$/, '') || '/'; } catch { return null; } })
        .filter((p): p is string => !!p && !PRERENDER_SKIP.has(p));
      for (const p of sitemapPaths) {
        if (!paths.includes(p)) paths.push(p);
      }
      setPrerenderLog(l => [...l, `Sitemap загружен: ${sitemapPaths.length} URL`]);
    } catch {
      setPrerenderLog(l => [...l, '⚠ Не удалось загрузить sitemap, работаем только со статическими страницами']);
    }

    setPrerenderTotal(paths.length);
    setPrerenderLog(l => [...l, `Всего страниц: ${paths.length}`]);

    // Обрабатываем батчами по 4 параллельно
    const BATCH = 4;
    let done = 0, errors = 0;

    for (let i = 0; i < paths.length; i += BATCH) {
      const batch = paths.slice(i, i + BATCH);
      await Promise.all(batch.map(async p => {
        try {
          const res = await fetch(`${PRERENDER_URL}/?path=${encodeURIComponent(p)}`, {
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const html = await res.text();
          if (!html.includes('</html>')) throw new Error('Неполный HTML');
          done++;
          setPrerenderDone(d => d + 1);
          setPrerenderLog(l => [...l, `✓ ${p} (${(html.length / 1024).toFixed(1)} КБ)`]);
        } catch (e) {
          errors++;
          setPrerenderErrors(er => er + 1);
          setPrerenderLog(l => [...l, `✗ ${p}: ${e instanceof Error ? e.message : 'ошибка'}`]);
        }
      }));
      // Небольшая пауза между батчами
      if (i + BATCH < paths.length) await new Promise(r => setTimeout(r, 300));
    }

    setPrerenderFinished(true);
    setPrerenderRunning(false);
    if (errors === 0) {
      toast.success(`Prerender завершён: ${done} страниц проверено, все ОК`);
    } else {
      toast.warning(`Prerender завершён: ${done} ОК, ${errors} ошибок`);
    }
  };

  return {
    prerenderRunning, prerenderLog, prerenderDone, prerenderErrors,
    prerenderTotal, prerenderFinished, runPrerender,
  };
}
