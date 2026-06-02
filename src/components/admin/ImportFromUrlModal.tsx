import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { CATS, DEALS } from '@/pages/admin/listings/types';

const IMPORT_URL = 'https://functions.poehali.dev/59ce84ce-c6bb-46e7-9223-5d893748615f';

interface ImportedListing {
  title: string;
  description: string;
  price: number;
  area: number;
  images: string[];
  address: string;
  district?: string;
  city?: string;
  source_url: string;
  source?: string;
  source_reliable?: boolean;
  warning?: string;
  category?: string;
  deal?: string;
  floor?: number | null;
  total_floors?: number | null;
  ceiling_height?: number | null;
  electricity_kw?: number | null;
  utilities?: string;
  condition?: string;
  parking?: string;
}

interface Props {
  onImport: (data: ImportedListing) => void;
  onClose: () => void;
}

const SOURCE_LOGOS: Record<string, { label: string; color: string }> = {
  'arrpro.ru':   { label: 'АРР',    color: 'bg-blue-100 text-blue-700' },
  'ayax.ru':     { label: 'Аякс',   color: 'bg-green-100 text-green-700' },
  'etagi.com':   { label: 'Этажи',  color: 'bg-purple-100 text-purple-700' },
  'cian.ru':     { label: 'ЦИАН',   color: 'bg-orange-100 text-orange-700' },
  'avito.ru':    { label: 'Авито',  color: 'bg-emerald-100 text-emerald-700' },
  'restate.ru':  { label: 'Restate', color: 'bg-slate-100 text-slate-700' },
};

const COND_LABELS: Record<string, string> = {
  new: 'Новое', euro: 'Евроремонт', designer: 'Дизайнерский',
  good: 'Хорошее', normal: 'Рабочее', needs_repair: 'Требует ремонта',
  rough: 'Черновая', shell: 'Без отделки',
};
const PARKING_LABELS: Record<string, string> = {
  outdoor: 'Открытая', underground: 'Подземная', covered: 'Крытая', paid: 'Платная', none: 'Нет',
};

const SUGGESTED_SITES = [
  { name: 'АРР', url: 'https://krasnodar.arrpro.ru/', reliable: true },
  { name: 'Аякс', url: 'https://www.ayax.ru/', reliable: true },
  { name: 'Этажи', url: 'https://krasnodar.etagi.com/', reliable: true },
  { name: 'Restate', url: 'https://krasnodar.restate.ru/', reliable: true },
  { name: 'ЦИАН', url: 'https://cian.ru/', reliable: false },
  { name: 'Авито', url: 'https://avito.ru/', reliable: false },
];

