import { useEffect, useState } from 'react';
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
}

const STATUSES: [string, string, string][] = [
  ['pending', 'На модерации', 'bg-orange-400'],
  ['new', 'Новый', 'bg-emerald-500'],
  ['in_progress', 'В работе', 'bg-amber-500'],
  ['done', 'Закрыт', 'bg-blue-500'],
  ['rejected', 'Отказ', 'bg-red-500'],
];

export default function NetworkTenantsAdmin() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [active, setActive] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

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

  const statusOf = (s: string) => STATUSES.find(x => x[0] === s);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-700">Сетевые арендаторы</h2>
          <p className="text-sm text-muted-foreground">Заявки от сетевых операторов и франшиз</p>
        </div>
        <span className="text-sm font-semibold bg-brand-blue/10 text-brand-blue px-3 py-1.5 rounded-xl">
          {leads.length} заявок
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Icon name="Loader2" size={24} className="animate-spin mr-2" /> Загрузка...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="max-h-[70vh] overflow-y-auto">
              {leads.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  <Icon name="Network" size={32} className="mx-auto mb-3 opacity-30" />
                  Нет сетевых арендаторов
                </div>
              )}
              {leads.map(l => {
                const st = statusOf(l.status);
                return (
                  <button key={l.id} onClick={() => setActive(l)}
                    className={`w-full text-left p-4 border-b border-border hover:bg-muted/40 transition ${active?.id === l.id ? 'bg-brand-blue/5' : ''}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="font-semibold text-sm">{l.name}</div>
                        {l.company && <div className="text-xs text-purple-700 font-medium mt-0.5">{l.company}</div>}
                        <div className="text-xs text-muted-foreground mt-1">{l.phone}</div>
                      </div>
                      <span className={`text-[10px] text-white px-1.5 py-0.5 rounded flex-shrink-0 ${st?.[2] || 'bg-muted'}`}>
                        {st?.[1] || l.status}
                      </span>
                    </div>
                    {l.budget && (
                      <div className="text-xs font-semibold text-brand-blue mt-1.5">
                        Бюджет: {l.budget.toLocaleString('ru')} ₽
                      </div>
                    )}
                    {l.message && <div className="text-xs mt-2 line-clamp-2 text-muted-foreground">{l.message}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-2">
            {!active ? (
              <div className="bg-white rounded-2xl p-12 text-center text-muted-foreground">
                <Icon name="Network" size={40} className="mx-auto mb-3 opacity-30" />
                Выберите заявку слева
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-display font-700 text-xl">{active.name}</div>
                    {active.company && (
                      <div className="text-sm font-semibold text-purple-700 mt-0.5 flex items-center gap-1.5">
                        <Icon name="Building" size={14} />
                        {active.company}
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground mt-1">
                      <a href={`tel:${active.phone}`} className="text-brand-blue hover:underline">{active.phone}</a>
                      {active.email && <> · {active.email}</>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(active.created_at).toLocaleDateString('ru', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                </div>

                {active.budget && (
                  <div className="inline-flex items-center gap-2 bg-brand-blue/10 text-brand-blue px-3 py-1.5 rounded-xl text-sm font-semibold">
                    <Icon name="Wallet" size={14} />
                    Бюджет: {active.budget.toLocaleString('ru')} ₽
                  </div>
                )}

                {active.message && (
                  <div className="bg-muted/40 rounded-xl p-4 text-sm whitespace-pre-wrap">{active.message}</div>
                )}

                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Статус</div>
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map(s => (
                      <button key={s[0]} onClick={() => update(active.id, { status: s[0] })}
                        className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition border ${
                          active.status === s[0] ? `${s[2]} text-white border-transparent` : 'border-border hover:bg-muted'
                        }`}>
                        <span className={`w-2 h-2 rounded-full ${active.status === s[0] ? 'bg-white' : s[2]}`} />
                        {s[1]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
