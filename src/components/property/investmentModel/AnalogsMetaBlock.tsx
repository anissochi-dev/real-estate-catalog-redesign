import Icon from '@/components/ui/icon';
import { AnalogsMeta } from './types';

const LEVEL_LABEL: Record<string, string> = {
  address: 'по улице',
  district: 'по району',
  city: 'по городу',
  none: '',
};

const SOURCE_LABEL: Record<string, string> = {
  own: 'база', arrpro: 'АРРпро', cian: 'ЦИАН', ayax: 'Аякс',
  'arrpro+cian': 'АРРпро+ЦИАН',
};

export default function AnalogsMetaBlock({
  meta,
  onRefresh,
  refreshing,
}: {
  meta: AnalogsMeta;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const count = meta.analogs_count ?? 0;
  const level = meta.analogs_source_level;
  const sources = (meta.analogs_sources ?? [])
    .map(s => SOURCE_LABEL[s] || s)
    .filter(Boolean)
    .join(', ');
  const extScraped = meta.external_scraped;
  const hasEnough = count >= 35;

  const confidence = Math.min(1, count / 35);
  const confColor = confidence >= 1 ? 'bg-emerald-500' : confidence >= 0.6 ? 'bg-amber-400' : 'bg-red-400';
  const confLabel = confidence >= 1 ? 'Высокая' : confidence >= 0.6 ? 'Средняя' : 'Низкая';
  const confTextColor = confidence >= 1 ? 'text-emerald-700' : confidence >= 0.6 ? 'text-amber-700' : 'text-red-600';

  if (count === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
      {/* Строка 1: счётчик + источники + достоверность + кнопка */}
      <div className="flex items-center gap-1.5">
        <Icon name="BarChart2" size={12} className="text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Аналогов для расчёта:</span>
        <span className="font-semibold text-foreground">{count}</span>
        {level && LEVEL_LABEL[level] && (
          <span className="text-muted-foreground">({LEVEL_LABEL[level]})</span>
        )}
      </div>

      {sources && (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Источники:</span>
          <span className="font-medium text-foreground">{sources}</span>
        </div>
      )}

      {extScraped != null && extScraped > 0 && (
        <div className="flex items-center gap-1">
          <Icon name="RefreshCw" size={10} className="text-sky-500" />
          <span className="text-sky-600">+{extScraped} с рынка</span>
        </div>
      )}

      <div className="flex items-center gap-3 ml-auto">
        {/* Индикатор достоверности */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Достоверность:</span>
          <div className="flex items-center gap-1">
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${confColor} transition-all`}
                style={{ width: `${Math.round(confidence * 100)}%` }}
              />
            </div>
            <span className={`font-semibold ${confTextColor}`}>{confLabel}</span>
          </div>
        </div>

        {/* Кнопка обновления */}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-0.5 hover:bg-muted transition disabled:opacity-40"
          title="Обновить аналоги с рынка и пересчитать бенчмарки"
        >
          <Icon name="RefreshCw" size={10} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Ищу…' : 'Обновить аналоги'}
        </button>
      </div>

      {!hasEnough && (
        <div className="w-full flex items-center gap-1 text-amber-600">
          <Icon name="AlertTriangle" size={10} className="shrink-0" />
          <span>Мало аналогов — бенчмарки частично из справочных данных. Нажмите «Обновить аналоги» для поиска на рынке.</span>
        </div>
      )}
    </div>
  );
}
