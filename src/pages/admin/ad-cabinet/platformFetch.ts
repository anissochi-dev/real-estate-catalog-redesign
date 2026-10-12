/**
 * Загрузка данных площадок для рекламного кабинета.
 * - Очередь: запросы к функции площадок идут строго по одному (раньше 6 сразу —
 *   всплеск нагрузки упирался в лимит частоты запросов БД, «rate limit exceeded»).
 * - Повтор: если сервер занят (503 / rate limit), до 3 повторов с паузой 3 с;
 *   onBusy вызывается перед каждым повтором — UI показывает «Сервер занят, повторяю…».
 */

export const BUSY_TEXT = 'Сервер занят, повторяю…';
const RETRIES = 3;
const RETRY_DELAY_MS = 3000;

let queue: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const isBusy = (status: number, data: { error?: string; busy?: boolean } | null) =>
  status === 503 || !!data?.busy || /rate limit|QueryCanceled/i.test(data?.error || '');

async function fetchWithRetry<T>(url: string, init: RequestInit | undefined, onBusy?: (busy: boolean) => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let status = 0;
    let data: (T & { error?: string; busy?: boolean }) | null = null;
    try {
      const r = await fetch(url, init);
      status = r.status;
      data = await r.json();
    } catch {
      data = null;
    }
    if (!isBusy(status, data) || attempt >= RETRIES) {
      onBusy?.(false);
      if (data === null) throw new Error('network');
      if (isBusy(status, data)) {
        return { ...data, error: 'Сервер перегружен, попробуйте обновить через минуту' } as T;
      }
      return data as T;
    }
    onBusy?.(true);
    await sleep(RETRY_DELAY_MS);
  }
}

export function platformFetch<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
  onBusy?: (busy: boolean) => void,
): Promise<T> {
  const run = queue.then(() => fetchWithRetry<T>(url, init, onBusy));
  queue = run.catch(() => undefined);
  return run;
}
