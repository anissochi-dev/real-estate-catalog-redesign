// ─── Shared types, constants, helpers for QR Banner ──────────────────────────

export interface BrokerInfo { id: number; name: string; phone?: string | null; role: string }

export type ElementId = 'deal' | 'phone' | 'qr' | 'logo' | 'photo';
export interface Pos { x: number; y: number }
export interface BannerElement { id: ElementId; pos: Pos; fontSize?: number; imgSize?: number }

/** Размеры, заданные вручную (во внутренних единицах: кегль или сторона, px). */
export type ManualSizes = Partial<Record<ElementId, number>>;

export const BG_COLORS   = ['#facc15','#1a56db','#16a34a','#dc2626','#f97316','#7c3aed','#111827','#ffffff'];
export const TEXT_COLORS = ['#dc2626','#ffffff','#111827','#facc15','#f97316','#1a56db','#16a34a','#7c3aed'];

// px на 1 см для рендера баннера (1 px = 0,5 мм)
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

// ── Типографика: одинакова для редактора, скачивания и серверного TIFF ──────
export const FONT_FAMILY = 'Montserrat, Arial, sans-serif';
export const CAP_HEIGHT = 0.7;      // высота заглавной буквы Montserrat в долях кегля
export const BASELINE = 0.8585;     // базовая линия от верха строки при line-height: 1
export const DEAL_WEIGHT = 900;
export const PHONE_WEIGHT = 800;
export const LABEL_WEIGHT = 700;
export const DEAL_LS = 0.03;        // межбуквенный интервал, доля кегля
export const PHONE_LS = 0.01;
export const QR_PAD = 0.05;         // поле вокруг QR, доля стороны QR
export const SAFE_CM = 0.5;         // безопасная зона от края (5 мм)
export const PHONE_PLACEHOLDER = '+7 ─── ─── ────';

export const EL_LABEL: Record<ElementId, string> = {
  deal: 'Надпись сделки', phone: 'Телефон', qr: 'QR-код', logo: 'Логотип', photo: 'Фото',
};

export const isTextEl = (id: ElementId) => id === 'deal' || id === 'phone';

export const pxToCm = (px: number) => px / PX_PER_CM;
export const cmToPx = (cm: number) => cm * PX_PER_CM;

/** Размер элемента для человека: для текста — высота заглавных букв, для картинок — сторона. */
export function elementCm(el: BannerElement): number {
  return isTextEl(el.id) ? pxToCm((el.fontSize ?? 20) * CAP_HEIGHT) : pxToCm(el.imgSize ?? 60);
}

/** Обратное преобразование: см → внутренний размер элемента. */
export function sizeFromCm(id: ElementId, cm: number): number {
  return isTextEl(id) ? cmToPx(cm) / CAP_HEIGHT : cmToPx(cm);
}

export const qrPadPx = (imgSize: number) => Math.round(imgSize * QR_PAD);

export function sizeLabelMetrics(w: number, h: number) {
  const base = Math.min(w, h);
  return { fontSize: Math.max(8, base * 0.035), offset: Math.max(4, base * 0.015) };
}

// ── Измерение текста ─────────────────────────────────────────────────────────
let measureCtx: CanvasRenderingContext2D | null = null;

export function measureText(text: string, weight: number, fontSize: number, lsEm: number): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * fontSize * 0.7;
  measureCtx.font = `${weight} ${fontSize}px ${FONT_FAMILY}`;
  return measureCtx.measureText(text).width + lsEm * fontSize * [...text].length;
}

function fitFont(text: string, weight: number, lsEm: number, maxW: number, maxFs: number): number {
  const w100 = measureText(text || ' ', weight, 100, lsEm);
  const byWidth = w100 > 0 ? (maxW * 100) / w100 : maxFs;
  return Math.max(8, Math.floor(Math.min(maxFs, byWidth)));
}

export interface TextOpts { dealText: string; phoneText: string }

export function elementBox(el: BannerElement, t: TextOpts) {
  if (el.id === 'deal') {
    const fs = el.fontSize ?? 20;
    return { x: el.pos.x, y: el.pos.y, w: measureText(t.dealText, DEAL_WEIGHT, fs, DEAL_LS), h: fs };
  }
  if (el.id === 'phone') {
    const fs = el.fontSize ?? 20;
    return { x: el.pos.x, y: el.pos.y, w: measureText(t.phoneText || PHONE_PLACEHOLDER, PHONE_WEIGHT, fs, PHONE_LS), h: fs };
  }
  const s = el.imgSize ?? 60;
  const side = el.id === 'qr' ? s + 2 * qrPadPx(s) : s;
  return { x: el.pos.x, y: el.pos.y, w: side, h: side };
}

