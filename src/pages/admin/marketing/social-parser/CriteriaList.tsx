import Icon from '@/components/ui/icon';
import { Criteria, routeLabel, routeColor, fmtDate } from './criteriaTypes';

interface Props {
  criteria: Criteria[];
  loading: boolean;
  runningId: number | null;
  onNew: () => void;
  onEdit: (c: Criteria) => void;
  onRun: (id: number) => void;
  onToggle: (id: number) => void;
}

export default function CriteriaList({
  criteria,
  loading,
  runningId,
  onNew,
  onEdit,
  onRun,
  onToggle,
}: Props) {
  if (loading) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        <Icon name="Loader2" size={20} className="animate-spin mx-auto mb-2" />
        Загрузка…
      </div>
    );
  }

  if (criteria.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-border p-8 text-center">
        <Icon name="SlidersHorizontal" size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
        <p className="text-sm text-muted-foreground mb-3">Критериев пока нет</p>
        <p className="text-xs text-muted-foreground mb-4">
          Создайте критерий поиска, чтобы парсер знал что искать в соцсетях
        </p>
        <button onClick={onNew} className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold">
          Создать первый критерий
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {criteria.map(c => (
        <div key={c.id} className={`bg-white rounded-2xl border p-4 ${c.is_active ? 'border-border' : 'border-border opacity-60'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{c.title}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${routeColor[c.route_to] || 'bg-slate-50 text-slate-600'}`}>
                  → {routeLabel[c.route_to] || c.route_to}
                </span>
                {c.pending_count > 0 && (
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-semibold">
                    {c.pending_count} ожидают
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  {c.platforms.map(p => (
                    <span key={p} className={p === 'vk' ? 'text-blue-500' : p === 'ok' ? 'text-orange-500' : 'text-sky-500'}>
                      {p === 'vk' ? 'VK' : p === 'ok' ? 'OK' : 'TG'}
                    </span>
                  )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={i}>·</span>, el], [] as React.ReactNode[])}
                </span>
                {c.keywords_include.length > 0 && (
                  <span>
                    слова: {c.keywords_include.slice(0, 3).join(', ')}
                    {c.keywords_include.length > 3 && ` +${c.keywords_include.length - 3}`}
                  </span>
                )}
                {c.categories.length > 0 && (
                  <span>кат: {c.categories.length}</span>
                )}
                <span>каждые {c.run_interval_hours}ч</span>
                <span>посл.: {fmtDate(c.last_run_at)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => onRun(c.id)}
                disabled={runningId === c.id}
                title="Запустить сейчас"
                className="p-1.5 hover:bg-violet-50 rounded-lg text-violet-600 disabled:opacity-50"
              >
                {runningId === c.id
                  ? <Icon name="Loader2" size={14} className="animate-spin" />
                  : <Icon name="Play" size={14} />}
              </button>
              <button onClick={() => onEdit(c)} title="Редактировать" className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground">
                <Icon name="Pencil" size={14} />
              </button>
              <button
                onClick={() => onToggle(c.id)}
                title={c.is_active ? 'Отключить' : 'Включить'}
                className={`p-1.5 rounded-lg ${c.is_active ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-muted'}`}
              >
                <Icon name={c.is_active ? 'ToggleRight' : 'ToggleLeft'} size={16} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
