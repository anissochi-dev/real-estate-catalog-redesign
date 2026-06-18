import { useState, useEffect } from 'react';
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
  className?: string;
  height?: number | string;
}

const KRASNODAR_CENTER: [number, number] = [45.0355, 38.9753];

export default function CatalogMap({
  mapPoints, mapSelected, city, onClose, onPointClick, onDeselectPoint,
  className, height = 420,
}: CatalogMapProps) {
  const navigate = useNavigate();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen]);

  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 bg-white'
    : (className ?? 'border-b border-border bg-white');

  const containerStyle = fullscreen ? undefined : { height };

  return (
    <div className={containerClass} style={containerStyle}>
      <div className="relative h-full">

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
          {/* Полный экран */}
          <button
            onClick={() => setFullscreen(v => !v)}
            title={fullscreen ? 'Свернуть' : 'На весь экран'}
            className="flex items-center gap-1.5 px-2.5 h-8 text-xs font-semibold text-muted-foreground hover:text-brand-blue hover:bg-brand-blue/5 transition-all border-r border-border/40"
          >
            <Icon name={fullscreen ? 'Minimize2' : 'Maximize2'} size={13} />
            <span className="hidden sm:inline">{fullscreen ? 'Свернуть' : 'На весь экран'}</span>
          </button>
          {/* Закрыть карту */}
          <button
            onClick={() => { setFullscreen(false); onClose(); }}
            className="flex items-center gap-1.5 px-2.5 h-8 text-xs font-semibold text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <Icon name="X" size={13} />
            <span className="hidden sm:inline">Скрыть</span>
          </button>
        </div>

        {/* Сама карта */}
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

        {/* Подсказка ESC в полноэкранном режиме */}
        {fullscreen && (
          <div className="absolute bottom-3 right-3 z-10 bg-black/40 text-white text-[10px] px-2 py-1 rounded-lg backdrop-blur-sm">
            ESC — свернуть
          </div>
        )}
      </div>
    </div>
  );
}