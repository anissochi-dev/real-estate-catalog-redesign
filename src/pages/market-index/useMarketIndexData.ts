import { useState, useEffect, useCallback } from 'react';
import { PRICE_PREDICT_URL } from '@/lib/adminApi';
import { CAT_LABELS, fmtDate, type MarketStatsResponse } from './types';

const CUT_DATE_DAYS_BACK = 90;

export function useMarketIndexData() {
  const [data, setData] = useState<MarketStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterDeal, setFilterDeal] = useState<'sale' | 'rent'>('rent');
  const [selectedCats, setSelectedCats] = useState<string[]>(['office', 'retail', 'warehouse']);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'price_market_stats',
        deal: filterDeal,
        district: '',
        days: '180',
      });
      const r = await fetch(`${PRICE_PREDICT_URL}?${params}`).then(res => res.json());
      if (!r.error) setData(r);
    } catch {
      /* тихо игнорируем — страница покажет заглушку "нет данных" */
    } finally {
      setLoading(false);
    }
  }, [filterDeal]);

  useEffect(() => { load(); }, [load]);

  const toggleCat = (cat: string) =>
    setSelectedCats(prev => (prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]));

  const availableCats = data?.available_combos
    ? Array.from(new Set(data.available_combos.filter(c => c.deal === filterDeal).map(c => c.category)))
        .sort((a, b) => (CAT_LABELS[a] || a).localeCompare(CAT_LABELS[b] || b))
    : [];

  const dynamicDistricts = data?.available_districts ?? [];

  const cutDate = new Date(Date.now() - CUT_DATE_DAYS_BACK * 86400000).toISOString().slice(0, 10);

  const trendData = (() => {
    if (!data?.snapshots.length) return [];
    const filtered = data.snapshots.filter(s =>
      s.deal === filterDeal &&
      s.district === '' &&
      selectedCats.includes(s.category) &&
      s.snapshot_date >= cutDate &&
      s.price_per_m2_median != null
    );
    const byDate: Record<string, Record<string, number>> = {};
    filtered.forEach(s => {
      if (!byDate[s.snapshot_date]) byDate[s.snapshot_date] = {};
      if (s.price_per_m2_median) byDate[s.snapshot_date][s.category] = s.price_per_m2_median;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: fmtDate(date), ...vals }));
  })();

  const supplyData = (() => {
    if (!data?.snapshots.length) return [];
    const filtered = data.snapshots.filter(s =>
      s.deal === filterDeal &&
      s.district === '' &&
      selectedCats.includes(s.category) &&
      s.snapshot_date >= cutDate
    );
    const byDate: Record<string, Record<string, number>> = {};
    filtered.forEach(s => {
      if (!byDate[s.snapshot_date]) byDate[s.snapshot_date] = {};
      byDate[s.snapshot_date][s.category] = s.analogs_count ?? 0;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: fmtDate(date), ...vals }));
  })();

  const compareData = (() => {
    if (!data?.latest.length || !dynamicDistricts.length) return [];
    return dynamicDistricts.map(district => {
      const row: Record<string, string | number> = { district };
      selectedCats.forEach(cat => {
        const entry = data.latest.find(l => l.category === cat && l.deal === filterDeal && l.district === district && (l.analogs_count ?? 0) >= 3);
        if (entry?.price_per_m2_median) row[cat] = entry.price_per_m2_median;
      });
      return row;
    }).filter(r => Object.keys(r).length > 1);
  })();

  const cityLatest = data?.latest.filter(l => l.district === '' && l.deal === filterDeal) ?? [];
  const totalAnalogs = cityLatest.reduce((sum, l) => sum + (l.analogs_count ?? 0), 0);

  return {
    data,
    loading,
    filterDeal,
    setFilterDeal,
    selectedCats,
    toggleCat,
    availableCats,
    trendData,
    supplyData,
    compareData,
    totalAnalogs,
    updatedAt: data?.schedule?.last_at ?? null,
  };
}
