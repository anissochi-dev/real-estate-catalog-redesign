import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing, DEALS } from './types';

interface BrokerInfo {
  id: number;
  name: string;
  phone?: string | null;
  role: string;
}

interface Props {
  listing: Listing;
  siteUrl?: string;
}

const PRESETS = [
  { bg: '#1a56db', text: '#ffffff', label: 'Синий' },
  { bg: '#16a34a', text: '#ffffff', label: 'Зелёный' },
  { bg: '#dc2626', text: '#ffffff', label: 'Красный' },
  { bg: '#f97316', text: '#ffffff', label: 'Оранжевый' },
  { bg: '#7c3aed', text: '#ffffff', label: 'Фиолетовый' },
  { bg: '#111827', text: '#ffffff', label: 'Чёрный' },
  { bg: '#ffffff', text: '#111827', label: 'Белый' },
  { bg: '#fef9c3', text: '#111827', label: 'Жёлтый' },
];

export function TabQrBanner({ listing, siteUrl }: Props) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [broker, setBroker] = useState<BrokerInfo | null>(null);
  const [bgColor, setBgColor] = useState('#1a56db');
  const [textColor, setTextColor] = useState('#ffffff');
  const [downloading, setDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpg' | 'pdf'>('png');

  const publicUrl = siteUrl && listing.slug
    ? `${siteUrl.replace(/\/$/, '')}/object/${listing.slug}`
    : null;

  const dealLabel = listing.deal === 'rent' ? 'СДАЮ' : 'ПРОДАЮ';
  const phone = broker?.phone || (listing as Record<string, unknown>).owner_phone as string || '';

  useEffect(() => {
    adminApi.listUsers().then(r => {
      const all: BrokerInfo[] = r.users || [];
      const brokerId = (listing as Record<string, unknown>).broker_id as number | null;
      if (brokerId) {
        const found = all.find(u => u.id === brokerId);
        if (found) { setBroker(found); return; }
      }
      const authorId = (listing as Record<string, unknown>).author_id as number | null;
      if (authorId) {
        const found = all.find(u => u.id === authorId);
        if (found) setBroker(found);
      }
    });
  }, [listing]);

  const generateQr = useCallback(async () => {
    const url = publicUrl || `${window.location.origin}/object/${listing.id}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 1,
        color: { dark: textColor === '#ffffff' ? '#ffffff' : '#111827', light: '#00000000' },
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl('');
    }
  }, [publicUrl, listing.id, textColor]);

  useEffect(() => { generateQr(); }, [generateQr]);

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setBgColor(preset.bg);
    setTextColor(preset.text);
  };

  const download = async () => {
    if (!bannerRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(bannerRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: bgColor,
        logging: false,
      });

      const name = `banner-${listing.id}`;

      if (downloadFormat === 'pdf') {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width / 3, canvas.height / 3] });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 3, canvas.height / 3);
        pdf.save(`${name}.pdf`);
      } else {
        const mimeType = downloadFormat === 'jpg' ? 'image/jpeg' : 'image/png';
        const quality = downloadFormat === 'jpg' ? 0.92 : 1;
        canvas.toBlob(blob => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${name}.${downloadFormat}`;
          a.click();
          URL.revokeObjectURL(url);
        }, mimeType, quality);
      }
    } catch {
      alert('Ошибка при скачивании баннера');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">

      {/* Настройки */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Цвет фона */}
        <div className="space-y-3">
          <div className="text-sm font-semibold">Цвет баннера</div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.bg}
                onClick={() => applyPreset(p)}
                title={p.label}
                className="w-8 h-8 rounded-lg border-2 transition-all"
                style={{
                  background: p.bg,
                  borderColor: bgColor === p.bg ? textColor === '#ffffff' ? '#ffffff' : '#111827' : 'transparent',
                  outline: bgColor === p.bg ? `2px solid ${p.text === '#ffffff' ? '#1a56db' : '#666'}` : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
          <div className="flex gap-3 items-center">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Фон</div>
              <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5">
                <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
                <span className="text-xs font-mono text-muted-foreground">{bgColor}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Текст</div>
              <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5">
                <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
                <span className="text-xs font-mono text-muted-foreground">{textColor}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Инфо */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">Данные на баннере</div>
          <div className="space-y-1.5 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Тип сделки:</span>
              <span className="font-semibold">{dealLabel}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Телефон:</span>
              <span className="font-semibold">{phone || <span className="text-amber-600">не указан</span>}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Брокер:</span>
              <span>{broker?.name || 'не назначен'}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">QR ссылка:</span>
              <span className="text-xs text-muted-foreground truncate max-w-[180px]">{publicUrl || '—'}</span>
            </div>
          </div>
          {!phone && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
              Телефон не указан. Добавьте номер в профиле брокера.
            </div>
          )}
        </div>
      </div>

      {/* Превью баннера */}
      <div className="space-y-3">
        <div className="text-sm font-semibold">Превью баннера</div>
        <div className="flex justify-center">
          <div
            ref={bannerRef}
            style={{ background: bgColor, color: textColor }}
            className="w-64 rounded-2xl p-6 flex flex-col items-center gap-4 shadow-xl select-none"
          >
            {/* Тип сделки */}
            <div style={{ color: textColor }} className="text-4xl font-black tracking-widest uppercase">
              {dealLabel}
            </div>

            {/* QR код */}
            <div className="rounded-xl overflow-hidden p-2" style={{ background: 'rgba(255,255,255,0.15)' }}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR" className="w-36 h-36" />
              ) : (
                <div className="w-36 h-36 flex items-center justify-center">
                  <Icon name="Loader2" size={24} className="animate-spin opacity-50" />
                </div>
              )}
            </div>

            {/* Телефон */}
            <div style={{ color: textColor }} className="text-xl font-bold tracking-wider text-center">
              {phone || '+7 ─── ─── ────'}
            </div>

            {/* Подпись */}
            <div style={{ color: textColor, opacity: 0.7 }} className="text-xs text-center">
              Сканируй QR-код для просмотра объекта
            </div>
          </div>
        </div>
      </div>

      {/* Скачать */}
      <div className="space-y-3">
        <div className="text-sm font-semibold">Скачать баннер</div>
        <div className="flex flex-wrap gap-2 items-center">
          {(['png', 'jpg', 'pdf'] as const).map(fmt => (
            <button
              key={fmt}
              onClick={() => setDownloadFormat(fmt)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                downloadFormat === fmt
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : 'border-border text-muted-foreground hover:border-brand-blue hover:text-brand-blue'
              }`}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
          <button
            onClick={download}
            disabled={downloading || !qrDataUrl}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-50 transition ml-auto"
          >
            {downloading
              ? <><Icon name="Loader2" size={15} className="animate-spin" /> Подготовка...</>
              : <><Icon name="Download" size={15} /> Скачать {downloadFormat.toUpperCase()}</>
            }
          </button>
        </div>
      </div>

    </div>
  );
}
