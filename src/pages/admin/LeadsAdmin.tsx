import { useEffect, useState, useMemo } from 'react';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { Lead, Comment, Listing, STATUSES, empty, PROPERTY_CATEGORIES_LEAD } from './leads/leadsTypes';
import LeadsFilterBar from './leads/LeadsFilterBar';
import LeadsTable from './leads/LeadsTable';
import LeadDetail from './leads/LeadDetail';
import LeadEditModal from './leads/LeadEditModal';
import MatchingModal from './MatchingModal';
import { useAuth } from '@/contexts/AuthContext';
import { District } from './districts/DistrictsTypes';
import { fetchDistricts } from '@/lib/api';

export default function LeadsAdmin() {
  const { user } = useAuth();
  const isBroker = user?.role === 'broker';
  // Брокер может видеть все лиды, но управлять только своими (leads: read+create, без update/delete)
  const canManageLead = (l: Lead) =>
    !isBroker || (l.broker_id != null && l.broker_id === user?.id);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [active, setActive] = useState<Lead | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState('');

  const [editing, setEditing] = useState<Partial<Lead> | null>(null);
  const [filter, setFilter] = useState<'all' | 'network' | string>('all');
  const [search, setSearch] = useState('');
  const [listingSearch, setListingSearch] = useState('');
  const [listingDropOpen, setListingDropOpen] = useState(false);
  const [matchingLeadId, setMatchingLeadId] = useState<number | null>(null);

  const load = () =>
    Promise.all([adminApi.listLeads(), adminApi.listListings()])
      .then(([l, lg]) => {
        setLeads(l.leads);
        setListings(lg.listings.map((x: Listing) => ({ id: x.id, title: x.title })));
      })
      .catch(() => toast.error('Не удалось загрузить заявки'));

  useEffect(() => {
    load();
    // Тот же источник и сортировка, что и в форме объектов — единый список районов
    fetchDistricts().then(list => setDistricts(list as District[])).catch(() => {});
  }, []);

  // Открытие заявки по id из другого раздела (например из подбора совпадений в объектах)
  useEffect(() => {
    const handler = async (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      if (!id) return;
      const l = leads.find(x => x.id === id);
      if (l) { openLead(l); return; }
      try {
        const d = await adminApi.getLead(id);
        if (d.lead) { setActive(d.lead); setComments(d.comments || []); }
      } catch { /* ignore */ }
    };
    window.addEventListener('admin:open-lead', handler);
    return () => window.removeEventListener('admin:open-lead', handler);
  }, [leads]);

  const openLead = async (l: Lead) => {
    setActive(l);
    const d = await adminApi.getLead(l.id);
    setComments(d.comments || []);
  };

  const update = async (changes: Partial<Lead>) => {
    if (!active) return;
    await adminApi.updateLead(active.id, changes as Record<string, unknown>);
    setActive({ ...active, ...changes });
    load();
  };

  // Быстрая смена статуса прямо из списка
  const quickStatus = async (id: number, status: string) => {
    try {
      await adminApi.updateLead(id, { status } as Record<string, unknown>);
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
      if (active?.id === id) setActive(prev => prev ? { ...prev, status } : prev);
      toast.success('Статус обновлён');
    } catch {
      toast.error('Не удалось изменить статус');
    }
  };

  const sendComment = async () => {
    if (!active || !comment.trim()) return;
    await adminApi.addLeadComment(active.id, comment);
    setComment('');
    const d = await adminApi.getLead(active.id);
    setComments(d.comments || []);
  };



  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id) await adminApi.updateLead(editing.id, editing as Record<string, unknown>);
      else await adminApi.createLead(editing as Record<string, unknown>);
      setEditing(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить лид безвозвратно?')) return;
    try {
      await adminApi.deleteLead(id);
      if (active?.id === id) setActive(null);
      load();
    } catch {
      toast.error('Не удалось удалить заявку');
    }
  };

  const filtered = useMemo(() => {
    let list = leads;
    // Фильтр по статусу/типу
    if (filter === 'network') list = list.filter(l => l.is_network_tenant);
    else if (filter !== 'all') list = list.filter(l => l.status === filter);
    // Поиск
    if (search.trim()) {
      const q = search.toLowerCase();
      const qDigits = q.replace(/\D/g, '').replace(/^8/, '7');
      const qNum = parseFloat(q.replace(/\s/g, '').replace(',', '.'));
      list = list.filter(l => {
        const phoneDigits = (l.phone || '').replace(/\D/g, '').replace(/^8/, '7');
        const typeLabel = l.property_type === 'sale' ? 'покупка' : l.property_type === 'rent' ? 'аренда' : '';
        const categoryLabel = PROPERTY_CATEGORIES_LEAD.find(c => c.value === l.property_category)?.label.toLowerCase() || '';
        const budgetFrom = l.budget ?? 0;
        const budgetTo = l.budget_to ?? 0;
        const areaFrom = l.area_from ?? 0;
        const areaTo = l.area_to ?? 0;
        const budgetMatch = !isNaN(qNum) && qNum > 0 && (
          (budgetFrom > 0 && budgetFrom <= qNum && (budgetTo === 0 || qNum <= budgetTo)) ||
          String(budgetFrom).includes(q.replace(/\s/g, '')) ||
          String(budgetTo).includes(q.replace(/\s/g, ''))
        );
        const areaMatch = !isNaN(qNum) && qNum > 0 && (
          (areaFrom > 0 && areaFrom <= qNum && (areaTo === 0 || qNum <= areaTo)) ||
          String(areaFrom).includes(q.replace(/\s/g, '')) ||
          String(areaTo).includes(q.replace(/\s/g, ''))
        );
        const districtMatch = (l.district_ids || []).some(id =>
          (districts.find(d => d.id === id)?.name || '').toLowerCase().includes(q)
        );
        return (
          String(l.id) === q.replace(/^#/, '').trim() ||
          (l.name || '').toLowerCase().includes(q) ||
          (qDigits && phoneDigits.includes(qDigits)) ||
          (l.message || '').toLowerCase().includes(q) ||
          (l.email || '').toLowerCase().includes(q) ||
          (l.company || '').toLowerCase().includes(q) ||
          typeLabel.includes(q) ||
          categoryLabel.includes(q) ||
          (l.utilities || '').toLowerCase().includes(q) ||
          budgetMatch ||
          areaMatch ||
          districtMatch
        );
      });
    }
    return list;
  }, [leads, filter, search, districts]);

  return (
    <div className="space-y-3">
      <LeadsFilterBar
        leads={leads}
        filter={filter}
        setFilter={setFilter}
        onAdd={() => setEditing({ ...empty })}
        search={search}
        setSearch={setSearch}
      />

      {filtered.length === 0 && search && (
        <div className="bg-white rounded-2xl py-12 text-center text-muted-foreground shadow-sm">
          <Icon name="SearchX" size={28} className="mx-auto mb-2 opacity-30" />
          <div className="text-sm">По запросу <strong>«{search}»</strong> ничего не найдено</div>
          <button onClick={() => setSearch('')} className="mt-2 text-xs text-brand-blue hover:underline">
            Сбросить поиск
          </button>
        </div>
      )}

      <LeadsTable
        leads={filtered}
        onOpen={openLead}
        onDelete={del}
        onStatusChange={quickStatus}
        search={search}
        isBroker={isBroker}
        currentUserId={user?.id}
        districts={districts}
        onShowMatching={setMatchingLeadId}
      />

      {matchingLeadId !== null && (
        <MatchingModal
          mode="listings_for_lead"
          id={matchingLeadId}
          onClose={() => setMatchingLeadId(null)}
          onOpenListing={id => {
            setMatchingLeadId(null);
            window.dispatchEvent(new CustomEvent('admin:open-listing', { detail: id }));
          }}
        />
      )}

      {/* Детали заявки — модалка */}
      {active && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
             onClick={() => setActive(null)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-border px-5 py-3 flex items-center justify-between z-10">
              <div className="font-semibold text-sm inline-flex items-center gap-2">
                <Icon name="User" size={16} className="text-brand-blue" />
                Заявка #{active.id}
              </div>
              <button onClick={() => setActive(null)} className="p-1 rounded hover:bg-muted">
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="p-5">
              <LeadDetail
                active={active}
                comments={comments}
                comment={comment}
                setComment={setComment}
                onUpdate={update}
                onEdit={() => setEditing(active)}
                onDelete={() => del(active.id)}
                onSendComment={sendComment}
                canManage={canManageLead(active)}
                onRefresh={load}
              />
            </div>
          </div>
        </div>
      )}

      {editing && (
        <LeadEditModal
          editing={editing}
          setEditing={setEditing}
          listings={listings}
          districts={districts}
          listingSearch={listingSearch}
          setListingSearch={setListingSearch}
          listingDropOpen={listingDropOpen}
          setListingDropOpen={setListingDropOpen}
          onSave={save}
        />
      )}
    </div>
  );
}