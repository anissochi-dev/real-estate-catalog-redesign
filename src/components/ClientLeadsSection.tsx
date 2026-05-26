import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import SmartCaptcha, { CaptchaResult } from '@/components/SmartCaptcha';

const LISTINGS_URL = 'https://functions.poehali.dev/590f7088-530b-4bfb-994e-1047674672fa';
const LEADS_URL = 'https://functions.poehali.dev/45673fe4-a39d-4193-b529-174d4c8c8f97';

interface PubLead {
  id: number;
  name: string;
  message: string | null;
  budget: number | null;
  company: string | null;
  created_at: string;
}

interface Props {
  limit?: number;
}

export default function ClientLeadsSection({ limit = 6 }: Props) {
  const [leads, setLeads] = useState<PubLead[]>([]);
  const [offerLead, setOfferLead] = useState<PubLead | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaResult | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    fetch(`${LISTINGS_URL}?resource=public_leads&limit=${limit}`)
      .then(r => r.json())
      .then(d => setLeads(d.leads || []))
      .catch(() => undefined);
  }, [limit]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerLead || !captcha?.passed) return;
    setSending(true);
    try {
      await fetch(LEADS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          message: `Предложение объекта по заявке #${offerLead.id} от "${offerLead.name}". ${form.message}`,
          source: 'offer-to-lead',
        }),
      });
      setSent(true);
      setTimeout(() => {
        setOfferLead(null);
        setSent(false);
        setForm({ name: '', phone: '', message: '' });
        setCaptcha(null);
        setCaptchaKey(k => k + 1);
      }, 1500);
    } finally {
      setSending(false);
    }
  };

  if (!leads.length) return null;

  return (
    <section className="py-6 bg-white">
      <div className="container mx-auto px-4">
        {/* Шапка секции: подзаголовок + ссылка «Все заявки».
            На мобиле — две строки, ссылка отдельной кнопкой во всю ширину.
            На sm+ — в одну строку справа. */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display font-700 text-base text-foreground flex items-center gap-2 mb-1">
              <Icon name="Users" size={16} className="text-brand-blue" />
              Готовый бизнес в Краснодаре — актуальные предложения
            </h2>
            <p className="text-xs text-muted-foreground max-w-xl">
              Есть подходящий объект? Предложите его клиенту — заявка попадёт нашему менеджеру.
            </p>
          </div>
          <Link
            to="/leads"
            aria-label="Смотреть все заявки клиентов"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 sm:justify-start px-4 py-2.5 sm:px-0 sm:py-0 rounded-xl sm:rounded-none border border-brand-blue/30 sm:border-0 bg-brand-blue/5 sm:bg-transparent text-brand-blue font-semibold text-sm sm:hover:gap-3 transition-all duration-200 shrink-0"
          >
            Смотреть все заявки <Icon name="ArrowRight" size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leads.slice(0, 6).map(l => (
            <div key={l.id} className="bg-muted/30 rounded-2xl p-5 border border-border hover:shadow-md transition flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center font-semibold">
                    {l.name.charAt(0).toUpperCase()}
                  </div>
                  <h3 className="font-semibold text-base">{l.name}</h3>
                </div>
                {l.budget && (
                  <span className="text-xs font-semibold bg-brand-blue/10 text-brand-blue px-2 py-1 rounded-lg">
                    {l.budget.toLocaleString('ru')} ₽
                  </span>
                )}
              </div>
              <div className="text-sm text-foreground flex-1 mb-4 line-clamp-4 whitespace-pre-wrap">
                {l.message || 'Без подробностей. Свяжитесь, чтобы уточнить.'}
              </div>
              <button onClick={() => setOfferLead(l)}
                className="btn-orange text-white px-4 py-2 rounded-xl text-sm font-semibold font-display inline-flex items-center justify-center gap-2">
                <Icon name="HandHeart" size={16} />
                Предложить свой объект
              </button>
            </div>
          ))}
        </div>
      </div>

      {offerLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="font-display font-700 text-lg">Предложить объект</div>
              <button onClick={() => setOfferLead(null)}><Icon name="X" size={20} /></button>
            </div>
            {sent ? (
              <div className="py-8 text-center">
                <Icon name="CheckCircle2" size={48} className="mx-auto mb-3 text-emerald-500" />
                <div className="font-semibold">Спасибо!</div>
                <div className="text-sm text-muted-foreground mt-1">Менеджер свяжется с вами.</div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="p-3 bg-muted/40 rounded-lg text-sm">
                  <div className="font-semibold">{offerLead.name}</div>
                  <div className="text-muted-foreground text-xs mt-1 line-clamp-2">{offerLead.message}</div>
                </div>
                <input required placeholder="Ваше имя" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" />
                <input required placeholder="Телефон" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" />
                <textarea placeholder="Описание вашего объекта (адрес, площадь, цена)" rows={3}
                  value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" />
                <SmartCaptcha key={captchaKey} fieldCount={3} onVerify={setCaptcha} />
                <button type="submit" disabled={sending || !captcha?.passed}
                  className="w-full btn-blue text-white py-3 rounded-xl font-semibold disabled:opacity-50">
                  {sending ? 'Отправка...' : 'Отправить предложение'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}