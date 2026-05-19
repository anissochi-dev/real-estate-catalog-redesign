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
  createMutation: UseMutationResult<unknown, Error, CreateForm>;
}

export default function PaymentCreateModal({
  open, onOpenChange, form, setForm, owners, deals, createMutation,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setForm(EMPTY_FORM); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новый платёж</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {/* Тип */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Тип платежа</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    setForm(f => ({
                      ...f,
                      payment_type: t.value,
                      description: f.description || t.label,
                    }));
                  }}
                  className={`px-3 py-2 rounded-xl border text-sm font-semibold transition text-left ${
                    form.payment_type === t.value
                      ? 'border-brand-blue bg-brand-blue/5 text-brand-blue'
                      : 'border-border hover:border-brand-blue/40'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Сумма */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Сумма (₽) *</label>
            <Input
              type="number"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="75 000"
            />
          </div>

          {/* Описание */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Описание</label>
            <Input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Брокерское вознаграждение по сделке..."
            />
          </div>

          {/* Покупатель */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Email покупателя</label>
              <Input
                type="email"
                value={form.buyer_email}
                onChange={e => setForm(f => ({ ...f, buyer_email: e.target.value }))}
                placeholder="buyer@mail.ru"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Телефон покупателя</label>
              <Input
                type="tel"
                value={form.buyer_phone}
                onChange={e => setForm(f => ({ ...f, buyer_phone: e.target.value }))}
                placeholder="+79001234567"
              />
            </div>
          </div>

          {/* Привязка */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Клиент (необязательно)</label>
              <select
                value={form.owner_id}
                onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">— Не привязывать —</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Сделка (необязательно)</label>
              <select
                value={form.deal_id}
                onChange={e => setForm(f => ({ ...f, deal_id: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">— Не привязывать —</option>
                {deals.map(d => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* URL возврата */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">URL после оплаты</label>
            <Input
              value={form.return_url}
              onChange={e => setForm(f => ({ ...f, return_url: e.target.value }))}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1 bg-brand-blue text-white"
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.amount}
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
