import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CRM_URL } from '@/lib/adminApi';
import { Stage, Deal } from './crmKanbanTypes';
import CrmDealCard from './CrmDealCard';
import CrmCreateDealModal, { CreateDealForm } from './CrmCreateDealModal';
import CrmDealDetailModal from './CrmDealDetailModal';

const EMPTY_FORM: CreateDealForm = {
  title: '', owner_id: '', listing_id: '', amount: '', commission: '', source: '', notes: '',
};

export default function CrmKanban() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [newActivity, setNewActivity] = useState('');
  const [activityType, setActivityType] = useState('note');
  const [form, setForm] = useState<CreateDealForm>(EMPTY_FORM);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [ownerDropOpen, setOwnerDropOpen] = useState(false);
  const [listingSearch, setListingSearch] = useState('');
  const [listingLabel, setListingLabel] = useState('');
  const [listingDropOpen, setListingDropOpen] = useState(false);
  const [dragDeal, setDragDeal] = useState<Deal | null>(null);

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };

  const { data: stages = [] } = useQuery<Stage[]>({
    queryKey: ['crm-stages'],
    queryFn: async () => {
      const r = await fetch(`${CRM_URL}/stages`, { headers });
      return r.json();
    },
  });

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ['crm-deals'],
    queryFn: async () => {
      const r = await fetch(`${CRM_URL}/deals`, { headers });
      return r.json();
    },
  });

  const { data: dealDetail } = useQuery({
    queryKey: ['crm-deal', detailId],
    queryFn: async () => {
      const r = await fetch(`${CRM_URL}/deals/${detailId}`, { headers });
      return r.json();
    },
    enabled: !!detailId,
  });

  const moveMutation = useMutation({
    mutationFn: async ({ dealId, stageId }: { dealId: number; stageId: number }) => {
      await fetch(`${CRM_URL}/deals/${dealId}`, {
        method: 'PUT', headers, body: JSON.stringify({ stage_id: stageId }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-deals'] }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateDealForm) => {
      const r = await fetch(`${CRM_URL}/deals`, {
        method: 'POST', headers, body: JSON.stringify({
          ...data,
          owner_id: data.owner_id ? Number(data.owner_id) : undefined,
          amount: data.amount ? Number(data.amount) : undefined,
          commission: data.commission ? Number(data.commission) : undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-deals'] });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setOwnerLabel(''); setOwnerSearch('');
      setListingLabel(''); setListingSearch('');
      toast.success('Сделка создана');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addActivityMutation = useMutation({
    mutationFn: async ({ dealId, type, content }: { dealId: number; type: string; content: string }) => {
      await fetch(`${CRM_URL}/activities`, {
        method: 'POST', headers, body: JSON.stringify({ deal_id: dealId, type, content }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-deal', detailId] });
      setNewActivity('');
      toast.success('Активность добавлена');
    },
  });

  const dealsByStage = (stageId: number) => deals.filter(d => d.stage_id === stageId);

  const handleDrop = (stageId: number) => {
    if (dragDeal && dragDeal.stage_id !== stageId) {
      moveMutation.mutate({ dealId: dragDeal.id, stageId });
    }
    setDragDeal(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-700">Воронка сделок</h2>
          <p className="text-sm text-muted-foreground">Перетащите карточки между этапами</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-brand-blue text-white">
          <Icon name="Plus" size={16} className="mr-2" />
          Новая сделка
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Icon name="Loader2" size={24} className="animate-spin mr-2" /> Загрузка...
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map(stage => {
            const stageDeals = dealsByStage(stage.id);
            const totalAmt = stageDeals.reduce((s, d) => s + (d.amount || 0), 0);
            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-72 flex flex-col"
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(stage.id)}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="font-semibold text-sm">{stage.name}</span>
                    <Badge variant="secondary" className="text-xs">{stageDeals.length}</Badge>
                  </div>
                  {totalAmt > 0 && (
                    <span className="text-xs text-muted-foreground">{(totalAmt / 1000000).toFixed(1)}М ₽</span>
                  )}
                </div>

                <div
                  className={`flex-1 min-h-[200px] rounded-2xl p-2 space-y-2 transition ${stage.is_terminal ? 'bg-muted/20' : 'bg-muted/40'}`}
                  style={{ borderTop: `3px solid ${stage.color}` }}
                >
                  {stageDeals.map(deal => (
                    <CrmDealCard
                      key={deal.id}
                      deal={deal}
                      onDragStart={setDragDeal}
                      onDragEnd={() => setDragDeal(null)}
                      onClick={setDetailId}
                    />
                  ))}
                  {stageDeals.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-6">Перетащите сделку сюда</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CrmCreateDealModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        form={form}
        setForm={setForm}
        ownerSearch={ownerSearch}
        setOwnerSearch={setOwnerSearch}
        ownerLabel={ownerLabel}
        setOwnerLabel={setOwnerLabel}
        ownerDropOpen={ownerDropOpen}
        setOwnerDropOpen={setOwnerDropOpen}
        listingSearch={listingSearch}
        setListingSearch={setListingSearch}
        listingLabel={listingLabel}
        setListingLabel={setListingLabel}
        listingDropOpen={listingDropOpen}
        setListingDropOpen={setListingDropOpen}
        isPending={createMutation.isPending}
        onSubmit={() => createMutation.mutate(form)}
        headers={headers}
        token={token || ''}
      />

      <CrmDealDetailModal
        detailId={detailId}
        onOpenChange={open => { if (!open) setDetailId(null); }}
        dealDetail={dealDetail}
        stages={stages}
        newActivity={newActivity}
        setNewActivity={setNewActivity}
        activityType={activityType}
        setActivityType={setActivityType}
        onMoveStage={(dealId, stageId) => moveMutation.mutate({ dealId, stageId })}
        onAddActivity={(dealId, type, content) => addActivityMutation.mutate({ dealId, type, content })}
        addActivityPending={addActivityMutation.isPending}
      />
    </div>
  );
}
