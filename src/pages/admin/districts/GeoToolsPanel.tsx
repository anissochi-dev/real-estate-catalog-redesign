import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { loadGeoConfig } from '../settings/geoConfig';
import Icon from '@/components/ui/icon';

const GEO_FIX_URL = 'https://functions.poehali.dev/9b2f9622-9d12-4809-a614-023af6958251';

type GeoOkrugResult = {
  total_streets: number; matched_count: number; not_found_count: number;
  results: { street: string; okrug: string | null; suburb: string; city_district: string; provider: string | null }[];
  provider_stats: Record<string, number>;
  provider_limits_remaining: Record<string, number>;
};

type GeoFixResult = {
  changed_count: number; unchanged_count: number; not_found_count: number;
  changed: { id: number; address: string; district_old: string; district_new: string }[];
};

type StreetItem = { street: string; base: string };
type OsmMeta = { osm_total: number; in_map: number; missing_count: number };

const ALL_PROVIDERS = [
  { id: 'yandex',    label: 'Яндекс' },
  { id: 'dadata',    label: 'DaData' },
  { id: 'maps_co',   label: 'maps.co' },
  { id: 'nominatim', label: 'Nominatim' },
];

const GEO_OKRUG_BATCHES = [30, 50, 70, 90, 110, 150, 200];
const OSM_BATCH = 20;

interface Props {
  // toolbar button state — lifted to parent for button rendering
  geoOkrugLoading: boolean;
  geoOkrugBatch: number;
  setGeoOkrugBatch: (v: number) => void;
  onGeoOkrugPreview: () => void;
  geoFixLoading: boolean;
  onGeoFixPreview: () => void;
  osmLoading: boolean;
  osmOpen: boolean;
  osmMeta: OsmMeta | null;
  osmAddedTotal: number;
  osmRunAll: boolean;
  onOsmToggle: () => void;
  // result panels
  geoOkrugResult: GeoOkrugResult | null;
  onGeoOkrugClose: () => void;
  onGeoOkrugApply: () => void;
  geoOkrugApplying: boolean;
  geoFixResult: GeoFixResult | null;
  onGeoFixClose: () => void;
  onGeoFixApply: () => void;
  geoFixApplying: boolean;
  // osm panel internals
  osmError: string | null;
  osmCurrentBatch: StreetItem[];
  osmQueue: StreetItem[];
  osmAdding: boolean;
  osmSkippedTotal: number;
  osmProgress: { done: number; total: number };
  stopRef: React.MutableRefObject<boolean>;
  onOsmLoadForce: () => void;
  onOsmAddBatch: () => void;
  onOsmRunAll: () => void;
  onOsmStop: () => void;
  onOsmClose: () => void;
}

