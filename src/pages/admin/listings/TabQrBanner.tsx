import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing } from './types';

// ─── types ────────────────────────────────────────────────────────────────────

interface BrokerInfo { id: number; name: string; phone?: string | null; role: string }
interface Props { listing: Listing; siteUrl?: string }
type ElementId = 'deal' | 'phone' | 'qr';
interface Pos { x: number; y: number }
interface BannerElement { id: ElementId; pos: Pos; fontSize?: number }

// ─── constants ────────────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  { bg: '#1a56db', text: '#ffffff', qrDark: '#ffffff', label: 'Синий' },
  { bg: '#16a34a', text: '#ffffff', qrDark: '#ffffff', label: 'Зелёный' },
  { bg: '#dc2626', text: '#ffffff', qrDark: '#ffffff', label: 'Красный' },
  { bg: '#f97316', text: '#ffffff', qrDark: '#ffffff', label: 'Оранжевый' },
  { bg: '#7c3aed', text: '#ffffff', qrDark: '#ffffff', label: 'Фиолетовый' },
  { bg: '#111827', text: '#ffffff', qrDark: '#ffffff', label: 'Чёрный' },
  { bg: '#facc15', text: '#111827', qrDark: '#111827', label: 'Жёлтый' },
  { bg: '#ffffff', text: '#111827', qrDark: '#111827', label: 'Белый' },
];

type LayoutId = 'h-wide' | 'h-card' | 'v-sticker' | 'v-tall' | 'sq';
interface Layout { id: LayoutId; label: string; icon: string; w: number; h: number; cmW: number; cmH: number }

const LAYOUTS: Layout[] = [
  { id: 'h-wide',    label: 'Широкая полоса', icon: 'RectangleHorizontal', w: 600, h: 180, cmW: 30, cmH: 9 },
  { id: 'h-card',    label: 'Горизонтальная', icon: 'RectangleHorizontal', w: 520, h: 260, cmW: 21, cmH: 10 },
  { id: 'v-sticker', label: 'Стикер',         icon: 'RectangleVertical',   w: 240, h: 320, cmW: 10, cmH: 15 },
  { id: 'v-tall',    label: 'Вертикальный',   icon: 'RectangleVertical',   w: 280, h: 480, cmW: 10, cmH: 20 },
  { id: 'sq',        label: 'Квадратный',     icon: 'Square',              w: 300, h: 300, cmW: 15, cmH: 15 },
];

const DEFAULT_POSITIONS: Record<LayoutId, Record<ElementId, Pos>> = {
  'h-wide':    { deal: { x: 28, y: 28 },   phone: { x: 28, y: 98 },  qr: { x: 476, y: 20 } },
  'h-card':    { deal: { x: 28, y: 28 },   phone: { x: 28, y: 128 }, qr: { x: 386, y: 50 } },
  'v-sticker': { deal: { x: 20, y: 22 },   phone: { x: 20, y: 118 }, qr: { x: 72,  y: 216 } },
  'v-tall':    { deal: { x: 24, y: 30 },   phone: { x: 24, y: 156 }, qr: { x: 88,  y: 344 } },
  'sq':        { deal: { x: 20, y: 24 },   phone: { x: 20, y: 136 }, qr: { x: 168, y: 92 } },
};

const DEFAULT_FONTSIZES: Record<LayoutId, Record<'deal' | 'phone', number>> = {
  'h-wide':    { deal: 52, phone: 34 },
  'h-card':    { deal: 60, phone: 32 },
  'v-sticker': { deal: 38, phone: 22 },
  'v-tall':    { deal: 54, phone: 28 },
  'sq':        { deal: 44, phone: 24 },
};

