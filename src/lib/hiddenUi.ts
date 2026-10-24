import { useEffect, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { LISTINGS_URL } from '@/lib/api';

export interface HiddenUiItem {
  id: string;
  title: string;
  location: string;
  purpose: string;
  section?: string;
}

/** Реестр элементов админки, которые можно скрыть и восстановить в Настройки → Администрирование → Скрытые. */
export const HIDDEN_UI_REGISTRY: HiddenUiItem[] = [
  {
    id: 'listing-editor.labels',
    title: 'Метки и оформление',
    location: 'Объекты → Редактирование объекта → вкладка «Фото»',
    purpose: 'Включал водяной знак на фото объекта и ставил метки «Горячее», «Новинка», «Эксклюзив», «Срочно». «Эксклюзив» и «Срочно» показывались бейджами на фото в каталоге. Уже поставленные значения продолжают работать.',
    section: 'listings',
  },
];

export const parseHiddenUi = (raw?: string | null): string[] =>
  (raw || '').split(',').map(s => s.trim()).filter(Boolean);

export const serializeHiddenUi = (ids: string[]) => Array.from(new Set(ids)).join(',');

const LS_KEY = 'bmn_hidden_ui';
let current: string | null = (() => { try { return localStorage.getItem(LS_KEY); } catch { return null; } })();
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Обновить список скрытых для всех открытых компонентов (вызывается из вкладки «Скрытые»). */
export function setHiddenUi(raw: string) {
  current = raw;
  try { localStorage.setItem(LS_KEY, raw); } catch { /* ignore */ }
  listeners.forEach(l => l());
}

function loadFresh() {
  if (!loading) {
    loading = fetch(`${LISTINGS_URL}?resource=public_settings&_=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { const v = d?.settings?.hidden_ui; if (typeof v === 'string') setHiddenUi(v); })
      .catch(() => {})
      .finally(() => { setTimeout(() => { loading = null; }, 60_000); });
  }
  return loading;
}

/** true — элемент скрыт в настройках. Список берётся свежим с сервера, мимо кэша настроек. */
export function useIsHidden(id: string): boolean {
  const { settings } = useSettings();
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(x => x + 1);
    listeners.add(l);
    loadFresh();
    return () => { listeners.delete(l); };
  }, []);
  const raw = current ?? settings.hidden_ui ?? 'listing-editor.labels';
  return parseHiddenUi(raw).includes(id);
}
