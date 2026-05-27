import { useEffect, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';

/**
 * Подгружает счётчики Яндекс.Метрики и Google Analytics
 * из настроек админки (yandex_metrika_id / google_analytics_id).
 * Загрузка откладывается до события window.load + 2 сек,
 * чтобы не конкурировать с LCP за полосу пропускания.
 */
export default function AnalyticsLoader() {
  const { settings } = useSettings();
  const ymId = settings.yandex_metrika_id;
  const gaId = settings.google_analytics_id;
  const ymVerify = settings.yandex_webmaster_verification;
  const gsVerify = settings.google_search_console_verification;
  const [ready, setReady] = useState(false);

  // Откладываем загрузку аналитики до после LCP
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onLoad = () => { timer = setTimeout(() => setReady(true), 2000); };
    if (document.readyState === 'complete') {
      onLoad();
    } else {
      window.addEventListener('load', onLoad, { once: true });
    }
    return () => { window.removeEventListener('load', onLoad); clearTimeout(timer); };
  }, []);

  // Яндекс Вебмастер — мета-тег подтверждения
  useEffect(() => {
    let tag = document.querySelector<HTMLMetaElement>('meta[name="yandex-verification"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'yandex-verification';
      document.head.appendChild(tag);
    }
    tag.content = ymVerify || '';
  }, [ymVerify]);

  // Google Search Console
  useEffect(() => {
    let tag = document.querySelector<HTMLMetaElement>('meta[name="google-site-verification"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'google-site-verification';
      document.head.appendChild(tag);
    }
    tag.content = gsVerify || '';
  }, [gsVerify]);

  // Яндекс.Метрика — только после ready
  useEffect(() => {
    if (!ready || !ymId) return;
    const w = window as Window & { __ymLoaded?: Record<string, boolean> };
    w.__ymLoaded = w.__ymLoaded || {};
    if (w.__ymLoaded[ymId]) return;
    w.__ymLoaded[ymId] = true;

    const exists = Array.from(document.scripts).some(s => s.src.includes('mc.yandex.ru/metrika/tag.js'));
    if (!exists) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://mc.yandex.ru/metrika/tag.js';
      document.head.appendChild(s);
    }
    const init = () => {
      if (typeof window.ym !== 'function') { setTimeout(init, 200); return; }
      window.ym(Number(ymId), 'init', {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        webvisor: true,
        trackHash: true,
      });
    };
    init();
  }, [ready, ymId]);

  // Google Analytics — только после ready
  useEffect(() => {
    if (!ready || !gaId) return;
    const w = window as Window & { __gaLoaded?: Record<string, boolean> };
    w.__gaLoaded = w.__gaLoaded || {};
    if (w.__gaLoaded[gaId]) return;
    w.__gaLoaded[gaId] = true;

    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    const gtag = (...args: unknown[]) => { (window.dataLayer as unknown[]).push(args); };
    window.gtag = gtag as typeof window.gtag;
    gtag('js', new Date());
    gtag('config', gaId);
  }, [ready, gaId]);

  return null;
}
