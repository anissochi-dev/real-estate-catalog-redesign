import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing } from './types';

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

// ─── Цветовые пресеты ───────────────────────────────────────────────────────
const COLOR_PRESETS = [
  { bg: '#1a56db', text: '#ffffff', accent: 'rgba(255,255,255,0.15)', label: 'Синий' },
  { bg: '#16a34a', text: '#ffffff', accent: 'rgba(255,255,255,0.15)', label: 'Зелёный' },
  { bg: '#dc2626', text: '#ffffff', accent: 'rgba(255,255,255,0.15)', label: 'Красный' },
  { bg: '#f97316', text: '#ffffff', accent: 'rgba(255,255,255,0.15)', label: 'Оранжевый' },
  { bg: '#7c3aed', text: '#ffffff', accent: 'rgba(255,255,255,0.15)', label: 'Фиолетовый' },
  { bg: '#111827', text: '#ffffff', accent: 'rgba(255,255,255,0.12)', label: 'Чёрный' },
  { bg: '#ffffff', text: '#111827', accent: 'rgba(0,0,0,0.06)',       label: 'Белый' },
  { bg: '#fef9c3', text: '#111827', accent: 'rgba(0,0,0,0.06)',       label: 'Жёлтый' },
];

// ─── Шаблоны макетов ─────────────────────────────────────────────────────────
type LayoutId = 'h-strip' | 'h-card' | 'v-sticker' | 'v-tall' | 'sq-compact';

interface Layout {
  id: LayoutId;
  label: string;
  icon: string;
  desc: string;
  w: number;
  h: number;
}

const LAYOUTS: Layout[] = [
  { id: 'h-strip',   label: 'Горизонтальная полоса', icon: 'RectangleHorizontal', desc: '600×200', w: 600, h: 200 },
  { id: 'h-card',    label: 'Горизонтальная карточка', icon: 'RectangleHorizontal', desc: '520×280', w: 520, h: 280 },
  { id: 'v-sticker', label: 'Вертикальный стикер',   icon: 'RectangleVertical',   desc: '260×360', w: 260, h: 360 },
  { id: 'v-tall',    label: 'Вертикальный баннер',    icon: 'RectangleVertical',   desc: '300×500', w: 300, h: 500 },
  { id: 'sq-compact',label: 'Квадратный',             icon: 'Square',              desc: '320×320', w: 320, h: 320 },
];

// ─── Вспомогательные функции ─────────────────────────────────────────────────
function formatArea(area: number | null | undefined) {
  if (!area) return null;
  return `${area} м²`;
}

function formatPrice(price: number | null | undefined, unit: string) {
  if (!price) return null;
  const p = price.toLocaleString('ru');
  if (unit === 'm2') return `${p} ₽/м²`;
  if (unit === 'sotka') return `${p} ₽/сот.`;
  return `${p} ₽`;
}

// ─── Компонент баннера ────────────────────────────────────────────────────────

interface BannerProps {
  layout: Layout;
  bg: string;
  text: string;
  accent: string;
  dealLabel: string;
  phone: string;
  area: string | null;
  price: string | null;
  address: string;
  qrDataUrl: string;
  bannerRef: React.RefObject<HTMLDivElement>;
}

function BannerHStrip({ bg, text, accent, dealLabel, phone, area, price, address, qrDataUrl, bannerRef, layout }: BannerProps) {
  return (
    <div
      ref={bannerRef}
      style={{ background: bg, color: text, width: layout.w, height: layout.h, fontFamily: 'Arial, sans-serif' }}
      className="flex flex-row items-stretch overflow-hidden rounded-2xl select-none"
    >
      {/* Левая часть — тип сделки */}
      <div style={{ background: accent, minWidth: 160 }} className="flex flex-col items-center justify-center px-6">
        <div style={{ color: text, fontSize: 38, fontWeight: 900, letterSpacing: 4, lineHeight: 1 }}>{dealLabel}</div>
        {area && <div style={{ color: text, fontSize: 14, opacity: 0.8, marginTop: 6 }}>{area}</div>}
      </div>

      {/* Центр — телефон + адрес */}
      <div className="flex flex-col justify-center flex-1 px-8 gap-1">
        <div style={{ color: text, fontSize: 32, fontWeight: 800, letterSpacing: 2, lineHeight: 1 }}>{phone || '──────────'}</div>
        {price && <div style={{ color: text, fontSize: 15, fontWeight: 700, opacity: 0.9, marginTop: 4 }}>{price}</div>}
        {address && <div style={{ color: text, fontSize: 12, opacity: 0.6, marginTop: 2 }} className="truncate">{address}</div>}
        <div style={{ color: text, fontSize: 11, opacity: 0.45, marginTop: 6 }}>Сканируй QR → подробнее об объекте</div>
      </div>

      {/* Правая часть — QR */}
      <div style={{ background: accent, minWidth: 140 }} className="flex flex-col items-center justify-center px-5 gap-2">
        {qrDataUrl
          ? <img src={qrDataUrl} alt="QR" style={{ width: 100, height: 100 }} />
          : <div style={{ width: 100, height: 100, opacity: 0.3, border: `2px dashed ${text}`, borderRadius: 8 }} className="flex items-center justify-center"><span style={{ fontSize: 10, color: text }}>QR</span></div>
        }
        <div style={{ color: text, fontSize: 10, opacity: 0.5 }}>Сканировать</div>
      </div>
    </div>
  );
}

