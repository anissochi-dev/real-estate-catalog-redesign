import QRCode from 'qrcode';
import { FONT_FAMILY } from './QrBannerTypes';

export const QR_LABEL_MAX_SHARE = 0.28;

export function siteLabelFromUrl(siteUrl?: string | null): string {
  if (!siteUrl) return '';
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, '');
  } catch {
    return siteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  }
}

interface Opts {
  size: number;
  dark: string;
  light?: string;
  margin?: number;
  label?: string;
}

export async function makeQrWithLabel(text: string, { size, dark, light = '#00000000', margin = 1, label }: Opts): Promise<string> {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const total = n + margin * 2;
  const cell = Math.max(1, Math.floor(size / total));
  const px = cell * total;

  const cv = document.createElement('canvas');
  cv.width = px;
  cv.height = px;
  const ctx = cv.getContext('2d')!;
  if (light !== '#00000000') {
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, px, px);
  }
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
    }
  }

  if (label) {
    if (document.fonts?.load) {
      await document.fonts.load(`800 20px ${FONT_FAMILY}`).catch(() => undefined);
    }
    const maxW = n * cell * QR_LABEL_MAX_SHARE;
    let fs = Math.round(maxW / 2);
    ctx.font = `800 ${fs}px ${FONT_FAMILY}`;
    const padX = () => fs * 0.35;
    while (fs > 4 && ctx.measureText(label).width + padX() * 2 > maxW) {
      fs -= 1;
      ctx.font = `800 ${fs}px ${FONT_FAMILY}`;
    }
    const tw = ctx.measureText(label).width;
    const boxW = Math.min(maxW, tw + padX() * 2);
    const boxH = fs * 1.6;
    const cx = px / 2;
    const cy = px / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, Math.min(boxH / 3, cell * 2));
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + fs * 0.05);
  }
  return cv.toDataURL('image/png');
}
