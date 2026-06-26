import Icon from '@/components/ui/icon';
import SmartCaptcha, { CaptchaResult } from '@/components/SmartCaptcha';
import PublicPhoneInput from '@/components/PublicPhoneInput';
import { PublicLead } from '@/lib/api';

interface ContactForm {
  name: string;
  phone: string;
  message: string;
}

interface LeadContactModalProps {
  lead: PublicLead;
  form: ContactForm;
  sending: boolean;
  sent: boolean;
  captchaKey: number;
  onFormChange: (form: ContactForm) => void;
  onCaptcha: (result: CaptchaResult | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export default function LeadContactModal({
  lead, form, sending, sent, captchaKey,
  onFormChange, onCaptcha, onSubmit, onClose,
}: LeadContactModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-5 border-b border-border flex items-start justify-between gap-2">
          <div>
            <div className="font-display font-700 text-lg">Связаться по заявке</div>
            <div className="text-xs text-muted-foreground mt-0.5">Менеджер свяжется с вами в ближайшее время</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <Icon name="X" size={18} />
          </button>
        </div>
        {sent ? (
          <div className="p-6 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-emerald-100 flex items-center justify-center">
              <Icon name="CheckCircle2" size={28} className="text-emerald-600" />
            </div>
            <div className="font-display font-700 text-lg mb-1">Заявка отправлена</div>
            <div className="text-sm text-muted-foreground mb-4">Мы свяжемся с вами в ближайшее время.</div>
            <button onClick={onClose} className="btn-blue text-white px-5 py-2 rounded-xl font-semibold text-sm">
              Закрыть
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="p-4 sm:p-5 space-y-3">
            <div className="bg-muted/40 rounded-xl p-3 text-xs">
              <div className="font-semibold mb-1">Заявка #{lead.id}</div>
              <div className="text-muted-foreground whitespace-pre-wrap break-words">
                {(lead.message || '').slice(0, 200)}{(lead.message || '').length > 200 ? '…' : ''}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Ваше имя *</label>
              <input
                required
                value={form.name}
                onChange={e => onFormChange({ ...form, name: e.target.value })}
                placeholder="Иван"
                className="w-full px-3 py-2 border rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Телефон *</label>
              <PublicPhoneInput
                value={form.phone}
                onChange={phone => onFormChange({ ...form, phone })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Комментарий</label>
              <textarea
                rows={3}
                value={form.message}
                onChange={e => onFormChange({ ...form, message: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
              />
            </div>
            <SmartCaptcha key={captchaKey} onResult={onCaptcha} />
            <button
              type="submit"
              disabled={sending || !form.name || !form.phone}
              className="w-full btn-blue text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {sending ? <><Icon name="Loader2" size={14} className="animate-spin" /> Отправляю…</> : 'Отправить заявку'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
