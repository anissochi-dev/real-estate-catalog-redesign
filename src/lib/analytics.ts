/**
 * Утилиты для передачи конверсий в рекламные системы.
 * Вызывается после успешной отправки любой формы заявки на сайте.
 */

declare global {
  interface Window {
    ym?: (id: number, event: string, goal: string, params?: Record<string, unknown>) => void;
    VK?: { Goal?: (goal: string) => void };
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Отправляет конверсию "lead_form" во все подключённые рекламные системы:
 * - Яндекс.Метрика → reachGoal → Директ обучается на реальных лидах
 * - VK Пиксель → Goal → аудитория конверсий для VK Ads
 * - Google Analytics → event → конверсия для Google Ads
 */
export function fireLeadConversion(params?: { listing_id?: number; source?: string }): void {
  try {
    // Яндекс.Метрика — цель lead_form
    if (typeof window.ym === 'function') {
      const metrikaScript = Array.from(document.scripts).find(s => s.src.includes('mc.yandex.ru/metrika'));
      if (metrikaScript) {
        const ymIdMatch = metrikaScript.src.match(/\/(\d+)\//);
        const ymIdFromSrc = ymIdMatch ? Number(ymIdMatch[1]) : null;
        const ymIdFromCounter = (window as Record<string, unknown>).__ymCounterId as number | undefined;
        const ymId = ymIdFromCounter || ymIdFromSrc;
        if (ymId) {
          window.ym(ymId, 'reachGoal', 'lead_form', params as Record<string, unknown>);
        } else {
          // Попробуем найти счётчик по-другому
          const ymKeys = Object.keys(window).filter(k => k.startsWith('yaCounter'));
          if (ymKeys.length > 0) {
            const id = Number(ymKeys[0].replace('yaCounter', ''));
            if (id) window.ym(id, 'reachGoal', 'lead_form', params as Record<string, unknown>);
          }
        }
      }
    }

    // VK Пиксель — конверсия
    if (window.VK?.Goal) {
      window.VK.Goal('lead');
    }

    // Google Analytics / GTM
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'generate_lead', {
        event_category: 'engagement',
        event_label: params?.source || 'site',
        listing_id: params?.listing_id,
      });
    }
  } catch {
    // Не ломаем пользовательский флоу при ошибке аналитики
  }
}
