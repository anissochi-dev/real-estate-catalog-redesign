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
const UTILITY_ICONS: Record<string, string> = {
  'Вода': 'Droplets',
  'Канализация': 'Waves',
  'Отопление': 'Flame',
  'Газ': 'Fuel',
  'Электричество': 'Zap',
  'Интернет': 'Wifi',
  'Вентиляция': 'Wind',
  'Кондиционирование': 'Thermometer',
  'Пожарная сигнализация': 'BellRing',
  'Видеонаблюдение': 'Camera',
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

  const rawImgs = item.images && item.images.length ? item.images : [item.image].filter(Boolean);
  const hasVideo = !!item.videoUrl;
  // Порядок: 1-е фото, потом видео (если есть), потом остальные фото
  const imgs = rawImgs.length > 1 && hasVideo
    ? [rawImgs[0], ...rawImgs.slice(1)]   // видео вставляется как элемент между 1-м и 2-м фото
    : rawImgs;
  // Индекс видео = 1 (после первого фото)
  const videoIndex = hasVideo ? 1 : -1;
  const totalMedia = imgs.length + (hasVideo ? 1 : 0);
  // activeImg: 0 = первое фото, 1 = видео (если есть), 2+ = фото 2,3...
  const isVideoActive = hasVideo && activeImg === videoIndex;
  const photoIndex = hasVideo && activeImg > videoIndex ? activeImg - 1 : activeImg;
  const mainImg = isVideoActive ? null : (imgs[photoIndex] || imgs[0]);
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
                ) : mainImg !== null && mainImg !== undefined ? (
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

              {/* Миниатюры: 1 фото → видео → остальные фото */}
              {totalMedia > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {/* Первое фото */}
                  <button onClick={() => setActiveImg(0)}
                    className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${activeImg === 0 ? 'border-brand-blue' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                    <img src={rawImgs[0]} alt="" className="w-full h-full object-cover" />
                  </button>
                  {/* Видео — вторым */}
                  {hasVideo && (
                    <button onClick={() => setActiveImg(videoIndex)}
                      className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all flex flex-col items-center justify-center bg-slate-900 gap-1 ${activeImg === videoIndex ? 'border-brand-blue' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                      <Icon name="Play" size={20} className="text-white" />
                      <span className="text-[9px] text-white/60">Видео</span>
                    </button>
                  )}
                  {/* Остальные фото */}
                  {rawImgs.slice(1).map((u, i) => {
                    const mediaIdx = i + 2; // +1 первое фото, +1 видео
                    return (
                      <button key={u + i} onClick={() => setActiveImg(mediaIdx)}
                        className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${mediaIdx === activeImg ? 'border-brand-blue' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                        <img src={u} alt="" className="w-full h-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Название и адрес */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h1 className="font-display font-800 text-2xl md:text-3xl text-foreground mb-2">{item.title}</h1>
              <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Icon name="MapPin" size={14} className="flex-shrink-0 text-brand-blue" />
                <span>{[item.city || 'Краснодар', item.district, item.address].filter(Boolean).join(', ')}</span>
              </div>
            </div>

            {/* Параметры объекта */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="font-display font-700 text-lg mb-4">Параметры объекта</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <ParamCard icon="Maximize" label="Площадь" value={`${item.area} м²`} />
                <ParamCard icon="Briefcase" label="Тип сделки" value={dealLabel} />
                <ParamCard icon="Building2" label="Тип объекта" value={typeLabel} />
                {item.floor ? <ParamCard icon="Layers" label="Этаж" value={`${item.floor}${item.totalFloors ? ` из ${item.totalFloors}` : ''}`} /> : null}
                {item.purpose ? <ParamCard icon="Target" label="Назначение" value={item.purpose} /> : null}
                {item.ceilingHeight ? <ParamCard icon="MoveVertical" label="Высота потолка" value={`${item.ceilingHeight} м`} /> : null}
                {item.electricityKw ? <ParamCard icon="Zap" label="Эл. мощность" value={`${item.electricityKw} кВт`} /> : null}
                {(item as ListingDetail & { condition?: string }).condition ? (
                  <ParamCard icon="CheckCircle2" label="Состояние" value={CONDITION_LABELS[(item as ListingDetail & { condition?: string }).condition!] || (item as ListingDetail & { condition?: string }).condition!} />
                ) : null}
                {item.finishing ? <ParamCard icon="Paintbrush" label="Отделка" value={FINISHING_LABELS[item.finishing] || item.finishing} /> : null}
                {(item as ListingDetail & { parking?: string }).parking && (item as ListingDetail & { parking?: string }).parking !== 'none' ? (
                  <ParamCard icon="ParkingSquare" label="Парковка" value={PARKING_LABELS[(item as ListingDetail & { parking?: string }).parking!] || (item as ListingDetail & { parking?: string }).parking!} />
                ) : null}
                {(item as ListingDetail & { entrance?: string }).entrance ? (
                  <ParamCard icon="DoorOpen" label="Вход" value={ENTRANCE_LABELS[(item as ListingDetail & { entrance?: string }).entrance!] || (item as ListingDetail & { entrance?: string }).entrance!} />
                ) : null}
                {item.roadLine ? <ParamCard icon="Milestone" label="Линия расположения" value={ROAD_LINE_LABELS[item.roadLine] || item.roadLine} /> : null}
                {item.payback ? <ParamCard icon="TrendingUp" label="Окупаемость" value={`${item.payback} мес${item.payback >= 12 ? ` (~${(item.payback / 12).toFixed(1)} лет)` : ''}`} /> : null}
                {item.monthlyRent ? <ParamCard icon="Wallet" label="Арендный поток/мес" value={`${item.monthlyRent.toLocaleString('ru')} ₽`} /> : null}
                {item.yearlyRent ? <ParamCard icon="Coins" label="Арендный поток/год" value={`${item.yearlyRent.toLocaleString('ru')} ₽`} /> : null}
                {item.profit && !item.monthlyRent ? <ParamCard icon="LineChart" label="Прибыль/мес" value={`${(item.profit / 1000).toFixed(0)} тыс ₽`} /> : null}
                {item.tenantName ? <ParamCard icon="Users" label="Арендатор" value={item.tenantName} /> : null}
              </div>

              {/* Коммуникации — как параметры с иконками */}
              {item.utilities && (
                <div className="mt-5 pt-4 border-t border-border">
                  <div className="font-display font-700 text-base mb-3">Коммуникации</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {item.utilities.split(',').map(u => u.trim()).filter(Boolean).map(u => {
                      const [key, val] = u.includes(':') ? u.split(':').map(s => s.trim()) : [u, ''];
                      const icon = UTILITY_ICONS[key] || 'Plug';
                      return (
                        <div key={u} className="flex items-start gap-2.5 bg-muted/40 rounded-xl px-3 py-2.5">
                          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                            <Icon name={icon} size={14} className="text-brand-blue" />
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground leading-tight">{key}</div>
                            {val && <div className="font-display font-700 text-sm leading-tight mt-0.5">{val}</div>}
                          </div>
                        </div>
                      );
                    })}
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
            <div className="bg-white rounded-2xl shadow-sm sticky top-20 overflow-hidden">
              <div className="p-5 pb-4">
                <div className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                  {DEAL_LABELS[item.deal] || item.deal}
                </div>
                <div className="font-display font-900 text-3xl text-brand-blue leading-none tracking-tight">
                  {item.price.toLocaleString('ru')} ₽{item.deal === 'rent' ? '/мес' : ''}
                </div>
                {item.pricePerM2 ? (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Icon name="Scaling" size={12} className="text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{item.pricePerM2.toLocaleString('ru')} ₽/м²</span>
                  </div>
                ) : null}
              </div>
              {item.publicCode && (
                <div className="px-5 py-2.5 bg-muted/40 border-t border-border flex items-center gap-2">
                  <Icon name="Hash" size={12} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">ID объекта:</span>
                  <span className="text-xs font-semibold text-foreground">{item.publicCode}</span>
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
                      <img src={agent.avatar} alt={agent.name} referrerPolicy="no-referrer" className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-border" />
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

function ParamCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-muted/40 rounded-xl px-3 py-2.5">
      <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
        <Icon name={icon} size={14} className="text-brand-blue" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
        <div className="font-display font-700 text-sm leading-tight mt-0.5 truncate">{value}</div>
      </div>
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