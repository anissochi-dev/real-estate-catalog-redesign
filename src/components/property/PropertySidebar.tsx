import type { ListingDetail, Agent } from '@/lib/api';
import Icon from '@/components/ui/icon';
import { DEAL_LABELS } from './propertyLabels';

interface Props {
  item: ListingDetail;
  agents: Agent[];
  sent: boolean;
  sending: boolean;
  form: { name: string; phone: string; message: string };
  setForm: (f: { name: string; phone: string; message: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function PropertySidebar({ item, agents, sent, sending, form, setForm, onSubmit }: Props) {
  const agent = agents[0] || null;

  return (
    <div className="space-y-4 hidden lg:block">
      {/* Единый sticky блок: цена + агент */}
      <div className="sticky top-20 space-y-3">

        {/* Цена */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-3 pb-3">
            <div className="text-[10px] text-muted-foreground mb-0.5 font-medium uppercase tracking-wide">
              {DEAL_LABELS[item.deal] || item.deal}
            </div>
            <h5 className="font-display font-900 text-2xl text-brand-blue leading-none tracking-tight">
              {item.seoH5
                ? <><span className="sr-only">{item.seoH5} — </span>{item.price.toLocaleString('ru')} ₽{item.deal === 'rent' ? '/мес' : ''}</>
                : <>{item.price.toLocaleString('ru')} ₽{item.deal === 'rent' ? '/мес' : ''}</>
              }
            </h5>
            {item.pricePerM2 ? (
              <div className="flex items-center gap-1 mt-1.5">
                <Icon name="Scaling" size={11} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{item.pricePerM2.toLocaleString('ru')} ₽/м²</span>
              </div>
            ) : null}
          </div>
          {item.publicCode && (
            <div className="px-4 py-1.5 bg-muted/40 border-t border-border flex items-center gap-1.5">
              <Icon name="Hash" size={11} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">ID:</span>
              <span className="text-xs font-semibold text-foreground">{item.publicCode}</span>
            </div>
          )}

          {/* Представитель собственника */}
          {agent && (
            <div className="px-4 py-3 border-t border-border">
              <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-widest font-semibold">
                Представитель собственника
              </div>
              <div className="flex items-center gap-2.5">
                {agent.avatar ? (
                  <img src={agent.avatar} alt={agent.name} referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0 border-2 border-border" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                    <Icon name="User" size={16} className="text-brand-blue" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-display font-700 text-sm truncate">{agent.name}</div>
                  {agent.phone ? (
                    <a href={`tel:${agent.phone}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline mt-0.5">
                      <Icon name="Phone" size={11} />
                      {agent.phone}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground mt-0.5 block">Телефон не указан</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Форма заявки */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="font-display font-700 text-base mb-3 flex items-center gap-2">
            <Icon name="CalendarCheck" size={16} className="text-brand-blue" /> Заказать просмотр
          </div>
          {sent ? (
            <div className="py-3 text-center">
              <Icon name="CheckCircle2" size={32} className="mx-auto mb-2 text-emerald-500" />
              <div className="font-semibold text-sm">Заявка отправлена!</div>
              <div className="text-xs text-muted-foreground mt-1">Менеджер свяжется с вами в течение 15 минут.</div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-2">
              <input required placeholder="Ваше имя" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-lg text-sm" />
              <input required placeholder="Телефон" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-lg text-sm" />
              <textarea placeholder="Комментарий (необязательно)" rows={2}
                value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-lg text-sm" />
              <button type="submit" disabled={sending}
                className="w-full btn-blue text-white py-3 rounded-xl font-semibold disabled:opacity-50 text-sm">
                {sending ? 'Отправка...' : 'Заказать просмотр'}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
