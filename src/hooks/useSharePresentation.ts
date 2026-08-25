import { useState } from 'react';
import { generatePresentation } from '@/lib/api';

/**
 * Копирует текст в буфер обмена. Сначала пробует современный Clipboard API,
 * а если он недоступен/запрещён браузером — сразу пробует запасной способ
 * через скрытое текстовое поле и document.execCommand('copy'), который
 * работает в подавляющем большинстве браузеров без специальных разрешений.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // пробуем запасной способ ниже
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

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
      copiedNow = await copyText(text);
      if (copiedNow) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
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
        const okNow = await copyText(text);
        if (okNow) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } else {
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
