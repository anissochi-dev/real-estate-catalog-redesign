import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import {
  View, Period, PERIODS, UtmLink, SourceStat, Campaign, TimelinePoint,
  trackerUrl,
} from './utm/utmTypes';
import UtmBuilder from './utm/UtmBuilder';
import UtmHistory from './utm/UtmHistory';
import UtmStats from './utm/UtmStats';

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
  const [listingId, setListingId]       = useState('');
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

  // ── Загрузить настройки в конструктор из истории ──
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

  return (
    <div className="space-y-4">

      {/* Шапка с переключателем вида */}
      <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
          {([
            { id: 'builder', icon: 'Link',      label: 'Конструктор' },
            { id: 'history', icon: 'History',   label: 'История' },
            { id: 'stats',   icon: 'BarChart3',  label: 'Статистика' },
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
            <button onClick={loadStats} disabled={loadingData}
              className="ml-auto text-xs px-3 py-2 border border-border rounded-xl hover:bg-muted/50 transition flex items-center gap-1.5">
              <Icon name={loadingData ? 'Loader2' : 'RefreshCw'} size={12} className={loadingData ? 'animate-spin' : ''} />
              Обновить
            </button>
          </>
        )}
      </div>

      {view === 'builder' && (
        <UtmBuilder
          siteBase={siteBase}
          base={base}           setBase={setBase}
          source={source}       setSource={setSource}
          medium={medium}       setMedium={setMedium}
          campaign={campaign}   setCampaign={setCampaign}
          content={content}     setContent={setContent}
          term={term}           setTerm={setTerm}
          label={label}         setLabel={setLabel}
          listingId={listingId}         setListingId={setListingId}
          listingTitle={listingTitle}   setListingTitle={setListingTitle}
          listingLoading={listingLoading} setListingLoading={setListingLoading}
          copied={copied}       setCopied={setCopied}
          saving={saving}       setSaving={setSaving}
          utmUrl={utmUrl}
          onGoHistory={() => setView('history')}
        />
      )}

      {view === 'history' && (
        <UtmHistory
          links={links}
          sources={sources}
          loadingData={loadingData}
          filterSource={filterSource}
          setFilterSource={setFilterSource}
          copiedId={copiedId}
          setCopiedId={setCopiedId}
          onLoadIntoBuilder={loadIntoBuilder}
        />
      )}

      {view === 'stats' && (
        <UtmStats
          links={links}
          sources={sources}
          timeline={timeline}
          campaigns={campaigns}
          totalClicks={totalClicks}
          loadingData={loadingData}
          copiedId={copiedId}
          setCopiedId={setCopiedId}
        />
      )}

    </div>
  );
}
