import { useState } from 'react';
import Icon from '@/components/ui/icon';
import SmartCaptcha, { CaptchaResult } from '@/components/SmartCaptcha';
import PublicPhoneInput from '@/components/PublicPhoneInput';
import { sendLead, PublicPartner } from '@/lib/api';

interface Props {
  partner: PublicPartner;
  onClose: () => void;
}

export default function PartnerLeadModal({ partner, onClose }: Props) {
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [captcha, setCaptcha] = useState<CaptchaResult | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captcha?.passed) return;
    setSending(true);
    setError('');
    try {
      const res = await sendLead({
        name: form.name,
        phone: form.phone,
        message: form.message,
        source: 'partner-carousel',
        partner_id: partner.id,
        captcha_token: captcha.token,
      });
      if (res.success) {
        setSent(true);
      } else {
        setError(res.error || 'Не удалось отправить заявку');
        setCaptchaKey(k => k + 1);
        setCaptcha(null);
      }
    } catch {
      setError('Не удалось отправить заявку. Попробуйте ещё раз.');
      setCaptchaKey(k => k + 1);
      setCaptcha(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-5 border-b border-border flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {partner.logo_url && (
              <div className="w-12 h-9 rounded-lg bg-white border border-border flex items-center justify-center shrink-0 overflow-hidden">
                <img src={partner.logo_url} alt={partner.name} className="max-w-full max-h-full object-contain" />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-display font-700 text-lg truncate">{partner.name}</div>
              <div className="text-xs text-muted-foreground">Оставьте заявку, мы вас свяжем</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded shrink-0">
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
          <form onSubmit={submit} className="p-4 sm:p-5 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Ваше имя *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Иван"
                className="w-full px-3 py-2 border rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Телефон *</label>
              <PublicPhoneInput
                required
                value={form.phone}
                onChange={phone => setForm({ ...form, phone })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Комментарий</label>
              <textarea
                rows={3}
                value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
              />
            </div>
            <SmartCaptcha key={captchaKey} fieldCount={3} onVerify={setCaptcha} />
            {error && <div className="text-xs text-red-600">{error}</div>}
            <button
              type="submit"
              disabled={sending || !form.name || !form.phone || !captcha?.passed}
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
