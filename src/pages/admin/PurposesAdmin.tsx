import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

interface P {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export default function PurposesAdmin() {
  const [items, setItems] = useState<P[]>([]);
  const [editing, setEditing] = useState<Partial<P> | null>(null);

  const load = () => adminApi.listPurposes().then(d => setItems(d.purposes));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id) await adminApi.updatePurpose(editing.id, editing as Record<string, unknown>);
      else await adminApi.createPurpose(editing as Record<string, unknown>);
      setEditing(null);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить назначение?')) return;
    await adminApi.deletePurpose(id);
    load();
  };

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[ёЁ]/g, 'е')
      .replace(/[а-я]/g, c => ({ а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' } as Record<string,string>)[c] || c)
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div className="font-display font-700 text-lg">Назначения объектов</div>
        <button onClick={() => setEditing({ name: '', slug: '', icon: 'Tag', is_active: true })}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="Plus" size={14} /> Добавить
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map(p => (
          <div key={p.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-brand-blue/10 text-brand-blue flex items-center justify-center shrink-0">
                <Icon name={p.icon || 'Tag'} fallback="Tag" size={18} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground truncate">{p.slug}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setEditing(p)} className="text-brand-blue p-1">
                <Icon name="Pencil" size={14} />
              </button>
              <button onClick={() => del(p.id)} className="text-red-600 p-1">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <div className="font-display font-700 text-lg">
                {editing.id ? 'Редактировать' : 'Новое назначение'}
              </div>
              <button onClick={() => setEditing(null)}><Icon name="X" size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Название</label>
                <input className="w-full px-3 py-2 border rounded-lg"
                  value={editing.name || ''}
                  onChange={e => setEditing({
                    ...editing,
                    name: e.target.value,
                    slug: editing.id ? editing.slug : slugify(e.target.value),
                  })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Slug (латиницей)</label>
                <input className="w-full px-3 py-2 border rounded-lg"
                  value={editing.slug || ''} onChange={e => setEditing({ ...editing, slug: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Иконка (lucide)</label>
                <input className="w-full px-3 py-2 border rounded-lg" placeholder="Coffee, Wrench, ShoppingBag..."
                  value={editing.icon || ''} onChange={e => setEditing({ ...editing, icon: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.is_active !== false}
                  onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                Активно
              </label>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-3">
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
