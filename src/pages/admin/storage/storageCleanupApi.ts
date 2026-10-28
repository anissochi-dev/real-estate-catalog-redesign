import { getToken } from '@/lib/adminApi';

const PHOTO_CLEANUP_URL = 'https://functions.poehali.dev/98a2eda7-410c-4378-91b9-a2f195cc0dc2';

export interface PendingFile {
  key: string;
  url: string;
  orphan_since: string;
}

export interface PendingInfo {
  ready: number;
  sample: PendingFile[];
  next_reminder_at: string | null;
  last_cleanup_at: string | null;
  notify: boolean;
}

export interface ConfirmResult {
  removed: number;
  failed: number;
  left: number;
  done: boolean;
}

async function call<T>(action: string, extra = ''): Promise<T> {
  const token = getToken();
  const res = await fetch(`${PHOTO_CLEANUP_URL}/?action=${action}&token=${encodeURIComponent(token)}${extra}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data as T;
}

export const storageCleanupApi = {
  pending: () => call<PendingInfo>('pending'),
  confirm: () => call<ConfirmResult>('confirm'),
  snooze: () => call<PendingInfo>('snooze'),
  keep: (key: string) => call<PendingInfo>('keep', `&key=${encodeURIComponent(key)}`),
};