// ── Авто-раскладка ───────────────────────────────────────────────────────────
// Все размеры считаются в долях от баннера, поэтому макет одинаково выглядит
// и на 30×9 см, и на 3×2 м. Размеры из manual (заданные вручную) имеют приоритет.

export function layoutElements(
  w: number, h: number,
  t: TextOpts,
  manual: ManualSizes,
  prevEls?: BannerElement[],
  prevDims?: { w: number; h: number },
): BannerElement[] {
  const m = Math.round(Math.min(w, h) * 0.07);
  const landscape = w >= h;
  const dealStr = t.dealText || 'ПРОДАЮ';
  const phoneStr = t.phoneText || PHONE_PLACEHOLDER;

  const autoQrBox = landscape ? Math.min(h - 2 * m, w * 0.38) : Math.min(w - 2 * m, h * 0.5);
  const qrSize = Math.max(20, Math.round(manual.qr ?? autoQrBox / (1 + 2 * QR_PAD)));
  const qrBox = qrSize + 2 * qrPadPx(qrSize);

  const qrX = landscape ? w - m - qrBox : Math.round((w - qrBox) / 2);
  const qrY = landscape ? Math.round((h - qrBox) / 2) : h - m - qrBox;

  const textW = Math.max(40, landscape ? qrX - 2 * m : w - 2 * m);
  const availH = Math.max(20, landscape ? h - 2 * m : qrY - 2 * m);

  const dealFs = Math.round(manual.deal ?? fitFont(dealStr, DEAL_WEIGHT, DEAL_LS, textW, availH * 0.5));
  const phoneFs = Math.round(manual.phone ?? fitFont(phoneStr, PHONE_WEIGHT, PHONE_LS, textW, availH * 0.34));
  const gap = Math.round(Math.min(dealFs, phoneFs) * 0.25);
  const stackH = dealFs + gap + phoneFs;
  const y0 = landscape ? Math.round((h - stackH) / 2) : Math.round(m + (availH - stackH) / 2);

  const textX = (text: string, weight: number, fs: number, ls: number) =>
    landscape ? m : Math.round((w - measureText(text, weight, fs, ls)) / 2);

  const base: BannerElement[] = [
    { id: 'deal',  pos: { x: textX(dealStr, DEAL_WEIGHT, dealFs, DEAL_LS), y: y0 }, fontSize: dealFs },
    { id: 'phone', pos: { x: textX(phoneStr, PHONE_WEIGHT, phoneFs, PHONE_LS), y: y0 + dealFs + gap }, fontSize: phoneFs },
    { id: 'qr',    pos: { x: qrX, y: qrY }, imgSize: qrSize },
  ];

  const kx = prevDims ? w / prevDims.w : 1;
  const ky = prevDims ? h / prevDims.h : 1;
  const extras = (['logo', 'photo'] as const).flatMap(id => {
    const p = prevEls?.find(e => e.id === id);
    if (!p) return [];
    const size = Math.round(manual[id] ?? (p.imgSize ?? 60) * Math.min(kx, ky));
    return [{
      id, imgSize: size,
      pos: {
        x: Math.max(0, Math.min(w - size, Math.round(p.pos.x * kx))),
        y: Math.max(0, Math.min(h - size, Math.round(p.pos.y * ky))),
      },
    } as BannerElement];
  });

  return [...base, ...extras];
}

/** Проблемы размещения: выход за край или попадание в зону обреза (5 мм). */
export function elementIssue(el: BannerElement, w: number, h: number, t: TextOpts): 'out' | 'edge' | null {
  const b = elementBox(el, t);
  if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > w + 0.5 || b.y + b.h > h + 0.5) return 'out';
  const safe = cmToPx(SAFE_CM);
  if (b.x < safe || b.y < safe || b.x + b.w > w - safe || b.y + b.h > h - safe) return 'edge';
  return null;
}

/** Примерная дистанция считывания QR-кода: ~10 сторон кода. */
export const qrReadDistanceM = (imgSize: number) => (pxToCm(imgSize) * 10) / 100;
