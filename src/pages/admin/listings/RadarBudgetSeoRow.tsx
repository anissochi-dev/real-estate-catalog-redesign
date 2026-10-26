import Icon from '@/components/ui/icon';
import { Listing } from './types';
import { fmt } from './internalCardTypes';
import { BudgetItem, PRIORITY_CFG } from './radarTypes';
import RadarBlock from './RadarBlock';

interface Props {
  listing: Listing;
  budgetItem: BudgetItem | null;
  prc: (typeof PRIORITY_CFG)[keyof typeof PRIORITY_CFG] | null;
  daysOnMarket: number | null;
  seoPoints: number;
  seoColor: string;
  seoBg: string;
}

export default function RadarBudgetSeoRow({ listing, budgetItem, prc, daysOnMarket, seoPoints, seoColor, seoBg }: Props) {
  return (
    <>
  {/* ── Строка 2: Умный бюджет + SEO-оценка ── */}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

    {/* Умный бюджет */}
    <RadarBlock icon="Wallet" title="Умный бюджет">
      {prc ? (
        <div className={`rounded-xl border px-3 py-2.5 ${prc.cls}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${prc.dot}`} />
            <span className="font-semibold text-sm">{prc.label}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="font-bold text-base">{budgetItem!.days_on_market}</div>
              <div className="opacity-70">дней</div>
            </div>
            <div>
              <div className="font-bold text-base">{budgetItem!.views_total}</div>
              <div className="opacity-70">просмотров</div>
            </div>
            <div>
              <div className="font-bold text-base">{budgetItem!.conversion.toFixed(1)}%</div>
              <div className="opacity-70">конверсия</div>
            </div>
          </div>
          {budgetItem!.budget > 0 && (
            <div className="mt-2 pt-2 border-t border-current/10 text-xs">
              Рекомендованный бюджет: <span className="font-bold">{fmt(budgetItem!.budget)} ₽/мес</span>
            </div>
          )}
          {budgetItem!.channels && budgetItem!.channels.length > 0 && (
            <div className="mt-2 space-y-1">
              {budgetItem!.channels.map((ch, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 opacity-80">{ch.name}</span>
                  <span className="font-semibold">{fmt(ch.budget)} ₽</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-3 flex flex-col items-center gap-1">
          <Icon name="CheckCircle2" size={20} className="text-emerald-400" />
          {daysOnMarket !== null
            ? <span>{daysOnMarket} дней на рынке — всё в норме</span>
            : <span>Данные умного бюджета недоступны</span>
          }
        </div>
      )}
    </RadarBlock>

    {/* SEO-оценка */}
    <RadarBlock icon="Search" title="SEO-оценка">
      <div className={`rounded-xl border px-3 py-2.5 mb-3 ${seoBg}`}>
        <div className={`text-2xl font-bold ${seoColor}`}>{seoPoints}/6</div>
        <div className={`text-xs mt-0.5 ${seoColor} opacity-80`}>
          {seoPoints >= 5 ? 'Отличная оптимизация' : seoPoints >= 3 ? 'Требует доработки' : 'Нужно заполнить SEO'}
        </div>
      </div>
      <div className="space-y-1.5">
        {[
          { label: 'SEO-заголовок',   ok: !!listing.seo_title },
          { label: 'SEO-описание',     ok: !!listing.seo_description },
          { label: 'Название',         ok: !!listing.title },
          { label: 'Описание',         ok: !!listing.description },
          { label: 'Координаты',       ok: !!(listing as unknown as Record<string, unknown>).lat },
          { label: 'Фотографии',       ok: !!(listing.images && (listing.images as unknown as string[]).length > 0) },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            <Icon
              name={item.ok ? 'CheckCircle2' : 'Circle'}
              size={13}
              className={item.ok ? 'text-emerald-500' : 'text-muted-foreground/40'}
            />
            <span className={item.ok ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
          </div>
        ))}
      </div>
    </RadarBlock>
  </div>
    </>
  );
}
