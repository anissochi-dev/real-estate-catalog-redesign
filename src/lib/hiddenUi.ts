import { useSettings } from '@/contexts/SettingsContext';

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

/** true — элемент скрыт в настройках. */
export function useIsHidden(id: string): boolean {
  const { settings } = useSettings();
  return parseHiddenUi(settings.hidden_ui).includes(id);
}
