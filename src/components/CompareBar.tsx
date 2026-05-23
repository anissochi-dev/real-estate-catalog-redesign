import Icon from '@/components/ui/icon';

interface CompareBarProps {
  count: number;
  onCompare: () => void;
  onClear: () => void;
}

export default function CompareBar({ count, onCompare, onClear }: CompareBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 compare-bar px-3 sm:px-4 py-2 sm:py-3 pb-[max(8px,env(safe-area-inset-bottom))] animate-fade-in-up">
      <div className="container mx-auto flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl btn-orange flex items-center justify-center shrink-0">
            <Icon name="GitCompare" size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-700 text-sm text-foreground truncate">
              Сравнение
            </div>
            <div className="text-[11px] sm:text-xs text-muted-foreground">
              {count} из 3
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="hidden sm:flex gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all duration-200
                  ${i < count
                    ? 'border-brand-orange bg-brand-orange/10'
                    : 'border-border bg-muted'
                  }`}
              >
                {i < count && <Icon name="Check" size={14} className="text-brand-orange" />}
              </div>
            ))}
          </div>
          <button
            onClick={onClear}
            aria-label="Очистить сравнение"
            className="p-2.5 text-muted-foreground hover:text-destructive transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <Icon name="X" size={18} />
          </button>
          <button
            onClick={onCompare}
            disabled={count < 2}
            className="btn-blue text-white px-3 sm:px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold font-display disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] whitespace-nowrap"
          >
            Сравнить →
          </button>
        </div>
      </div>
    </div>
  );
}