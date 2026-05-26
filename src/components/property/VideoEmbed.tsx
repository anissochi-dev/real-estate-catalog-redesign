import Icon from '@/components/ui/icon';

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
