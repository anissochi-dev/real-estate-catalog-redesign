import Icon from '@/components/ui/icon';

interface Props {
  expanded: boolean;
  onToggle: () => void;
}

export default function InvestmentModelHeader({ expanded, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 hover:from-sky-100 hover:via-blue-100 hover:to-indigo-100 transition text-left"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
          <Icon name="TrendingUp" size={16} className="text-blue-500" />
        </div>
        <div>
          <div className="font-display font-700 text-base flex items-center gap-1.5 text-blue-900">
            Инвест-модель NOI
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-200 text-blue-700 font-semibold">AI</span>
          </div>
          <div className="text-[11px] text-blue-600/70">
            Cap Rate · NPV · IRR · payback с рычагом · «Что-если»
          </div>
        </div>
      </div>
      <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={18} className="text-blue-400 shrink-0" />
    </button>
  );
}
