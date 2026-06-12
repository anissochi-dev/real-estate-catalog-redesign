import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { MarketStats, CAT_LABELS, PREDICT_URL, fmtDate } from './types';
import { BATCH_STEPS, INITIAL_STATE, RefreshState } from './RefreshProgress';
import { getToken } from '@/lib/adminApi';

const DISTRICT_AI_URL = 'https://functions.poehali.dev/eddffe59-b37d-425e-90a3-59d12d44623f';

export type ViewMode = 'trend' | 'compare' | 'heatmap' | 'index';

export interface MarketDataState {
  data: MarketStats | null;
  loading: boolean;
  viewMode: ViewMode;
  filterDeal: 'sale' | 'rent';
  filterDistrict: string;
  filterDays: number;
  selectedCats: string[];
  refreshState: RefreshState;
  assigningDistricts: boolean;
  assignProgress: { processed: number; updated: number; remaining: number } | null;
  aggregating: boolean;
  trendData: Record<string, string | number>[];
  compareData: Record<string, string | number>[];
  heatmapData: {
    cats: string[];
    districts: string[];
    matrix: Record<string, Record<string, number | null>>;
  };
  heatIndexData: { category: string; change_pct: number; current: number; prev: number; analogs: number }[];
  dynamicDistricts: string[];
  setViewMode: (v: ViewMode) => void;
  setFilterDeal: (v: 'sale' | 'rent') => void;
  setFilterDistrict: (v: string) => void;
  setFilterDays: (v: number) => void;
  toggleCat: (cat: string) => void;
  runBatchChain: (force?: boolean) => Promise<void>;
  runAutoAssign: () => Promise<void>;
  runAggregate: () => Promise<void>;
  load: () => Promise<void>;
}

