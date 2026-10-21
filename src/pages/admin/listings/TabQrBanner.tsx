import { useEffect, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { adminApi, uploadFileEx } from '@/lib/adminApi';
import { Listing } from './types';
import type { CanvasProps } from './QrBannerCanvas';
import { ColorPicker, SizePanel, EditorPanel, TextPanel, ImagesPanel, DownloadPanel } from './QrBannerControls';
import { PrintPanel } from './QrBannerPrintPanel';
import { TemplatesPanel, QrTemplate } from './QrBannerTemplates';
import { useContainerWidth } from './useContainerWidth';
import { useQrBannerLayout } from './useQrBannerLayout';
import { renderBannerDownload, downloadQrHiRes } from './qrBannerExport';
import {
  BrokerInfo, BannerElement, ElementId, ManualSizes,
  PX_PER_CM, elementIssue,
} from './QrBannerTypes';

interface Props { listing: Listing; siteUrl?: string }

const isTextId = (id: ElementId) => id === 'deal' || id === 'phone';

export function TabQrBanner({ listing, siteUrl }: Props) {
  const { containerRef, containerW } = useContainerWidth(480);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [broker, setBroker] = useState<BrokerInfo | null>(null);

  const [bgColor, setBgColor] = useState('#facc15');
  const [textColor, setTextColor] = useState('#dc2626');

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

  const {
    elements, manual, setManual, pendingTplRef,
    resetPositions, addImageElement, removeImageElement,
    updatePos, setSelectedCm, setSelectedAuto,
  } = useQrBannerLayout({ bannerW, bannerH, dealText, phoneText, selected, setSelected });

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

  const selectedEl = elements.find(e => e.id === selected);

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
      await renderBannerDownload({
        listingId: listing.id, bannerW, bannerH, bgColor, textColor, elements, dealText, phoneText,
        qrDataUrl, logoUrl, photoUrl, showSize, numCmW, numCmH, downloadFormat,
      });
    } catch { alert('Ошибка при скачивании'); } finally { setDownloading(false); }
  };

  const downloadQr = () => downloadQrHiRes(qrDataUrl, publicUrl, listing.id, textColor);

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
        listingId={listing.id}
        listingTitle={listing.title}
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

export default TabQrBanner;