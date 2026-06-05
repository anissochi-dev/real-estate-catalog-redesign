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
  const vkPixelId = (settings as Record<string, unknown>).vk_pixel_id as string | undefined;
  const calltouchId = (settings as Record<string, unknown>).calltouch_id as string | undefined;
  const tgAdsPixel = (settings as Record<string, unknown>).telegram_ads_pixel as string | undefined;
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

  // VK Пиксель — только после ready
  useEffect(() => {
    if (!ready || !vkPixelId) return;
    const w = window as Window & { VK?: { Retargeting?: { Init?: (id: string) => void; Hit?: () => void } }; __vkLoaded?: boolean };
    if (w.__vkLoaded) return;
    w.__vkLoaded = true;

    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://vk.com/js/api/openapi.js?169';
    s.onload = () => {
      w.VK?.Retargeting?.Init?.(vkPixelId);
      w.VK?.Retargeting?.Hit?.();
    };
    document.head.appendChild(s);
  }, [ready, vkPixelId]);

  // CallTouch — только после ready
  useEffect(() => {
    if (!ready || !calltouchId) return;
    const w = window as Window & { __ctLoaded?: boolean };
    if (w.__ctLoaded) return;
    w.__ctLoaded = true;

    const s = document.createElement('script');
    s.async = true;
    s.src = `https://mod.calltouch.ru/init.js?id=${calltouchId}`;
    document.head.appendChild(s);
  }, [ready, calltouchId]);

  // Telegram Ads пиксель — только после ready
  useEffect(() => {
    if (!ready || !tgAdsPixel) return;
    const w = window as Window & { __tgAdsLoaded?: boolean };
    if (w.__tgAdsLoaded) return;
    w.__tgAdsLoaded = true;

    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    document.head.appendChild(s);

    const pixel = document.createElement('script');
    pixel.innerHTML = `
      window.TelegramAnalytics = window.TelegramAnalytics || [];
      window.TelegramAnalytics.push(['init', '${tgAdsPixel}']);
    `;
    document.head.appendChild(pixel);
  }, [ready, tgAdsPixel]);

  return null;
}