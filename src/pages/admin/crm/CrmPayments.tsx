import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CRM_PAYMENTS_URL as PAYMENTS_URL, CRM_URL, adminApi } from '@/lib/adminApi';
import { Payment, CreateForm, EMPTY_FORM, STATUS_INFO } from './paymentTypes';
import PaymentCreateModal from './PaymentCreateModal';
import PaymentTable from './PaymentTable';

export default function CrmPayments() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [refundId, setRefundId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };

  const { data, isLoading } = useQuery({
    queryKey: ['crm-payments', page, filterType, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (filterType) params.set('payment_type', filterType);
      if (filterStatus) params.set('status', filterStatus);
      const r = await fetch(`${PAYMENTS_URL}/?${params}`, { headers });
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
    mutationFn: async (f: CreateForm) => {
      const r = await fetch(`${PAYMENTS_URL}/`, {
        method: 'POST', headers,
        body: JSON.stringify({
          ...f,
          amount: Number(f.amount),
          deal_id: f.deal_id ? Number(f.deal_id) : undefined,
          owner_id: f.owner_id ? Number(f.owner_id) : undefined,
          buyer_email: f.buyer_email || undefined,
          buyer_phone: f.buyer_phone || undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['crm-payments'] });
      setCreatedUrl((res as { payment_url?: string }).payment_url || null);
      setForm(EMPTY_FORM);
      setModalOpen(false);
      toast.success('Платёжная ссылка создана');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refundMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${PAYMENTS_URL}/${id}?action=refund`, {
        method: 'POST', headers, body: JSON.stringify({}),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка возврата');
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-payments'] });
      setRefundId(null);
      toast.success('Возврат инициирован');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkStatus = async (p: Payment) => {
    const r = await fetch(`${PAYMENTS_URL}/${p.id}`, { headers });
    const d = await r.json();
    qc.invalidateQueries({ queryKey: ['crm-payments'] });
    toast.info(`Статус: ${STATUS_INFO[d.payment?.status]?.label || d.payment?.status}`);
  };

  const copyLink = (url: string) => {
    navigator.clipboard?.writeText(url);
    toast.success('Ссылка скопирована в буфер');
  };

  const { data: settings } = useQuery({
    queryKey: ['settings-yk-check'],
    queryFn: () => adminApi.getSettings(),
    staleTime: 60_000,
  });
  const ykConfigured = !!(settings?.settings?.yookassa_shop_id && settings?.settings?.yookassa_secret_key);

  const payments: Payment[] = data?.payments || [];
  const total: number = data?.total || 0;
  const totalPages = data?.pages || 1;

  return (
    <div className="space-y-5">
      {/* ЮКасса не настроена — предупреждение */}
      {settings && !ykConfigured && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <Icon name="AlertTriangle" size={18} className="flex-shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1 text-sm">
            <div className="font-semibold mb-0.5">ЮКасса не настроена</div>
            <div className="text-amber-800">
              Платёжные ссылки не будут генерироваться. Добавьте Shop ID и Secret Key в{' '}
              <span className="font-semibold">Настройки → Интеграции ИИ → ЮКасса</span>.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0"
            onClick={() => {
              const event = new CustomEvent('navigate-admin', { detail: { tab: 'settings', subtab: 'integrations' } });
              window.dispatchEvent(event);
            }}
          >
            Настроить
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-700">Платежи</h2>
          <p className="text-sm text-muted-foreground">Генерация ссылок ЮКассы · задаток и вознаграждение</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-brand-blue text-white">
          <Icon name="Plus" size={16} className="mr-2" />
          Создать платёж
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(1); }}
          className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">Все типы</option>
          {[
            { value: 'service', label: 'Брокерское вознаграждение' },
            { value: 'deposit', label: 'Задаток' },
            { value: 'prepayment', label: 'Предоплата' },
            { value: 'other', label: 'Другое' },
          ].map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">Все статусы</option>
          {Object.entries(STATUS_INFO).map(([v, i]) => <option key={v} value={v}>{i.label}</option>)}
        </select>
        {(filterType || filterStatus) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterType(''); setFilterStatus(''); }}>
            <Icon name="X" size={14} className="mr-1" /> Сбросить
          </Button>
        )}
      </div>

      <PaymentTable
        payments={payments}
        total={total}
        totalPages={totalPages}
        page={page}
        isLoading={isLoading}
        detailId={detailId}
        refundId={refundId}
        createdUrl={createdUrl}
        setPage={setPage}
        setDetailId={setDetailId}
        setRefundId={setRefundId}
        setCreatedUrl={setCreatedUrl}
        copyLink={copyLink}
        checkStatus={checkStatus}
        refundMutation={refundMutation}
      />

      <PaymentCreateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        form={form}
        setForm={setForm}
        owners={owners as { id: number; name: string; phone: string }[]}
        deals={deals as { id: number; title: string }[]}
        createMutation={createMutation}
      />
    </div>
  );
}