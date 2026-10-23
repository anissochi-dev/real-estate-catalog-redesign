import { makeQrWithLabel } from './qrWithLabel';
import { jsPDF } from 'jspdf';
import {
  BannerElement, qrPadPx, sizeLabelMetrics,
  FONT_FAMILY, BASELINE, DEAL_WEIGHT, PHONE_WEIGHT, LABEL_WEIGHT, DEAL_LS, PHONE_LS, PHONE_PLACEHOLDER,
} from './QrBannerTypes';

export interface BannerExportParams {
  listingId: number;
  bannerW: number;
  bannerH: number;
  bgColor: string;
  textColor: string;
  elements: BannerElement[];
  dealText: string;
  phoneText: string;
  qrDataUrl: string;
  qrText?: string;
  qrLabel?: string;
  logoUrl: string;
  photoUrl: string;
  showSize: boolean;
  numCmW: number;
  numCmH: number;
  downloadFormat: 'png' | 'jpg' | 'pdf';
}

// ── скачивание через Canvas API (без html2canvas) ─────────────────────────
export async function renderBannerDownload(p: BannerExportParams) {
  const {
    listingId, bannerW, bannerH, bgColor, textColor, elements, dealText, phoneText,
    qrDataUrl, qrText, qrLabel, logoUrl, photoUrl, showSize, numCmW, numCmH, downloadFormat,
  } = p;
  const SCALE = Math.max(1, Math.min(4, Math.sqrt(16_000_000 / (bannerW * bannerH)), 8000 / Math.max(bannerW, bannerH)));
  const W = bannerW * SCALE;
  const H = bannerH * SCALE;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // фон
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, bannerW, bannerH);

  // вспомогалка: загрузить изображение по url
  const loadImg = (src: string): Promise<HTMLImageElement> =>
    new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });

  // фото
  const photoEl = elements.find(e => e.id === 'photo');
  if (photoEl && photoUrl) {
    try {
      const img = await loadImg(photoUrl);
      const sz = photoEl.imgSize ?? 120;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(photoEl.pos.x, photoEl.pos.y, sz, sz, 10);
      ctx.clip();
      ctx.drawImage(img, photoEl.pos.x, photoEl.pos.y, sz, sz);
      ctx.restore();
    } catch { /* пропускаем если не загрузилось */ }
  }

  // надпись сделки
  const drawText = (text: string, weight: number, ls: number, el: BannerElement) => {
    const fs = el.fontSize ?? 20;
    ctx.fillStyle = textColor;
    ctx.font = `${weight} ${fs}px ${FONT_FAMILY}`;
    ctx.letterSpacing = `${ls * fs}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, el.pos.x, el.pos.y + fs * BASELINE);
    ctx.letterSpacing = '0px';
  };

  const dealEl = elements.find(e => e.id === 'deal');
  if (dealEl) drawText(dealText, DEAL_WEIGHT, DEAL_LS, dealEl);

  const phoneEl = elements.find(e => e.id === 'phone');
  if (phoneEl) drawText(phoneText || PHONE_PLACEHOLDER, PHONE_WEIGHT, PHONE_LS, phoneEl);

  // QR-код
  const qrEl = elements.find(e => e.id === 'qr');
  if (qrEl && qrDataUrl) {
    try {
      const sz = qrEl.imgSize ?? 80;
      const crisp = qrText
        ? await makeQrWithLabel(qrText, { size: Math.ceil(sz * SCALE), margin: 1, dark: textColor, label: qrLabel }).catch(() => qrDataUrl)
        : qrDataUrl;
      const img = await loadImg(crisp);
      const pad = qrPadPx(sz);
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(qrEl.pos.x, qrEl.pos.y, sz + 2 * pad, sz + 2 * pad, pad * 2);
      ctx.fill();
      ctx.restore();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, qrEl.pos.x + pad, qrEl.pos.y + pad, sz, sz);
      ctx.imageSmoothingEnabled = true;
    } catch { /* пропускаем */ }
  }

  // логотип
  const logoEl = elements.find(e => e.id === 'logo');
  if (logoEl && logoUrl) {
    try {
      const img = await loadImg(logoUrl);
      const sz = logoEl.imgSize ?? 70;
      ctx.drawImage(img, logoEl.pos.x, logoEl.pos.y, sz, sz);
    } catch { /* пропускаем */ }
  }

  // подпись размера
  if (showSize) {
    const label = `${numCmW} см × ${numCmH} см`;
    const { fontSize: fs, offset } = sizeLabelMetrics(bannerW, bannerH);
    ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.55;
    ctx.font = `${LABEL_WEIGHT} ${fs}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, bannerW - ctx.measureText(label).width - offset, bannerH - offset - fs * (1 - BASELINE));
    ctx.globalAlpha = 1;
  }

  const name = `banner-${listingId}`;
  if (downloadFormat === 'pdf') {
    const imgData = cv.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: W > H ? 'landscape' : 'portrait', unit: 'px', format: [bannerW, bannerH] });
    pdf.addImage(imgData, 'PNG', 0, 0, bannerW, bannerH);
    pdf.save(`${name}.pdf`);
  } else {
    const mime = downloadFormat === 'jpg' ? 'image/jpeg' : 'image/png';
    cv.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${name}.${downloadFormat}`; a.click();
      URL.revokeObjectURL(url);
    }, mime, downloadFormat === 'jpg' ? 0.92 : 1);
  }
}

export async function downloadQrHiRes(qrDataUrl: string, publicUrl: string | null, listingId: number, textColor: string, label?: string) {
  if (!qrDataUrl) return;
  // 3м × 2м при 150 DPI = 1772 × 1181 px — стандарт для крупной печати
  const PX_W = 1772;
  const PX_H = 1181;
  const url = publicUrl || `${window.location.origin}/object/${listingId}`;
  try {
    // Генерируем QR в нужном разрешении
    const hiResQr = await makeQrWithLabel(url, {
      size: Math.min(PX_W, PX_H) - 80,
      margin: 2,
      dark: textColor,
      light: '#ffffff',
      label,
    });
    const cv = document.createElement('canvas');
    cv.width = PX_W;
    cv.height = PX_H;
    const ctx = cv.getContext('2d')!;
    // Фон белый
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PX_W, PX_H);
    // QR по центру
    const qrImg = new window.Image();
    await new Promise<void>(res => { qrImg.onload = () => res(); qrImg.src = hiResQr; });
    const qrSize = Math.min(PX_W, PX_H) - 80;
    const qrX = Math.round((PX_W - qrSize) / 2);
    const qrY = Math.round((PX_H - qrSize) / 2);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    // Подпись размера
    ctx.fillStyle = '#999999';
    ctx.font = `500 28px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('3м × 2м · 150 DPI · для крупной печати', PX_W / 2, PX_H - 20);
    cv.toBlob(blob => {
      if (!blob) return;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `qr-3x2m-${listingId}.png`;
      a.click();
      URL.revokeObjectURL(objUrl);
    }, 'image/png', 1);
  } catch {
    // fallback на оригинальный QR
    const a = document.createElement('a'); a.href = qrDataUrl; a.download = `qr-${listingId}.png`; a.click();
  }
}

export default renderBannerDownload;
