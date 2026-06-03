import Icon from '@/components/ui/icon';

export interface AiDistrict {
  name: string;
  city: string;
  description: string;
  slug: string;
  sort_order: number;
}

interface Props {
  items: AiDistrict[];
  selected: Set<number>;
  cityName: string;
  onToggle: (i: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  importing: boolean;
  onImport: () => void;
  error: string;
}

export default function AiResultGrid({ items, selected, cityName, onToggle, onSelectAll, onDeselectAll, importing, onImport, error }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-violet-700 font-semibold">
          ИИ обработал {items.length} районов для «{cityName}»
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onSelectAll} className="text-xs text-violet-600 hover:underline">Выбрать все</button>
          <span className="text-violet-300">·</span>
          <button type="button" onClick={onDeselectAll} className="text-xs text-violet-600 hover:underline">Снять все</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
        {items.map((d, i) => (
          <label
            key={i}
            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
              selected.has(i) ? 'bg-white border-violet-300' : 'bg-white/50 border-violet-100 opacity-60'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => onToggle(i)}
              className="mt-0.5 accent-violet-600 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{d.name}</div>
              {d.description
                ? <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.description}</div>
                : <div className="text-xs text-muted-foreground/50 mt-0.5 italic">Описание не найдено</div>
              }
            </div>
          </label>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <Icon name="AlertCircle" size={14} /> {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onImport}
          disabled={importing || selected.size === 0}
          className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 transition"
        >
          <Icon name={importing ? 'Loader2' : 'Download'} size={14} className={importing ? 'animate-spin' : ''} />
          {importing ? 'Добавляю...' : `Добавить выбранные (${selected.size})`}
        </button>
        <span className="text-xs text-muted-foreground">Уже существующие будут пропущены</span>
      </div>
    </div>
  );
}
