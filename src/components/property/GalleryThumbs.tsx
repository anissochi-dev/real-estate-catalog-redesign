import { useRef, useEffect } from 'react';

interface GalleryThumbsProps {
  photoThumbs: string[];
  activeImg: number;
  hasVideo: boolean;
  videoIndex: number;
  mediaTab: 'photos' | 'video';
  onSelect: (mediaIdx: number, thumbIdx: number) => void;
}

export function GalleryThumbs({
  photoThumbs, activeImg, hasVideo, videoIndex, mediaTab, onSelect,
}: GalleryThumbsProps) {
  const thumbsRef = useRef<HTMLDivElement>(null);

  const photoActiveIdx = hasVideo && activeImg > videoIndex
    ? activeImg - 1
    : (hasVideo && activeImg === videoIndex ? 0 : activeImg);

  // Scroll active thumb into view
  useEffect(() => {
    if (!thumbsRef.current) return;
    const active = thumbsRef.current.querySelector('[data-active="true"]') as HTMLElement | null;
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [photoActiveIdx]);

  if (mediaTab !== 'photos' || photoThumbs.length <= 1) return null;

  return (
    <>
      {/* Desktop thumbnails strip */}
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
              onClick={() => onSelect(mediaIdx, i)}
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

      {/* Mobile: scrollable thumbs strip (for many photos) */}
      {photoThumbs.length > 15 && (
        <div
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
                onClick={() => onSelect(mediaIdx, i)}
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
    </>
  );
}
