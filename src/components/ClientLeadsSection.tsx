import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';

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

export default function ClientLeadsSection() {
  const [leads, setLeads] = useState<PubLead[]>([]);
  const [offerLead, setOfferLead] = useState<PubLead | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch(`${LISTINGS_URL}?resource=public_leads`)
      .then(r => r.json())
      .then(d => setLeads(d.leads || []))
      .catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerLead) return;
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
      }, 1500);
    } finally {
      setSending(false);
    }
  };

  if (!leads.length) return null;

  return (
    <section className="py-12 bg-white">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-8">
          <p className="text-sm text-muted-foreground max-w-xl">
            Есть подходящий объект? Предложите его клиенту — заявка попадёт нашему менеджеру.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leads.map(l => (
            <div key={l.id} className="bg-muted/30 rounded-2xl p-5 border border-border hover:shadow-md transition flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center font-semibold">
                    {l.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="font-semibold">{l.name}</div>
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
                <button type="submit" disabled={sending}
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