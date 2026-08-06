export interface F {
  id: number;
  name: string;
  slug: string;
  format: string;
  filter_category: string | null;
  filter_deal: string | null;
  is_active: boolean;
  cdn_url: string | null;
  last_generated_at: string | null;
  market_category_map: string | null;
  use_jpg_photos?: boolean;
  max_listings?: number | null;
  /** Подменный телефон для этого фида — если задан, в выгрузке показывается он
   * вместо основного телефона компании (например для отслеживания звонков с площадки). */
  custom_phone?: string | null;
}

export const XML_URL = 'https://functions.poehali.dev/7c55dfb4-7ede-46fb-be64-dea578da5eb7';

export const PLATFORMS = [
  ['yandex', 'Яндекс.Недвижимость'],
  ['avito', 'Авито'],
  ['cian', 'ЦИАН'],
  ['other', 'Разное (доп. площадки)'],
];

// Категории объектов на сайте — те же 12, что используются во всех остальных фидах
// (см. backend/xml-feeds/index.py). Для каждой пользователь указывает свой номер
// категории (market_category_id) из кабинета продавца Яндекс.Маркета.
export const LISTING_CATEGORIES: [string, string][] = [
  ['office', 'Офис'], ['retail', 'Торговое помещение'], ['warehouse', 'Склад'],
  ['restaurant', 'Ресторан / общепит'], ['hotel', 'Гостиница'], ['business', 'Готовый бизнес'],
  ['gab', 'ГАБ'], ['production', 'Производство'], ['land', 'Земля'],
  ['building', 'Здание'], ['free_purpose', 'Свободного назначения'], ['car_service', 'Автосервис'],
];

export function timeAgo(iso: string | null): string {
  if (!iso) return 'ещё не генерировался';
  const diffMs = Date.now() - new Date(iso + 'Z').getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'обновлён только что';
  if (min < 60) return `обновлён ${min} мин. назад`;
  const h = Math.floor(min / 60);
  return `обновлён ${h} ч. назад`;
}