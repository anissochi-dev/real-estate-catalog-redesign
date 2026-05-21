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

  const shareNetworks = [
    {
      label: 'ВКонтакте',
      href: `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(item?.title || '')}`,
      bg: 'bg-[#0077FF]',
      icon: (
        <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
          <path d="M12.785 16.241s.288-.032.436-.194c.136-.148.131-.427.131-.427s-.019-1.305.587-1.497c.598-.19 1.365 1.261 2.179 1.818.615.422 1.082.33 1.082.33l2.175-.03s1.137-.071.598-1.023c-.044-.075-.314-.665-1.616-1.881-1.365-1.271-1.182-1.066.462-3.267.998-1.33 1.396-2.143 1.271-2.49-.12-.331-.853-.244-.853-.244l-2.447.015s-.181-.025-.315.06c-.132.083-.217.277-.217.277s-.387 1.029-.902 1.905c-1.088 1.848-1.522 1.947-1.699 1.832-.413-.267-.31-1.075-.31-1.648 0-1.793.272-2.54-.529-2.733-.266-.064-.461-.107-1.141-.114-.872-.009-1.609.003-2.026.208-.278.136-.492.44-.362.457.162.022.529.099.724.365.251.344.242 1.116.242 1.116s.144 2.11-.336 2.372c-.329.18-.781-.188-1.751-1.878-.498-.861-.875-1.814-.875-1.814s-.072-.188-.202-.289c-.157-.123-.376-.162-.376-.162l-2.327.015s-.349.01-.477.162c-.114.136-.009.417-.009.417s1.822 4.265 3.883 6.414c1.891 1.973 4.039 1.842 4.039 1.842h.973z"/>
        </svg>
      ),
    },
    {
      label: 'Telegram',
      href: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent((item?.title || '') + '\n')}`,
      bg: 'bg-[#2AABEE]',
      icon: (
        <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      ),
    },
    {
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent((item?.title || '') + '\n' + shareUrl)}`,
      bg: 'bg-[#25D366]',
      icon: (
        <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
        </svg>
      ),
    },
    {
      label: 'Макс',
      href: `https://max.ru/share?url=${encodeURIComponent(shareUrl)}`,
      bg: 'bg-[#7B40F2]',
      icon: (
        <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.5 13.5h-2l-2.5-3.5-2.5 3.5h-2l3.5-5-3.5-4.5h2l2.5 3.5 2.5-3.5h2l-3.5 4.5 3.5 5z"/>
        </svg>
      ),
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
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition whitespace-nowrap"
              >
                <Icon name="Share2" size={13} /> Поделиться
              </button>
              {shareOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-border rounded-2xl shadow-xl p-3 min-w-[210px]">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-2.5 px-1 uppercase tracking-wide">Поделиться</div>
                  <div className="space-y-0.5">
                    {shareNetworks.map(n => (
                      <a key={n.label} href={n.href} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-muted transition text-sm font-medium"
                        onClick={() => setShareOpen(false)}
                      >
                        <span className={`w-7 h-7 rounded-lg ${n.bg} flex items-center justify-center shrink-0`}>
                          {n.icon}
                        </span>
                        <span>{n.label}</span>
                      </a>
                    ))}
                  </div>
                  <div className="border-t border-border mt-2.5 pt-2">
                    <button onClick={copyLink}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-muted transition text-sm font-medium w-full text-left">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${copied ? 'bg-emerald-500' : 'bg-muted'}`}>
                        <Icon name={copied ? 'Check' : 'Link'} size={13} className={copied ? 'text-white' : 'text-muted-foreground'} />
                      </span>
                      {copied ? 'Ссылка скопирована!' : 'Скопировать ссылку'}
                    </button>
                  </div>
                </div>
              )}
              {shareOpen && <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />}
            </div>
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">
              <Icon name="ArrowLeft" size={14} /> Назад
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