import { useState, useRef, useCallback } from 'react';
import Icon from '@/components/ui/icon';

const MARKET_IMPORT_URL = 'https://functions.poehali.dev/debf4d7f-d8d8-4317-b617-1d5dbc519978';

const SOURCES = [
  { value: 'cian', label: 'ЦИАН' },
  { value: 'avito', label: 'Авито' },
  { value: 'yandex', label: 'Яндекс.Недвижимость' },
  { value: 'arrpro', label: 'АРРпро' },
  { value: 'ayax', label: 'АЯКС' },
  { value: 'manual', label: 'Ручная выгрузка' },
];

const CAT_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', free_purpose: 'ПСН',
  warehouse: 'Склад', building: 'Здание', hotel: 'Гостиница',
  restaurant: 'Общепит', production: 'Производство', land: 'Земля',
  car_service: 'Автосервис', gab: 'ГАБ', other: 'Прочее',
};

interface PreviewResult {
  preview: true;
  format: string;
  total_parsed: number;
  warnings_count: number;
  warnings_sample: string[];
  by_category: Record<string, number>;
  by_deal: Record<string, number>;
  price_median: number | null;
  area_median: number | null;
}

interface Progress {
  jobId: number;
  rowsDone: number;
  rowsTotal: number;
  inserted: number;
  updated: number;
  done: boolean;
}

interface StatsRow {
  source: string; deal_type: string; category: string;
  cnt: number; avg_ppm2: number; last_scraped: string;
}

