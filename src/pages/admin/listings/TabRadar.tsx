import { useEffect, useState, useCallback } from 'react';
import { adminApi, getToken, crmUrl } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing } from './types';
import { StatData, InternalCardLead, HistoryRow, fmt } from './internalCardTypes';
import { Spinner } from './TabOverview';
import LocationScoreWidget from '@/components/property/LocationScoreWidget';
import { MultiStats, BudgetItem, Deal, parsePriceChange, PRIORITY_CFG } from './radarTypes';
import RadarBudgetSeoRow from './RadarBudgetSeoRow';
import RadarPricePlatformsRow from './RadarPricePlatformsRow';
import { RadarLeadsDealsRow, RadarRecentChanges } from './RadarActivityBlocks';

const SMART_BUDGET_URL = 'https://functions.poehali.dev/1d84bd40-ef8c-4bd3-82c3-af294b1ec0b1?module=smart_budget';
const STATS_URL = 'https://functions.poehali.dev/1d84bd40-ef8c-4bd3-82c3-af294b1ec0b1';

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
    !!(listing as unknown as Record<string, unknown>).lat && !!(listing as unknown as Record<string, unknown>).lng,
    listing.images && (listing.images as unknown as string[]).length > 0,
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

      <RadarBudgetSeoRow
        listing={listing}
        budgetItem={budgetItem}
        prc={prc}
        daysOnMarket={daysOnMarket}
        seoPoints={seoPoints}
        seoColor={seoColor}
        seoBg={seoBg}
      />

      <RadarPricePlatformsRow
        listing={listing}
        multiStats={multiStats}
        chartData={chartData}
        priceRows={priceRows}
        platforms={platforms}
      />

      <RadarLeadsDealsRow leads={leads} deals={deals} />

      {/* ── Скоринг локации ── */}
      {!!listing.lat && !!listing.lng && (
        <LocationScoreWidget
          listingId={listingId}
          lat={listing.lat}
          lng={listing.lng}
          category={listing.category}
        />
      )}

      <RadarRecentChanges history={history} />

    </div>
  );
}
