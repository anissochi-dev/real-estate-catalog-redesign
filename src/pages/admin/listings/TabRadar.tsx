import { useEffect, useState, useCallback } from 'react';
import { adminApi, getToken, crmUrl } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing, fmtDate } from './types';
import { StatData, InternalCardLead, HistoryRow, LEAD_STATUS, fmt } from './internalCardTypes';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Spinner } from './TabOverview';

const SMART_BUDGET_URL = 'https://functions.poehali.dev/3e599d66-bb63-498f-bf23-4069c3a06660';
const STATS_URL = 'https://functions.poehali.dev/1d84bd40-ef8c-4bd3-82c3-af294b1ec0b1';

interface MultiStats {
  listing_id: number;
  views_site: number;
  aggregated: { event_type: string; source: string; total: number; last_at: string }[];
  source_totals: Record<string, number>;
  event_totals: Record<string, number>;
  source_labels: Record<string, string>;
  event_labels: Record<string, string>;
  history: { id: number; event_type: string; source: string; count: number; recorded_at: string }[];
}

interface BudgetItem {
  id: number; priority: 'high' | 'medium' | 'low';
  days_on_market: number; views_total: number; leads_count: number;
  conversion: number; budget: number;
  channels: { name: string; color: string; budget: number }[];
}

interface Deal {
  id: number; title: string; stage_name: string; stage_color: string;
  amount: number | null; commission: number | null; created_at: string;
}

function parsePriceChange(raw: unknown): { oldP: number; newP: number } | null {
  try {
    const ch = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!ch) return null;
    const p = ch.price;
    if (p == null) return null;
    if (Array.isArray(p) && p.length >= 2) return { oldP: Number(p[0]), newP: Number(p[1]) };
    if (typeof p === 'object' && ('old' in p || 'new' in p)) return { oldP: Number(p.old ?? 0), newP: Number(p.new ?? 0) };
  } catch { /* ignore */ }
  return null;
}

