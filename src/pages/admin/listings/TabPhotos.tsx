import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { Listing } from './types';

interface Props {
  listing: Listing;
}

/** Строит URL thumb из CDN-ссылки на основное фото.
 * Работает ТОЛЬКО для папки photos/ — логотипы не трогает. */
function toThumbUrl(src: string): string {
  if (!src || !src.includes('cdn.poehali.dev')) return src;
  if (!src.includes('/photos/')) return src;
  if (src.includes('_thumb.webp')) return src;
  return src.replace(/(_wm)?\.(webp|jpe?g|png)$/i, '_thumb.webp');
}

/** Преобразует URL фото с водяным знаком в URL оригинала (тот же формат, без ВЗ).
 * Бэкенд upload/ сохраняет файл с ВЗ как `{token}_wm.{ext}`, а оригинал — `{token}.{ext}`. */
function toOriginalUrl(url: string): string {
  if (!url) return url;
  return url.replace(/_wm(\.(webp|jpe?g|png))$/i, '$1');
}

/** Строит URL JPG-копии без логотипа из отдельной папки xml-feeds-photos/
 * (создаётся бэкендом автоматически при загрузке каждого фото объекта).
 * Возвращает null, если URL не из папки photos/ — тогда используем оригинал как фолбэк. */
function toNoLogoJpgUrl(url: string): string | null {
  const m = url.match(/\/photos\/([a-zA-Z0-9]+)(?:_wm)?\.(?:webp|jpe?g|png)$/i);
  if (!m) return null;
  return url.replace(/\/photos\/[a-zA-Z0-9]+(?:_wm)?\.(?:webp|jpe?g|png)$/i, `/xml-feeds-photos/${m[1]}.jpg`);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

/** Скачивает файл без fallback на window.open — используется, когда нужно
 * молча попробовать альтернативный URL при неудаче (без побочных эффектов). */
async function fetchAndDownload(url: string, filename: string) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
}

async function downloadUrl(url: string, filename: string) {
  try {
    await fetchAndDownload(url, filename);
  } catch (e) {
    // fallback — открыть в новой вкладке
    window.open(url, '_blank');
    throw e;
  }
}

export default function TabPhotos({ listing }: Props) {
  const photos = useMemo(() => {
    const list = (listing.images || '').split('|').map(s => s.trim()).filter(Boolean);
    if (listing.image && !list.includes(listing.image)) list.unshift(listing.image);
    return list;
  }, [listing.image, listing.images]);

  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleDownloadWithLogo = async (url: string, idx: number) => {
    setBusy(`logo-${idx}`);
    try {
      await downloadUrl(url, `listing-${listing.id}-photo-${idx + 1}-logo.jpg`);
      toast.success('Фото скачано с логотипом');
    } catch {
      toast.error('Не удалось скачать', { description: 'Ссылка открыта в новой вкладке' });
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadNoLogo = async (url: string, idx: number) => {
    setBusy(`nologo-${idx}`);
    const filename = `listing-${listing.id}-photo-${idx + 1}.jpg`;
    const noLogoUrl = toNoLogoJpgUrl(url);
    try {
      if (noLogoUrl) {
        try {
          await fetchAndDownload(noLogoUrl, filename);
          toast.success('Фото скачано без логотипа');
          return;
        } catch {
          // Копии в xml-feeds-photos/ может не быть для старых фото — используем оригинал
        }
      }
      await downloadUrl(toOriginalUrl(url), filename);
      toast.success('Фото скачано без логотипа');
    } catch {
      toast.error('Не удалось скачать', { description: 'Ссылка открыта в новой вкладке' });
    } finally {
      setBusy(null);
    }
  };

  if (photos.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Icon name="ImageOff" size={36} className="mx-auto mb-3 opacity-40" />
        У объекта нет фотографий.
        <div className="text-xs mt-2">Загрузите их в редакторе объекта.</div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Фотографии объекта</h3>
          <div className="text-xs text-muted-foreground">
            Всего: {photos.length} · Наведите на фото, чтобы скачать — с логотипом или без
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {photos.map((url, idx) => {
          const isMain = idx === 0;
          return (
            <div key={`${url}-${idx}`}
                 className="group relative bg-muted rounded-xl overflow-hidden border border-border">
              <button onClick={() => setPreview(url)} className="block w-full">
                <img src={toThumbUrl(url)} alt={`Фото ${idx + 1}`}
                     className="w-full aspect-[4/3] object-cover" loading="lazy"
                     onError={e => {
                       // Превью (_thumb.webp) может отсутствовать — например, для фото,
                       // добавленных через старую форму владельца без генерации миниатюр.
                       // В этом случае показываем оригинал вместо битой иконки.
                       const img = e.currentTarget;
                       if (img.src !== url) img.src = url;
                     }} />
              </button>
              {isMain && (
                <span className="absolute top-2 left-2 bg-brand-blue text-white text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <Icon name="Star" size={10} /> Главное
                </span>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end opacity-0 group-hover:opacity-100">
                <div className="w-full p-2 flex flex-wrap gap-1.5">
                  <button onClick={() => handleDownloadWithLogo(url, idx)}
                          disabled={busy === `logo-${idx}`}
                          className="flex-1 min-w-[110px] text-xs bg-white/95 hover:bg-white text-foreground px-2.5 py-1.5 rounded-lg inline-flex items-center justify-center gap-1 font-medium disabled:opacity-60">
                    {busy === `logo-${idx}`
                      ? <Icon name="Loader2" size={12} className="animate-spin" />
                      : <Icon name="Download" size={12} />}
                    С логотипом
                  </button>
                  <button onClick={() => handleDownloadNoLogo(url, idx)}
                          disabled={busy === `nologo-${idx}`}
                          className="flex-1 min-w-[110px] text-xs bg-brand-blue/95 hover:bg-brand-blue text-white px-2.5 py-1.5 rounded-lg inline-flex items-center justify-center gap-1 font-medium disabled:opacity-60">
                    {busy === `nologo-${idx}`
                      ? <Icon name="Loader2" size={12} className="animate-spin" />
                      : <Icon name="Download" size={12} />}
                    Без логотипа
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview lightbox */}
      {preview && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
             onClick={() => setPreview(null)}>
          <img src={preview} alt="Просмотр" className="max-w-full max-h-full object-contain rounded-xl" />
          <button onClick={() => setPreview(null)}
                  className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white">
            <Icon name="X" size={22} />
          </button>
        </div>
      )}
    </div>
  );
}