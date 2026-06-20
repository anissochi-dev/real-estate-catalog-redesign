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
          const files = e.target.files;
          if (!files || files.length === 0) return;
          // Копируем файлы в массив до сброса input
          const fileArr = Array.from(files);
          // Сбрасываем input (чтобы можно было выбрать те же файлы повторно) после копирования
          e.target.value = '';
          onFiles(fileArr);
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
            ? 'Достигнут лимит 30 фото'
            : multiple
              ? 'Нажмите или перетащите фото'
              : 'Нажмите или перетащите изображение'}
      </div>
      {!isFull && (
        <div className="text-xs text-muted-foreground mt-0.5">
          {hint || (multiple && canAdd !== undefined
            ? `JPG, PNG, WEBP · можно добавить ещё ${canAdd} из 30`
            : 'JPG, PNG, WEBP — до 30 фото')}
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