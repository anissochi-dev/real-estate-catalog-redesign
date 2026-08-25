import Icon from '@/components/ui/icon';
import { buildShareListingText } from '@/lib/shareListingText';
import { useSharePresentation } from '@/hooks/useSharePresentation';
import { Listing } from './types';

interface Props {
  listing: Partial<Listing>;
  /** Компактный вид — только иконка, для строки в списке объектов. */
  compact?: boolean;
}

/**
 * Кнопка «Поделиться» — готовит свежую JPG-презентацию объекта (генерируется на лету,
 * с актуальными фото/ценой/описанием на момент клика) и открывает системное меню
 * «Поделиться» с этим фото + подписью (город, описание, площадь, цена, телефон брокера).
 * На десктопе (Web Share API с файлами не поддерживается) — скачивает презентацию
 * и копирует текст в буфер обмена для ручной вставки в мессенджер.
 */
export default function ShareListingButton({ listing, compact }: Props) {
  const { share, loading, copied } = useSharePresentation();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!listing.id) return;
    share(listing.id, buildShareListingText(listing));
  };

  const icon = loading ? 'Loader2' : copied ? 'Check' : 'Share2';

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title={copied ? 'Текст скопирован' : 'Поделиться в мессенджер'}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-brand-blue/10 hover:text-brand-blue transition-colors disabled:opacity-50"
      >
        <Icon name={icon} size={13} className={loading ? 'animate-spin' : ''} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20 transition-colors disabled:opacity-50"
    >
      {loading ? (
        <><Icon name="Loader2" size={13} className="animate-spin" /> Готовлю...</>
      ) : copied ? (
        <><Icon name="Check" size={13} /> Текст скопирован</>
      ) : (
        <><Icon name="Share2" size={13} /> Поделиться</>
      )}
    </button>
  );
}
