import { useEffect } from 'react';

/**
 * Фоновые крон-пинги: SEO, news, retrain, FAQ-batch.
 * Запускаются один раз после загрузки страницы через requestIdleCallback/setTimeout.
 * Каждый пинг троттлится через localStorage — не чаще раза в час (или 10 мин для news).
 */
export function useCrons() {
  useEffect(() => {
    const fireCron = (url: string, opts?: RequestInit) => {
      const ac = new AbortController();
      setTimeout(() => ac.abort(), 8000);
      fetch(url, { ...opts, signal: ac.signal, keepalive: false }).catch(() => {});
    };

    const runCrons = () => {
      const SEO_CRON_URL = 'https://functions.poehali.dev/068e7fac-cea4-46c6-9ad2-a02f1f5e250d';
      const NEWS_CRON_URL = 'https://functions.poehali.dev/984cad3a-0783-4408-a614-52ed36f8c77f';
      const THROTTLE_MS = 60 * 60 * 1000;
      try {
        const seoLast = parseInt(localStorage.getItem('seo_cron_last_ping') || '0', 10);
        if (Date.now() - seoLast > THROTTLE_MS) {
          localStorage.setItem('seo_cron_last_ping', String(Date.now()));
          fireCron(SEO_CRON_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ping' }) });
        }
        const newsLast = parseInt(localStorage.getItem('news_cron_last_ping') || '0', 10);
        if (Date.now() - newsLast > 10 * 60 * 1000) {
          localStorage.setItem('news_cron_last_ping', String(Date.now()));
          fireCron(`${NEWS_CRON_URL}?action=ping_cron`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        }
        const retrainLast = parseInt(localStorage.getItem('retrain_cron_last_ping') || '0', 10);
        if (Date.now() - retrainLast > THROTTLE_MS) {
          localStorage.setItem('retrain_cron_last_ping', String(Date.now()));
          fireCron('https://functions.poehali.dev/e2f1d357-fb83-4fbb-8d8b-6fb063357afc?action=cron');
        }
        const faqToken = localStorage.getItem('biznest_token') || '';
        if (faqToken) {
          const faqLast = parseInt(localStorage.getItem('faq_batch_cron_last_ping') || '0', 10);
          if (Date.now() - faqLast > THROTTLE_MS) {
            localStorage.setItem('faq_batch_cron_last_ping', String(Date.now()));
            fireCron('https://functions.poehali.dev/282b9c5f-29fa-41ea-bc42-0793bdf8950d', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Auth-Token': faqToken },
              body: JSON.stringify({ action: 'batch', limit: 5 }),
            });
          }
        }
      } catch { /* ignore */ }
    };

    const schedule = () => {
      if ('requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
          .requestIdleCallback(runCrons, { timeout: 10000 });
      } else {
        setTimeout(runCrons, 5000);
      }
    };

    if (document.readyState === 'complete') {
      setTimeout(schedule, 6000);
    } else {
      const onLoad = () => setTimeout(schedule, 6000);
      window.addEventListener('load', onLoad, { once: true });
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);
}