export const COLLAGE_SIZE = 1080;
export const COLLAGE_MAX = 4;
const GAP = 8;

export function parseListingImages(images?: string | string[] | null, main?: string | null): string[] {
  let list: string[] = [];
  if (Array.isArray(images)) list = images;
  else if (images) list = images.split(images.includes('|') ? '|' : ',');
  list = list.map(s => s.trim()).filter(Boolean);
  if (main && !list.includes(main)) list.unshift(main);
  return Array.from(new Set(list));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`img ${url}`));
    img.src = url;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

type Cell = [number, number, number, number];

function layout(n: number): Cell[] {
  const S = COLLAGE_SIZE;
  const half = (S - GAP) / 2;
  const far = half + GAP;
  if (n <= 1) return [[0, 0, S, S]];
  if (n === 2) return [[0, 0, S, half], [0, far, S, half]];
  if (n === 3) return [[0, 0, half, half], [far, 0, half, half], [0, far, S, half]];
  return [[0, 0, half, half], [far, 0, half, half], [0, far, half, half], [far, far, half, half]];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Собирает квадратный коллаж 1080×1080 (сетка 2×2) из до 4 фото объекта.
 * Поверх — маленький логотип (слева сверху) и номер объекта (справа снизу).
 * Возвращает JPEG и PNG (PNG нужен для копирования картинки в буфер обмена).
 */
export async function buildPhotoCollage(urls: string[], listingId?: number, logoUrl?: string | null): Promise<{ jpg: Blob; png: Blob }> {
  const picked = urls.slice(0, COLLAGE_MAX);
  const loaded = (await Promise.all(picked.map(u => loadImage(u).catch(() => null)))).filter(Boolean) as HTMLImageElement[];
  if (!loaded.length) throw new Error('no images');

  const S = COLLAGE_SIZE;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  ctx.imageSmoothingQuality = 'high';
  layout(loaded.length).forEach(([x, y, w, h], i) => drawCover(ctx, loaded[i], x, y, w, h));

  if (logoUrl) {
    const logo = await loadImage(logoUrl).catch(() => null);
    if (logo) {
      const lh = 56;
      const lw = Math.min(260, (logo.naturalWidth / logo.naturalHeight) * lh);
      const realH = lw / (logo.naturalWidth / logo.naturalHeight);
      ctx.fillStyle = 'rgba(11,61,132,0.85)';
      roundRect(ctx, 20, 20, lw + 28, realH + 20, 14);
      ctx.fill();
      ctx.drawImage(logo, 34, 30, lw, realH);
    }
  }

  if (listingId) {
    const label = `№ ${listingId}`;
    ctx.font = '800 40px Montserrat, "Segoe UI", Arial, sans-serif';
    const tw = ctx.measureText(label).width;
    const bw = tw + 40;
    const bh = 64;
    ctx.fillStyle = 'rgba(11,61,132,0.9)';
    roundRect(ctx, S - bw - 20, S - bh - 20, bw, bh, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, S - bw - 20 + 20, S - 20 - bh / 2 + 2);
  }

  const toBlob = (type: string, q?: number) =>
    new Promise<Blob>((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('blob'))), type, q));
  const [jpg, png] = await Promise.all([toBlob('image/jpeg', 0.9), toBlob('image/png')]);
  return { jpg, png };
}
