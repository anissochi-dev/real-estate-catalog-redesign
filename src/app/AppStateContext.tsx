import { createContext, useContext } from 'react';
import type { Property, Page } from './appTypes';

// Общее состояние сайта (раньше передавалось пропсами из App в AppRoutes):
// объекты, избранное, сравнение. Каждая страница-маршрут берёт отсюда нужное.
export interface AppState {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  compareProperties: Property[];
  favoriteProperties: Property[];
  allLoaded: boolean;
  toggleFavorite: (id: number) => void;
  toggleCompare: (id: number) => void;
  setCurrentPage: (p: Page) => void;
}

export const AppStateCtx = createContext<AppState | null>(null);

export function useAppState(): AppState {
  const v = useContext(AppStateCtx);
  if (!v) throw new Error('useAppState must be used within AppStateCtx');
  return v;
}
