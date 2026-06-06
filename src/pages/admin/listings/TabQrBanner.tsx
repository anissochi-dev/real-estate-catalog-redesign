import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { adminApi, uploadFileEx } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing } from './types';

// ─── types ────────────────────────────────────────────────────────────────────

interface BrokerInfo { id: number; name: string; phone?: string | null; role: string }
interface Props { listing: Listing; siteUrl?: string }
type ElementId = 'deal' | 'phone' | 'qr' | 'logo' | 'photo';
interface Pos { x: number; y: number }
interface BannerElement {
  id: ElementId;
  pos: Pos;
  fontSize?: number;
  imgSize?: number; // для logo/photo/qr
}

// ─── constants ────────────────────────────────────────────────────────────────

const BG_COLORS    = ['#1a56db','#16a34a','#dc2626','#f97316','#7c3aed','#111827','#facc15','#ffffff'];
const TEXT_COLORS  = ['#ffffff','#111827','#facc15','#f97316','#1a56db','#dc2626','#16a34a','#7c3aed'];

type LayoutId = 'h-wide' | 'h-card' | 'v-sticker' | 'v-tall' | 'sq';
interface Layout { id: LayoutId; label: string; icon: string; w: number; h: number; cmW: number; cmH: number }

const LAYOUTS: Layout[] = [
  { id: 'h-wide',    label: 'Широкая полоса', icon: 'RectangleHorizontal', w: 600, h: 180, cmW: 30, cmH: 9 },
  { id: 'h-card',    label: 'Горизонтальная', icon: 'RectangleHorizontal', w: 520, h: 260, cmW: 21, cmH: 10 },
  { id: 'v-sticker', label: 'Стикер',         icon: 'RectangleVertical',   w: 240, h: 320, cmW: 10, cmH: 15 },
  { id: 'v-tall',    label: 'Вертикальный',   icon: 'RectangleVertical',   w: 280, h: 480, cmW: 10, cmH: 20 },
  { id: 'sq',        label: 'Квадратный',     icon: 'Square',              w: 300, h: 300, cmW: 15, cmH: 15 },
];

const DEFAULT_POSITIONS: Record<LayoutId, Record<'deal'|'phone'|'qr', Pos>> = {
  'h-wide':    { deal: { x: 28, y: 25 },  phone: { x: 28, y: 95 },  qr: { x: 472, y: 15 } },
  'h-card':    { deal: { x: 28, y: 28 },  phone: { x: 28, y: 128 }, qr: { x: 386, y: 50 } },
  'v-sticker': { deal: { x: 20, y: 22 },  phone: { x: 20, y: 118 }, qr: { x: 72,  y: 216 } },
  'v-tall':    { deal: { x: 24, y: 30 },  phone: { x: 24, y: 156 }, qr: { x: 88,  y: 344 } },
  'sq':        { deal: { x: 20, y: 24 },  phone: { x: 20, y: 136 }, qr: { x: 168, y: 92 } },
};

const DEFAULT_FONTSIZES: Record<LayoutId, Record<'deal'|'phone', number>> = {
  'h-wide':    { deal: 52, phone: 34 },
  'h-card':    { deal: 60, phone: 32 },
  'v-sticker': { deal: 38, phone: 22 },
  'v-tall':    { deal: 54, phone: 28 },
  'sq':        { deal: 44, phone: 24 },
};

const DEFAULT_QR_SIZES: Record<LayoutId, number> = {
  'h-wide': 104, 'h-card': 112, 'v-sticker': 82, 'v-tall': 90, 'sq': 100,
};

// ─── Banner Canvas ────────────────────────────────────────────────────────────

interface CanvasProps {
  layout: Layout;
  bg: string;
  textColor: string;
  elements: BannerElement[];
  dealText: string;
  phoneText: string;
  qrDataUrl: string;
  logoUrl: string;
  photoUrl: string;
  selected: ElementId | null;
  onSelect: (id: ElementId | null) => void;
  onDragMove: (id: ElementId, pos: Pos) => void;
  bannerRef: React.RefObject<HTMLDivElement>;
  exportMode?: boolean;
  showSize: boolean;
  cmW: number;
  cmH: number;
}

