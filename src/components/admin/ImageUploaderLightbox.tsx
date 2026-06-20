import { useState, useCallback } from 'react';
import Icon from '@/components/ui/icon';

interface Props {
  urls: string[];
  startIdx: number;
  onClose: () => void;
}

export default function ImageUploaderLightbox({ urls, startIdx, onClose }: Props) {
  const [idx, setIdx] = useState(startIdx);
  const prev = () => setIdx(i => (i - 1 + urls.length) % urls.length);
  const next = () => setIdx(i => (i + 1) % urls.length);

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'Escape') onClose();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={onKey}
      tabIndex={0}
      autoFocus
    >
      {/* Закрыть */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
      >
        <Icon name="X" size={20} />
      </button>

      {/* Счётчик */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-semibold">
        {idx + 1} / {urls.length}
      </div>

      {/* Стрелки */}
      {urls.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); prev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition"
          >
            <Icon name="ChevronLeft" size={24} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); next(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition"
          >
            <Icon name="ChevronRight" size={24} />
          </button>
        </>
      )}

      {/* Фото */}
      <img
        src={urls[idx]}
        alt=""
        onClick={e => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl select-none"
      />

      {/* Точки */}
      {urls.length > 1 && urls.length <= 20 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {urls.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setIdx(i); }}
              className={`w-2 h-2 rounded-full transition ${i === idx ? 'bg-white' : 'bg-white/30 hover:bg-white/60'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