export function useMarketData(): MarketDataState {
  const [data, setData] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('trend');
  const [filterDeal, setFilterDeal] = useState<'sale' | 'rent'>('rent');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterDays, setFilterDays] = useState(180);
  const [selectedCats, setSelectedCats] = useState<string[]>(['office', 'retail', 'warehouse']);

  const [refreshState, setRefreshState] = useState<RefreshState>(INITIAL_STATE);

  const [assigningDistricts, setAssigningDistricts] = useState(false);
  const [assignProgress, setAssignProgress] = useState<{ processed: number; updated: number; remaining: number } | null>(null);
  const [aggregating, setAggregating] = useState(false);

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

  // ── Авто-цепочка батчей ───────────────────────────────────────────────────
  // Запускает все 6 батчей последовательно, обновляя прогресс после каждого.
  // Время каждого батча замеряется и используется для уточнения прогноза.

  const runBatchChain = useCallback(async (force = false) => {
    const startedAt = new Date();
    const batchTimes: number[] = [];

    // Вычисляем ориентировочное время завершения по эталонным оценкам
    const estTotalMs = BATCH_STEPS.reduce((a, s) => a + s.estSec * 1000, 0);
    const estimatedFinishAt = new Date(startedAt.getTime() + estTotalMs);

    setRefreshState({
      running: true,
      currentBatch: 0,
      completedBatches: [],
      startedAt,
      batchTimes: [],
      estimatedFinishAt,
      savedCount: null,
      finishedAt: null,
    });

    for (let batchIdx = 0; batchIdx < BATCH_STEPS.length; batchIdx++) {
      const batchStart = Date.now();

      // Обновляем: текущий батч
      setRefreshState(prev => ({ ...prev, currentBatch: batchIdx }));

      try {
        const r = await fetch(PREDICT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'price_market_refresh', force: force }),
        }).then(r => r.json());

        const elapsed = Date.now() - batchStart;
        batchTimes.push(elapsed);

        if (r.skipped) {
          const reasonRu = r.reason?.includes('not 1st day') ? 'Запуск возможен только 1-го числа. Нажмите «Обновить» ещё раз — это принудительный запуск.'
            : r.reason?.includes('already ran') ? 'Данные уже обновлялись в этом месяце. Нажмите «Обновить» для принудительного обновления.'
            : r.reason?.includes('enabled=false') ? 'Авто-обновление отключено в настройках.'
            : r.reason;
          toast.info(reasonRu);
          setRefreshState(INITIAL_STATE);
          return;
        }

        if (r.error) {
          toast.error(r.error);
          setRefreshState(prev => ({ ...prev, running: false }));
          return;
        }

        // Уточняем прогноз по реальным замерам
        const avgMs = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
        const remaining = BATCH_STEPS.length - batchIdx - 1;
        const updatedFinish = new Date(Date.now() + avgMs * remaining);

        const completedBatches = BATCH_STEPS.slice(0, batchIdx + 1).map(s => s.key);
        setRefreshState(prev => ({
          ...prev,
          completedBatches,
          batchTimes: [...batchTimes],
          estimatedFinishAt: remaining > 0 ? updatedFinish : prev.estimatedFinishAt,
        }));

        if (r.done) {
          // Цикл завершён
          const finishedAt = new Date();
          setRefreshState(prev => ({
            ...prev,
            running: false,
            currentBatch: -1,
            completedBatches: BATCH_STEPS.map(s => s.key),
            savedCount: r.saved ?? null,
            finishedAt,
          }));
          toast.success(`Готово — сохранено ${r.saved} снапшотов`);
          load();
          return;
        }

      } catch {
        toast.error('Ошибка при сборе данных');
        setRefreshState(prev => ({ ...prev, running: false }));
        return;
      }
    }
  }, [load]);

  // ── Агрегация market_listings → price_market_snapshots ────────────────────
  const runAggregate = useCallback(async () => {
    setAggregating(true);
    try {
      const r = await fetch(PREDICT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'aggregate_market_listings' }),
      }).then(r => r.json());
      if (r.error) { toast.error(r.error); return; }
      toast.success(`Агрегация завершена — обновлено ${r.saved} снапшотов`);
      load();
    } catch {
      toast.error('Ошибка агрегации');
    } finally {
      setAggregating(false);
    }
  }, [load]);

  // ── Авто-привязка районов по адресу через YandexGPT ───────────────────────
  // Запускает цепочку батчей по 20 объявлений до полного заполнения поля district.
  const runAutoAssign = useCallback(async () => {
    setAssigningDistricts(true);
    setAssignProgress({ processed: 0, updated: 0, remaining: 140 });
    let totalProcessed = 0;
    let totalUpdated = 0;

    while (true) {
      try {
        const r = await fetch(DISTRICT_AI_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
          body: JSON.stringify({ action: 'auto_assign', city: 'Краснодар', batch_size: 20 }),
        }).then(r => r.json());

        if (r.error) { toast.error(r.error); break; }

        totalProcessed += r.processed ?? 0;
        totalUpdated += r.updated ?? 0;
        setAssignProgress({ processed: totalProcessed, updated: totalUpdated, remaining: r.remaining ?? 0 });

        if (r.done || !r.remaining) break;
      } catch {
        toast.error('Ошибка при определении районов');
        break;
      }
    }

    setAssigningDistricts(false);
    toast.success(`Районы привязаны: ${totalUpdated} из ${totalProcessed} объявлений`);
    load();
  }, [load]);

  // ── Подготовка данных для графика тренда ──────────────────────────────────

  const dynamicDistricts = data?.available_districts ?? [];

  const trendData = (() => {
    if (!data?.snapshots.length) return [];
    const filtered = data.snapshots.filter(s =>
      s.deal === filterDeal &&
      s.district === filterDistrict &&
      selectedCats.includes(s.category) &&
      s.snapshot_date &&
      s.price_per_m2_median != null
    );
    const byDate: Record<string, Record<string, number>> = {};
    filtered.forEach(s => {
      const d = s.snapshot_date || '';
      if (!d) return;
      if (!byDate[d]) byDate[d] = {};
      if (s.price_per_m2_median) byDate[d][s.category] = s.price_per_m2_median;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: fmtDate(date), ...vals }));
  })();

  // ── Подготовка данных для сравнения районов ───────────────────────────────

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
        .filter(s =>
          s.category === cat &&
          s.deal === filterDeal &&
          s.district === filterDistrict &&
          s.price_per_m2_median != null &&
          s.price_per_m2_median > 0 &&
          s.snapshot_date
        )
        .sort((a, b) => (a.snapshot_date || '').localeCompare(b.snapshot_date || ''));
      if (snaps.length < 2) return;
      const first = snaps[0].price_per_m2_median ?? 0;
      const last  = snaps[snaps.length - 1].price_per_m2_median ?? 0;
      if (!first || !last) return;
      const change_pct = Math.round(((last - first) / first) * 100);
      result.push({
        category: cat,
        change_pct,
        current: last,
        prev: first,
        analogs: snaps[snaps.length - 1].analogs_count ?? 0,
      });
    });
    return result.sort((a, b) => b.change_pct - a.change_pct);
  })();

  const toggleCat = (cat: string) =>
    setSelectedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  return {
    data,
    loading,
    viewMode,
    filterDeal,
    filterDistrict,
    filterDays,
    selectedCats,
    refreshState,
    assigningDistricts,
    assignProgress,
    aggregating,
    trendData,
    compareData,
    heatmapData,
    heatIndexData,
    dynamicDistricts,
    setViewMode,
    setFilterDeal,
    setFilterDistrict,
    setFilterDays,
    toggleCat,
    runBatchChain,
    runAutoAssign,
    runAggregate,
    load,
  };
}