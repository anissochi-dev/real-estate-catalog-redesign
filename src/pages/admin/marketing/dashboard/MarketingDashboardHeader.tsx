import Icon from '@/components/ui/icon';
import { MarketingStats } from '../shared';

type Period = '7' | '30' | '90' | 'all';
type ActiveSection = 'overview' | 'sources' | 'objects' | 'budget';

const PERIOD_OPTS: { value: Period; label: string }[] = [
  { value: '7', label: '7 дней' },
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
  { value: 'all', label: 'Всё время' },
];

interface Props {
  period: Period;
  setPeriod: (p: Period) => void;
  loading: boolean;
  stats: MarketingStats | null;
  highPriorityCount: number;
  activeSection: ActiveSection;
  setActiveSection: (s: ActiveSection) => void;
  onRefresh: () => void;
  onExportCSV: () => void;
}

export default function MarketingDashboardHeader({
  period, setPeriod, loading, stats, highPriorityCount,
  activeSection, setActiveSection, onRefresh, onExportCSV,
}: Props) {
  return (
    <div className="bg-white rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Icon name="LayoutDashboard" size={20} className="text-brand-blue" />
            Пульт маркетолога
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Аналитика, спрос и умный бюджет в одном месте
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
            {PERIOD_OPTS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  period === opt.value ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {stats && (
            <button
              onClick={onExportCSV}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition"
              title="Выгрузить в CSV"
            >
              <Icon name="Download" size={13} /> CSV
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition disabled:opacity-50"
          >
            <Icon name="RefreshCw" size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Загрузка…' : 'Обновить'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 mt-4 overflow-x-auto scrollbar-hide">
        {([
          { id: 'overview', icon: 'BarChart3', label: 'Обзор' },
          { id: 'sources',  icon: 'Funnel',    label: 'Источники' },
          { id: 'objects',  icon: 'Building2', label: 'Объекты' },
          { id: 'budget',   icon: 'Wallet',    label: `Бюджет${highPriorityCount > 0 ? ` (${highPriorityCount} срочно)` : ''}` },
        ] as const).map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex-shrink-0 ${
              activeSection === s.id
                ? 'bg-brand-blue text-white'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted/70'
            } ${s.id === 'budget' && highPriorityCount > 0 && activeSection !== 'budget' ? 'ring-2 ring-red-300' : ''}`}
          >
            <Icon name={s.icon} size={13} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
