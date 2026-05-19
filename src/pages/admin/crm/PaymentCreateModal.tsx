import { UseMutationResult } from '@tanstack/react-query';
import Icon from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PAYMENT_TYPES, CreateForm, EMPTY_FORM } from './paymentTypes';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: CreateForm;
  setForm: React.Dispatch<React.SetStateAction<CreateForm>>;
  owners: { id: number; name: string; phone: string }[];
  deals: { id: number; title: string }[];
  listings: { id: number; title: string; address?: string; price?: number }[];
  createMutation: UseMutationResult<unknown, Error, CreateForm>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground mb-1 block">{label}</label>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

export default function PaymentCreateModal({ open, onOpenChange, form, setForm, owners, deals, listings, createMutation }: Props) {
  const f = form;
  const set = (patch: Partial<CreateForm>) => setForm(prev => ({ ...prev, ...patch }));

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setForm(EMPTY_FORM); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новый платёж</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">

          {/* Тип платежа */}
          <Field label="Тип платежа">
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set({ payment_type: t.value, description: f.description || t.label })}
                  className={`px-3 py-2 rounded-xl border text-sm font-semibold transition text-left ${
                    f.payment_type === t.value
                      ? 'border-brand-blue bg-brand-blue/5 text-brand-blue'
                      : 'border-border hover:border-brand-blue/40'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Объект */}
          <Field label="Объект недвижимости">
            <select
              value={f.listing_id}
              onChange={e => {
                const lid = e.target.value;
                const listing = listings.find(l => String(l.id) === lid);
                set({ listing_id: lid, sale_price: listing?.price ? String(listing.price) : f.sale_price });
              }}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">— Не привязывать —</option>
              {listings.map(l => (
                <option key={l.id} value={String(l.id)}>
                  {l.title}{l.address ? ` · ${l.address}` : ''}
                </option>
              ))}
            </select>
          </Field>

          {/* Финансы */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Цена продажи (₽)" hint="Полная стоимость объекта">
              <Input
                type="number"
                value={f.sale_price}
                onChange={e => set({ sale_price: e.target.value })}
                placeholder="5 000 000"
              />
            </Field>
            <Field label="Задаток (₽)" hint="Сумма задатка по соглашению">
              <Input
                type="number"
                value={f.deposit_amount}
                onChange={e => set({ deposit_amount: e.target.value })}
                placeholder="200 000"
              />
            </Field>
          </div>

          {/* Сумма платежа */}
          <Field label="Сумма к оплате через ЮКассу (₽) *">
            <Input
              type="number"
              value={f.amount}
              onChange={e => set({ amount: e.target.value })}
              placeholder="75 000"
            />
          </Field>

          {/* Описание */}
          <Field label="Описание">
            <Input
              value={f.description}
              onChange={e => set({ description: e.target.value })}
              placeholder="Брокерское вознаграждение по сделке..."
            />
          </Field>

          {/* Условия сделки */}
          <Field label="Условия сделки">
            <textarea
              value={f.conditions}
              onChange={e => set({ conditions: e.target.value })}
              rows={3}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-brand-blue"
              placeholder="Задаток возвращается при отказе продавца. Срок действия — 30 дней..."
            />
          </Field>

          {/* Договор и дата сделки */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ссылка на договор">
              <Input
                value={f.contract_url}
                onChange={e => set({ contract_url: e.target.value })}
                placeholder="https://drive.google.com/..."
              />
            </Field>
            <Field label="Срок выхода на сделку">
              <Input
                type="date"
                value={f.deal_date}
                onChange={e => set({ deal_date: e.target.value })}
              />
            </Field>
          </div>

          {/* Покупатель */}
          <div className="pt-1 border-t border-border">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Покупатель</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email">
                <Input
                  type="email"
                  value={f.buyer_email}
                  onChange={e => set({ buyer_email: e.target.value })}
                  placeholder="buyer@mail.ru"
                />
              </Field>
              <Field label="Телефон">
                <Input
                  type="tel"
                  value={f.buyer_phone}
                  onChange={e => set({ buyer_phone: e.target.value })}
                  placeholder="+79001234567"
                />
              </Field>
            </div>
          </div>

          {/* Привязка к клиенту и сделке */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Клиент (CRM)">
              <select
                value={f.owner_id}
                onChange={e => set({ owner_id: e.target.value })}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">— Не привязывать —</option>
                {owners.map(o => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="Сделка (CRM)">
              <select
                value={f.deal_id}
                onChange={e => set({ deal_id: e.target.value })}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">— Не привязывать —</option>
                {deals.map(d => <option key={d.id} value={String(d.id)}>{d.title}</option>)}
              </select>
            </Field>
          </div>

          {/* URL возврата */}
          <Field label="URL после оплаты">
            <Input
              value={f.return_url}
              onChange={e => set({ return_url: e.target.value })}
            />
          </Field>

          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1 bg-brand-blue text-white"
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !f.amount}
            >
              {createMutation.isPending
                ? <><Icon name="Loader2" size={15} className="animate-spin mr-2" />Создание...</>
                : <><Icon name="Link" size={15} className="mr-2" />Создать ссылку</>
              }
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
