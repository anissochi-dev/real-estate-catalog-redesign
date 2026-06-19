import { useRef, useState, useCallback } from 'react';
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
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  // Состояния удаления ВЗ: { [i]: 'idle' | 'loading' | 'done' | 'error' }
  const [wmState, setWmState] = useState<Record<number, string>>({});

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
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return; }
    const next = [...value];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    onChange(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleCardDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

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

      {/* ── Сетка фото (2x крупнее: 3 колонки) ── */}
      {value.length > 0 && (
        <>
          {multiple && (
            <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
              <Icon name="GripVertical" size={11} />
              Перетащите фото для изменения порядка. Первое фото — главное.
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
            {value.map((url, i) => {
              const wm = wmState[i] || 'idle';
              return (
                <div
                  key={url + i}
                  draggable={multiple}
                  onDragStart={e => handleCardDragStart(e, i)}
                  onDragOver={e => handleCardDragOver(e, i)}
                  onDrop={e => handleCardDrop(e, i)}
                  onDragEnd={handleCardDragEnd}
                  className={`relative group rounded-xl overflow-hidden border-2 transition-all ${
                    dragIdx === i
                      ? 'opacity-40 scale-95 border-brand-blue'
                      : dragOverIdx === i
                      ? 'border-brand-blue ring-2 ring-brand-blue/30 scale-[1.02]'
                      : 'border-border hover:border-brand-blue/40'
                  } ${multiple ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  {/* Фото — высота увеличена до h-44 */}
                  <img
                    src={url}
                    alt=""
                    className="w-full h-44 object-cover pointer-events-none"
                  />

                  {/* Бейдж «Главная» */}
                  {i === 0 && (
                    <div className="absolute top-2 left-2 text-[10px] bg-brand-blue text-white px-2 py-0.5 rounded-full font-semibold shadow">
                      Главная
                    </div>
                  )}

                  {/* Кнопка лупы — всегда видна */}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setLightboxIdx(i); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition opacity-0 group-hover:opacity-100"
                    title="Увеличить"
                  >
                    <Icon name="ZoomIn" size={14} />
                  </button>

                  {/* Оверлей с кнопками при наведении */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                    {/* Строка навигации */}
                    {multiple && (
                      <div className="flex items-center gap-1">
                        {i > 0 && (
                          <button type="button" onClick={e => { e.stopPropagation(); move(i, -1); }}
                            className="w-7 h-7 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center shadow transition" title="Влево">
                            <Icon name="ChevronLeft" size={14} />
                          </button>
                        )}
                        {allowDownload && (
                          <button type="button" onClick={e => { e.stopPropagation(); download(url); }}
                            className="w-7 h-7 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center shadow transition" title="Скачать">
                            <Icon name="Download" size={14} />
                          </button>
                        )}
                        {/* Скачать без нашего ВЗ */}
                        {allowDownload && /_wm\.(jpe?g|png|webp)$/i.test(url) && (
                          <button type="button" onClick={e => { e.stopPropagation(); download(url, { original: true }); }}
                            className="w-7 h-7 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg flex items-center justify-center shadow transition" title="Скачать без водяного знака">
                            <Icon name="DownloadCloud" size={14} />
                          </button>
                        )}
                        <button type="button" onClick={e => { e.stopPropagation(); remove(i); }}
                          className="w-7 h-7 bg-red-500 hover:bg-red-400 text-white rounded-lg flex items-center justify-center shadow transition" title="Удалить">
                          <Icon name="Trash2" size={14} />
                        </button>
                        {i < value.length - 1 && (
                          <button type="button" onClick={e => { e.stopPropagation(); move(i, 1); }}
                            className="w-7 h-7 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center shadow transition" title="Вправо">
                            <Icon name="ChevronRight" size={14} />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Кнопка удаления чужого водяного знака */}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); if (wm === 'idle') removeWatermark(i, url); }}
                      disabled={wm === 'loading'}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold shadow transition ${
                        wm === 'loading' ? 'bg-amber-400 text-white cursor-wait' :
                        wm === 'done'    ? 'bg-emerald-500 text-white' :
                        wm === 'error'   ? 'bg-red-500 text-white' :
                        'bg-white/90 hover:bg-white text-foreground'
                      }`}
                      title="Удалить водяной знак с фото (Яндекс Vision)"
                    >
                      <Icon
                        name={wm === 'loading' ? 'Loader2' : wm === 'done' ? 'Check' : wm === 'error' ? 'X' : 'Eraser'}
                        size={12}
                        className={wm === 'loading' ? 'animate-spin' : ''}
                      />
                      {wm === 'loading' ? 'Обработка…' : wm === 'done' ? 'Готово' : wm === 'error' ? 'Ошибка' : 'Удалить ВЗ'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
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
