import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import Breadcrumbs from '@/components/Breadcrumbs';
import SmartCaptcha, { CaptchaResult } from '@/components/SmartCaptcha';
import { fetchPublicLeads, aiSearchLeads, sendLead, PublicLead } from '@/lib/api';
import { useSeoH1 } from '@/components/SeoHead';
import { useSettings } from '@/contexts/SettingsContext';
import PublicPhoneInput from '@/components/PublicPhoneInput';

function fmtBudget(b: number | null): string {
  if (!b) return 'не указан';
  if (b >= 1_000_000) return `${(b / 1_000_000).toFixed(1)} млн ₽`;
  if (b >= 1_000) return `${Math.round(b / 1_000)} тыс ₽`;
  return `${b} ₽`;
}

function fmtDate(s: string): string {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return s;
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  office: 'Офис',
  retail: 'Магазин',
  warehouse: 'Склад',
  restaurant: 'Кафе/Ресторан',
  hotel: 'Гостиница',
  business: 'Готовый бизнес',
  gab: 'ГАБ',
  production: 'Производство',
  land: 'Земля',
  building: 'Здание',
  free_purpose: 'Своб. назначения',
  car_service: 'Автосервис',
};

export default function LeadsListPage() {
  const h1 = useSeoH1('Заявки клиентов');
  const { settings } = useSettings();
  const PAGE_SIZE = settings.leads_page_size ?? 24;

  const [leads, setLeads] = useState<PublicLead[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  // ИИ-поиск (единственный фильтр на странице)
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiIds, setAiIds] = useState<number[] | null>(null);
  const [aiReasoning, setAiReasoning] = useState('');

  // Контактная форма + капча
  const [contactLead, setContactLead] = useState<PublicLead | null>(null);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', message: '' });
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaResult | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const load = (p: number = page) => {
    setLoading(true);
    setError('');
    fetchPublicLeads({
      page: p,
      limit: PAGE_SIZE,
      ids: aiIds || undefined,
      sort: 'newest',
    })
      .then(r => {
        setLeads(r.leads);
        setTotal(r.total);
        setPages(r.pages);
        setPage(r.page);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить заявки');
        setLeads([]);
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(1); }, [aiIds]);

  const runAiSearch = async () => {
    const q = aiQuery.trim();
    if (!q || aiLoading) return;
    setAiLoading(true);
    setError('');
    try {
      const r = await aiSearchLeads(q);
      if (!r.ids.length) {
        toast.info('ВБ ничего не нашёл по этому запросу — попробуйте переформулировать');
        setAiIds(null);
        setAiReasoning('');
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

  const resetAi = () => {
    setAiIds(null);
    setAiReasoning('');
    setAiQuery('');
  };

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

  const closeContact = () => {
    setContactLead(null);
    setCaptcha(null);
  };

  const submitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactLead) return;
    if (!captcha?.passed) {
      toast.error('Пожалуйста, пройдите проверку «не робот»');
      return;
    }
    setContactSending(true);
    try {
      await sendLead({
        name: contactForm.name,
        phone: contactForm.phone,
        message: contactForm.message,
        source: 'leads-page',
        object_url: typeof window !== 'undefined' ? window.location.href : '',
      });
      setContactSent(true);
    } finally {
      setContactSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-3">
          <Breadcrumbs items={[
            { label: 'Главная', to: '/' },
            { label: 'Заявки клиентов' },
          ]} />
        </div>

        <h1 className="font-display font-900 text-2xl md:text-3xl text-foreground mb-2">{h1}</h1>
        <p className="text-sm text-muted-foreground mb-5">
          Что ищут другие посетители — может быть, вам подойдёт похожая идея, или вы готовы стать арендатором.
        </p>

        {/* ИИ-поиск ВБ — единственный поиск на странице */}
        <div className="bg-gradient-to-br from-brand-blue/5 to-brand-orange/5 border border-brand-blue/15 rounded-2xl p-4 sm:p-5 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-orange to-rose-500 flex items-center justify-center">
              <Icon name="Sparkles" size={16} className="text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm">ИИ-поиск Виртуального брокера</div>
              <div className="text-[11px] text-muted-foreground">Опишите задачу — ВБ найдёт похожие заявки</div>
            </div>
          </div>
          <form
            onSubmit={e => { e.preventDefault(); runAiSearch(); }}
            className="flex flex-col sm:flex-row gap-2"
          >
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
                {aiReasoning ? <><b>ВБ:</b> {aiReasoning}</> : `Найдено ${aiIds.length} заявок по ИИ-поиску`}
              </div>
              <button
                onClick={resetAi}
                className="text-brand-blue hover:underline shrink-0 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <Icon name="X" size={11} /> Показать все
              </button>
            </div>
          )}
        </div>

        {/* Счётчик */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 px-1">
          <span>
            Всего заявок: <b className="text-foreground">{total}</b>
            {aiIds && <span className="ml-2 text-brand-blue">· ИИ-выборка</span>}
          </span>
          <span className="hidden sm:inline">Сначала недавно отредактированные</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4 flex items-center gap-2">
            <Icon name="AlertCircle" size={15} />
            {error}
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
              {leads.map(lead => (
                <article
                  key={lead.id}
                  className="bg-white border border-border rounded-2xl overflow-hidden flex flex-row md:flex-col hover:shadow-lg hover:border-brand-blue/20 md:hover:-translate-y-1 transition-all duration-200 group"
                >
                  {/* Десктоп: декоративный блок сверху (как у новостей) */}
                  <div className="hidden md:flex relative h-36 bg-gradient-to-br from-brand-blue/10 to-brand-orange/10 shrink-0 items-center justify-center overflow-hidden">
                    <div className="text-center px-4">
                      <div className="text-4xl font-display font-900 text-brand-blue/20 leading-none mb-1">
                        {fmtBudget(lead.budget)}
                      </div>
                      <div className="text-xs text-muted-foreground">бюджет заявки</div>
                    </div>
                    {lead.request_category && (
                      <div className="absolute top-3 left-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-blue text-white">
                          {CATEGORY_LABELS[lead.request_category] || lead.request_category}
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-3 right-3 text-[10px] text-muted-foreground">
                      {fmtDate(lead.created_at)}
                    </div>
                  </div>

                  {/* Мобильный: цветная полоска слева */}
                  <div className="md:hidden w-1.5 shrink-0 bg-gradient-to-b from-brand-blue to-brand-orange rounded-l-2xl" />

                  {/* Контент */}
                  <div className="flex flex-col gap-1.5 p-4 sm:p-5 flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-foreground truncate group-hover:text-brand-blue transition-colors">
                          {lead.name || `Клиент #${lead.id}`}
                        </div>
                        {lead.company && (
                          <div className="text-xs text-muted-foreground truncate">{lead.company}</div>
                        )}
                      </div>
                      {/* Дата — только на мобильном (на десктопе она в шапке карточки) */}
                      <span className="md:hidden text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {fmtDate(lead.created_at)}
                      </span>
                    </div>

                    {/* Категория — только на мобильном */}
                    {lead.request_category && (
                      <div className="md:hidden inline-flex items-center gap-1 self-start text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
                        {CATEGORY_LABELS[lead.request_category] || lead.request_category}
                      </div>
                    )}

                    {lead.message && (
                      <p className="text-sm text-foreground/85 leading-relaxed line-clamp-3">
                        {lead.message}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-border/60">
                      {/* Бюджет — только на мобильном */}
                      <div className="md:hidden text-xs">
                        <span className="text-muted-foreground">Бюджет:</span>{' '}
                        <span className="font-semibold text-foreground">{fmtBudget(lead.budget)}</span>
                      </div>
                      <div className="hidden md:block" />
                      <button
                        onClick={() => openContact(lead)}
                        className="btn-orange text-white text-xs font-bold font-display px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
                      >
                        Связаться <Icon name="ArrowRight" size={11} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Пагинация */}
            {pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
                <button
                  onClick={() => load(Math.max(1, page - 1))}
                  disabled={page === 1 || loading}
                  className="px-3 py-2 rounded-lg border hover:bg-muted text-sm disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                >
                  <Icon name="ChevronLeft" size={14} /> Назад
                </button>
                <span className="text-sm text-muted-foreground px-3">
                  Стр. <b className="text-foreground">{page}</b> из {pages}
                </span>
                <button
                  onClick={() => load(Math.min(pages, page + 1))}
                  disabled={page >= pages || loading}
                  className="px-3 py-2 rounded-lg border hover:bg-muted text-sm disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                >
                  Вперёд <Icon name="ChevronRight" size={14} />
                </button>
              </div>
            )}
          </>
        )}
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
                <div className="text-sm text-muted-foreground mb-4">
                  Мы свяжемся с вами в ближайшее время.
                </div>
                <button
                  onClick={closeContact}
                  className="btn-blue text-white px-5 py-2 rounded-xl font-semibold text-sm"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <form onSubmit={submitContact} className="p-4 sm:p-5 space-y-3">
                <div className="bg-muted/40 rounded-xl p-3 text-xs">
                  <div className="font-semibold mb-1">Заявка #{contactLead.id}</div>
                  <div className="text-muted-foreground whitespace-pre-wrap break-words">
                    {(contactLead.message || '').slice(0, 200)}
                    {(contactLead.message || '').length > 200 ? '…' : ''}
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
                    required
                    value={contactForm.phone}
                    onChange={v => setContactForm({ ...contactForm, phone: v })}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Сообщение</label>
                  <textarea
                    rows={3}
                    value={contactForm.message}
                    onChange={e => setContactForm({ ...contactForm, message: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
                  />
                </div>

                {/* Капча — обязательна */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">
                    Проверка «не робот» *
                  </label>
                  <SmartCaptcha key={captchaKey} fieldCount={3} onVerify={setCaptcha} />
                </div>

                <button
                  type="submit"
                  disabled={contactSending || !contactForm.name || !contactForm.phone || !captcha?.passed}
                  className="w-full btn-blue text-white py-3 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {contactSending && <Icon name="Loader2" size={14} className="animate-spin" />}
                  {contactSending ? 'Отправка…' : 'Отправить'}
                </button>
                {!captcha?.passed && (
                  <div className="text-[11px] text-amber-600 text-center inline-flex items-center justify-center gap-1 w-full">
                    <Icon name="AlertTriangle" size={11} />
                    Пройдите проверку «не робот» чтобы отправить
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground text-center">
                  Нажимая «Отправить», вы соглашаетесь на обработку персональных данных.
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}