import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { CRM_PAYMENTS_URL as PAYMENTS_URL } from '@/lib/adminApi';
import {
  Payment, PaymentHistoryEntry,
  STATUS_INFO, REFUND_INFO, PAYMENT_TYPES,
  fmtMoney, fmtDate, fmtDateOnly, typeLabel,
} from './paymentTypes';

interface Props {
  payment: Payment;
  onClose: () => void;
  listings: { id: number; title: string; address?: string }[];
}

type Tab = 'info' | 'history';

const FIELD_LABELS: Record<string, string> = {
  amount: 'Сумма платежа', description: 'Описание', payment_type: 'Тип платежа',
  buyer_email: 'Email покупателя', buyer_phone: 'Телефон покупателя',
  listing_id: 'Объект', sale_price: 'Цена продажи', deposit_amount: 'Задаток',
  conditions: 'Условия', contract_url: 'Договор', deal_date: 'Дата сделки',
  status: 'Статус', deal_id: 'Сделка', owner_id: 'Клиент',
};

export default function PaymentDetailModal({ payment: initial, onClose, listings }: Props) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('info');
  const [payment, setPayment] = useState<Payment>(initial);
  const [history, setHistory] = useState<PaymentHistoryEntry[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);

  const [form, setForm] = useState({
    description: initial.description || '',
    payment_type: initial.payment_type || 'service',
    buyer_email: initial.buyer_email || '',
    buyer_phone: initial.buyer_phone || '',
    listing_id: initial.listing_id ? String(initial.listing_id) : '',
    sale_price: initial.sale_price ? String(initial.sale_price) : '',
    deposit_amount: initial.deposit_amount ? String(initial.deposit_amount) : '',
    amount: String(initial.amount),
    conditions: initial.conditions || '',
    contract_url: initial.contract_url || '',
    deal_date: initial.deal_date || '',
  });

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };

  const loadHistory = async () => {
    const r = await fetch(`${PAYMENTS_URL}/${payment.id}?action=history`, { headers });
    const d = await r.json();
    setHistory(d.history || []);
  };

  const loadPayment = async () => {
    const r = await fetch(`${PAYMENTS_URL}/${payment.id}`, { headers });
    const d = await r.json();
    if (d.payment) setPayment(d.payment);
  };

  useEffect(() => {
    loadHistory();
  }, [payment.id]);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        description: form.description,
        payment_type: form.payment_type,
        buyer_email: form.buyer_email || null,
        buyer_phone: form.buyer_phone || null,
        listing_id: form.listing_id ? Number(form.listing_id) : null,
        sale_price: form.sale_price ? Number(form.sale_price) : null,
        deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : null,
        amount: Number(form.amount),
        conditions: form.conditions || null,
        contract_url: form.contract_url || null,
        deal_date: form.deal_date || null,
      };
      const r = await fetch(`${PAYMENTS_URL}/${payment.id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ошибка');
      toast.success('Сохранено');
      setEditing(false);
      await loadPayment();
      await loadHistory();
      qc.invalidateQueries({ queryKey: ['crm-payments'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const generateLink = async () => {
    setGeneratingLink(true);
    try {
      const r = await fetch(`${PAYMENTS_URL}/${payment.id}?action=generate_link`, {
        method: 'POST', headers, body: JSON.stringify({ return_url: window.location.origin + '/admin' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ошибка');
      navigator.clipboard?.writeText(d.payment_url);
      toast.success('Новая ссылка создана и скопирована');
      await loadPayment();
      await loadHistory();
      qc.invalidateQueries({ queryKey: ['crm-payments'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setGeneratingLink(false);
    }
  };

  const doRefund = async () => {
    setRefunding(true);
    try {
      const r = await fetch(`${PAYMENTS_URL}/${payment.id}?action=refund`, { method: 'POST', headers, body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ошибка');
      toast.success('Возврат инициирован');
      setConfirmRefund(false);
      await loadPayment();
      await loadHistory();
      qc.invalidateQueries({ queryKey: ['crm-payments'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setRefunding(false);
    }
  };

  const copyLink = () => {
    if (payment.yookassa_url) {
      navigator.clipboard?.writeText(payment.yookassa_url);
      toast.success('Ссылка скопирована');
    }
  };

  const si = STATUS_INFO[payment.status] || { label: payment.status, cls: 'bg-muted text-foreground', icon: 'Circle' };
  const ri = payment.refund_status ? REFUND_INFO[payment.refund_status] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="font-display font-700 text-base truncate">
              {payment.description || 'Платёж #' + payment.id}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${si.cls}`}>
                <Icon name={si.icon} size={11} />{si.label}
              </span>
              <span className="text-xs text-muted-foreground">{typeLabel(payment.payment_type)}</span>
              {ri && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${ri.cls}`}>{ri.label}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted shrink-0">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          {([['info', 'Детали', 'FileText'], ['history', 'История', 'Clock']] as [Tab, string, string][]).map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
                tab === id ? 'border-brand-blue text-brand-blue' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              <Icon name={icon} size={14} />{label}
              {id === 'history' && history.length > 0 && (
                <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5 py-0.5">{history.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── INFO TAB ─────────────────────────────────────────────────── */}
          {tab === 'info' && (
            <div className="p-5 space-y-5">

              {/* Объект */}
              {(payment.listing_title || editing) && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Icon name="Building2" size={13} />Объект недвижимости
                  </div>
                  {editing ? (
                    <div className="p-3">
                      <select
                        value={form.listing_id}
                        onChange={e => {
                          const lid = e.target.value;
                          const l = listings.find(x => String(x.id) === lid);
                          setForm(f => ({ ...f, listing_id: lid }));
                          if (l) toast.info(`Объект: ${l.title}`);
                        }}
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="">— Не привязывать —</option>
                        {listings.map(l => (
                          <option key={l.id} value={String(l.id)}>{l.title}{l.address ? ` · ${l.address}` : ''}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="px-4 py-3 flex items-center gap-3">
                      {payment.listing_image && (
                        <img src={payment.listing_image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                      )}
                      <div>
                        <div className="text-sm font-semibold">{payment.listing_title}</div>
                        {payment.listing_address && <div className="text-xs text-muted-foreground">{payment.listing_address}</div>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Финансы */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Цена продажи', key: 'sale_price', val: fmtMoney(payment.sale_price) },
                  { label: 'Задаток', key: 'deposit_amount', val: fmtMoney(payment.deposit_amount) },
                  { label: 'К оплате', key: 'amount', val: fmtMoney(payment.amount), bold: true },
                ].map(({ label, key, val, bold }) => (
                  <div key={key} className="rounded-xl border border-border p-3">
                    <div className="text-xs text-muted-foreground mb-1">{label}</div>
                    {editing ? (
                      <Input
                        type="number"
                        value={(form as Record<string, string>)[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    ) : (
                      <div className={`text-sm ${bold ? 'font-700 text-brand-blue' : 'font-semibold'}`}>{val}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Основные поля */}
              <div className="space-y-3">
                {editing ? (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Тип платежа</label>
                      <div className="grid grid-cols-2 gap-2">
                        {PAYMENT_TYPES.map(t => (
                          <button key={t.value} type="button"
                            onClick={() => setForm(f => ({ ...f, payment_type: t.value }))}
                            className={`px-3 py-1.5 rounded-xl border text-sm font-semibold transition text-left ${
                              form.payment_type === t.value ? 'border-brand-blue bg-brand-blue/5 text-brand-blue' : 'border-border hover:border-brand-blue/40'
                            }`}>{t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Описание</label>
                      <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1 block">Email покупателя</label>
                        <Input type="email" value={form.buyer_email} onChange={e => setForm(f => ({ ...f, buyer_email: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1 block">Телефон покупателя</label>
                        <Input type="tel" value={form.buyer_phone} onChange={e => setForm(f => ({ ...f, buyer_phone: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Условия сделки</label>
                      <textarea value={form.conditions} onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))}
                        rows={3} className="w-full border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-brand-blue" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1 block">Ссылка на договор</label>
                        <Input value={form.contract_url} onChange={e => setForm(f => ({ ...f, contract_url: e.target.value }))} placeholder="https://..." />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1 block">Срок выхода на сделку</label>
                        <Input type="date" value={form.deal_date} onChange={e => setForm(f => ({ ...f, deal_date: e.target.value }))} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {payment.buyer_email && <div><span className="text-muted-foreground text-xs block">Email покупателя</span>{payment.buyer_email}</div>}
                    {payment.buyer_phone && <div><span className="text-muted-foreground text-xs block">Телефон</span>{payment.buyer_phone}</div>}
                    {payment.deal_date && <div><span className="text-muted-foreground text-xs block">Срок выхода на сделку</span><span className="font-semibold text-brand-blue">{fmtDateOnly(payment.deal_date)}</span></div>}
                    {payment.owner_name && <div><span className="text-muted-foreground text-xs block">Клиент</span>{payment.owner_name}</div>}
                    {payment.deal_title && <div><span className="text-muted-foreground text-xs block">Сделка</span>{payment.deal_title}</div>}
                    <div><span className="text-muted-foreground text-xs block">Создан</span>{fmtDate(payment.created_at)}</div>
                    {payment.creator && <div><span className="text-muted-foreground text-xs block">Создал</span>{payment.creator}</div>}
                  </div>
                )}
              </div>

              {/* Условия */}
              {!editing && payment.conditions && (
                <div className="rounded-xl border border-border p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1.5">
                    <Icon name="ScrollText" size={12} />Условия сделки
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{payment.conditions}</div>
                </div>
              )}

              {/* Договор */}
              {!editing && payment.contract_url && (
                <div className="rounded-xl border border-border p-3 flex items-center gap-3">
                  <Icon name="FileText" size={18} className="text-brand-blue shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-muted-foreground mb-0.5">Договор</div>
                    <a href={payment.contract_url} target="_blank" rel="noreferrer"
                      className="text-sm text-brand-blue underline truncate block">{payment.contract_url}</a>
                  </div>
                  <a href={payment.contract_url} target="_blank" rel="noreferrer"
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground shrink-0">
                    <Icon name="ExternalLink" size={14} />
                  </a>
                </div>
              )}

              {/* Ссылка ЮКасса */}
              {payment.yookassa_url && (
                <div className="rounded-xl border border-border p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Icon name="CreditCard" size={12} />Ссылка на оплату
                  </div>
                  <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs font-mono break-all">{payment.yookassa_url}</div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-brand-blue text-white" onClick={copyLink}>
                      <Icon name="Copy" size={13} className="mr-1.5" />Скопировать
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => window.open(payment.yookassa_url, '_blank')}>
                      <Icon name="ExternalLink" size={13} className="mr-1.5" />Открыть
                    </Button>
                  </div>
                </div>
              )}

              {/* Кнопки действий */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                {editing ? (
                  <>
                    <Button className="bg-brand-blue text-white" onClick={save} disabled={saving}>
                      {saving ? <><Icon name="Loader2" size={14} className="animate-spin mr-1.5" />Сохранение...</> : 'Сохранить'}
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(false)}>Отмена</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      <Icon name="Pencil" size={14} className="mr-1.5" />Редактировать
                    </Button>
                    <Button variant="outline" onClick={generateLink} disabled={generatingLink}>
                      {generatingLink
                        ? <><Icon name="Loader2" size={14} className="animate-spin mr-1.5" />Генерация...</>
                        : <><Icon name="RefreshCw" size={14} className="mr-1.5" />Новая ссылка ЮКасса</>
                      }
                    </Button>
                    {payment.status === 'succeeded' && !payment.refund_status && (
                      <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => setConfirmRefund(true)}>
                        <Icon name="Undo2" size={14} className="mr-1.5" />Возврат
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Подтверждение возврата */}
              {confirmRefund && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-red-800 font-semibold text-sm">
                    <Icon name="AlertTriangle" size={16} />Подтвердите возврат
                  </div>
                  <div className="text-sm text-red-700">
                    Вернуть <strong>{fmtMoney(payment.amount)}</strong> покупателю? Это действие нельзя отменить.
                  </div>
                  <div className="flex gap-2">
                    <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={doRefund} disabled={refunding}>
                      {refunding ? 'Выполняется...' : 'Подтвердить возврат'}
                    </Button>
                    <Button variant="outline" onClick={() => setConfirmRefund(false)}>Отмена</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY TAB ──────────────────────────────────────────────── */}
          {tab === 'history' && (
            <div className="p-5">
              {history.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">История изменений пуста</div>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="rounded-xl border border-border bg-white p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-brand-blue">
                          {FIELD_LABELS[h.field_name] || h.field_label || h.field_name}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {fmtDate(h.changed_at)}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-0.5">Было</div>
                          <div className="px-2 py-1 rounded bg-red-50 text-red-800 line-through opacity-80 break-words min-h-[24px]">
                            {h.old_value || '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-0.5">Стало</div>
                          <div className="px-2 py-1 rounded bg-emerald-50 text-emerald-800 break-words min-h-[24px]">
                            {h.new_value || '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
