import type { ListingDetail } from '@/lib/api';
import Icon from '@/components/ui/icon';
import { VideoEmbed } from './VideoEmbed';

interface GalleryMainImageProps {
  item: ListingDetail;
  isVideoActive: boolean;
  mainImg: string | null;
  photoThumbs: string[];
  photoActiveIdx: number;
  showArrows: boolean;
  imgLoaded: boolean;
  fadeKey: number;
  isFav: boolean;
  inCompare: boolean;
  dealLabel: string;
  typeLabel: string;
  onImgLoad: () => void;
  onOpenLightbox: () => void;
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function GalleryMainImage({
  item, isVideoActive, mainImg, photoThumbs, photoActiveIdx,
  showArrows, imgLoaded, fadeKey,
  isFav, inCompare, dealLabel, typeLabel,
  onImgLoad, onOpenLightbox,
  onToggleFavorite, onToggleCompare,
  onMouseEnter, onMouseLeave,
  onTouchStart, onTouchMove, onTouchEnd,
  onPrev, onNext,
}: GalleryMainImageProps) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-muted"
      style={{ aspectRatio: '4/3' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {isVideoActive ? (
        <VideoEmbed url={item.videoUrl!} />
      ) : mainImg !== null && mainImg !== undefined ? (
        <div className="w-full h-full cursor-zoom-in" onClick={onOpenLightbox}>
          <img
            key={fadeKey}
            src={mainImg}
            alt={item.title}
            loading="lazy"
            onLoad={onImgLoad}
            className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          />
          {!imgLoaded && (
            <div className="absolute inset-0 bg-muted animate-pulse" />
          )}
          {/* Zoom hint — desktop only */}
          <div
            className="absolute bottom-3 right-3 bg-black/50 text-white rounded-lg px-2 py-1 text-xs hidden sm:flex items-center gap-1 pointer-events-none transition-opacity"
            style={{ opacity: showArrows ? 1 : 0, transition: 'opacity 0.2s' }}
          >
            <Icon name="ZoomIn" size={12} /> Увеличить
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Icon name="Image" size={48} className="text-muted-foreground" />
        </div>
      )}

      {/* Desktop arrows — appear on hover */}
      {!isVideoActive && photoThumbs.length > 1 && (
        <>
          <button
            aria-label="Предыдущее"
            onClick={e => { e.stopPropagation(); onPrev(); }}
            disabled={photoActiveIdx === 0}
            className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/75 text-white rounded-full p-2 min-h-[40px] min-w-[40px] items-center justify-center transition-all duration-200 disabled:opacity-20 hidden sm:flex ${showArrows ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}
          >
            <Icon name="ChevronLeft" size={22} />
          </button>
          <button
            aria-label="Следующее"
            onClick={e => { e.stopPropagation(); onNext(); }}
            disabled={photoActiveIdx === photoThumbs.length - 1}
            className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/75 text-white rounded-full p-2 min-h-[40px] min-w-[40px] items-center justify-center transition-all duration-200 disabled:opacity-20 hidden sm:flex ${showArrows ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'}`}
          >
            <Icon name="ChevronRight" size={22} />
          </button>
        </>
      )}

      {/* Badges */}
      <div className="absolute top-3 left-3 flex gap-1.5 pointer-events-none flex-wrap">
        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-brand-blue text-white">{dealLabel}</span>
        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-black/40 text-white backdrop-blur-sm">{typeLabel}</span>
        {item.isHot && <span className="text-xs font-semibold px-2 py-1 rounded-full btn-orange text-white">🔥 Горячее</span>}
        {item.isExclusive && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-500 text-white">Эксклюзив</span>}
      </div>

      {/* Fav / Compare */}
      <div className="absolute top-3 right-3 flex gap-2">
        <button onClick={e => { e.stopPropagation(); onToggleFavorite(item.id); }}
          className={`w-9 h-9 rounded-full flex items-center justify-center shadow transition-colors ${isFav ? 'bg-red-500 text-white' : 'bg-white text-foreground'}`}>
          <Icon name="Heart" size={16} />
        </button>
        <button onClick={e => { e.stopPropagation(); onToggleCompare(item.id); }}
          className={`w-9 h-9 rounded-full flex items-center justify-center shadow transition-colors ${inCompare ? 'bg-brand-orange text-white' : 'bg-white text-foreground'}`}>
          <Icon name="GitCompare" size={16} />
        </button>
      </div>

      {/* Counter */}
      {!isVideoActive && photoThumbs.length > 1 && (
        <div className="absolute bottom-3 left-3 bg-black/50 text-white rounded-lg px-2 py-1 text-xs pointer-events-none">
          {photoActiveIdx + 1} / {photoThumbs.length}
        </div>
      )}

      {/* Mobile dot indicators */}
      {!isVideoActive && photoThumbs.length > 1 && photoThumbs.length <= 15 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 sm:hidden pointer-events-none">
          {photoThumbs.map((_, i) => (
            <span key={i}
              className={`rounded-full transition-all duration-200 ${i === photoActiveIdx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
