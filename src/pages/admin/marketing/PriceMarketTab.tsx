import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { MarketStats, CAT_LABELS, PREDICT_URL, fmtDate } from './price-market/types';
import MarketHeader from './price-market/MarketHeader';
import { TrendView, CompareView, HeatmapView, IndexView, ViewModeSwitcher } from './price-market/MarketViews';
import RefreshProgress, { BATCH_STEPS, INITIAL_STATE, RefreshState } from './price-market/RefreshProgress';
import { getToken } from '@/lib/adminApi';

const XLSX_URL = 'https://functions.poehali.dev/b498eec3-fbe9-46de-8f00-749fc3012e63';

const SOURCE_OPTIONS = [
  { value: 'cian', label: 'ЦИАН' },
  { value: 'avito', label: 'Авито' },
  { value: 'domclick', label: 'ДомКлик' },
  { value: 'manual', label: 'Другой источник' },
];

const CAT_RU: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', warehouse: 'Склад',
  free_purpose: 'ПСН', catering: 'Общепит', building: 'Здание',
  land: 'Земля', production: 'Производство', hotel: 'Гостиница',
  car_service: 'Автосервис', gab: 'ГАБ', other: 'Прочее',
};

interface ImportJob {
  id: number;
  status: 'pending' | 'downloading' | 'parsing' | 'running' | 'done' | 'error';
  rows_total: number | null;
  rows_done: number;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  error_msg: string | null;
  category_breakdown: Record<string, number> | null;
  source: string;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'В очереди…',
  downloading: 'Скачивание файла…',
  parsing: 'Чтение структуры…',
  running: 'Импорт строк…',
  done: 'Готово',
  error: 'Ошибка',
};

