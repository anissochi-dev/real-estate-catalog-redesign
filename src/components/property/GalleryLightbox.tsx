import { useEffect, useRef, useState, useCallback } from 'react';
import Icon from '@/components/ui/icon';

interface LightboxProps {
  imgs: string[];
  activeImg: number;
  setActiveImg: (i: number | ((p: number) => number)) => void;
  onClose: () => void;
  title: string;
}

export function GalleryLightbox({ imgs, activeImg, setActiveImg, onClose, title }: LightboxProps) {
  // Pinch-zoom state (mobile)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const go = useCallback((dir: 1 | -1) => {
    const next = activeImg + dir;
    if (next < 0 || next >= imgs.length) return;
    setActiveImg(next);
    resetView();
  }, [activeImg, imgs.length, setActiveImg]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [go, onClose]);

  // Touch: swipe + pinch-zoom
  const touch = useRef<{
    x: number; y: number;
    pinchDist: number | null;
    pinchZoom: number;
    pinchPan: { x: number; y: number };
    isDragging: boolean;
    panStart: { x: number; y: number; px: number; py: number } | null;
  }>({ x: 0, y: 0, pinchDist: null, pinchZoom: 1, pinchPan: { x: 0, y: 0 }, isDragging: false, panStart: null });

  const dist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touch.current.pinchDist = dist(e.touches);
      touch.current.pinchZoom = zoom;
      touch.current.pinchPan = { ...pan };
      touch.current.isDragging = false;
    } else if (e.touches.length === 1) {
      touch.current.x = e.touches[0].clientX;
      touch.current.y = e.touches[0].clientY;
      touch.current.isDragging = zoom > 1;
      touch.current.panStart = zoom > 1
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY, px: pan.x, py: pan.y }
        : null;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touch.current.pinchDist !== null) {
      e.preventDefault();
      const newDist = dist(e.touches);
      const scale = newDist / touch.current.pinchDist;
      const newZoom = Math.min(4, Math.max(1, touch.current.pinchZoom * scale));
      setZoom(newZoom);
      if (newZoom <= 1) setPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && zoom > 1 && touch.current.panStart) {
      e.preventDefault();
      const dx = e.touches[0].clientX - touch.current.panStart.x;
      const dy = e.touches[0].clientY - touch.current.panStart.y;
      setPan({ x: touch.current.panStart.px + dx, y: touch.current.panStart.py + dy });
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touch.current.pinchDist !== null && e.touches.length < 2) {
      touch.current.pinchDist = null;
      return;
    }
    if (zoom > 1 || touch.current.isDragging) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      go(dx < 0 ? 1 : -1);
    } else if (dy > 80) {
      onClose();
    }
    touch.current.panStart = null;
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center select-none"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onClick={onClose}
    >
      {/* Centred image container — все UI-элементы внутри него */}
      <div
        className="relative flex items-center justify-center"
        style={{ maxWidth: '92vw', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={imgs[activeImg]}
          alt={title}
          draggable={false}
          loading="eager"
          fetchpriority="high"
          decoding="async"
          style={{
            maxHeight: '90vh',
            maxWidth: '92vw',
            objectFit: 'contain',
            borderRadius: 12,
            userSelect: 'none',
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: 'transform 0.1s ease',
            display: 'block',
          }}
        />

        {/* Close button — top-right corner of image */}
        <button
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="absolute top-2 right-2 z-30 bg-black/60 hover:bg-black/85 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors"
          aria-label="Закрыть"
        >
          <Icon name="X" size={18} />
        </button>

        {/* Counter — top-left */}
        <div className="absolute top-2 left-2 z-30 bg-black/60 text-white text-xs rounded-full px-2.5 py-1 pointer-events-none">
          {activeImg + 1} / {imgs.length}
        </div>

        {/* Prev arrow — left edge of image */}
        {imgs.length > 1 && activeImg > 0 && (
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 bg-black/60 hover:bg-black/85 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors"
            onClick={e => { e.stopPropagation(); go(-1); }}
            aria-label="Предыдущее"
          >
            <Icon name="ChevronLeft" size={20} />
          </button>
        )}

        {/* Next arrow — right edge of image */}
        {imgs.length > 1 && activeImg < imgs.length - 1 && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 z-30 bg-black/60 hover:bg-black/85 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors"
            onClick={e => { e.stopPropagation(); go(1); }}
            aria-label="Следующее"
          >
            <Icon name="ChevronRight" size={20} />
          </button>
        )}

        {/* Dot indicators — bottom of image */}
        {imgs.length > 1 && imgs.length <= 20 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex gap-1.5">
            {imgs.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setActiveImg(i); resetView(); }}
                className={`rounded-full transition-all ${i === activeImg ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}