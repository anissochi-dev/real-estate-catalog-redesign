import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { crmUrl } from '@/lib/adminApi';
import { Stage, Deal } from '../crmKanbanTypes';
import { CreateDealForm } from '../CrmCreateDealModal';
import { StatusFilter, SortKey } from './CrmKanbanToolbar';

interface Params {
  headers: Record<string, string>;
  statusFilter: StatusFilter;
  sortKey: SortKey;
  search: string;
  detailId: number | null;
  onCreateSuccess: () => void;
  onActivityAdded: () => void;
}

export function useCrmKanbanData({
  headers, statusFilter, sortKey, search, detailId, onCreateSuccess, onActivityAdded,
}: Params) {
  const qc = useQueryClient();

  const stagesQuery = useQuery<Stage[]>({
    queryKey: ['crm-stages'],
    queryFn: async () => {
      const r = await fetch(crmUrl('stages'), { headers });
      const j = await r.json();
      if (Array.isArray(j)) return j;
      if (Array.isArray(j?.stages)) return j.stages;
      return [];
    },
  });

  const dealsQuery = useQuery<Deal[]>({
    queryKey: ['crm-deals', statusFilter, sortKey, search],
    queryFn: async () => {
      const r = await fetch(crmUrl('deals', null, null, {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        sort: sortKey,
        search: search.trim() || undefined,
      }), { headers });
      const j = await r.json();
      if (Array.isArray(j)) return j;
      if (Array.isArray(j?.deals)) return j.deals;
      return [];
    },
  });

  const dealDetailQuery = useQuery({
    queryKey: ['crm-deal', detailId],
    queryFn: async () => {
      const r = await fetch(crmUrl('deals', detailId), { headers });
      return r.json();
    },
    enabled: !!detailId,
  });

  const moveMutation = useMutation({
    mutationFn: async ({ dealId, stageId }: { dealId: number; stageId: number }) => {
      const r = await fetch(crmUrl('deals', dealId), {
        method: 'PUT', headers, body: JSON.stringify({ stage_id: stageId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Ошибка перемещения');
      return j;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-deals'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateDealForm) => {
      // Backend ждёт integer для всех ID-полей. Пустую строку
      // приводим к null/undefined, иначе psycopg падает с ошибкой типа.
      const payload: Record<string, unknown> = {
        title: data.title,
        source: data.source || undefined,
        notes: data.notes || undefined,
        owner_id: data.owner_id ? Number(data.owner_id) : undefined,
        listing_id: data.listing_id ? Number(data.listing_id) : undefined,
        amount: data.amount ? Number(data.amount) : undefined,
        commission: data.commission ? Number(data.commission) : undefined,
        assigned_to: data.assigned_to ? Number(data.assigned_to) : undefined,
      };
      const r = await fetch(crmUrl('deals'), {
        method: 'POST', headers, body: JSON.stringify(payload),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || `Не удалось создать сделку (код ${r.status})`);
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-deals'] });
      onCreateSuccess();
      toast.success('Сделка создана');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addActivityMutation = useMutation({
    mutationFn: async ({ dealId, type, content }: { dealId: number; type: string; content: string }) => {
      await fetch(crmUrl('activities'), {
        method: 'POST', headers, body: JSON.stringify({ deal_id: dealId, type, content }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-deal', detailId] });
      onActivityAdded();
      toast.success('Активность добавлена');
    },
  });

  return {
    stages: stagesQuery.data ?? [],
    deals: dealsQuery.data ?? [],
    isLoading: dealsQuery.isLoading,
    dealDetail: dealDetailQuery.data,
    moveMutation,
    createMutation,
    addActivityMutation,
  };
}