export default function ImportFromUrlModal({ onImport, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ImportedListing | null>(null);
  const [category, setCategory] = useState('');
  const [deal, setDeal] = useState('');
  const [activeImg, setActiveImg] = useState(0);

  const handleFetch = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setError('Введите ссылку'); return; }
    setError('');
    setLoading(true);
    setPreview(null);
    setActiveImg(0);
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
      const listing = data.listing as ImportedListing;
      setPreview(listing);
      if (listing.category) setCategory(listing.category);
      if (listing.deal) setDeal(listing.deal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!preview) return;
    onImport({
      ...preview,
      category: category || preview.category || 'office',
      deal: deal || preview.deal || 'sale',
    });
    onClose();
  };

  const srcInfo = preview?.source ? SOURCE_LOGOS[preview.source] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <div className="font-display font-700 text-base flex items-center gap-2">
              <Icon name="Link" size={17} className="text-brand-blue" />
              Импорт по ссылке
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Поддерживаются: АРР, Аякс, Этажи, ЦИАН, Авито и другие сайты
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">

          {/* Подсказки сайтов */}
          {!preview && !loading && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_SITES.map(s => (
                <span
                  key={s.name}
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    s.reliable
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-orange-50 text-orange-700 border border-orange-200'
                  }`}
                  title={s.reliable ? 'Поддерживается полностью' : 'Может блокировать парсинг'}
                >
                  {s.reliable ? '✓' : '~'} {s.name}
                </span>
              ))}
            </div>
          )}

          {/* URL input */}
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              placeholder="https://krasnodar.arrpro.ru/katalog/..."
              value={url}
              onChange={e => { setUrl(e.target.value); setError(''); setPreview(null); }}
              onKeyDown={e => e.key === 'Enter' && handleFetch()}
              disabled={loading}
            />
            <button
              onClick={handleFetch}
              disabled={loading || !url.trim()}
              className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50 shrink-0"
            >
              {loading
                ? <><Icon name="Loader2" size={15} className="animate-spin" />Загрузка...</>
                : <><Icon name="Search" size={15} />Загрузить</>
              }
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5 border border-red-100">
              <Icon name="AlertCircle" size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="space-y-3">
              {/* Источник + предупреждение */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {srcInfo && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${srcInfo.color}`}>
                      {srcInfo.label}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground font-medium">Предпросмотр</span>
                </div>
                {preview.warning && (
                  <span className="text-[10px] text-orange-600 flex items-center gap-1">
                    <Icon name="AlertTriangle" size={11} />
                    {preview.warning.split('.')[0]}
                  </span>
                )}
              </div>

              <div className="border border-border rounded-xl overflow-hidden">
                {/* Фото галерея */}
                {preview.images.length > 0 && (
                  <div className="relative bg-muted/30">
                    <img
                      src={preview.images[activeImg] || preview.images[0]}
                      alt=""
                      className="w-full h-44 object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {preview.images.length > 1 && (
                      <>
                        <button
                          onClick={() => setActiveImg(i => Math.max(0, i - 1))}
                          disabled={activeImg === 0}
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center disabled:opacity-30 hover:bg-black/60 transition"
                        >
                          <Icon name="ChevronLeft" size={14} className="text-white" />
                        </button>
                        <button
                          onClick={() => setActiveImg(i => Math.min(preview.images.length - 1, i + 1))}
                          disabled={activeImg === preview.images.length - 1}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center disabled:opacity-30 hover:bg-black/60 transition"
                        >
                          <Icon name="ChevronRight" size={14} className="text-white" />
                        </button>
                        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                          {activeImg + 1}/{preview.images.length}
                        </div>
                      </>
                    )}
                    {/* Миниатюры */}
                    {preview.images.length > 1 && (
                      <div className="flex gap-1.5 p-2 overflow-x-auto">
                        {preview.images.slice(0, 8).map((img, i) => (
                          <button
                            key={i}
                            onClick={() => setActiveImg(i)}
                            className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition ${
                              activeImg === i ? 'border-brand-blue' : 'border-transparent opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={img} alt="" className="w-full h-full object-cover"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="p-4 space-y-3">
                  {/* Заголовок и адрес */}
                  <div>
                    <div className="font-display font-700 text-sm leading-snug">{preview.title || '—'}</div>
                    {(preview.address || preview.district || preview.city) && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Icon name="MapPin" size={11} />
                        {[preview.address, preview.district, preview.city].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Основные параметры */}
                  <div className="grid grid-cols-3 gap-2">
                    {preview.price > 0 && (
                      <div className="bg-muted/40 rounded-lg px-2.5 py-2">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Цена</div>
                        <div className="font-700 text-sm leading-tight">{preview.price.toLocaleString('ru')} ₽</div>
                      </div>
                    )}
                    {preview.area > 0 && (
                      <div className="bg-muted/40 rounded-lg px-2.5 py-2">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Площадь</div>
                        <div className="font-700 text-sm leading-tight">{preview.area} м²</div>
                      </div>
                    )}
                    {preview.ceiling_height && (
                      <div className="bg-muted/40 rounded-lg px-2.5 py-2">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Потолок</div>
                        <div className="font-700 text-sm leading-tight">{preview.ceiling_height} м</div>
                      </div>
                    )}
                    {(preview.floor || preview.total_floors) && (
                      <div className="bg-muted/40 rounded-lg px-2.5 py-2">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Этаж</div>
                        <div className="font-700 text-sm leading-tight">
                          {preview.floor ?? '—'}{preview.total_floors ? ` из ${preview.total_floors}` : ''}
                        </div>
                      </div>
                    )}
                    {preview.electricity_kw && (
                      <div className="bg-muted/40 rounded-lg px-2.5 py-2">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Электро</div>
                        <div className="font-700 text-sm leading-tight">{preview.electricity_kw} кВт</div>
                      </div>
                    )}
                    {preview.condition && COND_LABELS[preview.condition] && (
                      <div className="bg-muted/40 rounded-lg px-2.5 py-2">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Состояние</div>
                        <div className="font-700 text-sm leading-tight">{COND_LABELS[preview.condition]}</div>
                      </div>
                    )}
                  </div>

                  {/* Коммуникации и парковка */}
                  {(preview.utilities || preview.parking) && (
                    <div className="flex flex-wrap gap-1.5">
                      {preview.utilities && preview.utilities.split(',').map(u => (
                        <span key={u} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-0.5">
                          {u.trim()}
                        </span>
                      ))}
                      {preview.parking && PARKING_LABELS[preview.parking] && (
                        <span className="text-[10px] bg-slate-50 text-slate-700 border border-slate-200 rounded-full px-2 py-0.5">
                          🅿️ {PARKING_LABELS[preview.parking]}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Описание */}
                  {preview.description && (
                    <p className="text-xs text-foreground/70 line-clamp-3 leading-relaxed">
                      {preview.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Категория и сделка — уточняем после загрузки */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Категория</label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                  >
                    {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Тип сделки</label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                    value={deal}
                    onChange={e => setDeal(e.target.value)}
                  >
                    {DEALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                <Icon name="Info" size={12} className="shrink-0" />
                Данные перенесутся в форму — проверьте и отредактируйте перед сохранением
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
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-semibold text-sm border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