function ImportBlock() {
  const [fileUrl, setFileUrl] = useState('');
  const [source, setSource] = useState('cian');
  const [replace, setReplace] = useState(false);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<ImportJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => stopPoll(), []);

  const pollStatus = useCallback(async (jobId: number) => {
    try {
      const r = await fetch(XLSX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_market_status', job_id: jobId }),
      }).then(r => r.json());
      setJob(prev => ({ ...prev, ...r }));
      if (r.status === 'done') {
        stopPoll();
        toast.success(`Импорт завершён — добавлено ${r.rows_inserted} записей`);
      }
      if (r.status === 'error') {
        stopPoll();
        toast.error(`Ошибка импорта: ${r.error_msg}`);
      }
    } catch { /* игнорируем сетевые ошибки при поллинге */ }
  }, []);

  const handleStart = async () => {
    if (!fileUrl.trim()) { toast.error('Вставьте ссылку на файл'); return; }
    setStarting(true);
    try {
      const r = await fetch(XLSX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_market_start', file_url: fileUrl.trim(), source, replace }),
      }).then(r => r.json());
      if (r.error) { toast.error(r.error); return; }
      setJob({ id: r.job_id, status: 'pending', rows_total: null, rows_done: 0, rows_inserted: 0, rows_updated: 0, rows_skipped: 0, error_msg: null, category_breakdown: null, source, created_at: new Date().toISOString() });
      pollRef.current = setInterval(() => pollStatus(r.job_id), 3000);
    } catch { toast.error('Не удалось запустить импорт'); }
    finally { setStarting(false); }
  };

  const pct = job && job.rows_total ? Math.round((job.rows_done / job.rows_total) * 100) : null;

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <Icon name="FileSpreadsheet" size={16} className="text-brand-blue" />
        Импорт из XLSX (ЦИАН / Авито)
      </div>

      {/* Форма */}
      {!job || job.status === 'done' || job.status === 'error' ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Ссылка на файл (CDN)</label>
            <input
              value={fileUrl}
              onChange={e => setFileUrl(e.target.value)}
              placeholder="https://cdn.poehali.dev/..."
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Источник</label>
              <select
                value={source}
                onChange={e => setSource(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm bg-white"
              >
                {SOURCE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} className="rounded" />
                Заменить старые данные источника
              </label>
            </div>
          </div>
          <button
            onClick={handleStart}
            disabled={starting || !fileUrl.trim()}
            className="bg-brand-blue text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
          >
            {starting ? <><Icon name="Loader2" size={14} className="animate-spin" />Запуск…</> : <><Icon name="Upload" size={14} />Запустить импорт</>}
          </button>
          {job?.status === 'done' && (
            <p className="text-xs text-green-600">Последний импорт: добавлено {job.rows_inserted}, обновлено {job.rows_updated}</p>
          )}
        </div>
      ) : (
        /* Прогресс */
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              {job.status !== 'done' && job.status !== 'error' && (
                <Icon name="Loader2" size={14} className="animate-spin text-brand-blue" />
              )}
              <span className="font-medium">{STATUS_LABEL[job.status] ?? job.status}</span>
            </span>
            <span className="text-muted-foreground text-xs">
              {job.rows_total ? `${job.rows_done.toLocaleString()} / ${job.rows_total.toLocaleString()} строк` : `${job.rows_done.toLocaleString()} строк`}
            </span>
          </div>

          {/* Прогресс-бар */}
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-2 bg-brand-blue rounded-full transition-all duration-500"
              style={{ width: pct !== null ? `${pct}%` : (job.status === 'downloading' ? '10%' : job.status === 'parsing' ? '20%' : '30%') }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div className="bg-green-50 rounded-lg p-2">
              <div className="font-bold text-green-700">{job.rows_inserted.toLocaleString()}</div>
              <div className="text-muted-foreground">добавлено</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <div className="font-bold text-blue-700">{job.rows_updated.toLocaleString()}</div>
              <div className="text-muted-foreground">обновлено</div>
            </div>
            <div className="bg-muted rounded-lg p-2">
              <div className="font-bold">{job.rows_skipped.toLocaleString()}</div>
              <div className="text-muted-foreground">пропущено</div>
            </div>
          </div>

          {job.status === 'error' && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{job.error_msg}</p>
          )}

          {job.status === 'done' && job.category_breakdown && (
            <div className="text-xs space-y-1">
              <p className="font-medium text-muted-foreground">По категориям:</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(JSON.parse(typeof job.category_breakdown === 'string' ? job.category_breakdown : JSON.stringify(job.category_breakdown)))
                  .sort(([,a],[,b]) => (b as number) - (a as number))
                  .map(([cat, cnt]) => (
                    <span key={cat} className="bg-muted px-2 py-0.5 rounded-full text-xs">
                      {CAT_RU[cat] ?? cat}: {(cnt as number).toLocaleString()}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {(job.status === 'done' || job.status === 'error') && (
            <button onClick={() => { setJob(null); setFileUrl(''); }} className="text-xs text-muted-foreground underline">
              Новый импорт
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const DISTRICT_AI_URL = 'https://functions.poehali.dev/eddffe59-b37d-425e-90a3-59d12d44623f';

type ViewMode = 'trend' | 'compare' | 'heatmap' | 'index';

export default function PriceMarketTab() {
  const [data, setData] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(false);

  // Фильтры
  const [viewMode, setViewMode] = useState<ViewMode>('trend');
  const [filterDeal, setFilterDeal] = useState<'sale' | 'rent'>('rent');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterDays, setFilterDays] = useState(180);
  const [selectedCats, setSelectedCats] = useState<string[]>(['office', 'retail', 'warehouse']);

  // Состояние процесса обновления рыночных цен
  const [refreshState, setRefreshState] = useState<RefreshState>(INITIAL_STATE);

  // Состояние авто-привязки районов
  const [assigningDistricts, setAssigningDistricts] = useState(false);
  const [assignProgress, setAssignProgress] = useState<{ processed: number; updated: number; remaining: number } | null>(null);

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

    let isFirst = true;

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

        isFirst = false;
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

      } catch (e) {
        toast.error('Ошибка при сборе данных');
        setRefreshState(prev => ({ ...prev, running: false }));
        return;
      }
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
        refreshing={refreshState.running}
        assigningDistricts={assigningDistricts}
        assignProgress={assignProgress}
        filterDeal={filterDeal}
        filterDistrict={filterDistrict}
        filterDays={filterDays}
        dynamicDistricts={dynamicDistricts}
        onRefresh={() => runBatchChain(true)}
        onAutoAssign={runAutoAssign}
        onDealChange={setFilterDeal}
        onDistrictChange={setFilterDistrict}
        onDaysChange={setFilterDays}
      />

      {/* Прогресс обновления */}
      {(refreshState.running || refreshState.finishedAt) && (
        <RefreshProgress
          state={refreshState}
          onStart={() => runBatchChain(true)}
        />
      )}

      {/* Импорт XLSX */}
      <ImportBlock />

      {/* Нет данных */}
      {!loading && data?.snapshots.length === 0 && !refreshState.running && (
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <Icon name="BarChart2" size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground text-sm mb-3">Данных пока нет. Запустите сбор рыночных цен.</p>
          <button onClick={() => runBatchChain(true)} disabled={refreshState.running}
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