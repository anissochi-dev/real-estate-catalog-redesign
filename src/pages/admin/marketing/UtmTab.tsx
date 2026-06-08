import { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';

// ── Вкладка: UTM-конструктор ───────────────────────────────────────────────────

const UTM_SOURCES = ['avito', 'cian', 'yandex', 'google', 'vk', 'telegram', 'email', 'sms'];
const UTM_MEDIUMS = ['cpc', 'organic', 'social', 'email', 'referral', 'banner'];
const UTM_CAMPAIGNS_PRESET = ['spring_2025', 'office_rent', 'building_sale', 'hot_objects', 'promo'];

export default function UtmTab() {
  const { settings } = useSettings();
  const [base, setBase] = useState(() => settings.site_url?.replace(/\/$/, '') + '/' || 'https://bmn.su/');
  const [source, setSource] = useState('avito');
  const [medium, setMedium] = useState('cpc');
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');
  const [term, setTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('utm_history') || '[]'); } catch { return []; }
  });

  const utmUrl = (() => {
    try {
      const url = new URL(base);
      if (source) url.searchParams.set('utm_source', source);
      if (medium) url.searchParams.set('utm_medium', medium);
      if (campaign) url.searchParams.set('utm_campaign', campaign);
      if (content) url.searchParams.set('utm_content', content);
      if (term) url.searchParams.set('utm_term', term);
      return url.toString();
    } catch { return base; }
  })();

  const copy = () => {
    navigator.clipboard.writeText(utmUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      const next = [utmUrl, ...history.filter(h => h !== utmUrl)].slice(0, 10);
      setHistory(next);
      try { localStorage.setItem('utm_history', JSON.stringify(next)); } catch { /* */ }
      toast.success('Ссылка скопирована');
    });
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Icon name="Link" size={18} className="text-brand-blue" /> UTM-конструктор ссылок
        </h3>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Базовый URL</label>
          <input value={base} onChange={e => setBase(e.target.value)}
            placeholder="https://bmn.su/listing/123"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">utm_source *</label>
            <div className="flex gap-1 flex-wrap mb-1">
              {UTM_SOURCES.map(s => (
                <button key={s} type="button" onClick={() => setSource(s)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition ${source === s ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted/50'}`}>
                  {s}
                </button>
              ))}
            </div>
            <input value={source} onChange={e => setSource(e.target.value)}
              placeholder="avito" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">utm_medium *</label>
            <div className="flex gap-1 flex-wrap mb-1">
              {UTM_MEDIUMS.map(m => (
                <button key={m} type="button" onClick={() => setMedium(m)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition ${medium === m ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted/50'}`}>
                  {m}
                </button>
              ))}
            </div>
            <input value={medium} onChange={e => setMedium(e.target.value)}
              placeholder="cpc" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">utm_campaign</label>
            <div className="flex gap-1 flex-wrap mb-1">
              {UTM_CAMPAIGNS_PRESET.map(c => (
                <button key={c} type="button" onClick={() => setCampaign(c)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition ${campaign === c ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted/50'}`}>
                  {c}
                </button>
              ))}
            </div>
            <input value={campaign} onChange={e => setCampaign(e.target.value)}
              placeholder="название_кампании" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">utm_content</label>
            <input value={content} onChange={e => setContent(e.target.value)}
              placeholder="баннер_1 / кнопка" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">utm_term</label>
            <input value={term} onChange={e => setTerm(e.target.value)}
              placeholder="аренда офис краснодар" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Результат */}
        <div className="bg-muted/30 rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-1">Готовая ссылка</div>
          <div className="text-sm break-all font-mono text-foreground/80 leading-relaxed">{utmUrl}</div>
        </div>

        <button onClick={copy}
          className="w-full bg-brand-blue text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
          <Icon name={copied ? 'Check' : 'Copy'} size={15} />
          {copied ? 'Скопировано!' : 'Скопировать ссылку'}
        </button>
      </div>

      {/* История */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">История ссылок</h4>
            <button onClick={() => { setHistory([]); localStorage.removeItem('utm_history'); }}
              className="text-xs text-muted-foreground hover:text-red-500 transition">Очистить</button>
          </div>
          <div className="space-y-1.5">
            {history.map((url, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate font-mono text-muted-foreground">{url}</span>
                <button onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Скопировано'))}
                  className="flex-shrink-0 text-brand-blue hover:underline">копировать</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}