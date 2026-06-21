import Icon from '@/components/ui/icon';
import { SeoResult } from './seoTypes';

const FIELD_OPTIONS = [
  { key: 'seo_title', label: 'SEO-заголовок', desc: 'title для поисковиков (до 65 симв.)' },
  { key: 'seo_description', label: 'SEO-описание', desc: 'meta description (до 155 симв.)' },
  { key: 'description', label: 'Описание объекта', desc: 'продающий текст в карточке' },
  { key: 'faq', label: 'FAQ', desc: '4 вопроса и ответа по объекту' },
];

interface Props {
  limit: number;
  setLimit: (n: number) => void;
  listingId: string;
  setListingId: (v: string) => void;
  previewMode: boolean;
  setPreviewMode: (v: boolean) => void;
  selectedFields: string[];
  setSelectedFields: (v: string[]) => void;
  running: boolean;
  loading: boolean;
  gptOk: boolean;
  lastRun: { processed: number; errors: number; total: number; dry_run: boolean; fields?: string[] } | null;
  results: SeoResult[];
  onRun: (preview: boolean) => void;
  onRefresh: () => void;
}

export default function SeoRunTab({
  limit, setLimit, listingId, setListingId, previewMode, setPreviewMode,
  selectedFields, setSelectedFields,
  running, loading, gptOk, lastRun, results, onRun, onRefresh,
}: Props) {
  const toggleField = (key: string) => {
    setSelectedFields(
      selectedFields.includes(key)
        ? selectedFields.filter(f => f !== key)
        : [...selectedFields, key]
    );
  };

  const noFields = selectedFields.length === 0;

  return (
    <div className="space-y-5">
      {/* Выбор полей */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          Что генерировать
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FIELD_OPTIONS.map(f => {
            const checked = selectedFields.includes(f.key);
            return (
              <label key={f.key}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                  ${checked ? 'border-blue-400 bg-blue-50' : 'border-border hover:bg-muted/50'}`}>
                <input type="checkbox" checked={checked}
                  onChange={() => toggleField(f.key)}
                  className="mt-0.5 w-4 h-4 accent-blue-600" />
                <div>
                  <div className="text-sm font-medium">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{f.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
        {noFields && (
          <div className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
            <Icon name="AlertCircle" size={12} /> Выберите хотя бы одно поле
          </div>
        )}
      </div>

      {/* Параметры запуска */}
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
        <button onClick={() => onRun(previewMode)} disabled={running || !gptOk || noFields}
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
          {lastRun.fields && lastRun.fields.length > 0 && (
            <span className="text-xs opacity-70 ml-1">
              · поля: {lastRun.fields.join(', ')}
            </span>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div>
          <div className="font-semibold text-sm mb-2">Результаты</div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {results.map(r => (
              <div key={r.id} className={`p-3 rounded-xl border text-sm ${r.status === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon name={r.status === 'ok' ? 'CheckCircle2' : 'XCircle'} size={14}
                    className={r.status === 'ok' ? 'text-emerald-600' : 'text-red-500'} />
                  <span className="font-semibold">Объект #{r.id}</span>
                </div>
                {r.status === 'ok' ? (
                  <div className="space-y-1">
                    {r.seo_title && <div className="text-xs"><span className="font-medium text-muted-foreground">SEO Title:</span> {r.seo_title}</div>}
                    {r.seo_description && <div className="text-xs"><span className="font-medium text-muted-foreground">SEO Desc:</span> {r.seo_description}</div>}
                    {r.description && (
                      <div className="text-xs">
                        <span className="font-medium text-muted-foreground">Описание:</span>{' '}
                        {r.description.slice(0, 120)}…
                      </div>
                    )}
                    {r.faq && r.faq.length > 0 && (
                      <div className="text-xs">
                        <span className="font-medium text-muted-foreground">FAQ:</span>{' '}
                        {r.faq.length} вопросов сгенерировано
                      </div>
                    )}
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
