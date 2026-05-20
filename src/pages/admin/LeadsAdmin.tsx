import { useEffect, useState } from 'react';
import { adminApi, aiApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Lead, Comment, Listing, STATUSES, empty } from './leads/leadsTypes';
import LeadsFilterBar from './leads/LeadsFilterBar';
import LeadsList from './leads/LeadsList';
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
    Promise.all([adminApi.listLeads(), adminApi.listListings()]).then(([l, lg]) => {
      setLeads(l.leads);
      setListings(lg.listings.map((x: Listing) => ({ id: x.id, title: x.title })));
    });

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
      alert(e instanceof Error ? e.message : 'Ошибка');
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
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить лид безвозвратно?')) return;
    await adminApi.deleteLead(id);
    if (active?.id === id) setActive(null);
    load();
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <LeadsList
          filtered={filtered}
          active={active}
          onOpen={openLead}
        />

        <div className="lg:col-span-2">
          {!active ? (
            <div className="bg-white rounded-2xl p-12 text-center text-muted-foreground">
              <Icon name="Inbox" size={40} className="mx-auto mb-3 opacity-50" />
              Выберите лид слева
            </div>
          ) : (
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
          )}
        </div>
      </div>

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
