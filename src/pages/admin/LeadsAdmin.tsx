import { useEffect, useState } from 'react';
import { adminApi, aiApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import PhonePickerInput from '@/components/admin/PhonePickerInput';

interface Lead {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  listing_id: number | null;
  status: string;
  source: string;
  created_at: string;
  budget: number | null;
  company: string | null;
  is_network_tenant: boolean;
  show_on_main: boolean;
}

interface Comment { id: number; author_name: string; comment: string; created_at: string }
interface Listing { id: number; title: string }

const STATUSES: [string, string, string, string][] = [
  ['pending', 'На модерации', 'bg-orange-400', 'border-l-orange-400'],
  ['new', 'Новый', 'bg-emerald-500', 'border-l-emerald-500'],
  ['in_progress', 'В работе', 'bg-amber-500', 'border-l-amber-500'],
  ['done', 'Закрыт', 'bg-blue-500', 'border-l-blue-500'],
  ['rejected', 'Отказ', 'bg-red-500', 'border-l-red-500'],
];

const empty: Partial<Lead> = {
  name: '', phone: '', email: '', message: '', status: 'new',
  is_network_tenant: false, show_on_main: true, budget: null, company: '',
};

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

  const statusOf = (s: string) => STATUSES.find(x => x[0] === s);
  const filtered = leads.filter(l => {
    if (filter === 'all') return true;
    if (filter === 'network') return l.is_network_tenant;
    return l.status === filter;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter('all')}
            className={`text-xs px-3 py-1.5 rounded-lg ${filter === 'all' ? 'bg-brand-blue text-white' : 'bg-white shadow-sm hover:bg-muted'}`}>
            Все ({leads.length})
          </button>
          {STATUSES.map(s => (
            <button key={s[0]} onClick={() => setFilter(s[0])}
              className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 ${
                filter === s[0] ? 'bg-brand-blue text-white' : 'bg-white shadow-sm hover:bg-muted'
              }`}>
              <span className={`w-2 h-2 rounded-full ${s[2]}`} />
              {s[1]} ({leads.filter(l => l.status === s[0]).length})
            </button>
          ))}
          <button onClick={() => setFilter('network')}
            className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 ${
              filter === 'network' ? 'bg-brand-blue text-white' : 'bg-white shadow-sm hover:bg-muted'
            }`}>
            <Icon name="Network" size={12} />
            Сетевые ({leads.filter(l => l.is_network_tenant).length})
          </button>
        </div>
        <button onClick={() => setEditing({ ...empty })}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="Plus" size={14} /> Добавить лид
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Нет лидов</div>}
            {filtered.map(l => {
              const st = statusOf(l.status);
              return (
                <button key={l.id} onClick={() => openLead(l)}
                  className={`w-full text-left p-4 border-b border-border border-l-4 hover:bg-muted/40 transition ${
                    st?.[3] || ''
                  } ${active?.id === l.id ? 'bg-brand-blue/5' : ''}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-semibold text-sm">{l.name}</div>
                    <span className={`text-[10px] text-white px-1.5 py-0.5 rounded ${st?.[2] || 'bg-muted'}`}>
                      {st?.[1] || l.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{l.phone}</div>
                  {l.is_network_tenant && (
                    <div className="text-[10px] text-purple-700 bg-purple-50 inline-block px-1.5 py-0.5 rounded mt-1">
                      Сетевой арендатор
                    </div>
                  )}
                  {l.message && <div className="text-xs mt-2 line-clamp-2">{l.message}</div>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2">
          {!active ? (
            <div className="bg-white rounded-2xl p-12 text-center text-muted-foreground">
              <Icon name="Inbox" size={40} className="mx-auto mb-3 opacity-50" />
              Выберите лид слева
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-border">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <div className="font-display font-700 text-lg">{active.name}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <a href={`tel:${active.phone}`} className="text-brand-blue hover:underline">{active.phone}</a>
                      {active.email && <> · {active.email}</>}
                    </div>
                    {active.company && <div className="text-xs text-muted-foreground mt-1">Компания: {active.company}</div>}
                    {active.budget && <div className="text-xs text-muted-foreground">Бюджет: {active.budget.toLocaleString('ru')} ₽</div>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(active)} className="text-brand-blue p-2 rounded-lg hover:bg-muted">
                      <Icon name="Pencil" size={16} />
                    </button>
                    <button onClick={() => del(active.id)} className="text-red-600 p-2 rounded-lg hover:bg-red-50">
                      <Icon name="Trash2" size={16} />
                    </button>
                  </div>
                </div>
                {active.message && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-xl text-sm">{active.message}</div>
                )}

                {active.status === 'pending' && (
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm text-orange-800 flex items-center gap-2">
                      <Icon name="ShieldAlert" size={16} />
                      <span>Лид с сайта — требует модерации</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => update({ status: 'new' })}
                        className="px-3 py-1.5 bg-emerald-500 text-white text-xs rounded-lg font-semibold inline-flex items-center gap-1.5">
                        <Icon name="CheckCircle2" size={13} /> Одобрить
                      </button>
                      <button onClick={() => update({ status: 'rejected' })}
                        className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg font-semibold inline-flex items-center gap-1.5">
                        <Icon name="XCircle" size={13} /> Отклонить
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {STATUSES.map(s => (
                    <button key={s[0]} onClick={() => update({ status: s[0] })}
                      className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition ${
                        active.status === s[0] ? `${s[2]} text-white` : 'bg-muted hover:bg-muted/70'
                      }`}>
                      <span className={`w-2 h-2 rounded-full ${active.status === s[0] ? 'bg-white' : s[2]}`} />
                      {s[1]}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={active.is_network_tenant}
                      onChange={e => update({ is_network_tenant: e.target.checked })} />
                    Сетевой арендатор
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={active.show_on_main}
                      onChange={e => update({ show_on_main: e.target.checked })} />
                    Показывать на главной
                  </label>
                </div>
              </div>

              <div className="p-5 border-b border-border space-y-2">
                <div className="flex justify-between items-center">
                  <div className="font-semibold text-sm">Черновик ответа клиенту</div>
                  <button onClick={generateReply} disabled={aiLoading}
                    className="text-xs text-brand-orange hover:underline inline-flex items-center gap-1">
                    <Icon name="Sparkles" size={12} />
                    {aiLoading ? 'Генерация...' : 'Сгенерировать ИИ'}
                  </button>
                </div>
                {aiReply && (
                  <div className="p-3 bg-brand-orange/10 border border-brand-orange/30 rounded-xl text-sm whitespace-pre-wrap">
                    {aiReply}
                  </div>
                )}
              </div>

              <div className="p-5">
                <div className="font-semibold text-sm mb-3">Комментарии</div>
                <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="p-3 bg-muted/40 rounded-xl text-sm">
                      <div className="text-xs text-muted-foreground mb-1">
                        {c.author_name} · {new Date(c.created_at).toLocaleString('ru')}
                      </div>
                      {c.comment}
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <div className="text-sm text-muted-foreground">Нет комментариев</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input value={comment} onChange={e => setComment(e.target.value)}
                    placeholder="Добавить комментарий..."
                    className="flex-1 px-3 py-2 border rounded-xl text-sm" />
                  <button onClick={sendComment} className="btn-blue text-white px-4 rounded-xl">
                    <Icon name="Send" size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-white">
              <div className="font-display font-700 text-lg">
                {editing.id ? 'Редактировать лид' : 'Новый лид'}
              </div>
              <button onClick={() => setEditing(null)}><Icon name="X" size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="relative">
                <input className="w-full px-3 py-2 border rounded-lg pr-16" placeholder="Имя клиента"
                  maxLength={60}
                  value={editing.name || ''}
                  onChange={e => setEditing({ ...editing, name: e.target.value })} />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums ${
                  (editing.name?.length || 0) >= 55 ? 'text-red-500' : 'text-muted-foreground'
                }`}>
                  {editing.name?.length || 0}/60
                </span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Телефон</label>
                <PhonePickerInput
                  value={editing.phone || ''}
                  onChange={(phone, name) => setEditing({ ...editing, phone, ...(name && !editing.name ? { name } : {}) })}
                  onNameChange={name => { if (!editing.name) setEditing({ ...editing, name }); }}
                />
              </div>
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="Email (необязательно)"
                value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} />
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="Компания (для сетевых)"
                value={editing.company || ''} onChange={e => setEditing({ ...editing, company: e.target.value })} />
              <input type="number" className="w-full px-3 py-2 border rounded-lg" placeholder="Бюджет, ₽"
                value={editing.budget ?? ''} onChange={e => setEditing({ ...editing, budget: e.target.value === '' ? null : +e.target.value })} />
              <textarea className="w-full px-3 py-2 border rounded-lg" rows={3} placeholder="Текст запроса"
                value={editing.message || ''} onChange={e => setEditing({ ...editing, message: e.target.value })} />

              <div>
                <label className="text-xs text-muted-foreground">Привязка к объекту (необязательно)</label>
                <select className="w-full px-3 py-2 border rounded-lg" value={editing.listing_id ?? ''}
                  onChange={e => setEditing({ ...editing, listing_id: e.target.value === '' ? null : +e.target.value })}>
                  <option value="">— Без привязки —</option>
                  {listings.map(l => <option key={l.id} value={l.id}>#{l.id} {l.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Статус</label>
                <select className="w-full px-3 py-2 border rounded-lg" value={editing.status || 'new'}
                  onChange={e => setEditing({ ...editing, status: e.target.value })}>
                  {STATUSES.map(s => <option key={s[0]} value={s[0]}>{s[1]}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.is_network_tenant}
                  onChange={e => setEditing({ ...editing, is_network_tenant: e.target.checked })} />
                Сетевой арендатор
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.show_on_main !== false}
                  onChange={e => setEditing({ ...editing, show_on_main: e.target.checked })} />
                Показывать на главной странице
              </label>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-sm">Отмена</button>
              <button onClick={save} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}