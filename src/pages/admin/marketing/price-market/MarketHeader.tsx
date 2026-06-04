import Icon from '@/components/ui/icon';
import { MarketStats, DEAL_LABELS, daysSince } from './types';

interface MarketHeaderProps {
  data: MarketStats | null;
  loading: boolean;
  refreshing: boolean;
  filterDeal: 'sale' | 'rent';
  filterDistrict: string;
  filterDays: number;
  dynamicDistricts: string[];
  onRefresh: (force?: boolean) => void;
  onDealChange: (deal: 'sale' | 'rent') => void;
  onDistrictChange: (district: string) => void;
  onDaysChange: (days: number) => void;
}

export default function MarketHeader({
  data, loading, refreshing,
  filterDeal, filterDistrict, filterDays, dynamicDistricts,
  onRefresh, onDealChange, onDistrictChange, onDaysChange,
}: MarketHeaderProps) {
  const sched = data?.schedule;
  const lastDays = daysSince(sched?.last_at || null);

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
            {sched?.last_at && <span> · последнее: {lastDays === 0 ? 'сегодня' : `${lastDays}д назад`}</span>}
          </p>
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
          <button onClick={() => onRefresh(true)} disabled={refreshing}
            className="flex items-center gap-1.5 text-xs bg-brand-blue text-white px-3 py-1.5 rounded-xl font-semibold disabled:opacity-60">
            <Icon name={refreshing ? 'Loader2' : 'RefreshCw'} size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Сбор данных…' : 'Обновить сейчас'}
          </button>
        </div>
      </div>

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
        {/* Район — из справочника районов */}
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
