import { useLayoutEffect, useRef, useState } from 'react';

interface UseAutoFitTextOptions {
  text: string;
  minPx: number;
  maxPx: number;
  fontWeight?: string | number;
  fontFamily?: string;
}

/**
 * Подбирает максимальный размер шрифта (в px), при котором `text`
 * помещается в одну строку в доступной ширине контейнера `ref`.
 * Использует Canvas API для точного измерения ширины текста —
 * без "прыжков" и лишних перерисовок DOM.
 */
export function useAutoFitText({ text, minPx, maxPx, fontWeight = 800, fontFamily = 'Montserrat, sans-serif' }: UseAutoFitTextOptions) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [fontSize, setFontSize] = useState(maxPx);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !text) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const measure = () => {
      const availableWidth = el.clientWidth;
      if (!availableWidth) return;

      let size = maxPx;
      while (size > minPx) {
        ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
        const width = ctx.measureText(text).width;
        if (width <= availableWidth) break;
        size -= 1;
      }
      setFontSize(size);
    };

    measure();
    if (document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, minPx, maxPx, fontWeight, fontFamily]);

  return { containerRef, fontSize };
}