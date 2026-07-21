import Icon from '@/components/ui/icon';
import { MarketStats, DEAL_LABELS, daysSince } from './types';

interface AssignProgress {
  processed: number;
  updated: number;
  remaining: number;
}

interface MarketHeaderProps {
  data: MarketStats | null;
  loading: boolean;
  refreshing: boolean;
  assigningDistricts: boolean;
  assignProgress: AssignProgress | null;
  aggregating: boolean;
  filterDeal: 'sale' | 'rent';
  filterDistrict: string;
  filterDays: number;
  dynamicDistricts: string[];
  onRefresh: (force?: boolean) => void;
  onAutoAssign: () => void;
  onAggregate: () => void;
  onDealChange: (deal: 'sale' | 'rent') => void;
  onDistrictChange: (district: string) => void;
  onDaysChange: (days: number) => void;
}

export default function MarketHeader({
  data, loading, refreshing,
  assigningDistricts, assignProgress,
  aggregating,
  filterDeal, filterDistrict, filterDays, dynamicDistricts,
  onRefresh, onAutoAssign, onAggregate, onDealChange, onDistrictChange, onDaysChange,
}: MarketHeaderProps) {
  const sched = data?.schedule;
  const lastDays = daysSince(sched?.last_at || null);
  const aggDays = daysSince(data?.agg_last_at || null);
  const totalAnalogs = (data?.latest ?? [])
    .filter(l => l.deal === filterDeal && l.district === filterDistrict)
    .reduce((sum, l) => sum + (l.analogs_count ?? 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Icon name="TrendingUp" size={18} className="text-brand-blue" />
            Мониторинг рыночных цен
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sched?.schedule ?? '1-е число каждого месяца'}
            {sched?.next_run && <span> · следующий: {new Date(sched.next_run).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}</span>}
            {sched?.last_at && <span> · парсинг: {lastDays === 0 ? 'сегодня' : `${lastDays}д назад`}</span>}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Icon name="Database" size={11} className="text-emerald-500" />
            Агрегация из базы:&nbsp;
            {aggDays === null
              ? <span className="text-amber-600">не выполнялась</span>
              : aggDays === 0
                ? <span className="text-emerald-600">сегодня</span>
                : <span>{aggDays}д назад</span>}
            <span className="text-muted-foreground/60">· автоматически каждый день</span>
          </p>
          {totalAnalogs > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Icon name="Building2" size={11} className="text-brand-blue" />
              {totalAnalogs.toLocaleString('ru')} объектов в текущей выборке
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {sched && (
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
              sched.enabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-muted border-border text-muted-foreground'
            }`}>
              <Icon name={sched.enabled ? 'CheckCircle2' : 'PauseCircle'} size={13} />
              {sched.enabled ? 'Авто-обновление вкл' : 'Авто-обновление выкл'}
            </div>
          )}
          <button
            onClick={onAutoAssign}
            disabled={assigningDistricts || refreshing || aggregating}
            title="Определить район по адресу для всех объявлений без района (AI)"
            className="flex items-center gap-1.5 text-xs bg-violet-600 text-white px-3 py-1.5 rounded-xl font-semibold disabled:opacity-60"
          >
            <Icon name={assigningDistricts ? 'Loader2' : 'MapPin'} size={13} className={assigningDistricts ? 'animate-spin' : ''} />
            {assigningDistricts ? 'Привязка районов…' : 'Привязать районы'}
          </button>
          <button
            onClick={onAggregate}
            disabled={aggregating || refreshing || assigningDistricts}
            title="Пересчитать медианы из импортированных объявлений (market_listings)"
            className="flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-xl font-semibold disabled:opacity-60"
          >
            <Icon name={aggregating ? 'Loader2' : 'Database'} size={13} className={aggregating ? 'animate-spin' : ''} />
            {aggregating ? 'Агрегация…' : 'Пересчитать из базы'}
          </button>
          <button onClick={() => onRefresh(true)} disabled={refreshing || assigningDistricts || aggregating}
            className="flex items-center gap-1.5 text-xs bg-brand-blue text-white px-3 py-1.5 rounded-xl font-semibold disabled:opacity-60">
            <Icon name={refreshing ? 'Loader2' : 'RefreshCw'} size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Сбор данных…' : 'Обновить сейчас'}
          </button>
        </div>
      </div>

      {/* Прогресс привязки районов */}
      {assigningDistricts && assignProgress && (
        <div className="mt-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <Icon name="Loader2" size={14} className="animate-spin text-violet-600 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-violet-700 font-medium">
                YandexGPT определяет районы по адресу…
              </span>
              <span className="text-violet-500">
                обработано {assignProgress.processed}, привязано {assignProgress.updated}
              </span>
            </div>
            {assignProgress.remaining > 0 && (
              <div className="mt-1.5 h-1 bg-violet-100 rounded-full overflow-hidden">
                <div
                  className="h-1 bg-violet-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((assignProgress.processed / (assignProgress.processed + assignProgress.remaining)) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Фильтры */}
      <div className="flex flex-wrap gap-2 mt-4 items-center">
        {/* Тип сделки */}
        <div className="flex gap-1 bg-muted/40 rounded-xl p-0.5">
          {(['rent','sale'] as const).map(d => (
            <button key={d} onClick={() => onDealChange(d)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${filterDeal === d ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              {DEAL_LABELS[d]}
            </button>
          ))}
        </div>
        {/* Период */}
        <select value={filterDays} onChange={e => onDaysChange(Number(e.target.value))}
          className="border border-border rounded-xl px-3 py-1.5 text-xs bg-white">
          <option value={30}>30 дней</option>
          <option value={90}>3 месяца</option>
          <option value={180}>6 месяцев</option>
          <option value={365}>1 год</option>
        </select>
        {/* Район */}
        <select value={filterDistrict} onChange={e => onDistrictChange(e.target.value)}
          className="border border-border rounded-xl px-3 py-1.5 text-xs bg-white">
          <option value="">Все районы</option>
          {dynamicDistricts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {loading && <Icon name="Loader2" size={14} className="animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}