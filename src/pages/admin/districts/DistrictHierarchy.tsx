import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { District, ADMIN_URL, buildHeaders } from './DistrictsTypes';

interface Props {
  districts: District[];
  onSaved: () => void;
  token: string;
}

// Цвета для 4 округов
const OKRUG_COLORS: Record<number, { bg: string; border: string; text: string; badge: string }> = {};
const OKRUG_COLOR_LIST = [
  { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-800',   badge: 'bg-blue-100 text-blue-700' },
  { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700' },
  { bg: 'bg-violet-50', border: 'border-violet-300',  text: 'text-violet-800',  badge: 'bg-violet-100 text-violet-700' },
  { bg: 'bg-amber-50',  border: 'border-amber-300',   text: 'text-amber-800',   badge: 'bg-amber-100 text-amber-700' },
];

export default function DistrictHierarchy({ districts, onSaved, token }: Props) {
  // Округа — только те у кого is_okrug = true
  const okrugs = districts.filter(d => d.is_okrug && d.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Назначаем цвета округам
  okrugs.forEach((o, i) => {
    OKRUG_COLORS[o.id] = OKRUG_COLOR_LIST[i % OKRUG_COLOR_LIST.length];
  });

  // Нераспределённые = активные, не округа, без parent_id
  const unassigned = districts.filter(d =>
    d.is_active && !d.is_okrug && d.parent_id == null
  );
  // Назначенные = активные, не округа, с parent_id
  const assigned = districts.filter(d => d.is_active && !d.is_okrug && d.parent_id != null);

  // Выбранные для массового назначения
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState<number | null>(null); // id округа

  const toggle = (id: number) =>
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) { s.delete(id); } else { s.add(id); }
      return s;
    });

  const selectAll = () => setSelected(new Set(unassigned.map(d => d.id)));
  const deselectAll = () => setSelected(new Set());

  // Массовое назначение выбранных в округ
  const assignToOkrug = async (okrugId: number | null) => {
    if (selected.size === 0) { toast('Выберите районы'); return; }
    setSaving(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(ids.map(id =>
        fetch(`${ADMIN_URL}?resource=districts&id=${id}`, {
          method: 'PUT',
          headers: { ...buildHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: okrugId }),
        })
      ));
      const okrugName = okrugId
        ? okrugs.find(o => o.id === okrugId)?.name || 'округ'
        : 'без округа';
      toast.success(`${ids.length} районов → ${okrugName}`);
      setSelected(new Set());
      onSaved();
    } catch {
      toast.error('Ошибка сохранения');
    } finally { setSaving(false); }
  };

  // Одиночное переназначение
  const assignOne = async (districtId: number, okrugId: number | null) => {
    try {
      await fetch(`${ADMIN_URL}?resource=districts&id=${districtId}`, {
        method: 'PUT',
        headers: { ...buildHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: okrugId }),
      });
      onSaved();
    } catch {
      toast.error('Ошибка');
    }
  };

  const filtered = search.trim()
    ? unassigned.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    : unassigned;

  return (
    <div className="space-y-4">

      {/* Шапка */}
      <div className="bg-white rounded-2xl p-5 border border-border shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <Icon name="Network" size={18} className="text-brand-blue" />
          <div className="font-display font-700 text-base">Иерархия округов</div>
        </div>
        <div className="text-sm text-muted-foreground">
          Выберите микрорайоны → нажмите кнопку округа. Или перетащите по одному.
        </div>
        <div className="flex items-center gap-4 mt-3 text-sm">
          <span className="text-muted-foreground">Округов: <b className="text-foreground">{okrugs.length}</b></span>
          <span className="text-muted-foreground">Назначено: <b className="text-emerald-600">{assigned.length}</b></span>
          <span className="text-muted-foreground">Нераспределено: <b className="text-amber-600">{unassigned.length}</b></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ЛЕВАЯ КОЛОНКА: нераспределённые микрорайоны */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-3">
            <Icon name="LayoutList" size={15} className="text-amber-500" />
            <span className="font-semibold text-sm">Нераспределённые ({unassigned.length})</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={selectAll} className="text-xs text-brand-blue hover:underline">все</button>
              <button onClick={deselectAll} className="text-xs text-muted-foreground hover:underline">снять</button>
            </div>
          </div>

          {/* Поиск */}
          <div className="px-3 py-2 border-b border-border">
            <div className="relative">
              <Icon name="Search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Поиск района..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-sm rounded-lg border border-border focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>

          {/* Список */}
          <div className="overflow-y-auto max-h-80">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                {search ? 'Не найдено' : '✅ Все районы распределены по округам'}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map(d => {
                  const isSelected = selected.has(d.id);
                  return (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData('districtId', String(d.id)); }}
                      onClick={() => toggle(d.id)}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition select-none
                        ${isSelected ? 'bg-brand-blue/8 border-l-2 border-brand-blue' : 'hover:bg-muted/40 border-l-2 border-transparent'}`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0
                        ${isSelected ? 'bg-brand-blue border-brand-blue' : 'border-border'}`}>
                        {isSelected && <Icon name="Check" size={10} className="text-white" />}
                      </div>
                      <span className="text-sm flex-1">{d.name}</span>
                      {d.listings_count ? (
                        <span className="text-xs text-muted-foreground">{d.listings_count}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Панель действий */}
          {selected.size > 0 && (
            <div className="px-4 py-3 bg-brand-blue/5 border-t border-brand-blue/20">
              <div className="text-xs text-brand-blue font-semibold mb-2">
                Выбрано: {selected.size} — назначить в:
              </div>
              <div className="flex flex-wrap gap-2">
                {okrugs.map((o, i) => {
                  const c = OKRUG_COLOR_LIST[i % OKRUG_COLOR_LIST.length];
                  return (
                    <button
                      key={o.id}
                      onClick={() => assignToOkrug(o.id)}
                      disabled={saving}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50
                        ${c.badge} ${c.border}`}
                    >
                      <Icon name="ArrowRight" size={11} />
                      {o.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ПРАВАЯ КОЛОНКА: округа с их микрорайонами */}
        <div className="space-y-3">
          {okrugs.map((okrug, i) => {
            const c = OKRUG_COLOR_LIST[i % OKRUG_COLOR_LIST.length];
            const children = assigned.filter(d => d.parent_id === okrug.id);
            const isDragOver = dragOver === okrug.id;

            return (
              <div
                key={okrug.id}
                className={`rounded-2xl border-2 shadow-sm overflow-hidden transition
                  ${isDragOver ? `${c.border} ring-2 ring-offset-1` : 'border-border'}`}
                onDragOver={e => { e.preventDefault(); setDragOver(okrug.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = Number(e.dataTransfer.getData('districtId'));
                  if (id) assignOne(id, okrug.id);
                }}
              >
                {/* Заголовок округа */}
                <div className={`px-4 py-3 flex items-center gap-3 ${c.bg} border-b ${c.border}`}>
                  <Icon name="Circle" size={12} className={c.text} />
                  <span className={`font-semibold text-sm ${c.text}`}>{okrug.name}</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${c.badge}`}>
                    {children.length} районов
                  </span>
                </div>

                {/* Список назначенных микрорайонов */}
                <div className={`${c.bg}/30 min-h-[60px]`}>
                  {children.length === 0 ? (
                    <div className="px-4 py-4 text-xs text-muted-foreground text-center">
                      Перетащите районы сюда или выберите слева
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 p-3">
                      {children.map(child => (
                        <div
                          key={child.id}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs ${c.badge} border ${c.border} group`}
                        >
                          <span>{child.name}</span>
                          <button
                            onClick={() => assignOne(child.id, null)}
                            title="Убрать из округа"
                            className="opacity-0 group-hover:opacity-100 ml-0.5 hover:text-red-500 transition"
                          >
                            <Icon name="X" size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {okrugs.length === 0 && (
            <div className="bg-muted/30 rounded-2xl p-8 text-center text-sm text-muted-foreground border border-dashed border-border">
              Округа не найдены. Добавьте их в разделе «Районы».
            </div>
          )}
        </div>
      </div>
    </div>
  );
}