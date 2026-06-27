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
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => onFullscreenChange(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [onFullscreenChange]);

  useEffect(() => {
    if (fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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

        {/* Закрыть карту — только на мобильном */}
        <div className="absolute top-3 right-3 z-10 flex items-center bg-white/95 backdrop-blur-sm rounded-xl shadow-md overflow-hidden border border-border/40">
          <button
            onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); onClose(); }}
            className="lg:hidden flex items-center gap-1.5 px-2.5 h-8 text-xs font-semibold text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <Icon name="X" size={13} />
            Скрыть
          </button>
        </div>

        {/* Карта */}
        <YandexMap
          points={mapPoints}
          center={mapPoints.length === 0 ? KRASNODAR_CENTER : undefined}
          zoom={11}
          height="100%"
          className={fullscreen ? '!rounded-none' : ''}
          onPointClick={onPointClick}
          highlightedId={highlightedId}
        />

        {/* Карточка выбранного объекта — снизу, кликабельная */}
        {mapSelected && (
          <div className="absolute bottom-4 left-3 right-3 z-10 max-w-sm">
            <div
              className="bg-white rounded-2xl shadow-xl border border-border flex gap-3 items-start p-3 cursor-pointer hover:shadow-2xl hover:border-brand-blue/40 transition-all duration-200"
              onClick={() => navigate(`/object/${listingSlug(mapSelected.title, mapSelected.id)}`)}
            >
              {mapSelected.image && (
                <img
                  src={mapSelected.image}
                  alt={mapSelected.title}
                  className="w-16 h-16 rounded-xl object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="text-[13px] font-bold text-foreground line-clamp-2 leading-snug mb-1">
                  {mapSelected.title}
                </div>
                <div className="text-[11px] text-muted-foreground truncate mb-1">
                  {[mapSelected.address, mapSelected.district].filter(Boolean).join(', ') || ''}
                </div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[16px] font-display font-700 text-brand-blue leading-none">
                    {formatPrice(mapSelected.price, mapSelected.deal)}
                  </span>
                  {mapSelected.area > 0 && (
                    <span className="text-[11px] text-muted-foreground">· {mapSelected.area} м²</span>
                  )}
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onDeselectPoint(); }}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground mt-0.5"
                aria-label="Закрыть"
              >
                <Icon name="X" size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}