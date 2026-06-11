import { useState } from 'react';
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
  sample: Record<string, unknown>[];
}

interface ImportResult {
  success: boolean;
  format: string;
  total_parsed: number;
  inserted: number;
  skipped: number;
  deleted_old: number;
  warnings_count: number;
  warnings_sample: string[];
}

interface StatsRow {
  source: string;
  deal_type: string;
  category: string;
  cnt: number;
  avg_ppm2: number;
  last_scraped: string;
}

interface StatsResult {
  total: number;
  breakdown: StatsRow[];
}

const CAT_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', free_purpose: 'ПСН',
  warehouse: 'Склад', building: 'Здание', hotel: 'Гостиница',
  restaurant: 'Общепит', production: 'Производство', land: 'Земля',
  car_service: 'Автосервис', gab: 'ГАБ', other: 'Прочее',
};

export default function MarketImportAdmin() {
  const [fileUrl, setFileUrl] = useState('');
  const [source, setSource] = useState('cian');
  const [replace, setReplace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');

  async function callApi(body: object) {
    const res = await fetch(MARKET_IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function handlePreview() {
    if (!fileUrl.trim()) { setError('Укажите ссылку на файл'); return; }
    setLoading(true); setError(''); setPreview(null); setImportResult(null);
    try {
      const data = await callApi({ action: 'import', file_url: fileUrl.trim(), source, preview: true });
      setPreview(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!fileUrl.trim()) { setError('Укажите ссылку на файл'); return; }
    setLoading(true); setError(''); setImportResult(null);
    try {
      const data = await callApi({ action: 'import', file_url: fileUrl.trim(), source, preview: false, replace });
      setImportResult(data);
      setPreview(null);
      loadStats();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const data = await callApi({ action: 'stats' });
      setStats(data);
    } catch {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }

  async function handleClear(src: string) {
    if (!confirm(`Удалить все записи источника "${src}"?`)) return;
    setLoading(true);
    try {
      await callApi({ action: 'clear', source: src });
      loadStats();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setLoading(false);
    }
  }

  const fmtNum = (n: number) => n?.toLocaleString('ru-RU') ?? '—';
  const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('ru-RU') : '—';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Icon name="Upload" size={22} className="text-brand-blue" />
        <div>
          <h1 className="text-xl font-semibold">Импорт рыночных данных</h1>
          <p className="text-sm text-muted-foreground">CSV (парсер ЦИАН/Авито) или XLSX (ручная выгрузка) → market_listings</p>
        </div>
        <button
          onClick={loadStats}
          className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted"
          disabled={statsLoading}
        >
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
            <input
              type="url"
              value={fileUrl}
              onChange={e => setFileUrl(e.target.value)}
              placeholder="https://cdn.poehali.dev/…/файл.csv"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <p className="text-xs text-muted-foreground">Загрузите файл через «Скачать → S3» и вставьте CDN-ссылку</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Источник</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              {SOURCES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={replace}
            onChange={e => setReplace(e.target.checked)}
            className="rounded"
          />
          <span>Заменить старые данные этого источника перед импортом</span>
        </label>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 flex items-center gap-2">
            <Icon name="AlertCircle" size={15} />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handlePreview}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Icon name="Eye" size={15} />
            {loading ? 'Анализирую...' : 'Предпросмотр'}
          </button>
          <button
            onClick={handleImport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-blue text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Icon name="Upload" size={15} />
            {loading ? 'Загружаю...' : 'Импортировать'}
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
                <div className="text-xs text-muted-foreground">{k === 'sale' ? 'Продажа' : 'Аренда'}</div>
              </div>
            ))}
            {preview.price_median && (
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{fmtNum(preview.price_median / 1_000_000)}M</div>
                <div className="text-xs text-muted-foreground">Медиана цены</div>
              </div>
            )}
            {preview.area_median && (
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{fmtNum(preview.area_median)}</div>
                <div className="text-xs text-muted-foreground">Медиана площади, м²</div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">По категориям</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(preview.by_category).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <span key={k} className="bg-muted rounded-full px-3 py-1 text-xs">
                  {CAT_LABELS[k] || k}: <b>{fmtNum(v)}</b>
                </span>
              ))}
            </div>
          </div>

          {preview.warnings_count > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-sm font-medium text-amber-800 mb-1">
                <Icon name="AlertTriangle" size={14} className="inline mr-1" />
                {preview.warnings_count} предупреждений при фильтрации
              </div>
              <ul className="text-xs text-amber-700 space-y-0.5 max-h-32 overflow-y-auto">
                {preview.warnings_sample.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-blue text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Icon name="Upload" size={15} />
            Подтвердить импорт {fmtNum(preview.total_parsed)} записей
          </button>
        </div>
      )}

      {/* Результат импорта */}
      {importResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-800 font-semibold">
            <Icon name="CheckCircle2" size={18} />
            Импорт завершён ({importResult.format.toUpperCase()})
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Разобрано', val: importResult.total_parsed },
              { label: 'Добавлено', val: importResult.inserted },
              { label: 'Пропущено', val: importResult.skipped },
              { label: 'Удалено старых', val: importResult.deleted_old },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white rounded-lg p-3 text-center border">
                <div className="text-xl font-bold">{fmtNum(val)}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          {importResult.warnings_count > 0 && (
            <p className="text-sm text-amber-700">
              <Icon name="AlertTriangle" size={13} className="inline mr-1" />
              {importResult.warnings_count} записей отфильтровано (цена/площадь вне диапазона, устаревшие)
            </p>
          )}
        </div>
      )}

      {/* Статистика базы */}
      {stats && (
        <div className="bg-white border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Icon name="Database" size={16} className="text-brand-blue" />
              В базе market_listings: {fmtNum(stats.total)} записей
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs uppercase">
                  <th className="text-left py-2 pr-3">Источник</th>
                  <th className="text-left py-2 pr-3">Сделка</th>
                  <th className="text-left py-2 pr-3">Категория</th>
                  <th className="text-right py-2 pr-3">Кол-во</th>
                  <th className="text-right py-2 pr-3">Ср. цена/м²</th>
                  <th className="text-right py-2">Обновлено</th>
                </tr>
              </thead>
              <tbody>
                {stats.breakdown.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-3 font-medium">{row.source}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${row.deal_type === 'sale' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                        {row.deal_type === 'sale' ? 'Продажа' : 'Аренда'}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{CAT_LABELS[row.category] || row.category}</td>
                    <td className="py-2 pr-3 text-right">{fmtNum(row.cnt)}</td>
                    <td className="py-2 pr-3 text-right">{row.avg_ppm2 ? fmtNum(Number(row.avg_ppm2)) + ' ₽' : '—'}</td>
                    <td className="py-2 text-right text-muted-foreground text-xs">{fmtDate(row.last_scraped)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Кнопки очистки по источнику */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground self-center">Очистить источник:</span>
            {[...new Set(stats.breakdown.map(r => r.source))].map(src => (
              <button
                key={src}
                onClick={() => handleClear(src)}
                disabled={loading}
                className="text-xs px-2 py-1 rounded border hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition"
              >
                {src}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Инструкция */}
      <div className="bg-muted/40 rounded-xl p-5 text-sm space-y-2">
        <h3 className="font-semibold flex items-center gap-2"><Icon name="Info" size={15} /> Как загрузить файл</h3>
        <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
          <li>Получи файл CSV (с парсера) или XLSX (из ЦИАН/Авито лично)</li>
          <li>Загрузи через Загрузить → Файлы → S3 — скопируй CDN-ссылку</li>
          <li>Вставь ссылку выше, выбери источник, нажми «Предпросмотр»</li>
          <li>Убедись что данные корректны, нажми «Импортировать»</li>
        </ol>
        <div className="mt-2 text-xs space-y-1">
          <p><b>Фильтры CSV:</b> цена продажи 500 тыс — 5 млрд ₽, площадь 5—100 000 м², объявления не старше 1 года</p>
          <p><b>Обязательные колонки XLSX:</b> Цена, Площадь (нечёткий поиск колонок)</p>
          <p><b>Дедупликация:</b> по адресу + площадь ±10%, одинаковые не дублируются</p>
        </div>
      </div>
    </div>
  );
}