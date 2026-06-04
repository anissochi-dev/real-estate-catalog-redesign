import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { req } from '@/pages/admin/settings/siteHealthTypes';
import SeoAuditTab from '@/pages/admin/seo/SeoAuditTab';
import SeoTechnicalTab from '@/pages/admin/seo/SeoTechnicalTab';

// ── Типы ─────────────────────────────────────────────────────────────────────

interface MarketingStats {
  totals: {
    total_leads: number;
    leads_30d: number;
    total_views: number;
    active_listings: number;
    total_deals: number;
  };
  leads_by_source: { source: string; cnt: number }[];
  leads_by_status: { status: string; cnt: number }[];
  leads_timeline: { day: string; cnt: number }[];
  views_by_source: Record<string, Record<string, number>>;
  top_listings: { id: number; title: string; category: string; deal: string; views_site: number; price: number }[];
  listings_stats: { category: string; deal: string; cnt: number; total_views: number; avg_views: number }[];
  deals_by_source: { source: string; cnt: number; total_amount: number }[];
}

// ── Вспомогательные ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', warehouse: 'Склад', restaurant: 'Ресторан',
  hotel: 'Гостиница', business: 'Готовый бизнес', gab: 'ГАБ',
  production: 'Производство', land: 'Земля', building: 'Здание',
  free_purpose: 'Своб. назначения', car_service: 'Автосервис',
};
const DEAL_LABELS: Record<string, string> = { sale: 'Продажа', rent: 'Аренда', business: 'Бизнес' };
const STATUS_LABELS: Record<string, string> = {
  new: 'Новые', pending: 'На модерации', in_progress: 'В работе',
  closed: 'Закрытые', rejected: 'Отказ',
};
const SOURCE_COLORS: Record<string, string> = {
  'Авито': 'bg-green-100 text-green-700',
  'авито': 'bg-green-100 text-green-700',
  'avito': 'bg-green-100 text-green-700',
  'ЦИАН': 'bg-blue-100 text-blue-700',
  'cian': 'bg-blue-100 text-blue-700',
  'Яндекс': 'bg-yellow-100 text-yellow-700',
  'yandex': 'bg-yellow-100 text-yellow-700',
  'site': 'bg-purple-100 text-purple-700',
  'admin': 'bg-slate-100 text-slate-600',
  'Не указан': 'bg-slate-100 text-slate-500',
};

function fmtMoney(n: number) {
  if (!n) return '0 ₽';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн ₽`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тыс ₽`;
  return `${Math.round(n).toLocaleString('ru')} ₽`;
}

