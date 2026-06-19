import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import { getToken } from '@/lib/adminApi';

const ADMIN_URL   = 'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';
const TRACKER_URL = 'https://functions.poehali.dev/fcd92c6e-e089-41e3-93e9-5f05dcb73e47';

const UTM_SOURCES  = ['avito', 'cian', 'yandex', 'google', 'vk', 'telegram', 'email', 'sms', 'instagram'];
const UTM_MEDIUMS  = ['cpc', 'organic', 'social', 'email', 'referral', 'banner', 'sms'];
const UTM_CAMPAIGNS_PRESET = ['spring_2025', 'office_rent', 'building_sale', 'hot_objects', 'promo'];

const SOURCE_ICONS: Record<string, string> = {
  avito: '🟢', cian: '🔵', yandex: '🔴', google: '🟡',
  vk: '🔵', telegram: '🔷', email: '📧', sms: '💬', instagram: '🟣',
};

type Period = 'today' | '30' | '90' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: '30',    label: '30 дней' },
  { value: '90',    label: '90 дней' },
  { value: 'all',   label: 'Всё время' },
];

interface UtmLink {
  id: number;
  url: string;
  base_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  listing_id: number | null;
  listing_title: string | null;
  label: string | null;
  clicks_period: number;
  clicks_total: number;
  created_by_name: string | null;
  created_at: string | null;
}

interface SourceStat {
  utm_source: string;
  links_count: number;
  clicks_period: number;
  clicks_total: number;
}

interface Campaign { utm_campaign: string; clicks_period: number }
interface TimelinePoint { day: string; cnt: number }

function adminUrl(resource: string, qs: Record<string, string | number> = {}) {
  const p = new URLSearchParams({ resource, ...Object.fromEntries(Object.entries(qs).map(([k, v]) => [k, String(v)])) });
  p.set('auth_token', getToken());
  return `${ADMIN_URL}?${p}`;
}

