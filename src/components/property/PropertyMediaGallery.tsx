import { useEffect, useRef, useState, useCallback } from 'react';
import type { ListingDetail } from '@/lib/api';
import Icon from '@/components/ui/icon';

type MediaTab = 'photos' | 'video';

interface Props {
  item: ListingDetail;
  rawImgs: string[];
  imgs: string[];
  hasVideo: boolean;
  videoIndex: number;
  totalMedia: number;
  isVideoActive: boolean;
  mainImg: string | null;
  activeImg: number;
  setActiveImg: (i: number | ((prev: number) => number)) => void;
  lightbox: boolean;
  setLightbox: (v: boolean) => void;
  isFav: boolean;
  inCompare: boolean;
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  dealLabel: string;
  typeLabel: string;
  onImageChange?: (index: number) => void;
}

export function VideoEmbed({ url }: { url: string }) {
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    return (
      <iframe className="w-full h-full"
        src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen title="Видео" />
    );
  }
  const rtMatch = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rtMatch) {
    return (
      <iframe className="w-full h-full"
        src={`https://rutube.ru/play/embed/${rtMatch[1]}`}
        allow="clipboard-write; autoplay"
        allowFullScreen title="Видео" />
    );
  }
  const vkMatch = url.match(/vk\.com\/video(-?\d+_\d+)/);
  if (vkMatch) {
    return (
      <iframe className="w-full h-full"
        src={`https://vk.com/video_ext.php?oid=${vkMatch[1].split('_')[0]}&id=${vkMatch[1].split('_')[1]}`}
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen title="Видео" />
    );
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-900">
      <Icon name="Play" size={40} className="text-white/60" />
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="text-white/80 text-sm hover:text-white underline flex items-center gap-1">
        Открыть видео <Icon name="ExternalLink" size={14} />
      </a>
    </div>
  );
}

