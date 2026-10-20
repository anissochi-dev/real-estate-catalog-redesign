import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { adminApi, uploadFileEx } from '@/lib/adminApi';
import { Listing } from './types';
import type { CanvasProps } from './QrBannerCanvas';
import { ColorPicker, SizePanel, EditorPanel, TextPanel, ImagesPanel, DownloadPanel } from './QrBannerControls';
import { PrintPanel } from './QrBannerPrintPanel';
import { TemplatesPanel, QrTemplate } from './QrBannerTemplates';
import {
  BrokerInfo, BannerElement, ElementId, Pos, ManualSizes,
  PX_PER_CM, layoutElements, elementIssue, sizeFromCm, qrPadPx, sizeLabelMetrics,
  FONT_FAMILY, BASELINE, DEAL_WEIGHT, PHONE_WEIGHT, LABEL_WEIGHT, DEAL_LS, PHONE_LS, PHONE_PLACEHOLDER,
} from './QrBannerTypes';

interface Props { listing: Listing; siteUrl?: string }

const isTextId = (id: ElementId) => id === 'deal' || id === 'phone';

export function TabQrBanner({ listing, siteUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(480);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [broker, setBroker] = useState<BrokerInfo | null>(null);

  // ── реальная ширина контейнера ────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.getBoundingClientRect().width;
      if (w > 0) setContainerW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    // также слушаем resize окна — на мобиле modal может открыться позже
    window.addEventListener('resize', measure);
    // небольшая задержка на случай анимации открытия modal
    const t = setTimeout(measure, 150);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); clearTimeout(t); };
  }, []);

  const [bgColor, setBgColor] = useState('#facc15');
  const [textColor, setTextColor] = useState('#dc2626');

  const [elements, setElements] = useState<BannerElement[]>([]);
  const [dealText, setDealText] = useState('');
  const [phoneText, setPhoneText] = useState('');

  const [logoUrl, setLogoUrl] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [selected, setSelected] = useState<ElementId | null>(null);
  const [showSize, setShowSize] = useState(true);
  const [cmW, setCmW] = useState('100');
  const [cmH, setCmH] = useState('40');

  const [downloading, setDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpg' | 'pdf'>('png');

  const publicUrl = siteUrl && listing.slug
    ? `${siteUrl.replace(/\/$/, '')}/object/${listing.slug}` : null;

  // ── размеры баннера (px для рендера) ──────────────────────────────────────
  const numCmW = Math.max(1, parseFloat(cmW) || 1);
  const numCmH = Math.max(1, parseFloat(cmH) || 1);
  const sqM = ((numCmW * numCmH) / 10000).toFixed(4).replace(/\.?0+$/, '');
  const bannerW = Math.round(numCmW * PX_PER_CM);
  const bannerH = Math.round(numCmH * PX_PER_CM);

  // ── масштаб превью ────────────────────────────────────────────────────────
  const MAX_PREVIEW_H = 260;
  // вычитаем p-4 (16px × 2 = 32px) и ещё 16px запаса чтобы гарантированно не вылезало
  const availableW = Math.max(60, containerW - 48);
  const previewScale = Math.min(availableW / bannerW, MAX_PREVIEW_H / bannerH, 1);
  const scaledH = Math.round(bannerH * previewScale);
  const previewH = Math.max(80, scaledH + 16);

  // ── элементы: авто-раскладка в долях от размера баннера ──────────────────
  const [manual, setManual] = useState<ManualSizes>({});
  const [fontsReady, setFontsReady] = useState(0);
  const movedRef = useRef<Set<ElementId>>(new Set());
  const dimsRef = useRef<{ w: number; h: number } | null>(null);
  const pendingTplRef = useRef<{ w: number; h: number; els: BannerElement[] } | null>(null);

  useEffect(() => {
    if (!document.fonts) return;
    Promise.all([
      document.fonts.load(`${DEAL_WEIGHT} 100px Montserrat`),
      document.fonts.load(`${PHONE_WEIGHT} 100px Montserrat`),
      document.fonts.load(`${LABEL_WEIGHT} 100px Montserrat`),
    ]).then(() => setFontsReady(v => v + 1)).catch(() => {});
  }, []);

  useEffect(() => {
    const prevDims = dimsRef.current;
    const sizeChanged = !prevDims || prevDims.w !== bannerW || prevDims.h !== bannerH;
    dimsRef.current = { w: bannerW, h: bannerH };
    if (sizeChanged) movedRef.current = new Set();
    const moved = movedRef.current;
    const tpl = pendingTplRef.current;
    if (tpl && tpl.w === bannerW && tpl.h === bannerH) {
      pendingTplRef.current = null;
      setElements(prev => {
        const next = layoutElements(bannerW, bannerH, { dealText, phoneText }, manual, prev, prevDims ?? undefined)
          .filter(n => !tpl.els.some(t => t.id === n.id) || n.id === 'deal' || n.id === 'phone' || n.id === 'qr');
        const merged = next.map(n => {
          const t = tpl.els.find(e => e.id === n.id);
          return t ? { ...n, pos: t.pos } : n;
        });
        const extras = tpl.els.filter(t => !merged.some(m => m.id === t.id));
        tpl.els.forEach(t => moved.add(t.id));
        return [...merged, ...extras];
      });
      setSelected(null);
      return;
    }
    setElements(prev => {
      const next = layoutElements(bannerW, bannerH, { dealText, phoneText }, manual, prev, prevDims ?? undefined);
      if (sizeChanged) return next;
      return next.map(n => {
        if (!moved.has(n.id)) return n;
        const p = prev.find(e => e.id === n.id);
        return p ? { ...n, pos: p.pos } : n;
      });
    });
    if (sizeChanged) setSelected(null);
  }, [bannerW, bannerH, dealText, phoneText, manual, fontsReady]);

  const resetPositions = () => {
    movedRef.current = new Set();
    setManual({});
    setElements(prev => layoutElements(bannerW, bannerH, { dealText, phoneText }, {}, prev));
    setSelected(null);
  };

  const addImageElement = (id: 'logo' | 'photo') => {
    const m = Math.round(Math.min(bannerW, bannerH) * 0.07);
    const size = Math.round(bannerH * (id === 'logo' ? 0.28 : 0.4));
    const pos = id === 'logo' ? { x: m, y: m } : { x: m, y: bannerH - size - m };
    movedRef.current.add(id);
    setManual(prev => { const n = { ...prev }; delete n[id]; return n; });
    setElements(prev => [...prev.filter(e => e.id !== id), { id, pos, imgSize: size }]);
  };
  const removeImageElement = (id: 'logo' | 'photo') => {
    setElements(prev => prev.filter(e => e.id !== id));
    setManual(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (selected === id) setSelected(null);
  };

  const addLogoElement = (url: string) => { setLogoUrl(url); addImageElement('logo'); };
  const removeLogoElement = () => { setLogoUrl(''); removeImageElement('logo'); };
  const addPhotoElement = (url: string) => { setPhotoUrl(url); addImageElement('photo'); };
  const removePhotoElement = () => { setPhotoUrl(''); removeImageElement('photo'); };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    try { const r = await uploadFileEx(file, 'logo'); addLogoElement(r.url); }
    catch { alert('Ошибка загрузки логотипа'); } finally { setUploadingLogo(false); }
  };
  const uploadPhoto = async (file: File) => {
    setUploadingPhoto(true);
    try { const r = await uploadFileEx(file, 'photos'); addPhotoElement(r.url); }
    catch { alert('Ошибка загрузки фото'); } finally { setUploadingPhoto(false); }
  };
  const useListingPhoto = () => { if (listing.image) addPhotoElement(listing.image); };

  // ── данные ────────────────────────────────────────────────────────────────
  useEffect(() => {
    adminApi.listUsers().then(r => {
      const all: BrokerInfo[] = r.users || [];
      const brokerId = (listing as unknown as Record<string, unknown>).broker_id as number | null;
      if (brokerId) { const f = all.find(u => u.id === brokerId); if (f) { setBroker(f); return; } }
      const authorId = (listing as unknown as Record<string, unknown>).author_id as number | null;
      if (authorId) { const f = all.find(u => u.id === authorId); if (f) setBroker(f); }
    });
  }, [listing]);

  useEffect(() => { setDealText(listing.deal === 'rent' ? 'СДАЮ' : 'ПРОДАЮ'); }, [listing.deal]);
  useEffect(() => {
    const p = broker?.phone || (listing as unknown as Record<string, unknown>).owner_phone as string || '';
    setPhoneText(p);
  }, [broker, listing]);

  // ── QR ────────────────────────────────────────────────────────────────────
  const qrBase = publicUrl || `${window.location.origin}/object/${listing.id}`;
  const qrUrl = `${qrBase}${qrBase.includes('?') ? '&' : '?'}from=qr`;

  const generateQr = useCallback(async () => {
    const url = qrUrl;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1, color: { dark: textColor, light: '#00000000' } });
      setQrDataUrl(dataUrl);
    } catch { setQrDataUrl(''); }
  }, [qrUrl, textColor]);

  useEffect(() => { generateQr(); }, [generateQr]);

  const buildPrintParams = () => ({
    listing_id: listing.id,
    width_cm: numCmW, height_cm: numCmH,
    bg_color: bgColor, text_color: textColor,
    deal_text: dealText, phone_text: phoneText,
    qr_url: qrUrl,
    photo_url: photoUrl || undefined, logo_url: logoUrl || undefined,
    show_size: showSize,
    size_label_w: numCmW, size_label_h: numCmH,
    elements: elements
      .filter(e => (e.id !== 'logo' || logoUrl) && (e.id !== 'photo' || photoUrl))
      .map(e => ({ id: e.id, pos: { x: Math.round(e.pos.x * 100) / 100, y: Math.round(e.pos.y * 100) / 100 }, fontSize: e.fontSize, imgSize: e.imgSize })),
  });

  // ── редактор ──────────────────────────────────────────────────────────────
  const updatePos = (id: ElementId, pos: Pos) => {
    movedRef.current.add(id);
    setElements(prev => prev.map(e => e.id === id ? { ...e, pos } : e));
  };

  const selectedEl = elements.find(e => e.id === selected);

  const setSelectedCm = (cm: number) => {
    if (!selected) return;
    const maxSide = Math.max(bannerW, bannerH) * 2;
    const v = Math.max(4, Math.min(maxSide, sizeFromCm(selected, cm)));
    setManual(prev => ({ ...prev, [selected]: v }));
  };
  const setSelectedAuto = () => {
    if (!selected) return;
    setManual(prev => { const n = { ...prev }; delete n[selected]; return n; });
  };

  const textOpts = { dealText, phoneText };
  const issues = elements
    .filter(e => (e.id !== 'logo' || logoUrl) && (e.id !== 'photo' || photoUrl))
    .map(e => ({ id: e.id, kind: elementIssue(e, bannerW, bannerH, textOpts) }))
    .filter((i): i is { id: ElementId; kind: 'out' | 'edge' } => i.kind !== null);

  // ── шаблоны ───────────────────────────────────────────────────────────────
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const buildTemplate = () => ({
    width_cm: numCmW, height_cm: numCmH,
    bg_color: bgColor, text_color: textColor, show_size: showSize,
    logo_url: logoUrl,
    elements: elements
      .filter(e => (e.id !== 'logo' || logoUrl) && (e.id !== 'photo' || photoUrl))
      .map(e => ({
        id: e.id,
        x_cm: r2(e.pos.x / PX_PER_CM), y_cm: r2(e.pos.y / PX_PER_CM),
        size_cm: r2(((isTextId(e.id) ? e.fontSize : e.imgSize) ?? 20) / PX_PER_CM),
        manual: manual[e.id] !== undefined || e.id === 'logo' || e.id === 'photo',
      })),
  });

  const applyTemplate = (t: QrTemplate) => {
    const w = Math.round(t.width_cm * PX_PER_CM);
    const h = Math.round(t.height_cm * PX_PER_CM);
    const c = t.config || ({} as QrTemplate['config']);
    const tplLogo = c.logo_url || '';
    const els: BannerElement[] = [];
    const nextManual: ManualSizes = {};
    for (const e of c.elements || []) {
      if (e.id === 'logo' && !tplLogo && !logoUrl) continue;
      if (e.id === 'photo' && !photoUrl) continue;
      const size = Math.max(4, Math.round(e.size_cm * PX_PER_CM));
      const el: BannerElement = { id: e.id, pos: { x: e.x_cm * PX_PER_CM, y: e.y_cm * PX_PER_CM } };
      if (isTextId(e.id)) el.fontSize = size; else el.imgSize = size;
      nextManual[e.id] = size;
      els.push(el);
    }
    if (c.bg_color) setBgColor(c.bg_color);
    if (c.text_color) setTextColor(c.text_color);
    setShowSize(c.show_size !== false);
    if (tplLogo) setLogoUrl(tplLogo);
    pendingTplRef.current = { w, h, els };
    setCmW(String(t.width_cm));
    setCmH(String(t.height_cm));
    setManual(nextManual);
  };

  // ── скачивание через Canvas API (без html2canvas) ─────────────────────────
  const download = async () => {
    setDownloading(true);
    try {
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
          const img = await loadImg(qrDataUrl);
          const sz = qrEl.imgSize ?? 80;
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

      const name = `banner-${listing.id}`;
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
    } catch { alert('Ошибка при скачивании'); } finally { setDownloading(false); }
  };

  const downloadQr = async () => {
    if (!qrDataUrl) return;
    // 3м × 2м при 150 DPI = 1772 × 1181 px — стандарт для крупной печати
    const PX_W = 1772;
    const PX_H = 1181;
    const url = publicUrl || `${window.location.origin}/object/${listing.id}`;
    try {
      // Генерируем QR в нужном разрешении
      const hiResQr = await QRCode.toDataURL(url, {
        width: Math.min(PX_W, PX_H) - 80,
        margin: 2,
        color: { dark: textColor, light: '#ffffff' },
        errorCorrectionLevel: 'H',
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
        a.download = `qr-3x2m-${listing.id}.png`;
        a.click();
        URL.revokeObjectURL(objUrl);
      }, 'image/png', 1);
    } catch {
      // fallback на оригинальный QR
      const a = document.createElement('a'); a.href = qrDataUrl; a.download = `qr-${listing.id}.png`; a.click();
    }
  };

  // ── сборка ────────────────────────────────────────────────────────────────
  const canvasProps: Omit<CanvasProps, 'bannerRef' | 'exportMode'> = {
    bannerW, bannerH, bg: bgColor, textColor, elements, dealText, phoneText,
    qrDataUrl, logoUrl, photoUrl,
    selected, onSelect: setSelected, onDragMove: updatePos,
    showSize, cmW: numCmW, cmH: numCmH,
  };

  if (elements.length === 0) return null;

  return (
    <div ref={containerRef} className="p-4 space-y-4">

      {/* 1. Телефон и текст сделки — главные данные сразу видны */}
      <TextPanel
        dealText={dealText} setDealText={setDealText}
        phoneText={phoneText} setPhoneText={setPhoneText}
      />

      {/* 2. Редактор — превью баннера */}
      <EditorPanel
        canvasProps={canvasProps}
        bannerW={bannerW} bannerH={bannerH}
        previewScale={previewScale}
        previewH={previewH}
        numCmW={numCmW} numCmH={numCmH}
        selected={selected}
        selectedEl={selectedEl}
        selectedManual={!!selected && manual[selected] !== undefined}
        issues={issues}
        onResetPositions={resetPositions}
        onSetCm={setSelectedCm}
        onSetAuto={setSelectedAuto}
        onDeselect={() => setSelected(null)}
      />

      {/* 3. Цвета */}
      <ColorPicker
        bgColor={bgColor} setBgColor={setBgColor}
        textColor={textColor} setTextColor={setTextColor}
      />

      {/* 4. Размеры для печати */}
      <SizePanel
        cmW={cmW} setCmW={setCmW}
        cmH={cmH} setCmH={setCmH}
        numCmW={numCmW} numCmH={numCmH}
        sqM={sqM}
        showSize={showSize} setShowSize={setShowSize}
      />

      {/* 4a. Шаблоны */}
      <TemplatesPanel
        onApply={applyTemplate}
        buildTemplate={buildTemplate}
        widthCm={numCmW} heightCm={numCmH}
      />

      {/* 5. Изображения */}
      <ImagesPanel
        logoUrl={logoUrl} uploadingLogo={uploadingLogo}
        photoUrl={photoUrl} uploadingPhoto={uploadingPhoto}
        hasListingImage={!!listing.image}
        onUploadLogo={uploadLogo} onRemoveLogo={removeLogoElement}
        onUploadPhoto={uploadPhoto} onRemovePhoto={removePhotoElement}
        onUseListingPhoto={useListingPhoto}
      />

      {/* 6. Файл для типографии */}
      <PrintPanel
        widthCm={numCmW} heightCm={numCmH}
        disabled={!qrUrl}
        buildParams={buildPrintParams}
        issuesCount={issues.length}
      />

      {/* 7. Скачать */}
      <DownloadPanel
        downloadFormat={downloadFormat} setDownloadFormat={setDownloadFormat}
        downloading={downloading} qrDataUrl={qrDataUrl}
        onDownload={download} onDownloadQr={downloadQr}
      />

    </div>
  );
}