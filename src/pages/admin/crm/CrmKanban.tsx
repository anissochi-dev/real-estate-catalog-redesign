import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Deal } from './crmKanbanTypes';
import CrmCreateDealModal, { CreateDealForm } from './CrmCreateDealModal';
import CrmDealDetailModal from './CrmDealDetailModal';
import CrmKanbanToolbar, { StatusFilter, SortKey } from './kanban/CrmKanbanToolbar';
import CrmKanbanBoard from './kanban/CrmKanbanBoard';
import { useCrmKanbanData } from './kanban/useCrmKanbanData';

const EMPTY_FORM: CreateDealForm = {
  title: '', owner_id: '', listing_id: '', amount: '', commission: '', source: '', notes: '', assigned_to: '',
};

export default function CrmKanban() {
  const { token, user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDealId, setEditingDealId] = useState<number | null>(null);
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [search, setSearch] = useState('');

  const canReopen = user?.role === 'admin' || user?.role === 'director';
  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };

  // Если на дашборде кликнули по сделке — открываем её карточку при заходе в воронку
  useEffect(() => {
    try {
      const pendingId = localStorage.getItem('crm_open_deal_id');
      if (pendingId) {
        localStorage.removeItem('crm_open_deal_id');
        setDetailId(Number(pendingId));
      }
    } catch { /* ignore */ }
  }, []);

  const {
    stages, deals, isLoading, dealDetail,
    moveMutation, createMutation, updateMutation, addActivityMutation,
  } = useCrmKanbanData({
    headers,
    statusFilter,
    sortKey,
    search,
    detailId,
    onCreateSuccess: () => {
      setModalOpen(false);
      setEditingDealId(null);
      setForm(EMPTY_FORM);
      setOwnerLabel(''); setOwnerSearch('');
      setListingLabel(''); setListingSearch('');
    },
    onActivityAdded: () => setNewActivity(''),
  });

  const openEditModal = () => {
    if (!dealDetail) return;
    setEditingDealId(dealDetail.id);
    setForm({
      title: dealDetail.title || '',
      owner_id: '',
      listing_id: '',
      amount: dealDetail.amount != null ? String(dealDetail.amount) : '',
      commission: dealDetail.commission != null ? String(dealDetail.commission) : '',
      source: dealDetail.source || '',
      notes: dealDetail.notes || '',
      assigned_to: '',
    });
    setListingLabel('');
    setListingSearch('');
    setModalOpen(true);
  };

  const handleDrop = (stageId: number) => {
    if (dragDeal && dragDeal.stage_id !== stageId) {
      // Если перетаскиваем из терминального этапа — нужно право
      if (dragDeal.is_terminal && !canReopen) {
        toast.error('Сделка закрыта. Переоткрыть может только админ или директор');
        setDragDeal(null);
        return;
      }
      moveMutation.mutate({ dealId: dragDeal.id, stageId });
    }
    setDragDeal(null);
  };

  // Воронка сделок доступна только админу и директору
  if (user && user.role !== 'admin' && user.role !== 'director') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
        <Icon name="Lock" size={32} className="mx-auto mb-3 text-amber-600" />
        <div className="font-semibold text-amber-800">Раздел недоступен</div>
        <div className="text-sm text-amber-700 mt-1">
          Воронка сделок доступна только администратору и директору.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-700">Воронка сделок</h2>
          <p className="text-sm text-muted-foreground">Перетащите карточки между этапами</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-brand-blue text-white">
          <Icon name="Plus" size={16} className="mr-2" />
          Новая сделка
        </Button>
      </div>

      <CrmKanbanToolbar
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        search={search}
        setSearch={setSearch}
        sortKey={sortKey}
        setSortKey={setSortKey}
        dealsCount={deals.length}
      />

      <CrmKanbanBoard
        isLoading={isLoading}
        stages={stages}
        deals={deals}
        onDragStart={setDragDeal}
        onDragEnd={() => setDragDeal(null)}
        onDrop={handleDrop}
        onCardClick={setDetailId}
      />

      <CrmCreateDealModal
        open={modalOpen}
        onOpenChange={(open) => { setModalOpen(open); if (!open) setEditingDealId(null); }}
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
        isPending={editingDealId ? updateMutation.isPending : createMutation.isPending}
        onSubmit={() => {
          if (editingDealId) {
            updateMutation.mutate({ id: editingDealId, data: form });
          } else {
            createMutation.mutate(form);
          }
        }}
        headers={headers}
        canAssignBroker={canReopen}
        currentUserId={user?.id}
        editingDealId={editingDealId}
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
        onEdit={() => { setDetailId(null); openEditModal(); }}
      />
    </div>
  );
}