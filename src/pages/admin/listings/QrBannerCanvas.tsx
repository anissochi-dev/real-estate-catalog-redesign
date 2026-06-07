import { useRef } from 'react';
import Icon from '@/components/ui/icon';
import { BannerElement, ElementId, Pos } from './QrBannerTypes';

// ─── BannerCanvas ─────────────────────────────────────────────────────────────

export interface CanvasProps {
  bannerW: number;
  bannerH: number;
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
  previewScale?: number;
}

export function BannerCanvas({
  bannerW, bannerH, bg, textColor, elements, dealText, phoneText,
  qrDataUrl, logoUrl, photoUrl,
  selected, onSelect, onDragMove, bannerRef, exportMode,
  showSize, cmW, cmH, previewScale = 1,
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
    // делим на previewScale, т.к. события идут в экранных координатах, а позиции — в баннерных
    const dx = (e.clientX - dragging.current.startX) / previewScale;
    const dy = (e.clientY - dragging.current.startY) / previewScale;
    onDragMove(dragging.current.id, {
      x: Math.max(0, Math.min(bannerW - 20, dragging.current.origX + dx)),
      y: Math.max(0, Math.min(bannerH - 20, dragging.current.origY + dy)),
    });
  };

  const onPointerUp = () => { dragging.current = null; };

  const selStyle = (id: ElementId): React.CSSProperties =>
    (!exportMode && selected === id)
      ? { outline: '2px dashed rgba(255,255,255,0.85)', outlineOffset: 3, borderRadius: 4 }
      : {};

  const dealEl  = getEl('deal');
  const phoneEl = getEl('phone');
  const qrEl    = getEl('qr');
  const logoEl  = getEl('logo');
  const photoEl = getEl('photo');
  const sizeLabel = Math.max(10, bannerH * 0.065);

  return (
    <div
      ref={bannerRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={e => { if (e.target === e.currentTarget && !exportMode) onSelect(null); }}
      style={{
        position: 'relative', width: bannerW, height: bannerH, background: bg,
        borderRadius: exportMode ? 0 : 12, overflow: 'hidden',
        userSelect: 'none', fontFamily: 'Arial, Helvetica, sans-serif', touchAction: 'none',
      }}
    >
      {photoEl && photoUrl && (
        <div onPointerDown={e => onPointerDown(e, 'photo')} style={{
          position: 'absolute', left: photoEl.pos.x, top: photoEl.pos.y,
          width: photoEl.imgSize ?? 120, height: photoEl.imgSize ?? 120,
          cursor: exportMode ? 'default' : 'grab',
          borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.25)', ...selStyle('photo'),
        }}>
          <img src={photoUrl} alt="фото" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} crossOrigin="anonymous" />
        </div>
      )}

      {dealEl && (
        <div onPointerDown={e => onPointerDown(e, 'deal')} style={{
          position: 'absolute', left: dealEl.pos.x, top: dealEl.pos.y,
          fontSize: dealEl.fontSize, fontWeight: 900, color: textColor,
          letterSpacing: 3, lineHeight: 1, cursor: exportMode ? 'default' : 'grab',
          whiteSpace: 'nowrap', padding: 4, ...selStyle('deal'),
        }}>{dealText}</div>
      )}

      {phoneEl && (
        <div onPointerDown={e => onPointerDown(e, 'phone')} style={{
          position: 'absolute', left: phoneEl.pos.x, top: phoneEl.pos.y,
          fontSize: phoneEl.fontSize, fontWeight: 800, color: textColor,
          letterSpacing: 1, lineHeight: 1, cursor: exportMode ? 'default' : 'grab',
          whiteSpace: 'nowrap', padding: 4, ...selStyle('phone'),
        }}>{phoneText || '+7 ─── ─── ────'}</div>
      )}

      {qrEl && (
        <div onPointerDown={e => onPointerDown(e, 'qr')} style={{
          position: 'absolute', left: qrEl.pos.x, top: qrEl.pos.y,
          width: (qrEl.imgSize ?? 80) + 10, height: (qrEl.imgSize ?? 80) + 10,
          background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 5,
          cursor: exportMode ? 'default' : 'grab', ...selStyle('qr'),
        }}>
          {qrDataUrl
            ? <img src={qrDataUrl} alt="QR" style={{ width: qrEl.imgSize ?? 80, height: qrEl.imgSize ?? 80, display: 'block' }} />
            : <div style={{ width: qrEl.imgSize ?? 80, height: qrEl.imgSize ?? 80, opacity: 0.25, border: `2px dashed ${textColor}`, borderRadius: 6 }} />
          }
        </div>
      )}

      {logoEl && logoUrl && (
        <div onPointerDown={e => onPointerDown(e, 'logo')} style={{
          position: 'absolute', left: logoEl.pos.x, top: logoEl.pos.y,
          width: logoEl.imgSize ?? 70, height: logoEl.imgSize ?? 70,
          cursor: exportMode ? 'default' : 'grab', ...selStyle('logo'),
        }}>
          <img src={logoUrl} alt="лого" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} crossOrigin="anonymous" />
        </div>
      )}

      {showSize && (
        <div style={{
          position: 'absolute', bottom: 8, right: 10,
          fontSize: sizeLabel, fontWeight: 700,
          color: textColor, opacity: 0.55, letterSpacing: 0.5, whiteSpace: 'nowrap',
        }}>
          {cmW} см × {cmH} см
        </div>
      )}
    </div>
  );
}

// ─── Swatch ───────────────────────────────────────────────────────────────────

export function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-7 h-7 rounded-lg flex-shrink-0 transition-all"
      style={{
        background: color,
        border: `2px solid ${active ? (color === '#ffffff' || color === '#facc15' ? '#555' : color) : 'transparent'}`,
        outline: active ? `2px solid ${color === '#ffffff' || color === '#facc15' ? '#666' : color}` : 'none',
        outlineOffset: 2,
        boxShadow: color === '#ffffff' ? 'inset 0 0 0 1px #ddd' : undefined,
      }}
    />
  );
}

// ─── ImageUploadBtn ───────────────────────────────────────────────────────────

export function ImageUploadBtn({ label, icon, url, uploading, onFile, onRemove }: {
  label: string; icon: string; url: string; uploading: boolean;
  onFile: (f: File) => void; onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {url ? (
        <div className="flex items-center gap-2">
          <img src={url} alt={label} className="w-10 h-10 rounded-lg object-cover border border-border" />
          <span className="text-xs text-muted-foreground">{label} загружен</span>
          <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
            <Icon name="X" size={12} /> Удалить
          </button>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()} disabled={uploading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border hover:border-brand-blue text-sm text-muted-foreground hover:text-brand-blue transition-all disabled:opacity-50"
        >
          {uploading ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name={icon} size={14} />}
          {uploading ? 'Загрузка...' : `Добавить ${label.toLowerCase()}`}
        </button>
      )}
    </div>
  );
}