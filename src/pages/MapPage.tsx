import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Property } from '@/App';
import { formatPrice } from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';
import YandexMap from '@/components/YandexMap';
import { listingSlug } from '@/lib/slug';
import { useSettings } from '@/contexts/SettingsContext';
import { useSeoH1 } from '@/components/SeoHead';

interface MapPageProps {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  allLoaded?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  office: 'Офис',
  retail: 'Магазин/торговое',
  warehouse: 'Склад',
  restaurant: 'Общепит',
  business: 'Готовый бизнес',
  production: 'Производство',
  hotel: 'Гостиница',
  gab: 'ГАБ',
  land: 'Земля',
  building: 'Здание',
  free_purpose: 'Своб. назнач.',
  car_service: 'Автосервис',
};

const TYPE_ICON: Record<string, string> = {
  office: 'Building2',
  retail: 'ShoppingBag',
  warehouse: 'Warehouse',
  restaurant: 'UtensilsCrossed',
  business: 'Briefcase',
  production: 'Factory',
  hotel: 'BedDouble',
  gab: 'TrendingUp',
  land: 'Trees',
  building: 'Building',
  free_purpose: 'LayoutGrid',
  car_service: 'Wrench',
};

const TYPE_COLOR: Record<string, string> = {
  office: 'bg-blue-500',
  retail: 'bg-orange-500',
  warehouse: 'bg-slate-500',
  restaurant: 'bg-red-500',
  business: 'bg-violet-500',
  production: 'bg-stone-600',
  hotel: 'bg-pink-500',
  gab: 'bg-emerald-500',
  land: 'bg-lime-600',
  building: 'bg-cyan-600',
  free_purpose: 'bg-amber-500',
  car_service: 'bg-yellow-600',
};

const ALL_TYPES: string[] = [
  'office', 'retail', 'warehouse', 'restaurant', 'business', 'gab',
  'production', 'hotel', 'land', 'building', 'free_purpose', 'car_service',
];

const KRASNODAR_CENTER: [number, number] = [45.0355, 38.9753];

