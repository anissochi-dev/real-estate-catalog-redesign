import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const STORE_KEY = 'scroll_positions_v1';

function readStore(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStore(data: Record<string, number>) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/**
 * Управление прокруткой при смене страниц:
 * - переход вперёд (клик по ссылке) — наверх;
 * - возврат «Назад»/«Вперёд» браузера — восстанавливает позицию, где был человек.
 * Позиция хранится по ключу записи истории (location.key) в sessionStorage.
 * Смена только query-параметров (фильтры каталога) прокрутку не трогает.
 */
export default function ScrollToTop() {
  const location = useLocation();
  const navType = useNavigationType();
  const { pathname, key } = location;
  const prevPath = useRef<string | null>(null);

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    const save = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const store = readStore();
        store[key] = window.scrollY;
        writeStore(store);
      });
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', save);
    };
  }, [key]);

  useEffect(() => {
    const samePath = prevPath.current === pathname;
    prevPath.current = pathname;
    if (navType !== 'POP') {
      if (!samePath) window.scrollTo(0, 0);
      return;
    }
    const target = readStore()[key];
    if (!target) {
      window.scrollTo(0, 0);
      return;
    }
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll >= target || tries >= 40) {
        window.scrollTo(0, Math.min(target, Math.max(maxScroll, 0)));
        return;
      }
      tries += 1;
      timer = window.setTimeout(attempt, 50);
    };
    attempt();
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, key]);

  return null;
}
