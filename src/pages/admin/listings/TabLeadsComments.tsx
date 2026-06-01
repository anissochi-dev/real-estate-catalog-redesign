import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { fmtDate } from './types';
import { InternalCardLead, DbComment, LEAD_STATUS } from './internalCardTypes';
import { Spinner } from './TabOverview';

export function TabLeads({ listingId }: { listingId: number }) {
  const [leads, setLeads] = useState<InternalCardLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.listLeads().then(r => {
      const all: InternalCardLead[] = r.leads || [];
      setLeads(all.filter(l => l.listing_id === listingId));
    }).finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return <Spinner />;

  if (!leads.length) return (
    <div className="p-6 text-center text-muted-foreground text-sm">По этому объекту заявок нет</div>
  );

  return (
    <div className="p-6">
      <div className="text-sm font-semibold mb-3">Заявки по объекту ({leads.length})</div>
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Дата</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Имя</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Телефон</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Статус</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(l => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(l.created_at)}</td>
                <td className="px-4 py-2">{l.name}</td>
                <td className="px-4 py-2 font-mono text-brand-blue">{l.phone}</td>
                <td className="px-4 py-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">
                    {LEAD_STATUS[l.status] || l.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TabComments({ listingId }: { listingId: number }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<DbComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const canView = user?.role && ['admin', 'director', 'broker', 'office_manager'].includes(user.role);
  const canAdd = canView;

  const load = () => {
    adminApi.getListingComments(listingId).then(r => {
      const all: DbComment[] = r.comments || [];
      if (user?.role === 'broker') {
        setComments(all.filter(c => !c.is_ai && (c.user_id === user.id)));
      } else {
        setComments(all.filter(c => !c.is_ai));
      }
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [listingId]);

  if (!canView) return (
    <div className="p-6 text-center text-muted-foreground text-sm">Нет доступа к заметкам</div>
  );

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await adminApi.addListingComment(listingId, text.trim(), false);
      setText('');
      load();
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить заметку?')) return;
    setDeletingId(id);
    try {
      await adminApi.deleteListingComment(id);
      load();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="MessageSquare" size={15} className="text-brand-blue" />
        <span className="text-sm font-semibold">Личные заметки по объекту</span>
      </div>
      <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
        Заметки видны только вам, администратору и директору. Используйте для личных наблюдений о клиентах, переговорах, договорённостях.
      </div>

      {loading ? <Spinner /> : comments.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-6">
          <Icon name="MessageSquarePlus" size={28} className="mx-auto mb-2 opacity-30" />
          Заметок пока нет
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="bg-muted/40 rounded-xl px-4 py-3 group relative">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-brand-blue/20 flex items-center justify-center text-xs font-bold text-brand-blue shrink-0">
                    {(c.user_name || 'Б').charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-semibold">{c.user_name}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(c.created_at)}</span>
                </div>
                {(user?.role === 'admin' || user?.role === 'director' || c.user_id === user?.id) && (
                  <button
                    onClick={() => del(c.id)}
                    disabled={deletingId === c.id}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-all shrink-0"
                  >
                    {deletingId === c.id
                      ? <Icon name="Loader2" size={13} className="animate-spin" />
                      : <Icon name="Trash2" size={13} />}
                  </button>
                )}
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap pl-8">{c.comment}</div>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <div className="space-y-2">
          <textarea
            ref={textRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) save(); }}
            rows={3}
            placeholder="Напишите заметку... (Ctrl+Enter для сохранения)"
            className="w-full px-3 py-2.5 border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
          />
          <button
            onClick={save}
            disabled={!text.trim() || saving}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Save" size={14} />}
            Сохранить заметку
          </button>
        </div>
      )}
    </div>
  );
}