export default function MapPage({
  properties, favorites, compareList, onToggleFavorite, onToggleCompare, allLoaded = true,
}: MapPageProps) {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Property | null>(null);
  const [activeType, setActiveType] = useState('all');
  const h1 = useSeoH1('Карта коммерческой недвижимости');

  const filtered = useMemo(
    () => activeType === 'all' ? properties : properties.filter(p => String(p.type) === activeType),
    [activeType, properties],
  );

  // Отсекаем «заглушки»: ровные значения вроде 45.000000, 39.000000 или 45.000000, 38.000000.
  // Реальные координаты адреса всегда имеют дробную часть.
  const isStubCoord = (n: number) => Math.abs(n - Math.round(n * 1000) / 1000) < 1e-9 && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-9 && Math.abs(n - Math.round(n)) < 1e-6;

  const points = useMemo(
    () => filtered
      .filter(p =>
        Number.isFinite(p.lat) && Number.isFinite(p.lng)
        && p.lat !== 0 && p.lng !== 0
        // Отсечь координаты-заглушки (например 45.000000, 39.000000)
        && !(isStubCoord(p.lat) && isStubCoord(p.lng))
      )
      .map(p => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        title: p.title,
        caption: `${formatPrice(p.price, p.deal)} · ${p.area} м² · ${TYPE_LABEL[p.type] || p.type}`,
        type: String(p.type),
        isHot: p.isHot,
      })),
    [filtered],
  );

  const isFav: boolean = selected ? favorites.includes(selected.id) : false;
  const inCompare: boolean = selected ? compareList.includes(selected.id) : false;

  const handlePointClick = useCallback((p: { id: number }) => {
    setSelected(prev => (prev?.id === p.id ? prev : properties.find(x => x.id === p.id) || null));
  }, [properties]);

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <h1 className="sr-only">{h1}</h1>
      {/* Top filter bar */}
      <div className="bg-white border-b border-border px-3 sm:px-4 py-2 sm:py-3 flex gap-1.5 sm:gap-2 overflow-x-auto flex-shrink-0">
        <button
          onClick={() => setActiveType('all')}
          className={`flex-shrink-0 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 inline-flex items-center gap-1.5
            ${activeType === 'all' ? 'bg-brand-blue text-white' : 'bg-muted text-foreground hover:bg-brand-blue/10'}`}
        >
          Все ({properties.length})
          {!allLoaded && <span className="w-2.5 h-2.5 rounded-full border-2 border-current border-t-transparent animate-spin opacity-70" />}
        </button>
        {ALL_TYPES.map(type => {
          const count = properties.filter(p => String(p.type) === type).length;
          if (!count) return null;
          return (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`flex-shrink-0 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 inline-flex items-center gap-1.5
                ${activeType === type ? 'bg-brand-blue text-white' : 'bg-muted text-foreground hover:bg-brand-blue/10'}`}
            >
              <Icon name={TYPE_ICON[type] || 'MapPin'} size={13} />
              {TYPE_LABEL[type] || type} ({count})
            </button>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative bg-slate-100 min-h-[50vh] lg:min-h-0">
          <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm">
            <div className="text-xs font-semibold text-brand-blue font-display flex items-center gap-1">
              <Icon name="MapPin" size={12} />
              {settings.main_city || 'Краснодар'}
            </div>
            <div className="text-[10px] text-muted-foreground">{points.length} объектов на карте</div>
          </div>
          <YandexMap
            points={points}
            center={points.length === 0 ? KRASNODAR_CENTER : undefined}
            zoom={11}
            height="100%"
            onPointClick={handlePointClick}
          />

          {/* Легенда категорий — показываем только те, у которых есть объекты */}
          <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm max-w-[calc(100%-1.5rem)]">
            <div className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Категории</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {ALL_TYPES.filter(t => properties.some(p => String(p.type) === t)).map(t => (
                <div key={t} className="flex items-center gap-1.5 text-[11px]">
                  <span className={`w-5 h-5 rounded-full ${TYPE_COLOR[t] || 'bg-slate-400'} flex items-center justify-center flex-shrink-0`}>
                    <Icon name={TYPE_ICON[t] || 'MapPin'} size={11} className="text-white" />
                  </span>
                  <span className="text-foreground">{TYPE_LABEL[t] || t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-80 bg-white lg:border-l border-t lg:border-t-0 border-border flex flex-col overflow-hidden max-h-[60vh] lg:max-h-none">
          {selected ? (
            <div className="flex-1 overflow-y-auto animate-slide-in-right">
              <div className="relative">
                {selected.image ? (
                  <img src={selected.image} alt={selected.title} className="w-full h-44 object-cover" />
                ) : (
                  <div className="w-full h-44 bg-muted flex items-center justify-center">
                    <Icon name="Image" size={36} className="text-muted-foreground" />
                  </div>
                )}
                <button
                  onClick={() => setSelected(null)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"
                >
                  <Icon name="X" size={16} />
                </button>
                <div className="absolute bottom-3 left-3">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-blue text-white font-display">
                    {TYPE_LABEL[selected.type] || selected.type}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-display font-700 text-base mb-1">{selected.title}</h3>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                  <Icon name="MapPin" size={12} />
                  {selected.address}
                </div>
                <div className="font-display font-800 text-2xl text-brand-blue mb-1">
                  {formatPrice(selected.price, selected.deal)}
                </div>
                {selected.pricePerM2 && (
                  <div className="text-xs text-muted-foreground mb-3">{selected.pricePerM2.toLocaleString('ru')} ₽/м²</div>
                )}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-muted rounded-lg p-2">
                    <div className="text-[10px] text-muted-foreground mb-0.5">Площадь</div>
                    <div className="font-display font-700 text-sm">{selected.area} м²</div>
                  </div>
                  {selected.payback ? (
                    <div className="bg-emerald-50 rounded-lg p-2">
                      <div className="text-[10px] text-muted-foreground mb-0.5">Окупаемость</div>
                      <div className="font-display font-700 text-sm text-emerald-600">{selected.payback} мес</div>
                    </div>
                  ) : (
                    <div className="bg-muted rounded-lg p-2">
                      <div className="text-[10px] text-muted-foreground mb-0.5">Район</div>
                      <div className="font-display font-700 text-sm truncate">{selected.district || '—'}</div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigate(`/object/${listingSlug(selected.title, selected.id)}`)}
                    className="flex-1 btn-blue text-white py-2 rounded-xl text-sm font-semibold">
                    Подробнее
                  </button>
                  <button onClick={() => onToggleFavorite(selected.id)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-colors ${isFav ? 'border-red-500 bg-red-500 text-white' : 'border-border text-muted-foreground'}`}>
                    <Icon name="Heart" size={16} />
                  </button>
                  <button onClick={() => onToggleCompare(selected.id)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-colors ${inCompare ? 'border-brand-orange bg-brand-orange text-white' : 'border-border text-muted-foreground'}`}>
                    <Icon name="GitCompare" size={16} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <Icon name="MousePointerClick" size={32} className="text-muted-foreground/40 mb-2" />
              <div className="text-sm font-semibold mb-1">Выберите метку на карте</div>
              <div className="text-xs text-muted-foreground">Чтобы увидеть детали объекта</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}