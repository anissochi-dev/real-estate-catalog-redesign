import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

function toSlug(str: string) {
  return str
    .toLowerCase()
    .replace(/[а-яё]/g, c => ({ а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'j',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' }[c] ?? c))
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

interface P {
  id: number;
  slug: string;
  title: string;
  content: string;
  meta_description: string;
  published: boolean;
}

export default function PagesAdmin() {
  const [pages, setPages] = useState<P[]>([]);
  const [editing, setEditing] = useState<Partial<P> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const load = () => {
    setLoading(true);
    setError('');
    adminApi.listPages()
      .then(d => {
        // Защита: backend может вернуть undefined/null/неверный формат
        const list = Array.isArray(d?.pages) ? d.pages : [];
        setPages(list);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить страницы');
        setPages([]);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id) {
        await adminApi.updatePage(editing.id, editing as Record<string, unknown>);
      } else {
        await adminApi.createPage(editing as Record<string, unknown>);
      }
      setEditing(null);
      load();
    } catch (e: unknown) {
      alert((e instanceof Error ? e.message : 'Ошибка'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setEditing({ published: true })}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="Plus" size={16} /> Новая страница
        </button>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-muted-foreground">
          <Icon name="Loader2" size={20} className="animate-spin mx-auto mb-2" />
          Загрузка страниц…
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <Icon name="AlertCircle" size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-red-800 text-sm">Не удалось загрузить страницы</div>
            <div className="text-xs text-red-700 mt-0.5">{error}</div>
            <button onClick={load} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-white border border-red-200 hover:bg-red-50 inline-flex items-center gap-1">
              <Icon name="RefreshCw" size={12} /> Повторить
            </button>
          </div>
        </div>
      )}

      {!loading && !error && pages.length === 0 && (
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-muted-foreground">
          <Icon name="FileText" size={28} className="mx-auto mb-2 opacity-50" />
          Пока нет ни одной страницы. Нажмите «Новая страница», чтобы создать первую.
        </div>
      )}

      <div className="grid gap-3">
        {(Array.isArray(pages) ? pages : []).map(p => (
          <div key={p.id} className="bg-white rounded-2xl p-5 shadow-sm flex justify-between items-center">
            <div className="min-w-0">
              <div className="font-semibold">{p.title}</div>
              <div className="text-xs text-muted-foreground">/{p.slug}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded ${p.published ? 'bg-emerald-100 text-emerald-700' : 'bg-muted'}`}>
                {p.published ? 'Опубликована' : 'Черновик'}
              </span>
              <button onClick={() => setEditing(p)} className="text-brand-blue">
                <Icon name="Pencil" size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-white">
              <div className="font-display font-700 text-lg">
                {editing.id ? 'Редактировать страницу' : 'Новая страница'}
              </div>
              <button onClick={() => setEditing(null)}><Icon name="X" size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="relative">
                <input className="w-full px-3 py-2 border rounded-lg pr-16" placeholder="Заголовок"
                  maxLength={60}
                  value={editing.title || ''}
                  onChange={e => {
                    const title = e.target.value;
                    setEditing(prev => ({
                      ...prev!,
                      title,
                      ...(!prev!.id && { slug: toSlug(title) }),
                    }));
                  }} />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums ${
                  (editing.title?.length || 0) >= 55 ? 'text-red-500' : 'text-muted-foreground'
                }`}>
                  {editing.title?.length || 0}/60
                </span>
              </div>
              {!editing.id && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">URL страницы</label>
                  <input className="w-full px-3 py-2 border rounded-lg font-mono text-sm" placeholder="about"
                    value={editing.slug || ''} onChange={e => setEditing({ ...editing, slug: e.target.value })} />
                  <div className="text-xs text-muted-foreground mt-1">Генерируется автоматически из заголовка. Можно изменить вручную.</div>
                </div>
              )}
              <textarea className="w-full px-3 py-2 border rounded-lg" rows={2} placeholder="Meta description"
                value={editing.meta_description || ''} onChange={e => setEditing({ ...editing, meta_description: e.target.value })} />
              <textarea className="w-full px-3 py-2 border rounded-lg" rows={12} placeholder="Контент страницы"
                value={editing.content || ''} onChange={e => setEditing({ ...editing, content: e.target.value })} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.published}
                  onChange={e => setEditing({ ...editing, published: e.target.checked })} />
                Опубликована
              </label>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-sm">Отмена</button>
              <button onClick={save} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}