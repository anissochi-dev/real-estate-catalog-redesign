import { useState } from 'react';
import type { ListingDetail, Agent } from '@/lib/api';
import Icon from '@/components/ui/icon';
import { DEAL_LABELS } from './propertyLabels';
import { formatPhone } from '@/lib/phone';
import PublicPhoneInput from '@/components/PublicPhoneInput';
import { fmtListingId } from '@/lib/formatPrice';
import SmartCaptcha, { CaptchaResult } from '@/components/SmartCaptcha';
import AIChatWidget from './AIChatWidget';

interface Props {
  item: ListingDetail;
  agents: Agent[];
  sent: boolean;
  sending: boolean;
  form: { name: string; phone: string; message: string };
  setForm: (f: { name: string; phone: string; message: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
  captcha: CaptchaResult | null;
  setCaptcha: (v: CaptchaResult | null) => void;
  captchaKey: number;
}

export default function PropertySidebar({ item, agents, sent, sending, form, setForm, onSubmit, captcha, setCaptcha, captchaKey }: Props) {
  const agent = agents[0] || null;
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <>
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
          <div className="px-4 py-1.5 bg-muted/40 border-t border-border flex items-center gap-1.5">
            <Icon name="Hash" size={11} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">ID:</span>
            <span className="text-xs font-mono font-semibold text-foreground">#{fmtListingId(item.id)}</span>
          </div>

          {/* Представитель собственника */}
          {agent && agent.phone && (
            <div className="px-4 py-3 border-t border-border">
              <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-widest font-semibold">
                Представитель собственника
              </div>
              <div className="flex items-center gap-2">
                <a href={`tel:${agent.phone}`}
                  className="inline-flex items-center gap-2 text-lg font-bold text-[#25a244] hover:underline flex-1 min-w-0">
                  <Icon name="Phone" size={18} className="flex-shrink-0" />
                  <span className="truncate">{formatPhone(agent.phone)}</span>
                </a>
                <button
                  onClick={() => setChatOpen(true)}
                  className="flex-shrink-0 inline-flex items-center gap-2 text-lg font-bold text-[#25a244] hover:underline"
                >
                  <Icon name="MessageCircle" size={18} className="flex-shrink-0" />
                  Написать
                </button>
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
              <PublicPhoneInput required value={form.phone}
                onChange={v => setForm({ ...form, phone: v })}
                className="w-full px-3 py-2.5 border rounded-lg text-sm" />
              <textarea placeholder="Комментарий (необязательно)" rows={2}
                value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-lg text-sm" />
              <SmartCaptcha key={captchaKey} fieldCount={3} onVerify={setCaptcha} />
              <button type="submit" disabled={sending || !captcha?.passed}
                className="w-full btn-blue text-white py-3 rounded-xl font-semibold disabled:opacity-50 text-sm">
                {sending ? 'Отправка...' : 'Заказать просмотр'}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>

    {chatOpen && (
      <AIChatWidget
        listingId={item.id}
        listingTitle={item.title}
        onClose={() => setChatOpen(false)}
      />
    )}
    </>
  );
}