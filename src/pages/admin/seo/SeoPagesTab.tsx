import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { seoUrl } from './seoTypes';

interface SeoPage {
  id?: number;
  path: string;
  title: string;
  description: string;
  h1: string;
  keywords?: string;
  og_image?: string;
  auto_generated?: boolean;
  updated_at?: string | null;
}

const DEFAULT_PAGES: SeoPage[] = [
  { path: '/', title: '', description: '', h1: '' },
  { path: '/catalog', title: '', description: '', h1: '' },
  { path: '/map', title: '', description: '', h1: '' },
  { path: '/favorites', title: '', description: '', h1: '' },
  { path: '/compare', title: '', description: '', h1: '' },
  { path: '/about', title: '', description: '', h1: '' },
  { path: '/contacts', title: '', description: '', h1: '' },
];

interface Props {
  token: string;
  gptOk: boolean;
}

export default function SeoPagesTab({ token, gptOk }: Props) {
  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };
  const [pages, setPages] = useState<SeoPage[]>(DEFAULT_PAGES);
  const [activePath, setActivePath] = useState<string>('/');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const current = pages.find(p => p.path === activePath) || DEFAULT_PAGES[0];

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(seoUrl(token), {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'pages_list' }),
      });
      if (!r.ok) {
        setError(`Не удалось загрузить страницы (HTTP ${r.status})`);
        return;
      }
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      if (Array.isArray(d.pages) && d.pages.length) {
        const merged: SeoPage[] = DEFAULT_PAGES.map(def => {
          const found = d.pages.find((p: SeoPage) => p.path === def.path);
          return found ? { ...def, ...found } : def;
        });
        const extra = d.pages.filter((p: SeoPage) => !DEFAULT_PAGES.some(d => d.path === p.path));
        setPages([...merged, ...extra]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateCurrent = (patch: Partial<SeoPage>) => {
    setPages(ps => ps.map(p => p.path === activePath ? { ...p, ...patch, auto_generated: false } : p));
    setSavedMsg('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const r = await fetch(seoUrl(token), {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'page_save', ...current }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setSavedMsg('Сохранено');
      setTimeout(() => setSavedMsg(''), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setSaving(false);
    }
  };

  const generateAi = async () => {
    if (!gptOk) {
      setError('ИИ не настроен. Добавьте ключ YandexGPT в настройках.');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const r = await fetch(seoUrl(token), {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'page_generate', path: activePath }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      if (d.page) {
        setPages(ps => ps.map(p => p.path === activePath ? { ...p, ...d.page, auto_generated: true } : p));
        setSavedMsg('Сгенерировано ИИ');
        setTimeout(() => setSavedMsg(''), 2000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setGenerating(false);
    }
  };

  const titleLen = current.title.length;
  const descLen = current.description.length;
  const titleColor = titleLen > 65 ? 'text-red-600' : titleLen > 55 ? 'text-amber-600' : 'text-emerald-600';
  const descColor = descLen > 160 ? 'text-red-600' : descLen > 145 ? 'text-amber-600' : 'text-emerald-600';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Icon name="FileText" size={16} className="text-brand-blue" />
            Мета-теги страниц сайта
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Title, Description и H1 для статических страниц. Можно править вручную или сгенерировать ИИ.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
        >
          <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={12} className={loading ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <Icon name="AlertCircle" size={14} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
        {/* Список страниц */}
        <div className="bg-muted/30 rounded-xl p-2 space-y-1 max-h-96 overflow-y-auto">
          {pages.map(p => {
            const hasData = !!(p.title || p.description || p.h1);
            return (
              <button
                key={p.path}
                onClick={() => setActivePath(p.path)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center gap-2 ${
                  activePath === p.path ? 'bg-white shadow-sm font-semibold text-brand-blue' : 'hover:bg-white/70'
                }`}
              >
                <Icon
                  name={hasData ? 'CheckCircle2' : 'Circle'}
                  size={13}
                  className={hasData ? 'text-emerald-500' : 'text-muted-foreground/40'}
                />
                <span className="truncate font-mono text-xs">{p.path}</span>
                {p.auto_generated && (
                  <Icon name="Sparkles" size={11} className="text-amber-500 ml-auto" />
                )}
              </button>
            );
          })}
        </div>

        {/* Редактор */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold">H1 (главный заголовок страницы)</label>
              <span className="text-[10px] text-muted-foreground">{current.h1.length}/70</span>
            </div>
            <input
              type="text"
              value={current.h1}
              onChange={e => updateCurrent({ h1: e.target.value })}
              maxLength={120}
              placeholder="Например: Коммерческая недвижимость в Краснодаре"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold">Title (заголовок вкладки браузера)</label>
              <span className={`text-[10px] font-semibold ${titleColor}`}>{titleLen}/65</span>
            </div>
            <input
              type="text"
              value={current.title}
              onChange={e => updateCurrent({ title: e.target.value })}
              maxLength={120}
              placeholder="Краткий заголовок до 65 символов"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold">Description (описание для поисковиков)</label>
              <span className={`text-[10px] font-semibold ${descColor}`}>{descLen}/160</span>
            </div>
            <textarea
              value={current.description}
              onChange={e => updateCurrent({ description: e.target.value })}
              maxLength={300}
              rows={3}
              placeholder="Описание страницы до 160 символов"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">Keywords (опционально)</label>
            <input
              type="text"
              value={current.keywords || ''}
              onChange={e => updateCurrent({ keywords: e.target.value })}
              placeholder="ключевое слово 1, ключевое слово 2"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">OG-изображение (URL, опционально)</label>
            <input
              type="text"
              value={current.og_image || ''}
              onChange={e => updateCurrent({ og_image: e.target.value })}
              placeholder="https://..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-brand-blue text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 hover:bg-brand-blue/90"
            >
              <Icon name={saving ? 'Loader2' : 'Save'} size={14} className={saving ? 'animate-spin' : ''} />
              Сохранить
            </button>
            <button
              onClick={generateAi}
              disabled={generating || !gptOk}
              title={!gptOk ? 'ИИ не настроен' : 'Сгенерировать title и description через ИИ'}
              className="px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 hover:bg-amber-100"
            >
              <Icon name={generating ? 'Loader2' : 'Sparkles'} size={14} className={generating ? 'animate-spin' : ''} />
              Сгенерировать ИИ
            </button>
            {savedMsg && (
              <span className="text-xs text-emerald-600 font-semibold inline-flex items-center gap-1">
                <Icon name="Check" size={13} /> {savedMsg}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
