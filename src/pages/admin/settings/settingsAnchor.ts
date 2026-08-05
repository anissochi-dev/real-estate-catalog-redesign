import { useEffect } from 'react';

/** Единый механизм «поиск настроек → переход → скролл и подсветка нужного поля».
 * Раньше был точечный костыль только для XML-фидов (sessionStorage + чтение
 * при монтировании) — теперь один механизм для всех вкладок:
 *  - anchor (id секции) доставляется через window-событие, поэтому срабатывает
 *    даже если пользователь кликнул результат поиска, уже находясь на нужной
 *    вкладке (простая смена React-таба в этом случае не даёт повторного рендера);
 *  - search (текст для локального поиска внутри вкладки, как у XML-фидов)
 *    доставляется через sessionStorage и читается при монтировании вкладки. */

const ANCHOR_EVENT = 'settings:scroll-to-anchor';
const SEARCH_HANDOFF_KEY = 'settings_search_handoff_query';

interface Handoff {
  anchor?: string;
  search?: string;
}

/** Вызывается из SettingsSearch при клике на результат поиска. */
export function setSettingsHandoff({ anchor, search }: Handoff) {
  if (search) {
    try { sessionStorage.setItem(SEARCH_HANDOFF_KEY, search); } catch { /* ignore */ }
  }
  if (anchor) {
    window.dispatchEvent(new CustomEvent(ANCHOR_EVENT, { detail: anchor }));
  }
}

/** Класс подсветки: рамка + мягкая заливка, затухающая за 2 секунды (src/index.css). */
const HIGHLIGHT_CLASS = 'settings-highlight';
const HIGHLIGHT_DURATION_MS = 2000;

export function scrollToAnchor(anchorId: string) {
  const el = document.getElementById(anchorId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_DURATION_MS);
}

/** Подключается один раз в корневом контейнере вкладок настроек (SettingsAdmin).
 * Слушает событие анкера и ждёт появления элемента в DOM — если переход требует
 * смены вкладки, нужная разметка появляется не мгновенно, поэтому пробуем
 * несколько раз с небольшой паузой, а не один раз сразу. */
export function useSettingsAnchorListener() {
  useEffect(() => {
    const handler = (e: Event) => {
      const anchorId = (e as CustomEvent<string>).detail;
      if (!anchorId) return;
      let attempts = 0;
      const tryScroll = () => {
        if (document.getElementById(anchorId)) {
          scrollToAnchor(anchorId);
          return;
        }
        attempts += 1;
        if (attempts < 10) window.setTimeout(tryScroll, 60);
      };
      requestAnimationFrame(() => requestAnimationFrame(tryScroll));
    };
    window.addEventListener(ANCHOR_EVENT, handler);
    return () => window.removeEventListener(ANCHOR_EVENT, handler);
  }, []);
}

/** Подключается в самой вкладке (например XmlFeedsAdmin), которой нужно
 * подставить текст в свой локальный поиск при открытии из общего поиска. */
export function useSettingsSearchHandoff(applySearch: (text: string) => void) {
  useEffect(() => {
    try {
      const value = sessionStorage.getItem(SEARCH_HANDOFF_KEY);
      if (value) {
        applySearch(value);
        sessionStorage.removeItem(SEARCH_HANDOFF_KEY);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