export function GeoOkrugResultPanel({ result, applying, onClose, onApply }: {
  result: GeoOkrugResult; applying: boolean; onClose: () => void; onApply: () => void;
}) {
  return (
    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-orange-800 flex items-center gap-2">
            <Icon name="Globe" size={16} /> Округа по улицам
          </div>
          <div className="text-sm text-orange-700 mt-0.5">
            Улиц обработано: <b>{result.total_streets}</b> &nbsp;·&nbsp;
            Округ определён: <b>{result.matched_count}</b> &nbsp;·&nbsp;
            Не определено: <b>{result.not_found_count}</b>
          </div>
          {result.provider_stats && (
            <div className="flex gap-2 mt-1 flex-wrap">
              {Object.entries(result.provider_stats).filter(([, v]) => v > 0).map(([p, v]) => (
                <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                  {ALL_PROVIDERS.find(x => x.id === p)?.label ?? p}: {v}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-100 transition">
            Закрыть
          </button>
          {result.matched_count > 0 && (
            <button onClick={onApply} disabled={applying}
              className="text-sm px-4 py-1.5 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 transition disabled:opacity-50 flex items-center gap-1.5">
              <Icon name={applying ? 'Loader2' : 'Check'} size={14} className={applying ? 'animate-spin' : ''} />
              Сохранить {result.matched_count} округов
            </button>
          )}
        </div>
      </div>
      {result.results.length > 0 && (
        <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-orange-50 text-orange-700 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">Улица</th>
                <th className="text-left px-3 py-2">Округ</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">Suburb</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">City district</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">Источник</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-50">
              {result.results.map((r, i) => (
                <tr key={i} className={r.okrug ? '' : 'opacity-50'}>
                  <td className="px-3 py-2 font-medium">{r.street}</td>
                  <td className="px-3 py-2">
                    {r.okrug
                      ? <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold">{r.okrug}</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{r.suburb || '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{r.city_district || '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{r.provider || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function GeoFixResultPanel({ result, applying, onClose, onApply }: {
  result: GeoFixResult; applying: boolean; onClose: () => void; onApply: () => void;
}) {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-emerald-800 flex items-center gap-2">
            <Icon name="MapPinCheck" size={16} /> Исправление районов объектов
          </div>
          <div className="text-sm text-emerald-700 mt-0.5">
            Будет изменено: <b>{result.changed_count}</b> &nbsp;·&nbsp;
            Без изменений: <b>{result.unchanged_count}</b> &nbsp;·&nbsp;
            Не найдено: <b>{result.not_found_count}</b>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition">
            Отмена
          </button>
          {result.changed_count > 0 && (
            <button onClick={onApply} disabled={applying}
              className="text-sm px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-1.5">
              <Icon name={applying ? 'Loader2' : 'Check'} size={14} className={applying ? 'animate-spin' : ''} />
              Применить {result.changed_count} исправлений
            </button>
          )}
        </div>
      </div>
      {result.changed.length > 0 && (
        <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-emerald-50 text-emerald-700 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Адрес</th>
                <th className="px-3 py-2 text-left">Было</th>
                <th className="px-3 py-2 text-left">Станет</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100">
              {result.changed.map(r => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-muted-foreground font-mono">#{r.id}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{r.address}</td>
                  <td className="px-3 py-2 text-red-600 line-through text-xs">{r.district_old}</td>
                  <td className="px-3 py-2 text-emerald-700 font-semibold text-xs">{r.district_new}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function OsmPanel({
  osmError, osmMeta, osmCurrentBatch, osmQueue, osmAdding, osmRunAll, osmLoading,
  osmAddedTotal, osmSkippedTotal, osmProgress,
  onLoadForce, onAddBatch, onRunAll, onStop, onClose, stopRef,
}: {
  osmError: string | null; osmMeta: OsmMeta | null;
  osmCurrentBatch: StreetItem[]; osmQueue: StreetItem[];
  osmAdding: boolean; osmRunAll: boolean; osmLoading: boolean;
  osmAddedTotal: number; osmSkippedTotal: number;
  osmProgress: { done: number; total: number };
  onLoadForce: () => void; onAddBatch: () => void; onRunAll: () => void;
  onStop: () => void; onClose: () => void;
  stopRef: React.MutableRefObject<boolean>;
}) {
  if (osmError && !osmMeta) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Icon name="AlertTriangle" size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-red-800 mb-1">Ошибка загрузки из OpenStreetMap</div>
            <div className="text-sm text-red-700 mb-3">{osmError}</div>
            <div className="text-xs text-red-600 mb-3">
              Серверы OpenStreetMap иногда перегружены. Подождите 1–2 минуты и попробуйте снова.
            </div>
            <button
              onClick={onLoadForce}
              disabled={osmLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50">
              <Icon name={osmLoading ? 'Loader2' : 'RefreshCw'} size={14} className={osmLoading ? 'animate-spin' : ''} />
              {osmLoading ? 'Загружаю...' : 'Попробовать снова'}
            </button>
          </div>
          <button onClick={onClose} className="text-red-300 hover:text-red-500">
            <Icon name="X" size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (!osmMeta) return null;

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-sky-800 flex items-center gap-2">
            <Icon name="Map" size={16} /> Улицы из OpenStreetMap
          </div>
          <div className="text-sm text-sky-700 mt-0.5">
            Всего в OSM: <b>{osmMeta.osm_total}</b> &nbsp;·&nbsp;
            Уже в справочнике: <b>{osmMeta.in_map + osmAddedTotal}</b> &nbsp;·&nbsp;
            Осталось добавить: <b>{Math.max(0, osmMeta.missing_count - osmAddedTotal)}</b>
            {osmAddedTotal > 0 && <> &nbsp;·&nbsp; Добавлено: <b className="text-emerald-700">{osmAddedTotal}</b></>}
            {osmSkippedTotal > 0 && <> &nbsp;·&nbsp; Без района: <b className="text-amber-600">{osmSkippedTotal}</b></>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onLoadForce}
            disabled={osmLoading || osmRunAll}
            title="Обновить список из OSM (сбросит прогресс)"
            className="text-sky-400 hover:text-sky-600 disabled:opacity-30">
            <Icon name={osmLoading ? 'Loader2' : 'RefreshCw'} size={15} className={osmLoading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} disabled={osmRunAll}
            className="text-sky-400 hover:text-sky-600 disabled:opacity-30">
            <Icon name="X" size={16} />
          </button>
        </div>
      </div>

      {(osmRunAll || osmAddedTotal > 0) && osmProgress.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-sky-700">
            <span>{osmRunAll ? 'Обрабатываю...' : 'Прогресс'}</span>
            <span>{osmProgress.done} / {osmProgress.total}</span>
          </div>
          <div className="h-2.5 bg-sky-200 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (osmProgress.done / osmProgress.total) * 100)}%` }} />
          </div>
        </div>
      )}

      {osmCurrentBatch.length > 0 ? (
        <>
          <div className="bg-white rounded-xl border border-sky-200 overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-sky-50 text-sky-700 text-xs uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left">Улица</th>
                  <th className="px-3 py-2 text-left hidden sm:table-cell">Основа для маппинга</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-50">
                {osmCurrentBatch.map((s, i) => (
                  <tr key={i} className="hover:bg-sky-50/50">
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{s.street}</td>
                    <td className="px-3 py-1.5 text-muted-foreground text-xs hidden sm:table-cell">{s.base}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {!osmRunAll ? (
              <>
                <button onClick={onRunAll} disabled={osmAdding || osmLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-700 text-white text-sm font-semibold hover:bg-sky-800 transition disabled:opacity-50">
                  <Icon name="PlayCircle" size={14} />
                  Запустить все {osmQueue.length} улиц автоматически
                </button>
                <button onClick={onAddBatch} disabled={osmAdding || osmLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-sky-300 text-sky-700 text-sm hover:bg-sky-100 transition disabled:opacity-50">
                  <Icon name={osmAdding ? 'Loader2' : 'Sparkles'} size={14} className={osmAdding ? 'animate-spin' : ''} />
                  {osmAdding ? 'Добавляю...' : `Батч из ${osmCurrentBatch.length}`}
                </button>
              </>
            ) : (
              <button onClick={onStop}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition">
                <Icon name="StopCircle" size={14} />
                Остановить
              </button>
            )}
            <span className="text-xs text-sky-600">
              В очереди: {osmQueue.length} улиц
            </span>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-emerald-700 py-1">
            <Icon name="CheckCircle2" size={16} className="text-emerald-500" />
            Очередь обработана. Добавлено: <b>{osmAddedTotal}</b>
            {osmSkippedTotal > 0 && (
              <span className="text-amber-600 ml-1">· не определён район: <b>{osmSkippedTotal}</b></span>
            )}
          </div>
          {osmSkippedTotal > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Для пропущенных улиц DaData не вернул район. Это нормально для частных секторов и новых улиц.
              Нажмите <b>↺</b> чтобы загрузить обновлённый список и повторить.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Hook encapsulating all geo tools state and handlers
export function useGeoTools() {
  const [geoOkrugLoading, setGeoOkrugLoading] = useState(false);
  const [geoOkrugResult, setGeoOkrugResult] = useState<GeoOkrugResult | null>(null);
  const [geoOkrugApplying, setGeoOkrugApplying] = useState(false);
  const [geoOkrugBatch, setGeoOkrugBatch] = useState(30);

  const [geoFixLoading, setGeoFixLoading] = useState(false);
  const [geoFixResult, setGeoFixResult] = useState<GeoFixResult | null>(null);
  const [geoFixApplying, setGeoFixApplying] = useState(false);

  const [osmLoading, setOsmLoading] = useState(false);
  const [osmError, setOsmError] = useState<string | null>(null);
  const [osmOpen, setOsmOpen] = useState(false);
  const [osmMeta, setOsmMeta] = useState<OsmMeta | null>(null);
  const [osmQueue, setOsmQueue] = useState<StreetItem[]>([]);
  const [osmCurrentBatch, setOsmCurrentBatch] = useState<StreetItem[]>([]);
  const [osmAdding, setOsmAdding] = useState(false);
  const [osmRunAll, setOsmRunAll] = useState(false);
  const [osmAddedTotal, setOsmAddedTotal] = useState(0);
  const [osmSkippedTotal, setOsmSkippedTotal] = useState(0);
  const [osmProgress, setOsmProgress] = useState({ done: 0, total: 0 });
  const stopRef = useRef(false);

  const geoOkrugPayload = (mode: string) => {
    const cfg = loadGeoConfig();
    return { action: 'geo_okrug', mode, limit: geoOkrugBatch, providers: cfg.providers, provider_limits: cfg.limits };
  };

  const handleGeoOkrugPreview = async () => {
    setGeoOkrugLoading(true); setGeoOkrugResult(null);
    try {
      const res = await fetch(GEO_FIX_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geoOkrugPayload('preview')) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      setGeoOkrugResult(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка проверки округов');
    } finally { setGeoOkrugLoading(false); }
  };

  const handleGeoOkrugApply = async () => {
    if (!window.confirm(`Применить округа для ${geoOkrugResult?.matched_count} улиц?`)) return;
    setGeoOkrugApplying(true);
    try {
      const res = await fetch(GEO_FIX_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geoOkrugPayload('apply')) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      toast.success(`Округа присвоены для ${data.matched_count} улиц`);
      setGeoOkrugResult(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка применения');
    } finally { setGeoOkrugApplying(false); }
  };

  const handleGeoFixPreview = async () => {
    setGeoFixLoading(true); setGeoFixResult(null);
    try {
      const res = await fetch(GEO_FIX_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fix', mode: 'preview' }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      setGeoFixResult(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка проверки');
    } finally { setGeoFixLoading(false); }
  };

  const handleGeoFixApply = async () => {
    if (!window.confirm(`Применить исправления районов для ${geoFixResult?.changed_count} объектов?`)) return;
    setGeoFixApplying(true);
    try {
      const res = await fetch(GEO_FIX_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fix', mode: 'apply' }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      toast.success(`Исправлено районов: ${data.changed_count}`);
      setGeoFixResult(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка применения');
    } finally { setGeoFixApplying(false); }
  };

  const handleOsmLoad = async (force = false) => {
    if (!force && osmMeta) { setOsmOpen(true); return; }
    setOsmLoading(true); setOsmError(null);
    try {
      const res = await fetch(GEO_FIX_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'overpass_streets', offset: 0, limit: 2500 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOsmMeta({ osm_total: data.osm_total, in_map: data.in_map, missing_count: data.missing_count });
      setOsmQueue(data.missing || []);
      setOsmCurrentBatch((data.missing || []).slice(0, OSM_BATCH));
      setOsmAddedTotal(0); setOsmSkippedTotal(0);
      setOsmProgress({ done: 0, total: data.missing_count });
      setOsmOpen(true);
    } catch (e) {
      setOsmError(e instanceof Error ? e.message : 'Ошибка загрузки OSM');
      setOsmOpen(true);
    } finally { setOsmLoading(false); }
  };

  const handleOsmAddBatch = async () => {
    if (!osmCurrentBatch.length) return;
    setOsmAdding(true);
    try {
      const res = await fetch(GEO_FIX_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_map_streets', streets: osmCurrentBatch }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const added = data.added_count || 0;
      const skipped = data.skipped_count || 0;
      const newTotal = osmAddedTotal + added;
      setOsmAddedTotal(newTotal);
      setOsmSkippedTotal(v => v + skipped);
      toast.success(`Добавлено ${added} улиц${skipped > 0 ? `, пропущено ${skipped}` : ''}`);
      const remaining = osmQueue.slice(OSM_BATCH);
      setOsmQueue(remaining);
      setOsmCurrentBatch(remaining.slice(0, OSM_BATCH));
      setOsmProgress({ done: newTotal, total: osmMeta?.missing_count ?? 0 });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка ИИ'); }
    finally { setOsmAdding(false); }
  };

  const handleOsmRunAll = async () => {
    if (!osmQueue.length) return;
    stopRef.current = false;
    setOsmRunAll(true);
    let queue = [...osmQueue];
    let totalAdded = osmAddedTotal;
    let totalSkipped = osmSkippedTotal;
    const grandTotal = osmMeta?.missing_count ?? queue.length;
    try {
      while (queue.length > 0) {
        if (stopRef.current) { toast('Остановлено'); break; }
        const batch = queue.slice(0, OSM_BATCH);
        const res = await fetch(GEO_FIX_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ai_map_streets', streets: batch }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        totalAdded += data.added_count || 0;
        totalSkipped += data.skipped_count || 0;
        queue = queue.slice(OSM_BATCH);
        setOsmQueue(queue);
        setOsmCurrentBatch(queue.slice(0, OSM_BATCH));
        setOsmAddedTotal(totalAdded);
        setOsmSkippedTotal(totalSkipped);
        setOsmProgress({ done: grandTotal - queue.length, total: grandTotal });
      }
      if (!stopRef.current) toast.success(`Готово! Добавлено: ${totalAdded}, не определён район: ${totalSkipped}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка в процессе'); }
    finally { setOsmRunAll(false); stopRef.current = false; }
  };

  const handleOsmToggle = () => { if (osmOpen) { setOsmOpen(false); } else { handleOsmLoad(); } };

  return {
    geoOkrugLoading, geoOkrugResult, geoOkrugApplying, geoOkrugBatch, setGeoOkrugBatch,
    handleGeoOkrugPreview, handleGeoOkrugApply, onGeoOkrugClose: () => setGeoOkrugResult(null),
    geoFixLoading, geoFixResult, geoFixApplying,
    handleGeoFixPreview, handleGeoFixApply, onGeoFixClose: () => setGeoFixResult(null),
    osmLoading, osmError, osmOpen, osmMeta, osmQueue, osmCurrentBatch,
    osmAdding, osmRunAll, osmAddedTotal, osmSkippedTotal, osmProgress, stopRef,
    handleOsmLoad, handleOsmAddBatch, handleOsmRunAll, handleOsmToggle,
    onOsmClose: () => setOsmOpen(false),
    GEO_OKRUG_BATCHES,
  };
}