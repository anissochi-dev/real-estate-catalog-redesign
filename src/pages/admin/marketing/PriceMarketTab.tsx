import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { MarketStats, CAT_LABELS, PREDICT_URL, fmtDate } from './price-market/types';
import MarketHeader from './price-market/MarketHeader';
import { TrendView, CompareView, HeatmapView, IndexView, ViewModeSwitcher } from './price-market/MarketViews';

type ViewMode = 'trend' | 'compare' | 'heatmap' | 'index';

export default function PriceMarketTab() {
  const [data, setData] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Фильтры
  const [viewMode, setViewMode] = useState<ViewMode>('trend');
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

  const dynamicDistricts = data?.available_districts ?? [];

  const compareData = (() => {
    if (!data?.latest.length || !dynamicDistricts.length) return [];
    return dynamicDistricts.map(district => {
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
    const districtList = ['', ...dynamicDistricts];
    const matrix: Record<string, Record<string, number | null>> = {};
    cats.forEach(cat => {
      matrix[cat] = {};
      districtList.forEach(d => {
        const e = data.latest.find(l => l.category === cat && l.deal === filterDeal && l.district === d);
        matrix[cat][d || 'Все районы'] = e?.price_per_m2_median || null;
      });
    });
    return { cats, districts: districtList.map(d => d || 'Все районы'), matrix };
  })();

  // ── Индекс перегрева рынка ─────────────────────────────────────────────────

  const heatIndexData = (() => {
    if (!data?.snapshots.length) return [];
    const result: { category: string; change_pct: number; current: number; prev: number; analogs: number }[] = [];
    Object.keys(CAT_LABELS).forEach(cat => {
      const snaps = data.snapshots
        .filter(s => s.category === cat && s.deal === filterDeal && s.district === filterDistrict && s.price_per_m2_median)
        .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      if (snaps.length < 2) return;
      const first = snaps[0].price_per_m2_median!;
      const last = snaps[snaps.length - 1].price_per_m2_median!;
      const change_pct = Math.round(((last - first) / first) * 100);
      result.push({
        category: cat,
        change_pct,
        current: last,
        prev: first,
        analogs: snaps[snaps.length - 1].analogs_count,
      });
    });
    return result.sort((a, b) => b.change_pct - a.change_pct);
  })();

  const toggleCat = (cat: string) =>
    setSelectedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  return (
    <div className="space-y-4">
      {/* Заголовок + статус расписания + фильтры */}
      <MarketHeader
        data={data}
        loading={loading}
        refreshing={refreshing}
        filterDeal={filterDeal}
        filterDistrict={filterDistrict}
        filterDays={filterDays}
        dynamicDistricts={dynamicDistricts}
        onRefresh={runRefresh}
        onDealChange={setFilterDeal}
        onDistrictChange={setFilterDistrict}
        onDaysChange={setFilterDays}
      />

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
          <ViewModeSwitcher viewMode={viewMode} onSwitch={setViewMode} />

          {viewMode === 'trend' && (
            <TrendView
              trendData={trendData}
              selectedCats={selectedCats}
              onToggleCat={toggleCat}
            />
          )}

          {viewMode === 'compare' && (
            <CompareView
              compareData={compareData}
              selectedCats={selectedCats}
              onToggleCat={toggleCat}
            />
          )}

          {viewMode === 'heatmap' && (
            <HeatmapView heatmapData={heatmapData} />
          )}

          {viewMode === 'index' && (
            <IndexView
              heatIndexData={heatIndexData}
              data={data}
              filterDeal={filterDeal}
              filterDistrict={filterDistrict}
            />
          )}
        </>
      )}
    </div>
  );
}