function trackerUrl(qs: Record<string, string> = {}) {
  const p = new URLSearchParams({ ...qs, auth_token: getToken() });
  return `${TRACKER_URL}?${p}`;
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type View = 'builder' | 'history' | 'stats';

export default function UtmTab() {
  const { settings } = useSettings();
  const siteBase = settings.site_url?.replace(/\/$/, '') || '';

  // ── Конструктор ──
  const [base, setBase]         = useState(siteBase + '/');
  const [source, setSource]     = useState('avito');
  const [medium, setMedium]     = useState('cpc');
  const [campaign, setCampaign] = useState('');
  const [content, setContent]   = useState('');
  const [term, setTerm]         = useState('');
  const [label, setLabel]       = useState('');
  const [listingId, setListingId]     = useState('');
  const [listingTitle, setListingTitle] = useState('');
  const [listingLoading, setListingLoading] = useState(false);
  const [copied, setCopied]     = useState(false);
  const [saving, setSaving]     = useState(false);

  // ── Данные ──
  const [view, setView]     = useState<View>('builder');
  const [period, setPeriod] = useState<Period>('30');
  const [links, setLinks]   = useState<UtmLink[]>([]);
  const [sources, setSources]     = useState<SourceStat[]>([]);
  const [timeline, setTimeline]   = useState<TimelinePoint[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totalClicks, setTotalClicks] = useState(0);
  const [loadingData, setLoadingData] = useState(false);
  const [filterSource, setFilterSource] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // ── Построение URL ──
  const utmUrl = (() => {
    try {
      const url = new URL(base);
      if (source)   url.searchParams.set('utm_source', source);
      if (medium)   url.searchParams.set('utm_medium', medium);
      if (campaign) url.searchParams.set('utm_campaign', campaign);
      if (content)  url.searchParams.set('utm_content', content);
      if (term)     url.searchParams.set('utm_term', term);
      return url.toString();
    } catch { return base; }
  })();

  // ── Загрузить объект по ID ──
  const loadListing = useCallback(async () => {
    const raw = listingId.replace(/\D/g, '');
    if (!raw) return;
    setListingLoading(true);
    try {
      const r = await fetch(adminUrl('listings', { id: raw })).then(r => r.json());
      const obj = r.listing || r;
      if (obj?.id) {
        setListingTitle(obj.title || `Объект #${obj.id}`);
        const slug = obj.slug || obj.id;
        setBase(siteBase + '/listing/' + slug);
        if (!label) setLabel((obj.title || '').slice(0, 40));
      } else {
        toast.error('Объект не найден');
      }
    } catch { toast.error('Ошибка загрузки'); }
    finally { setListingLoading(false); }
  }, [listingId, siteBase, label]);

  // ── Загрузить статистику ──
  const loadStats = useCallback(async () => {
    setLoadingData(true);
    try {
      const r = await fetch(trackerUrl({ action: 'stats', period })).then(r => r.json());
      if (r.error) { toast.error(r.error); return; }
      setLinks(r.links ?? []);
      setSources(r.sources ?? []);
      setTimeline(r.timeline ?? []);
      setCampaigns(r.campaigns ?? []);
      setTotalClicks(r.total_clicks ?? 0);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoadingData(false); }
  }, [period]);

  useEffect(() => {
    if (view !== 'builder') loadStats();
  }, [view, period, loadStats]);

  // ── Скопировать и сохранить в БД ──
  const copyAndSave = async () => {
    try {
      await navigator.clipboard.writeText(utmUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Ссылка скопирована');
    } catch { toast.error('Не удалось скопировать'); return; }

    setSaving(true);
    try {
      const body = {
        url: utmUrl, base_url: base,
        utm_source: source, utm_medium: medium,
        utm_campaign: campaign, utm_content: content, utm_term: term,
        listing_id: listingId ? parseInt(listingId.replace(/\D/g, '')) || null : null,
        label: label || null,
      };
      const r = await fetch(adminUrl('utm_links'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json());
      if (!r.ok) throw new Error(r.error || 'Ошибка');
    } catch { /* тихо */ }
    finally { setSaving(false); }
  };

  // ── Зафиксировать клик ──
  const trackClick = async (link: UtmLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('Скопировано');
    } catch { toast.error('Не удалось скопировать'); return; }

    // Фиксируем клик
    fetch(TRACKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_id: link.id }),
    }).catch(() => {});
  };

  // ── Загрузить настройки в конструктор ──
  const loadIntoBuilder = (link: UtmLink) => {
    setBase(link.base_url);
    setSource(link.utm_source);
    setMedium(link.utm_medium);
    setCampaign(link.utm_campaign);
    setContent(link.utm_content);
    setTerm(link.utm_term);
    setLabel(link.label || '');
    setListingId(link.listing_id ? String(link.listing_id) : '');
    setListingTitle(link.listing_title || '');
    setView('builder');
    toast('Параметры загружены в конструктор');
  };

  const filteredLinks = filterSource
    ? links.filter(l => l.utm_source === filterSource)
    : links;
  const timelineMax = Math.max(...timeline.map(t => t.cnt), 1);
  const maxClicks   = Math.max(...sources.map(s => s.clicks_period), 1);

  // ── Период-переключатель ──
  function PeriodBar() {
    return (
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
        {PERIODS.map(p => (
          <button key={p.value} onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              period === p.value ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {p.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Шапка с переключателем вида */}
      <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
          {([
            { id: 'builder', icon: 'Link',     label: 'Конструктор' },
            { id: 'history', icon: 'History',  label: 'История' },
            { id: 'stats',   icon: 'BarChart3', label: 'Статистика' },
          ] as const).map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                view === v.id ? 'bg-brand-blue text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              <Icon name={v.icon} size={13} />
              {v.label}
            </button>
          ))}
        </div>

        {view !== 'builder' && (
          <>
            <PeriodBar />
            <button onClick={loadStats} disabled={loadingData}
              className="ml-auto text-xs px-3 py-2 border border-border rounded-xl hover:bg-muted/50 transition flex items-center gap-1.5">
              <Icon name={loadingData ? 'Loader2' : 'RefreshCw'} size={12} className={loadingData ? 'animate-spin' : ''} />
              Обновить
            </button>
          </>
        )}
      </div>

      {/* ════════ КОНСТРУКТОР ════════ */}
      {view === 'builder' && (
        <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Icon name="Link" size={18} className="text-brand-blue" />
            <h3 className="font-bold text-base">UTM-конструктор</h3>
          </div>

          {/* Привязка к объекту */}
          <div className="bg-muted/30 rounded-xl p-3 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Привязать к объекту (необязательно)</div>
            <div className="flex gap-2">
              <input value={listingId}
                onChange={e => { setListingId(e.target.value); setListingTitle(''); }}
                onKeyDown={e => e.key === 'Enter' && loadListing()}
                placeholder="ID объекта (#54)"
                className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
              <button onClick={loadListing} disabled={listingLoading || !listingId}
                className="px-3 py-2 border border-border rounded-xl text-sm hover:bg-muted/50 transition disabled:opacity-50 flex items-center gap-1.5">
                <Icon name={listingLoading ? 'Loader2' : 'Search'} size={13} className={listingLoading ? 'animate-spin' : ''} />
                Найти
              </button>
            </div>
            {listingTitle && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                <Icon name="CheckCircle2" size={12} />
                <span className="truncate font-medium">{listingTitle}</span>
              </div>
            )}
          </div>

          {/* Базовый URL */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Базовый URL</label>
            <input value={base} onChange={e => setBase(e.target.value)}
              placeholder={siteBase + '/'}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
          </div>

          {/* UTM параметры */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">utm_source *</label>
              <div className="flex gap-1 flex-wrap mb-1.5">
                {UTM_SOURCES.map(s => (
                  <button key={s} onClick={() => setSource(s)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition font-semibold ${
                      source === s ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted/50'
                    }`}>
                    {SOURCE_ICONS[s] || ''} {s}
                  </button>
                ))}
              </div>
              <input value={source} onChange={e => setSource(e.target.value)}
                placeholder="avito" className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">utm_medium *</label>
              <div className="flex gap-1 flex-wrap mb-1.5">
                {UTM_MEDIUMS.map(m => (
                  <button key={m} onClick={() => setMedium(m)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition font-semibold ${
                      medium === m ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted/50'
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
              <input value={medium} onChange={e => setMedium(e.target.value)}
                placeholder="cpc" className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">utm_campaign</label>
              <div className="flex gap-1 flex-wrap mb-1.5">
                {UTM_CAMPAIGNS_PRESET.map(c => (
                  <button key={c} onClick={() => setCampaign(c)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition font-semibold ${
                      campaign === c ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted/50'
                    }`}>
                    {c}
                  </button>
                ))}
              </div>
              <input value={campaign} onChange={e => setCampaign(e.target.value)}
                placeholder="название_кампании" className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">utm_content</label>
              <input value={content} onChange={e => setContent(e.target.value)}
                placeholder="баннер_1 / кнопка" className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">utm_term</label>
              <input value={term} onChange={e => setTerm(e.target.value)}
                placeholder="аренда офис" className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Название ссылки</label>
              <input value={label} onChange={e => setLabel(e.target.value)}
                placeholder="Авито — офисы май" className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
            </div>
          </div>

          {/* Превью */}
          <div className="bg-muted/30 rounded-xl p-3">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
              <Icon name="Eye" size={12} /> Готовая ссылка
            </div>
            <div className="text-xs break-all font-mono text-foreground/80 leading-relaxed select-all">{utmUrl}</div>
          </div>

          <div className="flex gap-2">
            <button onClick={copyAndSave} disabled={saving}
              className="flex-1 bg-brand-blue text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-brand-blue/90 transition disabled:opacity-60">
              <Icon name={copied ? 'Check' : saving ? 'Loader2' : 'Copy'} size={15} className={saving ? 'animate-spin' : ''} />
              {copied ? 'Скопировано!' : saving ? 'Сохраняю…' : 'Скопировать и сохранить'}
            </button>
            <button onClick={() => setView('history')}
              className="px-4 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/50 transition flex items-center gap-1.5">
              <Icon name="History" size={14} /> История
            </button>
          </div>
        </div>
      )}

      {/* ════════ ИСТОРИЯ ════════ */}
      {view === 'history' && (
        <div className="space-y-3">
          {/* Фильтр по источнику */}
          <div className="bg-white rounded-2xl border border-border p-3 flex gap-1 flex-wrap">
            <button onClick={() => setFilterSource('')}
              className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition ${
                filterSource === '' ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted/50'
              }`}>
              Все <span className="opacity-70">({links.length})</span>
            </button>
            {sources.map(s => (
              <button key={s.utm_source} onClick={() => setFilterSource(s.utm_source)}
                className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition ${
                  filterSource === s.utm_source ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted/50'
                }`}>
                {SOURCE_ICONS[s.utm_source] || ''} {s.utm_source}
                <span className="ml-1 opacity-70">({s.links_count})</span>
              </button>
            ))}
          </div>

          {/* Список */}
          {loadingData ? (
            <div className="flex justify-center py-12 text-muted-foreground gap-2">
              <Icon name="Loader2" size={18} className="animate-spin" /> Загрузка…
            </div>
          ) : filteredLinks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-border p-10 text-center text-muted-foreground">
              <Icon name="History" size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">История пуста — создайте первую UTM-ссылку</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLinks.map(link => (
                <div key={link.id} className="bg-white rounded-2xl border border-border p-4 hover:border-brand-blue/30 transition">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {link.label && <span className="font-semibold text-sm">{link.label}</span>}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
                          {SOURCE_ICONS[link.utm_source] || ''} {link.utm_source}
                        </span>
                        {link.utm_medium && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            {link.utm_medium}
                          </span>
                        )}
                        {link.utm_campaign && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            {link.utm_campaign}
                          </span>
                        )}
                      </div>

                      {link.listing_title && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Icon name="Building2" size={11} />
                          <span className="truncate">{link.listing_title}</span>
                        </div>
                      )}

                      <div className="text-[11px] font-mono text-muted-foreground/70 truncate mt-1">{link.url}</div>

                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1.5 flex-wrap">
                        {link.created_by_name && <span>{link.created_by_name}</span>}
                        <span>{fmtDate(link.created_at)}</span>
                        <span className="text-brand-blue font-semibold">
                          {link.clicks_period} кликов за период
                        </span>
                        {link.clicks_total > 0 && link.clicks_total !== link.clicks_period && (
                          <span className="text-muted-foreground">
                            ({link.clicks_total} всего)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => trackClick(link)}
                        title="Скопировать + зафиксировать клик"
                        className="p-2 rounded-lg hover:bg-muted/60 transition text-muted-foreground hover:text-brand-blue">
                        <Icon name={copiedId === link.id ? 'Check' : 'Copy'} size={14} />
                      </button>
                      <button onClick={() => loadIntoBuilder(link)}
                        title="Загрузить в конструктор"
                        className="p-2 rounded-lg hover:bg-muted/60 transition text-muted-foreground hover:text-brand-blue">
                        <Icon name="Pencil" size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════ СТАТИСТИКА ════════ */}
      {view === 'stats' && (
        <div className="space-y-4">

          {/* KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: 'MousePointerClick', label: 'Кликов за период', value: totalClicks, color: 'text-brand-blue bg-brand-blue/10' },
              { icon: 'Link',              label: 'Ссылок всего',      value: links.length, color: 'text-violet-600 bg-violet-100' },
              { icon: 'Globe',             label: 'Источников',        value: sources.length, color: 'text-emerald-600 bg-emerald-100' },
              { icon: 'Megaphone',         label: 'Кампаний',          value: campaigns.length, color: 'text-amber-600 bg-amber-100' },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-2xl border border-border p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${k.color}`}>
                  <Icon name={k.icon} size={18} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{loadingData ? '—' : k.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Динамика кликов по дням */}
          {timeline.length > 1 && (
            <div className="bg-white rounded-2xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <Icon name="TrendingUp" size={15} className="text-brand-blue" />
                <span className="font-semibold text-sm">Динамика кликов</span>
              </div>
              <div className="flex items-end gap-0.5 h-20">
                {timeline.map((t, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div
                      className="w-full bg-brand-blue/30 hover:bg-brand-blue rounded-t-sm transition-all"
                      style={{ height: `${Math.max(4, Math.round(t.cnt / timelineMax * 100))}%` }}
                    />
                    <div className="absolute bottom-full mb-1 text-[10px] bg-foreground text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                      {t.day.slice(5)}: {t.cnt}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{timeline[0]?.day?.slice(5)}</span>
                <span>{timeline[timeline.length - 1]?.day?.slice(5)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* По источникам */}
            <div className="bg-white rounded-2xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <Icon name="BarChart3" size={15} className="text-brand-blue" />
                <span className="font-semibold text-sm">По источникам</span>
              </div>
              {sources.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Нет данных</p>
              ) : (
                <div className="space-y-3">
                  {sources.map(s => (
                    <div key={s.utm_source} className="flex items-center gap-3">
                      <div className="w-20 text-sm font-medium shrink-0 flex items-center gap-1.5">
                        <span>{SOURCE_ICONS[s.utm_source] || '🔗'}</span>
                        <span className="truncate text-xs">{s.utm_source}</span>
                      </div>
                      <div className="flex-1 bg-muted/40 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-brand-blue transition-all"
                          style={{ width: `${maxClicks > 0 ? Math.round(s.clicks_period / maxClicks * 100) : 0}%` }}
                        />
                      </div>
                      <div className="text-right shrink-0 w-20 text-xs">
                        <span className="font-bold">{s.clicks_period}</span>
                        <span className="text-muted-foreground"> кл.</span>
                        <div className="text-[10px] text-muted-foreground">{s.links_count} ссылок</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Топ кампаний */}
            <div className="bg-white rounded-2xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <Icon name="Megaphone" size={15} className="text-brand-blue" />
                <span className="font-semibold text-sm">Топ кампаний</span>
              </div>
              {campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Нет данных</p>
              ) : (
                <div className="space-y-2">
                  {campaigns.map((c, i) => {
                    const maxC = Math.max(...campaigns.map(x => x.clicks_period), 1);
                    return (
                      <div key={c.utm_campaign} className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{c.utm_campaign}</div>
                          <div className="h-1.5 bg-muted/40 rounded-full mt-1">
                            <div className="h-1.5 rounded-full bg-amber-400 transition-all"
                              style={{ width: `${Math.round(c.clicks_period / maxC * 100)}%` }} />
                          </div>
                        </div>
                        <span className="text-xs font-bold shrink-0 text-brand-blue">{c.clicks_period}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Топ ссылок */}
          {links.some(l => l.clicks_period > 0) && (
            <div className="bg-white rounded-2xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <Icon name="MousePointerClick" size={15} className="text-brand-blue" />
                <span className="font-semibold text-sm">Топ ссылок за период</span>
              </div>
              <div className="space-y-2">
                {[...links].sort((a, b) => b.clicks_period - a.clicks_period)
                  .filter(l => l.clicks_period > 0).slice(0, 10)
                  .map((link, i) => (
                    <div key={link.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{link.label || link.url}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {SOURCE_ICONS[link.utm_source] || ''} {link.utm_source}
                          {link.utm_campaign ? ` · ${link.utm_campaign}` : ''}
                          {link.listing_title ? ` · ${link.listing_title}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-brand-blue">{link.clicks_period}</div>
                        <div className="text-[10px] text-muted-foreground">{link.clicks_total} всего</div>
                      </div>
                      <button onClick={() => trackClick(link)}
                        className="p-1.5 rounded-lg hover:bg-muted/60 transition text-muted-foreground hover:text-brand-blue shrink-0">
                        <Icon name={copiedId === link.id ? 'Check' : 'Copy'} size={13} />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
