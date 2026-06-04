import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import Icon from '@/components/ui/icon';
import { req } from '@/pages/admin/settings/siteHealthTypes';

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

// ── Типы ─────────────────────────────────────────────────────────────────────

interface Snapshot {
  snapshot_date: string;
  category: string;
  deal: string;
  district: string;
  price_median: number | null;
  price_min: number | null;
  price_max: number | null;
  price_per_m2_median: number | null;
  analogs_count: number;
}

interface LatestEntry {
  category: string;
  deal: string;
  district: string;
  price_per_m2_median: number | null;
  price_median: number | null;
  analogs_count: number;
  snapshot_date: string;
}

interface MarketStats {
  snapshots: Snapshot[];
  latest: LatestEntry[];
  schedule: { enabled: boolean; last_at: string | null; schedule?: string; next_run?: string; in_progress?: boolean; next_source?: string | null };
}

// ── Справочники ───────────────────────────────────────────────────────────────

const CAT_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', warehouse: 'Склад',
  building: 'Здание', free_purpose: 'Своб. назн.', production: 'Производство',
  business: 'Готовый бизнес', hotel: 'Гостиница', land: 'Земля',
};
const DEAL_LABELS: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' };

const PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#6366f1',
];

const DISTRICTS = ['', 'Центральный', 'Прикубанский', 'Карасунский', 'Западный', 'Северный'];

