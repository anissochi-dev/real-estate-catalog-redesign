import Icon from '@/components/ui/icon';

interface MarketIndexHeroProps {
  updatedAt: string | null;
  totalAnalogs: number;
}

export default function MarketIndexHero({ updatedAt, totalAnalogs }: MarketIndexHeroProps) {
  const fmtFullDate = (s: string | null) => {
    if (!s) return null;
    return new Date(s).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 text-brand-blue mb-2">
        <Icon name="TrendingUp" size={20} />
        <span className="text-sm font-semibold">Аналитика рынка</span>
      </div>
      <h1 className="font-display font-800 text-3xl text-foreground mb-1">
        Индекс цен коммерческой недвижимости Краснодара
      </h1>
      <h2 className="font-display font-600 text-lg text-brand-blue mb-2">
        Актуальные медианные цены по категориям и районам
      </h2>
      <p className="text-muted-foreground max-w-2xl">
        Собираем и сравниваем реальные предложения по офисам, торговым помещениям, складам и другой
        коммерческой недвижимости — данные обновляются автоматически.
      </p>
      {(updatedAt || totalAnalogs > 0) && (
        <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
          {updatedAt && (
            <span className="flex items-center gap-1.5">
              <Icon name="RefreshCw" size={14} />
              Обновлено: {fmtFullDate(updatedAt)}
            </span>
          )}
          {totalAnalogs > 0 && (
            <span className="flex items-center gap-1.5">
              <Icon name="Building2" size={14} />
              {totalAnalogs.toLocaleString('ru')} объектов в выборке
            </span>
          )}
        </div>
      )}
    </div>
  );
}
