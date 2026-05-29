import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

interface V {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
}

export default function LandVriAdmin() {
  const [items, setItems] = useState<V[]>([]);
  const [editing, setEditing] = useState<Partial<V> | null>(null);

  const load = () => adminApi.listLandVri().then(d => setItems(d.land_vri || []));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.name || !editing.slug) { alert('Заполните название и slug'); return; }
    try {
      if (editing.id) await adminApi.updateLandVri(editing.id, editing as Record<string, unknown>);
      else await adminApi.createLandVri(editing as Record<string, unknown>);
      setEditing(null);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить вид разрешённого использования?')) return;
    await adminApi.deleteLandVri(id);
    load();
  };

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[ёЁ]/g, 'е')
      .replace(/[а-я]/g, c => ({ а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' } as Record<string,string>)[c] || c)
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex justify-between items-center mb-1">
        <div className="font-display font-700 text-lg">Виды разрешённого использования (ВРИ)</div>
        <button onClick={() => setEditing({ name: '', slug: '', is_active: true })}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="Plus" size={14} /> Добавить
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Используются для земельных участков. Отображаются в карточке объекта и выгружаются в XML/API.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map(v => (
          <div key={v.id} className={`flex items-center justify-between p-3 rounded-lg ${v.is_active === false ? 'bg-muted/20 opacity-60' : 'bg-muted/30'}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Icon name="Sprout" size={18} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{v.name}</div>
                <div className="text-xs text-muted-foreground truncate">{v.slug}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setEditing(v)} className="text-brand-blue p-1">
                <Icon name="Pencil" size={14} />
              </button>
              <button onClick={() => del(v.id)} className="text-red-600 p-1">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 col-span-full text-center">Список пуст. Добавьте первый ВРИ.</div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <div className="font-display font-700 text-lg">
                {editing.id ? 'Редактировать ВРИ' : 'Новый ВРИ'}
              </div>
              <button onClick={() => setEditing(null)}><Icon name="X" size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Название</label>
                <input className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Например: Под ИЖС"
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