function BannerCanvas({
  layout, bg, textColor, elements, dealText, phoneText,
  qrDataUrl, logoUrl, photoUrl,
  selected, onSelect, onDragMove, bannerRef, exportMode,
  showSize, cmW, cmH,
}: CanvasProps) {
  const dragging = useRef<{ id: ElementId; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const getEl = (id: ElementId) => elements.find(e => e.id === id);

  const onPointerDown = (e: React.PointerEvent, id: ElementId) => {
    if (exportMode) return;
    e.preventDefault(); e.stopPropagation();
    onSelect(id);
    const el = getEl(id);
    if (!el) return;
    dragging.current = { id, startX: e.clientX, startY: e.clientY, origX: el.pos.x, origY: el.pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    const dx = e.clientX - dragging.current.startX;
    const dy = e.clientY - dragging.current.startY;
    const newX = Math.max(0, Math.min(layout.w - 20, dragging.current.origX + dx));
    const newY = Math.max(0, Math.min(layout.h - 20, dragging.current.origY + dy));
    onDragMove(dragging.current.id, { x: newX, y: newY });
  };

  const onPointerUp = () => { dragging.current = null; };

  const selStyle = (id: ElementId): React.CSSProperties =>
    (!exportMode && selected === id)
      ? { outline: '2px dashed rgba(255,255,255,0.8)', outlineOffset: 3, borderRadius: 4 }
      : {};

  const dealEl  = getEl('deal');
  const phoneEl = getEl('phone');
  const qrEl    = getEl('qr');
  const logoEl  = getEl('logo');
  const photoEl = getEl('photo');

  return (
    <div
      ref={bannerRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={e => { if (e.target === e.currentTarget && !exportMode) onSelect(null); }}
      style={{
        position: 'relative', width: layout.w, height: layout.h, background: bg,
        borderRadius: exportMode ? 0 : 16, overflow: 'hidden',
        userSelect: 'none', fontFamily: 'Arial, Helvetica, sans-serif', touchAction: 'none',
      }}
    >
      {/* Фото объекта — рендерится первым (под остальными) */}
      {photoEl && photoUrl && (
        <div
          onPointerDown={e => onPointerDown(e, 'photo')}
          style={{
            position: 'absolute', left: photoEl.pos.x, top: photoEl.pos.y,
            width: photoEl.imgSize ?? 120, height: photoEl.imgSize ?? 120,
            cursor: exportMode ? 'default' : 'grab',
            borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
            ...selStyle('photo'),
          }}
        >
          <img src={photoUrl} alt="фото" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} crossOrigin="anonymous" />
        </div>
      )}

      {/* Deal */}
      {dealEl && (
        <div
          onPointerDown={e => onPointerDown(e, 'deal')}
          style={{
            position: 'absolute', left: dealEl.pos.x, top: dealEl.pos.y,
            fontSize: dealEl.fontSize, fontWeight: 900, color: textColor,
            letterSpacing: 4, lineHeight: 1, cursor: exportMode ? 'default' : 'grab',
            whiteSpace: 'nowrap', padding: 4, ...selStyle('deal'),
          }}
        >{dealText}</div>
      )}

      {/* Phone */}
      {phoneEl && (
        <div
          onPointerDown={e => onPointerDown(e, 'phone')}
          style={{
            position: 'absolute', left: phoneEl.pos.x, top: phoneEl.pos.y,
            fontSize: phoneEl.fontSize, fontWeight: 800, color: textColor,
            letterSpacing: 1, lineHeight: 1, cursor: exportMode ? 'default' : 'grab',
            whiteSpace: 'nowrap', padding: 4, ...selStyle('phone'),
          }}
        >{phoneText || '+7 ─── ─── ────'}</div>
      )}

      {/* QR */}
      {qrEl && (
        <div
          onPointerDown={e => onPointerDown(e, 'qr')}
          style={{
            position: 'absolute', left: qrEl.pos.x, top: qrEl.pos.y,
            width: (qrEl.imgSize ?? 104) + 12, height: (qrEl.imgSize ?? 104) + 12,
            background: 'rgba(255,255,255,0.13)', borderRadius: 10, padding: 6,
            cursor: exportMode ? 'default' : 'grab', ...selStyle('qr'),
          }}
        >
          {qrDataUrl
            ? <img src={qrDataUrl} alt="QR" style={{ width: qrEl.imgSize ?? 104, height: qrEl.imgSize ?? 104, display: 'block' }} />
            : <div style={{ width: qrEl.imgSize ?? 104, height: qrEl.imgSize ?? 104, opacity: 0.25, border: `2px dashed ${textColor}`, borderRadius: 6 }} />
          }
        </div>
      )}

      {/* Логотип */}
      {logoEl && logoUrl && (
        <div
          onPointerDown={e => onPointerDown(e, 'logo')}
          style={{
            position: 'absolute', left: logoEl.pos.x, top: logoEl.pos.y,
            width: logoEl.imgSize ?? 80, height: logoEl.imgSize ?? 80,
            cursor: exportMode ? 'default' : 'grab', ...selStyle('logo'),
          }}
        >
          <img src={logoUrl} alt="лого" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} crossOrigin="anonymous" />
        </div>
      )}

      {/* Размеры */}
      {showSize && (
        <div style={{
          position: 'absolute', bottom: 10, right: 12,
          fontSize: Math.max(10, layout.h * 0.07), fontWeight: 700,
          color: textColor, opacity: 0.55,
          fontFamily: 'Arial, sans-serif', letterSpacing: 0.5, whiteSpace: 'nowrap',
        }}>
          {cmW} см × {cmH} см
        </div>
      )}
    </div>
  );
}

// ─── Colour swatch ────────────────────────────────────────────────────────────

function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-7 h-7 rounded-lg flex-shrink-0 transition-all"
      style={{
        background: color,
        border: `2px solid ${active ? (color === '#ffffff' || color === '#facc15' ? '#666' : color) : 'transparent'}`,
        outline: active ? `2px solid ${color === '#ffffff' || color === '#facc15' ? '#666' : color}` : 'none',
        outlineOffset: 2,
        boxShadow: color === '#ffffff' ? 'inset 0 0 0 1px #ddd' : undefined,
      }}
    />
  );
}