// Lightbox с зумом
function Lightbox({ imgs, activeImg, setActiveImg, onClose, title }: {
  imgs: string[];
  activeImg: number;
  setActiveImg: (i: number | ((p: number) => number)) => void;
  onClose: () => void;
  title: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [animDir, setAnimDir] = useState<'left' | 'right' | null>(null);
  const [prevIdx, setPrevIdx] = useState(activeImg);

  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const go = useCallback((dir: 1 | -1) => {
    const next = activeImg + dir;
    if (next < 0 || next >= imgs.length) return;
    setAnimDir(dir === 1 ? 'left' : 'right');
    setPrevIdx(activeImg);
    setTimeout(() => { setAnimDir(null); setPrevIdx(next); }, 220);
    setActiveImg(next);
    resetZoom();
  }, [activeImg, imgs.length, setActiveImg]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [go, onClose]);

  // Touch swipe in lightbox
  const lbTouch = useRef<{ x: number; y: number } | null>(null);
  const onLbTouchStart = (e: React.TouchEvent) => {
    if (zoom > 1) return;
    lbTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onLbTouchEnd = (e: React.TouchEvent) => {
    if (!lbTouch.current || zoom > 1) return;
    const dx = e.changedTouches[0].clientX - lbTouch.current.x;
    const dy = e.changedTouches[0].clientY - lbTouch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      go(dx < 0 ? 1 : -1);
    } else if (dy > 80) {
      onClose();
    }
    lbTouch.current = null;
  };

  // Mouse drag for panning when zoomed
  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setDragging(true);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragStart.current || !dragging) return;
    setPan({ x: dragStart.current.px + e.clientX - dragStart.current.x, y: dragStart.current.py + e.clientY - dragStart.current.y });
  };
  const onMouseUp = () => { setDragging(false); dragStart.current = null; };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.003)));
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  };

  const slideClass = animDir === 'left'
    ? 'animate-slide-out-left'
    : animDir === 'right'
    ? 'animate-slide-out-right'
    : 'animate-slide-in';

  void prevIdx;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/97 flex items-center justify-center select-none"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onTouchStart={onLbTouchStart}
      onTouchEnd={onLbTouchEnd}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
        <span className="text-white/60 text-sm">{activeImg + 1} / {imgs.length}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => zoom > 1 ? resetZoom() : setZoom(2.5)}
            className="text-white/70 hover:text-white bg-white/10 rounded-full p-2 min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label={zoom > 1 ? 'Уменьшить' : 'Увеличить'}
          >
            <Icon name={zoom > 1 ? 'ZoomOut' : 'ZoomIn'} size={18} />
          </button>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white bg-white/10 rounded-full p-2 min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label="Закрыть"
          >
            <Icon name="X" size={20} />
          </button>
        </div>
      </div>

      {/* Backdrop click to close (only when not zoomed) */}
      {zoom <= 1 && (
        <div className="absolute inset-0" onClick={onClose} />
      )}

      {/* Image */}
      <div
        className={`relative z-10 flex items-center justify-center w-full h-full ${slideClass}`}
        style={{ cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={handleWheel}
        onClick={e => { if (zoom <= 1) { e.stopPropagation(); setZoom(2.5); } }}
      >
        <img
          src={imgs[activeImg]}
          alt={title}
          loading="lazy"
          draggable={false}
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: dragging ? 'none' : 'transform 0.2s ease',
            maxHeight: '90vh',
            maxWidth: '92vw',
            objectFit: 'contain',
            borderRadius: zoom > 1 ? 0 : 12,
            userSelect: 'none',
          }}
        />
      </div>

      {/* Arrows */}
      {imgs.length > 1 && (
        <>
          <button
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 text-white bg-white/10 hover:bg-white/25 rounded-full p-3 min-h-[48px] min-w-[48px] flex items-center justify-center transition-colors disabled:opacity-20"
            onClick={e => { e.stopPropagation(); go(-1); }}
            disabled={activeImg === 0}
            aria-label="Предыдущее"
          >
            <Icon name="ChevronLeft" size={24} />
          </button>
          <button
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 text-white bg-white/10 hover:bg-white/25 rounded-full p-3 min-h-[48px] min-w-[48px] flex items-center justify-center transition-colors disabled:opacity-20"
            onClick={e => { e.stopPropagation(); go(1); }}
            disabled={activeImg === imgs.length - 1}
            aria-label="Следующее"
          >
            <Icon name="ChevronRight" size={24} />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {imgs.length > 1 && imgs.length <= 20 && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5 z-10">
          {imgs.map((_, i) => (
            <button key={i} onClick={e => { e.stopPropagation(); setActiveImg(i); resetZoom(); }}
              className={`rounded-full transition-all ${i === activeImg ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/40 hover:bg-white/70'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PropertyMediaGallery({
  item, rawImgs, imgs, hasVideo, videoIndex, totalMedia,
  isVideoActive, mainImg, activeImg, setActiveImg,
  lightbox, setLightbox,
  isFav, inCompare, onToggleFavorite, onToggleCompare,
  dealLabel, typeLabel, onImageChange,
}: Props) {
  const [mediaTab, setMediaTab] = useState<MediaTab>(isVideoActive ? 'video' : 'photos');
  const [showArrows, setShowArrows] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);
  const thumbsRef = useRef<HTMLDivElement>(null);

  void totalMedia;

  // Swipe state
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isSwiping = useRef(false);

  useEffect(() => {
    if (isVideoActive && mediaTab !== 'video') setMediaTab('video');
    if (!isVideoActive && mediaTab === 'video' && activeImg !== videoIndex) setMediaTab('photos');
  }, [isVideoActive, activeImg, videoIndex, mediaTab]);

  const photoThumbs = rawImgs;
  const photoActiveIdx = hasVideo && activeImg > videoIndex
    ? activeImg - 1
    : (hasVideo && activeImg === videoIndex ? 0 : activeImg);

  const switchTab = (t: MediaTab) => {
    setMediaTab(t);
    if (t === 'video' && hasVideo) setActiveImg(videoIndex);
    else setActiveImg(0);
  };

  const goPhoto = useCallback((dir: 1 | -1) => {
    setActiveImg(prev => {
      const next = prev + dir;
      const clamped = Math.max(0, Math.min(next, photoThumbs.length - 1));
      onImageChange?.(clamped);
      return clamped;
    });
    setFadeKey(k => k + 1);
    setImgLoaded(false);
  }, [photoThumbs.length, onImageChange, setActiveImg]);

  // Scroll active thumb into view
  useEffect(() => {
    if (!thumbsRef.current) return;
    const active = thumbsRef.current.querySelector('[data-active="true"]') as HTMLElement | null;
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [photoActiveIdx]);

  // Touch handlers for main image
  const onTouchStart = (e: React.TouchEvent) => {
    if (isVideoActive) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    isSwiping.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = Math.abs(e.touches[0].clientX - touchStart.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStart.current.y);
    if (dx > dy && dx > 8) { isSwiping.current = true; e.preventDefault(); }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current || isVideoActive) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y);
    if (isSwiping.current && Math.abs(dx) > 45 && dy < 80) {
      goPhoto(dx < 0 ? 1 : -1);
    }
    touchStart.current = null;
    isSwiping.current = false;
  };

  return (
    <>
      {lightbox && mainImg && (
        <Lightbox
          imgs={imgs}
          activeImg={activeImg}
          setActiveImg={setActiveImg}
          onClose={() => setLightbox(false)}
          title={item.title}
        />
      )}

      <div className="space-y-2">
        {/* Tabs Фото / Видео */}
        {hasVideo && (
          <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
            {(['photos', 'video'] as const).map(t => (
              <button key={t} type="button" onClick={() => switchTab(t)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  mediaTab === t ? 'bg-white shadow text-brand-blue' : 'text-muted-foreground hover:text-foreground'
                }`}>
                <Icon name={t === 'photos' ? 'Image' : 'Play'} size={13} />
                {t === 'photos' ? 'Фото' : 'Видео'}
                {t === 'photos' && rawImgs.length > 0 && <span className="opacity-60">({rawImgs.length})</span>}
              </button>
            ))}
          </div>
        )}

        {/* Main media block */}
        <div
          className="relative rounded-2xl overflow-hidden bg-muted"
          style={{ aspectRatio: '4/3' }}
          onMouseEnter={() => setShowArrows(true)}
          onMouseLeave={() => setShowArrows(false)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {isVideoActive ? (
            <VideoEmbed url={item.videoUrl!} />
          ) : mainImg !== null && mainImg !== undefined ? (
            <div className="w-full h-full cursor-zoom-in" onClick={() => setLightbox(true)}>
              <img
                key={fadeKey}
                src={mainImg}
                alt={item.title}
                loading="lazy"
                onLoad={() => setImgLoaded(true)}
                className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              />
              {!imgLoaded && (
                <div className="absolute inset-0 bg-muted animate-pulse" />
              )}
              {/* Zoom hint — desktop only */}
              <div className="absolute bottom-3 right-3 bg-black/50 text-white rounded-lg px-2 py-1 text-xs hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
                style={{ opacity: showArrows ? 1 : 0, transition: 'opacity 0.2s' }}>
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
                onClick={e => { e.stopPropagation(); goPhoto(-1); }}
                disabled={photoActiveIdx === 0}
                className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/75 text-white rounded-full p-2 min-h-[40px] min-w-[40px] items-center justify-center transition-all duration-200 disabled:opacity-20 hidden sm:flex ${showArrows ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}
              >
                <Icon name="ChevronLeft" size={22} />
              </button>
              <button
                aria-label="Следующее"
                onClick={e => { e.stopPropagation(); goPhoto(1); }}
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

        {/* Thumbnails strip — hidden on mobile, visible on sm+ */}
        {mediaTab === 'photos' && photoThumbs.length > 1 && (
          <div
            ref={thumbsRef}
            className="hidden sm:flex gap-2 overflow-x-auto pb-1 scrollbar-thin"
            style={{ scrollbarWidth: 'thin' }}
          >
            {photoThumbs.map((u, i) => {
              const mediaIdx = hasVideo && i >= videoIndex ? i + 1 : i;
              const isActive = mediaIdx === activeImg;
              return (
                <button
                  key={u + i}
                  data-active={isActive}
                  onClick={() => { setActiveImg(mediaIdx); setFadeKey(k => k + 1); setImgLoaded(false); onImageChange?.(i); }}
                  className={`flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                    isActive ? 'border-brand-blue shadow-md scale-[1.03]' : 'border-transparent opacity-60 hover:opacity-90 hover:border-border'
                  }`}
                  style={{ width: 80, height: 60 }}
                >
                  <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
        )}

        {/* Mobile: scrollable thumbs strip (alternative to dots for many photos) */}
        {mediaTab === 'photos' && photoThumbs.length > 15 && (
          <div
            ref={thumbsRef}
            className="flex sm:hidden gap-2 overflow-x-auto pb-1"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {photoThumbs.map((u, i) => {
              const mediaIdx = hasVideo && i >= videoIndex ? i + 1 : i;
              const isActive = mediaIdx === activeImg;
              return (
                <button
                  key={u + i}
                  data-active={isActive}
                  onClick={() => { setActiveImg(mediaIdx); setFadeKey(k => k + 1); setImgLoaded(false); onImageChange?.(i); }}
                  className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                    isActive ? 'border-brand-blue' : 'border-transparent opacity-60'
                  }`}
                  style={{ width: 60, height: 45 }}
                >
                  <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
