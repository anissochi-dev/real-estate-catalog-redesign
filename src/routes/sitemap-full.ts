import { createFileRoute } from '@tanstack/react-router';

// Полная карта сайта (объекты, новости, районы, заявки) — из существующей функции генерации.
// Адрес без «.xml»: запросы на *.xml хостинг ищет только среди готовых файлов
// и до сайта не пропускает (404). Указан в robots.txt и /sitemap_index.xml.
const SITEMAP_FN = 'https://functions.poehali.dev/7db3cce2-3ae0-4bbb-bece-5c6076691344?action=sitemap_xml';

export const Route = createFileRoute('/sitemap-full')({
  server: {
    handlers: {
      GET: async () => {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 8000);
        try {
          const r = await fetch(SITEMAP_FN, { signal: ac.signal });
          const xml = r.ok ? await r.text() : '';
          if (!xml.includes('<urlset')) return new Response('Sitemap temporarily unavailable', { status: 503 });
          return new Response(xml, {
            headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
          });
        } catch {
          return new Response('Sitemap temporarily unavailable', { status: 503 });
        } finally {
          clearTimeout(t);
        }
      },
    },
  },
});
