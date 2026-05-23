import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchListingById, ListingDetail, sendLead, fetchAgents, Agent } from '@/lib/api';
import { recordView } from '@/components/RecentlyViewed';
import { extractIdFromSlug } from '@/lib/slug';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import Breadcrumbs from '@/components/Breadcrumbs';
import PropertyMediaGallery from '@/components/property/PropertyMediaGallery';
import PropertyMainContent from '@/components/property/PropertyMainContent';
import PropertySidebar from '@/components/property/PropertySidebar';
import { TYPE_LABELS, DEAL_LABELS } from '@/components/property/propertyLabels';

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
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
    if (!item) return;
    const title = item.seoTitle || `${item.title} — ${item.city || 'Краснодар'} | ${settings.company_name || 'Бизнес. Маркетинг. Недвижимость.'}`;
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
    setSending(true);
    try {
      await sendLead({ name: form.name, phone: form.phone, message: form.message, listing_id: item.id, source: 'property-page', object_url: window.location.href });
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  const productLd: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: item.title, description: (item.description || '').slice(0, 5000),
    image: imgs, category: typeLabel,
    offers: { '@type': 'Offer', priceCurrency: 'RUB', price: item.price, availability: 'https://schema.org/InStock', url: typeof window !== 'undefined' ? window.location.href : '', seller: { '@type': 'Organization', name: settings.company_name || 'BIZNEST' } },
  };

  return (
    <div className="bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />

      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <Breadcrumbs items={[
            { label: 'Главная', to: '/' },
            { label: 'Каталог', to: '/catalog' },
            { label: `${typeLabel} · ${dealLabel}`, to: `/catalog?type=${item.type}&deal=${item.deal}` },
            { label: item.title },
          ]} />
          <div className="flex items-center gap-2">
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
            <PropertyMainContent
              item={item}
              dealLabel={dealLabel}
              typeLabel={typeLabel}
              sent={sent}
              sending={sending}
              form={form}
              setForm={setForm}
              onSubmit={submit}
            />
          </div>
          <PropertySidebar item={item} agents={agents} />
        </div>
      </div>
    </div>
  );
}