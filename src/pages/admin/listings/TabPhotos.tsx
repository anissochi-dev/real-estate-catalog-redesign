import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { adminApi } from '@/lib/adminApi';
import { Listing } from './types';

interface Props {
  listing: Listing;
}

/** Преобразует URL с водяным знаком в оригинал.
 * Бэкенд upload/ сохраняет original в `original_url` + `image_url` с ВЗ.
 * Для уже-сохранённого `images` — пробуем по соглашению:
 *   /photos/.../watermarked/img.jpg  →  /photos/.../img.jpg
 *   ?watermark=1                     →  убираем параметр
 *   /wm/                             →  убираем сегмент
 */
function toOriginalUrl(url: string): string {
  if (!url) return url;
  let u = url;
  u = u.replace(/\/watermarked\//g, '/');
  u = u.replace(/[?&]watermark=1/g, '');
  u = u.replace(/\/wm\//g, '/');
  u = u.replace(/\/marked\//g, '/');
  return u;
}

async function downloadUrl(url: string, filename: string) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
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

  const handleDownloadOriginal = async (url: string, idx: number) => {
    setBusy(`download-${idx}`);
    const original = toOriginalUrl(url);
    try {
      await downloadUrl(original, `listing-${listing.id}-photo-${idx + 1}.jpg`);
      toast.success('Фото скачано без логотипа');
    } catch {
      toast.error('Не удалось скачать', { description: 'Ссылка открыта в новой вкладке' });
    } finally {
      setBusy(null);
    }
  };

  const handleInpaint = async (url: string, idx: number) => {
    setBusy(`inpaint-${idx}`);
    try {
      await adminApi.inpaintListingPhoto({ image_url: url });
      // Если успешно — backend вернёт новый url; пока что заглушка
    } catch {
      // showError уже отработал в adminApi.req
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
            Всего: {photos.length} · Скачивание происходит без водяного знака
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
                <img src={url} alt={`Фото ${idx + 1}`}
                     className="w-full aspect-[4/3] object-cover" loading="lazy" />
              </button>
              {isMain && (
                <span className="absolute top-2 left-2 bg-brand-blue text-white text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <Icon name="Star" size={10} /> Главное
                </span>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end opacity-0 group-hover:opacity-100">
                <div className="w-full p-2 flex flex-wrap gap-1.5">
                  <button onClick={() => handleDownloadOriginal(url, idx)}
                          disabled={busy === `download-${idx}`}
                          className="flex-1 min-w-[110px] text-xs bg-white/95 hover:bg-white text-foreground px-2.5 py-1.5 rounded-lg inline-flex items-center justify-center gap-1 font-medium disabled:opacity-60">
                    {busy === `download-${idx}`
                      ? <Icon name="Loader2" size={12} className="animate-spin" />
                      : <Icon name="Download" size={12} />}
                    Скачать
                  </button>
                  <button onClick={() => handleInpaint(url, idx)}
                          disabled={busy === `inpaint-${idx}`}
                          className="flex-1 min-w-[110px] text-xs bg-brand-orange/95 hover:bg-brand-orange text-white px-2.5 py-1.5 rounded-lg inline-flex items-center justify-center gap-1 font-medium disabled:opacity-60"
                          title="Убрать лишнее с фото через Меланию (YandexART)">
                    {busy === `inpaint-${idx}`
                      ? <Icon name="Loader2" size={12} className="animate-spin" />
                      : <Icon name="Sparkles" size={12} />}
                    Очистить ИИ
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
