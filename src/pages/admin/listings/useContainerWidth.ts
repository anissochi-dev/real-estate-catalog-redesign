import { useEffect, useRef, useState } from 'react';

export function useContainerWidth(initial = 480) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(initial);

  // ── реальная ширина контейнера ────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.getBoundingClientRect().width;
      if (w > 0) setContainerW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    // также слушаем resize окна — на мобиле modal может открыться позже
    window.addEventListener('resize', measure);
    // небольшая задержка на случай анимации открытия modal
    const t = setTimeout(measure, 150);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); clearTimeout(t); };
  }, []);

  return { containerRef, containerW };
}

export default useContainerWidth;
