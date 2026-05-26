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
  const [animDir, setAnimDir] = useState<'left' | 'right' | null>(null);
  const [prevIdx, setPrevIdx] = useState(activeImg);

  const go = useCallback((dir: 1 | -1) => {
    const next = activeImg + dir;
    if (next < 0 || next >= imgs.length) return;
    setAnimDir(dir === 1 ? 'left' : 'right');
    setPrevIdx(activeImg);
    setTimeout(() => { setAnimDir(null); setPrevIdx(next); }, 220);
    setActiveImg(next);
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
    lbTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onLbTouchEnd = (e: React.TouchEvent) => {
    if (!lbTouch.current) return;
    const dx = e.changedTouches[0].clientX - lbTouch.current.x;
    const dy = e.changedTouches[0].clientY - lbTouch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      go(dx < 0 ? 1 : -1);
    } else if (dy > 80) {
      onClose();
    }
    lbTouch.current = null;
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
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white bg-white/10 rounded-full p-2 min-h-[40px] min-w-[40px] flex items-center justify-center"
          aria-label="Закрыть"
        >
          <Icon name="X" size={20} />
        </button>
      </div>

      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Image */}
      <div className={`relative z-10 flex items-center justify-center w-full h-full ${slideClass}`}>
        <img
          src={imgs[activeImg]}
          alt={title}
          loading="lazy"
          draggable={false}
          onClick={e => e.stopPropagation()}
          style={{
            maxHeight: '90vh',
            maxWidth: '92vw',
            objectFit: 'contain',
            borderRadius: 12,
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
            <button key={i} onClick={e => { e.stopPropagation(); setActiveImg(i); }}
              className={`rounded-full transition-all ${i === activeImg ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/40 hover:bg-white/70'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