export default function MarketImportAdmin() {
  const [fileUrl, setFileUrl] = useState('');
  const [source, setSource] = useState('cian');
  const [replace, setReplace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [stats, setStats] = useState<{ total: number; breakdown: StatsRow[] } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');
  const runningRef = useRef(false);

  const fmtNum = (n: number) => n?.toLocaleString('ru-RU') ?? '—';
  const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('ru-RU') : '—';
  const pct = progress?.rowsTotal ? Math.min(99, Math.round((progress.rowsDone / progress.rowsTotal) * 100)) : null;

  async function post(body: object) {
    const res = await fetch(MARKET_IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function handlePreview() {
    if (!fileUrl.trim()) { setError('Укажите ссылку на файл'); return; }
    setLoading(true); setError(''); setPreview(null); setProgress(null);
    try {
      const data = await post({ action: 'import_preview', file_url: fileUrl.trim(), source });
      setPreview(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  const runBatchChain = useCallback(async (jobId: number, rowsDone: number, rowsTotal: number, inserted: number, updated: number) => {
    if (runningRef.current && rowsDone === 0) return;

    let curDone = rowsDone;
    let curIns = inserted;
    let curUpd = updated;

    while (true) {
      try {
        const r = await post({ action: 'import_continue', job_id: jobId });
        curDone = r.rows_done ?? curDone;
        curIns  = r.inserted ?? curIns;
        curUpd  = r.updated ?? curUpd;

        setProgress({ jobId, rowsDone: curDone, rowsTotal: r.rows_total ?? rowsTotal, inserted: curIns, updated: curUpd, done: !!r.done });

        if (r.done) break;
        if (r.error) { setError(r.error); break; }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Сетевая ошибка');
        await new Promise(res => setTimeout(res, 3000));
      }
    }
    runningRef.current = false;
    setLoading(false);
    loadStats();
  }, []);

  async function handleImport() {
    if (!fileUrl.trim()) { setError('Укажите ссылку на файл'); return; }
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true); setError(''); setProgress(null); setPreview(null);
    try {
      const r = await post({ action: 'import_start', file_url: fileUrl.trim(), source, replace });
      if (r.error) { setError(r.error); runningRef.current = false; setLoading(false); return; }

      const prog: Progress = {
        jobId: r.job_id,
        rowsDone: r.rows_done ?? r.total_parsed ?? 0,
        rowsTotal: r.rows_total ?? r.total_parsed ?? 0,
        inserted: r.inserted ?? 0,
        updated: r.updated ?? 0,
        done: !!r.done,
      };
      setProgress(prog);

      if (r.done) {
        runningRef.current = false;
        setLoading(false);
        loadStats();
        return;
      }

      // Продолжаем батчи
      runBatchChain(r.job_id, prog.rowsDone, prog.rowsTotal, prog.inserted, prog.updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      runningRef.current = false;
      setLoading(false);
    }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const data = await post({ action: 'stats' });
      setStats(data);
    } catch { /* ignore */ }
    finally { setStatsLoading(false); }
  }

  async function handleClear(src: string) {
    if (!confirm(`Удалить все записи источника "${src}"?`)) return;
    setLoading(true);
    try {
      await post({ action: 'clear', source: src });
      loadStats();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally { setLoading(false); }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Icon name="Upload" size={22} className="text-brand-blue" />
        <div>
          <h1 className="text-xl font-semibold">Импорт рыночных данных</h1>
          <p className="text-sm text-muted-foreground">CSV (парсер ЦИАН/Авито) или XLSX (ручная выгрузка) → market_listings</p>
        </div>
        <button onClick={loadStats} disabled={statsLoading}
          className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted">
          <Icon name="BarChart2" size={15} />
          {statsLoading ? 'Загрузка...' : 'Статистика базы'}
        </button>
      </div>

      {/* Форма */}
      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Параметры загрузки</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1">
            <label className="text-sm font-medium">Ссылка на файл (CSV или XLSX)</label>
            <input type="url" value={fileUrl} onChange={e => setFileUrl(e.target.value)}
              placeholder="https://cdn.poehali.dev/…/файл.csv"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            <p className="text-xs text-muted-foreground">Загрузите файл через «Скачать → S3» и вставьте CDN-ссылку</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Источник</label>
            <select value={source} onChange={e => setSource(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue">
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} className="rounded" />
          <span>Заменить старые данные этого источника перед импортом</span>
        </label>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 flex items-center gap-2">
            <Icon name="AlertCircle" size={15} />
            {error}
          </div>
        )}

        {/* Прогресс */}
        {progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {!progress.done && <Icon name="Loader2" size={14} className="animate-spin text-brand-blue" />}
                {progress.done && <Icon name="CheckCircle2" size={14} className="text-green-600" />}
                <span className={progress.done ? 'text-green-700 font-medium' : ''}>
                  {progress.done ? 'Импорт завершён' : 'Импорт строк…'}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {progress.rowsDone.toLocaleString()} / {progress.rowsTotal.toLocaleString()} строк
                {pct !== null && !progress.done && ` (${pct}%)`}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-2 rounded-full transition-all duration-300 ${progress.done ? 'bg-green-500' : 'bg-brand-blue'}`}
                style={{ width: progress.done ? '100%' : (pct !== null ? `${pct}%` : '10%') }} />
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="text-green-600 font-medium">+{progress.inserted.toLocaleString()} добавлено</span>
              {progress.updated > 0 && <span>~{progress.updated.toLocaleString()} обновлено</span>}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={handlePreview} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted disabled:opacity-50">
            <Icon name="Eye" size={15} />
            {loading && !progress ? 'Анализирую...' : 'Предпросмотр'}
          </button>
          <button onClick={handleImport} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-blue text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
            <Icon name={loading && progress && !progress.done ? 'Loader2' : 'Upload'} size={15}
              className={loading && progress && !progress.done ? 'animate-spin' : ''} />
            {loading && progress && !progress.done ? 'Импортирую...' : 'Импортировать'}
          </button>
        </div>
      </div>

      {/* Превью */}
      {preview && (
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-green-700">
            <Icon name="CheckCircle" size={16} />
            <h2 className="font-semibold">Предпросмотр — {fmtNum(preview.total_parsed)} записей ({preview.format.toUpperCase()})</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(preview.by_deal).map(([k, v]) => (
              <div key={k} className="bg-muted/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{fmtNum(v)}</div>
                <div className="text-xs text-muted-foreground mt-1">{k === 'sale' ? 'Продажа' : 'Аренда'}</div>
              </div>
            ))}
            {preview.price_median && (
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{fmtNum(preview.price_median)}</div>
                <div className="text-xs text-muted-foreground mt-1">Медиана цены ₽</div>
              </div>
            )}
            {preview.area_median && (
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{fmtNum(preview.area_median)}</div>
                <div className="text-xs text-muted-foreground mt-1">Медиана площади м²</div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(preview.by_category).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => (
              <span key={cat} className="text-xs bg-muted px-2 py-1 rounded-full">
                {CAT_LABELS[cat] ?? cat}: {fmtNum(cnt)}
              </span>
            ))}
          </div>
          {preview.warnings_count > 0 && (
            <details className="text-xs text-amber-600">
              <summary className="cursor-pointer">{preview.warnings_count} предупреждений</summary>
              <ul className="mt-1 space-y-0.5 ml-3 list-disc text-muted-foreground">
                {preview.warnings_sample.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Статистика базы */}
      {stats && (
        <div className="bg-white border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Icon name="Database" size={16} className="text-brand-blue" />
            Статистика базы — {fmtNum(stats.total)} записей
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-2 pr-4">Источник</th>
                  <th className="text-left py-2 pr-4">Сделка</th>
                  <th className="text-left py-2 pr-4">Категория</th>
                  <th className="text-right py-2 pr-4">Кол-во</th>
                  <th className="text-right py-2 pr-4">Ср. ₽/м²</th>
                  <th className="text-right py-2 pr-4">Обновлено</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {stats.breakdown.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">{row.source}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.deal_type === 'sale' ? 'Продажа' : 'Аренда'}</td>
                    <td className="py-2 pr-4">{CAT_LABELS[row.category] ?? row.category}</td>
                    <td className="py-2 pr-4 text-right font-medium">{fmtNum(row.cnt)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{fmtNum(row.avg_ppm2)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{fmtDate(row.last_scraped)}</td>
                    <td className="py-2">
                      <button onClick={() => handleClear(row.source)}
                        className="text-red-400 hover:text-red-600 text-xs">Очистить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Подсказки */}
      <div className="bg-muted/30 border rounded-xl p-4 text-sm space-y-1">
        <p className="font-medium flex items-center gap-1"><Icon name="Info" size={14} />Как загрузить файл</p>
        <ol className="list-decimal ml-5 text-muted-foreground space-y-0.5 text-xs">
          <li>Получи файл CSV (с парсера) или XLSX (из ЦИАН/Авито лично)</li>
          <li>Загрузи через Загрузить → Файлы → S3 — скопируй CDN-ссылку</li>
          <li>Вставь ссылку выше, выбери источник, нажми «Предпросмотр»</li>
          <li>Убедись что данные корректны, нажми «Импортировать»</li>
        </ol>
        <p className="text-xs text-muted-foreground mt-2">
          <b>Фильтры CSV:</b> цена продажи 500 тыс — 5 млрд ₽, площадь 5–100 000 м², объявления не старше 1 года<br/>
          <b>Обязательные колонки XLSX:</b> Цена, Площадь (нечёткий поиск колонок)<br/>
          <b>Дедупликация:</b> по адресу + площадь ±10%, одинаковые не дублируются
        </p>
      </div>
    </div>
  );
}
