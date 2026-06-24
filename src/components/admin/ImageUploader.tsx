import { useRef, useState, useCallback, useEffect } from 'react';
import { uploadFileEx, getOriginalPhotoUrl, getToken, REMOVE_WM_URL } from '@/lib/adminApi';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import ImageUploaderLightbox from './ImageUploaderLightbox';
import ImageUploaderDropZone from './ImageUploaderDropZone';
import ImageUploaderPhotoCard from './ImageUploaderPhotoCard';

const MAX_FILES = 30;

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
const JPEG_QUALITY = 0.82;

async function compressImage(file: File): Promise<File> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  // HEIC/HEIF — браузер не умеет сжимать, отправляем как есть, бэкенд конвертирует через pillow-heif
  if (file.type === 'image/heic' || file.type === 'image/heif' ||
      file.name.toLowerCase().match(/\.(heic|heif)$/)) return file;
  try {
    // Таймаут 10 сек — защита от зависания на неподдерживаемых форматах
    const bitmap = await Promise.race([
      createImageBitmap(file),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
    ]);
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
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.(jpe?g|png|webp|bmp|tiff?)$/i, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
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
  const safeValue: string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : typeof value === 'string' && value
      ? String(value).split(value.includes('|') ? '|' : ',').map(s => s.trim()).filter(Boolean)
      : [];
  value = safeValue;

  const { settings } = useSettings();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [wmState, setWmState] = useState<Record<number, string>>({});

  // ── Pointer-drag (мышь + тач) — всё через refs, нет stale closure ──────────
  const gridRef = useRef<HTMLDivElement>(null);
  const dragFromIdx = useRef<number | null>(null);
  const dragStartXY = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  // Снапшот рект-ов карточек в начале drag-а (не меняются во время перетаскивания)
  const cardRects = useRef<{ idx: number; rect: DOMRect }[]>([]);

  const snapRects = () => {
    if (!gridRef.current) return;
    cardRects.current = Array.from(
      gridRef.current.querySelectorAll<HTMLElement>('[data-card-idx]')
    ).map(el => ({ idx: parseInt(el.dataset.cardIdx!), rect: el.getBoundingClientRect() }));
  };

  const getIdxAt = (x: number, y: number): number | null => {
    for (const { idx, rect } of cardRects.current) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return idx;
    }
    return null;
  };

  const handlePointerDown = useCallback((e: React.PointerEvent, i: number) => {
    if (!multiple) return;
    if ((e.target as HTMLElement).closest('button')) return;
    dragFromIdx.current = i;
    dragStartXY.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
    // Захватываем pointer на сетке (не на карточке!) чтобы pointermove шёл на gridRef
    gridRef.current?.setPointerCapture(e.pointerId);
  }, [multiple]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragFromIdx.current === null || !dragStartXY.current) return;
    const dx = Math.abs(e.clientX - dragStartXY.current.x);
    const dy = Math.abs(e.clientY - dragStartXY.current.y);
    if (!isDraggingRef.current) {
      if (dx < 6 && dy < 6) return;
      isDraggingRef.current = true;
      snapRects();
      setDragIdx(dragFromIdx.current);
    }
    // Двигаем ghost за курсором
    setGhostPos({ x: e.clientX, y: e.clientY });
    const over = getIdxAt(e.clientX, e.clientY);
    setDragOverIdx(over !== null && over !== dragFromIdx.current ? over : null);
  }, [multiple]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragFromIdx.current === null) return;
    if (isDraggingRef.current) {
      const over = getIdxAt(e.clientX, e.clientY);
      if (over !== null && over !== dragFromIdx.current) {
        const next = [...valueRef.current];
        const [moved] = next.splice(dragFromIdx.current, 1);
        next.splice(over, 0, moved);
        onChange(next);
      }
    }
    dragFromIdx.current = null;
    dragStartXY.current = null;
    isDraggingRef.current = false;
    cardRects.current = [];
    setDragIdx(null);
    setDragOverIdx(null);
    setGhostPos(null);
  }, [onChange]);

  const shouldCompress = compress ?? (folder === 'photos');

  const handleFiles = async (files: FileList | File[]) => {
    const all = Array.from(files).filter(f =>
      f.type.startsWith('image/') ||
      /\.(heic|heif)$/i.test(f.name)
    );
    if (!all.length) return;

    // Снимаем актуальное значение через ref — избегаем stale closure
    const currentValue = valueRef.current;

    // Ограничение: не более MAX_FILES итого
    const currentCount = multiple ? currentValue.length : 0;
    const canAdd = multiple ? Math.max(0, MAX_FILES - currentCount) : 1;
    if (canAdd === 0) {
      toast.error(`Максимум ${MAX_FILES} фотографий`);
      return;
    }
    const arr = all.slice(0, canAdd);
    if (arr.length < all.length) {
      toast.warning(`Добавлено ${arr.length} из ${all.length} — достигнут лимит ${MAX_FILES} фото`);
    }

    setUploading(true);
    setProgress({ done: 0, total: arr.length });

    // Накапливаем все загруженные URL и вызываем onChange ОДИН РАЗ в конце.
    // Это исключает stale closure: мы не читаем value внутри цикла.
    const uploaded: string[] = [];
    const failed: string[] = [];

    for (const f of arr) {
      try {
        const compressed = shouldCompress ? await compressImage(f) : f;
        const needWm = !!(applyWatermark && settings.watermark_enabled && settings.watermark_url);
        const r = await uploadFileEx(compressed, folder, needWm);
        uploaded.push(r.url);
      } catch {
        failed.push(f.name);
      }
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }

    setUploading(false);

    if (uploaded.length > 0) {
      // Читаем актуальный список через ref — он обновлялся через useEffect
      const base = multiple ? valueRef.current : [];
      onChange(multiple ? [...base, ...uploaded] : uploaded.slice(0, 1));
    }
    if (failed.length > 0) {
      toast.error(
        `Не удалось загрузить ${failed.length} фото: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '...' : ''}`
      );
    }
  };

  const download = async (url: string, opts: { original?: boolean } = {}) => {
    const targetUrl = opts.original ? getOriginalPhotoUrl(url) : url;
    try {
      const res = await fetch(targetUrl, { mode: 'cors' });
      const blob = await res.blob();
      const a = document.createElement('a');
      const fname = targetUrl.split('/').pop() || 'photo.jpg';
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      window.open(targetUrl, '_blank');
    }
  };

  // Удаление чужого водяного знака через Яндекс Vision API
  const removeWatermark = async (i: number, url: string) => {
    setWmState(s => ({ ...s, [i]: 'loading' }));
    try {
      const token = getToken();
      const r = await fetch(REMOVE_WM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ action: 'remove_watermark', url }),
      });
      const data = await r.json();
      if (data.url) {
        const next = [...value];
        next[i] = data.url;
        onChange(next);
        setWmState(s => ({ ...s, [i]: 'done' }));
        setTimeout(() => setWmState(s => ({ ...s, [i]: 'idle' })), 2000);
      } else {
        setWmState(s => ({ ...s, [i]: 'error' }));
        setTimeout(() => setWmState(s => ({ ...s, [i]: 'idle' })), 2000);
      }
    } catch {
      setWmState(s => ({ ...s, [i]: 'error' }));
      setTimeout(() => setWmState(s => ({ ...s, [i]: 'idle' })), 2000);
    }
  };

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className={className}>
      {/* ── Зона загрузки ── */}
      <ImageUploaderDropZone
        multiple={multiple}
        uploading={uploading}
        progress={progress}
        shouldCompress={shouldCompress}
        hint={hint}
        canAdd={multiple ? Math.max(0, MAX_FILES - value.length) : 1}
        onFiles={handleFiles}
      />

      {/* ── Сетка фото ── */}
      {value.length > 0 && (
        <>
          {multiple && (
            <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
              <Icon name="GripVertical" size={11} />
              Удерживайте и перетащите фото для изменения порядка. Первое фото — главное.
            </div>
          )}
          <div
            ref={gridRef}
            className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2"
            style={{ touchAction: multiple ? 'none' : 'auto' }}
            onPointerMove={multiple ? handlePointerMove : undefined}
            onPointerUp={multiple ? handlePointerUp : undefined}
            onPointerCancel={multiple ? handlePointerUp : undefined}
          >
            {value.map((url, i) => (
              <ImageUploaderPhotoCard
                key={url + i}
                url={url}
                index={i}
                multiple={multiple}
                allowDownload={allowDownload}
                wmStatus={(wmState[i] || 'idle') as 'idle' | 'loading' | 'done' | 'error'}
                isDragging={dragIdx === i}
                isOver={dragOverIdx === i}
                onPointerDown={e => handlePointerDown(e, i)}
                onZoom={() => setLightboxIdx(i)}
                onDownload={() => download(url)}
                onDownloadOriginal={() => download(url, { original: true })}
                onRemoveWatermark={() => removeWatermark(i, url)}
                onRemove={() => remove(i)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Ghost-элемент (следует за курсором во время drag) ── */}
      {ghostPos && dragIdx !== null && value[dragIdx] && (
        <div
          className="fixed z-[999] pointer-events-none rounded-xl overflow-hidden shadow-2xl border-2 border-brand-blue"
          style={{
            left: ghostPos.x,
            top: ghostPos.y,
            transform: 'translate(-50%, -50%) rotate(2deg) scale(0.85)',
            width: 160,
            height: 120,
            opacity: 0.95,
          }}
        >
          <img src={value[dragIdx]} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-brand-blue/10" />
        </div>
      )}

      {/* ── Лайтбокс ── */}
      {lightboxIdx !== null && (
        <ImageUploaderLightbox
          urls={value}
          startIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}