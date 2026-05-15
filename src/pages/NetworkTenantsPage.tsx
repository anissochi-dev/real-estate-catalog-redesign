import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';

const LISTINGS_URL = 'https://functions.poehali.dev/590f7088-530b-4bfb-994e-1047674672fa';
const LEADS_URL = 'https://functions.poehali.dev/45673fe4-a39d-4193-b529-174d4c8c8f97';

interface T {
  id: number;
  name: string;
  company: string | null;
  message: string | null;
  budget: number | null;
  phone: string;
  email: string | null;
  request_category: string | null;
}

export default function NetworkTenantsPage() {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState<T | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch(`${LISTINGS_URL}?resource=network_tenants`)
      .then(r => r.json())
      .then(d => setItems(d.tenants || []))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offer) return;
    await fetch(LEADS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name, phone: form.phone,
        message: `Предложение сетевому арендатору "${offer.company || offer.name}" (заявка #${offer.id}). ${form.message}`,
        source: 'network-tenant-offer',
      }),
    });
    setSent(true);
    setTimeout(() => {
      setOffer(null);
      setSent(false);
      setForm({ name: '', phone: '', message: '' });
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background">
      <section className="bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white py-14">
        <div className="container mx-auto px-4">
          <h1 className="font-display font-900 text-3xl md:text-5xl mb-3">Сетевые арендаторы</h1>
          <p className="text-white/80 max-w-2xl">
            Федеральные и региональные сети, готовые арендовать ваши помещения.
            Подходящий объект — отправьте предложение в один клик.
          </p>
        </div>
      </section>

      <section className="py-10 container mx-auto px-4">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Пока нет активных запросов от сетей.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(t => (
              <div key={t.id} className="bg-white rounded-2xl p-5 shadow-sm border border-border flex flex-col">
                <div className="flex items-center justify-between mb-3 gap-3">
                  <div className="font-display font-700 text-lg truncate">{t.name}</div>
                  {t.budget && (
                    <span className="text-xs font-semibold bg-brand-blue/10 text-brand-blue px-2 py-1 rounded-lg whitespace-nowrap">
                      до {t.budget.toLocaleString('ru')} ₽
                    </span>
                  )}
                </div>
                {t.request_category && (
                  <div className="inline-flex self-start items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-100 text-purple-700 text-xs font-semibold mb-3">
                    <Icon name="Tag" size={12} />
                    {t.request_category}
                  </div>
                )}
                <div className="text-sm flex-1 mb-4 whitespace-pre-wrap line-clamp-5 text-foreground/80">
                  {t.message || 'Запрос на коммерческое помещение.'}
                </div>
                <button onClick={() => setOffer(t)}
                  className="btn-orange text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2">
                  <Icon name="HandHeart" size={16} />
                  Предложить помещение
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {offer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="font-display font-700 text-lg">Предложить объект</div>
              <button onClick={() => setOffer(null)}><Icon name="X" size={20} /></button>
            </div>
            {sent ? (
              <div className="py-8 text-center">
                <Icon name="CheckCircle2" size={48} className="mx-auto mb-3 text-emerald-500" />
                <div className="font-semibold">Заявка отправлена!</div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <input required placeholder="Ваше имя" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" />
                <input required placeholder="Телефон" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" />
                <textarea placeholder="Описание объекта" rows={3}
                  value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" />
                <button type="submit"
                  className="w-full btn-blue text-white py-3 rounded-xl font-semibold">
                  Отправить
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}