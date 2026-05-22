import Icon from '@/components/ui/icon';
import { SeoResult } from './seoTypes';

interface Props {
  limit: number;
  setLimit: (n: number) => void;
  listingId: string;
  setListingId: (v: string) => void;
  previewMode: boolean;
  setPreviewMode: (v: boolean) => void;
  running: boolean;
  loading: boolean;
  gptOk: boolean;
  lastRun: { processed: number; errors: number; total: number; dry_run: boolean } | null;
  results: SeoResult[];
  onRun: (preview: boolean) => void;
  onRefresh: () => void;
}

export default function SeoRunTab({
  limit, setLimit, listingId, setListingId, previewMode, setPreviewMode,
  running, loading, gptOk, lastRun, results, onRun, onRefresh,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Объектов за раз (1–50)</label>
          <input type="number" min={1} max={50} value={limit}
            onChange={e => setLimit(Math.min(50, Math.max(1, +e.target.value)))}
            className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">ID объекта (опционально)</label>
          <input type="number" placeholder="Оставьте пустым для авто"
            value={listingId} onChange={e => setListingId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={previewMode}
              onChange={e => setPreviewMode(e.target.checked)} className="w-4 h-4" />
            <div>
              <div className="font-medium">Только просмотр</div>
              <div className="text-xs text-muted-foreground">Не сохранять в БД</div>
            </div>
          </label>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => onRun(previewMode)} disabled={running || !gptOk}
          className="btn-blue text-white px-5 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50">
          {running
            ? <><Icon name="Loader2" size={15} className="animate-spin" /> Генерация...</>
            : <><Icon name="Sparkles" size={15} /> {previewMode ? 'Предпросмотр' : 'Запустить'}</>}
        </button>
        <button onClick={onRefresh} disabled={loading}
          className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted inline-flex items-center gap-2">
          <Icon name="RefreshCw" size={14} /> Обновить
        </button>
      </div>

      {lastRun && (
        <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${lastRun.errors > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
          <Icon name={lastRun.errors > 0 ? 'AlertCircle' : 'CheckCircle2'} size={16} />
          Обработано: <strong>{lastRun.processed}</strong> из {lastRun.total}
          {lastRun.errors > 0 && <>, ошибок: <strong className="text-red-600">{lastRun.errors}</strong></>}
          {lastRun.dry_run && <span className="text-xs opacity-70 ml-1">(превью — не сохранено)</span>}
        </div>
      )}

      {results.length > 0 && (
        <div>
          <div className="font-semibold text-sm mb-2">Результаты</div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {results.map(r => (
              <div key={r.id} className={`p-3 rounded-xl border text-sm ${r.status === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon name={r.status === 'ok' ? 'CheckCircle2' : 'XCircle'} size={14}
                    className={r.status === 'ok' ? 'text-emerald-600' : 'text-red-500'} />
                  <span className="font-semibold">Объект #{r.id}</span>
                </div>
                {r.status === 'ok' ? (
                  <div className="space-y-0.5">
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
    </div>
  );
}
