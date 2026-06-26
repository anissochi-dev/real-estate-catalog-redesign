import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import Breadcrumbs from '@/components/Breadcrumbs';
import SmartCaptcha, { CaptchaResult } from '@/components/SmartCaptcha';
import { fetchPublicLeads, aiSearchLeads, sendLead, PublicLead, fetchDistricts, District } from '@/lib/api';
import { useSeoH1 } from '@/components/SeoHead';
import SeoHead from '@/components/SeoHead';
import SchemaOrg, { makeBreadcrumbSchema, makeItemListSchema } from '@/components/SchemaOrg';
import PublicPhoneInput from '@/components/PublicPhoneInput';

const SITE_URL = 'https://bmn.su';
const OG_IMAGE = 'https://cdn.poehali.dev/projects/4bce74f4-4dd7-424e-85e7-ff08f8399357/bucket/f8de2a72-faf3-4f8b-aaa2-0ee00c7e16dc.png';

function fmtBudget(from: number | null, to: number | null): string {
  if (!from && !to) return 'Договорная';
  if (from && to) {
    const fmt = (v: number) => v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)} млн ₽`
      : `${Math.round(v / 1_000)} тыс ₽`;
    return `${fmt(from)} – ${fmt(to)}`;
  }
  const v = from || to!;
  const s = v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)} млн ₽`
    : `${Math.round(v / 1_000)} тыс ₽`;
  return from ? `от ${s}` : `до ${s}`;
}

function fmtArea(from: number | null, to: number | null): string {
  if (!from && !to) return 'Не указана';
  if (from && to) return `${from.toLocaleString('ru')} – ${to.toLocaleString('ru')} м²`;
  if (from) return `от ${from.toLocaleString('ru')} м²`;
  return `до ${to!.toLocaleString('ru')} м²`;
}

