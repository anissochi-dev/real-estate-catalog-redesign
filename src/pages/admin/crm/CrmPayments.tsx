import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CRM_PAYMENTS_URL as PAYMENTS_URL, CRM_URL } from '@/lib/adminApi';

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  pending: { label: 'Ожидает', class: 'bg-amber-100 text-amber-700' },
  succeeded: { label: 'Оплачено', class: 'bg-green-100 text-green-700' },
  canceled: { label: 'Отменён', class: 'bg-red-100 text-red-700' },
};

interface Payment {
  id: number;
  deal_id?: number;
  deal_title?: string;
  owner_id?: number;
  owner_name?: string;
  amount: number;
  description?: string;
  yookassa_payment_id?: string;
  yookassa_url?: string;
  status: string;
  created_at: string;
  creator?: string;
}

export default function CrmPayments() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    amount: '',
    description: 'Оплата услуг агентства',
    deal_id: '',
    owner_id: '',
    return_url: window.location.origin + '/admin',
  });

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };

  const { data, isLoading } = useQuery({
    queryKey: ['crm-payments', page],
    queryFn: async () => {
      const r = await fetch(`${PAYMENTS_URL}/?page=${page}&limit=30`, { headers });
      return r.json();
    },
  });

  const { data: owners = [] } = useQuery<{ id: number; name: string; phone: string }[]>({
    queryKey: ['crm-owners-list'],
    queryFn: async () => {
      const r = await fetch(`${CRM_URL}/owners?limit=100`, { headers });
      const d = await r.json();
      return d.owners || [];
    },
  });

  const { data: deals = [] } = useQuery<{ id: number; title: string }[]>({
    queryKey: ['crm-deals-list'],
    queryFn: async () => {
      const r = await fetch(`${CRM_URL}/deals`, { headers });
      return r.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await fetch(`${PAYMENTS_URL}/`, {
        method: 'POST', headers, body: JSON.stringify({
          ...data,
          amount: Number(data.amount),
          deal_id: data.deal_id ? Number(data.deal_id) : undefined,
          owner_id: data.owner_id ? Number(data.owner_id) : undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['crm-payments'] });
      setModalOpen(false);
      setForm({ amount: '', description: 'Оплата услуг агентства', deal_id: '', owner_id: '', return_url: window.location.origin + '/admin' });
      toast.success('Ссылка на оплату создана');
      if (data.payment_url) {
        navigator.clipboard?.writeText(data.payment_url);
        toast.info('Ссылка скопирована в буфер обмена');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payments: Payment[] = data?.payments || [];
  const total: number = data?.total || 0;
  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-700">Платежи</h2>
          <p className="text-sm text-muted-foreground">Генерация ссылок оплаты через ЮКассу</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-brand-blue text-white">
          <Icon name="Plus" size={16} className="mr-2" />
          Создать ссылку
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Icon name="Loader2" size={22} className="animate-spin mr-2" /> Загрузка...
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Описание</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Клиент</th>
                <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Сделка</th>
                <th className="text-right px-4 py-3 font-semibold">Сумма</th>
                <th className="text-center px-4 py-3 font-semibold">Статус</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Платежей пока нет</td></tr>
              ) : payments.map(p => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.description}</div>
                    <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString('ru')} · {p.creator}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">{p.owner_name || '—'}</td>
                  <td className="px-4 py-3 hidden lg:table-cell truncate max-w-[160px]">{p.deal_title || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {Number(p.amount).toLocaleString('ru')} ₽
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${STATUS_BADGE[p.status]?.class || 'bg-muted text-foreground'}`}>
                      {STATUS_BADGE[p.status]?.label || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.yookassa_url && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => {
                          navigator.clipboard?.writeText(p.yookassa_url!);
                          toast.success('Ссылка скопирована');
                        }}
                      >
                        <Icon name="Copy" size={14} />
                      </Button>
                    )}
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Новый платёж</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs text-muted-foreground">Сумма (₽) *</label>
              <Input
                type="number"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="75000"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Описание</label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Собственник</label>
              <select
                value={form.owner_id}
                onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">— Не привязывать —</option>
                {(owners as { id: number; name: string; phone: string }[]).map(o => (
                  <option key={o.id} value={o.id}>{o.name} ({o.phone})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Сделка</label>
              <select
                value={form.deal_id}
                onChange={e => setForm(f => ({ ...f, deal_id: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">— Не привязывать —</option>
                {(deals as { id: number; title: string }[]).map(d => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-xs text-muted-foreground">
              <Icon name="Info" size={12} className="inline mr-1" />
              Ссылка будет автоматически скопирована в буфер обмена после создания.
              Для работы нужны ключи ЮКассы в настройках.
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Отмена</Button>
              <Button
                className="bg-brand-blue text-white"
                disabled={!form.amount || Number(form.amount) <= 0 || createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                {createMutation.isPending && <Icon name="Loader2" size={15} className="animate-spin mr-1" />}
                Создать ссылку
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}