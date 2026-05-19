import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchListingById, ListingDetail, sendLead, fetchAgents, Agent } from '@/lib/api';
import { extractIdFromSlug } from '@/lib/slug';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { formatPrice } from '@/components/PropertyCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import PropertyMapInfrastructure from '@/components/PropertyMapInfrastructure';
import PropertyCalculators from '@/components/calculators/PropertyCalculators';
import SimilarListings from '@/components/SimilarListings';
import PricePredict from '@/components/PricePredict';

const TYPE_LABELS: Record<string, string> = {
  office: 'Офис',
  retail: 'Торговое помещение',
  warehouse: 'Склад',
  restaurant: 'Общепит',
  business: 'Готовый бизнес',
  production: 'Производственное помещение',
  hotel: 'Гостиница',
  gab: 'ГАБ',
  land: 'Земельный участок',
  building: 'Отдельно стоящее здание',
  free_purpose: 'Помещение свободного назначения',
  car_service: 'Автосервис',
};
const DEAL_LABELS: Record<string, string> = {
  sale: 'Продажа', rent: 'Аренда', business: 'Готовый бизнес',
};
const CONDITION_LABELS: Record<string, string> = {
  new: 'Новое', euro: 'Евроремонт', good: 'Хорошее',
  cosmetic: 'Требуется косметика', rough: 'Без отделки', shellcore: 'Черновая (Shell&Core)',
};
const FINISHING_LABELS: Record<string, string> = {
  none: 'Без отделки', rough: 'Черновая', pre_finish: 'Предчистовая',
  cosmetic: 'Косметический ремонт', euro: 'Евроремонт', designer: 'Дизайнерский ремонт',
};
const PARKING_LABELS: Record<string, string> = {
  none: 'Нет', street: 'На улице', building: 'В здании',
};
const ENTRANCE_LABELS: Record<string, string> = {
  street: 'С улицы', yard: 'Со двора',
};
const ROAD_LINE_LABELS: Record<string, string> = {
  '1': '1-я линия (фасад на дорогу)',
  '2': '2-я линия (внутри квартала)',
  '3': '3-я линия и дальше',
  'yard': 'Во дворе',
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
  const [lightbox, setLightbox] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const id = extractIdFromSlug(slug || '');
    if (!id) { setLoading(false); return; }
    setLoading(true);
    fetchListingById(id).then(d => setItem(d)).finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    fetchAgents().then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    if (!item) return;
    const title = item.seoTitle || `${item.title} — ${item.city || 'Краснодар'} | ${settings.company_name || 'BIZNEST'}`;
    document.title = title;
    const desc = item.seoDescription || (item.description || '').slice(0, 160);

    const setMeta = (selector: string, create: () => HTMLMetaElement, content: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) { el = create(); document.head.appendChild(el); }
      el.content = content;
    };
    setMeta('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' }), desc);
    setMeta('meta[property="og:title"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:title'); return m; }, title);
    setMeta('meta[property="og:description"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:description'); return m; }, desc);
    setMeta('meta[property="og:type"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:type'); return m; }, 'product');
    const mainImage = (item.images && item.images[0]) || item.image;
    if (mainImage) setMeta('meta[property="og:image"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:image'); return m; }, mainImage);
    let canon = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.appendChild(canon); }
    canon.href = window.location.origin + window.location.pathname;
  }, [item, settings.company_name]);

  const imgCount = item ? (item.images && item.images.length ? item.images.length : (item.image ? 1 : 0)) : 0;

  // Закрытие лайтбокса по Escape
  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') setActiveImg(i => Math.min(i + 1, imgCount - 1));
      if (e.key === 'ArrowLeft') setActiveImg(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox, imgCount]);

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
  // Медиа-галерея: фото (индексы 0..imgs.length-1) + видео (индекс imgs.length если есть)
  const hasVideo = !!item.videoUrl;
  const totalMedia = imgs.length + (hasVideo ? 1 : 0);
  const isVideoActive = hasVideo && activeImg === imgs.length;
  const mainImg = isVideoActive ? null : (imgs[activeImg] || imgs[0]);
  const isFav = favorites.includes(item.id);
  const inCompare = compareList.includes(item.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await sendLead({ name: form.name, phone: form.phone, message: form.message, listing_id: item.id, source: 'property-page' });
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  const dealLabel = DEAL_LABELS[item.deal] || item.deal;
  const typeLabel = TYPE_LABELS[item.type] || item.type;

  const productLd: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: item.title, description: (item.description || '').slice(0, 5000),
    image: imgs, category: typeLabel,
    offers: { '@type': 'Offer', priceCurrency: 'RUB', price: item.price, availability: 'https://schema.org/InStock', url: typeof window !== 'undefined' ? window.location.href : '', seller: { '@type': 'Organization', name: settings.company_name || 'BIZNEST' } },
  };

  return (
    <div className="bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />

      {/* Лайтбокс — только для фото */}
      {lightbox && mainImg && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={() => setLightbox(false)}
        >
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(false)}>
            <Icon name="X" size={28} />
          </button>
          {imgs.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 rounded-full p-2"
                onClick={e => { e.stopPropagation(); setActiveImg(i => Math.max(i - 1, 0)); }}
              >
                <Icon name="ChevronLeft" size={24} />
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 rounded-full p-2"
                onClick={e => { e.stopPropagation(); setActiveImg(i => Math.min(i + 1, imgs.length - 1)); }}
              >
                <Icon name="ChevronRight" size={24} />
              </button>
            </>
          )}
          <img
            src={mainImg}
            alt={item.title}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          <div className="absolute bottom-4 text-white/50 text-sm">{activeImg + 1} / {imgs.length}</div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Breadcrumbs items={[
            { label: 'Главная', to: '/' },
            { label: 'Каталог', to: '/catalog' },
            { label: `${typeLabel} · ${dealLabel}`, to: `/catalog?type=${item.type}&deal=${item.deal}` },
            { label: item.title },
          ]} />
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">
            <Icon name="ArrowLeft" size={14} /> Назад
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Левая часть */}
          <div className="lg:col-span-2 space-y-5">

            {/* Медиа-галерея */}
            <div className="space-y-2">
              {/* Главный экран */}
              <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[16/10]">
                {isVideoActive ? (
                  <VideoEmbed url={item.videoUrl!} />
                ) : mainImg ? (
                  <div className="cursor-zoom-in group w-full h-full" onClick={() => setLightbox(true)}>
                    <img src={mainImg} alt={item.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                    <div className="absolute bottom-3 right-3 bg-black/50 text-white rounded-lg px-2 py-1 text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Icon name="ZoomIn" size={12} /> Увеличить
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Icon name="Image" size={48} className="text-muted-foreground" />
                  </div>
                )}

                {/* Бейджи */}
                <div className="absolute top-3 left-3 flex gap-1.5 pointer-events-none">
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-brand-blue text-white">{dealLabel}</span>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-black/40 text-white backdrop-blur-sm">{typeLabel}</span>
                  {item.isHot && <span className="text-xs font-semibold px-2 py-1 rounded-full btn-orange text-white">🔥 Горячее</span>}
                  {item.isExclusive && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-500 text-white">Эксклюзив</span>}
                </div>

                {/* Избранное / сравнение */}
                <div className="absolute top-3 right-3 flex gap-2">
                  <button onClick={e => { e.stopPropagation(); onToggleFavorite(item.id); }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center shadow ${isFav ? 'bg-red-500 text-white' : 'bg-white'}`}>
                    <Icon name="Heart" size={16} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); onToggleCompare(item.id); }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center shadow ${inCompare ? 'bg-brand-orange text-white' : 'bg-white'}`}>
                    <Icon name="GitCompare" size={16} />
                  </button>
                </div>

                {/* Счётчик */}
                {totalMedia > 1 && (
                  <div className="absolute bottom-3 left-3 bg-black/50 text-white rounded-lg px-2 py-1 text-xs pointer-events-none">
                    {activeImg + 1} / {totalMedia}
                  </div>
                )}
              </div>

              {/* Миниатюры */}
              {totalMedia > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {imgs.map((u, i) => (
                    <button key={u + i} onClick={() => setActiveImg(i)}
                      className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${i === activeImg ? 'border-brand-blue' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                      <img src={u} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                  {/* Миниатюра видео */}
                  {hasVideo && (
                    <button onClick={() => setActiveImg(imgs.length)}
                      className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all flex items-center justify-center bg-slate-900 ${activeImg === imgs.length ? 'border-brand-blue' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                      <Icon name="Play" size={24} className="text-white" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Название и адрес */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <h1 className="font-display font-800 text-2xl md:text-3xl text-foreground">{item.title}</h1>
                {item.publicCode && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-blue/10 text-brand-blue whitespace-nowrap">
                    ID: {item.publicCode}
                  </span>
                )}
              </div>
              <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Icon name="MapPin" size={14} className="flex-shrink-0" />
                <span>{[item.city || 'Краснодар', item.district, item.address].filter(Boolean).join(', ')}</span>
              </div>
            </div>

            {/* Параметры объекта */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="font-display font-700 text-lg mb-4">Параметры объекта</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat icon="Maximize" label="Площадь" value={`${item.area} м²`} />
                {item.pricePerM2 ? <Stat icon="Scaling" label="За м²" value={`${item.pricePerM2.toLocaleString('ru')} ₽`} /> : null}
                <Stat icon="Building2" label="Тип объекта" value={typeLabel} />
                <Stat icon="Briefcase" label="Тип сделки" value={dealLabel} />
                {item.floor ? <Stat icon="Layers" label="Этаж" value={`${item.floor}${item.totalFloors ? ` из ${item.totalFloors}` : ''}`} /> : null}
                {item.purpose ? <Stat icon="Target" label="Назначение" value={item.purpose} /> : null}
                {item.ceilingHeight ? <Stat icon="MoveVertical" label="Высота потолка" value={`${item.ceilingHeight} м`} /> : null}
                {item.electricityKw ? <Stat icon="Zap" label="Эл. мощность" value={`${item.electricityKw} кВт`} /> : null}
                {(item as ListingDetail & { condition?: string }).condition ? (
                  <Stat icon="Star" label="Состояние" value={CONDITION_LABELS[(item as ListingDetail & { condition?: string }).condition!] || (item as ListingDetail & { condition?: string }).condition!} />
                ) : null}
                {item.finishing ? <Stat icon="Paintbrush" label="Отделка" value={FINISHING_LABELS[item.finishing] || item.finishing} /> : null}
                {(item as ListingDetail & { parking?: string }).parking && (item as ListingDetail & { parking?: string }).parking !== 'none' ? (
                  <Stat icon="ParkingSquare" label="Парковка" value={PARKING_LABELS[(item as ListingDetail & { parking?: string }).parking!] || (item as ListingDetail & { parking?: string }).parking!} />
                ) : null}
                {(item as ListingDetail & { entrance?: string }).entrance ? (
                  <Stat icon="DoorOpen" label="Вход" value={ENTRANCE_LABELS[(item as ListingDetail & { entrance?: string }).entrance!] || (item as ListingDetail & { entrance?: string }).entrance!} />
                ) : null}
                {item.roadLine ? <Stat icon="Milestone" label="Линия расположения" value={ROAD_LINE_LABELS[item.roadLine] || item.roadLine} /> : null}
                {item.payback ? (
                  <Stat icon="TrendingUp" label="Окупаемость" value={`${item.payback} мес${item.payback >= 12 ? ` (~${(item.payback / 12).toFixed(1)} лет)` : ''}`} />
                ) : null}
                {item.monthlyRent ? <Stat icon="Wallet" label="МАП (мес. аренд. поток)" value={`${item.monthlyRent.toLocaleString('ru')} ₽`} /> : null}
                {item.yearlyRent ? <Stat icon="Coins" label="ГАП (год. аренд. поток)" value={`${item.yearlyRent.toLocaleString('ru')} ₽`} /> : null}
                {item.profit && !item.monthlyRent ? <Stat icon="LineChart" label="Прибыль/мес" value={`${(item.profit / 1000).toFixed(0)} тыс ₽`} /> : null}
                {item.tenantName ? <Stat icon="Users" label="Арендатор" value={item.tenantName} /> : null}
              </div>

              {/* Коммуникации отдельным блоком */}
              {item.utilities && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Icon name="Droplets" size={12} /> Коммуникации
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.utilities.split(',').map(u => u.trim()).filter(Boolean).map(u => (
                      <span key={u} className="text-xs px-2.5 py-1 rounded-full bg-brand-blue/8 text-brand-blue border border-brand-blue/20 font-medium">{u}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Описание */}
            {item.description && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="font-display font-700 text-lg mb-3">Описание</div>
                <div className="text-sm whitespace-pre-wrap text-foreground/85 leading-relaxed">{item.description}</div>
              </div>
            )}



            {/* Карта */}
            {(!!item.lat && !!item.lng) && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="font-display font-700 text-lg mb-1 flex items-center gap-2">
                  <Icon name="Map" size={18} /> Расположение и инфраструктура
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Выберите категорию — отобразятся ближайшие объекты в радиусе 800 м
                </p>
                <PropertyMapInfrastructure
                  lat={item.lat}
                  lng={item.lng}
                  title={item.title}
                  address={[item.city || 'Краснодар', item.district, item.address].filter(Boolean).join(', ')}
                />
              </div>
            )}

            {/* Форма заявки — после карты, перед калькулятором */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="font-display font-700 text-lg mb-4 flex items-center gap-2">
                <Icon name="CalendarCheck" size={18} className="text-brand-blue" /> Заказать просмотр
              </div>
              {sent ? (
                <div className="py-4 text-center">
                  <Icon name="CheckCircle2" size={36} className="mx-auto mb-2 text-emerald-500" />
                  <div className="font-semibold">Заявка отправлена!</div>
                  <div className="text-sm text-muted-foreground mt-1">Менеджер свяжется с вами в течение 15 минут.</div>
                </div>
              ) : (
                <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input required placeholder="Ваше имя" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-lg text-sm" />
                  <input required placeholder="Телефон" value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-lg text-sm" />
                  <textarea placeholder="Комментарий (необязательно)" rows={2}
                    value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-lg text-sm sm:col-span-2" />
                  <button type="submit" disabled={sending}
                    className="sm:col-span-2 w-full btn-blue text-white py-3 rounded-xl font-semibold disabled:opacity-50">
                    {sending ? 'Отправка...' : 'Заказать просмотр'}
                  </button>
                </form>
              )}
            </div>

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

            {/* Особенности — внизу */}
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

            <SimilarListings listingId={item.id} />
          </div>

          {/* Правая колонка: цена + Аналитика цены */}
          <div className="space-y-4">
            {/* Цена */}
            <div className="bg-white rounded-2xl p-5 shadow-sm sticky top-20">
              <div className="text-xs text-muted-foreground mb-1">{dealLabel}</div>
              <div className="font-display font-900 text-3xl text-brand-blue mb-0.5">
                {formatPrice(item.price, item.deal)}
              </div>
              {item.pricePerM2 && (
                <div className="text-sm text-muted-foreground mb-1">
                  {item.pricePerM2.toLocaleString('ru')} ₽/м²
                </div>
              )}
              {item.area && (
                <div className="text-sm text-muted-foreground">
                  Площадь: <span className="font-semibold text-foreground">{item.area} м²</span>
                </div>
              )}
            </div>

            {/* Аналитика цены */}
            <PricePredict listingId={item.id} currentPrice={item.price} deal={item.deal} />

            {/* Карточка агента — sticky */}
            {agents.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm sticky top-20">
                <div className="text-[10px] text-muted-foreground mb-3 uppercase tracking-widest font-semibold">Представитель собственника</div>
                {agents.slice(0, 1).map(agent => (
                  <div key={agent.id} className="flex items-center gap-3">
                    {agent.avatar ? (
                      <img src={agent.avatar} alt={agent.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-border" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                        <Icon name="User" size={20} className="text-brand-blue" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-700 text-sm truncate">{agent.name}</div>
                      {agent.phone && (
                        <a href={`tel:${agent.phone}`}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline mt-0.5">
                          <Icon name="Phone" size={13} />
                          {agent.phone}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={highlight ? 'col-span-1' : ''}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon name={icon} size={12} />
        {label}
      </div>
      <div className={`font-display font-700 text-base ${highlight ? 'text-brand-blue text-lg' : ''}`}>{value}</div>
    </div>
  );
}

function VideoEmbed({ url }: { url: string }) {
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    return (
      <iframe
        className="w-full h-full"
        src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Видео"
      />
    );
  }
  // Rutube
  const rtMatch = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rtMatch) {
    return (
      <iframe
        className="w-full h-full"
        src={`https://rutube.ru/play/embed/${rtMatch[1]}`}
        allow="clipboard-write; autoplay"
        allowFullScreen
        title="Видео"
      />
    );
  }
  // VK
  const vkMatch = url.match(/vk\.com\/video(-?\d+_\d+)/);
  if (vkMatch) {
    return (
      <iframe
        className="w-full h-full"
        src={`https://vk.com/video_ext.php?oid=${vkMatch[1].split('_')[0]}&id=${vkMatch[1].split('_')[1]}`}
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        title="Видео"
      />
    );
  }
  // Прямая ссылка
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-900">
      <Icon name="Play" size={40} className="text-white/60" />
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="text-white/80 text-sm hover:text-white underline flex items-center gap-1">
        Открыть видео <Icon name="ExternalLink" size={14} />
      </a>
    </div>
  );
}