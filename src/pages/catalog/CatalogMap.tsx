import { useRef, useEffect } from 'react';
import { Property } from '@/App';
import Icon from '@/components/ui/icon';
import YandexMap from '@/components/YandexMap';

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

  useEffect(() => {
    const handler = () => {
      onFullscreenChange(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [onFullscreenChange]);

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

        {/* Закрыть карту — только на мобильном */}
        <div className="absolute top-3 right-3 z-10 flex items-center bg-white/95 backdrop-blur-sm rounded-xl shadow-md overflow-hidden border border-border/40">
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

        {/* Сама карта — balloon открывается нативно над маркером */}
        <YandexMap
          points={mapPoints}
          center={mapPoints.length === 0 ? KRASNODAR_CENTER : undefined}
          zoom={11}
          height="100%"
          className={fullscreen ? '!rounded-none' : ''}
          onPointClick={onPointClick}
          highlightedId={highlightedId}
          selectedId={mapSelected?.id ?? null}
          onBalloonClose={onDeselectPoint}
        />
      </div>
    </div>
  );
}
