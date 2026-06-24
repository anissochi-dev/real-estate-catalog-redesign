import { useState } from 'react';
import { getToken, REMOVE_WM_URL } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

const REHOST_URL = REMOVE_WM_URL;

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

interface RecompressResult {
  done: boolean;
  processed: number;
  ok: number;
  errors: number;
  remaining: number;
  next_offset: number;
  results?: { id: number; ok?: boolean; thumb?: string; error?: string; skipped?: boolean }[];
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

  // recompress state
  const [recompressStatus, setRecompressStatus] = useState<{ remaining: number } | null>(null);
  const [recompressLoading, setRecompressLoading] = useState(false);
  const [recompressRunning, setRecompressRunning] = useState(false);
  const [recompressLog, setRecompressLog] = useState<string[]>([]);
  const [recompressOk, setRecompressOk] = useState(0);
  const [recompressErrors, setRecompressErrors] = useState(0);
  const [recompressDone, setRecompressDone] = useState(false);
  const [recompressInitial, setRecompressInitial] = useState(0);

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

  const loadRecompressStatus = async () => {
    setRecompressLoading(true);
    try {
      const d = await rehostReq({ action: 'recompress_batch', offset: 0, batch_size: 0 });
      setRecompressStatus({ remaining: d.remaining ?? 0 });
      setRecompressInitial(d.remaining ?? 0);
    } catch (e) {
      // batch_size=0 может вернуть done=true с remaining
      try {
        const d2 = await rehostReq({ action: 'recompress_batch', offset: 0, batch_size: 1 });
        const remaining = d2.remaining ?? 0;
        setRecompressStatus({ remaining });
        setRecompressInitial(remaining + (d2.ok ?? 0));
        if (d2.done && remaining === 0) setRecompressDone(true);
      } catch (e2) {
        setRecompressLog(l => [...l, `Ошибка: ${e2 instanceof Error ? e2.message : 'неизвестная'}`]);
      }
    } finally {
      setRecompressLoading(false);
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

  const runRecompress = async () => {
    setRecompressRunning(true);
    setRecompressDone(false);
    setRecompressLog([]);
    setRecompressOk(0);
    setRecompressErrors(0);

    let offset = 0;
    const batchSize = 3;
    let retries = 0;
    let totalRemaining = recompressInitial;

    while (true) {
      try {
        const result: RecompressResult = await rehostReq({
          action: 'recompress_batch',
          offset,
          batch_size: batchSize,
        });

        retries = 0;
        setRecompressOk(c => c + (result.ok ?? 0));
        setRecompressErrors(e => e + (result.errors ?? 0));
        totalRemaining = result.remaining ?? 0;
        setRecompressStatus({ remaining: totalRemaining });

        const okCount = result.ok ?? 0;
        const errCount = result.errors ?? 0;
        setRecompressLog(l => [
          ...l,
          `Батч offset=${offset}: обработано ${result.processed}, OK ${okCount}, ошибок ${errCount}, осталось ${totalRemaining}`
        ]);

        if (result.results) {
          for (const r of result.results) {
            if (r.error) {
              setRecompressLog(l => [...l, `  ↳ #${r.id}: ${r.error}`]);
            }
          }
        }

        if (result.done || result.processed === 0) {
          setRecompressDone(true);
          setRecompressLog(l => [...l, `✓ Готово! Сгенерированы мобильные превью для всех фото.`]);
          break;
        }

        offset = result.next_offset;
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'неизвестная';
        if ((msg.includes('504') || msg.includes('timeout')) && retries < 3) {
          retries++;
          setRecompressLog(l => [...l, `Таймаут, повтор ${retries}/3...`]);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        setRecompressLog(l => [...l, `Ошибка: ${msg}`]);
        break;
      }
    }

    setRecompressRunning(false);
  };

  const progress = initialExternal > 0
    ? Math.round(((initialExternal - (status?.external_photos ?? initialExternal)) / initialExternal) * 100)
    : done ? 100 : 0;

  const recompressProgress = recompressInitial > 0
    ? Math.round(((recompressInitial - (recompressStatus?.remaining ?? recompressInitial)) / recompressInitial) * 100)
    : recompressDone ? 100 : 0;

  return (
    <div className="space-y-4">

      {/* ── Секция 1: перенос с внешних CDN ── */}
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
                  <span>Сконвертировано: <b className="text-foreground">{totalConverted}</b></span>
                  {totalErrors > 0 && <span className="text-amber-600">Ошибок: <b>{totalErrors}</b></span>}
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
                {running ? `Обрабатываю... осталось ${status.external_photos}` : `Сжать ${status.external_photos} объявлений`}
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

      {/* ── Секция 2: генерация мобильных превью (800px) ── */}
      <div className="bg-white rounded-2xl border border-border p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Мобильные превью для каталога</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Создаёт уменьшенную версию (800px, WebP) для каждого объявления. Мобильные пользователи будут грузить ~50 КБ вместо ~300 КБ — ускоряет каталог в 4–6 раз на телефоне.
          </p>
        </div>

        {!recompressStatus && (
          <button
            onClick={loadRecompressStatus}
            disabled={recompressLoading}
            className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-50"
          >
            <Icon name={recompressLoading ? 'Loader2' : 'Search'} size={16} className={recompressLoading ? 'animate-spin' : ''} />
            Проверить состояние
          </button>
        )}

        {recompressStatus && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted rounded-xl p-4">
                <div className="text-2xl font-bold">{recompressInitial}</div>
                <div className="text-sm text-muted-foreground">фото без превью</div>
              </div>
              <div className={`rounded-xl p-4 ${recompressStatus.remaining > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                <div className={`text-2xl font-bold ${recompressStatus.remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {recompressStatus.remaining}
                </div>
                <div className="text-sm text-muted-foreground">
                  {recompressStatus.remaining > 0 ? 'осталось обработать' : 'все готовы ✓'}
                </div>
              </div>
            </div>

            {(recompressRunning || recompressDone || recompressOk > 0) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Прогресс</span>
                  <span className="text-muted-foreground">{recompressProgress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-brand-blue rounded-full transition-all duration-500"
                    style={{ width: `${recompressProgress}%` }}
                  />
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>Обработано: <b className="text-foreground">{recompressOk}</b></span>
                  {recompressErrors > 0 && <span className="text-amber-600">Ошибок: <b>{recompressErrors}</b></span>}
                </div>
              </div>
            )}

            {recompressStatus.remaining > 0 && !recompressDone && (
              <button
                onClick={runRecompress}
                disabled={recompressRunning}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-60"
              >
                <Icon name={recompressRunning ? 'Loader2' : 'Smartphone'} size={16} className={recompressRunning ? 'animate-spin' : ''} />
                {recompressRunning
                  ? `Генерирую превью... осталось ${recompressStatus.remaining}`
                  : `Создать превью для ${recompressStatus.remaining} объявлений`}
              </button>
            )}

            {recompressDone && (
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3 text-sm font-medium">
                <Icon name="CheckCircle2" size={18} />
                Готово! Мобильные превью созданы для {recompressOk} объявлений.
              </div>
            )}

            {recompressLog.length > 0 && (
              <div className="bg-muted rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                {recompressLog.map((line, i) => (
                  <div key={i} className="text-xs font-mono text-muted-foreground">{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
