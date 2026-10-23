import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { adminApi } from '@/lib/adminApi';
import { fetchPublicSettings, generatePresentation } from '@/lib/api';
import { buildSocialPostText, boldToHtml, stripBold, TELEGRAM_CAPTION_LIMIT, VK_POST_LIMIT, SocialPostCompany } from '@/lib/socialPostText';
import { copyText } from '@/hooks/useSharePresentation';
import { Listing } from './types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listing: Partial<Listing>;
}

type Flash = 'text' | 'all' | null;

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

function loadCompany(): Promise<SocialPostCompany> {
  return fetchPublicSettings()
    .then(st => ({ phone: st.company_phone, nick: st.share_contact_nick, partnerText: st.share_partner_text }))
    .catch(() => ({}));
}

export default function SocialPostDialog({ open, onOpenChange, listing }: Props) {
  const [full, setFull] = useState<Partial<Listing>>(listing);
  const [company, setCompany] = useState<SocialPostCompany | null>(null);
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; png: Blob | null; url: string } | null>(null);
  const [photoState, setPhotoState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !listing.id) return;
    setFull(listing);
    setEdited(false);
    loadCompany().then(setCompany);
    adminApi.getListing(listing.id)
      .then((r: { listing?: Partial<Listing> }) => { if (r.listing) setFull({ ...listing, ...r.listing }); })
      .catch(() => undefined);
  }, [open, listing]);

  const loadPhoto = async () => {
    if (!listing.id) return;
    setPhotoState('loading');
    try {
      const r = await generatePresentation(listing.id);
      if ('error' in r) throw new Error(r.error);
      const blob = await (await fetch(r.url)).blob();
      const png = await toPng(blob).catch(() => null);
      setPhoto(prev => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { blob, png, url: URL.createObjectURL(blob) };
      });
      setPhotoState('ready');
    } catch {
      setPhotoState('error');
    }
  };

  useEffect(() => {
    if (open) loadPhoto();
  }, [open, listing.id]);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const generated = useMemo(() => (company ? buildSocialPostText(full, company) : ''), [full, company]);
  useEffect(() => { if (!edited) setText(generated); }, [generated, edited]);

  const plain = stripBold(text);
  const len = plain.length;
  const tgOver = len > TELEGRAM_CAPTION_LIMIT;
  const fileName = `obekt-${listing.id}.jpg`;

  const showFlash = (f: Flash) => { setFlash(f); setTimeout(() => setFlash(null), 2500); };

  const copyPostText = async () => {
    if (await copyRich(text)) showFlash('text');
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
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'image/png': photo.png,
        'text/html': new Blob([boldToHtml(text)], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      showFlash('all');
    } catch {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': photo.png })]);
        alert('Фото скопировано. Текст браузер вместе с фото скопировать не дал — после вставки фото нажмите «Скопировать текст».');
      } catch {
        downloadPhoto();
        await copyRich(text);
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
        await copyRich(text);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="Megaphone" size={18} className="text-brand-blue" />
            Пост для соцсетей · объект #{listing.id}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-border overflow-hidden bg-muted/40">
          {photoState === 'loading' && (
            <div className="aspect-[4/3] flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Icon name="Loader2" size={22} className="animate-spin text-brand-blue" />
              Готовлю фото-карточку…
            </div>
          )}
          {photoState === 'error' && (
            <div className="aspect-[4/3] flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Icon name="ImageOff" size={22} />
              Не удалось подготовить фото-карточку
              <button type="button" onClick={loadPhoto} className="font-semibold text-brand-blue hover:underline">Попробовать ещё раз</button>
            </div>
          )}
          {photoState === 'ready' && photo && (
            <img src={photo.url} alt={`Фото-карточка объекта ${listing.id}`} className="w-full h-auto block" />
          )}
        </div>

        {!company ? (
          <div className="flex items-center justify-center py-10"><Icon name="Loader2" size={20} className="animate-spin text-brand-blue" /></div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); setEdited(true); }}
              rows={12}
              className="w-full px-3 py-2.5 border border-border rounded-xl text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
            <div className="-mt-1 space-y-1">
              <div className="text-[11px] text-muted-foreground">
                Так подпись будет выглядеть в Телеграме. Текст между <b>**звёздочками**</b> выделяется жирным.
              </div>
              <div
                className="max-h-48 overflow-y-auto px-3 py-2.5 rounded-xl bg-muted/50 text-sm leading-relaxed whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: boldToHtml(text).replace(/<br>/g, '\n') }}
              />
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${tgOver ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
              <Icon name="Send" size={10} /> Телеграм {len}/{TELEGRAM_CAPTION_LIMIT}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${len > VK_POST_LIMIT ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
              ВК {len > VK_POST_LIMIT ? 'слишком длинно' : 'ок'}
            </span>
          </div>
          {edited && (
            <button type="button" onClick={() => { setEdited(false); setText(generated); }} className="inline-flex items-center gap-1 font-semibold text-brand-blue hover:underline">
              <Icon name="RotateCcw" size={11} /> Вернуть авто
            </button>
          )}
        </div>
        {tgOver && (
          <div className="text-[11px] text-red-600 -mt-1">
            В Телеграме подпись к фото ограничена {TELEGRAM_CAPTION_LIMIT} символами — сократите текст на {len - TELEGRAM_CAPTION_LIMIT}, иначе он уйдёт отдельным сообщением.
          </div>
        )}

        <div className="space-y-2">
          {canCopyImage && (
            <button type="button" onClick={copyAll} disabled={photoState !== 'ready' || !text}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-brand-blue text-white hover:opacity-90 transition disabled:opacity-50">
              <Icon name={flash === 'all' ? 'Check' : 'ClipboardCopy'} size={15} />
              {flash === 'all' ? 'Скопировано — вставьте в Телеграм (Ctrl+V)' : 'Скопировать фото + текст'}
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={copyPostText} disabled={!text}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted/50 transition disabled:opacity-50">
              <Icon name={flash === 'text' ? 'Check' : 'Copy'} size={15} /> {flash === 'text' ? 'Скопировано' : 'Скопировать текст'}
            </button>
            <button type="button" onClick={downloadPhoto} disabled={photoState !== 'ready'}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted/50 transition disabled:opacity-50">
              <Icon name="Download" size={15} /> Скачать фото
            </button>
          </div>
          {canNativeShare && (
            <button type="button" onClick={sendFromPhone} disabled={photoState !== 'ready' || sending || !text}
              className={`w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                canCopyImage ? 'border border-border hover:bg-muted/50' : 'bg-brand-blue text-white hover:opacity-90'}`}>
              <Icon name={sending ? 'Loader2' : 'Share2'} size={15} className={sending ? 'animate-spin' : ''} />
              Отправить фото + текст
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1">
          На компьютере: «Скопировать фото + текст» → в Телеграме нажмите Ctrl+V — фото придёт с подписью.
          Для ВК: «Скачать фото» и «Скопировать текст». На телефоне — «Отправить фото + текст» (текст тоже скопируется в буфер).
          Ник и строку «Партнёрам» можно изменить в Настройки → Основные → Контакты.
        </p>
      </DialogContent>
    </Dialog>
  );
}