function fmtDate(s: string | null): string {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return s;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d',
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const CATEGORY_LABELS: Record<string, string> = {
  office: 'Офис',
  retail: 'Магазин / торговое',
  warehouse: 'Склад',
  restaurant: 'Общепит',
  hotel: 'Гостиница / Хостел',
  business: 'Готовый бизнес',
  gab: 'ГАБ',
  production: 'Производство',
  land: 'Земля',
  building: 'Здание',
  free_purpose: 'Своб. назначения',
  car_service: 'Автосервис',
};

const CATEGORY_ICONS: Record<string, string> = {
  office: 'Building2',
  retail: 'ShoppingBag',
  warehouse: 'Warehouse',
  restaurant: 'UtensilsCrossed',
  hotel: 'Hotel',
  business: 'Briefcase',
  gab: 'LayoutGrid',
  production: 'Factory',
  land: 'Map',
  building: 'Building',
  free_purpose: 'Layers',
  car_service: 'Car',
};

function LeadCard({ lead, districts, onContact }: { lead: PublicLead; districts: District[]; onContact: () => void }) {
  const displayName = lead.name || `Клиент #${lead.id}`;
  const color = avatarColor(displayName);
  const typeLabel = lead.property_type === 'sale' ? 'Покупка' : lead.property_type === 'rent' ? 'Аренда' : null;
  const typeSale = lead.property_type === 'sale';
  const cat = lead.property_category || lead.request_category;
  const catLabel = cat ? CATEGORY_LABELS[cat] || cat : null;
  const catIcon = cat ? CATEGORY_ICONS[cat] || 'Tag' : 'Tag';
  const isUpdated = lead.updated_at && lead.updated_at !== lead.created_at;
  const displayDate = fmtDate(isUpdated ? lead.updated_at! : lead.created_at);
  const dateLabel = isUpdated ? 'Обновлено' : 'Добавлено';
  const budgetStr = fmtBudget(lead.budget, lead.budget_to);
  const areaStr = fmtArea(lead.area_from, lead.area_to);
  const districtNames = (lead.district_ids || [])
    .map(id => districts.find(d => d.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <article className="bg-white rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-brand-blue/25 transition-all duration-200 p-6">
      {/* Шапка: аватар + имя */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ background: color }}
        >
          <Icon name="User" size={20} />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-[17px] text-foreground leading-tight">Заявка #{lead.id}</div>
          {lead.is_network_tenant && (
            <div className="truncate">
              {lead.company && <span className="text-[15px] font-semibold text-red-600">{lead.company} </span>}
              <span className="text-sm text-brand-blue font-medium">• Федеральная сеть</span>
            </div>
          )}
        </div>
      </div>

      {/* Бейджи: тип + категория + районы */}
      <div className="flex flex-wrap gap-2 mb-3">
        {typeLabel && (
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full ${
            typeSale ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'
          }`}>
            <Icon name={typeSale ? 'TrendingUp' : 'Handshake'} size={13} />
            {typeLabel}
          </span>
        )}
        {catLabel && (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            <Icon name={catIcon} size={13} />
            {catLabel}
          </span>
        )}
        {districtNames.map(name => (
          <span key={name} className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">
            <Icon name="MapPin" size={13} />
            {name}
          </span>
        ))}
      </div>

      {/* Параметры: бюджет, площадь, коммуникации */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 bg-slate-50 rounded-xl px-4 py-3 mb-4 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Icon name="Wallet" size={14} className="text-muted-foreground" />
          <span className="text-muted-foreground">Бюджет:</span>
          <span className={`font-semibold ${budgetStr === 'Договорная' ? 'text-muted-foreground font-normal' : ''}`}>
            {budgetStr}
          </span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <Icon name="Maximize2" size={14} className="text-muted-foreground" />
          <span className="text-muted-foreground">Площадь:</span>
          <span className={`font-semibold ${areaStr === 'Не указана' ? 'text-muted-foreground font-normal' : ''}`}>
            {areaStr}
          </span>
        </div>
        {lead.utilities && (
          <div className="flex items-center gap-2 text-foreground">
            <Icon name="Zap" size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">Коммуникации:</span>
            <span className="font-semibold">{lead.utilities}</span>
          </div>
        )}
      </div>

      {/* Описание */}
      {lead.message && (
        <div className="text-[15px] leading-relaxed text-foreground/85 py-4 border-t border-b border-slate-100 mb-4">
          {lead.message}
        </div>
      )}

      {/* Футер */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Icon name="Clock" size={13} />
          {dateLabel} {displayDate}
        </div>
        <button
          onClick={onContact}
          className="btn-blue text-white px-5 py-2 rounded-full font-semibold text-sm inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Icon name="Phone" size={14} />
          Связаться
        </button>
      </div>
    </article>
  );
}

export default function LeadsListPage() {
  const h1 = useSeoH1('Заявки клиентов');
  const LOAD_STEP = 20;
  const SEO_TITLE = 'Заявки клиентов на коммерческую недвижимость в Краснодаре';
  const SEO_DESC = 'Реальные заявки от арендаторов и покупателей коммерческой недвижимости в Краснодаре: офисы, склады, торговые площади, рестораны, гостиницы. Найдите арендатора или идею для бизнеса.';

  const [allLeads, setAllLeads] = useState<PublicLead[]>([]);
  const [visibleCount, setVisibleCount] = useState(LOAD_STEP);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [districts, setDistricts] = useState<District[]>([]);

  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiIds, setAiIds] = useState<number[] | null>(null);
  const [aiReasoning, setAiReasoning] = useState('');

  const [contactLead, setContactLead] = useState<PublicLead | null>(null);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', message: '' });
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaResult | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const load = () => {
    setLoading(true);
    setError('');
    fetchPublicLeads({ page: 1, limit: 200, ids: aiIds || undefined, sort: 'newest' })
      .then(r => {
        setAllLeads(r.leads);
        setTotal(r.total);
        setVisibleCount(LOAD_STEP);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить заявки');
        setAllLeads([]);
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [aiIds]);

  useEffect(() => {
    fetchDistricts().then(list => setDistricts(list.filter(d => !d.is_okrug))).catch(() => {});
  }, []);

  const leads = allLeads.slice(0, visibleCount);
  const hasMore = visibleCount < allLeads.length;

  const breadcrumbSchema = useMemo(() => makeBreadcrumbSchema([
    { name: 'Главная', url: `${SITE_URL}/` },
    { name: 'Заявки клиентов', url: `${SITE_URL}/leads` },
  ]), []);

  const itemListSchema = useMemo(() => makeItemListSchema(
    allLeads.slice(0, 50).map(lead => ({
      name: `Заявка #${lead.id}${lead.property_category ? ` — ${CATEGORY_LABELS[lead.property_category] || lead.property_category}` : ''}`,
      url: `${SITE_URL}/leads`,
      description: lead.message?.slice(0, 160) || undefined,
    })),
    'Заявки клиентов на коммерческую недвижимость'
  ), [allLeads]);

  const runAiSearch = async () => {
    const q = aiQuery.trim();
    if (!q || aiLoading) return;
    setAiLoading(true);
    setError('');
    try {
      const r = await aiSearchLeads(q);
      if (!r.ids.length) {
        toast.info('ВБ ничего не нашёл — попробуйте переформулировать');
        setAiIds(null); setAiReasoning('');
        return;
      }
      setAiIds(r.ids);
      setAiReasoning(r.reasoning || '');
      toast.success(`Найдено ${r.ids.length} подходящих заявок`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Не удалось выполнить ИИ-поиск');
    } finally {
      setAiLoading(false);
    }
  };

  const resetAi = () => { setAiIds(null); setAiReasoning(''); setAiQuery(''); };

  const openContact = (lead: PublicLead) => {
    setContactLead(lead);
    setContactForm({
      name: '',
      phone: '',
      message: `Хочу связаться по заявке #${lead.id}${lead.name ? ` (${lead.name})` : ''}`,
    });
    setContactSent(false);
    setCaptcha(null);
    setCaptchaKey(k => k + 1);
  };

  const closeContact = () => { setContactLead(null); setCaptcha(null); };

  const submitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactLead) return;
    if (!captcha?.passed) { toast.error('Пожалуйста, пройдите проверку «не робот»'); return; }
    setContactSending(true);
    try {
      await sendLead({
        name: contactForm.name,
        phone: contactForm.phone,
        message: contactForm.message,
        source: 'leads-page',
        object_url: typeof window !== 'undefined' ? window.location.href : '',
        captcha_token: captcha?.token,
      });
      setContactSent(true);
    } finally {
      setContactSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        path="/leads"
        title={SEO_TITLE}
        description={SEO_DESC}
        h1={h1}
        keywords="заявки клиентов, аренда коммерческой недвижимости, покупка помещений, офис в аренду Краснодар, склад аренда, торговая площадь"
        ogImage={OG_IMAGE}
      />
      <SchemaOrg schema={breadcrumbSchema} id="leads-bc" />
      {allLeads.length > 0 && <SchemaOrg schema={itemListSchema} id="leads-list" />}

      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="mb-3">
          <Breadcrumbs items={[{ label: 'Главная', to: '/' }, { label: 'Заявки клиентов' }]} />
        </div>

        <h1 className="font-display font-900 text-2xl md:text-3xl text-foreground mb-2">{h1}</h1>
        <p className="text-sm text-muted-foreground mb-3">
          Что ищут другие посетители — может быть, вам подойдёт похожая идея, или вы готовы стать арендатором.
        </p>

        {/* SEO-блок */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-5 text-sm text-muted-foreground leading-relaxed">
          <h2 className="font-semibold text-foreground text-[15px] mb-1">Реальные запросы арендаторов и покупателей</h2>
          Здесь собраны актуальные заявки от бизнеса, который ищет коммерческую недвижимость в Краснодаре и крае:
          офисы, склады, торговые площади, рестораны, гостиницы, производственные помещения.
          Если у вас есть подходящий объект — свяжитесь с автором заявки напрямую.
        </div>

        {/* ИИ-поиск */}
        <div className="bg-gradient-to-br from-brand-blue/5 to-brand-orange/5 border border-brand-blue/15 rounded-2xl p-4 sm:p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-orange to-rose-500 flex items-center justify-center shrink-0">
              <Icon name="Sparkles" size={16} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">ИИ-поиск Виртуального брокера</h3>
              <div className="text-[11px] text-muted-foreground">Опишите задачу — ВБ найдёт похожие заявки</div>
            </div>
          </div>
          <form onSubmit={e => { e.preventDefault(); runAiSearch(); }} className="flex flex-col sm:flex-row gap-2">
            <input
              value={aiQuery}
              onChange={e => setAiQuery(e.target.value)}
              placeholder="Например: ищу офис в центре до 80 м² под IT"
              className="flex-1 px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:border-brand-blue"
              disabled={aiLoading}
            />
            <button
              type="submit"
              disabled={aiLoading || !aiQuery.trim()}
              className="btn-orange text-white px-5 py-2 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60 min-h-[40px]"
            >
              <Icon name={aiLoading ? 'Loader2' : 'Sparkles'} size={14} className={aiLoading ? 'animate-spin' : ''} />
              {aiLoading ? 'Ищу…' : 'Найти'}
            </button>
          </form>
          {aiIds && (
            <div className="mt-2 flex items-start justify-between gap-2 text-xs">
              <div className="text-muted-foreground flex-1">
                {aiReasoning ? <><b>ВБ:</b> {aiReasoning}</> : `Найдено ${aiIds.length} заявок`}
              </div>
              <button onClick={resetAi} className="text-brand-blue hover:underline shrink-0 inline-flex items-center gap-1">
                <Icon name="X" size={11} /> Показать все
              </button>
            </div>
          )}
        </div>

        {/* Счётчик */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4 px-1">
          <span>Всего заявок: <b className="text-foreground">{total}</b>{aiIds && <span className="ml-2 text-brand-blue">· ИИ-выборка</span>}</span>
          <span className="hidden sm:inline">Сначала недавно обновлённые</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4 flex items-center gap-2">
            <Icon name="AlertCircle" size={15} /> {error}
          </div>
        )}

        {loading && leads.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Icon name="Loader2" size={28} className="mx-auto mb-3 animate-spin" />
            Загрузка заявок…
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-3">🔍</div>
            <div className="font-display font-700 text-xl mb-1">Заявки не найдены</div>
            <div className="text-muted-foreground text-sm">
              {aiIds ? 'Попробуйте переформулировать запрос' : 'Пока нет опубликованных заявок'}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {leads.map(lead => (
                <LeadCard key={lead.id} lead={lead} districts={districts} onContact={() => openContact(lead)} />
              ))}
            </div>

            {hasMore && (
              <div className="flex flex-col items-center gap-2 mt-8">
                <button
                  onClick={() => setVisibleCount(v => v + LOAD_STEP)}
                  className="btn-orange text-white px-8 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
                >
                  <Icon name="ChevronDown" size={16} />
                  Показать ещё {Math.min(LOAD_STEP, allLeads.length - visibleCount)} заявок
                </button>
                <div className="text-xs text-muted-foreground">Показано {visibleCount} из {allLeads.length}</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FAQ-блок */}
      <SchemaOrg schema={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Как разместить заявку на аренду коммерческой недвижимости?',
            acceptedAnswer: { '@type': 'Answer', text: 'Нажмите кнопку «Разместить объект» или обратитесь к нашим менеджерам. Заявка будет опубликована в течение одного рабочего дня.' },
          },
          {
            '@type': 'Question',
            name: 'Какую коммерческую недвижимость ищут в Краснодаре?',
            acceptedAnswer: { '@type': 'Answer', text: 'Арендаторы ищут офисы, торговые площади, склады, рестораны, гостиницы и производственные помещения. Федеральные сети рассматривают объекты от 100 м² в проходимых локациях.' },
          },
          {
            '@type': 'Question',
            name: 'Как связаться с автором заявки?',
            acceptedAnswer: { '@type': 'Answer', text: 'Нажмите кнопку «Связаться» под заявкой, оставьте свои контактные данные — менеджер передаст их заявителю и организует переговоры.' },
          },
          {
            '@type': 'Question',
            name: 'Бесплатно ли размещение заявки?',
            acceptedAnswer: { '@type': 'Answer', text: 'Да, размещение заявки на аренду или покупку коммерческой недвижимости на нашем сайте бесплатно для арендаторов и покупателей.' },
          },
        ],
      }} id="leads-faq" />
      <div className="container mx-auto px-4 pb-10 max-w-3xl">
        <h2 className="font-display font-700 text-xl text-foreground mb-4 mt-2">Частые вопросы</h2>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
          {[
            { q: 'Как разместить заявку на аренду?', a: 'Нажмите «Разместить объект» или обратитесь к менеджерам. Заявка публикуется в течение одного рабочего дня.' },
            { q: 'Какую недвижимость ищут в Краснодаре?', a: 'Офисы, торговые площади, склады, рестораны, гостиницы и производственные помещения. Федеральные сети рассматривают объекты от 100 м² в проходимых локациях.' },
            { q: 'Как связаться с автором заявки?', a: 'Нажмите «Связаться» под заявкой, оставьте контакты — менеджер организует переговоры.' },
            { q: 'Размещение заявки платное?', a: 'Нет, размещение заявки для арендаторов и покупателей полностью бесплатно.' },
          ].map(({ q, a }) => (
            <details key={q} className="group bg-white px-5 py-4 cursor-pointer select-none">
              <summary className="font-semibold text-[15px] text-foreground list-none flex items-center justify-between gap-3">
                {q}
                <Icon name="ChevronDown" size={16} className="shrink-0 text-muted-foreground group-open:rotate-180 transition-transform" />
              </summary>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* Модалка контакта */}
      {contactLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-5 border-b border-border flex items-start justify-between gap-2">
              <div>
                <div className="font-display font-700 text-lg">Связаться по заявке</div>
                <div className="text-xs text-muted-foreground mt-0.5">Менеджер свяжется с вами в ближайшее время</div>
              </div>
              <button onClick={closeContact} className="p-1 hover:bg-muted rounded">
                <Icon name="X" size={18} />
              </button>
            </div>
            {contactSent ? (
              <div className="p-6 text-center">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Icon name="CheckCircle2" size={28} className="text-emerald-600" />
                </div>
                <div className="font-display font-700 text-lg mb-1">Заявка отправлена</div>
                <div className="text-sm text-muted-foreground mb-4">Мы свяжемся с вами в ближайшее время.</div>
                <button onClick={closeContact} className="btn-blue text-white px-5 py-2 rounded-xl font-semibold text-sm">
                  Закрыть
                </button>
              </div>
            ) : (
              <form onSubmit={submitContact} className="p-4 sm:p-5 space-y-3">
                <div className="bg-muted/40 rounded-xl p-3 text-xs">
                  <div className="font-semibold mb-1">Заявка #{contactLead.id}</div>
                  <div className="text-muted-foreground whitespace-pre-wrap break-words">
                    {(contactLead.message || '').slice(0, 200)}{(contactLead.message || '').length > 200 ? '…' : ''}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Ваше имя *</label>
                  <input
                    required
                    value={contactForm.name}
                    onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                    placeholder="Иван"
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Телефон *</label>
                  <PublicPhoneInput
                    value={contactForm.phone}
                    onChange={phone => setContactForm({ ...contactForm, phone })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Комментарий</label>
                  <textarea
                    rows={3}
                    value={contactForm.message}
                    onChange={e => setContactForm({ ...contactForm, message: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
                  />
                </div>
                <SmartCaptcha key={captchaKey} onResult={setCaptcha} />
                <button
                  type="submit"
                  disabled={contactSending || !contactForm.name || !contactForm.phone}
                  className="w-full btn-blue text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {contactSending ? <><Icon name="Loader2" size={14} className="animate-spin" /> Отправляю…</> : 'Отправить заявку'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}