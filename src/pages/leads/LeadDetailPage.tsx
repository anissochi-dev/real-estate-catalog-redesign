import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import Breadcrumbs from '@/components/Breadcrumbs';
import { CaptchaResult } from '@/components/SmartCaptcha';
import { fetchPublicLeadBySlug, sendLead, PublicLead, fetchDistricts, District } from '@/lib/api';
import SeoHead from '@/components/SeoHead';
import SchemaOrg, { makeBreadcrumbSchema, makeServiceSchema } from '@/components/SchemaOrg';
import LeadCard, { CATEGORY_LABELS, fmtBudget, fmtArea, fmtDate } from './LeadCard';
import LeadContactModal from './LeadContactModal';

const SITE_URL = 'https://bmn.su';
const OG_IMAGE = 'https://cdn.poehali.dev/projects/4bce74f4-4dd7-424e-85e7-ff08f8399357/bucket/f8de2a72-faf3-4f8b-aaa2-0ee00c7e16dc.png';

export default function LeadDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [lead, setLead] = useState<PublicLead | null>(null);
  const [similar, setSimilar] = useState<PublicLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [districts, setDistricts] = useState<District[]>([]);

  const [contactOpen, setContactOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaResult | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    if (!slug) { setLoading(false); setNotFound(true); return; }
    setLoading(true);
    setNotFound(false);
    fetchPublicLeadBySlug(slug)
      .then(r => {
        if (!r) { setNotFound(true); return; }
        setLead(r.lead);
        setSimilar(r.similar);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    fetchDistricts().then(list => setDistricts(list.filter(d => !d.is_okrug))).catch(() => {});
  }, []);

  const openContact = () => {
    if (!lead) return;
    setForm({
      name: '',
      phone: '',
      message: `Хочу связаться по заявке #${lead.id}${lead.name ? ` (${lead.name})` : ''}`,
    });
    setSent(false);
    setCaptcha(null);
    setCaptchaKey(k => k + 1);
    setContactOpen(true);
  };

  const closeContact = () => { setContactOpen(false); setCaptcha(null); };

  const submitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead) return;
    if (!captcha?.passed) { toast.error('Пожалуйста, пройдите проверку «не робот»'); return; }
    setSending(true);
    try {
      await sendLead({
        name: form.name,
        phone: form.phone,
        message: form.message,
        source: 'lead-detail-page',
        object_url: typeof window !== 'undefined' ? window.location.href : '',
        captcha_token: captcha?.token,
      });
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-3xl animate-pulse">
        <div className="h-4 bg-muted rounded w-48 mb-4" />
        <div className="h-8 bg-muted rounded-xl w-3/4 mb-3" />
        <div className="h-40 bg-muted rounded-2xl" />
      </div>
    );
  }

  if (notFound || !lead) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <SeoHead title="Заявка не найдена" noindex />
        <div className="font-display font-700 text-xl mb-2">Заявка не найдена</div>
        <div className="text-sm text-muted-foreground mb-4">Возможно, она уже закрыта или снята с публикации.</div>
        <button onClick={() => navigate('/leads')} className="btn-blue text-white px-4 py-2 rounded-xl text-sm">
          Смотреть все заявки
        </button>
      </div>
    );
  }

  const typeLabel = lead.property_type === 'sale' ? 'Продажа' : lead.property_type === 'rent' ? 'Аренда' : '';
  const cat = lead.property_category || lead.request_category;
  const catLabel = cat ? CATEGORY_LABELS[cat] || cat : '';
  const districtNames = (lead.district_ids || [])
    .map(id => districts.find(d => d.id === id)?.name)
    .filter(Boolean) as string[];
  const budgetStr = fmtBudget(lead.budget, lead.budget_to);
  const areaStr = fmtArea(lead.area_from, lead.area_to);
  const isUpdated = lead.updated_at && lead.updated_at !== lead.created_at;
  const displayDate = fmtDate(isUpdated ? lead.updated_at! : lead.created_at);

  const titleParts = [typeLabel, catLabel, districtNames[0]].filter(Boolean);
  const h1 = titleParts.length > 0
    ? `${titleParts.join(' · ')} — заявка клиента`
    : `Заявка клиента №${lead.id}`;

  const seoTitle = `${h1} в Краснодаре`;
  const seoDescParts = [typeLabel, catLabel].filter(Boolean).join(' · ');
  const seoDesc = `${seoDescParts ? seoDescParts + '. ' : ''}${(lead.message || '').slice(0, 140)}`.slice(0, 160);

  const pageUrl = `${SITE_URL}/request/${lead.slug || slug}`;

  const breadcrumbSchema = makeBreadcrumbSchema([
    { name: 'Главная', url: `${SITE_URL}/` },
    { name: 'Заявки клиентов', url: `${SITE_URL}/leads` },
    { name: h1, url: pageUrl },
  ]);

  const serviceSchema = makeServiceSchema({
    name: h1,
    description: lead.message || undefined,
    url: pageUrl,
    providerName: 'Бизнес. Маркетинг. Недвижимость.',
    areaCity: 'Краснодар',
  });

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        path={`/request/${lead.slug || slug}`}
        title={seoTitle}
        description={seoDesc}
        h1={h1}
        ogImage={OG_IMAGE}
      />
      <SchemaOrg schema={breadcrumbSchema} id="lead-bc" />
      <SchemaOrg schema={serviceSchema} id="lead-service" />

      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="mb-3">
          <Breadcrumbs items={[
            { label: 'Главная', to: '/' },
            { label: 'Заявки клиентов', to: '/leads' },
            { label: h1 },
          ]} />
        </div>

        <h1 className="font-display font-900 text-2xl md:text-3xl text-foreground mb-4">{h1}</h1>

        <LeadCard lead={lead} districts={districts} onContact={openContact} disableLink />

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mt-5 text-sm text-muted-foreground leading-relaxed">
          <h2 className="font-semibold text-foreground text-[15px] mb-1">Есть подходящий объект?</h2>
          Свяжитесь с нами — мы передадим информацию автору заявки. Заявка {isUpdated ? 'обновлена' : 'добавлена'} {displayDate}.
          {budgetStr !== 'Договорная' && ` Бюджет: ${budgetStr}.`}
          {areaStr !== 'Не указана' && ` Площадь: ${areaStr}.`}
        </div>

        <button
          onClick={openContact}
          className="w-full sm:w-auto mt-4 btn-blue text-white px-6 py-3 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Icon name="Phone" size={15} />
          У меня есть подходящий объект
        </button>

        {similar.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display font-700 text-lg mb-3">Похожие заявки</h2>
            <ul className="flex flex-col gap-3 list-none p-0 m-0">
              {similar.map(s => (
                <li key={s.id}>
                  <Link
                    to={`/request/${s.slug}`}
                    className="block bg-white border border-border rounded-xl px-4 py-3 hover:border-brand-blue/40 hover:shadow-sm transition-all"
                  >
                    <div className="font-semibold text-sm text-foreground">
                      {(s.property_type === 'sale' ? 'Продажа' : 'Аренда')}
                      {s.property_category ? ` · ${CATEGORY_LABELS[s.property_category] || s.property_category}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.message}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8">
          <Link to="/leads" className="text-sm text-brand-blue hover:underline inline-flex items-center gap-1.5">
            <Icon name="ArrowLeft" size={14} />
            Смотреть все заявки клиентов
          </Link>
        </div>
      </div>

      {contactOpen && (
        <LeadContactModal
          lead={lead}
          form={form}
          sending={sending}
          sent={sent}
          captchaKey={captchaKey}
          onFormChange={setForm}
          onCaptcha={setCaptcha}
          onSubmit={submitContact}
          onClose={closeContact}
        />
      )}
    </div>
  );
}