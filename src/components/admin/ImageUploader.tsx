import { useRef, useState } from 'react';
import { uploadFile } from '@/lib/adminApi';
import { useSettings } from '@/contexts/SettingsContext';
import { applyWatermarkClient } from '@/lib/applyWatermark';
import Icon from '@/components/ui/icon';
import WatermarkEraser from './WatermarkEraser';

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  folder?: 'photos' | 'logo' | 'watermark';
  multiple?: boolean;
  className?: string;
  hint?: string;
  compress?: boolean;
  allowDownload?: boolean;
  applyWatermark?: boolean;
}

const MAX_SIDE = 1920;
const WEBP_QUALITY = 0.9;

async function compressImage(file: File): Promise<File> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const longest = Math.max(width, height);
    const scale = longest > MAX_SIDE ? MAX_SIDE / longest : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.(jpe?g|png|webp|bmp|tiff?)$/i, '') + '.webp';
    return new File([blob], newName, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}

export default function ImageUploader({
  value,
  onChange,
  folder = 'photos',
  multiple = true,
  className = '',
  hint,
  compress,
  allowDownload = true,
  applyWatermark = false,
}: Props) {
  const { settings } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [removingWm, setRemovingWm] = useState<number | null>(null);
  const [eraserIdx, setEraserIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const shouldCompress = compress ?? (folder === 'photos');

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!arr.length) return;
    setUploading(true);
    setProgress({ done: 0, total: arr.length });
    const uploaded: string[] = [];
    for (const f of arr) {
      try {
        let ready = shouldCompress ? await compressImage(f) : f;
        if (applyWatermark && settings.watermark_enabled && settings.watermark_url) {
          ready = await applyWatermarkClient(ready, settings);
        }
        const url = await uploadFile(ready, folder, false);
        uploaded.push(url);
        setProgress(p => ({ ...p, done: p.done + 1 }));
      } catch (e: unknown) {
        alert('Ошибка загрузки: ' + (e instanceof Error ? e.message : ''));
      }
    }
    setUploading(false);
    onChange(multiple ? [...value, ...uploaded] : uploaded.slice(0, 1));
  };

  const download = async (url: string) => {
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      const a = document.createElement('a');
      const fname = url.split('/').pop() || 'photo.webp';
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleEraserDone = (newUrl: string) => {
    if (eraserIdx === null) return;
    const next = [...value];
    next[eraserIdx] = newUrl;
    onChange(next);
    setEraserIdx(null);
  };

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const move = (i: number, dir: -1 | 1) => {
    const next = [...value];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const handleCardDragStart = (e: React.DragEvent, i: number) => {
    setDragIdx(i);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCardDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(i);
  };

  const handleCardDrop = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...value];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    onChange(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleCardDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  return (
    <>
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
        {shouldCompress && (
          <div className="text-[10px] text-muted-foreground/80 mt-1 inline-flex items-center gap-1">
            <Icon name="Zap" size={10} />
            Авто-оптимизация: 1920px · WebP 90% (без потери качества)
          </div>
        )}
      </div>

      {value.length > 0 && (
        <>
          {multiple && (
            <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
              <Icon name="GripVertical" size={11} />
              Перетащите фото для изменения порядка. Первое фото — главное.
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5">
            {value.map((url, i) => (
              <div
                key={url + i}
                draggable={multiple}
                onDragStart={e => handleCardDragStart(e, i)}
                onDragOver={e => handleCardDragOver(e, i)}
                onDrop={e => handleCardDrop(e, i)}
                onDragEnd={handleCardDragEnd}
                className={`relative group rounded-lg overflow-hidden border transition-all ${
                  dragIdx === i
                    ? 'opacity-40 scale-95 border-brand-blue'
                    : dragOverIdx === i
                    ? 'border-brand-blue ring-2 ring-brand-blue/30 scale-105'
                    : 'border-border'
                } ${multiple ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                <img src={url} alt="" className="w-full h-24 object-cover pointer-events-none" />
                {i === 0 && (
                  <div className="absolute top-1 left-1 text-[10px] bg-brand-blue text-white px-1.5 py-0.5 rounded font-semibold">
                    Главная
                  </div>
                )}

                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                  {multiple && i > 0 && (
                    <button type="button" onClick={e => { e.stopPropagation(); move(i, -1); }}
                      className="bg-white rounded p-1 shadow" title="Влево">
                      <Icon name="ChevronLeft" size={14} />
                    </button>
                  )}
                  {folder === 'photos' && (
                    <button type="button" onClick={e => { e.stopPropagation(); setEraserIdx(i); }}
                      className="bg-violet-600 text-white rounded p-1 shadow" title="Убрать водяной знак">
                      <Icon name="Wand2" size={14} />
                    </button>
                  )}
                  {allowDownload && (
                    <button type="button" onClick={e => { e.stopPropagation(); download(url); }}
                      className="bg-white rounded p-1 shadow" title="Скачать оригинал">
                      <Icon name="Download" size={14} />
                    </button>
                  )}
                  <button type="button" onClick={e => { e.stopPropagation(); remove(i); }}
                    className="bg-red-500 text-white rounded p-1 shadow" title="Удалить">
                    <Icon name="Trash2" size={14} />
                  </button>
                  {multiple && i < value.length - 1 && (
                    <button type="button" onClick={e => { e.stopPropagation(); move(i, 1); }}
                      className="bg-white rounded p-1 shadow" title="Вправо">
                      <Icon name="ChevronRight" size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
      {eraserIdx !== null && (
        <WatermarkEraser
          photoUrl={value[eraserIdx]}
          onDone={handleEraserDone}
          onClose={() => setEraserIdx(null)}
        />
      )}
    </>
  );
}