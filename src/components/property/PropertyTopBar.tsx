import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import Breadcrumbs, { Crumb } from '@/components/Breadcrumbs';

interface PropertyTopBarProps {
  itemTitle: string;
  shareUrl: string;
  breadcrumbs: Crumb[];
}

export default function PropertyTopBar({ itemTitle, shareUrl, breadcrumbs }: PropertyTopBarProps) {
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      navigate(-1);
      return;
    }
    const parent = breadcrumbs.length >= 2 ? breadcrumbs[breadcrumbs.length - 2]?.to : undefined;
    navigate(parent || '/catalog', { replace: true });
  };

  const openShare = async () => {
    const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (isTouch && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: itemTitle, url: shareUrl });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    }
    setShareOpen(v => !v);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareNetworks: { label: string; href: string; icon: string }[] = [
    {
      label: 'ВКонтакте',
      href: `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(itemTitle || '')}`,
      icon: 'Share2',
    },
    {
      label: 'Telegram',
      href: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent((itemTitle || '') + '\n')}`,
      icon: 'Send',
    },
    {
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent((itemTitle || '') + '\n' + shareUrl)}`,
      icon: 'MessageCircle',
    },
    {
      label: 'Макс',
      href: `https://max.ru/share?url=${encodeURIComponent(shareUrl)}`,
      icon: 'Sparkles',
    },
  ];

  const btnCls = 'inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition whitespace-nowrap min-h-[44px] md:min-h-0 px-1 md:px-0';

  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="hidden md:block min-w-0 flex-1">
        <Breadcrumbs items={breadcrumbs} />
      </div>
      <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto flex-shrink-0">
        <div className="relative">
          <button type="button" onClick={openShare} className={btnCls}>
            <Icon name="Share2" size={11} /> Поделиться
          </button>
          {shareOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-50 bg-white border border-border rounded-xl shadow-lg p-1.5 min-w-[180px]">
              <div className="text-[10px] font-semibold text-muted-foreground/70 px-2 py-1 uppercase tracking-wide">Поделиться</div>
              {shareNetworks.map(n => (
                <a key={n.label} href={n.href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition text-[12px] text-foreground"
                  onClick={() => setShareOpen(false)}
                >
                  <Icon name={n.icon} size={13} className="text-muted-foreground" />
                  <span>{n.label}</span>
                </a>
              ))}
              <div className="border-t border-border my-1" />
              <button onClick={copyLink}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition text-[12px] w-full text-left">
                <Icon name={copied ? 'Check' : 'Link2'} size={13} className={copied ? 'text-emerald-600' : 'text-muted-foreground'} />
                <span>{copied ? 'Скопировано' : 'Скопировать ссылку'}</span>
              </button>
            </div>
          )}
          {shareOpen && <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />}
        </div>
        <button type="button" onClick={goBack} className={btnCls}>
          <Icon name="ArrowLeft" size={11} /> Назад
        </button>
      </div>
    </div>
  );
}
