import { useState } from 'react';
import Icon from '@/components/ui/icon';

interface PageCheck {
  path: string;
  status: number;
  title: string;
  description: string;
  h1: string;
  canonical: string;
  noindex: boolean;
  faq: boolean;
  schema: number;
  issues: string[];
}

interface FileCheck {
  label: string;
  path: string;
  status: number;
  note: string;
  ok: boolean;
}

const STATIC_PAGES = ['/', '/catalog', '/catalog/office', '/catalog/warehouse', '/news', '/leads', '/market-index'];

const text = (el: Element | null | undefined) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

function analyze(path: string, status: number, html: string): PageCheck {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = text(doc.querySelector('title'));
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const h1s = Array.from(doc.querySelectorAll('h1'));
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
  const robots = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
  const ld = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map(s => s.textContent || '');
  const faq = ld.some(j => j.includes('"FAQPage"'));
  const issues: string[] = [];
  if (status !== 200) issues.push(`Код ответа ${status}`);
  if (!title) issues.push('Нет title');
  else if (title.length > 70) issues.push(`Title ${title.length} знаков (видно ~70)`);
  if (!description) issues.push('Нет description');
  else if (description.length > 160) issues.push(`Description ${description.length} знаков`);
  if (h1s.length === 0) issues.push('Нет H1');
  if (h1s.length > 1) issues.push(`H1 на странице: ${h1s.length}`);
  if (!canonical) issues.push('Нет canonical');
  if (doc.querySelectorAll('title').length > 1) issues.push('Несколько title');
  if (path.startsWith('/object/') && !faq) issues.push('Нет FAQ');
  return {
    path, status, title, description, h1: text(h1s[0]), canonical,
    noindex: robots.includes('noindex'), faq, schema: ld.length, issues,
  };
}

