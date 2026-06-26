import Icon from '@/components/ui/icon';

interface LeadAiSearchProps {
  aiQuery: string;
  aiLoading: boolean;
  aiIds: number[] | null;
  aiReasoning: string;
  onQueryChange: (v: string) => void;
  onSearch: () => void;
  onReset: () => void;
}

export default function LeadAiSearch({
  aiQuery, aiLoading, aiIds, aiReasoning,
  onQueryChange, onSearch, onReset,
}: LeadAiSearchProps) {
  return (
    <div className="bg-gradient-to-br from-brand-blue/5 to-brand-orange/5 border border-brand-blue/15 rounded-2xl p-4 sm:p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-orange to-rose-500 flex items-center justify-center shrink-0">
          <Icon name="Sparkles" size={16} className="text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">ИИ-поиск Виртуального брокера</h3>
          <div className="text-[11px] text-muted-foreground">Опишите задачу — ВБ найдёт похожие заявки</div>
        </div>
      </div>
      <form onSubmit={e => { e.preventDefault(); onSearch(); }} className="flex flex-col sm:flex-row gap-2">
        <input
          value={aiQuery}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Например: ищу офис в центре до 80 м² под IT"
          className="flex-1 px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:border-brand-blue"
          disabled={aiLoading}
        />
        <button
          type="submit"
          disabled={aiLoading || !aiQuery.trim()}
          className="btn-orange text-white px-5 py-2 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60 min-h-[40px]"
        >
          <Icon name={aiLoading ? 'Loader2' : 'Sparkles'} size={14} className={aiLoading ? 'animate-spin' : ''} />
          {aiLoading ? 'Ищу…' : 'Найти'}
        </button>
      </form>
      {aiIds && (
        <div className="mt-2 flex items-start justify-between gap-2 text-xs">
          <div className="text-muted-foreground flex-1">
            {aiReasoning ? <><b>ВБ:</b> {aiReasoning}</> : `Найдено ${aiIds.length} заявок`}
          </div>
          <button onClick={onReset} className="text-brand-blue hover:underline shrink-0 inline-flex items-center gap-1">
            <Icon name="X" size={11} /> Показать все
          </button>
        </div>
      )}
    </div>
  );
}