// ─── Image upload button ──────────────────────────────────────────────────────

function ImageUploadBtn({
  label, icon, url, uploading, onFile, onRemove,
}: {
  label: string; icon: string; url: string; uploading: boolean;
  onFile: (f: File) => void; onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {url ? (
        <div className="flex items-center gap-2">
          <img src={url} alt={label} className="w-10 h-10 rounded-lg object-cover border border-border" />
          <div className="text-xs text-muted-foreground">{label} загружен</div>
          <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
            <Icon name="X" size={12} /> Удалить
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border hover:border-brand-blue text-sm text-muted-foreground hover:text-brand-blue transition-all disabled:opacity-50"
        >
          {uploading
            ? <Icon name="Loader2" size={14} className="animate-spin" />
            : <Icon name={icon} size={14} />
          }
          {uploading ? 'Загрузка...' : `Добавить ${label.toLowerCase()}`}
        </button>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TabQrBanner({ listing, siteUrl }: Props) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [broker, setBroker] = useState<BrokerInfo | null>(null);

  const [bgColor, setBgColor] = useState('#1a56db');
  const [textColor, setTextColor] = useState('#ffffff');

  const [layoutId, setLayoutId] = useState<LayoutId>('h-wide');
  const [elements, setElements] = useState<BannerElement[]>([]);

  const [dealText, setDealText] = useState('');
  const [phoneText, setPhoneText] = useState('');

  const [logoUrl, setLogoUrl] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [selected, setSelected] = useState<ElementId | null>(null);
  const [showSize, setShowSize] = useState(true);
  const [cmW, setCmW] = useState('30');
  const [cmH, setCmH] = useState('9');

  const [downloading, setDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpg' | 'pdf'>('png');

  const layout = LAYOUTS.find(l => l.id === layoutId)!;
  const publicUrl = siteUrl && listing.slug
    ? `${siteUrl.replace(/\/$/, '')}/object/${listing.slug}` : null;

  const makeBaseElements = useCallback((lid: LayoutId): BannerElement[] => {
    const pos = DEFAULT_POSITIONS[lid];
    const fs = DEFAULT_FONTSIZES[lid];
    const qrSz = DEFAULT_QR_SIZES[lid];
    return [
      { id: 'deal',  pos: pos.deal,  fontSize: fs.deal },
      { id: 'phone', pos: pos.phone, fontSize: fs.phone },
      { id: 'qr',    pos: pos.qr,    imgSize: qrSz },
    ];
  }, []);

  const initElements = useCallback((lid: LayoutId, prevEls?: BannerElement[]) => {
    const base = makeBaseElements(lid);
    // сохраняем logo/photo если были
    const logo  = prevEls?.find(e => e.id === 'logo');
    const photo = prevEls?.find(e => e.id === 'photo');
    setElements([...base, ...(logo ? [logo] : []), ...(photo ? [photo] : [])]);
    setSelected(null);
  }, [makeBaseElements]);

  useEffect(() => { initElements('h-wide'); }, []); // eslint-disable-line

  const changeLayout = (lid: LayoutId) => {
    setLayoutId(lid);
    initElements(lid, elements);
    const l = LAYOUTS.find(x => x.id === lid)!;
    setCmW(String(l.cmW)); setCmH(String(l.cmH));
  };

  const resetPositions = () => {
    initElements(layoutId, elements);
    const l = layout;
    setCmW(String(l.cmW)); setCmH(String(l.cmH));
  };

  // добавить/убрать логотип как элемент
  const addLogoElement = (url: string) => {
    setLogoUrl(url);
    setElements(prev => {
      const without = prev.filter(e => e.id !== 'logo');
      return [...without, { id: 'logo', pos: { x: 16, y: 16 }, imgSize: 70 }];
    });
  };
  const removeLogoElement = () => {
    setLogoUrl('');
    setElements(prev => prev.filter(e => e.id !== 'logo'));
    if (selected === 'logo') setSelected(null);
  };

  // добавить/убрать фото как элемент
  const addPhotoElement = (url: string) => {
    setPhotoUrl(url);
    setElements(prev => {
      const without = prev.filter(e => e.id !== 'photo');
      return [...without, { id: 'photo', pos: { x: 16, y: layout.h - 136 }, imgSize: 120 }];
    });
  };
  const removePhotoElement = () => {
    setPhotoUrl('');
    setElements(prev => prev.filter(e => e.id !== 'photo'));
    if (selected === 'photo') setSelected(null);
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    try { const r = await uploadFileEx(file, 'logo'); addLogoElement(r.url); }
    catch { alert('Ошибка загрузки логотипа'); }
    finally { setUploadingLogo(false); }
  };

  const uploadPhoto = async (file: File) => {
    setUploadingPhoto(true);
    try { const r = await uploadFileEx(file, 'photos'); addPhotoElement(r.url); }
    catch { alert('Ошибка загрузки фото'); }
    finally { setUploadingPhoto(false); }
  };

  // автоподставить фото объекта
  const useListingPhoto = () => {
    const img = listing.image;
    if (img) addPhotoElement(img);
  };

  useEffect(() => {
    adminApi.listUsers().then(r => {
      const all: BrokerInfo[] = r.users || [];
      const brokerId = (listing as Record<string, unknown>).broker_id as number | null;
      if (brokerId) { const f = all.find(u => u.id === brokerId); if (f) { setBroker(f); return; } }
      const authorId = (listing as Record<string, unknown>).author_id as number | null;
      if (authorId) { const f = all.find(u => u.id === authorId); if (f) setBroker(f); }
    });
  }, [listing]);

  useEffect(() => { setDealText(listing.deal === 'rent' ? 'СДАЮ' : 'ПРОДАЮ'); }, [listing.deal]);
  useEffect(() => {
    const p = broker?.phone || (listing as Record<string, unknown>).owner_phone as string || '';
    setPhoneText(p);
  }, [broker, listing]);

  const generateQr = useCallback(async () => {
    const url = publicUrl || `${window.location.origin}/object/${listing.id}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1, color: { dark: textColor, light: '#00000000' } });
      setQrDataUrl(dataUrl);
    } catch { setQrDataUrl(''); }
  }, [publicUrl, listing.id, textColor]);

  useEffect(() => { generateQr(); }, [generateQr]);

  const updatePos = (id: ElementId, pos: Pos) =>
    setElements(prev => prev.map(e => e.id === id ? { ...e, pos } : e));

  const selectedEl = elements.find(e => e.id === selected);

  const updateSize = (delta: number) => {
    if (!selected) return;
    if (selected === 'deal' || selected === 'phone') {
      setElements(prev => prev.map(e =>
        e.id === selected ? { ...e, fontSize: Math.max(10, Math.min(120, (e.fontSize ?? 32) + delta)) } : e
      ));
    } else {
      setElements(prev => prev.map(e =>
        e.id === selected ? { ...e, imgSize: Math.max(30, Math.min(300, (e.imgSize ?? 80) + delta)) } : e
      ));
    }
  };

  const download = async () => {
    if (!exportRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(exportRef.current, { scale: 3, useCORS: true, backgroundColor: bgColor, logging: false });
      const name = `banner-${listing.id}-${layoutId}`;
      if (downloadFormat === 'pdf') {
        const imgData = canvas.toDataURL('image/png');
        const w = canvas.width / 3; const h = canvas.height / 3;
        const pdf = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'px', format: [w, h] });
        pdf.addImage(imgData, 'PNG', 0, 0, w, h);
        pdf.save(`${name}.pdf`);
      } else {
        const mime = downloadFormat === 'jpg' ? 'image/jpeg' : 'image/png';
        canvas.toBlob(blob => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `${name}.${downloadFormat}`; a.click();
          URL.revokeObjectURL(url);
        }, mime, downloadFormat === 'jpg' ? 0.92 : 1);
      }
    } catch { alert('Ошибка при скачивании'); }
    finally { setDownloading(false); }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl; a.download = `qr-${listing.id}.png`; a.click();
  };

  // ── размеры и ориентир ──────────────────────────────────────────────────────
  const numCmW = Math.max(1, Number(cmW) || 1);
  const numCmH = Math.max(1, Number(cmH) || 1);
  const sqM = ((numCmW * numCmH) / 10000).toFixed(4).replace(/\.?0+$/, '');

  // Визуальный ориентир: пересчитываем пропорцию превью под реальные см
  // базовая ширина контейнера 520px, масштабируем высоту пропорционально см
  const PREVIEW_BASE_W = 520;
  const orientW = PREVIEW_BASE_W;
  const orientH = Math.round(PREVIEW_BASE_W * (numCmH / numCmW));
  const clampedH = Math.min(Math.max(orientH, 80), 500);

  // масштаб баннера в этот ориентир-контейнер
  const previewScale = Math.min(orientW / layout.w, clampedH / layout.h, 1);

  const canvasProps: Omit<CanvasProps, 'bannerRef' | 'exportMode'> = {
    layout, bg: bgColor, textColor, elements, dealText, phoneText,
    qrDataUrl, logoUrl, photoUrl,
    selected, onSelect: setSelected, onDragMove: updatePos,
    showSize, cmW: Number(cmW) || 0, cmH: Number(cmH) || 0,
  };

  if (elements.length === 0) return null;

  const sizeLabel = (el: BannerElement) => {
    if (el.id === 'deal' || el.id === 'phone') return { label: 'шрифт', value: el.fontSize ?? 32 };
    return { label: 'размер', value: el.imgSize ?? 80 };
  };

  const elLabel: Record<ElementId, string> = {
    deal: 'Надпись сделки', phone: 'Телефон', qr: 'QR-код', logo: 'Логотип', photo: 'Фото',
  };

  return (
    <div className="p-6 space-y-5">

      {/* Шаблон */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Шаблон</div>
        <div className="flex flex-wrap gap-2">
          {LAYOUTS.map(l => (
            <button key={l.id} onClick={() => changeLayout(l.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm transition-all ${
                layoutId === l.id ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground hover:border-brand-blue hover:text-foreground'
              }`}
            >
              <Icon name={l.icon} size={13} />
              <span className="font-medium">{l.label}</span>
              <span className="text-xs opacity-50">{l.w}×{l.h}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Цвета */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 border border-border rounded-xl p-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Фон</div>
          <div className="flex flex-wrap gap-1.5">
            {BG_COLORS.map(c => <Swatch key={c} color={c} active={bgColor === c} onClick={() => setBgColor(c)} />)}
          </div>
          <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5">
            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent flex-shrink-0" />
            <span className="text-xs font-mono text-muted-foreground">Свой: {bgColor}</span>
          </div>
        </div>
        <div className="space-y-2 border border-border rounded-xl p-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Текст</div>
          <div className="flex flex-wrap gap-1.5">
            {TEXT_COLORS.map(c => <Swatch key={c} color={c} active={textColor === c} onClick={() => setTextColor(c)} />)}
          </div>
          <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5">
            <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent flex-shrink-0" />
            <span className="text-xs font-mono text-muted-foreground">Свой: {textColor}</span>
          </div>
        </div>
      </div>

      {/* Текст */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Текст сделки</div>
          <input value={dealText} onChange={e => setDealText(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-bold uppercase tracking-widest" maxLength={20} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Телефон</div>
          <input value={phoneText} onChange={e => setPhoneText(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-semibold"
            placeholder="+7 000 000-00-00" maxLength={30} />
        </div>
      </div>

      {/* Логотип и фото */}
      <div className="border border-border rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold">Изображения на баннере</div>
        <div className="space-y-2">
          <ImageUploadBtn label="Логотип" icon="Building2" url={logoUrl} uploading={uploadingLogo}
            onFile={uploadLogo} onRemove={removeLogoElement} />
          <div className="flex items-center gap-2 flex-wrap">
            <ImageUploadBtn label="Фото объекта" icon="ImagePlus" url={photoUrl} uploading={uploadingPhoto}
              onFile={uploadPhoto} onRemove={removePhotoElement} />
            {!photoUrl && listing.image && (
              <button onClick={useListingPhoto}
                className="flex items-center gap-1.5 text-xs text-brand-blue hover:underline"
              >
                <Icon name="ImageIcon" size={12} />
                Использовать фото объекта
              </button>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">После добавления — перетащи изображение в нужное место на баннере</div>
      </div>

      {/* Размеры для печати */}
      <div className="border-2 border-brand-blue/30 bg-brand-blue/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="Ruler" size={15} className="text-brand-blue" />
            <span className="text-sm font-semibold text-brand-blue">Размеры для печати</span>
          </div>
          <button onClick={() => setShowSize(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
              showSize ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground hover:border-brand-blue'
            }`}
          >
            <Icon name={showSize ? 'Eye' : 'EyeOff'} size={12} />
            {showSize ? 'На баннере: вкл' : 'Показать на баннере'}
          </button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Длина (см)</div>
            <input type="number" value={cmW} min={1} max={9999} onChange={e => setCmW(e.target.value)}
              className="w-28 px-3 py-2 border-2 border-border rounded-xl text-sm font-semibold focus:border-brand-blue outline-none" />
          </div>
          <div className="text-lg font-bold text-muted-foreground mt-4">×</div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Высота (см)</div>
            <input type="number" value={cmH} min={1} max={9999} onChange={e => setCmH(e.target.value)}
              className="w-28 px-3 py-2 border-2 border-border rounded-xl text-sm font-semibold focus:border-brand-blue outline-none" />
          </div>
          <div className="mt-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-brand-blue/30 rounded-lg">
              <Icon name="Square" size={13} className="text-brand-blue" />
              <span className="text-sm font-bold text-brand-blue">{sqM} м²</span>
            </div>
            {showSize && (
              <div className="text-xs text-muted-foreground px-1">На баннере: {numCmW} см × {numCmH} см</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-brand-blue/70 bg-brand-blue/5 rounded-lg px-3 py-1.5">
          <Icon name="Info" size={12} />
          Ориентир пропорций в редакторе ниже обновляется автоматически
        </div>
      </div>

      {/* Редактор */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Редактор</div>
          <div className="flex items-center gap-3">
            <button onClick={resetPositions} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="RotateCcw" size={12} />Сбросить позиции
            </button>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon name="Move" size={12} />Перетащи элемент
            </div>
          </div>
        </div>

        {/* Ориентир пропорций — контейнер меняет высоту под реальные см */}
        <div
          className="relative flex justify-center items-center bg-[#e0e0e0] rounded-2xl overflow-hidden transition-all duration-300"
          style={{ width: '100%', height: clampedH + 32, minHeight: 120 }}
        >
          {/* Сетка-ориентир */}
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 19px,#888 19px,#888 20px),repeating-linear-gradient(90deg,transparent,transparent 19px,#888 19px,#888 20px)',
          }} />
          <div style={{
            transform: `scale(${previewScale})`,
            transformOrigin: 'center center',
            width: layout.w * previewScale,
            height: layout.h * previewScale,
          }}>
            <BannerCanvas {...canvasProps} bannerRef={{ current: null }} />
          </div>
          {/* Подпись */}
          <div className="absolute bottom-2 right-3 text-xs text-gray-500 bg-white/70 rounded px-2 py-0.5">
            Ориентир: {numCmW} × {numCmH} см
          </div>
        </div>

        {/* Панель выбранного */}
        {selected && selectedEl && (
          <div className="flex items-center gap-3 bg-muted/50 rounded-xl px-4 py-2.5 text-sm flex-wrap">
            <Icon name={selected === 'qr' ? 'QrCode' : selected === 'deal' ? 'Type' : selected === 'phone' ? 'Phone' : selected === 'logo' ? 'Building2' : 'Image'} size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">{elLabel[selected]}</span>
            <span className="text-muted-foreground">· {sizeLabel(selectedEl).label}</span>
            <button onClick={() => updateSize(-2)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-muted border border-border">
              <Icon name="Minus" size={12} />
            </button>
            <span className="font-bold w-8 text-center">{sizeLabel(selectedEl).value}</span>
            <button onClick={() => updateSize(2)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-muted border border-border">
              <Icon name="Plus" size={12} />
            </button>
            <button onClick={() => setSelected(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">✕ Снять</button>
          </div>
        )}
      </div>

      {/* Скрытый для экспорта */}
      <div style={{ position: 'fixed', left: -9999, top: -9999, pointerEvents: 'none', opacity: 0 }}>
        <BannerCanvas {...canvasProps} selected={null} bannerRef={exportRef} exportMode />
      </div>

      {/* Скачать */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {(['png', 'jpg', 'pdf'] as const).map(fmt => (
            <button key={fmt} onClick={() => setDownloadFormat(fmt)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                downloadFormat === fmt ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground hover:border-brand-blue hover:text-brand-blue'
              }`}
            >{fmt.toUpperCase()}</button>
          ))}
          <button onClick={download} disabled={downloading || !qrDataUrl}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-50 transition ml-auto"
          >
            {downloading
              ? <><Icon name="Loader2" size={15} className="animate-spin" />Подготовка...</>
              : <><Icon name="Download" size={15} />Скачать {downloadFormat.toUpperCase()}</>
            }
          </button>
        </div>
        <button onClick={downloadQr} disabled={!qrDataUrl}
          className="flex items-center gap-1.5 text-sm text-brand-blue hover:underline disabled:opacity-40"
        >
          <Icon name="QrCode" size={14} />
          Скачать QR-код отдельно (PNG)
        </button>
      </div>

    </div>
  );
}