import { useQuery } from '@tanstack/react-query';
import { crmUrl, adminApi } from '@/lib/adminApi';
import { SearchItem } from '../calendarTypes';

/** Объединённый поиск клиента: телефонная база + заявки + собственники объектов.
 * id отрицательный для phone_contacts (минус id), положительный — для leads.
 * sub — телефон (или компания).
 */
export interface ClientSearchItem extends SearchItem {
  source: 'phone' | 'lead' | 'owner';
  phone?: string;
  /** Положительный id — для записи в lead_id. Если выбрана запись из телефонной базы — lead_id остаётся null,
   * но название/телефон сохраняются в title (для отображения).
   */
  leadId?: number | null;
}

export type AnySearchItem = SearchItem & Partial<ClientSearchItem>;

/* ── Хук поиска объектов ── */
export function useListingsSearchReal(q: string) {
  return useQuery<SearchItem[]>({
    queryKey: ['listings-search-real', q],
    queryFn: async () => {
      if (q.length < 2) return [];
      const data = await adminApi.listListings();
      const all: { id: number; title: string; address?: string }[] = data.listings || [];
      const lower = q.toLowerCase();
      return all
        .filter(l => l.title?.toLowerCase().includes(lower) || l.address?.toLowerCase().includes(lower))
        .slice(0, 8)
        .map(l => ({ id: l.id, label: l.title, sub: l.address }));
    },
    enabled: q.length >= 2,
    staleTime: 60_000,
  });
}

export function useClientSearch(token: string, q: string) {
  return useQuery<ClientSearchItem[]>({
    queryKey: ['client-search', q],
    queryFn: async () => {
      if (q.length < 2) return [];
      const results: ClientSearchItem[] = [];

      // 1) Телефонная база
      try {
        const data = await adminApi.searchPhones(q);
        const items = (data.contacts || data.results || data || []) as
          { id: number; name?: string; phone?: string; company?: string }[];
        for (const it of items.slice(0, 6)) {
          const name = it.name || it.phone || '—';
          results.push({
            id: -it.id, // отрицательный — для phone_contact
            label: name,
            sub: it.phone + (it.company ? ` · ${it.company}` : ''),
            source: 'phone',
            phone: it.phone,
            leadId: null,
          });
        }
      } catch { /* showError уже сработал */ }

      // 2) Заявки (Leads)
      try {
        const r = await fetch(crmUrl('leads', null, null, { search: q, limit: 6 }), {
          headers: { 'X-Auth-Token': token },
        });
        const data = await r.json().catch(() => ({}));
        const items = (data.leads || []) as { id: number; name: string; phone?: string }[];
        for (const it of items) {
          results.push({
            id: it.id,
            label: it.name,
            sub: it.phone ? `Заявка · ${it.phone}` : 'Заявка',
            source: 'lead',
            phone: it.phone,
            leadId: it.id,
          });
        }
      } catch { /* ignore */ }

      // 3) Собственники объектов
      try {
        const r = await fetch(crmUrl('owners', null, null, { search: q, limit: 6 }), {
          headers: { 'X-Auth-Token': token },
        });
        const data = await r.json().catch(() => ({}));
        const items = (data.owners || []) as { id: number; name: string; phone?: string }[];
        for (const it of items) {
          results.push({
            id: -100000 - it.id,
            label: it.name,
            sub: it.phone ? `Собственник · ${it.phone}` : 'Собственник',
            source: 'owner',
            phone: it.phone,
            leadId: null,
          });
        }
      } catch { /* ignore */ }

      // Дедупликация по телефону
      const seen = new Set<string>();
      return results.filter(r => {
        const key = (r.phone || r.label || String(r.id)).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 12);
    },
    enabled: q.length >= 2,
    staleTime: 15_000,
  });
}
