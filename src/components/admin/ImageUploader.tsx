import { useRef, useState } from 'react';
import { uploadFile } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  folder?: 'photos' | 'logo' | 'watermark';
  multiple?: boolean;
  className?: string;
  hint?: string;
}

export default function ImageUploader({
  value,
  onChange,
  folder = 'photos',
  multiple = true,
  className = '',
  hint,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!arr.length) return;
    setUploading(true);
    setProgress({ done: 0, total: arr.length });
    const uploaded: string[] = [];
    for (const f of arr) {
      try {
        const url = await uploadFile(f, folder);
        uploaded.push(url);
        setProgress(p => ({ ...p, done: p.done + 1 }));
      } catch (e: unknown) {
        alert('Ошибка загрузки: ' + (e instanceof Error ? e.message : ''));
      }
    }
    setUploading(false);
    onChange(multiple ? [...value, ...uploaded] : uploaded.slice(0, 1));
  };

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const move = (i: number, dir: -1 | 1) => {
    const next = [...value];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className={className}>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition ${
          dragOver ? 'border-brand-blue bg-brand-blue/5' : 'border-border hover:border-brand-blue/50 bg-muted/30'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
        <Icon name={uploading ? 'Loader2' : 'Upload'} size={28}
          className={`mx-auto mb-2 text-brand-blue ${uploading ? 'animate-spin' : ''}`} />
        <div className="text-sm font-semibold">
          {uploading
            ? `Загрузка ${progress.done}/${progress.total}...`
            : multiple ? 'Перетащите фото сюда' : 'Перетащите изображение'}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {hint || 'или нажмите для выбора с компьютера/телефона. JPG, PNG, WEBP до 10 МБ'}
        </div>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          {value.map((url, i) => (
            <div key={url + i} className="relative group rounded-lg overflow-hidden border border-border">
              <img src={url} alt="" className="w-full h-24 object-cover" />
              {i === 0 && (
                <div className="absolute top-1 left-1 text-[10px] bg-brand-blue text-white px-1.5 py-0.5 rounded font-semibold">
                  Главная
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                {multiple && i > 0 && (
                  <button type="button" onClick={() => move(i, -1)}
                    className="bg-white rounded p-1 shadow">
                    <Icon name="ChevronLeft" size={14} />
                  </button>
                )}
                <button type="button" onClick={() => remove(i)}
                  className="bg-red-500 text-white rounded p-1 shadow">
                  <Icon name="Trash2" size={14} />
                </button>
                {multiple && i < value.length - 1 && (
                  <button type="button" onClick={() => move(i, 1)}
                    className="bg-white rounded p-1 shadow">
                    <Icon name="ChevronRight" size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