function BannerHCard({ bg, text, accent, dealLabel, phone, area, price, address, qrDataUrl, bannerRef, layout }: BannerProps) {
  return (
    <div
      ref={bannerRef}
      style={{ background: bg, color: text, width: layout.w, height: layout.h, fontFamily: 'Arial, sans-serif' }}
      className="flex flex-row items-stretch overflow-hidden rounded-2xl select-none"
    >
      {/* Основной контент */}
      <div className="flex flex-col justify-between flex-1 p-8">
        <div style={{ color: text, fontSize: 52, fontWeight: 900, letterSpacing: 5, lineHeight: 1 }}>{dealLabel}</div>
        <div>
          <div style={{ color: text, fontSize: 30, fontWeight: 800, letterSpacing: 2, lineHeight: 1.1 }}>{phone || '──────────'}</div>
          {price && <div style={{ color: text, fontSize: 16, fontWeight: 700, opacity: 0.9, marginTop: 8 }}>{price}</div>}
          {area && <div style={{ color: text, fontSize: 14, opacity: 0.75, marginTop: 3 }}>{area}</div>}
          {address && <div style={{ color: text, fontSize: 12, opacity: 0.55, marginTop: 4 }} className="truncate max-w-xs">{address}</div>}
        </div>
      </div>

      {/* Правая панель QR */}
      <div style={{ background: accent, width: 160 }} className="flex flex-col items-center justify-center gap-3">
        {qrDataUrl
          ? <img src={qrDataUrl} alt="QR" style={{ width: 110, height: 110 }} />
          : <div style={{ width: 110, height: 110, opacity: 0.3, border: `2px dashed ${text}`, borderRadius: 8 }} />
        }
        <div style={{ color: text, fontSize: 11, opacity: 0.5, textAlign: 'center', padding: '0 12px' }}>Сканируй для просмотра объекта</div>
      </div>
    </div>
  );
}

function BannerVSticker({ bg, text, accent, dealLabel, phone, area, price, address, qrDataUrl, bannerRef, layout }: BannerProps) {
  return (
    <div
      ref={bannerRef}
      style={{ background: bg, color: text, width: layout.w, height: layout.h, fontFamily: 'Arial, sans-serif' }}
      className="flex flex-col items-center overflow-hidden rounded-2xl select-none"
    >
      {/* Шапка */}
      <div style={{ background: accent, width: '100%', paddingTop: 20, paddingBottom: 16 }} className="flex flex-col items-center gap-1">
        <div style={{ color: text, fontSize: 42, fontWeight: 900, letterSpacing: 5, lineHeight: 1 }}>{dealLabel}</div>
        {area && <div style={{ color: text, fontSize: 13, opacity: 0.75 }}>{area}</div>}
      </div>

      {/* Телефон */}
      <div className="flex flex-col items-center justify-center flex-1 px-5 gap-1">
        <div style={{ color: text, fontSize: 26, fontWeight: 800, letterSpacing: 1, textAlign: 'center', lineHeight: 1.2 }}>{phone || '──────────'}</div>
        {price && <div style={{ color: text, fontSize: 14, fontWeight: 600, opacity: 0.85, marginTop: 4 }}>{price}</div>}
        {address && <div style={{ color: text, fontSize: 11, opacity: 0.5, textAlign: 'center', marginTop: 3 }}>{address}</div>}
      </div>

      {/* QR */}
      <div style={{ background: accent, width: '100%', padding: '14px 0', gap: 6 }} className="flex flex-col items-center">
        {qrDataUrl
          ? <img src={qrDataUrl} alt="QR" style={{ width: 80, height: 80 }} />
          : <div style={{ width: 80, height: 80, opacity: 0.3, border: `2px dashed ${text}`, borderRadius: 8 }} />
        }
        <div style={{ color: text, fontSize: 10, opacity: 0.45 }}>Сканируй → подробнее</div>
      </div>
    </div>
  );
}

