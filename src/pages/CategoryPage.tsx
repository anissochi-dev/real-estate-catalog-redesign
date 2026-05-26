import { useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Property } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';

interface Props {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
}

const CATEGORY_META: Record<string, {
  labelRu: string;
  icon: string;
  gradient: string;
  h1: string;
  h2: string;
  h3: string;
  h4: string;
  h5: string;
  description: string;
  features: string[];
}> = {
  office: {
    labelRu: 'Офисы',
    icon: 'Building2',
    gradient: 'from-blue-500 to-indigo-600',
    h1: 'Аренда и продажа офисов в Краснодаре',
    h2: 'Офисные помещения в Краснодаре — подбор под ваш бизнес',
    h3: 'Аренда офисов в Краснодаре',
    h4: 'Офисы в бизнес-центрах и отдельных зданиях',
    h5: 'Параметры и цены на офисы',
    description: 'Офисные помещения в Краснодаре на любой бюджет — от небольших кабинетов до целых этажей в бизнес-центрах. Помогаем подобрать офис в центре города, деловых кварталах или на периферии с удобной парковкой.',
    features: ['Помещения от 15 до 3000 м²', 'Бизнес-центры класса A, B и C', 'Открытая планировка и кабинетная', 'Инфраструктура: переговорные, кухни, reception'],
  },
  retail: {
    labelRu: 'Торговые помещения',
    icon: 'ShoppingBag',
    gradient: 'from-orange-500 to-rose-500',
    h1: 'Торговые помещения в аренду и продажу в Краснодаре',
    h2: 'Торговые площади в Краснодаре — первая линия и ТЦ',
    h3: 'Торговые площади в аренду в Краснодаре',
    h4: 'Магазины и шоурумы в торговых центрах',
    h5: 'Параметры и условия аренды торговых помещений',
    description: 'Торговые площади на первых линиях улиц, в торговых центрах, жилых комплексах и отдельно стоящих зданиях. Идеально для магазинов, шоурумов, аптек и бутиков.',
    features: ['1-я и 2-я линия улиц', 'Витринные окна и отдельные входы', 'Высокий пешеходный и автомобильный трафик', 'Помещения с готовым торговым оборудованием'],
  },
  warehouse: {
    labelRu: 'Складские помещения',
    icon: 'Warehouse',
    gradient: 'from-slate-500 to-zinc-700',
    h1: 'Складские помещения в аренду в Краснодаре',
    h2: 'Склады и складские комплексы в Краснодаре и пригороде',
    h3: 'Аренда складов в Краснодаре',
    h4: 'Отапливаемые и холодильные склады',
    h5: 'Площади и ставки аренды складских помещений',
    description: 'Современные склады и складские комплексы в Краснодаре и пригороде — от небольших боксов до логистических центров. Удобный подъезд для фур, ворота секционные, охрана.',
    features: ['Стеллажное хранение и ответственное хранение', 'Ворота с пандусом и рампой', 'Отапливаемые и холодильные склады', 'Охраняемая территория и видеонаблюдение'],
  },
  restaurant: {
    labelRu: 'Помещения для общепита',
    icon: 'UtensilsCrossed',
    gradient: 'from-amber-500 to-red-500',
    h1: 'Помещения под кафе, рестораны и общепит в Краснодаре',
    h2: 'Открыть кафе или ресторан в Краснодаре — готовые помещения',
    h3: 'Рестораны и кафе на продажу в Краснодаре',
    h4: 'Помещения с вентиляцией и вытяжкой для общепита',
    h5: 'Цены и условия аренды помещений под общепит',
    description: 'Готовые и чистовые помещения для открытия кафе, ресторанов, баров, пекарен и фастфуда в Краснодаре. Объекты с вытяжкой, электрической мощностью и разрешённым использованием.',
    features: ['Готовые кухни и вентиляция', 'Высокий трафик и парковка', 'Наружная реклама и вывески', 'Помещения с действующим бизнесом'],
  },
  hotel: {
    labelRu: 'Гостиницы и мини-отели',
    icon: 'BedDouble',
    gradient: 'from-pink-500 to-fuchsia-600',
    h1: 'Гостиницы и мини-отели в продажу и аренду в Краснодаре',
    h2: 'Гостиничный бизнес в Краснодаре — продажа и аренда',
    h3: 'Мини-отели и хостелы в Краснодаре',
    h4: 'Действующие гостиницы с персоналом и клиентской базой',
    h5: 'Номерной фонд, загрузка и доходность отелей',
    description: 'Действующие и готовые к запуску гостиницы, мини-отели, хостелы и апарт-отели в Краснодаре. Готовые бизнесы с персоналом и клиентской базой.',
    features: ['Готовый гостиничный бизнес', 'Апарт-комплексы и хостелы', 'Объекты с документами и разрешениями', 'Центральные и курортные локации'],
  },
  business: {
    labelRu: 'Готовый бизнес',
    icon: 'Briefcase',
    gradient: 'from-violet-500 to-purple-700',
    h1: 'Продажа готового бизнеса в Краснодаре',
    h2: 'Готовый бизнес в Краснодаре — актуальные предложения',
    h3: 'Купить готовый бизнес в Краснодаре',
    h4: 'Бизнес с подтверждёнными доходами и документами',
    h5: 'Стоимость и окупаемость готового бизнеса',
    description: 'Готовый бизнес с оборудованием, клиентской базой, персоналом и подтверждёнными доходами. Кафе, магазины, производства, сервисные компании — проверенные объекты с документами.',
    features: ['Подтверждённая выручка и прибыль', 'Полный пакет документов', 'Бизнес с историей и репутацией', 'Поддержка при передаче бизнеса'],
  },
  gab: {
    labelRu: 'ГАБ (готовый арендный бизнес)',
    icon: 'TrendingUp',
    gradient: 'from-emerald-500 to-teal-600',
    h1: 'ГАБ — готовый арендный бизнес в Краснодаре',
    h2: 'Популярные категории: офисы, склады, торговые площади, рестораны',
    h3: 'Инвестиции в готовый арендный бизнес',
    h4: 'ГАБ с сетевыми арендаторами — Краснодар',
    h5: 'Доходность и окупаемость арендного бизнеса',
    description: 'Инвестиционные объекты с действующими долгосрочными арендаторами. Стабильный пассивный доход с первого дня владения. Окупаемость 8–12 лет.',
    features: ['Арендаторы — сетевые федеральные компании', 'Долгосрочные договоры аренды от 3 лет', 'Прозрачная финансовая отчётность', 'Окупаемость 8–12 лет'],
  },
  production: {
    labelRu: 'Производственные помещения',
    icon: 'Factory',
    gradient: 'from-stone-500 to-neutral-700',
    h1: 'Аренда производственных помещений в Краснодаре',
    h2: 'Производственные цеха и базы в Краснодаре',
    h3: 'Аренда цехов и мастерских в Краснодаре',
    h4: 'Промышленные помещения с кранами и высокими потолками',
    h5: 'Мощность электроснабжения и технические параметры',
    description: 'Производственные цеха, мастерские, технические базы и промышленные объекты в Краснодаре и пригороде. Высокие потолки, мощное электроснабжение, удобный подъезд для грузового транспорта.',
    features: ['Потолки от 5 до 15 метров', 'Электроснабжение 3-фаза от 50 кВт', 'Краны-балки и тельферы', 'Промышленные зоны и отдельные въезды'],
  },
  land: {
    labelRu: 'Земельные участки',
    icon: 'Trees',
    gradient: 'from-lime-500 to-green-700',
    h1: 'Продажа коммерческих земельных участков в Краснодаре',
    h2: 'Земельные участки под коммерческое строительство',
    h3: 'Продажа земли под бизнес в Краснодарском крае',
    h4: 'Участки с коммуникациями и разрешёнными видами использования',
    h5: 'Площадь, стоимость и категория земельных участков',
    description: 'Земельные участки под коммерческое строительство, склады, производство, торговлю в Краснодаре и Краснодарском крае. Участки с подведёнными коммуникациями и разрешённым использованием.',
    features: ['ИЖС, КФХ, промышленные категории', 'Подъезд и коммуникации', 'Участки с проектами застройки', 'Первая линия и трассовые участки'],
  },
  building: {
    labelRu: 'Отдельно стоящие здания',
    icon: 'Landmark',
    gradient: 'from-sky-500 to-blue-700',
    h1: 'Продажа и аренда отдельно стоящих зданий в Краснодаре',
    h2: 'Отдельно стоящие здания под офис или бизнес в Краснодаре',
    h3: 'Продажа зданий в Краснодаре',
    h4: 'Здания с собственной территорией и парковкой',
    h5: 'Площадь, этажность и стоимость зданий',
    description: 'Административные здания, офисные центры, торговые здания и особняки под бизнес в Краснодаре. Собственная территория, парковка и независимость от управляющих компаний.',
    features: ['Собственная парковка и территория', 'Независимая инфраструктура', 'Возможность брендирования фасада', 'Исторические и новые здания'],
  },
  free_purpose: {
    labelRu: 'Помещения свободного назначения',
    icon: 'Shuffle',
    gradient: 'from-cyan-500 to-teal-700',
    h1: 'Помещения свободного назначения в Краснодаре',
    h2: 'Универсальные коммерческие помещения в Краснодаре',
    h3: 'Аренда помещений свободного назначения',
    h4: 'Помещения для медицины, спорта, образования и торговли',
    h5: 'Площадь и стоимость помещений свободного назначения',
    description: 'Универсальные коммерческие помещения без ограничений по виду деятельности. Подходят для медицины, образования, спорта, торговли, сервиса и многих других видов бизнеса.',
    features: ['Без ограничений по виду деятельности', 'Возможна перепланировка', 'На первых и цокольных этажах', 'Оптимальное соотношение цена/качество'],
  },
  car_service: {
    labelRu: 'Автосервисы',
    icon: 'Wrench',
    gradient: 'from-zinc-500 to-slate-800',
    h1: 'Аренда и продажа помещений под автосервис в Краснодаре',
    h2: 'Автосервисы и автобизнес в Краснодаре',
    h3: 'Аренда боксов и помещений для автосервиса',
    h4: 'Готовые автосервисы с оборудованием и клиентской базой',
    h5: 'Площадь, въездные ворота и мощность электрики',
    description: 'Готовые автосервисы и помещения под автобизнес — боксы, мастерские, автомойки, шиномонтажи в Краснодаре. Въездные ворота, ямы, компрессоры, электрика под нагрузку.',
    features: ['Подъёмники и ямы в комплекте', 'Въезд для легковых и грузовых ТС', 'Электрика 380 В от 30 кВт', 'Готовые автосервисы с клиентской базой'],
  },
};

