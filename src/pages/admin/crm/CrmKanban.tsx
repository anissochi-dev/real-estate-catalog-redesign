import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CRM_URL } from '@/lib/adminApi';

interface Stage {
  id: number;
  name: string;
  color: string;
  position: number;
  is_terminal: boolean;
  is_win: boolean;
}

interface Deal {
  id: number;
  title: string;
  stage_id: number;
  stage_name: string;
  stage_color: string;
  owner_id?: number;
  owner_name?: string;
  owner_phone?: string;
  listing_id?: number;
  listing_title?: string;
  assigned_to?: number;
  assignee_name?: string;
  amount?: number;
  commission?: number;
  source?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export default function CrmKanban() {
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [newActivity, setNewActivity] = useState('');
  const [activityType, setActivityType] = useState('note');
  const [form, setForm] = useState({ title: '', owner_id: '', listing_id: '', amount: '', commission: '', source: '', notes: '' });
  const [ownerSearch, setOwnerSearch] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [ownerDropOpen, setOwnerDropOpen] = useState(false);
  const ownerDropRef = useRef<HTMLDivElement>(null);
  const [listingSearch, setListingSearch] = useState('');
  const [listingLabel, setListingLabel] = useState('');
  const [listingDropOpen, setListingDropOpen] = useState(false);
  const listingDropRef = useRef<HTMLDivElement>(null);
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

  const { data: ownerResults = [], isFetching: ownerFetching } = useQuery<{ id: number; name: string; phone: string }[]>({
    queryKey: ['crm-owners-search', ownerSearch],
    queryFn: async () => {
      if (ownerSearch.length < 1) return [];
      const r = await fetch(`${CRM_URL}/owners?search=${encodeURIComponent(ownerSearch)}&limit=10`, { headers });
      const d = await r.json();
      return d.owners || [];
    },
    enabled: ownerSearch.length >= 1,
    staleTime: 20_000,
  });

  const LISTINGS_URL = 'https://functions.poehali.dev/590f7088-530b-4bfb-994e-1047674672fa';
  const { data: listingResults = [], isFetching: listingFetching } = useQuery<{ id: number; title: string; owner_name: string; owner_phone: string }[]>({
    queryKey: ['crm-listings-search', listingSearch],
    queryFn: async () => {
      if (listingSearch.length < 2) return [];
      const r = await fetch(`${LISTINGS_URL}?action=search&q=${encodeURIComponent(listingSearch)}&limit=8`, { headers: { 'X-Auth-Token': token || '' } });
      const d = await r.json();
      return (d.listings || []).map((l: { id: number; title: string; owner_name?: string; owner_phone?: string }) => ({
        id: l.id, title: l.title, owner_name: l.owner_name || '', owner_phone: l.owner_phone || '',
      }));
    },
    enabled: listingSearch.length >= 2,
    staleTime: 20_000,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ownerDropRef.current && !ownerDropRef.current.contains(e.target as Node)) {
        setOwnerDropOpen(false);
      }
      if (listingDropRef.current && !listingDropRef.current.contains(e.target as Node)) {
        setListingDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const moveMutation = useMutation({
    mutationFn: async ({ dealId, stageId }: { dealId: number; stageId: number }) => {
      await fetch(`${CRM_URL}/deals/${dealId}`, {
        method: 'PUT', headers, body: JSON.stringify({ stage_id: stageId }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-deals'] }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
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
      setForm({ title: '', owner_id: '', listing_id: '', amount: '', commission: '', source: '', notes: '' });
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

  const ACTIVITY_ICONS: Record<string, string> = {
    note: 'FileText',
    call: 'Phone',
    email: 'Mail',
    meeting: 'Calendar',
    stage_change: 'ArrowRight',
    payment: 'CreditCard',
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
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => setDragDeal(deal)}
                      onDragEnd={() => setDragDeal(null)}
                      onClick={() => setDetailId(deal.id)}
                      className="bg-white rounded-xl border border-border p-3 shadow-sm cursor-pointer hover:shadow-md transition select-none"
                    >
                      <div className="font-semibold text-sm mb-1 leading-tight">{deal.title}</div>
                      {deal.owner_name && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Icon name="User" size={11} />
                          {deal.owner_name}
                        </div>
                      )}
                      {deal.listing_title && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 truncate">
                          <Icon name="Building2" size={11} />
                          {deal.listing_title}
                        </div>
                      )}
                      {deal.assignee_name && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icon name="UserCheck" size={11} />
                          {deal.assignee_name}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        {deal.amount ? (
                          <span className="text-xs font-semibold text-brand-blue">
                            {Number(deal.amount).toLocaleString('ru')} ₽
                          </span>
                        ) : <span />}
                        {deal.commission ? (
                          <span className="text-xs text-green-600">
                            +{Number(deal.commission).toLocaleString('ru')} ₽
                          </span>
                        ) : <span />}
                      </div>
                    </div>
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

      {/* Создание сделки */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новая сделка</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs text-muted-foreground">Название *</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Аренда офиса 150 м²" />
            </div>
            <div ref={ownerDropRef} className="relative">
              <label className="text-xs text-muted-foreground">Собственник</label>
              {form.owner_id ? (
                <div className="flex items-center justify-between px-3 py-2 border border-brand-blue/40 rounded-xl bg-brand-blue/5 text-sm">
                  <span className="font-medium text-brand-blue truncate">{ownerLabel}</span>
                  <button type="button" onClick={() => { setForm(f => ({ ...f, owner_id: '' })); setOwnerLabel(''); setOwnerSearch(''); }}
                    className="ml-2 shrink-0 text-muted-foreground hover:text-red-500">
                    <Icon name="X" size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    value={ownerSearch}
                    onChange={e => { setOwnerSearch(e.target.value); setOwnerDropOpen(true); }}
                    onFocus={() => setOwnerDropOpen(true)}
                    placeholder="Введите имя или телефон..."
                    className="pr-8"
                  />
                  {ownerFetching && (
                    <Icon name="Loader2" size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                  {ownerDropOpen && ownerResults.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {ownerResults.map(o => (
                        <button key={o.id} type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted transition text-sm"
                          onMouseDown={() => {
                            setForm(f => ({ ...f, owner_id: String(o.id) }));
                            setOwnerLabel(`${o.name} (${o.phone})`);
                            setOwnerDropOpen(false);
                          }}>
                          <div className="font-medium">{o.name}</div>
                          {o.phone && <div className="text-xs text-muted-foreground">{o.phone}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                  {ownerDropOpen && !ownerFetching && ownerSearch.length >= 1 && ownerResults.length === 0 && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg px-3 py-2 text-sm text-muted-foreground">
                      Не найдено
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Объект — при выборе подтягивает телефон собственника */}
            <div ref={listingDropRef} className="relative">
              <label className="text-xs text-muted-foreground">Объект недвижимости</label>
              {form.listing_id ? (
                <div className="flex items-center justify-between px-3 py-2 border border-brand-blue/40 rounded-xl bg-brand-blue/5 text-sm">
                  <span className="font-medium text-brand-blue truncate">{listingLabel}</span>
                  <button type="button" onClick={() => { setForm(f => ({ ...f, listing_id: '' })); setListingLabel(''); setListingSearch(''); }}
                    className="ml-2 shrink-0 text-muted-foreground hover:text-red-500">
                    <Icon name="X" size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    value={listingSearch}
                    onChange={e => { setListingSearch(e.target.value); setListingDropOpen(true); }}
                    onFocus={() => setListingDropOpen(true)}
                    placeholder="Поиск объекта по названию..."
                    className="pr-8"
                  />
                  {listingFetching && (
                    <Icon name="Loader2" size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                  {listingDropOpen && listingResults.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {listingResults.map(l => (
                        <button key={l.id} type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted transition text-sm"
                          onMouseDown={() => {
                            setForm(f => ({ ...f, listing_id: String(l.id) }));
                            setListingLabel(`#${l.id} ${l.title}`);
                            setListingDropOpen(false);
                            // Автозаполнение телефона собственника из объекта
                            if (l.owner_phone && !form.owner_id) {
                              setOwnerSearch(l.owner_phone);
                              setOwnerDropOpen(true);
                            }
                          }}>
                          <div className="font-medium truncate">{l.title}</div>
                          {l.owner_name && <div className="text-xs text-muted-foreground">{l.owner_name}{l.owner_phone ? ` · ${l.owner_phone}` : ''}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Сумма сделки</label>
                <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="1 500 000" type="number" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Комиссия</label>
                <Input value={form.commission} onChange={e => setForm(f => ({ ...f, commission: e.target.value }))} placeholder="75 000" type="number" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Источник</label>
              <Input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Авито, Звонок, Рекомендация..." />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Заметки</label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Отмена</Button>
              <Button
                className="bg-brand-blue text-white"
                disabled={!form.title || createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                {createMutation.isPending && <Icon name="Loader2" size={15} className="animate-spin mr-1" />}
                Создать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Детали сделки */}
      <Dialog open={!!detailId} onOpenChange={open => { if (!open) setDetailId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {dealDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {dealDetail.title}
                  <span className="text-sm font-normal px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: dealDetail.stage_color }}>
                    {dealDetail.stage_name}
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {dealDetail.owner_name && <div><span className="text-muted-foreground">Собственник:</span> <strong>{dealDetail.owner_name}</strong></div>}
                  {dealDetail.assignee_name && <div><span className="text-muted-foreground">Ответственный:</span> {dealDetail.assignee_name}</div>}
                  {dealDetail.amount && <div><span className="text-muted-foreground">Сумма:</span> <strong>{Number(dealDetail.amount).toLocaleString('ru')} ₽</strong></div>}
                  {dealDetail.commission && <div><span className="text-muted-foreground">Комиссия:</span> <strong className="text-green-600">{Number(dealDetail.commission).toLocaleString('ru')} ₽</strong></div>}
                  {dealDetail.source && <div><span className="text-muted-foreground">Источник:</span> {dealDetail.source}</div>}
                </div>
                {dealDetail.notes && <div className="bg-muted/40 rounded-xl p-3 text-sm">{dealDetail.notes}</div>}

                {/* Смена этапа */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Перенести в этап</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {stages.map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          moveMutation.mutate({ dealId: dealDetail.id, stageId: s.id });
                          qc.invalidateQueries({ queryKey: ['crm-deal', detailId] });
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${s.id === dealDetail.stage_id ? 'text-white border-transparent' : 'border-border hover:bg-muted'}`}
                        style={s.id === dealDetail.stage_id ? { backgroundColor: s.color, borderColor: s.color } : {}}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Активности */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Лента активностей</label>
                  <div className="flex gap-2 mt-2">
                    <select
                      value={activityType}
                      onChange={e => setActivityType(e.target.value)}
                      className="border border-border rounded-xl px-2 py-2 text-sm focus:outline-none"
                    >
                      <option value="note">Заметка</option>
                      <option value="call">Звонок</option>
                      <option value="email">Письмо</option>
                      <option value="meeting">Встреча</option>
                    </select>
                    <Input
                      value={newActivity}
                      onChange={e => setNewActivity(e.target.value)}
                      placeholder="Что произошло..."
                      className="flex-1"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newActivity.trim() && detailId) {
                          addActivityMutation.mutate({ dealId: detailId, type: activityType, content: newActivity });
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="bg-brand-blue text-white"
                      disabled={!newActivity.trim()}
                      onClick={() => detailId && addActivityMutation.mutate({ dealId: detailId, type: activityType, content: newActivity })}
                    >
                      <Icon name="Send" size={14} />
                    </Button>
                  </div>

                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                    {dealDetail.activities?.length === 0 && (
                      <div className="text-xs text-muted-foreground text-center py-4">Активностей пока нет</div>
                    )}
                    {dealDetail.activities?.map((a: { id: number; type: string; content?: string; user_name?: string; created_at?: string }) => (
                      <div key={a.id} className="flex gap-2.5 text-sm">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Icon name={ACTIVITY_ICONS[a.type] || 'FileText'} size={13} />
                        </div>
                        <div className="flex-1">
                          <div>{a.content}</div>
                          <div className="text-xs text-muted-foreground">
                            {a.user_name} · {a.created_at ? new Date(a.created_at).toLocaleString('ru', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}