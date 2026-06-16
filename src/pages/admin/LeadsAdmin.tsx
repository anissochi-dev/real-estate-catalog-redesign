import { useEffect, useState } from 'react';
import { adminApi, aiApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { Lead, Comment, Listing, STATUSES, empty } from './leads/leadsTypes';
import LeadsFilterBar from './leads/LeadsFilterBar';
import LeadsTable from './leads/LeadsTable';
import LeadDetail from './leads/LeadDetail';
import LeadEditModal from './leads/LeadEditModal';

export default function LeadsAdmin() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [active, setActive] = useState<Lead | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [editing, setEditing] = useState<Partial<Lead> | null>(null);
  const [filter, setFilter] = useState<'all' | 'network' | string>('all');
  const [listingSearch, setListingSearch] = useState('');
  const [listingDropOpen, setListingDropOpen] = useState(false);

  const load = () =>
    Promise.all([adminApi.listLeads(), adminApi.listListings()])
      .then(([l, lg]) => {
        setLeads(l.leads);
        setListings(lg.listings.map((x: Listing) => ({ id: x.id, title: x.title })));
      })
      .catch(() => toast.error('Не удалось загрузить заявки'));

  useEffect(() => { load(); }, []);

  const openLead = async (l: Lead) => {
    setActive(l);
    setAiReply('');
    const d = await adminApi.getLead(l.id);
    setComments(d.comments || []);
  };

  const update = async (changes: Partial<Lead>) => {
    if (!active) return;
    await adminApi.updateLead(active.id, changes as Record<string, unknown>);
    setActive({ ...active, ...changes });
    load();
  };

  const sendComment = async () => {
    if (!active || !comment.trim()) return;
    await adminApi.addLeadComment(active.id, comment);
    setComment('');
    const d = await adminApi.getLead(active.id);
    setComments(d.comments || []);
  };

  const generateReply = async () => {
    if (!active) return;
    setAiLoading(true);
    try {
      const r = await aiApi.ask('reply_lead',
        `Клиент: ${active.name}, телефон: ${active.phone}, сообщение: ${active.message || 'без сообщения'}`);
      setAiReply(r.text);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка генерации ответа');
    } finally {
      setAiLoading(false);
    }
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

  const filtered = leads.filter(l => {
    if (filter === 'all') return true;
    if (filter === 'network') return l.is_network_tenant;
    return l.status === STATUSES.find(s => s[0] === filter)?.[0];
  });

  return (
    <div className="space-y-4">
      <LeadsFilterBar
        leads={leads}
        filter={filter}
        setFilter={setFilter}
        onAdd={() => setEditing({ ...empty })}
      />

      <LeadsTable
        leads={filtered}
        onOpen={openLead}
        onDelete={del}
      />

      {/* Модальное окно с деталями выбранной заявки */}
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
                aiReply={aiReply}
                aiLoading={aiLoading}
                onUpdate={update}
                onEdit={() => setEditing(active)}
                onDelete={() => del(active.id)}
                onSendComment={sendComment}
                onGenerateReply={generateReply}
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