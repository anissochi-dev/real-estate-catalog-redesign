import Icon from '@/components/ui/icon';
import { UtmLink, SourceStat, SOURCE_ICONS, TRACKER_URL, fmtDate } from './utmTypes';
import { toast } from 'sonner';

interface Props {
  links: UtmLink[];
  sources: SourceStat[];
  loadingData: boolean;
  filterSource: string;
  setFilterSource: (v: string) => void;
  copiedId: number | null;
  setCopiedId: (v: number | null) => void;
  onLoadIntoBuilder: (link: UtmLink) => void;
}

export default function UtmHistory({
  links, sources, loadingData,
  filterSource, setFilterSource,
  copiedId, setCopiedId,
  onLoadIntoBuilder,
}: Props) {

  const filteredLinks = filterSource
    ? links.filter(l => l.utm_source === filterSource)
    : links;

  const trackClick = async (link: UtmLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('Скопировано');
    } catch { toast.error('Не удалось скопировать'); return; }

    fetch(TRACKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_id: link.id }),
    }).catch(() => {});
  };

  return (
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
                  <button onClick={() => onLoadIntoBuilder(link)}
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
  );
}
