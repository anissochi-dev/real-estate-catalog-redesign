import { useState } from 'react';
import Icon from '@/components/ui/icon';

const IMPORT_URL = 'https://functions.poehali.dev/59ce84ce-c6bb-46e7-9223-5d893748615f';

interface ImportedListing {
  title: string;
  description: string;
  price: number;
  area: number;
  images: string[];
  address: string;
  source_url: string;
}

interface Props {
  onImport: (data: ImportedListing) => void;
  onClose: () => void;
}

export default function ImportFromUrlModal({ onImport, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ImportedListing | null>(null);

  const handleFetch = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setError('Введите ссылку'); return; }
    setError('');
    setLoading(true);
    setPreview(null);
    try {
      const res = await fetch(IMPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Ошибка: ${res.status}`);
        return;
      }
      setPreview(data.listing);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (preview) {
      onImport(preview);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <div className="font-display font-700 text-base flex items-center gap-2">
              <Icon name="Link" size={18} className="text-brand-blue" />
              Импорт по ссылке
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Вставьте ссылку на объект с любого сайта</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* URL input */}
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
              placeholder="https://example.com/object/123"
              value={url}
              onChange={e => { setUrl(e.target.value); setError(''); setPreview(null); }}
              onKeyDown={e => e.key === 'Enter' && handleFetch()}
              disabled={loading}
            />
            <button
              onClick={handleFetch}
              disabled={loading || !url.trim()}
              className="btn-blue text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 shrink-0"
            >
              {loading
                ? <><Icon name="Loader2" size={15} className="animate-spin" /> Загрузка...</>
                : <><Icon name="Search" size={15} /> Загрузить</>
              }
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
              <Icon name="AlertCircle" size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Предпросмотр</div>
              <div className="border border-border rounded-xl p-4 space-y-3">
                {preview.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {preview.images.slice(0, 5).map((img, i) => (
                      <img key={i} src={img} alt="" className="w-20 h-20 object-cover rounded-lg shrink-0 border border-border" />
                    ))}
                  </div>
                )}
                <div>
                  <div className="font-display font-700 text-sm">{preview.title || '—'}</div>
                  {preview.address && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Icon name="MapPin" size={11} /> {preview.address}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {preview.price > 0 && (
                    <div className="bg-muted/40 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-muted-foreground">Цена</div>
                      <div className="font-700">{preview.price.toLocaleString('ru')} ₽</div>
                    </div>
                  )}
                  {preview.area > 0 && (
                    <div className="bg-muted/40 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-muted-foreground">Площадь</div>
                      <div className="font-700">{preview.area} м²</div>
                    </div>
                  )}
                </div>
                {preview.description && (
                  <div className="text-xs text-foreground/70 line-clamp-3 leading-relaxed">
                    {preview.description}
                  </div>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Icon name="Info" size={12} />
                Данные будут перенесены в форму — вы сможете отредактировать их перед сохранением
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {preview && (
          <div className="px-5 py-4 border-t border-border shrink-0 flex gap-2">
            <button
              onClick={handleImport}
              className="flex-1 btn-blue text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Icon name="Download" size={16} />
              Перенести в форму
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-semibold text-sm border border-border text-muted-foreground hover:bg-muted transition-colors">
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
