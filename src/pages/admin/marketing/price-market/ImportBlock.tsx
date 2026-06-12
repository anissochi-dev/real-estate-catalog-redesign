import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';

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

const LS_KEY = 'import_job_id';

function parseCatBreakdown(val: ImportJob['category_breakdown']): Record<string, number> {
  if (!val) return {};
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return {}; } }
  return val as unknown as Record<string, number>;
}

export default function ImportBlock() {
  const [fileUrl, setFileUrl] = useState('');
  const [source, setSource] = useState('cian');
  const [replace, setReplace] = useState(false);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [history, setHistory] = useState<ImportJob[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const runningRef = useRef(false);

  // Цепочка батчей: вызываем import_market_continue пока done не true
  // Пауза 3 сек между батчами — избегаем rate limit платформы
  const runBatchChain = useCallback(async (jobId: number, startFrom = 0) => {
    if (runningRef.current) return;
    runningRef.current = true;

    while (true) {
      try {
        const r = await fetch(XLSX_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'import_market_continue', job_id: jobId }),
        }).then(r => r.json());

        setJob(prev => prev ? {
          ...prev,
          status: r.status === 'paused' ? 'running' : r.status,
          rows_done: r.rows_done ?? prev.rows_done,
          rows_total: r.rows_total ?? prev.rows_total,
          rows_inserted: r.rows_inserted ?? prev.rows_inserted,
          rows_updated: r.rows_updated ?? prev.rows_updated,
          category_breakdown: r.category_breakdown ?? prev.category_breakdown,
        } : prev);

        if (r.done || r.status === 'done') {
          localStorage.removeItem(LS_KEY);
          toast.success(`Импорт завершён — добавлено ${r.rows_inserted?.toLocaleString()} записей`);
          break;
        }

        if (r.status === 'error') {
          localStorage.removeItem(LS_KEY);
          toast.error(r.error_msg || 'Ошибка импорта');
          break;
        }

        // rate limit или любая пауза — ждём дольше и продолжаем
        const delay = r.status === 'paused' ? 8000 : 3000;
        await new Promise(res => setTimeout(res, delay));

      } catch (e) {
        // Сетевая ошибка — пауза и повтор
        await new Promise(res => setTimeout(res, 5000));
      }
    }
    runningRef.current = false;
  }, []);

  // Восстанавливаем активный job из localStorage при монтировании
  useEffect(() => {
    const savedId = localStorage.getItem(LS_KEY);
    if (savedId) {
      fetch(XLSX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_market_status', job_id: parseInt(savedId) }),
      }).then(r => r.json()).then(r => {
        if (r.id) setJob(r);
        if (r.status === 'running' || r.status === 'paused') {
          runBatchChain(r.id, r.rows_done || 0);
        }
      }).catch((_e) => { /* ignore */ });
    }
  }, [runBatchChain]);

  const loadHistory = async () => {
    try {
      const r = await fetch(XLSX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_market_list' }),
      }).then(r => r.json());
      if (Array.isArray(r)) setHistory(r);
    } catch (_e) { /* ignore */ }
  };

  const handleStart = async () => {
    const url = fileUrl.trim();
    if (!url) { toast.error('Вставьте ссылку на файл'); return; }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast.error('Ссылка должна начинаться с https://');
      return;
    }
    setStarting(true);
    try {
      const r = await fetch(XLSX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_market_start', file_url: fileUrl.trim(), source, replace }),
      }).then(r => r.json());

      if (r.error) { toast.error(r.error); return; }

      const newJob: ImportJob = {
        id: r.job_id,
        status: 'running',
        rows_total: r.rows_total ?? null,
        rows_done: 0,
        rows_inserted: 0,
        rows_updated: 0,
        rows_skipped: 0,
        error_msg: null,
        category_breakdown: null,
        source,
        created_at: new Date().toISOString(),
      };
      setJob(newJob);
      localStorage.setItem(LS_KEY, String(r.job_id));

      // Запускаем цепочку батчей
      runBatchChain(r.job_id, 0);
    } catch {
      toast.error('Не удалось запустить импорт');
    } finally {
      setStarting(false);
    }
  };

  const handleReset = () => {
    runningRef.current = false;
    setJob(null);
    setFileUrl('');
    localStorage.removeItem(LS_KEY);
  };

  const isActive = job && job.status === 'running';
  const pct = (job?.rows_total && job.rows_done)
    ? Math.min(99, Math.round((job.rows_done / job.rows_total) * 100))
    : null;
  const progressWidth = pct !== null ? `${pct}%` : isActive ? '15%' : '5%';

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Icon name="FileSpreadsheet" size={16} className="text-brand-blue" />
          Импорт из XLSX (ЦИАН / Авито / другой)
        </div>
        <button
          onClick={() => { setShowHistory(v => !v); if (!showHistory) loadHistory(); }}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <Icon name="History" size={13} />
          История
        </button>
      </div>

      {/* История импортов */}
      {showHistory && (
        <div className="space-y-1 border border-border rounded-xl p-3 bg-muted/30">
          {history.length === 0 && <p className="text-xs text-muted-foreground">Нет истории</p>}
          {history.map(h => (
            <div key={h.id} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0 gap-2">
              <span className="font-medium">{h.source}</span>
              <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString('ru')}</span>
              <span className={h.status === 'done' ? 'text-green-600' : h.status === 'error' ? 'text-red-500' : 'text-blue-500'}>
                {STATUS_LABEL[h.status] ?? h.status}
              </span>
              <span>{h.rows_inserted.toLocaleString()} добавлено</span>
            </div>
          ))}
        </div>
      )}

      {/* Форма запуска */}
      {!isActive && job?.status !== 'done' && job?.status !== 'error' && (
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
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Источник (по умолчанию)</label>
              <select value={source} onChange={e => setSource(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm bg-white">
                {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-1">
              <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} className="rounded" />
              Заменить старые данные
            </label>
          </div>
          <button
            onClick={handleStart}
            disabled={starting || !fileUrl.trim()}
            className="bg-brand-blue text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
          >
            {starting
              ? <><Icon name="Loader2" size={14} className="animate-spin" />Запуск…</>
              : <><Icon name="Upload" size={14} />Запустить импорт</>}
          </button>
        </div>
      )}

      {/* Прогресс активного или завершённого job */}
      {job && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              {isActive && <Icon name="Loader2" size={14} className="animate-spin text-brand-blue" />}
              {job.status === 'done' && <Icon name="CheckCircle2" size={14} className="text-green-600" />}
              {job.status === 'error' && <Icon name="XCircle" size={14} className="text-red-500" />}
              <span className={job.status === 'error' ? 'text-red-500' : job.status === 'done' ? 'text-green-700 font-medium' : 'text-foreground'}>
                {STATUS_LABEL[job.status] ?? job.status}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {job.rows_done > 0 && `${job.rows_done.toLocaleString()} / ${job.rows_total?.toLocaleString() ?? '?'} строк`}
            </span>
          </div>

          {/* Прогресс-бар */}
          {(isActive || job.status === 'done') && (
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${job.status === 'done' ? 'bg-green-500' : 'bg-brand-blue'}`}
                style={{ width: job.status === 'done' ? '100%' : progressWidth }}
              />
            </div>
          )}

          {/* Статистика */}
          {(job.rows_inserted > 0 || job.status === 'done') && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="text-green-600 font-medium">+{job.rows_inserted.toLocaleString()} добавлено</span>
              {job.rows_updated > 0 && <span>~{job.rows_updated.toLocaleString()} обновлено</span>}
              {job.rows_skipped > 0 && <span>{job.rows_skipped.toLocaleString()} пропущено</span>}
            </div>
          )}

          {/* Ошибка */}
          {job.status === 'error' && job.error_msg && (
            <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {job.error_msg}
            </div>
          )}

          {/* Категории */}
          {job.status === 'done' && (() => {
            const cats = parseCatBreakdown(job.category_breakdown);
            const entries = Object.entries(cats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
            if (!entries.length) return null;
            return (
              <div className="flex flex-wrap gap-1.5">
                {entries.map(([cat, cnt]) => (
                  <span key={cat} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                    {CAT_RU[cat] ?? cat}: {cnt.toLocaleString()}
                  </span>
                ))}
              </div>
            );
          })()}

          <div className="flex gap-2">
            {(job.status === 'done' || job.status === 'error') && (
              <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Icon name="RotateCcw" size={12} />
                Новый импорт
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}