// ── Утилиты ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number | null) {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тыс`;
  return String(Math.round(n));
}

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`;
}

function daysSince(s: string | null) {
  if (!s) return null;
  return Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
}

// ── Пользовательский Tooltip ──────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
      <div className="font-semibold mb-2 text-muted-foreground">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-semibold">{p.value?.toLocaleString('ru')} ₽</span>
        </div>
      ))}
    </div>
  );
}

// ── Главный компонент ─────────────────────────────────────────────────────────

export default function PriceMarketTab() {
  const [data, setData] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Фильтры
  const [viewMode, setViewMode] = useState<'trend' | 'compare' | 'heatmap' | 'index'>('trend');
  const [filterDeal, setFilterDeal] = useState<'sale' | 'rent'>('rent');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterDays, setFilterDays] = useState(180);
  const [selectedCats, setSelectedCats] = useState<string[]>(['office', 'retail', 'warehouse']);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'price_market_stats',
        deal: filterDeal,
        district: filterDistrict,
        days: String(filterDays),
      });
      const r = await fetch(`${PREDICT_URL}?${params}`).then(r => r.json());
      if (r.error) { toast.error(r.error); return; }
      setData(r);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [filterDeal, filterDistrict, filterDays]);

  useEffect(() => { load(); }, [load]);

  const runRefresh = async (force = false) => {
    setRefreshing(true);
    try {
      const r = await fetch(PREDICT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'price_market_refresh', force }),
      }).then(r => r.json());
      if (r.skipped) {
        toast.info(`Пропущено: ${r.reason}`);
      } else if (r.done) {
        toast.success(`Цикл завершён — сохранено ${r.saved} снапшотов`);
        load();
      } else if (r.source) {
        toast.success(`Батч ${r.source} выполнен → следующий: ${r.next}`);
        load();
      } else {
        toast.error(r.error || 'Ошибка');
      }
    } catch { toast.error('Ошибка обновления'); }
    finally { setRefreshing(false); }
  };

  // ── Подготовка данных для графика тренда ──────────────────────────────────

  const trendData = (() => {
    if (!data?.snapshots.length) return [];
    const filtered = data.snapshots.filter(s =>
      s.deal === filterDeal && s.district === filterDistrict && selectedCats.includes(s.category)
    );
    const byDate: Record<string, Record<string, number>> = {};
    filtered.forEach(s => {
      if (!byDate[s.snapshot_date]) byDate[s.snapshot_date] = {};
      if (s.price_per_m2_median) byDate[s.snapshot_date][s.category] = s.price_per_m2_median;
    });
    return Object.entries(byDate).sort(([a],[b])=>a.localeCompare(b)).map(([date, vals]) => ({
      date: fmtDate(date), ...vals,
    }));
  })();

  // ── Подготовка данных для сравнения районов ───────────────────────────────

  const compareData = (() => {
    if (!data?.latest.length) return [];
    return DISTRICTS.filter(d => d !== '').map(district => {
      const row: Record<string, string | number> = { district };
      selectedCats.forEach(cat => {
        const entry = data.latest.find(l => l.category === cat && l.deal === filterDeal && l.district === district);
        if (entry?.price_per_m2_median) row[cat] = entry.price_per_m2_median;
      });
      return row;
    }).filter(r => Object.keys(r).length > 1);
  })();

  // ── Тепловая карта: все категории × районы ────────────────────────────────

  const heatmapData = (() => {
    if (!data?.latest.length) return { cats: [] as string[], districts: [] as string[], matrix: {} as Record<string,Record<string,number|null>> };
    const cats = Object.keys(CAT_LABELS).filter(c => data.latest.some(l => l.category === c && l.deal === filterDeal));
    const matrix: Record<string, Record<string, number | null>> = {};
    cats.forEach(cat => {
      matrix[cat] = {};
      DISTRICTS.forEach(d => {
        const e = data.latest.find(l => l.category === cat && l.deal === filterDeal && l.district === d);
        matrix[cat][d || 'Все районы'] = e?.price_per_m2_median || null;
      });
    });
    return { cats, districts: DISTRICTS.map(d => d || 'Все районы'), matrix };
  })();

  // ── Индекс перегрева рынка ─────────────────────────────────────────────────

  const heatIndexData = (() => {
    if (!data?.snapshots.length) return [];
    // Считаем % изменения цены за выбранный период для каждой категории
    const result: { category: string; change_pct: number; current: number; prev: number; analogs: number }[] = [];
    Object.keys(CAT_LABELS).forEach(cat => {
      const snaps = data.snapshots
        .filter(s => s.category === cat && s.deal === filterDeal && s.district === filterDistrict && s.price_per_m2_median)
        .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      if (snaps.length < 2) return;
      const first = snaps[0].price_per_m2_median!;
      const last = snaps[snaps.length - 1].price_per_m2_median!;
      const change = ((last - first) / first) * 100;
      result.push({ category: cat, change_pct: Math.round(change * 10) / 10, current: last, prev: first, analogs: snaps[snaps.length-1].analogs_count });
    });
    return result.sort((a, b) => b.change_pct - a.change_pct);
  })();

  const sched = data?.schedule;
  const lastDays = daysSince(sched?.last_at || null);

  return (
    <div className="space-y-4">
      {/* Заголовок + статус расписания */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Icon name="TrendingUp" size={18} className="text-brand-blue" />
              Мониторинг рыночных цен
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sched?.schedule ?? '1-е число каждого месяца'}
              {sched?.next_run && <span> · следующий: {new Date(sched.next_run).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}</span>}
              {sched?.last_at && <span> · последнее: {lastDays === 0 ? 'сегодня' : `${lastDays}д назад`}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {sched && (
              <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                sched.enabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-muted border-border text-muted-foreground'
              }`}>
                <Icon name={sched.enabled ? 'CheckCircle2' : 'PauseCircle'} size={13} />
                {sched.enabled ? 'Авто-обновление вкл' : 'Авто-обновление выкл'}
              </div>
            )}
            <button onClick={() => runRefresh(true)} disabled={refreshing}
              className="flex items-center gap-1.5 text-xs bg-brand-blue text-white px-3 py-1.5 rounded-xl font-semibold disabled:opacity-60">
              <Icon name={refreshing ? 'Loader2' : 'RefreshCw'} size={13} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Сбор данных…' : 'Обновить сейчас'}
            </button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="flex flex-wrap gap-2 mt-4 items-center">
          {/* Тип сделки */}
          <div className="flex gap-1 bg-muted/40 rounded-xl p-0.5">
            {(['rent','sale'] as const).map(d => (
              <button key={d} onClick={() => setFilterDeal(d)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${filterDeal === d ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                {DEAL_LABELS[d]}
              </button>
            ))}
          </div>
          {/* Период */}
          <select value={filterDays} onChange={e => setFilterDays(Number(e.target.value))}
            className="border border-border rounded-xl px-3 py-1.5 text-xs bg-white">
            <option value={30}>30 дней</option>
            <option value={90}>3 месяца</option>
            <option value={180}>6 месяцев</option>
            <option value={365}>1 год</option>
          </select>
          {/* Район */}
          <select value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)}
            className="border border-border rounded-xl px-3 py-1.5 text-xs bg-white">
            <option value="">Все районы</option>
            {DISTRICTS.filter(Boolean).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {loading && <Icon name="Loader2" size={14} className="animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Нет данных */}
      {!loading && data?.snapshots.length === 0 && (
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <Icon name="BarChart2" size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground text-sm mb-3">Данных пока нет. Запустите сбор рыночных цен.</p>
          <button onClick={() => runRefresh(true)} disabled={refreshing}
            className="bg-brand-blue text-white px-4 py-2 rounded-xl text-sm font-semibold">
            Собрать данные
          </button>
        </div>
      )}

      {data && (data.snapshots.length > 0 || data.latest.length > 0) && (
        <>
          {/* Переключатель режима */}
          <div className="flex gap-1 overflow-x-auto">
            {([
              { id: 'trend',   label: 'Тренд цен',       icon: 'TrendingUp' },
              { id: 'compare', label: 'Районы',            icon: 'MapPin' },
              { id: 'heatmap', label: 'Тепловая карта',   icon: 'Grid3x3' },
              { id: 'index',   label: 'Индекс перегрева', icon: 'Flame' },
            ] as const).map(m => (
              <button key={m.id} onClick={() => setViewMode(m.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex-shrink-0 ${
                  viewMode === m.id ? 'bg-brand-blue text-white shadow-sm' : 'bg-white border border-border text-foreground/70 hover:bg-muted/50'
                }`}>
                <Icon name={m.icon} size={13} />
                {m.label}
              </button>
            ))}
          </div>

          {/* ── ТРЕНД ────────────────────────────────────────────────────────── */}
          {viewMode === 'trend' && (
            <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-semibold text-sm">Динамика ₽/м² по категориям</h4>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(CAT_LABELS).map(cat => (
                    <button key={cat} onClick={() => setSelectedCats(prev =>
                      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                    )}
                      className={`text-xs px-2 py-0.5 rounded-full border transition ${
                        selectedCats.includes(cat) ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground hover:bg-muted/50'
                      }`}>
                      {CAT_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>
              {trendData.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-8">Нет данных за выбранный период</p>
                : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trendData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}к`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {selectedCats.map((cat, i) => (
                        <Line key={cat} type="monotone" dataKey={cat} name={CAT_LABELS[cat]}
                          stroke={PALETTE[i % PALETTE.length]} strokeWidth={2}
                          dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )
              }
            </div>
          )}

          {/* ── СРАВНЕНИЕ РАЙОНОВ ─────────────────────────────────────────────── */}
          {viewMode === 'compare' && (
            <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-semibold text-sm">₽/м² по районам Краснодара</h4>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(CAT_LABELS).slice(0, 6).map(cat => (
                    <button key={cat} onClick={() => setSelectedCats(prev =>
                      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                    )}
                      className={`text-xs px-2 py-0.5 rounded-full border transition ${
                        selectedCats.includes(cat) ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground'
                      }`}>
                      {CAT_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>
              {compareData.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-8">Нет данных по районам</p>
                : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={compareData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="district" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}к`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {selectedCats.map((cat, i) => (
                        <Bar key={cat} dataKey={cat} name={CAT_LABELS[cat]}
                          fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )
              }
            </div>
          )}

          {/* ── ТЕПЛОВАЯ КАРТА ────────────────────────────────────────────────── */}
          {viewMode === 'heatmap' && (
            <div className="bg-white rounded-2xl border border-border p-4">
              <h4 className="font-semibold text-sm mb-4">Тепловая карта: ₽/м² категория × район</h4>
              {heatmapData.cats.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-left py-2 pr-3 font-medium text-muted-foreground w-32">Категория</th>
                          {heatmapData.districts.map(d => (
                            <th key={d} className="text-center py-2 px-1 font-medium text-muted-foreground whitespace-nowrap">{d || 'Все'}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {heatmapData.cats.map(cat => {
                          const vals = Object.values(heatmapData.matrix[cat]).filter(Boolean) as number[];
                          const catMax = Math.max(...vals, 1);
                          const catMin = Math.min(...vals, 0);
                          return (
                            <tr key={cat} className="border-t border-border/30">
                              <td className="py-2 pr-3 font-medium">{CAT_LABELS[cat]}</td>
                              {heatmapData.districts.map(d => {
                                const val = heatmapData.matrix[cat][d];
                                const intensity = val ? (val - catMin) / (catMax - catMin || 1) : 0;
                                const bg = val
                                  ? `rgba(59,130,246,${0.1 + intensity * 0.7})`
                                  : 'transparent';
                                return (
                                  <td key={d} className="py-2 px-1 text-center rounded" style={{ background: bg }}>
                                    {val ? (
                                      <span className={intensity > 0.6 ? 'text-white font-semibold' : 'font-medium'}>
                                        {val >= 1000 ? `${(val/1000).toFixed(0)}к` : Math.round(val)}
                                      </span>
                                    ) : <span className="text-muted-foreground/30">—</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="text-xs text-muted-foreground mt-2">Значения в ₽/м². Чем темнее — тем выше цена.</p>
                  </div>
                )
              }
            </div>
          )}

          {/* ── ИНДЕКС ПЕРЕГРЕВА ──────────────────────────────────────────────── */}
          {viewMode === 'index' && (
            <div className="space-y-3">
              <div className="bg-white rounded-2xl border border-border p-4">
                <h4 className="font-semibold text-sm mb-1">Индекс динамики цен за период</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Рост/падение ₽/м² за выбранный период. Красный — рост (перегрев), синий — падение (охлаждение).
                </p>
                {heatIndexData.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-6">Недостаточно исторических данных</p>
                  : (
                    <div className="grid gap-2">
                      {heatIndexData.map((row, i) => {
                        const isHot = row.change_pct > 0;
                        const absPct = Math.abs(row.change_pct);
                        return (
                          <div key={i} className="flex items-center gap-3 text-sm">
                            <div className="w-28 flex-shrink-0 font-medium text-xs">{CAT_LABELS[row.category]}</div>
                            <div className="flex-1 bg-muted/30 rounded-full h-3 relative overflow-hidden">
                              <div className={`h-3 rounded-full transition-all ${isHot ? 'bg-red-400' : 'bg-blue-400'}`}
                                style={{ width: `${Math.min(absPct * 3, 100)}%` }} />
                            </div>
                            <div className={`w-16 text-right font-semibold text-xs flex-shrink-0 ${isHot ? 'text-red-600' : 'text-blue-600'}`}>
                              {isHot ? '+' : ''}{row.change_pct}%
                            </div>
                            <div className="text-xs text-muted-foreground w-20 text-right flex-shrink-0">
                              {fmtMoney(row.current)} ₽/м²
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                }
              </div>

              {/* Сводная таблица последних значений */}
              {data.latest.filter(l => l.deal === filterDeal && l.district === filterDistrict).length > 0 && (
                <div className="bg-white rounded-2xl border border-border p-4">
                  <h4 className="font-semibold text-sm mb-3">Актуальные медианы ₽/м²</h4>
                  <div className="grid gap-1.5">
                    {data.latest
                      .filter(l => l.deal === filterDeal && l.district === filterDistrict)
                      .sort((a,b) => (b.price_per_m2_median||0) - (a.price_per_m2_median||0))
                      .map((l, i) => (
                        <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0 text-sm">
                          <span className="flex-1 font-medium">{CAT_LABELS[l.category] || l.category}</span>
                          <span className="text-xs text-muted-foreground">{l.analogs_count} аналогов</span>
                          <span className="font-semibold text-brand-blue">
                            {l.price_per_m2_median ? `${l.price_per_m2_median.toLocaleString('ru')} ₽/м²` : '—'}
                          </span>
                          {l.price_median && (
                            <span className="text-xs text-muted-foreground">{fmtMoney(l.price_median)} ₽</span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}