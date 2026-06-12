import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Icon from '@/components/ui/icon';
import {
  MarketStats, CAT_LABELS, PALETTE, fmtMoney, CustomTooltip,
} from './types';

// ── Типы пропсов ──────────────────────────────────────────────────────────────

interface TrendViewProps {
  trendData: Record<string, string | number>[];
  selectedCats: string[];
  onToggleCat: (cat: string) => void;
}

interface CompareViewProps {
  compareData: Record<string, string | number>[];
  selectedCats: string[];
  onToggleCat: (cat: string) => void;
}

interface HeatmapViewProps {
  heatmapData: {
    cats: string[];
    districts: string[];
    matrix: Record<string, Record<string, number | null>>;
  };
}

interface IndexViewProps {
  heatIndexData: { category: string; change_pct: number; current: number; prev: number; analogs: number }[];
  data: MarketStats;
  filterDeal: 'sale' | 'rent';
  filterDistrict: string;
}

// ── Вид: Тренд цен ────────────────────────────────────────────────────────────

export function TrendView({ trendData, selectedCats, onToggleCat }: TrendViewProps) {
  return (
    <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="font-semibold text-sm">Динамика ₽/м² по категориям</h4>
        <div className="flex flex-wrap gap-1">
          {Object.keys(CAT_LABELS).map(cat => (
            <button key={cat} onClick={() => onToggleCat(cat)}
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
  );
}

// ── Вид: Сравнение районов ────────────────────────────────────────────────────

export function CompareView({ compareData, selectedCats, onToggleCat }: CompareViewProps) {
  return (
    <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="font-semibold text-sm">₽/м² по районам Краснодара</h4>
        <div className="flex flex-wrap gap-1">
          {Object.keys(CAT_LABELS).slice(0, 6).map(cat => (
            <button key={cat} onClick={() => onToggleCat(cat)}
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
            <BarChart data={compareData} margin={{ top: 5, right: 10, bottom: 40, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="district" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
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
  );
}

// ── Вид: Тепловая карта ───────────────────────────────────────────────────────

export function HeatmapView({ heatmapData }: HeatmapViewProps) {
  return (
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
  );
}

// ── Вид: Индекс перегрева ─────────────────────────────────────────────────────

export function IndexView({ heatIndexData, data, filterDeal, filterDistrict }: IndexViewProps) {
  return (
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
              .filter(l => l.deal === filterDeal && l.district === filterDistrict && (l.analogs_count ?? 0) >= 5)
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
  );
}

// ── Переключатель режима просмотра ────────────────────────────────────────────

type ViewMode = 'trend' | 'compare' | 'heatmap' | 'index';

interface ViewModeSwitcherProps {
  viewMode: ViewMode;
  onSwitch: (mode: ViewMode) => void;
}

export function ViewModeSwitcher({ viewMode, onSwitch }: ViewModeSwitcherProps) {
  return (
    <div className="flex gap-1 overflow-x-auto">
      {([
        { id: 'trend',   label: 'Тренд цен',       icon: 'TrendingUp' },
        { id: 'compare', label: 'Районы',            icon: 'MapPin' },
        { id: 'heatmap', label: 'Тепловая карта',   icon: 'Grid3x3' },
        { id: 'index',   label: 'Индекс перегрева', icon: 'Flame' },
      ] as const).map(m => (
        <button key={m.id} onClick={() => onSwitch(m.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex-shrink-0 ${
            viewMode === m.id ? 'bg-brand-blue text-white shadow-sm' : 'bg-white border border-border text-foreground/70 hover:bg-muted/50'
          }`}>
          <Icon name={m.icon} size={13} />
          {m.label}
        </button>
      ))}
    </div>
  );
}