/** Проверка «как видит Яндекс»: читает HTML страниц без выполнения скриптов — ровно то, что получает поисковик. */
export default function SeoLiveCheckCard({ siteUrl }: { siteUrl: string }) {
  const [running, setRunning] = useState(false);
  const [files, setFiles] = useState<FileCheck[]>([]);
  const [pages, setPages] = useState<PageCheck[]>([]);
  const [checkedAt, setCheckedAt] = useState('');
  const base = (siteUrl || 'https://bmn.su').replace(/\/$/, '');

  const run = async () => {
    setRunning(true);
    setPages([]);
    setFiles([]);
    const get = async (path: string) => {
      try {
        const r = await fetch(path, { cache: 'no-store', credentials: 'omit' });
        return { status: r.status, body: await r.text() };
      } catch {
        return { status: 0, body: '' };
      }
    };

    const [robots, full, small, index] = await Promise.all([
      get('/robots.txt'), get('/sitemap-full'), get('/sitemap.xml'), get('/sitemap_index.xml'),
    ]);
    const count = (xml: string, tag: string) => (xml.match(new RegExp(`<${tag}>`, 'g')) || []).length;
    const fullCount = count(full.body, 'loc');
    const sitemapLines = robots.body.split('\n').filter(l => l.toLowerCase().startsWith('sitemap:')).map(l => l.slice(8).trim());
    setFiles([
      {
        label: 'robots.txt', path: '/robots.txt', status: robots.status,
        ok: robots.status === 200 && robots.body.includes('Disallow: /admin') && sitemapLines.some(l => l.endsWith('/sitemap-full')),
        note: robots.body.includes('Disallow: /admin')
          ? `Служебные разделы закрыты. Карта: ${sitemapLines.join(', ') || 'не указана'}`
          : 'Отдаётся не наш robots — служебные разделы открыты',
      },
      {
        label: 'Полная карта сайта', path: '/sitemap-full', status: full.status,
        ok: full.status === 200 && fullCount > 50,
        note: full.status === 200 ? `${fullCount} страниц — объекты, новости, районы, заявки` : 'Не открывается',
      },
      {
        label: 'Список карт', path: '/sitemap_index.xml', status: index.status,
        ok: index.status === 200 && index.body.includes('/sitemap-full'),
        note: index.body.includes('/sitemap-full') ? 'Ведёт на полную карту' : 'Не ведёт на полную карту',
      },
      {
        label: 'sitemap.xml (сохранённая копия)', path: '/sitemap.xml', status: small.status,
        ok: small.status === 200,
        note: `${count(small.body, 'loc')} страниц — копия, сама не обновляется. В Вебмастер добавляйте полную карту`,
      },
    ]);

    const locs = Array.from(full.body.matchAll(/<loc>([^<]+)<\/loc>/g)).map(m => {
      try { return new URL(m[1]).pathname; } catch { return ''; }
    });
    const firstOf = (prefix: string) => locs.find(p => p.startsWith(prefix));
    const paths = [
      ...STATIC_PAGES,
      ...['/object/', '/news/', '/district/', '/request/'].map(firstOf).filter((p): p is string => !!p),
    ];
    const results: PageCheck[] = [];
    for (const p of paths) {
      const r = await get(p);
      results.push(analyze(p, r.status, r.body));
      setPages([...results]);
    }
    setCheckedAt(new Date().toLocaleString('ru'));
    setRunning(false);
  };

  const problems = pages.reduce((n, p) => n + p.issues.length, 0) + files.filter(f => !f.ok).length;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-display font-700 text-lg flex items-center gap-2">
            <Icon name="ScanSearch" size={18} className="text-brand-blue" /> Как видит Яндекс
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Сайт отдаёт поисковикам готовые страницы сразу с сервера — отдельная «индексация для ботов» больше не нужна.
            Проверка открывает robots, карту сайта и ключевые страницы так же, как робот, и показывает, что он получил.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-60"
        >
          <Icon name={running ? 'Loader2' : 'Play'} size={16} className={running ? 'animate-spin' : ''} />
          {running ? `Проверяю… ${pages.length}` : 'Проверить'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {[
          ['Robots', `${base}/robots.txt`],
          ['Карта сайта для Вебмастера', `${base}/sitemap-full`],
        ].map(([l, u]) => (
          <div key={u} className="rounded-xl border border-border px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{l}</div>
              <div className="font-mono text-xs truncate">{u}</div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => { navigator.clipboard?.writeText(u); }}
                className="p-1.5 rounded-lg hover:bg-muted" title="Скопировать"
              >
                <Icon name="Copy" size={14} />
              </button>
              <a href={u} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-muted" title="Открыть">
                <Icon name="ExternalLink" size={14} />
              </a>
            </div>
          </div>
        ))}
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map(f => (
            <div key={f.path} className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${f.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
              <Icon name={f.ok ? 'CheckCircle2' : 'AlertCircle'} size={15} className="mt-0.5 shrink-0" />
              <div><span className="font-semibold">{f.label}</span> · {f.status || 'нет ответа'} · {f.note}</div>
            </div>
          ))}
        </div>
      )}

      {pages.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-2">Страница</th>
                <th className="py-2 pr-2">Код</th>
                <th className="py-2 pr-2">Title / H1</th>
                <th className="py-2 pr-2">FAQ</th>
                <th className="py-2 pr-2">Разметка</th>
                <th className="py-2">Замечания</th>
              </tr>
            </thead>
            <tbody>
              {pages.map(p => (
                <tr key={p.path} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-2 font-mono max-w-[180px] truncate">
                    <a href={p.path} target="_blank" rel="noreferrer" className="text-brand-blue hover:underline">{p.path}</a>
                  </td>
                  <td className={`py-2 pr-2 font-semibold ${p.status === 200 ? 'text-emerald-700' : 'text-red-600'}`}>{p.status || '—'}</td>
                  <td className="py-2 pr-2 max-w-[320px]">
                    <div className="font-medium">{p.title || '—'} <span className="text-muted-foreground">({p.title.length})</span></div>
                    <div className="text-muted-foreground">H1: {p.h1 || '—'}</div>
                  </td>
                  <td className="py-2 pr-2">{p.faq ? '✓' : '—'}</td>
                  <td className="py-2 pr-2">{p.schema}</td>
                  <td className="py-2">
                    {p.issues.length === 0
                      ? <span className="text-emerald-700">OK{p.noindex ? ' · noindex' : ''}</span>
                      : <span className="text-red-600">{p.issues.join('; ')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!running && checkedAt && (
        <div className={`text-sm font-medium rounded-xl px-4 py-3 ${problems === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
          {problems === 0 ? 'Всё в порядке' : `Найдено замечаний: ${problems}`} · проверено {checkedAt}
        </div>
      )}
    </div>
  );
}
