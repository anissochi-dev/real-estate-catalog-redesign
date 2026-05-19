export const PAYMENT_TYPES: { value: string; label: string }[] = [
  { value: 'service', label: 'Брокерское вознаграждение' },
  { value: 'deposit', label: 'Задаток' },
  { value: 'prepayment', label: 'Предоплата' },
  { value: 'other', label: 'Другое' },
];

export const STATUS_INFO: Record<string, { label: string; cls: string; icon: string }> = {
  pending:             { label: 'Ожидает',  cls: 'bg-amber-100 text-amber-700',  icon: 'Clock' },
  succeeded:           { label: 'Оплачено', cls: 'bg-green-100 text-green-700',  icon: 'CheckCircle2' },
  canceled:            { label: 'Отменён',  cls: 'bg-red-100 text-red-700',      icon: 'XCircle' },
  waiting_for_capture: { label: 'Удержан',  cls: 'bg-blue-100 text-blue-700',    icon: 'Pause' },
};

export const REFUND_INFO: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Возврат: в обработке', cls: 'bg-amber-50 text-amber-600' },
  succeeded: { label: 'Возврат выполнен',     cls: 'bg-teal-50 text-teal-700' },
  canceled:  { label: 'Возврат отклонён',     cls: 'bg-red-50 text-red-600' },
};

export interface Payment {
  id: number;
  deal_id?: number;
  deal_title?: string;
  owner_id?: number;
  owner_name?: string;
  listing_id?: number;
  listing_title?: string;
  listing_address?: string;
  listing_price?: number;
  listing_image?: string;
  amount: number;
  description?: string;
  payment_type?: string;
  buyer_email?: string;
  buyer_phone?: string;
  sale_price?: number;
  deposit_amount?: number;
  conditions?: string;
  contract_url?: string;
  deal_date?: string;
  yookassa_payment_id?: string;
  yookassa_url?: string;
  status: string;
  refund_status?: string;
  created_at: string;
  updated_at?: string;
  creator?: string;
}

export interface PaymentHistoryEntry {
  id: number;
  payment_id: number;
  changed_by: number | null;
  changed_by_name: string | null;
  changed_at: string;
  field_name: string;
  field_label: string;
  old_value: string | null;
  new_value: string | null;
}

export interface CreateForm {
  amount: string;
  description: string;
  payment_type: string;
  buyer_email: string;
  buyer_phone: string;
  deal_id: string;
  owner_id: string;
  listing_id: string;
  sale_price: string;
  deposit_amount: string;
  conditions: string;
  contract_url: string;
  deal_date: string;
  return_url: string;
}

export const EMPTY_FORM: CreateForm = {
  amount: '',
  description: '',
  payment_type: 'service',
  buyer_email: '',
  buyer_phone: '',
  deal_id: '',
  owner_id: '',
  listing_id: '',
  sale_price: '',
  deposit_amount: '',
  conditions: '',
  contract_url: '',
  deal_date: '',
  return_url: typeof window !== 'undefined' ? window.location.origin + '/admin' : '',
};

export const typeLabel = (t?: string) =>
  PAYMENT_TYPES.find(x => x.value === t)?.label || t || '—';

export const fmtMoney = (n?: number | null) =>
  n != null ? Number(n).toLocaleString('ru') + ' ₽' : '—';

export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtDateOnly = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