const QR_SIZES: Record<LayoutId, number> = {
  'h-wide': 100, 'h-card': 110, 'v-sticker': 80, 'v-tall': 88, 'sq': 98,
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
  qrSize: number;
  selected: ElementId | null;
  onSelect: (id: ElementId | null) => void;
  onDragMove: (id: ElementId, pos: Pos) => void;
  bannerRef: React.RefObject<HTMLDivElement>;
  exportMode?: boolean;
  showSize?: boolean;
  cmW?: number;
  cmH?: number;
}

function BannerCanvas({
  layout, bg, textColor, elements, dealText, phoneText,
  qrDataUrl, qrSize, selected, onSelect, onDragMove, bannerRef, exportMode,
  showSize, cmW, cmH,
}: CanvasProps) {
  const dragging = useRef<{ id: ElementId; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const getEl = (id: ElementId) => elements.find(e => e.id === id)!;

  const onPointerDown = (e: React.PointerEvent, id: ElementId) => {
    if (exportMode) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(id);
    const el = getEl(id);
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
      ? { outline: '2px dashed rgba(255,255,255,0.7)', outlineOffset: 4, borderRadius: 4 }
      : {};

  return (
    <div
      ref={bannerRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={e => { if (e.target === e.currentTarget && !exportMode) onSelect(null); }}
      style={{
        position: 'relative',
        width: layout.w,
        height: layout.h,
        background: bg,
        borderRadius: exportMode ? 0 : 16,
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: 'Arial, Helvetica, sans-serif',
        touchAction: 'none',
      }}
    >
      {/* Deal */}
      <div
        onPointerDown={e => onPointerDown(e, 'deal')}
        style={{
          position: 'absolute', left: getEl('deal').pos.x, top: getEl('deal').pos.y,
          fontSize: getEl('deal').fontSize, fontWeight: 900, color: textColor,
          letterSpacing: 4, lineHeight: 1, cursor: exportMode ? 'default' : 'grab',
          whiteSpace: 'nowrap', padding: 4, ...selStyle('deal'),
        }}
      >
        {dealText}
      </div>

      {/* Phone */}
      <div
        onPointerDown={e => onPointerDown(e, 'phone')}
        style={{
          position: 'absolute', left: getEl('phone').pos.x, top: getEl('phone').pos.y,
          fontSize: getEl('phone').fontSize, fontWeight: 800, color: textColor,
          letterSpacing: 1, lineHeight: 1, cursor: exportMode ? 'default' : 'grab',
          whiteSpace: 'nowrap', padding: 4, ...selStyle('phone'),
        }}
      >
        {phoneText || '+7 ─── ─── ────'}
      </div>

      {/* QR */}
      <div
        onPointerDown={e => onPointerDown(e, 'qr')}
        style={{
          position: 'absolute', left: getEl('qr').pos.x, top: getEl('qr').pos.y,
          width: qrSize + 12, height: qrSize + 12,
          background: 'rgba(255,255,255,0.13)', borderRadius: 10, padding: 6,
          cursor: exportMode ? 'default' : 'grab', ...selStyle('qr'),
        }}
      >
        {qrDataUrl
          ? <img src={qrDataUrl} alt="QR" style={{ width: qrSize, height: qrSize, display: 'block' }} />
          : <div style={{ width: qrSize, height: qrSize, opacity: 0.25, border: `2px dashed ${textColor}`, borderRadius: 6 }} />
        }
      </div>

      {/* Размеры в см */}
      {showSize && cmW && cmH && (
        <div style={{
          position: 'absolute', bottom: 8, right: 10,
          fontSize: 11, color: textColor, opacity: 0.45,
          fontFamily: 'Arial, sans-serif', letterSpacing: 0.5,
        }}>
          {cmW} × {cmH} см
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TabQrBanner({ listing, siteUrl }: Props) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [broker, setBroker] = useState<BrokerInfo | null>(null);
  const [colorIdx, setColorIdx] = useState(0);
  const [customBg, setCustomBg] = useState('');
  const [customText, setCustomText] = useState('');
  const [layoutId, setLayoutId] = useState<LayoutId>('h-card');
  const [downloading, setDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpg' | 'pdf'>('png');
  const [selected, setSelected] = useState<ElementId | null>(null);
  const [elements, setElements] = useState<BannerElement[]>([]);
  const [dealText, setDealText] = useState('');
  const [phoneText, setPhoneText] = useState('');
  const [showSize, setShowSize] = useState(false);
  const [customCmW, setCustomCmW] = useState('');
  const [customCmH, setCustomCmH] = useState('');

  const preset = COLOR_PRESETS[colorIdx];
  const bg = customBg || preset.bg;
  const textColor = customText || preset.text;
  const qrDark = preset.qrDark;
  const layout = LAYOUTS.find(l => l.id === layoutId)!;
  const qrSize = QR_SIZES[layoutId];
  const cmW = customCmW ? Number(customCmW) : layout.cmW;
  const cmH = customCmH ? Number(customCmH) : layout.cmH;

  const publicUrl = siteUrl && listing.slug
    ? `${siteUrl.replace(/\/$/, '')}/object/${listing.slug}`
    : null;

  const initElements = useCallback((lid: LayoutId) => {
    const pos = DEFAULT_POSITIONS[lid];
    const fs = DEFAULT_FONTSIZES[lid];
    setElements([
      { id: 'deal',  pos: pos.deal,  fontSize: fs.deal },
      { id: 'phone', pos: pos.phone, fontSize: fs.phone },
      { id: 'qr',    pos: pos.qr },
    ]);
    setSelected(null);
  }, []);

  useEffect(() => { initElements('h-card'); }, []); // eslint-disable-line

  const changeLayout = (lid: LayoutId) => { setLayoutId(lid); initElements(lid); setCustomCmW(''); setCustomCmH(''); };

  const resetPositions = () => { initElements(layoutId); };

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
      const dark = customText || qrDark;
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1, color: { dark, light: '#00000000' } });
      setQrDataUrl(dataUrl);
    } catch { setQrDataUrl(''); }
  }, [publicUrl, listing.id, qrDark, customText]);

  useEffect(() => { generateQr(); }, [generateQr]);

  const updatePos = (id: ElementId, pos: Pos) =>
    setElements(prev => prev.map(e => e.id === id ? { ...e, pos } : e));

  const updateFontSize = (delta: number) => {
    if (!selected || selected === 'qr') return;
    setElements(prev => prev.map(e =>
      e.id === selected ? { ...e, fontSize: Math.max(10, Math.min(120, (e.fontSize ?? 32) + delta)) } : e
    ));
  };

  const selectedEl = elements.find(e => e.id === selected);

  // скачать баннер
  const download = async () => {
    if (!exportRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(exportRef.current, { scale: 3, useCORS: true, backgroundColor: bg, logging: false });
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

  // скачать QR отдельно
  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-${listing.id}.png`;
    a.click();
  };

  const maxW = 560; const maxH = 380;
  const previewScale = Math.min(maxW / layout.w, maxH / layout.h, 1);

  const canvasProps: Omit<CanvasProps, 'bannerRef' | 'exportMode'> = {
    layout, bg, textColor, elements, dealText, phoneText, qrDataUrl, qrSize,
    selected, onSelect: setSelected, onDragMove: updatePos,
    showSize, cmW, cmH,
  };

  if (elements.length === 0) return null;

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

      {/* Цвет фона + цвет текста */}
      <div className="space-y-3">
        <div className="text-sm font-semibold">Цвет</div>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((p, i) => (
            <button key={p.bg} onClick={() => { setColorIdx(i); setCustomBg(''); setCustomText(''); }} title={p.label}
              className="w-8 h-8 rounded-lg transition-all"
              style={{
                background: p.bg,
                border: `2px solid ${(colorIdx === i && !customBg) ? (p.text === '#ffffff' ? '#aaa' : '#333') : 'transparent'}`,
                outline: (colorIdx === i && !customBg) ? `2px solid ${p.bg === '#ffffff' ? '#999' : p.bg}` : 'none',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
        <div className="flex gap-3 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Свой цвет фона</div>
            <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5">
              <input type="color" value={customBg || preset.bg}
                onChange={e => { setCustomBg(e.target.value); }}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
              />
              <span className="text-xs font-mono text-muted-foreground">{customBg || preset.bg}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Свой цвет текста</div>
            <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5">
              <input type="color" value={customText || preset.text}
                onChange={e => { setCustomText(e.target.value); }}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
              />
              <span className="text-xs font-mono text-muted-foreground">{customText || preset.text}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Текст */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Текст сделки</div>
          <input value={dealText} onChange={e => setDealText(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-bold uppercase tracking-widest"
            maxLength={20}
          />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Телефон</div>
          <input value={phoneText} onChange={e => setPhoneText(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-semibold"
            placeholder="+7 000 000-00-00" maxLength={30}
          />
        </div>
      </div>

      {/* Размеры для печати */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSize(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm transition-all ${
              showSize ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground hover:border-brand-blue'
            }`}
          >
            <Icon name={showSize ? 'RulerIcon' : 'Ruler'} size={13} />
            {showSize ? 'Размеры на баннере: вкл' : 'Показать размеры на баннере'}
          </button>
        </div>
        {showSize && (
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Ширина (см)</div>
              <input type="number" value={customCmW || layout.cmW} min={1} max={999}
                onChange={e => setCustomCmW(e.target.value)}
                className="w-24 px-3 py-1.5 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Высота (см)</div>
              <input type="number" value={customCmH || layout.cmH} min={1} max={999}
                onChange={e => setCustomCmH(e.target.value)}
                className="w-24 px-3 py-1.5 border border-border rounded-lg text-sm"
              />
            </div>
            <div className="text-xs text-muted-foreground pb-1.5">Отображается в правом нижнем углу</div>
          </div>
        )}
      </div>

      {/* Редактор */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Редактор</div>
          <div className="flex items-center gap-3">
            <button onClick={resetPositions} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="RotateCcw" size={12} />
              Сбросить позиции
            </button>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon name="Move" size={12} />
              Перетащи элемент
            </div>
          </div>
        </div>

        <div className="flex justify-center items-center bg-[#e8e8e8] rounded-2xl py-8" style={{ minHeight: 200 }}>
          <div style={{
            transform: `scale(${previewScale})`,
            transformOrigin: 'center center',
            width: layout.w * previewScale,
            height: layout.h * previewScale,
          }}>
            <BannerCanvas {...canvasProps} bannerRef={{ current: null }} />
          </div>
        </div>

        {/* Панель выбранного элемента */}
        {selected && (
          <div className="flex items-center gap-3 bg-muted/50 rounded-xl px-4 py-2.5 text-sm">
            <Icon name={selected === 'qr' ? 'QrCode' : selected === 'deal' ? 'Type' : 'Phone'} size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">
              {selected === 'deal' ? 'Надпись сделки' : selected === 'phone' ? 'Телефон' : 'QR-код'}
            </span>
            {selected !== 'qr' && selectedEl && (
              <>
                <span className="text-muted-foreground">· шрифт</span>
                <button onClick={() => updateFontSize(-2)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-muted border border-border transition-colors">
                  <Icon name="Minus" size={12} />
                </button>
                <span className="font-bold w-7 text-center">{selectedEl.fontSize}</span>
                <button onClick={() => updateFontSize(2)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-muted border border-border transition-colors">
                  <Icon name="Plus" size={12} />
                </button>
              </>
            )}
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

        {/* Ссылка скачать QR */}
        <button
          onClick={downloadQr}
          disabled={!qrDataUrl}
          className="flex items-center gap-1.5 text-sm text-brand-blue hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="QrCode" size={14} />
          Скачать QR-код отдельно (PNG)
        </button>
      </div>

    </div>
  );
}
