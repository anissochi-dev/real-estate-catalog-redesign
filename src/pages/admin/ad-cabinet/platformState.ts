const BASE = 'https://functions.poehali.dev/fd00362c-a377-4d94-816c-c5a4abf087cd';
export const PLATFORM_STATE_URL = `${BASE}?action=platform_state`;
export const PLATFORM_TOGGLE_URL = `${BASE}?action=platform_toggle`;
export const PLATFORM_HISTORY_URL = `${BASE}?action=platform_history`;

export const PLATFORM_LABELS: Record<string, string> = {
  cian: 'ЦИАН',
  yandex_realty: 'Яндекс.Недвижимость',
  avito: 'Авито',
  youla: 'Юла',
  domclick: 'ДомКлик',
};

export interface PlatformStateRow {
  off: boolean;
  listings_count: number;
  feed_url: string | null;
  feed_generated_at: string | null;
  last_change: { turned_off: boolean; user_name: string | null; listings_count: number | null; at: string } | null;
}

export interface PlatformHistoryRow {
  turned_off: boolean;
  user_name: string | null;
  listings_count: number | null;
  created_at: string;
}

let cache: Promise<Record<string, PlatformStateRow>> | null = null;

export function loadPlatformState(fresh = false): Promise<Record<string, PlatformStateRow>> {
  if (!cache || fresh) {
    cache = fetch(PLATFORM_STATE_URL)
      .then(r => r.json())
      .then(d => (d && d.platforms) || {})
      .catch(() => { cache = null; return {}; });
  }
  return cache;
}
