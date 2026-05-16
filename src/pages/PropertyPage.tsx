import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchListingById, ListingDetail, sendLead } from '@/lib/api';
import { extractIdFromSlug } from '@/lib/slug';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { formatPrice } from '@/components/PropertyCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import YandexMap from '@/components/YandexMap';
import PropertyCalculators from '@/components/calculators/PropertyCalculators';

const TYPE_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Торговля', warehouse: 'Склад',
  restaurant: 'Общественное питание', business: 'Бизнес', production: 'Производство',
  hotel: 'Отель', gab: 'ГАБ',
};
const DEAL_LABELS: Record<string, string> = {
  sale: 'Продажа', rent: 'Аренда', business: 'Готовый бизнес',
};

interface Props {
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  favorites: number[];
  compareList: number[];
}

export default function PropertyPage({ onToggleFavorite, onToggleCompare, favorites, compareList }: Props) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [item, setItem] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const id = extractIdFromSlug(slug || '');
    if (!id) { setLoading(false); return; }
    setLoading(true);
    fetchListingById(id).then(d => setItem(d)).finally(() => setLoading(false));
  }, [slug]);

  // SEO meta + canonical + Open Graph
  useEffect(() => {
    if (!item) return;
    const title = item.seoTitle || `${item.title} — ${item.city || 'Краснодар'} | ${settings.company_name || 'BIZNEST'}`;
    document.title = title;
    const desc = item.seoDescription || (item.description || '').slice(0, 160);

    const setMeta = (selector: string, create: () => HTMLMetaElement, content: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = create();
        document.head.appendChild(el);
      }
      el.content = content;
    };

    setMeta('meta[name="description"]', () => {
      const m = document.createElement('meta');
      m.name = 'description';
      return m;
    }, desc);

    setMeta('meta[property="og:title"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('property', 'og:title');
      return m;
    }, title);

    setMeta('meta[property="og:description"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('property', 'og:description');
      return m;
    }, desc);

    setMeta('meta[property="og:type"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('property', 'og:type');
      return m;
    }, 'product');

    const mainImage = (item.images && item.images[0]) || item.image;
    if (mainImage) {
      setMeta('meta[property="og:image"]', () => {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:image');
        return m;
      }, mainImage);
    }

    // canonical
    let canon = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canon) {
      canon = document.createElement('link');
      canon.rel = 'canonical';
      document.head.appendChild(canon);
    }
    canon.href = window.location.origin + window.location.pathname;
  }, [item, settings.company_name]);

  if (loading) {
    return <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Загрузка объекта...</div>;
  }
  if (!item) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <div className="font-display font-700 text-xl mb-2">Объект не найден</div>
        <button onClick={() => navigate('/catalog')} className="btn-blue text-white px-4 py-2 rounded-xl text-sm">К каталогу</button>
      </div>
    );
  }

  const imgs = item.images && item.images.length ? item.images : [item.image].filter(Boolean);
  const mainImg = imgs[activeImg] || imgs[0];
  const isFav = favorites.includes(item.id);
  const inCompare = compareList.includes(item.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await sendLead({
        name: form.name, phone: form.phone, message: form.message,
        listing_id: item.id, source: 'property-page',
      });
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  const dealLabel = DEAL_LABELS[item.deal] || item.deal;
  const typeLabel = TYPE_LABELS[item.type] || item.type;
  const productLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.title,
    description: (item.description || '').slice(0, 5000),
    image: imgs,
    category: typeLabel,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'RUB',
      price: item.price,
      availability: 'https://schema.org/InStock',
      url: typeof window !== 'undefined' ? window.location.href : '',
      seller: {
        '@type': 'Organization',
        name: settings.company_name || 'BIZNEST',
      },
    },
  };

  return (
    <div className="bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Breadcrumbs items={[
            { label: 'Главная', to: '/' },
            { label: 'Каталог', to: '/catalog' },
            { label: `${typeLabel} · ${dealLabel}`, to: `/catalog?type=${item.type}&deal=${item.deal}` },
            { label: item.title },
          ]} />
          <button onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">
            <Icon name="ArrowLeft" size={14} /> Назад
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Левая часть: фото + описание */}
          <div className="lg:col-span-2 space-y-5">
            {mainImg ? (
              <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[16/10]">
                <img src={mainImg} alt={item.title} className="w-full h-full object-cover" />
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-brand-blue text-white">
                    {DEAL_LABELS[item.deal] || item.deal}
                  </span>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-black/40 text-white backdrop-blur-sm">
                    {TYPE_LABELS[item.type] || item.type}
                  </span>
                  {item.isHot && <span className="text-xs font-semibold px-2 py-1 rounded-full btn-orange text-white">🔥 Горячее</span>}
                </div>
                <div className="absolute top-3 right-3 flex gap-2">
                  <button onClick={() => onToggleFavorite(item.id)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center shadow ${isFav ? 'bg-red-500 text-white' : 'bg-white'}`}>
                    <Icon name="Heart" size={16} />
                  </button>
                  <button onClick={() => onToggleCompare(item.id)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center shadow ${inCompare ? 'bg-brand-orange text-white' : 'bg-white'}`}>
                    <Icon name="GitCompare" size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="aspect-[16/10] rounded-2xl bg-muted flex items-center justify-center">
                <Icon name="Image" size={48} className="text-muted-foreground" />
              </div>
            )}

            {imgs.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {imgs.map((u, i) => (
                  <button key={u + i} onClick={() => setActiveImg(i)}
                    className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 ${i === activeImg ? 'border-brand-blue' : 'border-transparent'}`}>
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <h1 className="font-display font-800 text-2xl md:text-3xl text-foreground">{item.title}</h1>
                {item.publicCode && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-blue/10 text-brand-blue whitespace-nowrap">
                    ID объекта: {item.publicCode}
                  </span>
                )}
              </div>
              <a
                href={`https://yandex.ru/maps/?text=${encodeURIComponent(
                  [item.city || 'Краснодар', item.district, item.address].filter(Boolean).join(', ')
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-blue transition-colors group"
                title="Открыть на карте"
              >
                <Icon name="MapPin" size={14} />
                <span className="underline decoration-dotted underline-offset-2 group-hover:decoration-solid">
                  {[item.city || 'Краснодар', item.district, item.address].filter(Boolean).join(', ')}
                </span>
                <Icon name="ExternalLink" size={12} className="opacity-60 group-hover:opacity-100" />
              </a>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="font-display font-700 text-lg mb-4">Параметры объекта</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat icon="Maximize" label="Площадь" value={`${item.area} м²`} />
                <Stat icon="Tag" label="Цена" value={formatPrice(item.price, item.deal)} />
                {item.pricePerM2 ? <Stat icon="DollarSign" label="За м²" value={`${item.pricePerM2.toLocaleString('ru')} ₽`} /> : null}
                {item.floor ? <Stat icon="Layers" label="Этаж" value={`${item.floor}${item.totalFloors ? ` из ${item.totalFloors}` : ''}`} /> : null}
                <Stat icon="Building2" label="Тип объекта" value={typeLabel} />
                <Stat icon="Briefcase" label="Категория сделки" value={dealLabel} />
                {item.purpose ? <Stat icon="Target" label="Назначение" value={item.purpose} /> : null}
                {item.payback ? (
                  <Stat
                    icon="TrendingUp"
                    label="Окупаемость"
                    value={`${item.payback} мес${item.payback >= 12 ? ` (~${(item.payback / 12).toFixed(1)} лет)` : ''}`}
                  />
                ) : null}
                {item.monthlyRent ? (
                  <Stat icon="Wallet" label="МАП (мес. арендный поток)" value={`${item.monthlyRent.toLocaleString('ru')} ₽`} />
                ) : null}
                {item.yearlyRent ? (
                  <Stat icon="Coins" label="ГАП (год. арендный поток)" value={`${item.yearlyRent.toLocaleString('ru')} ₽`} />
                ) : null}
                {item.profit && !item.monthlyRent ? (
                  <Stat icon="LineChart" label="Прибыль/мес" value={`${(item.profit / 1000).toFixed(0)} тыс ₽`} />
                ) : null}
                {item.tenantName ? <Stat icon="Users" label="Арендатор" value={item.tenantName} /> : null}
              </div>
            </div>

            {item.description && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="font-display font-700 text-lg mb-3">Описание</div>
                <div className="text-sm whitespace-pre-wrap text-foreground/85 leading-relaxed">{item.description}</div>
              </div>
            )}

            {item.tags && item.tags.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="font-display font-700 text-lg mb-3">Особенности</div>
                <div className="flex flex-wrap gap-2">
                  {item.tags.map(t => (
                    <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-brand-blue/10 text-brand-blue font-medium">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {item.videoUrl && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="font-display font-700 text-lg mb-3 flex items-center gap-2">
                  <Icon name="Video" size={18} /> Видео-обзор
                </div>
                <a href={item.videoUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-brand-blue hover:underline text-sm">
                  Открыть видео <Icon name="ExternalLink" size={14} />
                </a>
              </div>
            )}

            {(item.lat && item.lng) && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="font-display font-700 text-lg mb-3 flex items-center gap-2">
                  <Icon name="Map" size={18} /> Расположение на карте
                </div>
                <YandexMap
                  points={[{
                    id: item.id,
                    lat: item.lat,
                    lng: item.lng,
                    title: item.title,
                    caption: item.address,
                  }]}
                  zoom={15}
                  height="320px"
                />
                <a
                  href={`https://yandex.ru/maps/?text=${encodeURIComponent(
                    [item.city || 'Краснодар', item.district, item.address].filter(Boolean).join(', ')
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1 hover:text-brand-blue underline decoration-dotted underline-offset-2"
                >
                  <Icon name="MapPin" size={12} />
                  {[item.city || 'Краснодар', item.district, item.address].filter(Boolean).join(', ')}
                  <Icon name="ExternalLink" size={11} className="opacity-60" />
                </a>
              </div>
            )}

            <PropertyCalculators
              title={item.title}
              address={[item.city || 'Краснодар', item.district, item.address].filter(Boolean).join(', ')}
              price={item.price}
              area={item.area}
              deal={item.deal}
              type={item.type}
              payback={item.payback}
              profit={item.profit}
              pricePerM2={item.pricePerM2}
            />
          </div>

          {/* Правая часть: цена + форма */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm sticky top-20">
              <div className="font-display font-900 text-3xl text-brand-blue mb-1">
                {formatPrice(item.price, item.deal)}
              </div>
              {item.pricePerM2 && (
                <div className="text-sm text-muted-foreground mb-4">
                  {item.pricePerM2.toLocaleString('ru')} ₽/м²
                </div>
              )}

              {sent ? (
                <div className="py-6 text-center">
                  <Icon name="CheckCircle2" size={40} className="mx-auto mb-2 text-emerald-500" />
                  <div className="font-semibold">Заявка отправлена!</div>
                  <div className="text-sm text-muted-foreground mt-1">Менеджер свяжется с вами в течение 15 минут.</div>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-3">
                  <input required placeholder="Ваше имя" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-lg" />
                  <input required placeholder="Телефон" value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-lg" />
                  <textarea placeholder="Комментарий (необязательно)" rows={3}
                    value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-lg" />
                  <button type="submit" disabled={sending}
                    className="w-full btn-blue text-white py-3 rounded-xl font-semibold disabled:opacity-50">
                    {sending ? 'Отправка...' : 'Заказать просмотр'}
                  </button>
                </form>
              )}

              {settings.company_phone && (
                <a href={`tel:${settings.company_phone}`}
                  className="mt-3 w-full block text-center text-brand-blue font-semibold text-sm hover:underline">
                  <Icon name="Phone" size={14} className="inline mr-1" />
                  {settings.company_phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon name={icon} size={12} />
        {label}
      </div>
      <div className="font-display font-700 text-base">{value}</div>
    </div>
  );
}