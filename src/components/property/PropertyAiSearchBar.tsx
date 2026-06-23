import Icon from '@/components/ui/icon';

interface PropertyAiSearchBarProps {
  aiQuery: string;
  setAiQuery: (v: string) => void;
  setAiOpen: (v: boolean) => void;
  itemTitle: string;
}

export default function PropertyAiSearchBar({ aiQuery, setAiQuery, setAiOpen, itemTitle }: PropertyAiSearchBarProps) {
  return (
    <div className="bg-gradient-to-r from-brand-blue to-indigo-600 rounded-2xl px-4 py-3 mb-4">
      <form
        onSubmit={e => { e.preventDefault(); setAiOpen(true); }}
        className="flex items-center gap-2"
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-orange to-rose-500 flex items-center justify-center flex-shrink-0">
          <Icon name="Sparkles" size={14} className="text-white" />
        </div>
        <input
          value={aiQuery}
          onChange={e => setAiQuery(e.target.value)}
          placeholder={`Найти похожие на «${itemTitle.slice(0, 40)}${itemTitle.length > 40 ? '…' : ''}»`}
          className="flex-1 bg-transparent text-white placeholder:text-white/50 outline-none text-sm min-w-0"
        />
        {aiQuery && (
          <button type="button" onClick={() => setAiQuery('')} className="text-white/50 hover:text-white/80 flex-shrink-0">
            <Icon name="X" size={13} />
          </button>
        )}
        <button
          type="submit"
          className="flex-shrink-0 btn-orange text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5"
        >
          <Icon name="Sparkles" size={12} />
          Найти с ИИ
        </button>
      </form>
    </div>
  );
}
