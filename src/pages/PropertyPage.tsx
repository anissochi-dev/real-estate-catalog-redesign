import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchListingById, ListingDetail, sendLead, fetchAgents, Agent } from '@/lib/api';
import { fireLeadConversion } from '@/lib/analytics';
import { CaptchaResult } from '@/components/SmartCaptcha';
import { recordView } from '@/components/RecentlyViewed';
import { extractIdFromSlug } from '@/lib/slug';
import { useSettings } from '@/contexts/SettingsContext';
import { getSiteUrl } from '@/lib/siteUrl';
import Icon from '@/components/ui/icon';
import PropertyMediaGallery from '@/components/property/PropertyMediaGallery';
import PropertyMainContent from '@/components/property/PropertyMainContent';
import PropertySidebar from '@/components/property/PropertySidebar';
import PropertyTopBar from '@/components/property/PropertyTopBar';
import PropertyAiSearchBar from '@/components/property/PropertyAiSearchBar';
import PropertyFaqSection from '@/components/property/PropertyFaqSection';
import { TYPE_LABELS, DEAL_LABELS } from '@/components/property/propertyLabels';
import { categoryLabel, catalogCategoryUrl } from '@/lib/categories';
import AIMatchModal from '@/components/AIMatchModal';
import AIChatWidget from '@/components/property/AIChatWidget';
import SchemaOrg, { makeRealEstateSchema, makeBreadcrumbSchema, makeVideoObjectSchema, makeFaqSchema } from '@/components/SchemaOrg';
import SeoHead from '@/components/SeoHead';

interface Props {
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  favorites: number[];
  compareList: number[];
}

