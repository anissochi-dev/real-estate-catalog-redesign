import { useState } from 'react';
import { generatePresentation } from '@/lib/api';

const RATE_LIMIT = 10; // презентаций в час с одного IP — ограничение backend

interface Progress {
  current: number;
  total: number;
}

/**
 * Пакетное скачивание презентаций для нескольких объектов сразу — каждая презентация
 * генерируется и скачивается отдельным JPG-файлом (последовательно, чтобы не упереться
 * в rate-limit backend). Если выбрано больше лимита в час — обрабатываются только
 * первые RATE_LIMIT объектов, пользователь предупреждается заранее.
 */
export function useBulkPresentations() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  const downloadAll = async (ids: number[]) => {
    if (loading || ids.length === 0) return;

    let targetIds = ids;
    if (ids.length > RATE_LIMIT) {
      const proceed = confirm(
        `Можно сгенерировать не более ${RATE_LIMIT} презентаций в час.\n` +
        `Выбрано ${ids.length} объектов — будут обработаны первые ${RATE_LIMIT}.\n\nПродолжить?`
      );
      if (!proceed) return;
      targetIds = ids.slice(0, RATE_LIMIT);
    }

    setLoading(true);
    const failed: number[] = [];

    for (let i = 0; i < targetIds.length; i++) {
      const id = targetIds[i];
      setProgress({ current: i + 1, total: targetIds.length });
      try {
        const result = await generatePresentation(id);
        if ('error' in result) {
          failed.push(id);
          continue;
        }
        const fileRes = await fetch(result.url);
        const blob = await fileRes.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `presentation-${id}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch {
        failed.push(id);
      }
    }

    setProgress(null);
    setLoading(false);

    if (failed.length > 0) {
      alert(`Не удалось подготовить презентации для объектов: ${failed.join(', ')}`);
    }
  };

  return { downloadAll, loading, progress };
}
