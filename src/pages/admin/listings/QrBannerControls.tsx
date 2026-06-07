import Icon from '@/components/ui/icon';
import { BannerElement, BG_COLORS, ElementId, EL_LABEL, getSizeInfo, SIZE_PRESETS, TEXT_COLORS } from './QrBannerTypes';
import { BannerCanvas, CanvasProps, ImageUploadBtn, Swatch } from './QrBannerCanvas';

// ─── ColorPicker ──────────────────────────────────────────────────────────────

interface ColorPickerProps {
  bgColor: string; setBgColor: (c: string) => void;
  textColor: string; setTextColor: (c: string) => void;
}

export function ColorPicker({ bgColor, setBgColor, textColor, setTextColor }: ColorPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2 border border-border rounded-xl p-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Фон</div>
        <div className="flex flex-wrap gap-1.5">
          {BG_COLORS.map(c => <Swatch key={c} color={c} active={bgColor === c} onClick={() => setBgColor(c)} />)}
        </div>
        <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5">
          <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent flex-shrink-0" />
          <span className="text-xs font-mono text-muted-foreground">Свой: {bgColor}</span>
        </div>
      </div>
      <div className="space-y-2 border border-border rounded-xl p-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Текст</div>
        <div className="flex flex-wrap gap-1.5">
          {TEXT_COLORS.map(c => <Swatch key={c} color={c} active={textColor === c} onClick={() => setTextColor(c)} />)}
        </div>
        <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5">
          <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent flex-shrink-0" />
          <span className="text-xs font-mono text-muted-foreground">Свой: {textColor}</span>
        </div>
      </div>
    </div>
  );
}

// ─── SizePanel ────────────────────────────────────────────────────────────────

interface SizePanelProps {
  cmW: string; setCmW: (v: string) => void;
  cmH: string; setCmH: (v: string) => void;
  numCmW: number; numCmH: number;
  sqM: string;
  showSize: boolean; setShowSize: (v: boolean) => void;
  applyPreset: (w: number, h: number) => void;
}

export function SizePanel({ cmW, setCmW, cmH, setCmH, numCmW, numCmH, sqM, showSize, setShowSize, applyPreset }: SizePanelProps) {
  return (
    <div className="border-2 border-brand-blue/30 bg-brand-blue/5 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="Ruler" size={15} className="text-brand-blue" />
          <span className="text-sm font-semibold text-brand-blue">Размеры для печати</span>
        </div>
        <button onClick={() => setShowSize(!showSize)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
            showSize ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground hover:border-brand-blue'
          }`}
        >
          <Icon name={showSize ? 'Eye' : 'EyeOff'} size={12} />
          {showSize ? 'На баннере: вкл' : 'Показать на баннере'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SIZE_PRESETS.map(p => (
          <button key={p.label} onClick={() => applyPreset(p.w, p.h)}
            className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
              numCmW === p.w && numCmH === p.h
                ? 'bg-brand-blue text-white border-brand-blue'
                : 'border-border text-muted-foreground hover:border-brand-blue hover:text-foreground'
            }`}
          >
            {p.label} <span className="opacity-60">{p.w}×{p.h}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Длина (см)</div>
          <input type="number" value={cmW} min={1} max={9999} step={0.5} onChange={e => setCmW(e.target.value)}
            className="w-28 px-3 py-2 border-2 border-border rounded-xl text-sm font-semibold focus:border-brand-blue outline-none" />
        </div>
        <div className="text-lg font-bold text-muted-foreground mt-4">×</div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Высота (см)</div>
          <input type="number" value={cmH} min={1} max={9999} step={0.5} onChange={e => setCmH(e.target.value)}
            className="w-28 px-3 py-2 border-2 border-border rounded-xl text-sm font-semibold focus:border-brand-blue outline-none" />
        </div>
        <div className="mt-4 flex items-center gap-1.5 px-3 py-2 bg-white border border-brand-blue/30 rounded-lg">
          <Icon name="Square" size={13} className="text-brand-blue" />
          <span className="text-sm font-bold text-brand-blue">{sqM} м²</span>
        </div>
      </div>
    </div>
  );
}

// ─── EditorPanel ──────────────────────────────────────────────────────────────

interface EditorPanelProps {
  canvasProps: Omit<CanvasProps, 'bannerRef' | 'exportMode'>;
  bannerW: number; bannerH: number;
  previewScale: number;
  previewH: number;
  numCmW: number; numCmH: number;
  selected: ElementId | null;
  selectedEl: BannerElement | undefined;
  onResetPositions: () => void;
  onUpdateSize: (delta: number) => void;
  onDeselect: () => void;
}

