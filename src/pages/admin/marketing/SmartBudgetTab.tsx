import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { fmtMoney } from './shared';

const SMART_BUDGET_URL = 'https://functions.poehali.dev/3e599d66-bb63-498f-bf23-4069c3a06660';

interface Channel { name: string; color: string; budget: number; }
interface BudgetItem {
  id: number; title: string; slug: string; price: number; deal: string;
  category: string; district: string; days_on_market: number;
  views_total: number; views_site: number; leads_count: number;
  conversion: number; priority: 'high' | 'medium' | 'low';
  budget: number; channels: Channel[];
}
interface Summary {
  total_objects: number; priority_high: number; priority_medium: number;
  priority_low: number; total_budget_recommended: number;
}

const PRIORITY_CONFIG = {
  high:   { label: 'Срочно продвигать', color: 'bg-red-100 text-red-700 border-red-200',   dot: 'bg-red-500',   icon: 'AlertCircle' },
  medium: { label: 'Рекомендуется',     color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500', icon: 'TrendingDown' },
  low:    { label: 'Норма',             color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: 'CheckCircle2' },
};

const CHANNEL_COLORS: Record<string, string> = {
  red:   'bg-red-500',
  green: 'bg-green-500',
  blue:  'bg-blue-500',
};

type FilterPriority = 'all' | 'high' | 'medium' | 'low';

export default function SmartBudgetTab() {
  const [data, setData] = useState<{ items: BudgetItem[]; summary: Summary } | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterPriority>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(SMART_BUDGET_URL, { method: 'GET' });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || `Ошибка ${res.status}`);
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(id)) { s.delete(id); } else { s.add(id); }
      return s;
    });
  };

  const filtered = data?.items.filter(i => filter === 'all' || i.priority === filter) ?? [];

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Icon name="Loader2" size={20} className="animate-spin" /> Анализирую объекты…
    </div>
  );

  if (!data) return (
    <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
      <Icon name="Wallet" size={32} className="opacity-30" />
      <p className="text-sm">Нет данных</p>
      <button onClick={load} className="text-brand-blue text-sm hover:underline">Загрузить</button>
    </div>
  );

  const { summary } = data;

  return (
    <div className="space-y-5">

      {/* Заголовок */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <Icon name="Wallet" size={18} className="text-brand-blue" />
            Умный бюджет
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Анализ объектов по сроку экспозиции и просмотрам — рекомендации по продвижению
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition">
          <Icon name="RefreshCw" size={12} /> Обновить
        </button>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-border p-4">
          <div className="text-2xl font-bold">{summary.total_objects}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Активных объектов</div>
        </div>
        <div className="bg-red-50 rounded-2xl border border-red-200 p-4">
          <div className="text-2xl font-bold text-red-600">{summary.priority_high}</div>
          <div className="text-xs text-red-500 mt-0.5">Срочно продвигать</div>
        </div>
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
          <div className="text-2xl font-bold text-amber-600">{summary.priority_medium}</div>
          <div className="text-xs text-amber-500 mt-0.5">Рекомендуется</div>
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <div className="text-2xl font-bold text-brand-blue">{fmtMoney(summary.total_budget_recommended)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Бюджет/мес на продвижение</div>
        </div>
      </div>

      {/* Фильтр */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', 'high', 'medium', 'low'] as const).map(f => {
          const labels = { all: 'Все', high: 'Срочно', medium: 'Рекомендуется', low: 'Норма' };
          const counts = { all: data.items.length, high: summary.priority_high, medium: summary.priority_medium, low: summary.priority_low };
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition font-medium ${
                filter === f ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white border-border text-foreground/70 hover:bg-muted/50'
              }`}>
              {labels[f]}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filter === f ? 'bg-white/20' : 'bg-muted'}`}>
                {counts[f]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Таблица объектов */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">Нет объектов в этой категории</div>
        )}
        {filtered.map(item => {
          const p = PRIORITY_CONFIG[item.priority];
          const isOpen = expanded.has(item.id);
          return (
            <div key={item.id} className={`bg-white rounded-2xl border overflow-hidden transition ${p.color}`}>
              {/* Строка */}
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => toggleExpand(item.id)}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate text-foreground">{item.title}</div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">{item.category}</span>
                    {item.district && <span className="text-xs text-muted-foreground">· {item.district}</span>}
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-4 flex-shrink-0 text-right">
                  <div>
                    <div className="text-xs font-semibold text-foreground">{item.days_on_market} дн.</div>
                    <div className="text-[10px] text-muted-foreground">экспозиция</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">{item.views_total}</div>
                    <div className="text-[10px] text-muted-foreground">просмотров</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-brand-blue">{fmtMoney(item.budget)}/мес</div>
                    <div className="text-[10px] text-muted-foreground">бюджет</div>
                  </div>
                </div>
                <Icon name={isOpen ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-muted-foreground flex-shrink-0" />
              </div>

              {/* Детали */}
              {isOpen && (
                <div className="border-t border-current/10 px-4 py-4 bg-white space-y-4">
                  {/* Мобильные метрики */}
                  <div className="flex gap-4 sm:hidden">
                    <div><div className="text-sm font-bold">{item.days_on_market} дн.</div><div className="text-xs text-muted-foreground">экспозиция</div></div>
                    <div><div className="text-sm font-bold">{item.views_total}</div><div className="text-xs text-muted-foreground">просмотров</div></div>
                    <div><div className="text-sm font-bold text-brand-blue">{fmtMoney(item.budget)}</div><div className="text-xs text-muted-foreground">бюджет/мес</div></div>
                  </div>

                  {/* Метрики */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {[
                      { label: 'Цена', value: fmtMoney(item.price) },
                      { label: 'Просм. сайт', value: item.views_site },
                      { label: 'Заявки', value: item.leads_count },
                      { label: 'Конверсия', value: `${item.conversion}%` },
                      { label: 'Приоритет', value: p.label },
                    ].map(m => (
                      <div key={m.label} className="bg-muted/30 rounded-xl px-3 py-2">
                        <div className="text-xs text-muted-foreground">{m.label}</div>
                        <div className="text-sm font-semibold mt-0.5">{m.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Разбивка бюджета по каналам */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      Распределение бюджета {fmtMoney(item.budget)}/мес
                    </div>
                    <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-3">
                      {item.channels.map(ch => (
                        <div key={ch.name}
                          className={`${CHANNEL_COLORS[ch.color] || 'bg-slate-400'}`}
                          style={{ width: `${Math.round(ch.budget / item.budget * 100)}%` }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {item.channels.map(ch => (
                        <div key={ch.name} className="flex items-center gap-1.5 text-xs">
                          <div className={`w-2.5 h-2.5 rounded-full ${CHANNEL_COLORS[ch.color] || 'bg-slate-400'}`} />
                          <span className="text-muted-foreground">{ch.name}</span>
                          <span className="font-semibold">{fmtMoney(ch.budget)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ссылка на объект */}
                  <a href={`/object/${item.slug}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-brand-blue hover:underline">
                    <Icon name="ExternalLink" size={12} /> Открыть карточку объекта
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}