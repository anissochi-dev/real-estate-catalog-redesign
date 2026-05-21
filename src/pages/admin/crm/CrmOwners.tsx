import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CRM_URL } from '@/lib/adminApi';

interface Owner {
  id: number;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  inn?: string;
  source: string;
  notes?: string;
  created_at: string;
  creator?: string;
  listings_count: number;
  deals_count: number;
  listings?: { id: number; title: string; address?: string; price?: number; status?: string }[];
  deals?: { id: number; title: string; stage?: string; amount?: number; commission?: number; created_at?: string }[];
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Вручную',
  xml: 'XML',
  import: 'Импорт',
  avito: 'Авито',
  cian: 'ЦИАН',
};

export default function CrmOwners() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', inn: '', source: 'manual', notes: '' });
  const [dupWarning, setDupWarning] = useState<{ id: number; name: string } | null>(null);

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };

  const { data, isLoading } = useQuery({
    queryKey: ['crm-owners', search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ search, page: String(page), limit: '30' });
      const r = await fetch(`${CRM_URL}/owners?${params}`, { headers });
      return r.json();
    },
  });

  const { data: ownerDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['crm-owner', selectedOwner?.id],
    queryFn: async () => {
      const r = await fetch(`${CRM_URL}/owners/${selectedOwner!.id}`, { headers });
      return r.json();
    },
    enabled: !!selectedOwner,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await fetch(`${CRM_URL}/owners`, { method: 'POST', headers, body: JSON.stringify(data) });
      const json = await r.json();
      if (r.status === 409) throw { duplicate: true, existing: json.existing };
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-owners'] });
      setModalOpen(false);
      resetForm();
      toast.success('Собственник добавлен');
    },
    onError: (e: { duplicate?: boolean; existing?: { id: number; name: string }; message?: string }) => {
      if (e.duplicate && e.existing) {
        setDupWarning(e.existing);
      } else {
        toast.error(e.message || 'Ошибка');
      }
    },
  });

  const resetForm = () => {
    setForm({ name: '', phone: '', email: '', company: '', inn: '', source: 'manual', notes: '' });
    setDupWarning(null);
  };

  const owners: Owner[] = data?.owners || [];
  const total: number = data?.total || 0;
  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-700">Собственники</h2>
          <p className="text-sm text-muted-foreground">Дедупликация по номеру телефона</p>
        </div>
        <Button onClick={() => { setModalOpen(true); resetForm(); }} className="bg-brand-blue text-white">
          <Icon name="Plus" size={16} className="mr-2" />
          Добавить
        </Button>
      </div>

      <div className="relative">
        <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Поиск по имени, телефону, компании..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Icon name="Loader2" size={24} className="animate-spin mr-2" /> Загрузка...
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Собственник</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Контакты</th>
                <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Компания</th>
                <th className="text-center px-4 py-3 font-semibold hidden sm:table-cell">Объекты</th>
                <th className="text-center px-4 py-3 font-semibold hidden sm:table-cell">Сделки</th>
                <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Источник</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {owners.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Собственники не найдены</td></tr>
              ) : owners.map(o => (
                <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{o.name}</div>
                    <div className="text-xs text-muted-foreground">{o.created_at ? new Date(o.created_at).toLocaleDateString('ru') : ''}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div>{o.phone}</div>
                    {o.email && <div className="text-xs text-muted-foreground">{o.email}</div>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {o.company ? <div className="truncate max-w-[160px]">{o.company}</div> : <span className="text-muted-foreground">—</span>}
                    {o.inn && <div className="text-xs text-muted-foreground">ИНН: {o.inn}</div>}
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <Badge variant="outline">{o.listings_count}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <Badge variant="outline">{o.deals_count}</Badge>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <Badge variant="secondary" className="text-xs">{SOURCE_LABELS[o.source] || o.source}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedOwner(o)}>
                      <Icon name="Eye" size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-sm text-muted-foreground">Всего: {total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <Icon name="ChevronLeft" size={15} />
                </Button>
                <span className="text-sm px-2 flex items-center">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <Icon name="ChevronRight" size={15} />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Модал добавления */}
      <Dialog open={modalOpen} onOpenChange={open => { setModalOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый собственник</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {dupWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                <div className="font-semibold text-amber-800 flex items-center gap-2">
                  <Icon name="AlertTriangle" size={15} />
                  Дубликат найден
                </div>
                <div className="text-amber-700 mt-1">
                  Собственник с таким телефоном уже существует: <strong>{dupWarning.name}</strong> (ID {dupWarning.id})
                </div>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => {
                  setModalOpen(false);
                  setSelectedOwner({ ...dupWarning } as Owner);
                  resetForm();
                }}>
                  Открыть карточку
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Имя *</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Иванов Иван Иванович" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Телефон *</label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+7 (900) 123-45-67" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ivan@example.com" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Компания</label>
                <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="ООО Ромашка" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ИНН</label>
                <Input value={form.inn} onChange={e => setForm(f => ({ ...f, inn: e.target.value }))} placeholder="7701234567" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Заметки</label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Любая дополнительная информация" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setModalOpen(false); resetForm(); }}>Отмена</Button>
              <Button
                className="bg-brand-blue text-white"
                disabled={!form.name || !form.phone || createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                {createMutation.isPending ? <Icon name="Loader2" size={15} className="animate-spin mr-1" /> : null}
                Добавить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Карточка собственника */}
      <Dialog open={!!selectedOwner} onOpenChange={open => { if (!open) setSelectedOwner(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ownerDetail?.name || selectedOwner?.name}</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Icon name="Loader2" size={22} className="animate-spin text-muted-foreground" />
            </div>
          ) : ownerDetail && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Телефон:</span> <strong>{ownerDetail.phone}</strong></div>
                {ownerDetail.email && <div><span className="text-muted-foreground">Email:</span> {ownerDetail.email}</div>}
                {ownerDetail.company && <div><span className="text-muted-foreground">Компания:</span> {ownerDetail.company}</div>}
                {ownerDetail.inn && <div><span className="text-muted-foreground">ИНН:</span> {ownerDetail.inn}</div>}
                <div><span className="text-muted-foreground">Источник:</span> {SOURCE_LABELS[ownerDetail.source] || ownerDetail.source}</div>
                <div><span className="text-muted-foreground">Добавил:</span> {ownerDetail.creator || '—'}</div>
              </div>
              {ownerDetail.notes && (
                <div className="bg-muted/40 rounded-xl p-3 text-sm">{ownerDetail.notes}</div>
              )}

              {ownerDetail.listings?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2"><Icon name="Building2" size={15} /> Объекты ({ownerDetail.listings.length})</h4>
                  <div className="space-y-2">
                    {ownerDetail.listings.map((l: { id: number; title: string; address?: string; price?: number; status?: string }) => (
                      <div key={l.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl text-sm">
                        <div>
                          <div className="font-medium">{l.title}</div>
                          {l.address && <div className="text-xs text-muted-foreground">{l.address}</div>}
                        </div>
                        <div className="text-right">
                          {l.price && <div className="font-semibold">{Number(l.price).toLocaleString('ru')} ₽</div>}
                          <Badge variant="outline" className="text-xs">{l.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ownerDetail.deals?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2"><Icon name="Handshake" size={15} /> Сделки ({ownerDetail.deals.length})</h4>
                  <div className="space-y-2">
                    {ownerDetail.deals.map((d: { id: number; title: string; stage?: string; amount?: number; commission?: number; created_at?: string }) => (
                      <div key={d.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl text-sm">
                        <div>
                          <div className="font-medium">{d.title}</div>
                          <Badge variant="secondary" className="text-xs mt-1">{d.stage}</Badge>
                        </div>
                        {d.commission && <div className="text-green-600 font-semibold">+{Number(d.commission).toLocaleString('ru')} ₽</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}