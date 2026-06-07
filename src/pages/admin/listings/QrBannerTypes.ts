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

export function makeElements(w: number, h: number, prevEls?: BannerElement[]): BannerElement[] {
  const isLandscape = w >= h;

  if (isLandscape) {
    // QR занимает правую колонку: высота баннера - отступы
    const qrSz   = Math.round(h * 0.72);
    const qrPad  = Math.round((h - qrSz) / 2);
    const qrX    = w - qrSz - qrPad;
    const qrY    = qrPad;

    // текст занимает левую часть до QR (с запасом 12px)
    const textMaxW = qrX - 20 - 12;
    // подбираем шрифт так, чтобы "ПРОДАЮ" влезло в textMaxW
    // Arial 900: ≈0.65 * fontSize * кол-во символов (приблизительно)
    // Используем фиксированные доли высоты, но ограничиваем по ширине
    const dealFs  = Math.min(Math.round(h * 0.38), Math.round(textMaxW / 5.5));
    const phoneFs = Math.min(Math.round(h * 0.26), Math.round(textMaxW / 8.5));

    const base: BannerElement[] = [
      { id: 'deal',  pos: { x: 18, y: Math.round(h * 0.08) }, fontSize: Math.max(12, dealFs) },
      { id: 'phone', pos: { x: 18, y: Math.round(h * 0.52) }, fontSize: Math.max(10, phoneFs) },
      { id: 'qr',    pos: { x: qrX, y: qrY }, imgSize: Math.max(30, qrSz) },
    ];
    const logo  = prevEls?.find(e => e.id === 'logo');
    const photo = prevEls?.find(e => e.id === 'photo');
    return [...base, ...(logo ? [logo] : []), ...(photo ? [photo] : [])];
  } else {
    // вертикальный: QR снизу по центру, текст сверху
    const qrSz  = Math.round(w * 0.38);
    const qrX   = Math.round((w - qrSz) / 2);
    const qrY   = h - qrSz - 18;
    const dealFs  = Math.round(h * 0.1);
    const phoneFs = Math.round(h * 0.065);
    const base: BannerElement[] = [
      { id: 'deal',  pos: { x: 18, y: Math.round(h * 0.06) }, fontSize: Math.max(12, dealFs) },
      { id: 'phone', pos: { x: 18, y: Math.round(h * 0.18) }, fontSize: Math.max(10, phoneFs) },
      { id: 'qr',    pos: { x: qrX, y: qrY }, imgSize: Math.max(40, qrSz) },
    ];
    const logo  = prevEls?.find(e => e.id === 'logo');
    const photo = prevEls?.find(e => e.id === 'photo');
    return [...base, ...(logo ? [logo] : []), ...(photo ? [photo] : [])];
  }
}