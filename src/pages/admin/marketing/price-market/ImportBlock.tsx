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
const ACTIVE_STATUSES = new Set(['pending', 'downloading', 'parsing', 'running']);

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const pollStatus = useCallback(async (jobId: number) => {
    try {
      const r = await fetch(XLSX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_market_status', job_id: jobId }),
      }).then(r => r.json());
      setJob(prev => ({ ...(prev ?? {} as ImportJob), ...r }));
      if (r.status === 'done') {
        stopPoll();
        localStorage.removeItem(LS_KEY);
        toast.success(`Импорт завершён — добавлено ${r.rows_inserted.toLocaleString()} записей`);
      }
      if (r.status === 'error') {
        stopPoll();
        localStorage.removeItem(LS_KEY);
        toast.error(`Ошибка импорта: ${r.error_msg}`);
      }
    } catch { /* сетевые ошибки поллинга игнорируем */ }
  }, []);

  // При монтировании — восстанавливаем активный job из localStorage
  useEffect(() => {
    const savedId = localStorage.getItem(LS_KEY);
    if (savedId) {
      const id = parseInt(savedId, 10);
      pollStatus(id).then(() => {
        // Запускаем поллинг только если job ещё активен
        setJob(prev => {
          if (prev && ACTIVE_STATUSES.has(prev.status)) {
            pollRef.current = setInterval(() => pollStatus(id), 3000);
          }
          return prev;
        });
      });
    }
    return () => stopPoll();
  }, [pollStatus]);

  const loadHistory = async () => {
    try {
      const r = await fetch(XLSX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_market_list' }),
      }).then(r => r.json());
      if (Array.isArray(r)) setHistory(r);
    } catch { /* ignore */ }
  };

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
      const newJob: ImportJob = { id: r.job_id, status: 'pending', rows_total: null, rows_done: 0, rows_inserted: 0, rows_updated: 0, rows_skipped: 0, error_msg: null, category_breakdown: null, source, created_at: new Date().toISOString() };
      setJob(newJob);
      localStorage.setItem(LS_KEY, String(r.job_id));
      stopPoll();
      pollRef.current = setInterval(() => pollStatus(r.job_id), 3000);
    } catch { toast.error('Не удалось запустить импорт'); }
    finally { setStarting(false); }
  };

  const handleReset = () => { setJob(null); setFileUrl(''); localStorage.removeItem(LS_KEY); };

  const isActive = job && ACTIVE_STATUSES.has(job.status);
  const pct = job?.rows_total ? Math.round((job.rows_done / job.rows_total) * 100) : null;
  const progressWidth = pct !== null ? `${pct}%`
    : job?.status === 'downloading' ? '8%'
    : job?.status === 'parsing' ? '18%'
    : job?.status === 'running' ? '30%' : '5%';

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
            <div key={h.id} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
              <span className="font-medium">{h.source}</span>
              <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString('ru')}</span>
              <span className={h.status === 'done' ? 'text-green-600' : h.status === 'error' ? 'text-red-500' : 'text-blue-500'}>
                {STATUS_LABEL[h.status] ?? h.status}
              </span>
              <span>{h.rows_inserted.toLocaleString()} добавлено</span>
              {ACTIVE_STATUSES.has(h.status) && (
                <button
                  className="text-brand-blue underline ml-1"
                  onClick={() => {
                    setJob(h);
                    localStorage.setItem(LS_KEY, String(h.id));
                    stopPoll();
                    pollRef.current = setInterval(() => pollStatus(h.id), 3000);
                    setShowHistory(false);
                  }}
                >
                  Подключиться
                </button>
              )}
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
              <span className="font-medium">{STATUS_LABEL[job.status] ?? job.status}</span>
              <span className="text-muted-foreground text-xs">· {job.source}</span>
            </span>
            <span className="text-muted-foreground text-xs">
              {job.rows_done.toLocaleString()} строк обработано
            </span>
          </div>

          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-700 ${job.status === 'error' ? 'bg-red-400' : 'bg-brand-blue'}`}
              style={{ width: job.status === 'done' ? '100%' : progressWidth }}
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

          {job.status === 'done' && (() => {
            const bd = parseCatBreakdown(job.category_breakdown);
            return Object.keys(bd).length > 0 ? (
              <div className="text-xs space-y-1">
                <p className="font-medium text-muted-foreground">По категориям:</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(bd).sort(([,a],[,b]) => b - a).map(([cat, cnt]) => (
                    <span key={cat} className="bg-muted px-2 py-0.5 rounded-full">
                      {CAT_RU[cat] ?? cat}: {cnt.toLocaleString()}
                    </span>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {(job.status === 'done' || job.status === 'error') && (
            <button onClick={handleReset} className="text-xs text-brand-blue underline">
              Новый импорт
            </button>
          )}
        </div>
      )}
    </div>
  );
}
