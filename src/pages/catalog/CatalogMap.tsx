import { useNavigate } from 'react-router-dom';
import { Property } from '@/App';
import Icon from '@/components/ui/icon';
import YandexMap from '@/components/YandexMap';
import { formatPrice } from '@/components/PropertyCard';
import { listingSlug } from '@/lib/slug';

interface MapPoint {
  id: number;
  lat: number;
  lng: number;
  title: string;
  caption: string;
  type: string;
  isHot: boolean;
}

interface CatalogMapProps {
  mapPoints: MapPoint[];
  mapSelected: Property | null;
  city: string;
  onClose: () => void;
  onPointClick: (pt: { id: number }) => void;
  onDeselectPoint: () => void;
  /** Кастомные классы контейнера — переопределяют высоту/размер */
  className?: string;
  /** Высота карты (по умолчанию 420px) */
  height?: number | string;
}

const KRASNODAR_CENTER: [number, number] = [45.0355, 38.9753];

export default function CatalogMap({
  mapPoints, mapSelected, city, onClose, onPointClick, onDeselectPoint,
  className, height = 420,
}: CatalogMapProps) {
  const navigate = useNavigate();

  return (
    <div className={className ?? 'border-b border-border bg-white'} style={{ height }}>
      <div className="relative h-full">
        {/* Счётчик объектов */}
        <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm">
          <div className="text-xs font-semibold text-brand-blue font-display flex items-center gap-1">
            <Icon name="MapPin" size={12} />
            {city || 'Краснодар'}
          </div>
          <div className="text-[10px] text-muted-foreground">{mapPoints.length} объектов на карте</div>
        </div>
        {/* Кнопка закрытия */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-sm text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <Icon name="X" size={12} /> Скрыть
        </button>
        <YandexMap
          points={mapPoints}
          center={mapPoints.length === 0 ? KRASNODAR_CENTER : undefined}
          zoom={11}
          height="100%"
          onPointClick={onPointClick}
        />
        {/* Карточка выбранного объекта */}
        {mapSelected && (
          <div className="absolute bottom-3 left-3 right-3 z-10 bg-white rounded-xl shadow-lg border border-border p-3 flex gap-3 items-start max-w-sm">
            {mapSelected.image && (
              <img src={mapSelected.image} alt={mapSelected.title} className="w-16 h-16 rounded-lg object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate mb-0.5">{mapSelected.title}</div>
              <div className="text-[11px] text-muted-foreground truncate mb-1">{mapSelected.address || mapSelected.district || ''}</div>
              <div className="text-sm font-display font-700 text-brand-blue">{formatPrice(mapSelected.price, mapSelected.deal)}</div>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                onClick={() => navigate(`/object/${listingSlug(mapSelected.title, mapSelected.id)}`)}
                className="text-[11px] bg-brand-blue text-white px-2.5 py-1 rounded-lg font-semibold hover:bg-brand-blue/90 transition-colors"
              >
                Открыть
              </button>
              <button onClick={onDeselectPoint} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors text-center">
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}