import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { adminApi } from '@/lib/adminApi';
import { fetchPublicSettings } from '@/lib/api';
import { buildShareListingText } from '@/lib/shareListingText';
import { buildSocialPostText, boldToHtml, stripBold, TELEGRAM_CAPTION_LIMIT, VK_POST_LIMIT, SocialPostCompany } from '@/lib/socialPostText';
import { copyText, useSharePresentation } from '@/hooks/useSharePresentation';
import { Listing } from './types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listing: Partial<Listing>;
}

type Mode = 'social' | 'messenger';

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

function loadCompany(): Promise<SocialPostCompany> {
  return fetchPublicSettings()
    .then(st => ({ phone: st.company_phone, nick: st.share_contact_nick, partnerText: st.share_partner_text }))
    .catch(() => ({}));
}

export default function SocialPostDialog({ open, onOpenChange, listing }: Props) {
  const [full, setFull] = useState<Partial<Listing>>(listing);
  const [company, setCompany] = useState<SocialPostCompany | null>(null);
  const [mode, setMode] = useState<Mode>('social');
  const [texts, setTexts] = useState<Record<Mode, string>>({ social: '', messenger: '' });
  const [edited, setEdited] = useState<Record<Mode, boolean>>({ social: false, messenger: false });
  const [copied, setCopied] = useState(false);
  const { share, loading: sharing } = useSharePresentation();

  useEffect(() => {
    if (!open || !listing.id) return;
    setFull(listing);
    setEdited({ social: false, messenger: false });
    loadCompany().then(setCompany);
    adminApi.getListing(listing.id)
      .then((r: { listing?: Partial<Listing> }) => { if (r.listing) setFull({ ...listing, ...r.listing }); })
      .catch(() => undefined);
  }, [open, listing]);

  const generated = useMemo(() => ({
    social: company ? buildSocialPostText(full, company) : '',
    messenger: buildShareListingText(full),
  }), [full, company]);

  useEffect(() => {
    setTexts(t => ({
      social: edited.social ? t.social : generated.social,
      messenger: edited.messenger ? t.messenger : generated.messenger,
    }));
  }, [generated, edited]);

  const text = texts[mode];
  const plain = stripBold(text);
  const len = plain.length;
  const tgOver = len > TELEGRAM_CAPTION_LIMIT;

  const doCopy = async () => {
    if (await copyRich(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      alert('Не удалось скопировать. Выделите текст и скопируйте вручную.');
    }
  };

  const reset = () => {
    setEdited(e => ({ ...e, [mode]: false }));
    setTexts(t => ({ ...t, [mode]: generated[mode] }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="Share2" size={18} className="text-brand-blue" />
            Поделиться объектом #{listing.id}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {([['social', 'Пост для соцсетей', 'Megaphone'], ['messenger', 'Мессенджер', 'MessageCircle']] as const).map(([id, label, icon]) => (
            <button key={id} type="button" onClick={() => setMode(id)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition ${
                mode === id ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon name={icon} size={13} /> {label}
            </button>
          ))}
        </div>

        {mode === 'social' && !company ? (
          <div className="flex items-center justify-center py-10"><Icon name="Loader2" size={20} className="animate-spin text-brand-blue" /></div>
        ) : (
          <textarea
            value={text}
            onChange={e => { setTexts(t => ({ ...t, [mode]: e.target.value })); setEdited(x => ({ ...x, [mode]: true })); }}
            rows={mode === 'social' ? 16 : 9}
            className="w-full px-3 py-2.5 border border-border rounded-xl text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
          />
        )}
        {mode === 'social' && company && (
          <div className="-mt-1 space-y-1">
            <div className="text-[11px] text-muted-foreground">
              Так пост будет выглядеть в Телеграме. Текст между <b>**звёздочками**</b> выделяется жирным.
            </div>
            <div
              className="max-h-56 overflow-y-auto px-3 py-2.5 rounded-xl bg-muted/50 text-sm leading-relaxed whitespace-pre-wrap break-words"
              dangerouslySetInnerHTML={{ __html: boldToHtml(text).replace(/<br>/g, '\n') }}
            />
          </div>
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
          {edited[mode] && (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 font-semibold text-brand-blue hover:underline">
              <Icon name="RotateCcw" size={11} /> Вернуть авто
            </button>
          )}
        </div>
        {tgOver && (
          <div className="text-[11px] text-red-600 -mt-1">
            В Телеграме подпись к фото ограничена {TELEGRAM_CAPTION_LIMIT} символами — сократите текст на {len - TELEGRAM_CAPTION_LIMIT} или отправьте его отдельным сообщением.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={doCopy} disabled={!text}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-brand-blue text-white hover:opacity-90 transition disabled:opacity-50">
            <Icon name={copied ? 'Check' : 'Copy'} size={15} /> {copied ? 'Скопировано' : 'Скопировать с жирным'}
          </button>
          <button type="button" onClick={() => listing.id && share(listing.id, plain)} disabled={sharing || !text}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted/50 transition disabled:opacity-50">
            <Icon name={sharing ? 'Loader2' : 'Image'} size={15} className={sharing ? 'animate-spin' : ''} />
            {sharing ? 'Готовлю…' : 'Фото + текст'}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Жирный сохраняется при вставке в Телеграм. В ВК и других соцсетях текст вставится обычным, без звёздочек.
          «Фото + текст»: на телефоне откроется меню «Поделиться», на компьютере скачается презентация, а текст скопируется (без жирного).
          Ник и строку «Партнёрам» можно изменить в Настройки → Основные → Контакты.
        </p>
      </DialogContent>
    </Dialog>
  );
}
