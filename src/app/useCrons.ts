import { useEffect } from 'react';

/**
 * Фоновые задачи сайта через дирижёр: браузер раз в 2 мин спрашивает «что пора запустить?»
 * и запускает ОДНУ задачу, которую выдал сервер. Очередь, приоритеты и паузы между
 * задачами решает дирижёр (backend/cron-conductor) — так задачи не накладываются.
 */
const BOT_UA = /bot|crawl|spider|slurp|lighthouse|headless|pagespeed|preview|reflection|gtmetrix|pingdom|phantom|puppeteer|playwright|selenium/i;

function isAutomatedBrowser(): boolean {
  try {
    if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return true;
    return BOT_UA.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}

export function useCrons() {
  useEffect(() => {
    // Боты и автопроверки (поисковики, ИИ-краулеры, Lighthouse) исполняют JS сайта, но
    // закрывают страницу через ~30 с — долгие фоновые задачи обрывались с ошибкой 499.
    if (isAutomatedBrowser()) return;

    const fireCron = (url: string, opts?: RequestInit) => {
      const ac = new AbortController();
      setTimeout(() => ac.abort(), 8000);
      fetch(url, { ...opts, signal: ac.signal, keepalive: false }).catch(() => {});
    };

    // Для долгих задач (фиды + синхронизация площадки, генерация новостей) не обрываем
    // запрос через 8 секунд: обрыв браузером останавливает и саму функцию на сервере
    // (ошибка 499), из-за чего работа не доходила до конца. keepalive: true — браузер
    // не отменяет запрос, если посетитель закрыл вкладку или ушёл на другую страницу
    // (тело запроса у нас ≤ 64 КБ — лимит keepalive не задевается). Ответ не нужен;
    // от параллельных запусков функцию защищает блокировка на сервере.
    const fireLongCron = (url: string, opts?: RequestInit) => {
      fetch(url, { ...opts, keepalive: true }).catch(() => {});
    };

    const CONDUCTOR_URL = 'https://functions.poehali.dev/1b16aa78-568a-43fe-a121-6caa4639e71c';
    const TICK_THROTTLE_MS = 2 * 60 * 1000;

    const runCrons = async () => {
      try {
        const last = parseInt(localStorage.getItem('cron_conductor_last_tick') || '0', 10);
        if (Date.now() - last < TICK_THROTTLE_MS) return;
        localStorage.setItem('cron_conductor_last_tick', String(Date.now()));
        const token = localStorage.getItem('biznest_token') || '';
        const ac = new AbortController();
        setTimeout(() => ac.abort(), 6000);
        const r = await fetch(`${CONDUCTOR_URL}?action=tick${token ? '&auth=1' : ''}`, { signal: ac.signal });
        const d = await r.json();
        const task = d?.task as { url: string; method: string; body?: unknown; needs_auth?: boolean; long?: boolean } | null;
        if (!task) return;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (task.needs_auth && token) headers['X-Auth-Token'] = token;
        const opts: RequestInit = task.method === 'POST'
          ? { method: 'POST', headers, body: JSON.stringify(task.body ?? {}) }
          : { method: 'GET', headers: task.needs_auth && token ? { 'X-Auth-Token': token } : undefined };
        if (task.long) fireLongCron(task.url, opts);
        else fireCron(task.url, opts);
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