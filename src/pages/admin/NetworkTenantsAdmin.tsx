import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

interface Lead {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: string;
  source: string;
  created_at: string;
  budget: number | null;
  company: string | null;
  is_network_tenant: boolean;
  logo_url?: string | null;
}

const STATUSES: { value: string; label: string; color: string; bg: string }[] = [
  { value: 'pending',     label: 'На модерации', color: 'text-orange-700',  bg: 'bg-orange-100' },
  { value: 'new',         label: 'Новый',        color: 'text-emerald-700', bg: 'bg-emerald-100' },
  { value: 'in_progress', label: 'В работе',     color: 'text-amber-700',   bg: 'bg-amber-100' },
  { value: 'done',        label: 'Закрыт',       color: 'text-blue-700',    bg: 'bg-blue-100' },
  { value: 'rejected',    label: 'Отказ',        color: 'text-red-700',     bg: 'bg-red-100' },
];

const PALETTE = ['#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#14B8A6'];

function getColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initials(s: string): string {
  if (!s) return '?';
  const parts = s.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function NetworkTenantsAdmin() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [active, setActive] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = () => {
    setLoading(true);
    adminApi.listLeads()
      .then(d => setLeads((d.leads || []).filter((l: Lead) => l.is_network_tenant)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const update = async (id: number, changes: Partial<Lead>) => {
    await adminApi.updateLead(id, changes as Record<string, unknown>);
    setActive(prev => prev ? { ...prev, ...changes } : prev);
    load();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter(l => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${l.name} ${l.company || ''} ${l.phone} ${l.email || ''} ${l.message || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [leads, query, statusFilter]);

  const stats = useMemo(() => {
    const acc: Record<string, number> = { all: leads.length };
    for (const s of STATUSES) acc[s.value] = 0;
    for (const l of leads) {
      if (acc[l.status] !== undefined) acc[l.status] += 1;
    }
    return acc;
  }, [leads]);

  const statusOf = (s: string) => STATUSES.find(x => x.value === s);

  return (
    <div className="space-y-5">
      {/* Заголовок */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-display font-700">Сетевики</h2>
          <p className="text-sm text-muted-foreground">Заявки от сетевых арендаторов и франшиз</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold bg-brand-blue/10 text-brand-blue px-3 py-1.5 rounded-xl">
            Всего: {leads.length}
          </span>
          <button onClick={load}
            className="text-xs px-3 py-1.5 rounded-xl border border-border hover:bg-muted inline-flex items-center gap-1.5">
            <Icon name="RefreshCw" size={12} /> Обновить
          </button>
        </div>
      </div>

      {/* Поиск и фильтр */}
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="relative">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск по компании, имени, телефону..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-brand-blue"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <Icon name="X" size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setStatusFilter('all')}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
              statusFilter === 'all' ? 'bg-brand-blue text-white' : 'bg-muted text-foreground/80 hover:bg-muted/70'
            }`}>
            Все · {stats.all}
          </button>
          {STATUSES.map(s => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1.5 ${
                statusFilter === s.value ? `${s.bg} ${s.color}` : 'bg-muted text-foreground/70 hover:bg-muted/70'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.bg.replace('100', '500')}`} />
              {s.label} · {stats[s.value] || 0}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Icon name="Loader2" size={24} className="animate-spin mr-2" /> Загрузка...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-muted-foreground">
          <Icon name="Network" size={40} className="mx-auto mb-3 opacity-30" />
          {leads.length === 0 ? 'Пока нет сетевых арендаторов' : 'По вашему запросу ничего не найдено'}
        </div>
      ) : (
        <>
          {/* Плитка карточек */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(l => {
              const st = statusOf(l.status);
              const displayName = l.company || l.name;
              return (
                <button key={l.id} onClick={() => setActive(l)}
                  className={`group bg-white rounded-2xl shadow-sm hover:shadow-md transition-all text-left overflow-hidden border-2 ${
                    active?.id === l.id ? 'border-brand-blue' : 'border-transparent'
                  }`}>
                  {/* Фото/логотип */}
                  <div className="aspect-[4/3] relative bg-muted overflow-hidden">
                    {l.logo_url ? (
                      <img src={l.logo_url} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white font-display font-700 text-5xl"
                        style={{ background: `linear-gradient(135deg, ${getColor(displayName)}, ${getColor(displayName + 'x')})` }}>
                        {initials(displayName)}
                      </div>
                    )}
                    {st && (
                      <span className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-1 rounded-full ${st.bg} ${st.color}`}>
                        {st.label}
                      </span>
                    )}
                  </div>

                  {/* Контент */}
                  <div className="p-3 space-y-1">
                    <div className="font-semibold text-sm line-clamp-1">{displayName}</div>
                    {l.company && l.name && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{l.name}</div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon name="Phone" size={11} />
                      <span className="truncate">{l.phone}</span>
                    </div>
                    {l.budget != null && l.budget > 0 && (
                      <div className="text-xs font-semibold text-brand-blue pt-1">
                        Бюджет: {l.budget.toLocaleString('ru')} ₽
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Модальное окно деталей */}
          {active && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
                 onClick={() => setActive(null)}>
              <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                   onClick={e => e.stopPropagation()}>
                {/* Шапка с лого */}
                <div className="relative">
                  <div className="aspect-[3/1] bg-muted overflow-hidden">
                    {active.logo_url ? (
                      <img src={active.logo_url} alt={active.company || active.name} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white font-display font-700 text-6xl"
                        style={{ background: `linear-gradient(135deg, ${getColor((active.company || active.name) || 'x')}, ${getColor((active.company || active.name) + 'y')})` }}>
                        {initials(active.company || active.name)}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setActive(null)}
                    className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow">
                    <Icon name="X" size={18} />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <div className="font-display font-700 text-xl">{active.company || active.name}</div>
                    {active.company && active.name && (
                      <div className="text-sm text-muted-foreground mt-0.5">Контактное лицо: {active.name}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      Получено: {new Date(active.created_at).toLocaleDateString('ru', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm">
                    <a href={`tel:${active.phone}`}
                       className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl hover:bg-emerald-100">
                      <Icon name="Phone" size={14} /> {active.phone}
                    </a>
                    {active.email && (
                      <a href={`mailto:${active.email}`}
                         className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl hover:bg-blue-100">
                        <Icon name="Mail" size={14} /> {active.email}
                      </a>
                    )}
                    {active.budget != null && active.budget > 0 && (
                      <div className="inline-flex items-center gap-1.5 bg-brand-blue/10 text-brand-blue px-3 py-1.5 rounded-xl font-semibold">
                        <Icon name="Wallet" size={14} /> {active.budget.toLocaleString('ru')} ₽
                      </div>
                    )}
                  </div>

                  {active.message && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Сообщение</div>
                      <div className="bg-muted/40 rounded-xl p-4 text-sm whitespace-pre-wrap">{active.message}</div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Статус</div>
                    <div className="flex flex-wrap gap-2">
                      {STATUSES.map(s => (
                        <button key={s.value} onClick={() => update(active.id, { status: s.value })}
                          className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition border ${
                            active.status === s.value ? `${s.bg} ${s.color} border-transparent font-semibold` : 'border-border hover:bg-muted'
                          }`}>
                          <span className={`w-2 h-2 rounded-full ${s.bg.replace('100', '500')}`} />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