function StatCard({ icon, label, value, sub, color = 'blue' }: {
  icon: string; label: string; value: string | number; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-brand-blue/10 text-brand-blue',
    green: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon name={icon} size={20} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-xs text-brand-blue mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function HBar({ items, max }: { items: { label: string; value: number; colorClass?: string }[]; max: number }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="w-28 text-xs text-muted-foreground truncate flex-shrink-0">{item.label}</div>
          <div className="flex-1 bg-muted/40 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${item.colorClass || 'bg-brand-blue'}`}
              style={{ width: max > 0 ? `${Math.round((item.value / max) * 100)}%` : '0%' }}
            />
          </div>
          <div className="w-8 text-xs font-semibold text-right">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Вкладка: Аналитика ───────────────────────────────────────────────────────

function AnalyticsTab() {
  const [stats, setStats] = useState<MarketingStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await req('site_health&action=marketing_stats');
      if (d.error) { toast.error(d.error); return; }
      setStats(d);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
      <Icon name="Loader2" size={20} className="animate-spin" /> Загрузка аналитики…
    </div>
  );

  if (!stats) return (
    <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
      <Icon name="BarChart3" size={32} className="opacity-30" />
      <p className="text-sm">Нет данных</p>
      <button onClick={load} className="text-brand-blue text-sm hover:underline">Загрузить</button>
    </div>
  );

  const { totals, leads_by_source, leads_by_status, top_listings, listings_stats, deals_by_source, views_by_source } = stats;

  const maxSource = Math.max(...leads_by_source.map(s => s.cnt), 1);
  const maxStatus = Math.max(...leads_by_status.map(s => s.cnt), 1);
  const totalViews = Object.values(views_by_source).reduce((acc, evts) =>
    acc + Object.values(evts).reduce((a, v) => a + v, 0), 0);

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="Inbox" label="Всего заявок" value={totals.total_leads} sub={`+${totals.leads_30d} за 30 дней`} color="blue" />
        <StatCard icon="Eye" label="Просмотров объектов" value={totals.total_views} color="purple" />
        <StatCard icon="Building2" label="Активных объектов" value={totals.active_listings} color="green" />
        <StatCard icon="Handshake" label="Сделок в CRM" value={totals.total_deals} color="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Лиды по источникам */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Icon name="Funnel" size={16} className="text-brand-blue" /> Лиды по источникам
          </h3>
          {leads_by_source.length === 0
            ? <p className="text-sm text-muted-foreground">Нет данных</p>
            : <HBar
                max={maxSource}
                items={leads_by_source.map(s => ({ label: s.source, value: s.cnt }))}
              />
          }
        </div>

        {/* Лиды по статусам */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Icon name="CircleDot" size={16} className="text-brand-blue" /> Лиды по статусам
          </h3>
          {leads_by_status.length === 0
            ? <p className="text-sm text-muted-foreground">Нет данных</p>
            : <HBar
                max={maxStatus}
                items={leads_by_status.map(s => ({
                  label: STATUS_LABELS[s.status] || s.status,
                  value: s.cnt,
                  colorClass: s.status === 'closed' ? 'bg-emerald-500' : s.status === 'new' ? 'bg-brand-blue' : 'bg-amber-400',
                }))}
              />
          }
        </div>

        {/* Просмотры по площадкам */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Icon name="Globe" size={16} className="text-brand-blue" /> Просмотры по площадкам
          </h3>
          {totalViews === 0
            ? <p className="text-sm text-muted-foreground">Нет данных о просмотрах</p>
            : (
              <div className="space-y-2">
                {Object.entries(views_by_source).map(([src, evts]) => {
                  const total = Object.values(evts).reduce((a, v) => a + v, 0);
                  const colorClass = SOURCE_COLORS[src] || 'bg-slate-100 text-slate-600';
                  return (
                    <div key={src} className="flex items-center gap-3 text-sm">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${colorClass}`}>{src}</span>
                      <div className="flex-1 bg-muted/40 rounded-full h-2">
                        <div className="h-2 rounded-full bg-brand-blue/70 transition-all"
                          style={{ width: `${Math.round((total / totalViews) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-semibold w-8 text-right">{total}</span>
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>

        {/* Сделки по источникам (CRM) */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Icon name="Handshake" size={16} className="text-brand-blue" /> Сделки CRM по источникам
          </h3>
          {deals_by_source.length === 0
            ? <p className="text-sm text-muted-foreground">Нет сделок</p>
            : (
              <div className="space-y-2">
                {deals_by_source.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[d.source] || 'bg-slate-100 text-slate-600'}`}>
                      {d.source}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground text-xs">{d.cnt} сделок</span>
                      <span className="font-semibold text-xs">{fmtMoney(Number(d.total_amount))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* Топ объектов */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Icon name="TrendingUp" size={16} className="text-brand-blue" /> Топ объектов по просмотрам
        </h3>
        {top_listings.length === 0
          ? <p className="text-sm text-muted-foreground">Нет данных</p>
          : (
            <div className="grid gap-2">
              {top_listings.map((l, i) => (
                <div key={l.id} className="flex items-center gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{l.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[l.category] || l.category} · {DEAL_LABELS[l.deal] || l.deal} · {fmtMoney(l.price)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold text-brand-blue flex-shrink-0">
                    <Icon name="Eye" size={13} /> {l.views_site}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>

      {/* Статистика по категориям */}
      {listings_stats.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Icon name="LayoutGrid" size={16} className="text-brand-blue" /> Объекты по категориям
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left pb-2 font-medium">Категория</th>
                  <th className="text-right pb-2 font-medium">Объектов</th>
                  <th className="text-right pb-2 font-medium">Просмотров</th>
                  <th className="text-right pb-2 font-medium">В среднем</th>
                </tr>
              </thead>
              <tbody>
                {listings_stats.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2 font-medium">
                      {CATEGORY_LABELS[row.category] || row.category}
                      <span className="ml-1 text-xs text-muted-foreground">{DEAL_LABELS[row.deal] || row.deal}</span>
                    </td>
                    <td className="py-2 text-right">{row.cnt}</td>
                    <td className="py-2 text-right font-semibold">{row.total_views ?? 0}</td>
                    <td className="py-2 text-right text-muted-foreground">{Number(row.avg_views || 0).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition">
          <Icon name="RefreshCw" size={13} className={loading ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>
    </div>
  );
}

// ── Вкладка: Ценообразование ──────────────────────────────────────────────────

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

const CATEGORIES = [
  { id: 'office', label: 'Офис' }, { id: 'retail', label: 'Торговое' },
  { id: 'warehouse', label: 'Склад' }, { id: 'building', label: 'Здание' },
  { id: 'free_purpose', label: 'Своб. назначения' }, { id: 'production', label: 'Производство' },
  { id: 'business', label: 'Готовый бизнес' }, { id: 'hotel', label: 'Гостиница' },
  { id: 'land', label: 'Земля' },
];

interface PriceResult {
  verdict: {
    label: string; color: string; delta_pct: number;
    market_min_price?: number; market_max_price?: number;
    market_median_per_m2?: number; user_price_per_m2?: number;
    suggested_price?: number; comment: string;
  };
  analogs_count: number;
  analogs: { source: string; price: number; area: number; price_per_m2: number; district?: string }[];
  sources: string[];
  demand_level?: string;
}

const COLOR_MAP: Record<string, { bar: string; badge: string; icon: string }> = {
  red:     { bar: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-200',       icon: 'TrendingUp' },
  amber:   { bar: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'AlertTriangle' },
  green:   { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'CheckCircle2' },
  emerald: { bar: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200',    icon: 'TrendingDown' },
  gray:    { bar: 'bg-slate-300',   badge: 'bg-slate-50 text-slate-600 border-slate-200', icon: 'HelpCircle' },
};

function PricingTab() {
  const [form, setForm] = useState({ category: 'office', deal: 'rent', area: '', price: '', district: '' });
  const [result, setResult] = useState<PriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const check = async () => {
    if (!form.area || !form.price) { toast.error('Введите площадь и цену'); return; }
    setLoading(true); setErr(''); setResult(null);
    try {
      const r = await fetch(PREDICT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mela_price_check', ...form, refresh: true }),
      }).then(r => r.json());
      if (r.error) { setErr(r.error); return; }
      setResult(r);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLoading(false); }
  };

  const v = result?.verdict;
  const c = v ? (COLOR_MAP[v.color] || COLOR_MAP.gray) : null;

  const marketMin = v?.market_min_price || 0;
  const marketMax = v?.market_max_price || 1;
  const userPrice = Number(form.price) || 0;
  const rangeWidth = marketMax - marketMin;
  const userPct = rangeWidth > 0 ? Math.max(0, Math.min(100, ((userPrice - marketMin) / rangeWidth) * 100)) : 50;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-border p-5">
        <h3 className="font-semibold text-base mb-4 flex items-center gap-2">
          <Icon name="Sparkles" size={18} className="text-purple-500" />
          AI-анализ рыночной цены
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-white">
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Тип сделки</label>
            <select value={form.deal} onChange={e => setForm(f => ({ ...f, deal: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-white">
              <option value="rent">Аренда</option>
              <option value="sale">Продажа</option>
              <option value="business">Готовый бизнес</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Район</label>
            <input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
              placeholder="Центральный" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Площадь, м²</label>
            <input type="number" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
              placeholder="100" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Цена, ₽</label>
            <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              placeholder="500000" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end">
            <button onClick={check} disabled={loading}
              className="w-full bg-brand-blue text-white rounded-xl px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              <Icon name={loading ? 'Loader2' : 'Sparkles'} size={15} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Анализ…' : 'Проверить'}
            </button>
          </div>
        </div>
        {err && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{err}</div>}
      </div>

      {result && v && c && (
        <div className="space-y-4">
          {/* Вердикт */}
          <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border ${c.badge}`}>
            <Icon name={c.icon} size={20} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold">{v.label}{v.delta_pct !== 0 && ` (${v.delta_pct > 0 ? '+' : ''}${v.delta_pct.toFixed(0)}%)`}</div>
              <div className="text-sm opacity-80 mt-0.5">{v.comment}</div>
            </div>
          </div>

          {/* Визуализация диапазона */}
          {marketMin > 0 && marketMax > 0 && (
            <div className="bg-white rounded-2xl border border-border p-4">
              <div className="text-sm font-semibold mb-3">Позиция в рыночном диапазоне</div>
              <div className="relative h-6 bg-gradient-to-r from-blue-100 via-emerald-100 to-red-100 rounded-full mb-1">
                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground border-2 border-white shadow transition-all"
                  style={{ left: `calc(${userPct}% - 6px)` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Мин: {fmtMoney(marketMin)}</span>
                <span className="font-semibold text-foreground">Ваша: {fmtMoney(userPrice)}</span>
                <span>Макс: {fmtMoney(marketMax)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                {v.market_median_per_m2 && (
                  <div className="bg-muted/30 rounded-xl px-3 py-2">
                    <div className="text-xs text-muted-foreground">Медиана ₽/м²</div>
                    <div className="font-semibold">{v.market_median_per_m2.toLocaleString('ru')} ₽</div>
                  </div>
                )}
                {v.user_price_per_m2 && (
                  <div className="bg-muted/30 rounded-xl px-3 py-2">
                    <div className="text-xs text-muted-foreground">Ваша ₽/м²</div>
                    <div className="font-semibold">{v.user_price_per_m2.toLocaleString('ru')} ₽</div>
                  </div>
                )}
              </div>
              {v.suggested_price && (
                <div className="mt-3 flex items-center justify-between bg-brand-blue/5 border border-brand-blue/20 rounded-xl px-3 py-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Рекомендованная цена</div>
                    <div className="font-semibold text-brand-blue">{fmtMoney(v.suggested_price)}</div>
                  </div>
                  <Icon name="Wand2" size={18} className="text-brand-blue opacity-50" />
                </div>
              )}
            </div>
          )}

          {/* Аналоги */}
          {result.analogs.length > 0 && (
            <div className="bg-white rounded-2xl border border-border p-4">
              <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Icon name="Building2" size={15} className="text-muted-foreground" />
                Аналоги на рынке ({result.analogs_count})
              </div>
              <div className="grid gap-2">
                {result.analogs.slice(0, 5).map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-muted/20 rounded-xl px-3 py-2">
                    <div>
                      <span className="font-medium">{fmtMoney(a.price)}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{a.area} м²</span>
                      {a.district && <span className="text-muted-foreground ml-2 text-xs">· {a.district}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{a.price_per_m2.toLocaleString('ru')} ₽/м²</div>
                  </div>
                ))}
              </div>
              {result.sources.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {result.sources.map(s => (
                    <span key={s} className="text-[10px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground">{s}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Вкладка: UTM-конструктор ──────────────────────────────────────────────────

const UTM_SOURCES = ['avito', 'cian', 'yandex', 'google', 'vk', 'telegram', 'email', 'sms'];
const UTM_MEDIUMS = ['cpc', 'organic', 'social', 'email', 'referral', 'banner'];
const UTM_CAMPAIGNS_PRESET = ['spring_2025', 'office_rent', 'building_sale', 'hot_objects', 'promo'];

function UtmTab() {
  const [base, setBase] = useState('https://bmn.su/');
  const [source, setSource] = useState('avito');
  const [medium, setMedium] = useState('cpc');
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');
  const [term, setTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('utm_history') || '[]'); } catch { return []; }
  });

  const utmUrl = (() => {
    try {
      const url = new URL(base);
      if (source) url.searchParams.set('utm_source', source);
      if (medium) url.searchParams.set('utm_medium', medium);
      if (campaign) url.searchParams.set('utm_campaign', campaign);
      if (content) url.searchParams.set('utm_content', content);
      if (term) url.searchParams.set('utm_term', term);
      return url.toString();
    } catch { return base; }
  })();

  const copy = () => {
    navigator.clipboard.writeText(utmUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      const next = [utmUrl, ...history.filter(h => h !== utmUrl)].slice(0, 10);
      setHistory(next);
      try { localStorage.setItem('utm_history', JSON.stringify(next)); } catch { /* */ }
      toast.success('Ссылка скопирована');
    });
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Icon name="Link" size={18} className="text-brand-blue" /> UTM-конструктор ссылок
        </h3>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Базовый URL</label>
          <input value={base} onChange={e => setBase(e.target.value)}
            placeholder="https://bmn.su/listing/123"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">utm_source *</label>
            <div className="flex gap-1 flex-wrap mb-1">
              {UTM_SOURCES.map(s => (
                <button key={s} type="button" onClick={() => setSource(s)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition ${source === s ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted/50'}`}>
                  {s}
                </button>
              ))}
            </div>
            <input value={source} onChange={e => setSource(e.target.value)}
              placeholder="avito" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">utm_medium *</label>
            <div className="flex gap-1 flex-wrap mb-1">
              {UTM_MEDIUMS.map(m => (
                <button key={m} type="button" onClick={() => setMedium(m)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition ${medium === m ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted/50'}`}>
                  {m}
                </button>
              ))}
            </div>
            <input value={medium} onChange={e => setMedium(e.target.value)}
              placeholder="cpc" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">utm_campaign</label>
            <div className="flex gap-1 flex-wrap mb-1">
              {UTM_CAMPAIGNS_PRESET.map(c => (
                <button key={c} type="button" onClick={() => setCampaign(c)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition ${campaign === c ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted/50'}`}>
                  {c}
                </button>
              ))}
            </div>
            <input value={campaign} onChange={e => setCampaign(e.target.value)}
              placeholder="название_кампании" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">utm_content</label>
            <input value={content} onChange={e => setContent(e.target.value)}
              placeholder="баннер_1 / кнопка" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">utm_term</label>
            <input value={term} onChange={e => setTerm(e.target.value)}
              placeholder="аренда офис краснодар" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Результат */}
        <div className="bg-muted/30 rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-1">Готовая ссылка</div>
          <div className="text-sm break-all font-mono text-foreground/80 leading-relaxed">{utmUrl}</div>
        </div>

        <button onClick={copy}
          className="w-full bg-brand-blue text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
          <Icon name={copied ? 'Check' : 'Copy'} size={15} />
          {copied ? 'Скопировано!' : 'Скопировать ссылку'}
        </button>
      </div>

      {/* История */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">История ссылок</h4>
            <button onClick={() => { setHistory([]); localStorage.removeItem('utm_history'); }}
              className="text-xs text-muted-foreground hover:text-red-500 transition">Очистить</button>
          </div>
          <div className="space-y-1.5">
            {history.map((url, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate font-mono text-muted-foreground">{url}</span>
                <button onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Скопировано'))}
                  className="flex-shrink-0 text-brand-blue hover:underline">копировать</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Главный компонент ─────────────────────────────────────────────────────────

type Tab = 'analytics' | 'pricing' | 'seo-audit' | 'seo-tech' | 'utm';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'analytics',  label: 'Аналитика',         icon: 'BarChart3' },
  { id: 'pricing',    label: 'Ценообразование',    icon: 'Sparkles' },
  { id: 'seo-audit',  label: 'SEO-аудит',          icon: 'ShieldCheck' },
  { id: 'seo-tech',   label: 'Технический SEO',    icon: 'FileCode2' },
  { id: 'utm',        label: 'UTM-ссылки',         icon: 'Link' },
];

export default function MarketingAdmin() {
  const [tab, setTab] = useState<Tab>('analytics');

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
          <Icon name="Megaphone" size={20} className="text-brand-blue" />
        </div>
        <div>
          <h2 className="text-lg font-bold leading-none">Маркетолог</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Аналитика, ценообразование, SEO и UTM-ссылки</p>
        </div>
      </div>

      {/* Вкладки */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex-shrink-0 ${
              tab === t.id
                ? 'bg-brand-blue text-white shadow-sm'
                : 'bg-white border border-border text-foreground/70 hover:bg-muted/50'
            }`}>
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Контент */}
      {tab === 'analytics'  && <AnalyticsTab />}
      {tab === 'pricing'    && <PricingTab />}
      {tab === 'seo-audit'  && <SeoAuditTab />}
      {tab === 'seo-tech'   && <SeoTechnicalTab />}
      {tab === 'utm'        && <UtmTab />}
    </div>
  );
}
