import Breadcrumbs from '@/components/Breadcrumbs';
import Icon from '@/components/ui/icon';

interface DistrictHeroProps {
  placeTitle: string;
  displayName: string;
  isOkrug: boolean;
  placeLabel: string;
  city: string;
  itemsCount: number;
}

export default function DistrictHero({
  placeTitle, displayName, isOkrug, placeLabel, city, itemsCount,
}: DistrictHeroProps) {
  return (
    <div className="bg-gradient-to-br from-slate-700 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-10 md:py-14">
        <div className="mb-4">
          <Breadcrumbs
            items={[
              { label: 'Главная', to: '/' },
              { label: 'Каталог', to: '/catalog' },
              { label: placeTitle },
            ]}
            light
          />
        </div>
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Icon name="MapPin" size={28} className="text-white" />
          </div>
          <div>
            <h1 className="font-display font-900 text-2xl md:text-3xl leading-tight mb-1">
              Коммерческая недвижимость — {placeTitle}
            </h1>
            <h2 className="font-display font-600 text-base text-white/75 mb-2 leading-snug">
              Аренда и продажа объектов в {isOkrug ? displayName : `районе ${displayName}`}, {city}
            </h2>
            <p className="text-white/70 text-sm max-w-2xl leading-relaxed">
              {itemsCount > 0
                ? `В базе ${itemsCount} активных объектов в этом ${placeLabel}е — офисы, торговые площади, склады и другие.`
                : `Актуальные объекты коммерческой недвижимости в ${isOkrug ? displayName : `районе ${displayName}`}.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
