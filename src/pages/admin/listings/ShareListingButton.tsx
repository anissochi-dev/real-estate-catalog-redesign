import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { generatePresentation } from '@/lib/api';
import { buildShareListingText } from '@/lib/shareListingText';
import { Listing } from './types';

interface Props {
  listing: Partial<Listing>;
}

/**
 * Кнопка «Поделиться» — готовит свежую JPG-презентацию объекта (генерируется на лету,
 * с актуальными фото/ценой/описанием на момент клика) и открывает системное меню
 * «Поделиться» с этим фото + подписью (город, описание, площадь, цена, телефон брокера).
 * На десктопе (Web Share API с файлами не поддерживается) — скачивает презентацию
 * и копирует текст в буфер обмена для ручной вставки в мессенджер.
 */
export default function ShareListingButton({ listing }: Props) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
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

      // Десктоп / браузеры без Web Share API с файлами: скачиваем фото + копируем текст
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `presentation-${listing.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        alert('Не удалось поделиться объектом. Попробуйте ещё раз.');
      }
    } finally {
      setLoading(false);
    }
  };

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
