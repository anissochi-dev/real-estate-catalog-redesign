import { useEffect, useState } from 'react';
import { hasConsent, checkConsentByIp } from '../components/ConsentBanner';

/**
 * Логика баннера согласия (GDPR/cookie).
 * - Проверяет IP через сервер: если уже есть согласие — не показывает.
 * - Иначе показывает через 4 сек после первого взаимодействия пользователя
 *   или страховочно через 5 сек.
 */
export function useConsentBanner() {
  const [consentGiven, setConsentGiven] = useState<boolean>(() => hasConsent());
  const [consentVisible, setConsentVisible] = useState(false);

  useEffect(() => {
    if (hasConsent()) return;

    let cancelled = false;
    let shown = false;
    const show = () => {
      if (shown || cancelled) return;
      shown = true;
      setConsentVisible(true);
    };

    checkConsentByIp(() => {
      if (cancelled) return;
      setConsentGiven(true);
    }).finally(() => {
      if (cancelled || hasConsent()) return;

      let pageLoadedAt = 0;
      const onPageLoad = () => { pageLoadedAt = Date.now(); };
      if (document.readyState === 'complete') { pageLoadedAt = Date.now(); }
      else window.addEventListener('load', onPageLoad, { once: true });

      const events = ['touchstart', 'keydown', 'click', 'pointerdown'] as const;
      const onInteract = () => {
        if (Date.now() - pageLoadedAt < 4000) return;
        events.forEach(e => window.removeEventListener(e, onInteract));
        show();
      };
      events.forEach(e => window.addEventListener(e, onInteract, { passive: true }));
      const fallback = setTimeout(show, 5000);
      (window as Window & { __consentCleanup?: () => void }).__consentCleanup = () => {
        events.forEach(e => window.removeEventListener(e, onInteract));
        clearTimeout(fallback);
      };
    });

    return () => {
      cancelled = true;
      try {
        (window as Window & { __consentCleanup?: () => void }).__consentCleanup?.();
      } catch { /* ignore */ }
    };
  }, []);

  return { consentGiven, setConsentGiven, consentVisible };
}
