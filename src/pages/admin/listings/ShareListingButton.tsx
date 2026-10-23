import { useState } from 'react';
import Icon from '@/components/ui/icon';
import SocialPostDialog from './SocialPostDialog';
import { Listing } from './types';

interface Props {
  listing: Partial<Listing>;
  /** Компактный вид — только иконка, для строки в списке объектов. */
  compact?: boolean;
}

/**
 * Кнопка «Поделиться» — открывает окно с готовым постом для соцсетей (эмодзи-формат)
 * и короткой подписью для мессенджеров. Текст можно поправить, скопировать
 * или отправить вместе с JPG-презентацией объекта.
 */
export default function ShareListingButton({ listing, compact }: Props) {
  const [open, setOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!listing.id) return;
    setOpen(true);
  };

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={handleClick}
          title="Поделиться в соцсети и мессенджеры"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-brand-blue/10 hover:text-brand-blue transition-colors"
        >
          <Icon name="Share2" size={13} />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20 transition-colors"
        >
          <Icon name="Share2" size={13} /> Поделиться
        </button>
      )}
      {open && <SocialPostDialog open={open} onOpenChange={setOpen} listing={listing} />}
    </>
  );
}
