import { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { fetchPublicSettings, generatePresentation } from '@/lib/api';
import { buildSocialPostText, boldToHtml, stripBold, TELEGRAM_CAPTION_LIMIT, SocialPostCompany } from '@/lib/socialPostText';
import { copyText } from '@/hooks/useSharePresentation';
import { buildPhotoCollage, parseListingImages, COLLAGE_MAX } from '@/lib/photoCollage';
import { useIsMobile } from '@/hooks/use-mobile';
import { listingSlug } from '@/lib/slug';
import { Listing } from './types';

export type Flash = 'text' | 'all' | 'photo' | 'tg' | 'vk' | null;
export type PicMode = 'photos' | 'card';
export type LinkSrc = 'telegram' | 'vk' | 'social';
export const LINK_SRC_LABEL: Record<LinkSrc, string> = { telegram: 'Телеграм', vk: 'ВК', social: 'Другие' };
const LINK_PREF_KEY = 'social_post_link_on';
export type Pic = { blob: Blob; png: Blob | null; url: string };
export type PicState = 'loading' | 'ready' | 'error';

async function copyRich(text: string): Promise<boolean> {
  const plain = stripBold(text);
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([boldToHtml(text)], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      return true;
    }
  } catch {
    // запасной способ ниже
  }
  return copyText(plain);
}

async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  cv.getContext('2d')!.drawImage(bmp, 0, 0);
  return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('png'))), 'image/png'));
}

function loadCompany(): Promise<SocialPostCompany & { logo?: string; site?: string }> {
  return fetchPublicSettings()
    .then(st => ({ phone: st.company_phone, nick: st.share_contact_nick, partnerText: st.share_partner_text, logo: st.logo_url, site: st.site_url }))
    .catch(() => ({}));
}