function BannerVTall({ bg, text, accent, dealLabel, phone, area, price, address, qrDataUrl, bannerRef, layout }: BannerProps) {
  return (
    <div
      ref={bannerRef}
      style={{ background: bg, color: text, width: layout.w, height: layout.h, fontFamily: 'Arial, sans-serif' }}
      className="flex flex-col overflow-hidden rounded-2xl select-none"
    >
      {/* Тип сделки — крупно */}
      <div style={{ background: accent, padding: '28px 28px 20px' }}>
        <div style={{ color: text, fontSize: 56, fontWeight: 900, letterSpacing: 6, lineHeight: 1 }}>{dealLabel}</div>
      </div>

      {/* Основная инфо */}
      <div className="flex flex-col flex-1 justify-center px-7 gap-2">
        <div style={{ color: text, fontSize: 28, fontWeight: 800, letterSpacing: 1, lineHeight: 1.2 }}>{phone || '──────────'}</div>
        {price && <div style={{ color: text, fontSize: 16, fontWeight: 700, opacity: 0.9 }}>{price}</div>}
        {area && <div style={{ color: text, fontSize: 14, opacity: 0.75 }}>{area}</div>}
        {address && <div style={{ color: text, fontSize: 12, opacity: 0.5, marginTop: 4 }}>{address}</div>}
      </div>

      {/* Разделитель */}
      <div style={{ background: accent, height: 1, margin: '0 24px' }} />

      {/* QR + подпись */}
      <div className="flex flex-row items-center gap-5 px-7 py-5">
        {qrDataUrl
          ? <img src={qrDataUrl} alt="QR" style={{ width: 80, height: 80, flexShrink: 0 }} />
          : <div style={{ width: 80, height: 80, opacity: 0.3, border: `2px dashed ${text}`, borderRadius: 8, flexShrink: 0 }} />
        }
        <div style={{ color: text, fontSize: 12, opacity: 0.55, lineHeight: 1.5 }}>Сканируй QR-код и посмотри полную информацию об объекте</div>
      </div>
    </div>
  );
}

function BannerSqCompact({ bg, text, accent, dealLabel, phone, area, price, address, qrDataUrl, bannerRef, layout }: BannerProps) {
  return (
    <div
      ref={bannerRef}
      style={{ background: bg, color: text, width: layout.w, height: layout.h, fontFamily: 'Arial, sans-serif' }}
      className="flex flex-col overflow-hidden rounded-2xl select-none"
    >
      {/* Верх */}
      <div className="flex flex-row items-center flex-1 px-7 gap-4">
        <div className="flex flex-col flex-1 gap-1">
          <div style={{ color: text, fontSize: 46, fontWeight: 900, letterSpacing: 4, lineHeight: 1 }}>{dealLabel}</div>
          <div style={{ color: text, fontSize: 22, fontWeight: 800, letterSpacing: 1, marginTop: 8, lineHeight: 1.2 }}>{phone || '──────────'}</div>
          {price && <div style={{ color: text, fontSize: 14, fontWeight: 600, opacity: 0.85, marginTop: 4 }}>{price}</div>}
          {area && <div style={{ color: text, fontSize: 13, opacity: 0.7 }}>{area}</div>}
        </div>
        {/* QR сбоку */}
        <div style={{ background: accent, borderRadius: 12, padding: 8, flexShrink: 0 }} className="flex flex-col items-center gap-1">
          {qrDataUrl
            ? <img src={qrDataUrl} alt="QR" style={{ width: 82, height: 82 }} />
            : <div style={{ width: 82, height: 82, opacity: 0.3, border: `2px dashed ${text}`, borderRadius: 8 }} />
          }
          <div style={{ color: text, fontSize: 9, opacity: 0.45 }}>Сканировать</div>
        </div>
      </div>

      {/* Низ — адрес */}
      {address && (
        <div style={{ background: accent, padding: '10px 24px' }}>
          <div style={{ color: text, fontSize: 11, opacity: 0.6 }} className="truncate">{address}</div>
        </div>
      )}
    </div>
  );
}

