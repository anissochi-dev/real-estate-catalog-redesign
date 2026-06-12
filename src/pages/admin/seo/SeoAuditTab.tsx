import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { AuditData, FixResult } from './seoAuditTypes';
import SeoAuditHeader from './SeoAuditHeader';
import SeoAuditScore from './SeoAuditScore';
import SeoFaqManager from './SeoFaqManager';

const SEO_AUDIT_URL = 'https://functions.poehali.dev/08a36654-5f5d-4ebb-8148-540529a369d3';
const AUTO_SEO_URL  = 'https://functions.poehali.dev/068e7fac-cea4-46c6-9ad2-a02f1f5e250d';
const FAQ_URL       = 'https://functions.poehali.dev/282b9c5f-29fa-41ea-bc42-0793bdf8950d';

export default function SeoAuditTab() {
  const { refreshToken } = useAuth();
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [fixErr, setFixErr] = useState('');
  const [fixingId, setFixingId] = useState<number | null>(null);
  const [fixedIds, setFixedIds] = useState<Set<number>>(new Set());
  const [fixingFaqId, setFixingFaqId] = useState<number | null>(null);
  const [fixedFaqIds, setFixedFaqIds] = useState<Set<number>>(new Set());
  const [faqUpdatedAt, setFaqUpdatedAt] = useState<Record<number, string>>({});
  const [faqSearch, setFaqSearch] = useState('');
  const [faqFilter, setFaqFilter] = useState<'all' | 'has' | 'missing'>('all');
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [regenProgress, setRegenProgress] = useState({ done: 0, total: 0 });

  const load = async () => {
    setLoading(true); setErr('');
    const tok = refreshToken();
    try {
      const r = await fetch(SEO_AUDIT_URL, { headers: { 'X-Auth-Token': tok || '' } });
      const d = await r.json();
      if (!r.ok || d.error) { setErr(d.error || `Ошибка ${r.status}`); return; }
      setData(d as AuditData);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const fixWithAI = async () => {
    setFixing(true); setFixErr(''); setFixResult(null);
    const tok = refreshToken();
    let processed = 0;
    let errors = 0;
    try {
      // 1. SEO-заголовки и описания
      const r = await fetch(AUTO_SEO_URL, {
        method: 'POST',
        headers: { 'X-Auth-Token': tok || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', limit: 30 }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { setFixErr(d.error || `Ошибка ${r.status}`); return; }
      processed += d.processed || 0;
      errors += d.errors || 0;

      // 2. FAQ для объектов без него
      const noFaqIds = (data?.top_problems || [])
        .filter(p => p.no_faq)
        .map(p => p.id);
      for (const id of noFaqIds) {
        try {
          const fr = await fetch(FAQ_URL, {
            method: 'POST',
            headers: { 'X-Auth-Token': tok || '', 'Content-Type': 'application/json' },
            body: JSON.stringify({ listing_id: id }),
          });
          const fd = await fr.json();
          if (fr.ok && !fd.error) {
            processed += 1;
            setFixedFaqIds(prev => new Set(prev).add(id));
          } else {
            errors += 1;
          }
        } catch { errors += 1; }
      }

      setFixResult({ processed, skipped: 0, errors });
      await load();
    } catch (e) {
      setFixErr(e instanceof Error ? e.message : 'Ошибка соединения');
    } finally {
      setFixing(false);
    }
  };

  const fixOne = async (id: number) => {
    setFixingId(id); setFixErr('');
    const tok = refreshToken();
    try {
      const r = await fetch(AUTO_SEO_URL, {
        method: 'POST',
        headers: { 'X-Auth-Token': tok || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', listing_id: id }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { setFixErr(d.error || `Ошибка ${r.status}`); return; }
      setFixedIds(prev => new Set(prev).add(id));
    } catch (e) {
      setFixErr(e instanceof Error ? e.message : 'Ошибка соединения');
    } finally {
      setFixingId(null);
    }
  };

  const fixOneFaq = async (id: number, force = false) => {
    setFixingFaqId(id); setFixErr('');
    const tok = refreshToken();
    try {
      const r = await fetch(FAQ_URL, {
        method: 'POST',
        headers: { 'X-Auth-Token': tok || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: id, force }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { setFixErr(d.error || `Ошибка ${r.status}`); return; }
      setFixedFaqIds(prev => new Set(prev).add(id));
      setFaqUpdatedAt(prev => ({ ...prev, [id]: new Date().toISOString() }));
    } catch (e) {
      setFixErr(e instanceof Error ? e.message : 'Ошибка соединения');
    } finally {
      setFixingFaqId(null);
    }
  };

  const regenerateAllFaq = async () => {
    setRegeneratingAll(true);
    const tok = refreshToken();
    const total = data?.total ?? 0;
    setRegenProgress({ done: 0, total });
    try {
      let remaining = total;
      while (remaining > 0) {
        const r = await fetch(FAQ_URL, {
          method: 'POST',
          headers: { 'X-Auth-Token': tok || '', 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'batch', limit: 5, auth_token: tok || '' }),
        });
        const d = await r.json();
        if (!r.ok || d.error) break;
        remaining = d.remaining ?? 0;
        const processed = d.processed ?? 0;
        if (processed === 0) break; // GPT недоступен или ничего не осталось
        setRegenProgress(prev => ({ done: prev.done + processed, total }));
        if (remaining === 0) break;
      }
    } catch { /* продолжаем */ }
    setRegeneratingAll(false);
    await load();
  };

  useEffect(() => { load(); }, []);

  const filteredFaqListings = useMemo(() => {
    if (!data?.all_listings) return [];
    return data.all_listings
      .filter(l => {
        const matchSearch = !faqSearch || l.title.toLowerCase().includes(faqSearch.toLowerCase()) || String(l.id).includes(faqSearch);
        const matchFilter = faqFilter === 'all' || (faqFilter === 'has' ? (l.has_faq || fixedFaqIds.has(l.id)) : (!l.has_faq && !fixedFaqIds.has(l.id)));
        return matchSearch && matchFilter;
      })
      .sort((a, b) => {
        const aUpdated = faqUpdatedAt[a.id];
        const bUpdated = faqUpdatedAt[b.id];
        if (aUpdated && !bUpdated) return 1;
        if (!aUpdated && bUpdated) return -1;
        if (aUpdated && bUpdated) return aUpdated.localeCompare(bUpdated);
        return 0;
      });
  }, [data?.all_listings, faqSearch, faqFilter, fixedFaqIds, faqUpdatedAt]);

  const missingSeo = data
    ? (data.total - (data.stats.has_seo_title || 0)) + (data.total - (data.stats.has_seo_desc || 0))
    : 0;
  const missingFaq = data ? (data.total - (data.stats.has_faq || 0)) : 0;
  const canFix = missingSeo > 0 || missingFaq > 0;

  return (
    <div className="space-y-4">
      <SeoAuditHeader
        loading={loading}
        fixing={fixing}
        fixErr={fixErr}
        fixResult={fixResult}
        canFix={canFix}
        missingSeo={missingSeo}
        missingFaq={missingFaq}
        onLoad={load}
        onFixWithAI={fixWithAI}
      />

      {err && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <Icon name="AlertCircle" size={16} /> {err}
        </div>
      )}

      {loading && !data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      )}

      {data && (
        <>
          <SeoAuditScore
            data={data}
            canFix={canFix}
            fixedIds={fixedIds}
            fixedFaqIds={fixedFaqIds}
            fixingId={fixingId}
            fixingFaqId={fixingFaqId}
            onFixOne={fixOne}
            onFixOneFaq={fixOneFaq}
          />

          {data.all_listings?.length > 0 && (
            <SeoFaqManager
              data={data}
              missingFaq={missingFaq}
              fixedFaqIds={fixedFaqIds}
              faqUpdatedAt={faqUpdatedAt}
              faqSearch={faqSearch}
              faqFilter={faqFilter}
              fixingFaqId={fixingFaqId}
              regeneratingAll={regeneratingAll}
              regenProgress={regenProgress}
              filteredFaqListings={filteredFaqListings}
              onSetFaqSearch={setFaqSearch}
              onSetFaqFilter={setFaqFilter}
              onFixOneFaq={fixOneFaq}
              onRegenerateAllFaq={regenerateAllFaq}
            />
          )}
        </>
      )}
    </div>
  );
}
