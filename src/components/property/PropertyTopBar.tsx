import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import Breadcrumbs from '@/components/Breadcrumbs';
import { categoryLabel, catalogCategoryUrl } from '@/lib/categories';

interface PropertyTopBarProps {
  itemType: string;
  itemTitle: string;
  shareUrl: string;
}

export default function PropertyTopBar({ itemType, itemTitle, shareUrl }: PropertyTopBarProps) {
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Сети для шеринга — единые компактные иконки lucide, без фирменных цветов
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
      label: 'Одноклассники',
      href: `https://connect.ok.ru/offer?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(itemTitle || '')}`,
      icon: 'Users',
    },
  ];

  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="hidden md:block min-w-0 flex-1">
        <Breadcrumbs items={[
          { label: 'Главная', to: '/' },
          { label: 'Каталог', to: '/catalog' },
          { label: categoryLabel(itemType), to: catalogCategoryUrl(itemType) },
          { label: itemTitle },
        ]} />
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap">
          <Icon name="ArrowLeft" size={11} /> Назад
        </button>
        <div className="relative">
          <button
            onClick={() => setShareOpen(v => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition whitespace-nowrap"
          >
            <Icon name="Share2" size={11} /> Поделиться
          </button>
          {shareOpen && (
            <div className="absolute left-0 md:left-auto md:right-0 top-full mt-1.5 z-50 bg-white border border-border rounded-xl shadow-lg p-1.5 min-w-[180px]">
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
      </div>
    </div>
  );
}