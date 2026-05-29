import { useEffect, useRef, useState, useCallback } from 'react';
import type { ListingDetail } from '@/lib/api';
import Icon from '@/components/ui/icon';
import { VideoEmbed } from './VideoEmbed';
import { GalleryLightbox } from './GalleryLightbox';
import { GalleryMainImage } from './GalleryMainImage';
import { GalleryThumbs } from './GalleryThumbs';

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

export { VideoEmbed };

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

  void totalMedia;

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

  const handleThumbSelect = (mediaIdx: number, thumbIdx: number) => {
    setActiveImg(mediaIdx);
    setFadeKey(k => k + 1);
    setImgLoaded(false);
    onImageChange?.(thumbIdx);
  };

  return (
    <>
      {lightbox && mainImg && (
        <GalleryLightbox
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

        <GalleryMainImage
          item={item}
          isVideoActive={isVideoActive}
          mainImg={mainImg}
          photoThumbs={photoThumbs}
          photoActiveIdx={photoActiveIdx}
          showArrows={showArrows}
          imgLoaded={imgLoaded}
          fadeKey={fadeKey}
          isFav={isFav}
          inCompare={inCompare}
          dealLabel={dealLabel}
          typeLabel={typeLabel}
          onImgLoad={() => setImgLoaded(true)}
          onOpenLightbox={() => setLightbox(true)}
          onToggleFavorite={onToggleFavorite}
          onToggleCompare={onToggleCompare}
          onMouseEnter={() => setShowArrows(true)}
          onMouseLeave={() => setShowArrows(false)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onPrev={() => goPhoto(-1)}
          onNext={() => goPhoto(1)}
        />

        <GalleryThumbs
          photoThumbs={photoThumbs}
          activeImg={activeImg}
          hasVideo={hasVideo}
          videoIndex={videoIndex}
          mediaTab={mediaTab}
          onSelect={handleThumbSelect}
          title={item.title}
        />
      </div>
    </>
  );
}