import Icon from '@/components/ui/icon';
import { MemoryItem, Usage, fmtBytes } from './types';

interface Props {
  usage: Usage | null;
  items: MemoryItem[];
  filtered: MemoryItem[];
  filter: string;
  trainingNews: boolean;
  onFilterChange: (v: string) => void;
  onTrainOpen: () => void;
  onAddFact: () => void;
}

export default function VBKnowledgeHeader({
  usage, items, filtered, filter, trainingNews,
  onFilterChange, onTrainOpen, onAddFact,
}: Props) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-800 text-lg flex items-center gap-2">
            <Icon name="Brain" size={20} className="text-brand-blue" />
            База знаний Виртуального брокера
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            ВБ использует эти факты для ответов клиентам. Глоссарий терминов, FAQ по сайту, правила подбора объектов и т.п.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onTrainOpen}
            disabled={trainingNews}
            title="Переобучить ВБ из выбранных источников"
            className="px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-60 transition"
          >
            <Icon name={trainingNews ? 'Loader2' : 'Sparkles'} size={15} className={trainingNews ? 'animate-spin' : ''} />
            {trainingNews ? 'Переобучение…' : 'Переобучить ВБ'}
          </button>
          <button
            onClick={onAddFact}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
          >
            <Icon name="Plus" size={15} /> Добавить факт
          </button>
        </div>
      </div>

      {usage && (() => {
        const pct = usage.usage_percent;
        const isCritical = pct >= 100;
        const isWarn = pct >= 80;
        const barColor = isCritical ? 'bg-red-500' : isWarn ? 'bg-amber-500' : 'bg-emerald-500';
        const limitMb = Math.round(usage.limit_bytes / 1024 / 1024);
        return (
          <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-foreground">
                Использовано: {fmtBytes(usage.total_bytes)} из {limitMb} МБ ({usage.items_count} {usage.items_count === 1 ? 'факт' : 'фактов'})
              </span>
              <span className={`font-bold ${isCritical ? 'text-red-600' : isWarn ? 'text-amber-600' : 'text-emerald-600'}`}>
                {pct.toFixed(2)}%
              </span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${barColor} transition-all duration-500`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            {isCritical && (
              <div className="mt-2 text-xs text-red-700 inline-flex items-center gap-1.5">
                <Icon name="AlertCircle" size={13} />
                Лимит исчерпан. Удалите старые факты или закажите расширение базы знаний.
              </div>
            )}
            {isWarn && !isCritical && (
              <div className="mt-2 text-xs text-amber-700 inline-flex items-center gap-1.5">
                <Icon name="AlertTriangle" size={13} />
                База знаний почти заполнена. Рекомендуем расширение на +100 МБ.
              </div>
            )}
          </div>
        );
      })()}

      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={e => onFilterChange(e.target.value)}
            placeholder="Поиск по ключу или содержимому…"
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {filtered.length} из {items.length}
        </div>
      </div>
    </div>
  );
}
