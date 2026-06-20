import { useRef, useState } from 'react';
import Icon from '@/components/ui/icon';

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

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!isFull) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        if (!isFull && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      onClick={() => { if (!isFull) inputRef.current?.click(); }}
      className={`border-2 border-dashed rounded-xl py-4 px-6 text-center transition ${
        isFull
          ? 'border-border bg-muted/20 opacity-50 cursor-not-allowed'
          : dragOver
            ? 'cursor-pointer border-brand-blue bg-brand-blue/5'
            : 'cursor-pointer border-border hover:border-brand-blue/50 bg-muted/30'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={e => {
          if (!e.target.files) return;
          onFiles(e.target.files);
          // Сбрасываем input чтобы можно было выбрать те же файлы повторно
          e.target.value = '';
        }}
      />
      <Icon
        name={uploading ? 'Loader2' : isFull ? 'CheckCircle2' : 'Upload'}
        size={24}
        className={`mx-auto mb-1.5 ${isFull ? 'text-emerald-500' : 'text-brand-blue'} ${uploading ? 'animate-spin' : ''}`}
      />
      <div className="text-sm font-semibold">
        {uploading
          ? `Загрузка ${progress.done}/${progress.total}...`
          : isFull
            ? 'Достигнут лимит (30 фото)'
            : multiple
              ? `Перетащите фото сюда${canAdd !== undefined ? ` (ещё ${canAdd})` : ''}`
              : 'Перетащите изображение'}
      </div>
      {!isFull && (
        <div className="text-xs text-muted-foreground mt-0.5">
          {hint || `или нажмите для выбора. JPG, PNG, WEBP${multiple && canAdd !== undefined ? ` — можно добавить ещё ${canAdd}` : ' — до 30 фото'}`}
        </div>
      )}
      {shouldCompress && !isFull && (
        <div className="text-[10px] text-muted-foreground/80 mt-0.5 inline-flex items-center gap-1">
          <Icon name="Zap" size={10} />
          Авто-оптимизация: 1920px · WebP 90% (без потери качества)
        </div>
      )}
    </div>
  );
}