export default function CategoryPage({ properties, favorites, compareList, onToggleFavorite, onToggleCompare }: Props) {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const city = settings.main_city || 'Краснодар';

  const meta = type ? CATEGORY_META[type] : null;

  useEffect(() => {
    if (!meta) return;
    const company = settings.company_name || 'BIZNEST';
    const title = `${meta.h1} | ${company}`;
    document.title = title;

    const setMeta = (sel: string, attr: string, val: string) => {
      let el = document.querySelector(sel);
      if (!el) { el = document.createElement('meta'); document.head.appendChild(el); }
      el.setAttribute(attr, val);
    };

    setMeta('meta[name="description"]', 'content', meta.description);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', meta.description);
    setMeta('meta[property="og:type"]', 'content', 'website');
    setMeta('meta[property="og:url"]', 'content', `${settings.site_url || ''}${window.location.pathname}`);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', meta.description);

    return () => {
      document.title = company;
    };
  }, [meta, settings.company_name, settings.site_url]);

  const items = useMemo(() => {
    if (!type) return [];
    return properties.filter(p => String(p.type) === type);
  }, [properties, type]);

  if (!meta) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🔍</div>
          <div className="font-display font-700 text-xl mb-2">Категория не найдена</div>
          <button onClick={() => navigate('/catalog')} className="btn-blue text-white px-5 py-2 rounded-xl mt-3">
            В каталог
          </button>
        </div>
      </div>
    );
  }

  const ldJson = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: meta.h1,
    description: meta.description,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 10).map((p, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: `${settings.site_url || ''}/object/${p.id}`,
      name: p.title,
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }} />

      {/* Hero-шапка категории */}
      <div className={`bg-gradient-to-br ${meta.gradient} text-white`}>
        <div className="container mx-auto px-4 py-10 md:py-14">
          <div className="mb-4">
            <Breadcrumbs
              items={[
                { label: 'Главная', to: '/' },
                { label: 'Каталог', to: '/catalog' },
                { label: meta.labelRu },
              ]}
              light
            />
          </div>
          <div className="flex items-start gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Icon name={meta.icon} size={28} className="text-white" />
            </div>
            <div>
              <h1 className="font-display font-900 text-2xl md:text-3xl leading-tight mb-1">
                {meta.h1}
              </h1>
              <h2 className="font-display font-600 text-base text-white/75 mb-2 leading-snug">
                {meta.h2}
              </h2>
              <p className="text-white/70 text-sm max-w-2xl leading-relaxed">
                {meta.description}
              </p>
            </div>
          </div>

          {/* Фичи — H4 как семантические подзаголовки */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {meta.features.map((f, i) => (
              <div key={i} className="flex items-start gap-2 bg-white/10 rounded-xl px-3 py-2.5">
                <Icon name="CheckCircle2" size={14} className="text-white/80 mt-0.5 flex-shrink-0" />
                <h4 className="text-xs text-white/90 leading-snug font-normal">{f}</h4>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Описание для поисковых систем */}
      <div className="bg-white border-b border-border">
        <div className="container mx-auto px-4 py-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-muted-foreground">
              <h3 className="inline font-semibold text-foreground">{meta.h3}</h3>{' '}—{' '}
              найдено <span className="font-semibold text-foreground">{items.length}</span> объектов
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => navigate(`/catalog?type=${type}`)}
                className="text-xs text-brand-blue font-semibold flex items-center gap-1 hover:underline"
              >
                <Icon name="SlidersHorizontal" size={13} />
                Фильтры и сортировка
              </button>
              <button
                onClick={() => navigate('/catalog')}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Icon name="LayoutGrid" size={13} />
                Все категории
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Список объектов */}
      <div className="container mx-auto px-4 py-8">
        {items.length === 0 ? (
          <div className="text-center py-20">
            <Icon name="Building2" size={40} className="mx-auto mb-4 text-muted-foreground opacity-30" />
            <div className="font-display font-700 text-xl text-foreground mb-2">
              Объекты в этой категории появятся скоро
            </div>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Пока в категории «{meta.labelRu}» нет активных объектов. Смотрите другие категории или оставьте заявку.
            </p>
            <button onClick={() => navigate('/catalog')} className="btn-blue text-white px-6 py-2.5 rounded-xl text-sm font-semibold">
              Смотреть все объекты
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {items.map((property, i) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  isFavorite={favorites.includes(property.id)}
                  isCompare={compareList.includes(property.id)}
                  onToggleFavorite={onToggleFavorite}
                  onToggleCompare={onToggleCompare}
                  style={{ animationDelay: `${i * 0.03}s`, opacity: 0 }}
                />
              ))}
            </div>

            {/* SEO-текст внизу */}
            <div className="mt-12 p-6 bg-white rounded-2xl border border-border">
              <h2 className="font-display font-700 text-lg mb-1">
                {meta.h2}
              </h2>
              <h5 className="text-sm text-brand-blue font-medium mb-3">{meta.h5}</h5>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {meta.description} Наша компания специализируется на подборе коммерческой недвижимости в {city}е с{' '}
                {settings.company_since_year || 2007} года. Мы помогаем как покупателям, так и арендаторам найти
                оптимальный объект с учётом бюджета, требований к площади и расположению.
              </p>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Популярные категории</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CATEGORY_META)
                  .filter(([k]) => k !== type)
                  .map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => navigate(`/catalog/${k}`)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-brand-blue hover:text-brand-blue transition-colors"
                    >
                      {v.labelRu}
                    </button>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}