import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CRM_PAYMENTS_URL as PAYMENTS_URL, crmUrl, adminApi } from '@/lib/adminApi';
import { Payment, CreateForm, EMPTY_FORM, STATUS_INFO, REFUND_INFO, typeLabel, fmtMoney, fmtDate, fmtDateOnly } from './paymentTypes';
import PaymentCreateModal from './PaymentCreateModal';
import PaymentDetailModal from './PaymentDetailModal';

export default function CrmPayments() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null);
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
      const r = await fetch(crmUrl('owners', null, null, { limit: 100 }), { headers });
      const d = await r.json();
      return d.owners || [];
    },
  });

  const { data: deals = [] } = useQuery<{ id: number; title: string }[]>({
    queryKey: ['crm-deals-list'],
    queryFn: async () => {
      const r = await fetch(crmUrl('deals'), { headers });
      return r.json();
    },
  });

  const { data: listings = [] } = useQuery<{ id: number; title: string; address?: string; price?: number }[]>({
    queryKey: ['listings-for-payments'],
    queryFn: async () => {
      const d = await adminApi.listListings();
      return (d.listings || []).map((l: { id: number; title: string; address?: string; price?: number }) => ({
        id: l.id, title: l.title, address: l.address, price: l.price,
      }));
    },
    staleTime: 60_000,
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
          listing_id: f.listing_id ? Number(f.listing_id) : undefined,
          sale_price: f.sale_price ? Number(f.sale_price) : undefined,
          deposit_amount: f.deposit_amount ? Number(f.deposit_amount) : undefined,
          conditions: f.conditions || undefined,
          contract_url: f.contract_url || undefined,
          deal_date: f.deal_date || undefined,
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

  const copyLink = (url: string) => {
    navigator.clipboard?.writeText(url);
    toast.success('Ссылка скопирована');
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

  // ── Экран с созданной ссылкой ──────────────────────────────────────────
  if (createdUrl) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white rounded-2xl shadow-lg p-8 text-center space-y-5">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <Icon name="CheckCircle2" size={28} className="text-green-600" />
        </div>
        <h2 className="text-xl font-display font-700">Платёжная ссылка создана</h2>
        <div className="bg-muted/50 rounded-xl px-4 py-3 text-sm text-left break-all font-mono">{createdUrl}</div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button className="bg-brand-blue text-white" onClick={() => copyLink(createdUrl)}>
            <Icon name="Copy" size={15} className="mr-2" />Скопировать ссылку
          </Button>
          <Button variant="outline" onClick={() => window.open(createdUrl, '_blank')}>
            <Icon name="ExternalLink" size={15} className="mr-2" />Открыть
          </Button>
        </div>
        <Button variant="ghost" className="text-muted-foreground text-sm" onClick={() => setCreatedUrl(null)}>
          Вернуться к списку платежей
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Предупреждение о ЮКассе */}
      {settings && !ykConfigured && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <Icon name="AlertTriangle" size={18} className="flex-shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1 text-sm">
            <div className="font-semibold mb-0.5">ЮКасса не настроена</div>
            <div className="text-amber-800">Добавьте Shop ID и Secret Key в <span className="font-semibold">Настройки → Интеграции ИИ → ЮКасса</span>.</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-700">Платежи</h2>
          <p className="text-sm text-muted-foreground">Задатки и вознаграждения · ЮКасса · история изменений</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-brand-blue text-white">
          <Icon name="Plus" size={16} className="mr-2" />Создать платёж
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
          className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none">
          <option value="">Все типы</option>
          {[{ value: 'service', label: 'Вознаграждение' }, { value: 'deposit', label: 'Задаток' },
            { value: 'prepayment', label: 'Предоплата' }, { value: 'other', label: 'Другое' }
          ].map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none">
          <option value="">Все статусы</option>
          {Object.entries(STATUS_INFO).map(([v, i]) => <option key={v} value={v}>{i.label}</option>)}
        </select>
        {(filterType || filterStatus) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterType(''); setFilterStatus(''); }}>
            <Icon name="X" size={14} className="mr-1" />Сбросить
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Icon name="Loader2" size={22} className="animate-spin mr-2" />Загрузка...
        </div>
      ) : (
        <>
        {/* Мобильный вид */}
        <div className="sm:hidden bg-white rounded-2xl border border-border overflow-hidden divide-y divide-border">
          {payments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Платежей пока нет</div>
          ) : payments.map(p => {
            const si = STATUS_INFO[p.status] || { label: p.status, cls: 'bg-muted text-foreground', icon: 'Circle' };
            const ri = p.refund_status ? REFUND_INFO[p.refund_status] : null;
            return (
              <div key={p.id} onClick={() => setDetailPayment(p)}
                className="px-4 py-3 cursor-pointer hover:bg-muted/20 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.description}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{typeLabel(p.payment_type)} · {fmtDate(p.created_at)}</div>
                    {p.listing_title && (
                      <div className="text-xs text-brand-blue mt-0.5 flex items-center gap-1 truncate">
                        <Icon name="Building2" size={10} />{p.listing_title}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold text-brand-blue text-sm">{fmtMoney(p.amount)}</div>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold mt-1 ${si.cls}`}>
                      <Icon name={si.icon} size={10} />{si.label}
                    </span>
                  </div>
                </div>
                {(p.buyer_email || p.buyer_phone || p.owner_name) && (
                  <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2">
                    {p.owner_name && <span>{p.owner_name}</span>}
                    {p.buyer_phone && <span>{p.buyer_phone}</span>}
                    {p.buyer_email && <span>{p.buyer_email}</span>}
                  </div>
                )}
                {ri && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold mt-1 inline-block ${ri.cls}`}>{ri.label}</span>}
              </div>
            );
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-sm text-muted-foreground">Всего: {total}</span>
              <div className="flex gap-2 items-center">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <Icon name="ChevronLeft" size={15} />
                </Button>
                <span className="text-sm px-2">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <Icon name="ChevronRight" size={15} />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Десктопный вид */}
        <div className="hidden sm:block bg-white rounded-2xl border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Описание / Объект</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Покупатель</th>
                <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Финансы</th>
                <th className="text-left px-4 py-3 font-semibold hidden xl:table-cell">Срок сделки</th>
                <th className="text-center px-4 py-3 font-semibold">Статус</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Платежей пока нет</td></tr>
              ) : payments.map(p => {
                const si = STATUS_INFO[p.status] || { label: p.status, cls: 'bg-muted text-foreground', icon: 'Circle' };
                const ri = p.refund_status ? REFUND_INFO[p.refund_status] : null;
                return (
                  <tr key={p.id} onClick={() => setDetailPayment(p)}
                    className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer">
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="font-medium truncate">{p.description}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {typeLabel(p.payment_type)} · {fmtDate(p.created_at)}
                      </div>
                      {p.listing_title && (
                        <div className="text-xs text-brand-blue mt-0.5 flex items-center gap-1 truncate">
                          <Icon name="Building2" size={10} />{p.listing_title}
                        </div>
                      )}
                      {ri && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold mt-1 inline-block ${ri.cls}`}>{ri.label}</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-sm">
                      {p.buyer_email && <div className="text-muted-foreground text-xs">{p.buyer_email}</div>}
                      {p.buyer_phone && <div className="text-muted-foreground text-xs">{p.buyer_phone}</div>}
                      {p.owner_name && <div className="text-xs">{p.owner_name}</div>}
                      {!p.buyer_email && !p.buyer_phone && !p.owner_name && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-sm">
                      <div className="font-semibold text-brand-blue">{fmtMoney(p.amount)}</div>
                      {p.sale_price && <div className="text-xs text-muted-foreground">Цена: {fmtMoney(p.sale_price)}</div>}
                      {p.deposit_amount && <div className="text-xs text-muted-foreground">Задаток: {fmtMoney(p.deposit_amount)}</div>}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-sm">
                      {p.deal_date
                        ? <span className={`font-semibold ${new Date(p.deal_date) < new Date() && p.status !== 'succeeded' ? 'text-red-600' : 'text-foreground'}`}>
                            {fmtDateOnly(p.deal_date)}
                          </span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${si.cls}`}>
                        <Icon name={si.icon} size={11} />{si.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {p.yookassa_url && (
                          <button title="Скопировать ссылку" onClick={e => { e.stopPropagation(); copyLink(p.yookassa_url!); }}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Icon name="Copy" size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-sm text-muted-foreground">Всего: {total}</span>
              <div className="flex gap-2 items-center">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <Icon name="ChevronLeft" size={15} />
                </Button>
                <span className="text-sm px-2">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <Icon name="ChevronRight" size={15} />
                </Button>
              </div>
            </div>
          )}
        </div>
        </>
      )}

      {/* Создать платёж */}
      <PaymentCreateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        form={form}
        setForm={setForm}
        owners={owners as { id: number; name: string; phone: string }[]}
        deals={deals as { id: number; title: string }[]}
        listings={listings}
        createMutation={createMutation}
      />

      {/* Детальная карточка */}
      {detailPayment && (
        <PaymentDetailModal
          payment={detailPayment}
          listings={listings}
          onClose={() => {
            setDetailPayment(null);
            qc.invalidateQueries({ queryKey: ['crm-payments'] });
          }}
        />
      )}
    </div>
  );
}