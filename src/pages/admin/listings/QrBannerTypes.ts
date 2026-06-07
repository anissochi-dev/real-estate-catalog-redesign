// ─── Shared types, constants, helpers for QR Banner ──────────────────────────

export interface BrokerInfo { id: number; name: string; phone?: string | null; role: string }

export type ElementId = 'deal' | 'phone' | 'qr' | 'logo' | 'photo';
export interface Pos { x: number; y: number }
export interface BannerElement { id: ElementId; pos: Pos; fontSize?: number; imgSize?: number }

export const BG_COLORS   = ['#facc15','#1a56db','#16a34a','#dc2626','#f97316','#7c3aed','#111827','#ffffff'];
export const TEXT_COLORS = ['#dc2626','#ffffff','#111827','#facc15','#f97316','#1a56db','#16a34a','#7c3aed'];

// px на 1 см для рендера баннера
export const PX_PER_CM = 20;

// Контейнер превью фиксированной ширины
export const PREVIEW_MAX_W = 520;
export const PREVIEW_MAX_H = 460;
export const PREVIEW_PAD   = 40;

export const SIZE_PRESETS = [
  { label: 'Широкий баннер', w: 30,   h: 9    },
  { label: 'Горизонтальный', w: 21,   h: 10   },
  { label: 'Вертикальный',   w: 10,   h: 20   },
  { label: 'Квадрат',        w: 15,   h: 15   },
  { label: 'А4',             w: 29.7, h: 21   },
  { label: 'А3',             w: 42,   h: 29.7 },
];

export const EL_LABEL: Record<ElementId, string> = {
  deal: 'Надпись сделки', phone: 'Телефон', qr: 'QR-код', logo: 'Логотип', photo: 'Фото',
};

export function getSizeInfo(el: BannerElement): { label: string; value: number } {
  return (el.id === 'deal' || el.id === 'phone')
    ? { label: 'шрифт', value: el.fontSize ?? 20 }
    : { label: 'размер', value: el.imgSize ?? 60 };
}

// Подбирает максимальный fontSize, при котором text влезает в maxWidth
function fitFontSize(text: string, weight: string, maxWidth: number, maxFs: number, minFs = 8): number {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d')!;
  let fs = Math.round(maxFs);
  while (fs > minFs) {
    ctx.font = `${weight} ${fs}px Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    fs -= 1;
  }
  return fs;
}

export function makeElements(
  w: number, h: number,
  prevEls?: BannerElement[],
  dealText = 'ПРОДАЮ',
  phoneText = '+7 000 000 0000',
): BannerElement[] {
  const isLandscape = w >= h;

  // Стандартные размеры (абсолютные, не зависят от размера баннера)
  const DEAL_FS  = 94;
  const PHONE_FS = 72;
  const QR_SZ    = 72;

  if (isLandscape) {
    // QR — правая колонка, вертикально по центру
    const qrPad = Math.round((h - QR_SZ) / 2);
    const qrX   = w - QR_SZ - 14;
    const qrY   = qrPad;

    // Если текст не влезает — уменьшаем через fitFontSize, но не больше стандарта
    const textMaxW = qrX - 18 - 10;
    const dealFs  = fitFontSize(dealText  || 'ПРОДАЮ',          '900', textMaxW, DEAL_FS);
    const phoneFs = fitFontSize(phoneText || '+7 000 000 0000',  '800', textMaxW, PHONE_FS);

    // Вертикальные позиции: текст + телефон равномерно по высоте
    const dealY  = Math.round((h - dealFs - phoneFs - 6) / 2);
    const phoneY = dealY + dealFs + 6;

    const base: BannerElement[] = [
      { id: 'deal',  pos: { x: 18, y: dealY  }, fontSize: Math.max(12, dealFs)  },
      { id: 'phone', pos: { x: 18, y: phoneY }, fontSize: Math.max(10, phoneFs) },
      { id: 'qr',    pos: { x: qrX, y: qrY },  imgSize: QR_SZ },
    ];
    const logo  = prevEls?.find(e => e.id === 'logo');
    const photo = prevEls?.find(e => e.id === 'photo');
    return [...base, ...(logo ? [logo] : []), ...(photo ? [photo] : [])];
  } else {
    // вертикальный: QR снизу по центру, текст сверху
    const qrSz  = Math.round(w * 0.5);
    const qrX   = Math.round((w - qrSz) / 2);
    const qrY   = h - qrSz - 18;
    const textMaxW = w - 36;
    const dealFs  = fitFontSize(dealText  || 'ПРОДАЮ',         '900', textMaxW, DEAL_FS);
    const phoneFs = fitFontSize(phoneText || '+7 000 000 0000', '800', textMaxW, PHONE_FS);
    const base: BannerElement[] = [
      { id: 'deal',  pos: { x: 18, y: 16 },              fontSize: Math.max(12, dealFs)  },
      { id: 'phone', pos: { x: 18, y: 16 + dealFs + 6 }, fontSize: Math.max(10, phoneFs) },
      { id: 'qr',    pos: { x: qrX, y: qrY },            imgSize: Math.max(40, qrSz) },
    ];
    const logo  = prevEls?.find(e => e.id === 'logo');
    const photo = prevEls?.find(e => e.id === 'photo');
    return [...base, ...(logo ? [logo] : []), ...(photo ? [photo] : [])];
  }
}