const PRIORITY_CFG = {
  high:   { label: 'Срочно продвигать', cls: 'bg-red-50 border-red-200 text-red-700',    dot: 'bg-red-500',    icon: 'AlertCircle' },
  medium: { label: 'Рекомендуется',     cls: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-500',  icon: 'TrendingDown' },
  low:    { label: 'Норма',             cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', icon: 'CheckCircle2' },
};

function RadarBlock({ icon, title, children, className = '' }: {
  icon: string; title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-border p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon name={icon} size={15} className="text-brand-blue" />
        <span className="font-semibold text-sm">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function TabRadar({ listingId, listing }: { listingId: number; listing: Listing }) {
  const [stats, setStats] = useState<StatData | null>(null);
  const [multiStats, setMultiStats] = useState<MultiStats | null>(null);
  const [leads, setLeads] = useState<InternalCardLead[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [budgetItem, setBudgetItem] = useState<BudgetItem | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const [statsRaw, multiRaw, leadsRaw, histRaw, budgetRaw, dealsRaw] = await Promise.allSettled([
        adminApi.getListingStats(listingId),
        fetch(`${STATS_URL}?listing_id=${listingId}&history=1`, {
          headers: { 'X-Auth-Token': token },
        }).then(r => r.json()).catch(() => null),
        adminApi.listLeads(),
        adminApi.getListingHistory(listingId),
        fetch(SMART_BUDGET_URL).then(r => r.json()).catch(() => null),
        fetch(crmUrl('deals', null, null, { listing_id: String(listingId) }), {
          headers: { 'X-Auth-Token': token },
        }).then(r => r.json()).catch(() => null),
      ]);

      if (statsRaw.status === 'fulfilled') setStats(statsRaw.value?.stats ?? statsRaw.value);
      if (multiRaw.status === 'fulfilled' && multiRaw.value && !multiRaw.value.error) setMultiStats(multiRaw.value);
      if (leadsRaw.status === 'fulfilled') {
        const all: InternalCardLead[] = leadsRaw.value?.leads || [];
        setLeads(all.filter(l => l.listing_id === listingId));
      }
      if (histRaw.status === 'fulfilled') {
        const all: HistoryRow[] = (histRaw.value?.history || []).map((h: HistoryRow) => ({
          ...h,
          changes: typeof h.changes === 'string'
            ? (() => { try { return JSON.parse(h.changes as unknown as string); } catch { return null; } })()
            : h.changes,
        }));
        setHistory(all);
      }
      if (budgetRaw.status === 'fulfilled' && budgetRaw.value?.items) {
        const found = budgetRaw.value.items.find((i: BudgetItem) => i.id === listingId);
        setBudgetItem(found ?? null);
      }
      if (dealsRaw.status === 'fulfilled') {
        const arr = dealsRaw.value?.deals ?? dealsRaw.value;
        if (Array.isArray(arr)) setDeals(arr.filter((d: Deal & { listing_id?: number }) => d.listing_id === listingId));
      }
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;

  // Метрики
  const totalViews = stats?.total_views ?? 0;
  const totalLeads = stats?.total_leads ?? 0;
  const totalCalls = stats?.total_calls ?? 0;
  const totalQr    = stats?.total_qr ?? 0;
  const conversion = totalViews > 0 ? ((totalLeads / totalViews) * 100).toFixed(1) : '0';

  // SEO-оценка
  const seoScore = [
    !!listing.seo_title,
    !!listing.seo_description,
    !!listing.title,
    !!listing.description,
    !!(listing as Record<string, unknown>).lat && !!(listing as Record<string, unknown>).lng,
    listing.images && (listing.images as string[]).length > 0,
  ];
  const seoPoints = seoScore.filter(Boolean).length;
  const seoColor = seoPoints >= 5 ? 'text-emerald-600' : seoPoints >= 3 ? 'text-amber-500' : 'text-red-500';
  const seoBg = seoPoints >= 5 ? 'bg-emerald-50 border-emerald-200' : seoPoints >= 3 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  // История цен для мини-графика
  const priceRows = history.filter(h => parsePriceChange(h.changes) !== null);
  const chartData = (() => {
    const data: { date: string; price: number }[] = [];
    const firstPrice = parsePriceChange(priceRows[priceRows.length - 1]?.changes)?.oldP;
    if (firstPrice) data.push({ date: '—', price: firstPrice });
    [...priceRows].reverse().forEach(h => {
      const { newP } = parsePriceChange(h.changes)!;
      data.push({ date: new Date(h.created_at).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' }), price: newP });
    });
    return data;
  })();

  // Дней на рынке
  const daysOnMarket = budgetItem?.days_on_market ?? (() => {
    const created = history.find(h => h.action === 'created');
    if (!created) return null;
    return Math.floor((Date.now() - new Date(created.created_at).getTime()) / 86400000);
  })();

  // Площадки
  const platforms = [
    { key: 'export_avito', label: 'Авито', color: 'text-green-700 bg-green-50 border-green-200' },
    { key: 'export_yandex', label: 'Яндекс', color: 'text-red-700 bg-red-50 border-red-200' },
    { key: 'export_cian', label: 'ЦИАН', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  ];

  const prc = budgetItem ? PRIORITY_CFG[budgetItem.priority] : null;

  return (
    <div className="p-4 space-y-3 bg-muted/20">

      {/* ── Строка 1: KPI ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { icon: 'Eye',      label: 'Просмотров',   value: fmt(totalViews),  grad: 'from-brand-blue to-indigo-600' },
          { icon: 'Phone',    label: 'Звонков',      value: fmt(totalCalls),  grad: 'from-emerald-500 to-emerald-700' },
          { icon: 'Inbox',    label: 'Заявок',       value: fmt(totalLeads),  grad: 'from-brand-orange to-orange-600' },
          { icon: 'QrCode',   label: 'Переходов QR', value: fmt(totalQr),     grad: 'from-pink-500 to-rose-600' },
          { icon: 'Percent',  label: 'Конверсия',    value: `${conversion}%`, grad: 'from-violet-500 to-violet-700' },
        ].map(c => (
          <div key={c.label} className={`bg-gradient-to-br ${c.grad} text-white rounded-2xl p-4`}>
            <div className="flex items-center gap-1.5 text-xs opacity-80 mb-1">
              <Icon name={c.icon} size={12} /> {c.label}
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Строка 2: Умный бюджет + SEO-оценка ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Умный бюджет */}
        <RadarBlock icon="Wallet" title="Умный бюджет">
          {prc ? (
            <div className={`rounded-xl border px-3 py-2.5 ${prc.cls}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${prc.dot}`} />
                <span className="font-semibold text-sm">{prc.label}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="font-bold text-base">{budgetItem!.days_on_market}</div>
                  <div className="opacity-70">дней</div>
                </div>
                <div>
                  <div className="font-bold text-base">{budgetItem!.views_total}</div>
                  <div className="opacity-70">просмотров</div>
                </div>
                <div>
                  <div className="font-bold text-base">{budgetItem!.conversion.toFixed(1)}%</div>
                  <div className="opacity-70">конверсия</div>
                </div>
              </div>
              {budgetItem!.budget > 0 && (
                <div className="mt-2 pt-2 border-t border-current/10 text-xs">
                  Рекомендованный бюджет: <span className="font-bold">{fmt(budgetItem!.budget)} ₽/мес</span>
                </div>
              )}
              {budgetItem!.channels && budgetItem!.channels.length > 0 && (
                <div className="mt-2 space-y-1">
                  {budgetItem!.channels.map((ch, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 opacity-80">{ch.name}</span>
                      <span className="font-semibold">{fmt(ch.budget)} ₽</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-3 flex flex-col items-center gap-1">
              <Icon name="CheckCircle2" size={20} className="text-emerald-400" />
              {daysOnMarket !== null
                ? <span>{daysOnMarket} дней на рынке — всё в норме</span>
                : <span>Данные умного бюджета недоступны</span>
              }
            </div>
          )}
        </RadarBlock>

        {/* SEO-оценка */}
        <RadarBlock icon="Search" title="SEO-оценка">
          <div className={`rounded-xl border px-3 py-2.5 mb-3 ${seoBg}`}>
            <div className={`text-2xl font-bold ${seoColor}`}>{seoPoints}/6</div>
            <div className={`text-xs mt-0.5 ${seoColor} opacity-80`}>
              {seoPoints >= 5 ? 'Отличная оптимизация' : seoPoints >= 3 ? 'Требует доработки' : 'Нужно заполнить SEO'}
            </div>
          </div>
          <div className="space-y-1.5">
            {[
              { label: 'SEO-заголовок',   ok: !!listing.seo_title },
              { label: 'SEO-описание',     ok: !!listing.seo_description },
              { label: 'Название',         ok: !!listing.title },
              { label: 'Описание',         ok: !!listing.description },
              { label: 'Координаты',       ok: !!(listing as Record<string, unknown>).lat },
              { label: 'Фотографии',       ok: !!(listing.images && (listing.images as string[]).length > 0) },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                <Icon
                  name={item.ok ? 'CheckCircle2' : 'Circle'}
                  size={13}
                  className={item.ok ? 'text-emerald-500' : 'text-muted-foreground/40'}
                />
                <span className={item.ok ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
              </div>
            ))}
          </div>
        </RadarBlock>
      </div>

      {/* ── Строка 3: История цен + Площадки ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Мини-график истории цен */}
        <RadarBlock icon="TrendingDown" title="История цены">
          {chartData.length >= 2 ? (
            <>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="radarPriceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip
                    formatter={(v: number) => [`${fmt(v)} ₽`, 'Цена']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} fill="url(#radarPriceGrad)" dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {priceRows.slice(0, 3).map(h => {
                  const parsed = parsePriceChange(h.changes)!;
                  const diff = parsed.newP - parsed.oldP;
                  return (
                    <div key={h.id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(h.created_at).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                      <span className="font-mono">{fmt(parsed.oldP)} → {fmt(parsed.newP)} ₽</span>
                      <span className={diff < 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
                        {diff > 0 ? '+' : ''}{fmt(diff)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4 flex flex-col items-center gap-1">
              <Icon name="TrendingDown" size={20} className="opacity-30" />
              Цена ещё не менялась
            </div>
          )}
        </RadarBlock>

        {/* Площадки и CRM */}
        <div className="space-y-3">
          <RadarBlock icon="Globe" title="Публикация на площадках">
            <div className="space-y-2">
              {platforms.map(p => {
                const active = !!(listing as Record<string, unknown>)[p.key];
                return (
                  <div key={p.key} className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium ${
                    active ? p.color : 'bg-muted/30 border-border text-muted-foreground'
                  }`}>
                    <span>{p.label}</span>
                    <div className="flex items-center gap-1">
                      <Icon name={active ? 'CheckCircle2' : 'MinusCircle'} size={13} />
                      <span>{active ? 'Размещён' : 'Не размещён'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Просмотры по площадкам */}
            {multiStats && Object.keys(multiStats.source_totals).length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                <div className="text-xs text-muted-foreground font-semibold mb-1">Просмотры по источникам</div>
                {Object.entries(multiStats.source_totals).map(([src, cnt]) => (
                  <div key={src} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{multiStats.source_labels[src] || src}</span>
                    <span className="font-bold">{fmt(cnt)}</span>
                  </div>
                ))}
              </div>
            )}
          </RadarBlock>
        </div>
      </div>

      {/* ── Строка 4: Заявки + CRM-сделки ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Последние заявки */}
        <RadarBlock icon="Inbox" title={`Заявки (${leads.length})`}>
          {leads.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-3">Заявок по объекту нет</div>
          ) : (
            <div className="space-y-2">
              {leads.slice(0, 4).map(l => {
                const statusColors: Record<string, string> = {
                  new: 'bg-emerald-100 text-emerald-700',
                  in_progress: 'bg-amber-100 text-amber-700',
                  done: 'bg-blue-100 text-blue-700',
                  rejected: 'bg-red-100 text-red-700',
                  pending: 'bg-orange-100 text-orange-700',
                };
                return (
                  <div key={l.id} className="flex items-center gap-3 text-sm">
                    <div className="w-7 h-7 rounded-full bg-brand-blue/10 flex items-center justify-center shrink-0">
                      <Icon name="User" size={13} className="text-brand-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs truncate">{l.name}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtDate(l.created_at)}</div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${statusColors[l.status] || 'bg-muted text-muted-foreground'}`}>
                      {LEAD_STATUS[l.status] || l.status}
                    </span>
                  </div>
                );
              })}
              {leads.length > 4 && (
                <div className="text-xs text-muted-foreground text-center pt-1">
                  + ещё {leads.length - 4} заявок — откройте вкладку «Заявки»
                </div>
              )}
            </div>
          )}
        </RadarBlock>

        {/* CRM-сделки */}
        <RadarBlock icon="Handshake" title={`Сделки CRM (${deals.length})`}>
          {deals.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-3 flex flex-col items-center gap-1">
              <Icon name="Handshake" size={20} className="opacity-30" />
              Сделок по объекту нет
            </div>
          ) : (
            <div className="space-y-2">
              {deals.slice(0, 4).map(d => (
                <div key={d.id} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.stage_color || '#94a3b8' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{d.title}</div>
                    <div className="text-[10px] text-muted-foreground">{d.stage_name}</div>
                  </div>
                  {d.amount && (
                    <span className="text-xs font-bold text-brand-blue shrink-0">
                      {(d.amount / 1_000_000).toFixed(1)} млн
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </RadarBlock>
      </div>

      {/* ── Строка 5: Последние изменения ── */}
      <RadarBlock icon="Clock" title="Последние изменения объекта">
        {history.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-2">История пуста</div>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 5).map(h => {
              const ACTION_CFG: Record<string, { label: string; icon: string; color: string }> = {
                created:       { label: 'Создан',        icon: 'Plus',       color: 'text-emerald-600 bg-emerald-50' },
                updated:       { label: 'Изменён',       icon: 'Pencil',     color: 'text-blue-600 bg-blue-50' },
                price_changed: { label: 'Цена',          icon: 'TrendingDown', color: 'text-amber-600 bg-amber-50' },
                status_changed:{ label: 'Статус',        icon: 'RefreshCw',  color: 'text-violet-600 bg-violet-50' },
                archived:      { label: 'Архивирован',   icon: 'Archive',    color: 'text-orange-600 bg-orange-50' },
                photo_added:   { label: 'Фото добавлено', icon: 'Image',     color: 'text-sky-600 bg-sky-50' },
              };
              const cfg = ACTION_CFG[h.action] || { label: h.action, icon: 'Activity', color: 'text-muted-foreground bg-muted' };
              const fields = h.changes ? Object.keys(h.changes as Record<string, unknown>).slice(0, 3) : [];
              return (
                <div key={h.id} className="flex items-start gap-2.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cfg.color}`}>
                    <Icon name={cfg.icon} size={11} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold">{cfg.label}</span>
                      {fields.length > 0 && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {fields.join(', ')}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {h.user_name || '—'} · {fmtDate(h.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </RadarBlock>

    </div>
  );
}