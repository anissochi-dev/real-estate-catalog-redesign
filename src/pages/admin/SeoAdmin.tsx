import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';

const SEO_URL = 'https://functions.poehali.dev/068e7fac-cea4-46c6-9ad2-a02f1f5e250d';

interface SeoStatus {
  total_active: number;
  no_seo_title: number;
  no_seo_desc: number;
  no_desc: number;
}

interface SeoResult {
  id: number;
  status: 'ok' | 'error';
  seo_title?: string;
  seo_description?: string;
  error?: string;
}

export default function SeoAdmin() {
  const { token } = useAuth();
  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };

  const [status, setStatus] = useState<SeoStatus | null>(null);
  const [gptOk, setGptOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SeoResult[]>([]);
  const [limit, setLimit] = useState(10);
  const [previewMode, setPreviewMode] = useState(false);
  const [listingId, setListingId] = useState('');
  const [lastRun, setLastRun] = useState<{ processed: number; errors: number; total: number } | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const r = await fetch(SEO_URL, {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'status' }),
      });
      const d = await r.json();
      setStatus(d.status);
      setGptOk(d.gpt_configured);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const run = async (preview = false) => {
    setRunning(true);
    setResults([]);
    setLastRun(null);
    try {
      const r = await fetch(SEO_URL, {
        method: 'POST', headers,
        body: JSON.stringify({
          action: preview ? 'preview' : 'run',
          limit,
          ...(listingId ? { listing_id: parseInt(listingId) } : {}),
        }),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      setResults(d.results || []);
      setLastRun({ processed: d.processed, errors: d.errors, total: d.total });
      if (!preview) await loadStatus();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setRunning(false);
    }
  };

  const coverage = status
    ? Math.round(((status.total_active - status.no_seo_title) / Math.max(status.total_active, 1)) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display font-700 text-2xl mb-1 flex items-center gap-2">
          <Icon name="Search" size={22} className="text-brand-blue" />
          Автоматическая SEO-оптимизация
        </h2>
        <p className="text-sm text-muted-foreground">
          ИИ генерирует seo_title и seo_description для каждого объекта на основе его данных.
          Заполненные SEO-поля улучшают позиции в Яндексе и Google.
        </p>
      </div>

      {/* Статус */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Icon name="Loader2" size={18} className="animate-spin" /> Загрузка...</div>
      ) : status ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon="Building2" label="Активных объектов" value={status.total_active} color="blue" />
          <StatCard icon="AlertCircle" label="Без SEO Title" value={status.no_seo_title} color={status.no_seo_title > 0 ? 'amber' : 'green'} />
          <StatCard icon="FileText" label="Без SEO Description" value={status.no_seo_desc} color={status.no_seo_desc > 0 ? 'amber' : 'green'} />
          <StatCard icon="Gauge" label="Покрытие SEO" value={`${coverage}%`} color={coverage >= 80 ? 'green' : 'amber'} />
        </div>
      ) : null}

      {/* Прогресс-бар покрытия */}
      {status && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">SEO-покрытие каталога</span>
            <span className="text-sm text-muted-foreground">{coverage}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${coverage >= 80 ? 'bg-emerald-500' : coverage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${coverage}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {status.no_seo_title > 0
              ? `${status.no_seo_title} объектов без SEO Title — запусти оптимизацию`
              : 'Отлично! Все активные объекты имеют SEO Title'}
          </p>
        </div>
      )}

      {/* Настройки GPT */}
      {!gptOk && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Icon name="AlertTriangle" size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-800 text-sm">YandexGPT не настроен</div>
            <div className="text-xs text-amber-700 mt-0.5">
              Для автоматической генерации SEO добавьте API-ключ и Folder ID в{' '}
              <span className="font-semibold">Настройки → Интеграции</span>.
            </div>
          </div>
        </div>
      )}

      {/* Управление */}
      <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <div className="font-display font-700 text-base flex items-center gap-2">
          <Icon name="Zap" size={16} className="text-brand-blue" />
          Запуск оптимизации
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Объектов за раз (1–50)</label>
            <input type="number" min={1} max={50} value={limit}
              onChange={e => setLimit(Math.min(50, Math.max(1, +e.target.value)))}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">ID конкретного объекта (опционально)</label>
            <input type="number" placeholder="Оставьте пустым для авто"
              value={listingId} onChange={e => setListingId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={previewMode} onChange={e => setPreviewMode(e.target.checked)} className="w-4 h-4" />
              <div>
                <div className="font-medium">Только просмотр</div>
                <div className="text-xs text-muted-foreground">Не сохранять в БД</div>
              </div>
            </label>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => run(previewMode)}
            disabled={running || !gptOk}
            className="btn-blue text-white px-5 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            {running
              ? <><Icon name="Loader2" size={15} className="animate-spin" /> Генерация...</>
              : <><Icon name="Sparkles" size={15} /> {previewMode ? 'Предпросмотр' : 'Запустить оптимизацию'}</>}
          </button>
          <button onClick={loadStatus} disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted inline-flex items-center gap-2">
            <Icon name="RefreshCw" size={14} /> Обновить статус
          </button>
        </div>

        {lastRun && (
          <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${lastRun.errors > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
            <Icon name={lastRun.errors > 0 ? 'AlertCircle' : 'CheckCircle2'} size={16} />
            Обработано: <strong>{lastRun.processed}</strong> из {lastRun.total}
            {lastRun.errors > 0 && <>, ошибок: <strong className="text-red-600">{lastRun.errors}</strong></>}
            {previewMode && <span className="ml-1 text-xs opacity-70">(предпросмотр — не сохранено)</span>}
          </div>
        )}
      </div>

      {/* Результаты */}
      {results.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="font-display font-700 text-base mb-3">Результаты</div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {results.map(r => (
              <div key={r.id} className={`p-3 rounded-xl border text-sm ${r.status === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon name={r.status === 'ok' ? 'CheckCircle2' : 'XCircle'} size={14}
                    className={r.status === 'ok' ? 'text-emerald-600' : 'text-red-500'} />
                  <span className="font-semibold">Объект #{r.id}</span>
                </div>
                {r.status === 'ok' ? (
                  <div className="space-y-1">
                    <div className="text-xs"><span className="font-medium text-muted-foreground">Title:</span> {r.seo_title}</div>
                    <div className="text-xs"><span className="font-medium text-muted-foreground">Desc:</span> {r.seo_description}</div>
                  </div>
                ) : (
                  <div className="text-xs text-red-600">{r.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Что делает автоматизация */}
      <div className="bg-muted/30 rounded-2xl p-5 space-y-2">
        <div className="font-semibold text-sm flex items-center gap-2">
          <Icon name="Info" size={14} /> Как работает SEO-автоматизация
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Выбирает активные объекты без seo_title (или конкретный по ID)</li>
          <li>Для каждого объекта формирует промпт: тип, площадь, район, цена, описание</li>
          <li>YandexGPT генерирует уникальный SEO Title (до 65 символов) и Description (до 155)</li>
          <li>Сохраняет в базу данных — результат виден на странице объекта сразу</li>
          <li>Режим «Только просмотр» позволяет проверить результат до записи</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number | string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colorMap[color]}`}>
        <Icon name={icon} size={18} />
      </div>
      <div className="font-display font-700 text-2xl">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}