const FAQ_URL = 'https://functions.poehali.dev/282b9c5f-29fa-41ea-bc42-0793bdf8950d';

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
  const [aiQuery, setAiQuery] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [faq, setFaq] = useState<{ question: string; answer: string }[]>([]);
  const [faqLoading, setFaqLoading] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaResult | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  useEffect(() => {
    const id = extractIdFromSlug(slug || '');
    if (!id) { setLoading(false); return; }
    setLoading(true);
    const fromQr = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('from') === 'qr';
    fetchListingById(id).then(d => {
      setItem(d);
      if (d) {
        recordView(d);
        const statsUrl = 'https://functions.poehali.dev/1d84bd40-ef8c-4bd3-82c3-af294b1ec0b1';
        const statReqs = [
          fetch(statsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listing_id: d.id, event_type: 'view_site' }) }),
          ...(fromQr ? [fetch(statsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listing_id: d.id, event_type: 'qr_scan' }) })] : []),
        ];
        Promise.all(statReqs).catch(() => {});
      }
    }).finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    fetchAgents().then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    if (!item?.id) return;
    // Если FAQ уже закеширован в объекте — используем сразу
    if (item.seoFaq && item.seoFaq.length > 0) {
      setFaq(item.seoFaq);
      return;
    }
    // Иначе генерируем через функцию (кешируется в БД для следующих просмотров)
    setFaqLoading(true);
    fetch(FAQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: item.id }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.faq?.length) setFaq(d.faq); })
      .catch(() => {})
      .finally(() => setFaqLoading(false));
  }, [item?.id]);

  const FALLBACK_OG = 'https://cdn.poehali.dev/projects/4bce74f4-4dd7-424e-85e7-ff08f8399357/files/og-image-1779575751349.png';
  const mainImage = item ? ((item.images && item.images[0]) || item.image || FALLBACK_OG) : undefined;
  const seoTitle = item ? (item.seoTitle || `${item.title} — ${item.city || 'Краснодар'}`) : undefined;
  const seoDesc = item ? (item.seoDescription || (item.description || '')).slice(0, 160) : undefined;

  if (loading) {
    return <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Загрузка объекта...</div>;
  }
  if (!item) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <SeoHead title="Объект не найден" noindex />
        <div className="font-display font-700 text-xl mb-2">Объект не найден</div>
        <button onClick={() => navigate('/catalog')} className="btn-blue text-white px-4 py-2 rounded-xl text-sm">К каталогу</button>
      </div>
    );
  }

  const rawImgs = item.images && item.images.length ? item.images : [item.image].filter(Boolean);
  const hasVideo = !!item.videoUrl;
  const imgs = rawImgs.length > 1 && hasVideo ? [rawImgs[0], ...rawImgs.slice(1)] : rawImgs;
  const videoIndex = hasVideo ? 1 : -1;
  const totalMedia = imgs.length + (hasVideo ? 1 : 0);
  const isVideoActive = hasVideo && activeImg === videoIndex;
  const photoIndex = hasVideo && activeImg > videoIndex ? activeImg - 1 : activeImg;
  const mainImg = isVideoActive ? null : (imgs[photoIndex] || imgs[0]);
  const isFav = favorites.includes(item.id);
  const inCompare = compareList.includes(item.id);
  const dealLabel = DEAL_LABELS[item.deal] || item.deal;
  const typeLabel = TYPE_LABELS[item.type] || item.type;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captcha?.passed) return;
    setSending(true);
    try {
      await sendLead({ name: form.name, phone: form.phone, message: form.message, listing_id: item.id, source: 'property-page', object_url: window.location.href, captcha_token: captcha.token });
      setSent(true);
      fireLeadConversion();
      setCaptcha(null);
      setCaptchaKey(k => k + 1);
    } finally {
      setSending(false);
    }
  };

  const siteUrl = getSiteUrl(settings.site_url);
  const pageUrl = `${siteUrl}/object/${slug}`;

  const productSchema = makeRealEstateSchema({
    title: item.title,
    description: (item.description || '').slice(0, 5000),
    url: pageUrl,
    images: imgs,
    price: item.price,
    deal: item.deal,
    type: typeLabel,
    area: item.area,
    address: item.address,
    city: item.city,
    lat: item.lat,
    lng: item.lng,
    floor: item.floor,
    rooms: (item as ListingDetail & { rooms?: number }).rooms,
    sellerName: settings.company_name || 'Бизнес. Маркетинг. Недвижимость.',
    sellerUrl: siteUrl,
    updatedAt: item.updatedAt || item.lastEditedAt,
    publicCode: item.publicCode,
    videoUrl: item.videoUrl,
    videoType: item.videoType || undefined,
  });

  const breadcrumbSchema = makeBreadcrumbSchema([
    { name: 'Главная', url: siteUrl },
    { name: 'Каталог', url: `${siteUrl}/catalog` },
    { name: categoryLabel(item.type), url: `${siteUrl}${catalogCategoryUrl(item.type)}` },
    { name: item.title, url: pageUrl },
  ]);

  const videoSchema = item.videoUrl ? makeVideoObjectSchema({
    name: item.title,
    description: (item.description || '').slice(0, 300),
    thumbnailUrl: imgs[0],
    uploadDate: item.createdAt,
    videoUrl: item.videoUrl,
    videoType: item.videoType || 'other',
  }) : null;

  const faqSchema = faq.length > 0 ? makeFaqSchema(faq) : null;

  return (
    <article className="bg-background">
      <SeoHead title={seoTitle} description={seoDesc} ogImage={mainImage} />
      <SchemaOrg schema={productSchema} id="property" />
      <SchemaOrg schema={breadcrumbSchema} id="breadcrumb" />
      {videoSchema && <SchemaOrg schema={videoSchema} id="video" />}
      {faqSchema && <SchemaOrg schema={faqSchema} id="faq" />}

      <div className="container mx-auto px-4 py-4">
        <PropertyTopBar itemType={item.type} itemTitle={item.title} shareUrl={shareUrl} />

        {/* ИИ-панель: подбор похожих */}
        <PropertyAiSearchBar
          aiQuery={aiQuery}
          setAiQuery={setAiQuery}
          setAiOpen={setAiOpen}
          itemTitle={item.title}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <PropertyMediaGallery
              item={item}
              rawImgs={rawImgs}
              imgs={imgs}
              hasVideo={hasVideo}
              videoIndex={videoIndex}
              totalMedia={totalMedia}
              isVideoActive={isVideoActive}
              mainImg={mainImg}
              activeImg={activeImg}
              setActiveImg={setActiveImg}
              lightbox={lightbox}
              setLightbox={setLightbox}
              isFav={isFav}
              inCompare={inCompare}
              onToggleFavorite={onToggleFavorite}
              onToggleCompare={onToggleCompare}
              dealLabel={dealLabel}
              typeLabel={typeLabel}
            />

            {/* Цена + агент — только мобильный, после галереи */}
            <div className="lg:hidden bg-white rounded-2xl shadow-sm overflow-hidden">
              {(() => {
                const ppm2 = item.pricePerM2 || (item.area && item.area > 0 ? Math.round(item.price / item.area) : null);
                return (
                <div className="px-4 pt-3 pb-3">
                  <div className="text-[10px] text-muted-foreground mb-0.5 font-medium uppercase tracking-wide">
                    {dealLabel}
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-display font-900 text-[18px] text-brand-blue leading-none tracking-tight">
                      {item.price.toLocaleString('ru')} ₽{item.deal === 'rent' ? '/мес' : ''}
                    </div>
                    {ppm2 ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Icon name="Scaling" size={10} className="text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{ppm2.toLocaleString('ru')} ₽/м²</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                );
              })()}
              {(() => {
                const withPhone = agents.filter(a => a.phone);
                const brokerAgent = item.brokerId ? withPhone.find(a => a.id === item.brokerId) : null;
                const displayAgent = brokerAgent || withPhone[0];
                if (!displayAgent) return null;
                return (
                  <div className="px-3 py-3 border-t border-border flex items-center gap-2">
                    <a href={`tel:${displayAgent.phone}`}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-brand-blue text-white text-xs font-bold px-3 py-2.5 rounded-xl min-w-0">
                      <Icon name="Phone" size={14} className="flex-shrink-0" />
                      <span className="truncate">Позвонить</span>
                    </a>
                    <button
                      onClick={() => setMobileChatOpen(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 border-2 border-brand-blue text-brand-blue text-xs font-bold px-3 py-2.5 rounded-xl min-w-0 hover:bg-brand-blue/5 transition-colors"
                    >
                      <Icon name="MessageCircle" size={14} className="flex-shrink-0" />
                      <span className="truncate">Написать</span>
                    </button>
                  </div>
                );
              })()}
            </div>

            <PropertyMainContent
              item={item}
              dealLabel={dealLabel}
              typeLabel={typeLabel}
              sent={sent}
              sending={sending}
              form={form}
              setForm={setForm}
              onSubmit={submit}
              captcha={captcha}
              setCaptcha={setCaptcha}
              captchaKey={captchaKey}
            />
          </div>
          <PropertySidebar
            item={item}
            agents={(() => {
              const withPhone = agents.filter(a => a.phone);
              if (item.brokerId) {
                const broker = withPhone.find(a => a.id === item.brokerId);
                return broker ? [broker] : withPhone.slice(0, 1);
              }
              return withPhone.slice(0, 1);
            })()}
            sent={sent}
            sending={sending}
            form={form}
            setForm={setForm}
            onSubmit={submit}
            captcha={captcha}
            setCaptcha={setCaptcha}
            captchaKey={captchaKey}
          />
        </div>

        {/* FAQ — часто задаваемые вопросы */}
        <PropertyFaqSection faq={faq} faqLoading={faqLoading} />
      </div>

      <AIMatchModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        initialPrompt={aiQuery || `${dealLabel} ${typeLabel} ${item.area} м² ${item.city || 'Краснодар'}`}
        autoSubmit
      />

      {mobileChatOpen && (
        <AIChatWidget
          listingId={item.id}
          listingTitle={item.title}
          onClose={() => setMobileChatOpen(false)}
        />
      )}

    </article>
  );
}