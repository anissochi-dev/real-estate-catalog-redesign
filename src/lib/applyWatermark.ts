/**
 * Клиентское наложение водяного знака через Canvas.
 * Принимает File фото и настройки — возвращает новый File с водяным знаком.
 */

export interface WatermarkSettings {
  watermark_url?: string;
  watermark_enabled?: boolean;
  watermark_position?: string;
  watermark_opacity?: number;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  // Пробуем через fetch чтобы обойти CORS-ограничения CDN
  try {
    const res = await fetch(src, { mode: 'cors' });
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
      img.onerror = reject;
      img.src = objectUrl;
    });
  } catch {
    // Fallback: прямая загрузка через img tag
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function applyWatermarkClient(
  file: File,
  settings: WatermarkSettings,
): Promise<File> {
  if (!settings.watermark_enabled || !settings.watermark_url) return file;

  try {
    const dataUrl = await fileToDataUrl(file);
    const [baseImg, wmImg] = await Promise.all([
      loadImage(dataUrl),
      loadImage(settings.watermark_url),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = baseImg.naturalWidth;
    canvas.height = baseImg.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(baseImg, 0, 0);

    const wmRatio = (canvas.width * 0.22) / wmImg.naturalWidth;
    const wmW = Math.round(wmImg.naturalWidth * wmRatio);
    const wmH = Math.round(wmImg.naturalHeight * wmRatio);
    const margin = Math.round(canvas.width * 0.02);
    const opacity = ((settings.watermark_opacity ?? 50) / 100);

    let x = canvas.width - wmW - margin;
    let y = canvas.height - wmH - margin;
    const pos = settings.watermark_position || 'bottom-right';
    if (pos === 'bottom-left') { x = margin; y = canvas.height - wmH - margin; }
    else if (pos === 'top-right') { x = canvas.width - wmW - margin; y = margin; }
    else if (pos === 'top-left') { x = margin; y = margin; }
    else if (pos === 'center') { x = (canvas.width - wmW) / 2; y = (canvas.height - wmH) / 2; }

    ctx.globalAlpha = opacity;
    ctx.drawImage(wmImg, x, y, wmW, wmH);
    ctx.globalAlpha = 1;

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9)
    );
    if (!blob) return file;

    const newName = file.name.replace(/\.(jpe?g|png|webp|bmp|gif)$/i, '') + '_wm.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}