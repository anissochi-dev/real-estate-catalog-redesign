import { useRef, useState, useCallback, useEffect } from 'react';
import { uploadFileEx, getOriginalPhotoUrl, getToken, REMOVE_WM_URL } from '@/lib/adminApi';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';

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
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.(jpe?g|png|webp|bmp|tiff?)$/i, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

// ── Лайтбокс ─────────────────────────────────────────────────────────────────
function Lightbox({ urls, startIdx, onClose }: { urls: string[]; startIdx: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIdx);
  const prev = () => setIdx(i => (i - 1 + urls.length) % urls.length);
  const next = () => setIdx(i => (i + 1) % urls.length);

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'Escape') onClose();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={onKey}
      tabIndex={0}
      autoFocus
    >
      {/* Закрыть */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
      >
        <Icon name="X" size={20} />
      </button>

      {/* Счётчик */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-semibold">
        {idx + 1} / {urls.length}
      </div>

      {/* Стрелки */}
      {urls.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); prev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition"
          >
            <Icon name="ChevronLeft" size={24} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); next(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition"
          >
            <Icon name="ChevronRight" size={24} />
          </button>
        </>
      )}

      {/* Фото */}
      <img
        src={urls[idx]}
        alt=""
        onClick={e => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl select-none"
      />

      {/* Точки */}
      {urls.length > 1 && urls.length <= 20 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {urls.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setIdx(i); }}
              className={`w-2 h-2 rounded-full transition ${i === idx ? 'bg-white' : 'bg-white/30 hover:bg-white/60'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Основной компонент ────────────────────────────────────────────────────────
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
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
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!arr.length) return;
    setUploading(true);
    setProgress({ done: 0, total: arr.length });
    const uploaded: string[] = [];
    for (const f of arr) {
      try {
        const compressed = shouldCompress ? await compressImage(f) : f;
        const needWm = !!(applyWatermark && settings.watermark_enabled && settings.watermark_url);
        const r = await uploadFileEx(compressed, folder, needWm);
        uploaded.push(r.url);
        setProgress(p => ({ ...p, done: p.done + 1 }));
      } catch (e: unknown) {
        alert('Ошибка загрузки: ' + (e instanceof Error ? e.message : ''));
      }
    }
    setUploading(false);
    onChange(multiple ? [...value, ...uploaded] : uploaded.slice(0, 1));
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
      {/* ── Зона загрузки (уменьшенная высота) ── */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
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
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
        <Icon name={uploading ? 'Loader2' : 'Upload'} size={24}
          className={`mx-auto mb-1.5 text-brand-blue ${uploading ? 'animate-spin' : ''}`} />
        <div className="text-sm font-semibold">
          {uploading
            ? `Загрузка ${progress.done}/${progress.total}...`
            : multiple ? 'Перетащите фото сюда' : 'Перетащите изображение'}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {hint || 'или нажмите для выбора с компьютера/телефона. JPG, PNG, WEBP до 10 МБ'}
        </div>
        {shouldCompress && (
          <div className="text-[10px] text-muted-foreground/80 mt-0.5 inline-flex items-center gap-1">
            <Icon name="Zap" size={10} />
            Авто-оптимизация: 1920px · WebP 90% (без потери качества)
          </div>
        )}
      </div>

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
            {value.map((url, i) => {
              const wm = wmState[i] || 'idle';
              const hasOwnWm = /_wm\.(jpe?g|png|webp)$/i.test(url);
              const isDragging = dragIdx === i;
              const isOver = dragOverIdx === i;
              return (
                <div
                  key={url + i}
                  data-card-idx={i}
                  data-url={url}
                  onPointerDown={e => handlePointerDown(e, i)}
                  className={`rounded-xl border-2 bg-white select-none transition-all duration-150 relative ${
                    isDragging
                      ? 'opacity-25 border-brand-blue border-dashed'
                      : isOver
                      ? 'border-brand-blue ring-2 ring-brand-blue/40 shadow-lg'
                      : 'border-border hover:border-brand-blue/40'
                  } ${multiple ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  style={{ overflow: isDragging ? 'visible' : 'hidden' }}
                >
                  {/* ── Индикатор вставки ── */}
                  {isOver && (
                    <div className="absolute inset-0 z-20 rounded-[10px] bg-brand-blue/15 flex items-center justify-center pointer-events-none">
                      <div className="bg-brand-blue text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                        <Icon name="ArrowLeftRight" size={13} /> Вставить сюда
                      </div>
                    </div>
                  )}

                  {/* ── Фото ── */}
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
                    {i === 0 && (
                      <div className="absolute bottom-2 left-2 text-[10px] bg-brand-blue text-white px-2 py-0.5 rounded-full font-semibold shadow">
                        Главная
                      </div>
                    )}
                    {i > 0 && (
                      <div className="absolute bottom-2 left-2 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded-full font-semibold">
                        {i + 1}
                      </div>
                    )}
                    {/* Кнопка лупы */}
                    <button
                      type="button"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); setLightboxIdx(i); }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 hover:bg-black/80 flex items-center justify-center text-white transition"
                      title="Увеличить"
                    >
                      <Icon name="ZoomIn" size={14} />
                    </button>
                  </div>

                  {/* ── Панель под фото ── */}
                  <div className="px-2 py-2 space-y-1.5 bg-muted/30 border-t border-border">

                    {/* Удалить */}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); remove(i); }}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition"
                        title="Удалить фото"
                      >
                        <Icon name="Trash2" size={11} /> Удалить
                      </button>
                    </div>

                    {/* Скачать */}
                    {allowDownload && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); download(url); }}
                          className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1 rounded bg-white border border-border hover:bg-muted/60 transition"
                          title="Скачать фото"
                        >
                          <Icon name="Download" size={11} /> Скачать
                        </button>
                        {hasOwnWm && (
                          <button
                            type="button"
                            onPointerDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); download(url, { original: true }); }}
                            className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition"
                            title="Скачать без нашего водяного знака"
                          >
                            <Icon name="DownloadCloud" size={11} /> Без ВЗ
                          </button>
                        )}
                      </div>
                    )}

                    {/* Удалить чужой ВЗ */}
                    <button
                      type="button"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); if (wm === 'idle') removeWatermark(i, url); }}
                      disabled={wm === 'loading'}
                      className={`w-full inline-flex items-center justify-center gap-1.5 text-[10px] font-semibold px-2 py-1.5 rounded border transition ${
                        wm === 'loading' ? 'bg-amber-50 border-amber-200 text-amber-700 cursor-wait' :
                        wm === 'done'    ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                        wm === 'error'   ? 'bg-red-50 border-red-200 text-red-600' :
                        'bg-white border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                      title="Удалить чужой водяной знак (Яндекс Vision AI)"
                    >
                      <Icon
                        name={wm === 'loading' ? 'Loader2' : wm === 'done' ? 'CheckCircle2' : wm === 'error' ? 'AlertCircle' : 'Eraser'}
                        size={11}
                        className={wm === 'loading' ? 'animate-spin' : ''}
                      />
                      {wm === 'loading' ? 'Удаление ВЗ…' : wm === 'done' ? 'Водяной знак удалён' : wm === 'error' ? 'Ошибка удаления' : 'Удалить водяной знак'}
                    </button>

                  </div>
                </div>
              );
            })}
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
        <Lightbox
          urls={value}
          startIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}