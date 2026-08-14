import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import ImageUploader from '@/components/admin/ImageUploader';

interface Partner {
  id: number;
  name: string;
  logo_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export default function PartnersAdmin() {
  const [items, setItems] = useState<Partner[]>([]);
  const [editing, setEditing] = useState<Partial<Partner> | null>(null);

  const load = () => adminApi.listPartners().then(d => setItems(d.partners));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) {
      alert('Укажите название компании');
      return;
    }
    try {
      if (editing.id) await adminApi.updatePartner(editing.id, editing as Record<string, unknown>);
      else await adminApi.createPartner(editing as Record<string, unknown>);
      setEditing(null);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить партнёра? Ранее поданные заявки сохранятся.')) return;
    await adminApi.deletePartner(id);
    load();
  };

  const toggleActive = async (p: Partner) => {
    await adminApi.updatePartner(p.id, { is_active: !p.is_active });
    load();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    const a = items[idx];
    const b = items[targetIdx];
    await Promise.all([
      adminApi.updatePartner(a.id, { sort_order: b.sort_order }),
      adminApi.updatePartner(b.id, { sort_order: a.sort_order }),
    ]);
    load();
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex justify-between items-center mb-1">
        <div className="font-display font-700 text-lg">Партнёры на главной</div>
        <button onClick={() => setEditing({ name: '', logo_url: '', is_active: true, sort_order: items.length })}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="Plus" size={14} /> Добавить
        </button>
      </div>
      <div className="text-xs text-muted-foreground mb-4">
        Логотипы отображаются каруселью на главной странице. Клик по логотипу открывает форму заявки клиента.
      </div>

      <div className="grid grid-cols-1 gap-2">
        {items.map((p, idx) => (
          <div key={p.id} className={`flex items-center justify-between p-3 rounded-lg ${p.is_active ? 'bg-muted/30' : 'bg-muted/10 opacity-60'}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-14 h-10 rounded-lg bg-white border border-border flex items-center justify-center shrink-0 overflow-hidden">
                {p.logo_url
                  ? <img src={p.logo_url} alt={p.name} className="max-w-full max-h-full object-contain" />
                  : <Icon name="Building2" size={18} className="text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.is_active ? 'Работает с нами' : 'Отключён'}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground p-1 disabled:opacity-30">
                <Icon name="ChevronUp" size={16} />
              </button>
              <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1} className="text-muted-foreground p-1 disabled:opacity-30">
                <Icon name="ChevronDown" size={16} />
              </button>
              <button onClick={() => toggleActive(p)} className={p.is_active ? 'text-emerald-600 p-1' : 'text-muted-foreground p-1'} title={p.is_active ? 'Отключить' : 'Включить'}>
                <Icon name={p.is_active ? 'ToggleRight' : 'ToggleLeft'} size={22} />
              </button>
              <button onClick={() => setEditing(p)} className="text-brand-blue p-1">
                <Icon name="Pencil" size={14} />
              </button>
              <button onClick={() => del(p.id)} className="text-red-600 p-1">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">Партнёры ещё не добавлены</div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <div className="font-display font-700 text-lg">
                {editing.id ? 'Редактировать партнёра' : 'Новый партнёр'}
              </div>
              <button onClick={() => setEditing(null)}><Icon name="X" size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Название компании</label>
                <input className="w-full px-3 py-2 border rounded-lg"
                  value={editing.name || ''}
                  onChange={e => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Логотип</label>
                <ImageUploader
                  value={editing.logo_url ? [editing.logo_url] : []}
                  onChange={urls => setEditing({ ...editing, logo_url: urls[0] || '' })}
                  folder="logo"
                  multiple={false}
                  hint="PNG/JPG, желательно прозрачный фон"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.is_active !== false}
                  onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                Работает с нами (показывать на сайте)
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