/** Вся логика окна «Пост для соцсетей»: данные объекта, коллаж/карточка, текст, ссылка, копирование и отправка. */
export function useSocialPostDialog(open: boolean, listing: Partial<Listing>) {
  const [full, setFull] = useState<Partial<Listing>>(listing);
  const [company, setCompany] = useState<(SocialPostCompany & { logo?: string; site?: string }) | null>(null);
  const [linkOn, setLinkOn] = useState(() => { try { return localStorage.getItem(LINK_PREF_KEY) === '1'; } catch { return false; } });
  const [linkSrc, setLinkSrc] = useState<LinkSrc>('telegram');
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [picMode, setPicMode] = useState<PicMode>('photos');
  const [pics, setPics] = useState<Record<PicMode, Pic | null>>({ photos: null, card: null });
  const [picState, setPicState] = useState<Record<PicMode, PicState>>({ photos: 'loading', card: 'loading' });
  const [selected, setSelected] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  const [textTab, setTextTab] = useState<'preview' | 'edit'>('preview');
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open || !listing.id) return;
    setFull(listing);
    setEdited(false);
    setSelected(null);
    loadCompany().then(setCompany);
    adminApi.getListing(listing.id)
      .then((r: { listing?: Partial<Listing> }) => { if (r.listing) setFull({ ...listing, ...r.listing }); })
      .catch(() => undefined);
  }, [open, listing]);

  const allImages = useMemo(() => parseListingImages(full.images, full.image), [full.images, full.image]);
  const chosen = useMemo(
    () => (selected ?? allImages.slice(0, COLLAGE_MAX)).filter(u => allImages.includes(u)),
    [selected, allImages],
  );

  const setPic = (m: PicMode, p: Pic | null, st: PicState) => {
    setPics(prev => {
      if (prev[m] && prev[m] !== p) URL.revokeObjectURL(prev[m]!.url);
      return { ...prev, [m]: p };
    });
    setPicState(prev => ({ ...prev, [m]: st }));
  };

  const loadCard = async () => {
    if (!listing.id) return;
    setPicState(prev => ({ ...prev, card: 'loading' }));
    try {
      const r = await generatePresentation(listing.id);
      if ('error' in r) throw new Error(r.error);
      const blob = await (await fetch(r.url)).blob();
      const png = await toPng(blob).catch(() => null);
      setPic('card', { blob, png, url: URL.createObjectURL(blob) }, 'ready');
    } catch {
      setPicState(prev => ({ ...prev, card: 'error' }));
    }
  };

  const chosenKey = chosen.join('|');
  const logoUrl = company?.logo;
  const hasCompany = !!company;
  useEffect(() => {
    if (!open || !hasCompany) return;
    if (!chosen.length) { setPicState(prev => ({ ...prev, photos: 'error' })); return; }
    let cancelled = false;
    setPicState(prev => ({ ...prev, photos: 'loading' }));
    const t = setTimeout(() => {
      buildPhotoCollage(chosen, listing.id, logoUrl)
        .then(({ jpg, png }) => { if (!cancelled) setPic('photos', { blob: jpg, png, url: URL.createObjectURL(jpg) }, 'ready'); })
        .catch(() => { if (!cancelled) setPicState(prev => ({ ...prev, photos: 'error' })); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, chosenKey, logoUrl, listing.id, hasCompany]);

  useEffect(() => {
    if (open && picMode === 'card' && !pics.card && picState.card !== 'error') loadCard();
  }, [open, picMode]);

  const picsRef = useRef(pics);
  picsRef.current = pics;
  useEffect(() => () => {
    Object.values(picsRef.current).forEach(p => p && URL.revokeObjectURL(p.url));
  }, []);

  const photo = pics[picMode];
  const photoState = picState[picMode];

  const toggleImage = (url: string) => {
    const cur = chosen;
    if (cur.includes(url)) {
      if (cur.length > 1) setSelected(cur.filter(u => u !== url));
    } else if (cur.length < COLLAGE_MAX) {
      setSelected([...cur, url]);
    } else {
      setSelected([...cur.slice(0, COLLAGE_MAX - 1), url]);
    }
  };

  const makeMain = (url: string) => setSelected([url, ...chosen.filter(u => u !== url)].slice(0, COLLAGE_MAX));

  const generated = useMemo(() => (company ? buildSocialPostText(full, company) : ''), [full, company]);
  useEffect(() => { if (!edited) setText(generated); }, [generated, edited]);

  const toggleLink = (v: boolean) => {
    setLinkOn(v);
    try { localStorage.setItem(LINK_PREF_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  };

  const objectUrl = (src: LinkSrc) => {
    if (!listing.id) return '';
    const base = (company?.site || window.location.origin).replace(/\/+$/, '');
    const slug = listingSlug(full.title || '', listing.id);
    const qs = new URLSearchParams({ utm_source: src, utm_medium: 'social_post', utm_campaign: `object_${listing.id}` });
    return `${base}/object/${slug}?${qs.toString()}`;
  };

  const withLink = (src: LinkSrc = linkSrc) => (linkOn && text ? `${text.trimEnd()}\n\n🔗 Подробнее: ${objectUrl(src)}` : text);

  const finalText = withLink();
  const plain = stripBold(finalText);
  const len = plain.length;
  const tgOver = len > TELEGRAM_CAPTION_LIMIT;
  const fileName = `obekt-${listing.id}-${picMode === 'photos' ? 'foto' : 'kartochka'}.jpg`;

  const showFlash = (f: Flash) => { setFlash(f); setTimeout(() => setFlash(null), 2500); };

  const copyPostText = async () => {
    if (await copyRich(finalText)) showFlash('text');
    else alert('Не удалось скопировать. Выделите текст и скопируйте вручную.');
  };

  const downloadPhoto = () => {
    if (!photo) return;
    const a = document.createElement('a');
    a.href = photo.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyAll = async () => {
    if (!photo?.png) return;
    const t = withLink(linkSrc);
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'image/png': photo.png,
        'text/html': new Blob([boldToHtml(t)], { type: 'text/html' }),
        'text/plain': new Blob([stripBold(t)], { type: 'text/plain' }),
      })]);
      showFlash('all');
    } catch {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': photo.png })]);
        alert('Фото скопировано. Текст браузер вместе с фото скопировать не дал — после вставки фото нажмите «Скопировать текст».');
      } catch {
        downloadPhoto();
        await copyRich(t);
        alert('Браузер не разрешил копировать фото — карточка скачана, а текст скопирован.');
      }
    }
  };

  const sendFromPhone = async () => {
    if (!photo) return;
    const file = new File([photo.blob], fileName, { type: photo.blob.type || 'image/jpeg' });
    setSending(true);
    try {
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await copyText(plain);
        await navigator.share({ files: [file], text: plain });
      } else {
        downloadPhoto();
        await copyRich(finalText);
        showFlash('text');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') alert('Не удалось поделиться. Попробуйте «Скачать фото» и «Скопировать текст».');
    } finally {
      setSending(false);
    }
  };

  const canCopyImage = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write && !!photo?.png;
  const canNativeShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
  const picReady = photoState === 'ready' && !!photo;

  const openApp = async (app: 'tg' | 'vk') => {
    const t = withLink(app === 'tg' ? 'telegram' : 'vk');
    await copyRich(t);
    showFlash(app);
    if (app === 'tg') window.location.href = `tg://msg?text=${encodeURIComponent(stripBold(t))}`;
    else window.open('https://vk.com/feed', '_blank', 'noopener');
  };

  const savePhoto = () => { downloadPhoto(); showFlash('photo'); };

  return {
    isMobile, company, picMode, setPicMode, photo, photoState, allImages, loadCard,
    chosen, selected, setSelected, toggleImage, makeMain,
    text, setText, edited, setEdited, generated, textTab, setTextTab, finalText,
    linkOn, toggleLink, linkSrc, setLinkSrc, len, tgOver,
    flash, sending, picReady, canCopyImage, canNativeShare,
    copyPostText, copyAll, sendFromPhone, openApp, savePhoto,
  };
}

export type SocialPostState = ReturnType<typeof useSocialPostDialog>;
