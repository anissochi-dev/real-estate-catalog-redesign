import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { generatePresentation } from '@/lib/api';
import { buildShareListingText } from '@/lib/shareListingText';
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
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading || !listing.id) return;
    setLoading(true);
    try {
      const result = await generatePresentation(listing.id);
      if ('error' in result) {
        alert('Не удалось подготовить презентацию. Попробуйте ещё раз.');
        return;
      }
      const text = buildShareListingText(listing);
      const fileRes = await fetch(result.url);
      const blob = await fileRes.blob();
      const file = new File([blob], `presentation-${listing.id}.jpg`, { type: 'image/jpeg' });

      const canShareFiles = typeof navigator.share === 'function'
        && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({ files: [file], text });
        return;
      }

      // Десктоп / браузеры без Web Share API с файлами: копируем текст, затем скачиваем фото
      // (порядок важен — скачивание файла может увести фокус со страницы, а без фокуса
      // navigator.clipboard.writeText падает с ошибкой)
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `presentation-${listing.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        alert('Не удалось поделиться объектом. Попробуйте ещё раз.');
      }
    } finally {
      setLoading(false);
    }
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