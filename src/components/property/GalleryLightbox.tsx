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
