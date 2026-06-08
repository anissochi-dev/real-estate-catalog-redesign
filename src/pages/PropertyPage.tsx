import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchListingById, ListingDetail, sendLead, fetchAgents, Agent } from '@/lib/api';
import { fireLeadConversion } from '@/lib/analytics';
import SmartCaptcha, { CaptchaResult } from '@/components/SmartCaptcha';
import { recordView } from '@/components/RecentlyViewed';
import { extractIdFromSlug } from '@/lib/slug';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import Breadcrumbs from '@/components/Breadcrumbs';
import PropertyMediaGallery from '@/components/property/PropertyMediaGallery';
import PropertyMainContent from '@/components/property/PropertyMainContent';
import PropertySidebar from '@/components/property/PropertySidebar';
import { TYPE_LABELS, DEAL_LABELS } from '@/components/property/propertyLabels';
import AIMatchModal from '@/components/AIMatchModal';
import SchemaOrg, { makeRealEstateSchema, makeBreadcrumbSchema, makeVideoObjectSchema, makeFaqSchema } from '@/components/SchemaOrg';

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
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [faq, setFaq] = useState<{ question: string; answer: string }[]>([]);
  const [faqLoading, setFaqLoading] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaResult | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Сети для шеринга — единые компактные иконки lucide, без фирменных цветов
  const shareNetworks: { label: string; href: string; icon: string }[] = [
    {
      label: 'ВКонтакте',
      href: `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(item?.title || '')}`,
      icon: 'Share2',
    },
    {
      label: 'Telegram',
      href: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent((item?.title || '') + '\n')}`,
      icon: 'Send',
    },
    {
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent((item?.title || '') + '\n' + shareUrl)}`,
      icon: 'MessageCircle',
    },
    {
      label: 'Макс',
      href: `https://max.ru/share?url=${encodeURIComponent(shareUrl)}`,
      icon: 'Sparkles',
    },
  ];

  useEffect(() => {
    const id = extractIdFromSlug(slug || '');
    if (!id) { setLoading(false); return; }
    setLoading(true);
    fetchListingById(id).then(d => {
      setItem(d);
      if (d) {
        recordView(d);
        fetch('https://functions.poehali.dev/1d84bd40-ef8c-4bd3-82c3-af294b1ec0b1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listing_id: d.id, event_type: 'view_site' }),
        }).catch(() => {});
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

  useEffect(() => {
    if (!item) return;
    const rawTitle = item.seoTitle || `${item.title} — ${item.city || 'Краснодар'} | ${settings.company_name || 'Бизнес. Маркетинг. Недвижимость.'}`;
    const title = rawTitle.length > 68 ? rawTitle.slice(0, 67).trimEnd() + '…' : rawTitle;
    document.title = title;
    const desc = (item.seoDescription || (item.description || '')).slice(0, 160);
    const setMeta = (selector: string, create: () => HTMLMetaElement, content: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) { el = create(); document.head.appendChild(el); }
      el.content = content;
    };
    setMeta('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' }), desc);
    setMeta('meta[property="og:title"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:title'); return m; }, title);
    setMeta('meta[property="og:description"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:description'); return m; }, desc);
    setMeta('meta[property="og:type"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:type'); return m; }, 'product');
    setMeta('meta[property="og:site_name"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:site_name'); return m; }, settings.company_name || 'Бизнес. Маркетинг. Недвижимость.');
    setMeta('meta[property="og:url"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:url'); return m; }, window.location.href);
    setMeta('meta[name="twitter:title"]', () => Object.assign(document.createElement('meta'), { name: 'twitter:title' }), title);
    setMeta('meta[name="twitter:description"]', () => Object.assign(document.createElement('meta'), { name: 'twitter:description' }), desc);
    const mainImage = (item.images && item.images[0]) || item.image;
    if (mainImage) {
      setMeta('meta[property="og:image"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:image'); return m; }, mainImage);
      setMeta('meta[property="vk:image"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'vk:image'); return m; }, mainImage);
      setMeta('meta[name="twitter:image"]', () => Object.assign(document.createElement('meta'), { name: 'twitter:image' }), mainImage);
    }
    let canon = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.appendChild(canon); }
    const siteOrigin = (settings.site_url || '').replace(/\/$/, '') || window.location.origin;
    canon.href = siteOrigin + window.location.pathname;
  }, [item, settings.company_name, settings.site_url]);

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

  const siteUrl = settings.site_url || 'https://bmn.su';
  const pageUrl = typeof window !== 'undefined' ? window.location.href : `${siteUrl}/object/${slug}`;

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
    { name: `${typeLabel} · ${dealLabel}`, url: `${siteUrl}/catalog?type=${item.type}&deal=${item.deal}` },
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
      <SchemaOrg schema={productSchema} id="property" />
      <SchemaOrg schema={breadcrumbSchema} id="breadcrumb" />
      {videoSchema && <SchemaOrg schema={videoSchema} id="video" />}
      {faqSchema && <SchemaOrg schema={faqSchema} id="faq" />}

      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="hidden md:block min-w-0 flex-1">
            <Breadcrumbs items={[
              { label: 'Главная', to: '/' },
              { label: 'Каталог', to: '/catalog' },
              { label: `${typeLabel} · ${dealLabel}`, to: `/catalog?type=${item.type}&deal=${item.deal}` },
              { label: item.title },
            ]} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <button
                onClick={() => setShareOpen(v => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition whitespace-nowrap"
              >
                <Icon name="Share2" size={11} /> Поделиться
              </button>
              {shareOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-border rounded-xl shadow-lg p-1.5 min-w-[180px]">
                  <div className="text-[10px] font-semibold text-muted-foreground/70 px-2 py-1 uppercase tracking-wide">Поделиться</div>
                  {shareNetworks.map(n => (
                    <a key={n.label} href={n.href} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition text-[12px] text-foreground"
                      onClick={() => setShareOpen(false)}
                    >
                      <Icon name={n.icon} size={13} className="text-muted-foreground" />
                      <span>{n.label}</span>
                    </a>
                  ))}
                  <div className="border-t border-border my-1" />
                  <button onClick={copyLink}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition text-[12px] w-full text-left">
                    <Icon name={copied ? 'Check' : 'Link2'} size={13} className={copied ? 'text-emerald-600' : 'text-muted-foreground'} />
                    <span>{copied ? 'Скопировано' : 'Скопировать ссылку'}</span>
                  </button>
                </div>
              )}
              {shareOpen && <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />}
            </div>
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap">
              <Icon name="ArrowLeft" size={11} /> Назад
            </button>
          </div>
        </div>

        {/* ИИ-панель: подбор похожих */}
        <div className="bg-gradient-to-r from-brand-blue to-indigo-600 rounded-2xl px-4 py-3 mb-4">
          <form
            onSubmit={e => { e.preventDefault(); setAiOpen(true); }}
            className="flex items-center gap-2"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-orange to-rose-500 flex items-center justify-center flex-shrink-0">
              <Icon name="Sparkles" size={14} className="text-white" />
            </div>
            <input
              value={aiQuery}
              onChange={e => setAiQuery(e.target.value)}
              placeholder={`Найти похожие на «${item.title.slice(0, 40)}${item.title.length > 40 ? '…' : ''}»`}
              className="flex-1 bg-transparent text-white placeholder:text-white/50 outline-none text-sm min-w-0"
            />
            {aiQuery && (
              <button type="button" onClick={() => setAiQuery('')} className="text-white/50 hover:text-white/80 flex-shrink-0">
                <Icon name="X" size={13} />
              </button>
            )}
            <button
              type="submit"
              className="flex-shrink-0 btn-orange text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="Sparkles" size={12} />
              Найти с ИИ
            </button>
          </form>
        </div>

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
              <div className="px-4 pt-3 pb-3">
                <div className="text-[10px] text-muted-foreground mb-0.5 font-medium uppercase tracking-wide">
                  {dealLabel}
                </div>
                <div className="font-display font-900 text-2xl text-brand-blue leading-none tracking-tight">
                  {item.price.toLocaleString('ru')} ₽{item.deal === 'rent' ? '/мес' : ''}
                </div>
                {item.pricePerM2 ? (
                  <div className="flex items-center gap-1 mt-1.5">
                    <Icon name="Scaling" size={11} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{item.pricePerM2.toLocaleString('ru')} ₽/м²</span>
                  </div>
                ) : null}
              </div>
              {agents.filter(a => a.phone)[0] && (
                <div className="px-4 py-3 border-t border-border">
                  <a href={`tel:${agents.filter(a => a.phone)[0].phone}`}
                    className="w-full flex items-center justify-center gap-2 bg-brand-blue text-white text-sm font-bold px-4 py-2.5 rounded-xl">
                    <Icon name="Phone" size={16} />
                    {agents.filter(a => a.phone)[0].phone}
                  </a>
                </div>
              )}
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
            agents={agents.filter(a => a.phone)}
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
        {faqLoading && (
          <div className="mt-8 border-t border-border pt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-blue/30 border-t-brand-blue animate-spin" />
            Генерируем FAQ для этого объекта…
          </div>
        )}
        {faq.length > 0 && (
          <section className="mt-8 border-t border-border pt-8" aria-label="Часто задаваемые вопросы">
            <h2 className="font-display font-700 text-xl text-foreground mb-5 flex items-center justify-center gap-2">
              <Icon name="HelpCircle" size={20} className="text-brand-blue" />
              Часто задаваемые вопросы
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {faq.slice(0, 6).map((faqItem, i) => (
                <details key={i} className="group border border-border rounded-xl overflow-hidden">
                  <summary className="flex items-center justify-between px-4 py-3.5 cursor-pointer font-semibold text-sm select-none list-none hover:bg-muted/50 transition-colors">
                    <span>{faqItem.question}</span>
                    <Icon name="ChevronDown" size={16} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180 ml-3" />
                  </summary>
                  <div className="px-4 pb-4 pt-1 text-sm text-foreground/80 leading-relaxed border-t border-border">
                    {faqItem.answer}
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}
      </div>

      <AIMatchModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        initialPrompt={aiQuery || `${dealLabel} ${typeLabel} ${item.area} м² ${item.city || 'Краснодар'}`}
        autoSubmit
      />

    </article>
  );
}