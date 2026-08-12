import Icon from '@/components/ui/icon';

interface Props {
  url: string;
  index: number;
  multiple: boolean;
  isDragging: boolean;
  isOver: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onZoom: () => void;
  onRemove: () => void;
  onMakeMain?: () => void;
}

/** Строит URL превью (thumb) из CDN-ссылки на основное фото.
 * Работает ТОЛЬКО для папки photos/ — логотипы, водяные знаки не трогает. */
function toThumbUrl(src: string): string {
  if (!src || !src.includes('cdn.poehali.dev')) return src;
  if (!src.includes('/photos/')) return src;
  if (src.includes('_thumb.webp')) return src;
  return src.replace(/(_wm)?\.(webp|jpe?g|png)$/i, '_thumb.webp');
}

export default function ImageUploaderPhotoCard({
  url,
  index,
  multiple,
  isDragging,
  isOver,
  onPointerDown,
  onZoom,
  onRemove,
  onMakeMain,
}: Props) {
  const previewSrc = toThumbUrl(url);

  return (
    <div
      data-card-idx={index}
      data-url={url}
      onPointerDown={onPointerDown}
      className={`rounded-xl border-2 bg-white select-none transition-all duration-150 relative ${
        isDragging
          ? 'opacity-25 border-brand-blue border-dashed'
          : isOver
          ? 'border-brand-blue ring-2 ring-brand-blue/40 shadow-lg'
          : 'border-border hover:border-brand-blue/40'
      } ${multiple ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ overflow: isDragging ? 'visible' : 'hidden' }}
    >
      {/* Индикатор вставки */}
      {isOver && (
        <div className="absolute inset-0 z-20 rounded-[10px] bg-brand-blue/15 flex items-center justify-center pointer-events-none">
          <div className="bg-brand-blue text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
            <Icon name="ArrowLeftRight" size={13} /> Вставить сюда
          </div>
        </div>
      )}

      {/* Фото */}
      <div className="relative">
        <img
          src={previewSrc}
          alt=""
          draggable={false}
          loading="lazy"
          className="w-full h-40 object-cover pointer-events-none"
        />
        {/* Удалить фото */}
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="absolute top-2 left-2 w-7 h-7 rounded-lg bg-black/50 hover:bg-red-600 flex items-center justify-center text-white transition"
          title="Удалить фото"
        >
          <Icon name="Trash2" size={14} />
        </button>
        {/* Бейдж «Главная» */}
        {index === 0 && (
          <div className="absolute bottom-2 left-2 text-[10px] bg-brand-blue text-white px-2 py-0.5 rounded-full font-semibold shadow">
            Главная
          </div>
        )}
        {index > 0 && (
          <div className="absolute bottom-2 left-2 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded-full font-semibold">
            {index + 1}
          </div>
        )}
        {/* Кнопка лупы */}
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onZoom(); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 hover:bg-black/80 flex items-center justify-center text-white transition"
          title="Увеличить"
        >
          <Icon name="ZoomIn" size={14} />
        </button>
      </div>

      {/* Панель под фото */}
      {index > 0 && onMakeMain && (
        <div className="px-1.5 py-1.5 bg-muted/30 border-t border-border flex gap-1 flex-wrap">
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onMakeMain(); }}
            className="inline-flex items-center justify-center gap-0.5 text-[9px] font-semibold px-1.5 py-1 rounded-md bg-brand-blue/10 border border-brand-blue/30 text-brand-blue hover:bg-brand-blue/20 transition"
            title="Сделать главным фото"
          >
            <Icon name="Star" size={10} /> Главным
          </button>
        </div>
      )}
    </div>
  );
}