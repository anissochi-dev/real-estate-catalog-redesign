import Icon from '@/components/ui/icon';

type WmStatus = 'idle' | 'loading' | 'done' | 'error';

interface Props {
  url: string;
  index: number;
  multiple: boolean;
  allowDownload: boolean;
  wmStatus: WmStatus;
  isDragging: boolean;
  isOver: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onZoom: () => void;
  onDownload: () => void;
  onDownloadOriginal: () => void;
  onRemoveWatermark: () => void;
  onRemove: () => void;
}

export default function ImageUploaderPhotoCard({
  url,
  index,
  multiple,
  allowDownload,
  wmStatus,
  isDragging,
  isOver,
  onPointerDown,
  onZoom,
  onDownload,
  onDownloadOriginal,
  onRemoveWatermark,
  onRemove,
}: Props) {
  const hasOwnWm = /_wm\.(jpe?g|png|webp)$/i.test(url);

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
          src={url}
          alt=""
          draggable={false}
          className="w-full h-40 object-cover pointer-events-none"
        />
        {/* Иконка перетаскивания */}
        {multiple && (
          <div className="absolute top-2 left-2 w-6 h-6 rounded-md bg-black/40 flex items-center justify-center">
            <Icon name="GripVertical" size={13} className="text-white" />
          </div>
        )}
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

      {/* Панель под фото — все кнопки в одну строку */}
      <div className="px-1.5 py-1.5 bg-muted/30 border-t border-border flex gap-1 flex-wrap">

        {/* Скачать */}
        {allowDownload && (
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDownload(); }}
            className="inline-flex items-center justify-center gap-0.5 text-[9px] font-semibold px-1.5 py-1 rounded-md bg-white border border-border hover:bg-muted/60 transition"
            title="Скачать фото"
          >
            <Icon name="Download" size={10} /> Скачать
          </button>
        )}

        {/* Скачать без ВЗ */}
        {allowDownload && hasOwnWm && (
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDownloadOriginal(); }}
            className="inline-flex items-center justify-center gap-0.5 text-[9px] font-semibold px-1.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition"
            title="Скачать без нашего водяного знака"
          >
            <Icon name="DownloadCloud" size={10} /> Без ВЗ
          </button>
        )}

        {/* Удалить ВЗ */}
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); if (wmStatus === 'idle') onRemoveWatermark(); }}
          disabled={wmStatus === 'loading'}
          className={`inline-flex items-center justify-center gap-0.5 text-[9px] font-semibold px-1.5 py-1 rounded-md border transition ${
            wmStatus === 'loading' ? 'bg-amber-50 border-amber-200 text-amber-700 cursor-wait' :
            wmStatus === 'done'    ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
            wmStatus === 'error'   ? 'bg-red-50 border-red-200 text-red-500' :
            'bg-white border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          }`}
          title="Удалить чужой водяной знак (Яндекс Vision AI)"
        >
          <Icon
            name={
              wmStatus === 'loading' ? 'Loader2' :
              wmStatus === 'done'    ? 'CheckCircle2' :
              wmStatus === 'error'   ? 'AlertCircle' :
              'Eraser'
            }
            size={10}
            className={wmStatus === 'loading' ? 'animate-spin' : ''}
          />
          {wmStatus === 'loading' ? '…' :
           wmStatus === 'done'    ? 'Готово' :
           wmStatus === 'error'   ? 'Ошибка' :
           'Удалить ВЗ'}
        </button>

        {/* Удалить фото */}
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="inline-flex items-center justify-center gap-0.5 text-[9px] font-semibold px-1.5 py-1 rounded-md bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition"
          title="Удалить фото"
        >
          <Icon name="Trash2" size={10} /> Удалить
        </button>

      </div>
    </div>
  );
}