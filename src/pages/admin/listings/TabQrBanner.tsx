import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { adminApi, uploadFileEx } from '@/lib/adminApi';
import { Listing } from './types';
import { BannerCanvas } from './QrBannerCanvas';
import type { CanvasProps } from './QrBannerCanvas';
import { ColorPicker, SizePanel, EditorPanel, TextPanel, ImagesPanel, DownloadPanel } from './QrBannerControls';
import {
  BrokerInfo, BannerElement, ElementId, Pos,
  PX_PER_CM, makeElements,
} from './QrBannerTypes';

interface Props { listing: Listing; siteUrl?: string }

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
  const [cmW, setCmW] = useState('30');
  const [cmH, setCmH] = useState('9');

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
  const scaledW = Math.round(bannerW * previewScale);
  const scaledH = Math.round(bannerH * previewScale);
  const previewH = Math.max(80, scaledH + 16);

  // ── элементы ──────────────────────────────────────────────────────────────
  const prevElsRef = useRef<BannerElement[]>([]);

  useEffect(() => {
    setElements(prev => {
      const next = makeElements(bannerW, bannerH, prev);
      prevElsRef.current = next;
      return next;
    });
    setSelected(null);
   
  }, [bannerW, bannerH]);

  const resetPositions = () => {
    setElements(prev => makeElements(bannerW, bannerH, prev));
    setSelected(null);
  };

  const addLogoElement = (url: string) => {
    setLogoUrl(url);
    setElements(prev => [...prev.filter(e => e.id !== 'logo'), { id: 'logo', pos: { x: 16, y: 16 }, imgSize: Math.round(bannerH * 0.28) }]);
  };
  const removeLogoElement = () => {
    setLogoUrl(''); setElements(prev => prev.filter(e => e.id !== 'logo'));
    if (selected === 'logo') setSelected(null);
  };
  const addPhotoElement = (url: string) => {
    setPhotoUrl(url);
    setElements(prev => [...prev.filter(e => e.id !== 'photo'), { id: 'photo', pos: { x: 16, y: bannerH - Math.round(bannerH * 0.45) - 16 }, imgSize: Math.round(bannerH * 0.4) }]);
  };
  const removePhotoElement = () => {
    setPhotoUrl(''); setElements(prev => prev.filter(e => e.id !== 'photo'));
    if (selected === 'photo') setSelected(null);
  };

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

  // ── QR ────────────────────────────────────────────────────────────────────
  const generateQr = useCallback(async () => {
    const url = publicUrl || `${window.location.origin}/object/${listing.id}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1, color: { dark: textColor, light: '#00000000' } });
      setQrDataUrl(dataUrl);
    } catch { setQrDataUrl(''); }
  }, [publicUrl, listing.id, textColor]);

  useEffect(() => { generateQr(); }, [generateQr]);

  // ── редактор ──────────────────────────────────────────────────────────────
  const updatePos = (id: ElementId, pos: Pos) =>
    setElements(prev => prev.map(e => e.id === id ? { ...e, pos } : e));

  const selectedEl = elements.find(e => e.id === selected);

  const updateSize = (delta: number) => {
    if (!selected) return;
    if (selected === 'deal' || selected === 'phone') {
      setElements(prev => prev.map(e =>
        e.id === selected ? { ...e, fontSize: Math.max(8, Math.min(500, (e.fontSize ?? 20) + delta)) } : e
      ));
    } else {
      setElements(prev => prev.map(e =>
        e.id === selected ? { ...e, imgSize: Math.max(20, Math.min(600, (e.imgSize ?? 60) + delta)) } : e
      ));
    }
  };

  const applyPreset = (w: number, h: number) => { setCmW(String(w)); setCmH(String(h)); };

  // ── скачивание через Canvas API (без html2canvas) ─────────────────────────
  const download = async () => {
    setDownloading(true);
    try {
      const SCALE = 4;
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
      const dealEl = elements.find(e => e.id === 'deal');
      if (dealEl) {
        ctx.fillStyle = textColor;
        ctx.font = `900 ${dealEl.fontSize ?? 20}px Arial, sans-serif`;
        ctx.letterSpacing = '3px';
        ctx.fillText(dealText, dealEl.pos.x + 4, dealEl.pos.y + (dealEl.fontSize ?? 20));
      }

      // телефон
      const phoneEl = elements.find(e => e.id === 'phone');
      if (phoneEl) {
        ctx.fillStyle = textColor;
        ctx.font = `800 ${phoneEl.fontSize ?? 20}px Arial, sans-serif`;
        ctx.letterSpacing = '1px';
        ctx.fillText(phoneText || '+7 ─── ─── ────', phoneEl.pos.x + 4, phoneEl.pos.y + (phoneEl.fontSize ?? 20));
      }

      // QR-код
      const qrEl = elements.find(e => e.id === 'qr');
      if (qrEl && qrDataUrl) {
        try {
          const img = await loadImg(qrDataUrl);
          const sz = qrEl.imgSize ?? 80;
          ctx.save();
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(qrEl.pos.x, qrEl.pos.y, sz + 10, sz + 10, 10);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.restore();
          ctx.drawImage(img, qrEl.pos.x + 5, qrEl.pos.y + 5, sz, sz);
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
        const fs = Math.max(10, bannerH * 0.065);
        ctx.fillStyle = textColor;
        ctx.globalAlpha = 0.55;
        ctx.font = `700 ${fs}px Arial, sans-serif`;
        ctx.letterSpacing = '0.5px';
        ctx.fillText(label, bannerW - ctx.measureText(label).width - 10, bannerH - 8);
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

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a'); a.href = qrDataUrl; a.download = `qr-${listing.id}.png`; a.click();
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
        onResetPositions={resetPositions}
        onUpdateSize={updateSize}
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
        applyPreset={applyPreset}
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

      {/* 6. Скачать */}
      <DownloadPanel
        downloadFormat={downloadFormat} setDownloadFormat={setDownloadFormat}
        downloading={downloading} qrDataUrl={qrDataUrl}
        onDownload={download} onDownloadQr={downloadQr}
      />

    </div>
  );
}