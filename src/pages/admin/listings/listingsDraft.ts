import { useEffect, useRef } from 'react';
import { Listing } from './types';

export const DRAFT_KEY = 'biznest_listing_draft';

export function loadDraft(): { editing: Partial<Listing>; photos: string[] } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function saveDraft(editing: Partial<Listing>, photos: string[]) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ editing, photos })); } catch { /* ignore */ }
}
export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// Автосохранение черновика нового (ещё не сохранённого) объекта через 1.5 сек после правки
export function useDraftAutosave(
  editing: Partial<Listing> | null,
  photos: string[],
  setHasDraft: (v: boolean) => void,
) {
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editing || editing.id) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraft(editing, photos);
      setHasDraft(true);
    }, 1500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, photos]);
}
