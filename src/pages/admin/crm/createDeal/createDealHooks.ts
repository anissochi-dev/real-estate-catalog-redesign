import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/adminApi';

export interface BrokerOption {
  id: number;
  name: string;
  role: string;
}

export interface ListingResult {
  id: number;
  title: string;
  owner_name: string;
  owner_phone: string;
}

export function useBrokers(enabled: boolean) {
  return useQuery<BrokerOption[]>({
    queryKey: ['crm-brokers-list'],
    queryFn: async () => {
      const d = await adminApi.listUsers();
      const list: { id: number; name: string; role: string; is_active?: boolean }[] = d.users || d || [];
      return list
        .filter(u => u.is_active !== false && ['broker', 'manager', 'admin', 'director', 'office_manager'].includes(u.role))
        .map(u => ({ id: u.id, name: u.name, role: u.role }));
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useListingsSearch(listingSearch: string) {
  return useQuery<ListingResult[]>({
    queryKey: ['crm-listings-search', listingSearch],
    queryFn: async () => {
      if (listingSearch.length < 2) return [];
      const d = await adminApi.listListings();
      const all: { id: number; title: string; owner_name?: string; owner_phone?: string }[] = d.listings || [];
      const lower = listingSearch.toLowerCase();
      return all
        .filter(l => l.title?.toLowerCase().includes(lower) || String(l.id) === listingSearch)
        .slice(0, 8)
        .map(l => ({ id: l.id, title: l.title, owner_name: l.owner_name || '', owner_phone: l.owner_phone || '' }));
    },
    enabled: listingSearch.length >= 2,
    staleTime: 60_000,
  });
}
