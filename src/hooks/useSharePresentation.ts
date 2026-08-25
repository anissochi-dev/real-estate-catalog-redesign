import { useState } from 'react';
import { generatePresentation } from '@/lib/api';

/**
 * Общая логика кнопки «Поделиться с презентацией»: генерирует свежий JPG объекта,
 * копирует текст в буфер обмена и открывает системное меню «Поделиться» (на мобильных)
 * либо скачивает файл (на десктопе, где Web Share API с файлами не поддерживается).
 *
 * Копирование текста выполняется САМЫМ первым действием — пока браузер ещё «помнит»
 * пользовательский клик. Если сначала ждать сетевые запросы (генерацию/загрузку
 * презентации) и копировать текст только потом — браузер успевает потерять связь
 * с кликом и блокирует доступ к буферу обмена с ошибкой.
 */
export function useSharePresentation() {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const share = async (listingId: number, text: string) => {
    if (loading || !listingId) return;
    setLoading(true);

    const hasFileShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
    let copiedNow = false;
    if (!hasFileShare) {
      try {
        await navigator.clipboard.writeText(text);
        copiedNow = true;
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // буфер обмена недоступен — не критично, попробуем показать текст позже
      }
    }

    try {
      const result = await generatePresentation(listingId);
      if ('error' in result) {
        alert('Не удалось подготовить презентацию. Попробуйте ещё раз.');
        return;
      }
      const fileRes = await fetch(result.url);
      const blob = await fileRes.blob();
      const file = new File([blob], `presentation-${listingId}.jpg`, { type: 'image/jpeg' });

      const canShareFiles = hasFileShare && navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({ files: [file], text });
        return;
      }

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `presentation-${listingId}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      if (!copiedNow) {
        // Буфер не скопировался раньше — пробуем ещё раз (файл уже скачан, фокус на странице есть)
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          alert(`Не удалось скопировать текст. Скопируйте вручную:\n\n${text}`);
        }
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        alert('Не удалось поделиться объектом. Попробуйте ещё раз.');
      }
    } finally {
      setLoading(false);
    }
  };

  return { share, loading, copied };
}
