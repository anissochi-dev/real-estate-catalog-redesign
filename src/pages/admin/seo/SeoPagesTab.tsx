import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { seoUrl, seoHeaders } from './seoTypes';

interface SeoPage {
  id?: number;
  path: string;
  title: string;
  description: string;
  h1: string;
  h2?: string;
  h3?: string;
  h4?: string;
  h5?: string;
  h6?: string;
  alt_text?: string;
  keywords?: string;
  og_image?: string;
  auto_generated?: boolean;
  noindex?: boolean;
  updated_at?: string | null;
}

const blank = (path: string): SeoPage => ({
  path, title: '', description: '', h1: '',
  h2: '', h3: '', h4: '', h5: '', h6: '', alt_text: '',
});

const DEFAULT_PAGES: SeoPage[] = [
  '/', '/catalog', '/map', '/network-tenants', '/news',
  '/favorites', '/compare', '/about', '/contacts',
].map(blank);

const getToken = () => {
  try { return localStorage.getItem('biznest_token') || ''; } catch { return ''; }
};

interface Props {
  token: string;
  gptOk: boolean;
}

export default function SeoPagesTab({ token: _token, gptOk }: Props) {
  // Всегда берём свежий токен из localStorage при каждом запросе
  const seoCall = async (payload: Record<string, unknown>) => {
    const doFetch = async () => {
      const tok = getToken() || _token;
      return fetch(seoUrl(tok), {
        method: 'POST',
        headers: seoHeaders(tok),
        body: JSON.stringify({ ...payload, auth_token: tok || undefined }),
      });
    };
    let r = await doFetch();
    if (r.status === 401) {
      await new Promise(res => setTimeout(res, 200));
      r = await doFetch();
    }
    if (r.status === 401) return { data: null, error: 'Сессия истекла — войдите заново' };
    if (!r.ok) return { data: null, error: `Сервис временно недоступен (код ${r.status})` };
    const d = await r.json();
    if (d?.error) return { data: null, error: String(d.error) };
    return { data: d, error: null };
  };
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
    const { data, error: err } = await seoCall({ action: 'pages_list' });
    setLoading(false);
    if (err) { setError(err); return; }
    if (data && Array.isArray(data.pages)) {
      const list = data.pages as SeoPage[];
      // Мёрж: дефолтные пути обогащаем данными из БД
      const merged: SeoPage[] = DEFAULT_PAGES.map(def => {
        const found = list.find(p => p.path === def.path);
        return found ? { ...def, ...found } : def;
      });
      // Добавляем страницы из БД которых нет в дефолтном списке
      const extra = list.filter(p => !DEFAULT_PAGES.some(d => d.path === p.path));
      setPages([...merged, ...extra]);
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
    const { error: err } = await seoCall({ action: 'page_save', ...current });
    setSaving(false);
    if (err) { setError(err); return; }
    setSavedMsg('Сохранено');
    setTimeout(() => setSavedMsg(''), 2000);
  };

  const generateAi = async () => {
    if (!gptOk) {
      setError('ИИ не настроен. Добавьте ключ YandexGPT в настройках.');
      return;
    }
    setGenerating(true);
    setError('');
    const { data, error: err } = await seoCall({ action: 'page_generate', path: activePath });
    setGenerating(false);
    if (err) { setError(err); return; }
    if (data && data.page) {
      const page = data.page as Partial<SeoPage>;
      setPages(ps => ps.map(p => p.path === activePath ? { ...p, ...page, auto_generated: true } : p));
      setSavedMsg('Сгенерировано ИИ');
      setTimeout(() => setSavedMsg(''), 2000);
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
            Title, Description, H1–H6, alt-текст и ключевые слова для страниц. Можно править вручную или сгенерировать ИИ.
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
                <span className="truncate font-mono text-xs flex-1">{p.path}</span>
                {p.noindex && (
                  <Icon name="EyeOff" size={11} className="text-muted-foreground/50 shrink-0" title="noindex" />
                )}
                {p.auto_generated && (
                  <Icon name="Sparkles" size={11} className="text-amber-500 shrink-0" />
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

          {/* Подзаголовки H2–H6 */}
          {([
            ['h2', 'H2 (подзаголовок раздела)', 60],
            ['h3', 'H3 (подподзаголовок)', 50],
            ['h4', 'H4 (подзаголовок)', 50],
            ['h5', 'H5 (подзаголовок)', 50],
            ['h6', 'H6 (подзаголовок)', 50],
          ] as [keyof SeoPage, string, number][]).map(([key, label, limit]) => {
            const val = (current[key] as string) || '';
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold">{label}</label>
                  <span className={`text-[10px] font-semibold ${val.length > limit ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {val.length}/{limit}
                  </span>
                </div>
                <input
                  type="text"
                  value={val}
                  onChange={e => updateCurrent({ [key]: e.target.value } as Partial<SeoPage>)}
                  maxLength={limit + 20}
                  placeholder={`Текст ${String(key).toUpperCase()} (опционально)`}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                />
              </div>
            );
          })}

          {/* Alt-текст изображения */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold">Alt-текст изображения</label>
              <span className={`text-[10px] font-semibold ${(current.alt_text || '').length > 125 ? 'text-red-600' : 'text-muted-foreground'}`}>
                {(current.alt_text || '').length}/125
              </span>
            </div>
            <input
              type="text"
              value={current.alt_text || ''}
              onChange={e => updateCurrent({ alt_text: e.target.value })}
              maxLength={145}
              placeholder="Описание главного изображения страницы"
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
              title={!gptOk ? 'ИИ не настроен' : 'Сгенерировать все SEO-поля (H1–H6, title, description, alt, ключевые слова) через ИИ'}
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