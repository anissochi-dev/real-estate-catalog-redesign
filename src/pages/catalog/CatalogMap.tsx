import { useRef, useEffect } from 'react';
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
  fullscreen: boolean;
  highlightedId?: number | null;
  onClose: () => void;
  onPointClick: (pt: { id: number }) => void;
  onDeselectPoint: () => void;
  onFullscreenChange: (v: boolean) => void;
  className?: string;
  height?: number | string;
}

const KRASNODAR_CENTER: [number, number] = [45.0355, 38.9753];

export default function CatalogMap({
  mapPoints, mapSelected, city, fullscreen, highlightedId, onClose, onPointClick,
  onDeselectPoint, onFullscreenChange, className, height = 420,
}: CatalogMapProps) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Слушаем нативное событие fullscreenchange — синхронизируем стейт наверх
  useEffect(() => {
    const handler = () => {
      onFullscreenChange(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [onFullscreenChange]);

  // ESC при нативном fullscreen браузер обрабатывает сам (выходит из fullscreen)
  // Дополнительно ловим ESC для закрытия когда fullscreen = false (обычный режим)
  useEffect(() => {
    if (fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen, onClose]);

  return (
    <div
      ref={wrapRef}
      className={fullscreen ? 'w-full h-full bg-white' : (className ?? 'border-b border-border bg-white')}
      style={fullscreen ? undefined : { height }}
    >
      <div className="relative w-full h-full">

        {/* Счётчик объектов */}
        <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-md">
          <div className="text-xs font-semibold text-brand-blue font-display flex items-center gap-1">
            <Icon name="MapPin" size={12} />
            {city || 'Краснодар'}
          </div>
          <div className="text-[10px] text-muted-foreground">{mapPoints.length} объектов на карте</div>
        </div>

        {/* Кнопки управления — единая группа-пилюля */}
        <div className="absolute top-3 right-3 z-10 flex items-center bg-white/95 backdrop-blur-sm rounded-xl shadow-md overflow-hidden border border-border/40">

          {/* Закрыть карту — только на мобильном */}
          <button
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              onClose();
            }}
            className="lg:hidden flex items-center gap-1.5 px-2.5 h-8 text-xs font-semibold text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <Icon name="X" size={13} />
            Скрыть
          </button>
        </div>

        {/* Сама карта */}
        <YandexMap
          points={mapPoints}
          center={mapPoints.length === 0 ? KRASNODAR_CENTER : undefined}
          zoom={11}
          height="100%"
          className={fullscreen ? '!rounded-none' : ''}
          onPointClick={onPointClick}
          highlightedId={highlightedId}
        />

        {/* Карточка выбранного объекта */}
        {mapSelected && (
          <div className="absolute bottom-3 left-3 right-3 z-10 max-w-sm">
            <div
              className="bg-white rounded-xl shadow-lg border border-brand-blue/30 p-3 flex gap-3 items-start cursor-pointer hover:shadow-xl hover:border-brand-blue/60 transition-all duration-200"
              onClick={() => navigate(`/object/${listingSlug(mapSelected.title, mapSelected.id)}`)}
            >
              {mapSelected.image && (
                <img src={mapSelected.image} alt={mapSelected.title} className="w-16 h-16 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold line-clamp-2 mb-0.5 group-hover:text-brand-blue">{mapSelected.title}</div>
                <div className="text-[11px] text-muted-foreground truncate mb-1">{mapSelected.address || mapSelected.district || ''}</div>
                <div className="text-sm font-display font-700 text-brand-blue">{formatPrice(mapSelected.price, mapSelected.deal)}</div>
                <div className="text-[10px] text-brand-blue/70 mt-1 font-medium">Нажмите, чтобы открыть →</div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onDeselectPoint(); }}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
                aria-label="Закрыть"
              >
                <Icon name="X" size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}