import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import Breadcrumbs from '@/components/Breadcrumbs';
import { CaptchaResult } from '@/components/SmartCaptcha';
import { fetchPublicLeads, aiSearchLeads, sendLead, PublicLead, fetchDistricts, District } from '@/lib/api';
import { useSeoH1 } from '@/components/SeoHead';
import SeoHead from '@/components/SeoHead';
import SchemaOrg, { makeBreadcrumbSchema, makeItemListSchema } from '@/components/SchemaOrg';
import LeadCard, { CATEGORY_LABELS } from './leads/LeadCard';
import LeadAiSearch from './leads/LeadAiSearch';
import LeadContactModal from './leads/LeadContactModal';
import LeadsFaq from './leads/LeadsFaq';

const SITE_URL = 'https://bmn.su';
const OG_IMAGE = 'https://cdn.poehali.dev/projects/4bce74f4-4dd7-424e-85e7-ff08f8399357/bucket/f8de2a72-faf3-4f8b-aaa2-0ee00c7e16dc.png';

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
        <LeadAiSearch
          aiQuery={aiQuery}
          aiLoading={aiLoading}
          aiIds={aiIds}
          aiReasoning={aiReasoning}
          onQueryChange={setAiQuery}
          onSearch={runAiSearch}
          onReset={resetAi}
        />

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
            <div className="flex flex-col gap-4" role="list">
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

      <LeadsFaq />

      {/* Модалка контакта */}
      {contactLead && (
        <LeadContactModal
          lead={contactLead}
          form={contactForm}
          sending={contactSending}
          sent={contactSent}
          captchaKey={captchaKey}
          onFormChange={setContactForm}
          onCaptcha={setCaptcha}
          onSubmit={submitContact}
          onClose={closeContact}
        />
      )}
    </div>
  );
}
