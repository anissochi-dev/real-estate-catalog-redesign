import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/contexts/AuthContext';
import { CATALOG_CATEGORIES } from '@/lib/categories';

const ADMIN_URL = 'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';
const SEO_CONTENT_URL = 'https://functions.poehali.dev/4f6d05ce-e38c-4e10-8a8b-f282e1ed2ddd';

interface CategoryText {
  category_type: string;
  h1: string; h2: string; h3: string; h4: string; h5: string;
  description: string;
  features: string[];
  seo_text?: string;
  seo_is_manual?: boolean;
}

function buildUrl(id?: string): string {
  const qs = new URLSearchParams({ resource: 'category_texts', ...(id ? { id } : {}) }).toString();
  return `${ADMIN_URL}?${qs}`;
}

export default function CategoryTextsAdmin() {
  const { refreshToken } = useAuth();
  const [items, setItems] = useState<CategoryText[]>([]);
  const [loading, setLoading] = useState(false);
  const [openType, setOpenType] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [form, setForm] = useState<CategoryText | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const tok = refreshToken();
      const res = await fetch(buildUrl(), { headers: { 'X-Auth-Token': tok } });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      setItems(data.category_texts || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (item: CategoryText) => {
    setOpenType(item.category_type);
    setForm({ ...item, features: [...item.features] });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const tok = refreshToken();
      const body = {
        h1: form.h1, h2: form.h2, h3: form.h3, h4: form.h4, h5: form.h5,
        description: form.description, features: form.features, seo_text: form.seo_text || '',
      };
      const res = await fetch(buildUrl(form.category_type), {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      toast.success('Тексты сохранены');
      setOpenType(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const regenerateAi = async () => {
    if (!form) return;
    setRegenerating(true);
    try {
      const res = await fetch(`${SEO_CONTENT_URL}?category=${encodeURIComponent(form.category_type)}&force=true`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      setForm({ ...form, seo_text: data.text || '' });
      toast.success('Текст пересоздан ИИ — не забудьте сохранить');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось сгенерировать');
    } finally {
      setRegenerating(false);
    }
  };

  const byType = Object.fromEntries(items.map(i => [i.category_type, i]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-700 text-xl flex items-center gap-2">
            <Icon name="FileText" size={20} className="text-brand-blue" />
            Тексты категорий каталога
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Заголовки и описание, которые видны на страницах /catalog/office и т.п.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition disabled:opacity-50">
          <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={14} className={loading ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CATALOG_CATEGORIES.map(cat => {
          const item = byType[cat.type];
          return (
            <button
              key={cat.type}
              type="button"
              onClick={() => item && openEdit(item)}
              disabled={!item}
              className="text-left bg-white rounded-2xl p-4 shadow-sm border border-border hover:border-brand-blue transition disabled:opacity-50"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${cat.gradient} flex items-center justify-center flex-shrink-0`}>
                  <Icon name={cat.icon} size={16} className="text-white" />
                </div>
                <span className="font-semibold text-sm">{cat.label}</span>
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2">{item?.h1 || 'Загрузка...'}</div>
            </button>
          );
        })}
      </div>

      {openType && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setOpenType(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white">
              <div className="font-display font-700 text-lg">
                {CATALOG_CATEGORIES.find(c => c.type === openType)?.label}
              </div>
              <button onClick={() => setOpenType(null)} className="p-1.5 rounded-lg hover:bg-muted">
                <Icon name="X" size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {(['h1', 'h2', 'h3', 'h4', 'h5'] as const).map(field => (
                <div key={field}>
                  <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
                    {field.toUpperCase()}
                  </label>
                  <input
                    type="text"
                    value={form[field]}
                    onChange={e => setForm({ ...form, [field]: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
                  Краткое описание (под заголовком)
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
                  Особенности (4 пункта с галочками в шапке)
                </label>
                <div className="space-y-2">
                  {form.features.map((f, i) => (
                    <input
                      key={i}
                      type="text"
                      value={f}
                      onChange={e => {
                        const next = [...form.features];
                        next[i] = e.target.value;
                        setForm({ ...form, features: next });
                      }}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Большой текст-описание (блок «О категории» внизу страницы)
                  </label>
                  <button
                    type="button"
                    onClick={regenerateAi}
                    disabled={regenerating}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition disabled:opacity-50"
                  >
                    <Icon name={regenerating ? 'Loader2' : 'Wand2'} size={12} className={regenerating ? 'animate-spin' : ''} />
                    {regenerating ? 'Генерируем...' : 'Пересоздать ИИ'}
                  </button>
                </div>
                <textarea
                  value={form.seo_text || ''}
                  onChange={e => setForm({ ...form, seo_text: e.target.value })}
                  rows={6}
                  placeholder="Текст будет сгенерирован ИИ автоматически при первом посещении страницы, если оставить пустым"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-none"
                />
                <div className="text-[11px] text-muted-foreground mt-1">
                  При сохранении текст закрепляется как ручной и не будет автоматически перезаписан. «Пересоздать ИИ» сгенерирует новый вариант — не забудьте сохранить.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-5 py-4 border-t border-border sticky bottom-0 bg-white">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Icon name={saving ? 'Loader2' : 'Check'} size={14} className={saving ? 'animate-spin' : ''} />
                {saving ? 'Сохраняем...' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={() => setOpenType(null)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-border hover:bg-muted/50 transition disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