// ─── Главный компонент ────────────────────────────────────────────────────────
export function TabQrBanner({ listing, siteUrl }: Props) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [broker, setBroker] = useState<BrokerInfo | null>(null);
  const [colorIdx, setColorIdx] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpg' | 'pdf'>('png');
  const [layoutId, setLayoutId] = useState<LayoutId>('h-card');

  const color = COLOR_PRESETS[colorIdx];
  const layout = LAYOUTS.find(l => l.id === layoutId)!;

  const publicUrl = siteUrl && listing.slug
    ? `${siteUrl.replace(/\/$/, '')}/object/${listing.slug}`
    : null;

  const dealLabel = listing.deal === 'rent' ? 'СДАЮ' : 'ПРОДАЮ';
  const phone = broker?.phone || (listing as Record<string, unknown>).owner_phone as string || '';
  const area = formatArea(listing.area);
  const price = formatPrice(listing.price, listing.price_unit);
  const address = [listing.address, listing.district].filter(Boolean).join(', ');

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
      const dark = color.text === '#ffffff' ? '#ffffff' : '#111827';
      const dataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 1,
        color: { dark, light: '#00000000' },
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl('');
    }
  }, [publicUrl, listing.id, color.text]);

  useEffect(() => { generateQr(); }, [generateQr]);

  const download = async () => {
    if (!bannerRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(bannerRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: color.bg,
        logging: false,
      });
      const name = `banner-${listing.id}-${layoutId}`;
      if (downloadFormat === 'pdf') {
        const imgData = canvas.toDataURL('image/png');
        const w = canvas.width / 3;
        const h = canvas.height / 3;
        const orientation = w > h ? 'landscape' : 'portrait';
        const pdf = new jsPDF({ orientation, unit: 'px', format: [w, h] });
        pdf.addImage(imgData, 'PNG', 0, 0, w, h);
        pdf.save(`${name}.pdf`);
      } else {
        const mimeType = downloadFormat === 'jpg' ? 'image/jpeg' : 'image/png';
        canvas.toBlob(blob => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${name}.${downloadFormat}`;
          a.click();
          URL.revokeObjectURL(url);
        }, mimeType, downloadFormat === 'jpg' ? 0.92 : 1);
      }
    } catch {
      alert('Ошибка при скачивании');
    } finally {
      setDownloading(false);
    }
  };

  const bannerProps: BannerProps = {
    layout,
    bg: color.bg,
    text: color.text,
    accent: color.accent,
    dealLabel,
    phone,
    area,
    price,
    address,
    qrDataUrl,
    bannerRef,
  };

  // масштаб для превью
  const maxW = 560;
  const maxH = 400;
  const scale = Math.min(maxW / layout.w, maxH / layout.h, 1);

  return (
    <div className="p-6 space-y-6">

      {/* Шаблон */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Шаблон баннера</div>
        <div className="flex flex-wrap gap-2">
          {LAYOUTS.map(l => (
            <button
              key={l.id}
              onClick={() => setLayoutId(l.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                layoutId === l.id
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : 'border-border text-muted-foreground hover:border-brand-blue hover:text-foreground'
              }`}
            >
              <Icon name={l.icon} size={14} />
              <span className="font-medium">{l.label}</span>
              <span className="text-xs opacity-60">{l.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Цвет */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Цвет</div>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((p, i) => (
            <button
              key={p.bg}
              onClick={() => setColorIdx(i)}
              title={p.label}
              className="w-8 h-8 rounded-lg transition-all"
              style={{
                background: p.bg,
                border: `2px solid ${colorIdx === i ? p.text : 'transparent'}`,
                outline: colorIdx === i ? `2px solid ${p.bg === '#ffffff' ? '#999' : p.bg}` : 'none',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

      {/* Данные */}
      <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <div className="flex gap-1.5"><span className="text-muted-foreground">Сделка:</span><span className="font-semibold">{dealLabel}</span></div>
        <div className="flex gap-1.5"><span className="text-muted-foreground">Телефон:</span><span className="font-semibold">{phone || <span className="text-amber-600">не указан</span>}</span></div>
        {area && <div className="flex gap-1.5"><span className="text-muted-foreground">Площадь:</span><span>{area}</span></div>}
        {price && <div className="flex gap-1.5"><span className="text-muted-foreground">Цена:</span><span>{price}</span></div>}
      </div>
      {!phone && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Телефон не указан. Добавьте номер в профиле брокера или владельца.
        </div>
      )}

      {/* Превью */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Превью</div>
        <div className="flex justify-center items-center bg-muted/30 rounded-2xl py-8 overflow-hidden min-h-[200px]">
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'center center', width: layout.w * scale, height: layout.h * scale }}>
            {layoutId === 'h-strip'    && <BannerHStrip    {...bannerProps} />}
            {layoutId === 'h-card'     && <BannerHCard     {...bannerProps} />}
            {layoutId === 'v-sticker'  && <BannerVSticker  {...bannerProps} />}
            {layoutId === 'v-tall'     && <BannerVTall     {...bannerProps} />}
            {layoutId === 'sq-compact' && <BannerSqCompact {...bannerProps} />}
          </div>
        </div>
      </div>

      {/* Скачать */}
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
            ? <><Icon name="Loader2" size={15} className="animate-spin" />Подготовка...</>
            : <><Icon name="Download" size={15} />Скачать {downloadFormat.toUpperCase()}</>
          }
        </button>
      </div>

    </div>
  );
}
