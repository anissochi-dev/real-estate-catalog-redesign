import { useRef, useState } from 'react';
import Icon from '@/components/ui/icon';

const MAX_FILES = 30;

interface Props {
  multiple: boolean;
  uploading: boolean;
  progress: { done: number; total: number };
  shouldCompress: boolean;
  hint?: string;
  canAdd?: number;
  onFiles: (files: FileList | File[]) => void;
}

export default function ImageUploaderDropZone({
  multiple,
  uploading,
  progress,
  shouldCompress,
  hint,
  canAdd,
  onFiles,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const isFull = multiple && canAdd !== undefined && canAdd <= 0;
  const added = canAdd !== undefined ? MAX_FILES - canAdd : 0;
  const pct = multiple && canAdd !== undefined ? Math.round((added / MAX_FILES) * 100) : 0;

  const openPicker = () => { if (!isFull && !uploading) inputRef.current?.click(); };

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!isFull && !uploading) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        if (!isFull && !uploading && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className="space-y-2"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={e => {
          const files = e.target.files;
          if (!files || files.length === 0) return;
          const fileArr = Array.from(files);
          e.target.value = '';
          onFiles(fileArr);
        }}
      />

      {/* Кнопка выбора */}
      <button
        type="button"
        onClick={openPicker}
        disabled={isFull || uploading}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed transition ${
          dragOver
            ? 'border-brand-blue bg-brand-blue/5'
            : isFull
              ? 'border-emerald-300 bg-emerald-50 cursor-not-allowed'
              : uploading
                ? 'border-border bg-muted/30 cursor-wait'
                : 'border-border hover:border-brand-blue/60 hover:bg-brand-blue/5 bg-muted/30 cursor-pointer'
        }`}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          isFull ? 'bg-emerald-100' : 'bg-brand-blue/10'
        }`}>
          <Icon
            name={uploading ? 'Loader2' : isFull ? 'CheckCircle2' : 'ImagePlus'}
            size={18}
            className={`${isFull ? 'text-emerald-600' : 'text-brand-blue'} ${uploading ? 'animate-spin' : ''}`}
          />
        </div>

        <div className="flex-1 text-left min-w-0">
          {uploading ? (
            <>
              <div className="text-sm font-semibold">Загрузка {progress.done} из {progress.total}...</div>
              <div className="text-xs text-muted-foreground mt-0.5">Пожалуйста, подождите</div>
            </>
          ) : isFull ? (
            <>
              <div className="text-sm font-semibold text-emerald-700">Лимит достигнут</div>
              <div className="text-xs text-emerald-600/80">{MAX_FILES} из {MAX_FILES} фото добавлено</div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold">
                {hint || (multiple ? 'Добавить фотографии' : 'Выбрать изображение')}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {multiple && canAdd !== undefined
                  ? `Осталось мест: ${canAdd} из ${MAX_FILES} · JPG, PNG, WEBP`
                  : 'JPG, PNG, WEBP'}
                {shouldCompress && ' · авто-оптимизация'}
              </div>
            </>
          )}
        </div>

        {/* Счётчик и прогресс-кольцо */}
        {multiple && canAdd !== undefined && !uploading && (
          <div className="shrink-0 flex flex-col items-center gap-0.5">
            <div className="relative w-10 h-10">
              <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor"
                  className="text-border" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3"
                  stroke={isFull ? '#10b981' : '#2563eb'}
                  strokeDasharray={`${pct * 0.942} 94.2`}
                  strokeLinecap="round" />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${
                isFull ? 'text-emerald-600' : 'text-brand-blue'
              }`}>
                {added}/{MAX_FILES}
              </span>
            </div>
          </div>
        )}
      </button>

      {/* Прогресс-бар при загрузке */}
      {uploading && progress.total > 0 && (
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-brand-blue rounded-full transition-all duration-300"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}