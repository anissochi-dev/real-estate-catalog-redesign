import { useEffect } from 'react';
import type { ListingDetail } from '@/lib/api';
import Icon from '@/components/ui/icon';

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

export default function PropertyMediaGallery({
  item, rawImgs, imgs, hasVideo, videoIndex, totalMedia,
  isVideoActive, mainImg, activeImg, setActiveImg,
  lightbox, setLightbox,
  isFav, inCompare, onToggleFavorite, onToggleCompare,
  dealLabel, typeLabel,
}: Props) {
  const imgCount = imgs.length;

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') setActiveImg(i => Math.min(i + 1, imgCount - 1));
      if (e.key === 'ArrowLeft') setActiveImg(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox, imgCount, setLightbox, setActiveImg]);

  return (
    <>
      {/* Лайтбокс */}
      {lightbox && mainImg && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={() => setLightbox(false)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(false)}>
            <Icon name="X" size={28} />
          </button>
          {imgs.length > 1 && (
            <>
              <button className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 rounded-full p-2"
                onClick={e => { e.stopPropagation(); setActiveImg(i => Math.max(i - 1, 0)); }}>
                <Icon name="ChevronLeft" size={24} />
              </button>
              <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 rounded-full p-2"
                onClick={e => { e.stopPropagation(); setActiveImg(i => Math.min(i + 1, imgs.length - 1)); }}>
                <Icon name="ChevronRight" size={24} />
              </button>
            </>
          )}
          <img src={mainImg} alt={item.title}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
          <div className="absolute bottom-4 text-white/50 text-sm">{activeImg + 1} / {imgs.length}</div>
        </div>
      )}

      {/* Медиа-галерея */}
      <div className="space-y-2">
        <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[16/10]">
          {isVideoActive ? (
            <VideoEmbed url={item.videoUrl!} />
          ) : mainImg !== null && mainImg !== undefined ? (
            <div className="cursor-zoom-in group w-full h-full" onClick={() => setLightbox(true)}>
              <img src={mainImg} alt={item.title} loading="eager" fetchPriority="high" decoding="sync" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
              <div className="absolute bottom-3 right-3 bg-black/50 text-white rounded-lg px-2 py-1 text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Icon name="ZoomIn" size={12} /> Увеличить
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon name="Image" size={48} className="text-muted-foreground" />
            </div>
          )}

          <div className="absolute top-3 left-3 flex gap-1.5 pointer-events-none">
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-brand-blue text-white">{dealLabel}</span>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-black/40 text-white backdrop-blur-sm">{typeLabel}</span>
            {item.isHot && <span className="text-xs font-semibold px-2 py-1 rounded-full btn-orange text-white">🔥 Горячее</span>}
            {item.isExclusive && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-500 text-white">Эксклюзив</span>}
          </div>

          <div className="absolute top-3 right-3 flex gap-2">
            <button onClick={e => { e.stopPropagation(); onToggleFavorite(item.id); }}
              className={`w-9 h-9 rounded-full flex items-center justify-center shadow ${isFav ? 'bg-red-500 text-white' : 'bg-white'}`}>
              <Icon name="Heart" size={16} />
            </button>
            <button onClick={e => { e.stopPropagation(); onToggleCompare(item.id); }}
              className={`w-9 h-9 rounded-full flex items-center justify-center shadow ${inCompare ? 'bg-brand-orange text-white' : 'bg-white'}`}>
              <Icon name="GitCompare" size={16} />
            </button>
          </div>

          {totalMedia > 1 && (
            <div className="absolute bottom-3 left-3 bg-black/50 text-white rounded-lg px-2 py-1 text-xs pointer-events-none">
              {activeImg + 1} / {totalMedia}
            </div>
          )}
        </div>

        {totalMedia > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setActiveImg(0)}
              className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${activeImg === 0 ? 'border-brand-blue' : 'border-transparent opacity-70 hover:opacity-100'}`}>
              <img src={rawImgs[0]} alt="" className="w-full h-full object-cover" />
            </button>
            {hasVideo && (
              <button onClick={() => setActiveImg(videoIndex)}
                className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all flex flex-col items-center justify-center bg-slate-900 gap-1 ${activeImg === videoIndex ? 'border-brand-blue' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                <Icon name="Play" size={20} className="text-white" />
                <span className="text-[9px] text-white/60">Видео</span>
              </button>
            )}
            {rawImgs.slice(1).map((u, i) => {
              const mediaIdx = i + 2;
              return (
                <button key={u + i} onClick={() => setActiveImg(mediaIdx)}
                  className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${mediaIdx === activeImg ? 'border-brand-blue' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                  <img src={u} alt="" className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}