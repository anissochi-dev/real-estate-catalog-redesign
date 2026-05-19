import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { Listing, splitImages } from './types';

const REMOVE_WM_URL = 'https://functions.poehali.dev/93965724-e0d4-411d-8100-b9468a1a0627';

interface Props {
  listing: Listing;
  onClose: () => void;
}

export default function PhotoPickModal({ listing, onClose }: Props) {
  const imgs = splitImages(listing.images);
  if (!imgs.length && listing.image) imgs.push(listing.image);
  const [selected, setSelected] = useState<Set<number>>(new Set(imgs.map((_, i) => i)));
  const [loading, setLoading] = useState(false);
  const token = typeof window !== 'undefined' ? localStorage.getItem('biznest_token') || '' : '';

  const toggleAll = () => {
    if (selected.size === imgs.length) setSelected(new Set());
    else setSelected(new Set(imgs.map((_, i) => i)));
  };

  const download = async () => {
    const toProcess = imgs.filter((_, i) => selected.has(i));
    if (!toProcess.length) return;
    setLoading(true);
    try {
      for (let i = 0; i < toProcess.length; i++) {
        const url = toProcess[i];
        try {
          const r = await fetch(REMOVE_WM_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
            body: JSON.stringify({ url }),
          });
          const data = await r.json();
          const finalUrl = data.url || url;
          await new Promise<void>(resolve => {
            fetch(finalUrl)
              .then(res => res.blob())
              .then(blob => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `object-${listing.id}-photo-${i + 1}.jpg`;
                a.click();
                URL.revokeObjectURL(a.href);
                resolve();
              })
              .catch(() => { window.open(finalUrl, '_blank'); resolve(); });
          });
        } catch {
          window.open(url, '_blank');
        }
      }
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-700 text-lg">Скачать фото без логотипа</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{listing.title}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <Icon name="X" size={18} />
          </button>
        </div>

        {imgs.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Icon name="ImageOff" size={32} className="mx-auto mb-2 opacity-30" />
            Фотографий нет
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selected.size === imgs.length}
                  onChange={toggleAll}
                  className="rounded"
                />
                Выбрать все ({imgs.length})
              </label>
              <span className="text-xs text-muted-foreground">Выбрано: {selected.size}</span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
              {imgs.map((url, i) => (
                <label key={i} className="relative cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => setSelected(prev => {
                      const s = new Set(prev);
                      if (s.has(i)) s.delete(i); else s.add(i);
                      return s;
                    })}
                    className="absolute top-2 left-2 z-10 rounded"
                  />
                  <img
                    src={url}
                    alt={`Фото ${i + 1}`}
                    className={`w-full aspect-square object-cover rounded-xl border-2 transition ${
                      selected.has(i) ? 'border-brand-blue' : 'border-transparent'
                    } group-hover:opacity-90`}
                  />
                  <span className="absolute bottom-1.5 right-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-md">
                    {i + 1}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={download}
            disabled={loading || selected.size === 0}
            className="flex-1 bg-brand-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading
              ? <><Icon name="Loader2" size={15} className="animate-spin" /> Обработка...</>
              : <><Icon name="Download" size={15} /> Скачать {selected.size > 0 ? `${selected.size} фото` : ''}</>
            }
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
