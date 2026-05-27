import { useState } from 'react';
import { getToken } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

const REHOST_URL = 'https://functions.poehali.dev/d86482e4-0555-457a-8063-0d3305c171ff';

async function rehostReq(params: Record<string, string | number>) {
  const qs = new URLSearchParams(
    Object.entries(params).reduce((a, [k, v]) => ({ ...a, [k]: String(v) }), {})
  ).toString();
  const res = await fetch(`${REHOST_URL}/?${qs}`, {
    headers: { 'X-Auth-Token': getToken() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

interface Status {
  total_listings: number;
  external_photos: number;
}

interface BatchResult {
  done: boolean;
  processed: number;
  converted_photos: number;
  errors: number;
  remaining_listings: number;
  next_offset: number;
  summary: string;
  results?: { id: number; converted?: number; errors?: string[]; skipped?: boolean; reason?: string }[];
}

export default function PhotoOptimizeTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [totalConverted, setTotalConverted] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [done, setDone] = useState(false);
  const [initialExternal, setInitialExternal] = useState(0);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const d = await rehostReq({ action: 'status' });
      setStatus(d);
      setInitialExternal(d.external_photos);
    } catch (e) {
      setLog(l => [...l, `Ошибка: ${e instanceof Error ? e.message : 'неизвестная'}`]);
    } finally {
      setLoading(false);
    }
  };

  const runOptimize = async () => {
    if (!status) return;
    setRunning(true);
    setDone(false);
    setLog([]);
    setTotalConverted(0);
    setTotalErrors(0);

    let offset = 0;
    const batchSize = 3;

    let retries = 0;
    while (true) {
      try {
        const result: BatchResult = await rehostReq({
          action: 'rehost_batch',
          offset,
          batch_size: batchSize,
        });

        retries = 0;
        setTotalConverted(c => c + result.converted_photos);
        setTotalErrors(e => e + result.errors);
        setLog(l => [...l, result.summary]);
        // Показываем детали ошибок по каждому объявлению
        if (result.results) {
          for (const r of result.results) {
            if (r.errors && r.errors.length > 0) {
              setLog(l => [...l, `  ↳ Объявление #${r.id}: ${r.errors!.join('; ')}`]);
            }
          }
        }
        setStatus(s => s ? { ...s, external_photos: result.remaining_listings } : s);

        if (result.done || result.processed === 0) {
          setDone(true);
          setLog(l => [...l, '✓ Все фотографии успешно перенесены на CDN!']);
          break;
        }

        offset = result.next_offset;
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'неизвестная';
        if ((msg.includes('504') || msg.includes('timeout')) && retries < 3) {
          retries++;
          setLog(l => [...l, `Таймаут, повтор ${retries}/3 (offset=${offset})...`]);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        setLog(l => [...l, `Ошибка батча offset=${offset}: ${msg}`]);
        break;
      }
    }

    setRunning(false);
  };

  const progress = initialExternal > 0
    ? Math.round(((initialExternal - (status?.external_photos ?? initialExternal)) / initialExternal) * 100)
    : done ? 100 : 0;

  return (
    <div className="bg-white rounded-2xl border border-border p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Сжатие и перенос фотографий</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Скачивает фото с внешних серверов, конвертирует в WebP (−30–40% размер) и сохраняет на нашем CDN. Ссылки в объявлениях обновляются автоматически.
        </p>
      </div>

      {!status && (
        <button
          onClick={loadStatus}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-50"
        >
          <Icon name={loading ? 'Loader2' : 'Search'} size={16} className={loading ? 'animate-spin' : ''} />
          Проверить состояние
        </button>
      )}

      {status && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted rounded-xl p-4">
              <div className="text-2xl font-bold">{status.total_listings}</div>
              <div className="text-sm text-muted-foreground">объявлений всего</div>
            </div>
            <div className={`rounded-xl p-4 ${status.external_photos > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
              <div className={`text-2xl font-bold ${status.external_photos > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {status.external_photos}
              </div>
              <div className="text-sm text-muted-foreground">
                {status.external_photos > 0 ? 'ещё не сжаты' : 'все на CDN ✓'}
              </div>
            </div>
          </div>

          {(running || done || totalConverted > 0) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Прогресс</span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-brand-blue rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>Сконвертировано фото: <b className="text-foreground">{totalConverted}</b></span>
                {totalErrors > 0 && (
                  <span className="text-amber-600">Ошибок: <b>{totalErrors}</b></span>
                )}
              </div>
            </div>
          )}

          {status.external_photos > 0 && !done && (
            <button
              onClick={runOptimize}
              disabled={running}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-60"
            >
              <Icon name={running ? 'Loader2' : 'ImageDown'} size={16} className={running ? 'animate-spin' : ''} />
              {running ? `Обрабатываю... осталось ${status.external_photos} объявлений` : `Сжать ${status.external_photos} объявлений`}
            </button>
          )}

          {done && (
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3 text-sm font-medium">
              <Icon name="CheckCircle2" size={18} />
              Готово! Сконвертировано {totalConverted} фотографий.
            </div>
          )}

          {log.length > 0 && (
            <div className="bg-muted rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
              {log.map((line, i) => (
                <div key={i} className="text-xs font-mono text-muted-foreground">{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}