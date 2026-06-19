import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import {
  ADMIN_URL, UTM_SOURCES, UTM_MEDIUMS, UTM_CAMPAIGNS_PRESET, SOURCE_ICONS,
  adminUrl,
} from './utmTypes';

interface Props {
  siteBase: string;
  base: string;          setBase: (v: string) => void;
  source: string;        setSource: (v: string) => void;
  medium: string;        setMedium: (v: string) => void;
  campaign: string;      setCampaign: (v: string) => void;
  content: string;       setContent: (v: string) => void;
  term: string;          setTerm: (v: string) => void;
  label: string;         setLabel: (v: string) => void;
  listingId: string;     setListingId: (v: string) => void;
  listingTitle: string;  setListingTitle: (v: string) => void;
  listingLoading: boolean; setListingLoading: (v: boolean) => void;
  copied: boolean;       setCopied: (v: boolean) => void;
  saving: boolean;       setSaving: (v: boolean) => void;
  utmUrl: string;
  onGoHistory: () => void;
}

export default function UtmBuilder({
  siteBase,
  base, setBase,
  source, setSource,
  medium, setMedium,
  campaign, setCampaign,
  content, setContent,
  term, setTerm,
  label, setLabel,
  listingId, setListingId,
  listingTitle, setListingTitle,
  listingLoading, setListingLoading,
  copied, setCopied,
  saving, setSaving,
  utmUrl,
  onGoHistory,
}: Props) {

  const loadListing = async () => {
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
  };

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

  return (
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
        <button onClick={onGoHistory}
          className="px-4 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/50 transition flex items-center gap-1.5">
          <Icon name="History" size={14} /> История
        </button>
      </div>
    </div>
  );
}
