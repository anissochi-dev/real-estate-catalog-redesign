import { useRef, useState } from 'react';
import Icon from '@/components/ui/icon';

interface Props {
  multiple: boolean;
  uploading: boolean;
  progress: { done: number; total: number };
  shouldCompress: boolean;
  hint?: string;
  onFiles: (files: FileList | File[]) => void;
}

export default function ImageUploaderDropZone({
  multiple,
  uploading,
  progress,
  shouldCompress,
  hint,
  onFiles,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer border-2 border-dashed rounded-xl py-4 px-6 text-center transition ${
        dragOver ? 'border-brand-blue bg-brand-blue/5' : 'border-border hover:border-brand-blue/50 bg-muted/30'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={e => e.target.files && onFiles(e.target.files)}
      />
      <Icon
        name={uploading ? 'Loader2' : 'Upload'}
        size={24}
        className={`mx-auto mb-1.5 text-brand-blue ${uploading ? 'animate-spin' : ''}`}
      />
      <div className="text-sm font-semibold">
        {uploading
          ? `Загрузка ${progress.done}/${progress.total}...`
          : multiple ? 'Перетащите фото сюда' : 'Перетащите изображение'}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {hint || 'или нажмите для выбора. JPG, PNG, WEBP — до 30 фото'}
      </div>
      {shouldCompress && (
        <div className="text-[10px] text-muted-foreground/80 mt-0.5 inline-flex items-center gap-1">
          <Icon name="Zap" size={10} />
          Авто-оптимизация: 1920px · WebP 90% (без потери качества)
        </div>
      )}
    </div>
  );
}