export function EditorPanel({
  canvasProps, bannerW, bannerH, previewScale,
  previewH, numCmW, numCmH,
  selected, selectedEl, onResetPositions, onUpdateSize, onDeselect,
}: EditorPanelProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Редактор</div>
        <div className="flex items-center gap-3">
          <button onClick={onResetPositions}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name="RotateCcw" size={12} />Сбросить
          </button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon name="Move" size={12} />Перетащи
          </div>
        </div>
      </div>

      <div
        className="relative bg-[#e0e0e0] rounded-2xl overflow-hidden"
        style={{ width: '100%', height: previewH }}
      >
        <div className="absolute inset-0 opacity-[0.1]" style={{
          backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 19px,#777 19px,#777 20px),repeating-linear-gradient(90deg,transparent,transparent 19px,#777 19px,#777 20px)',
        }} />
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
        }}>
          <div style={{ zoom: previewScale }}>
            <BannerCanvas {...canvasProps} bannerRef={{ current: null }} />
          </div>
        </div>
        <div className="absolute bottom-2 right-3 text-xs text-gray-500 bg-white/80 rounded px-2 py-0.5 select-none">
          {numCmW} × {numCmH} см
        </div>
      </div>

      {selected && selectedEl && (
        <div className="flex items-center gap-3 bg-muted/50 rounded-xl px-4 py-2.5 text-sm flex-wrap">
          <Icon name={
            selected === 'qr' ? 'QrCode' : selected === 'deal' ? 'Type' :
            selected === 'phone' ? 'Phone' : selected === 'logo' ? 'Building2' : 'Image'
          } size={14} className="text-muted-foreground" />
          <span className="text-muted-foreground">{EL_LABEL[selected]}</span>
          <span className="text-muted-foreground">· {getSizeInfo(selectedEl).label}</span>
          <button onClick={() => onUpdateSize(-2)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-muted border border-border">
            <Icon name="Minus" size={12} />
          </button>
          <span className="font-bold w-8 text-center">{getSizeInfo(selectedEl).value}</span>
          <button onClick={() => onUpdateSize(2)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-muted border border-border">
            <Icon name="Plus" size={12} />
          </button>
          <button onClick={onDeselect} className="ml-auto text-xs text-muted-foreground hover:text-foreground">✕ Снять</button>
        </div>
      )}
    </div>
  );
}

// ─── TextPanel ────────────────────────────────────────────────────────────────

interface TextPanelProps {
  dealText: string; setDealText: (v: string) => void;
  phoneText: string; setPhoneText: (v: string) => void;
}

export function TextPanel({ dealText, setDealText, phoneText, setPhoneText }: TextPanelProps) {
  return (
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
  );
}

// ─── ImagesPanel ─────────────────────────────────────────────────────────────

interface ImagesPanelProps {
  logoUrl: string; uploadingLogo: boolean;
  photoUrl: string; uploadingPhoto: boolean;
  hasListingImage: boolean;
  onUploadLogo: (f: File) => void; onRemoveLogo: () => void;
  onUploadPhoto: (f: File) => void; onRemovePhoto: () => void;
  onUseListingPhoto: () => void;
}

export function ImagesPanel({
  logoUrl, uploadingLogo, photoUrl, uploadingPhoto, hasListingImage,
  onUploadLogo, onRemoveLogo, onUploadPhoto, onRemovePhoto, onUseListingPhoto,
}: ImagesPanelProps) {
  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <div className="text-sm font-semibold">Изображения на баннере</div>
      <div className="space-y-2">
        <ImageUploadBtn label="Логотип" icon="Building2" url={logoUrl} uploading={uploadingLogo}
          onFile={onUploadLogo} onRemove={onRemoveLogo} />
        <div className="flex items-center gap-2 flex-wrap">
          <ImageUploadBtn label="Фото объекта" icon="ImagePlus" url={photoUrl} uploading={uploadingPhoto}
            onFile={onUploadPhoto} onRemove={onRemovePhoto} />
          {!photoUrl && hasListingImage && (
            <button onClick={onUseListingPhoto} className="flex items-center gap-1.5 text-xs text-brand-blue hover:underline">
              <Icon name="ImageIcon" size={12} />Использовать фото объекта
            </button>
          )}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">После добавления — перетащи в нужное место на баннере</div>
    </div>
  );
}

// ─── DownloadPanel ────────────────────────────────────────────────────────────

interface DownloadPanelProps {
  downloadFormat: 'png' | 'jpg' | 'pdf';
  setDownloadFormat: (f: 'png' | 'jpg' | 'pdf') => void;
  downloading: boolean;
  qrDataUrl: string;
  onDownload: () => void;
  onDownloadQr: () => void;
}

export function DownloadPanel({ downloadFormat, setDownloadFormat, downloading, qrDataUrl, onDownload, onDownloadQr }: DownloadPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {(['png', 'jpg', 'pdf'] as const).map(fmt => (
          <button key={fmt} onClick={() => setDownloadFormat(fmt)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
              downloadFormat === fmt ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground hover:border-brand-blue hover:text-brand-blue'
            }`}
          >{fmt.toUpperCase()}</button>
        ))}
        <button onClick={onDownload} disabled={downloading || !qrDataUrl}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-50 transition ml-auto"
        >
          {downloading
            ? <><Icon name="Loader2" size={15} className="animate-spin" />Подготовка...</>
            : <><Icon name="Download" size={15} />Скачать {downloadFormat.toUpperCase()}</>
          }
        </button>
      </div>
      <button onClick={onDownloadQr} disabled={!qrDataUrl}
        className="flex items-center gap-1.5 text-sm text-brand-blue hover:underline disabled:opacity-40"
      >
        <Icon name="QrCode" size={14} />Скачать QR-код отдельно (PNG)
      </button>
    </div>
  );
}