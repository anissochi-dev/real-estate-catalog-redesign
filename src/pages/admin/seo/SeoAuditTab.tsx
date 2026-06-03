import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';

const SEO_AUDIT_URL = 'https://functions.poehali.dev/08a36654-5f5d-4ebb-8148-540529a369d3';
const AUTO_SEO_URL  = 'https://functions.poehali.dev/068e7fac-cea4-46c6-9ad2-a02f1f5e250d';

const SEVERITY_STYLES: Record<string, string> = {
  error:   'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info:    'bg-blue-50 border-blue-200 text-blue-700',
};
const SEVERITY_ICONS: Record<string, string> = {
  error: 'XCircle', warning: 'AlertTriangle', info: 'Info',
};

interface AuditData {
  score: number;
  total: number;
  stats: Record<string, number>;
  issues: { key: string; message: string; fill_pct: number; severity: string }[];
  top_problems: { id: number; title: string; category: string; no_seo_title: boolean; no_seo_desc: boolean; short_desc: boolean; no_image: boolean }[];
}

interface FixResult {
  processed: number;
  skipped: number;
  errors: number;
  results?: { id: number; status: string; seo_title?: string; error?: string }[];
}

export default function SeoAuditTab() {
  const { refreshToken } = useAuth();
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [fixErr, setFixErr] = useState('');

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
    try {
      const r = await fetch(AUTO_SEO_URL, {
        method: 'POST',
        headers: { 'X-Auth-Token': tok || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', limit: 30 }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { setFixErr(d.error || `Ошибка ${r.status}`); return; }
      setFixResult(d as FixResult);
      await load();
    } catch (e) {
      setFixErr(e instanceof Error ? e.message : 'Ошибка соединения');
    } finally {
      setFixing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const scoreColor = !data ? '' : data.score >= 80 ? 'text-emerald-600' : data.score >= 50 ? 'text-amber-600' : 'text-red-600';
  const scoreBg   = !data ? '' : data.score >= 80 ? 'bg-emerald-50 border-emerald-200' : data.score >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  const missingSeo = data
    ? (data.total - (data.stats.has_seo_title || 0)) + (data.total - (data.stats.has_seo_desc || 0))
    : 0;
  const canFix = missingSeo > 0;

  return (
    <div className="space-y-4">
      {/* Заголовок + кнопки */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-700 text-lg">SEO-аудит объектов</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Анализ заполненности SEO-полей по всем активным объектам</p>
        </div>
        <div className="flex items-center gap-2">
          {canFix && (
            <button onClick={fixWithAI} disabled={fixing || loading}
              className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors">
              <Icon name={fixing ? 'Loader2' : 'Wand2'} size={15} className={fixing ? 'animate-spin' : ''} />
              {fixing ? 'Генерирую SEO...' : 'Исправить через ИИ'}
            </button>
          )}
          <button onClick={load} disabled={loading}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
            <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={15} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Загрузка...' : 'Обновить'}
          </button>
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <Icon name="AlertCircle" size={16} /> {err}
        </div>
      )}

      {/* Результат авто-исправления */}
      {fixing && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4 flex items-center gap-3 text-sm text-violet-700">
          <Icon name="Loader2" size={18} className="animate-spin shrink-0" />
          <div>
            <div className="font-semibold">ИИ генерирует SEO-тексты...</div>
            <div className="text-violet-500 mt-0.5">Это может занять до 1 минуты</div>
          </div>
        </div>
      )}

      {fixErr && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <Icon name="AlertCircle" size={16} /> {fixErr}
        </div>
      )}

      {fixResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-2">
            <Icon name="CheckCircle2" size={18} />
            ИИ успешно заполнил SEO-поля
          </div>
          <div className="flex gap-4 text-sm text-emerald-600">
            <span>Обработано: <strong>{fixResult.processed}</strong></span>
            <span>Пропущено: <strong>{fixResult.skipped}</strong></span>
            {fixResult.errors > 0 && <span className="text-amber-600">Ошибок: <strong>{fixResult.errors}</strong></span>}
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      )}

      {data && (
        <>
          {/* Общий score */}
          <div className={`rounded-2xl border p-5 flex items-center gap-5 ${scoreBg}`}>
            <div className={`text-5xl font-black font-display leading-none ${scoreColor}`}>{data.score}</div>
            <div>
              <div className="font-display font-700 text-lg">SEO-оценка</div>
              <div className="text-sm text-muted-foreground">из 100 баллов · {data.total} активных объектов</div>
              <div className="mt-2 w-48 h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${data.score >= 80 ? 'bg-emerald-500' : data.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${data.score}%` }} />
              </div>
            </div>
          </div>

          {/* Статистика заполненности */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <h3 className="font-display font-700 text-base mb-4">Заполненность полей</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'SEO-заголовок', key: 'has_seo_title', icon: 'Type' },
                { label: 'SEO-описание',  key: 'has_seo_desc',  icon: 'AlignLeft' },
                { label: 'Описание',      key: 'has_desc',      icon: 'FileText' },
                { label: 'Фото',          key: 'has_image',     icon: 'Image' },
                { label: 'Адрес',         key: 'has_address',   icon: 'MapPin' },
                { label: 'Координаты',    key: 'has_coords',    icon: 'Navigation' },
                { label: 'FAQ',           key: 'has_faq',       icon: 'HelpCircle' },
              ].map(({ label, key, icon }) => {
                const n = data.stats[key] || 0;
                const pct = data.total > 0 ? Math.round(n / data.total * 100) : 0;
                const fill = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
                return (
                  <div key={key} className="border border-border rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon name={icon} size={13} className="text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">{label}</span>
                    </div>
                    <div className="flex items-end gap-1">
                      <span className="font-display font-700 text-xl leading-none">{pct}%</span>
                      <span className="text-xs text-muted-foreground mb-0.5">{n}/{data.total}</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Проблемы */}
          {data.issues.length > 0 && (
            <div className="bg-white rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-700 text-base">Найденные проблемы</h3>
                {canFix && (
                  <span className="text-xs text-violet-600 bg-violet-50 border border-violet-200 px-2 py-1 rounded-lg">
                    SEO-заголовки и описания можно исправить через ИИ
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {data.issues.map(issue => (
                  <div key={issue.key} className={`flex items-center gap-3 border rounded-xl px-4 py-3 text-sm ${SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.info}`}>
                    <Icon name={SEVERITY_ICONS[issue.severity] || 'Info'} size={16} className="shrink-0" />
                    <div className="flex-1">{issue.message}</div>
                    <span className="text-xs font-semibold shrink-0">{issue.fill_pct}% заполнено</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Объекты требующие внимания */}
          {data.top_problems.length > 0 && (
            <div className="bg-white rounded-2xl border border-border p-5">
              <h3 className="font-display font-700 text-base mb-3">Объекты требуют внимания</h3>
              <div className="space-y-2">
                {data.top_problems.map(p => (
                  <div key={p.id} className="flex items-center gap-3 border border-border rounded-xl px-4 py-3 hover:bg-muted/30 transition-colors">
                    <span className="text-xs font-mono text-muted-foreground shrink-0">#{p.id}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{p.title}</div>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {p.no_seo_title && <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded">Нет SEO-заголовка</span>}
                        {p.no_seo_desc  && <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded">Нет SEO-описания</span>}
                        {p.short_desc   && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded">Короткое описание</span>}
                        {p.no_image     && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded">Нет фото</span>}
                      </div>
                    </div>
                    <a href={`/admin#listings-${p.id}`} className="text-xs text-brand-blue hover:underline shrink-0">Открыть</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.issues.length === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
              <Icon name="CheckCircle2" size={32} className="text-emerald-500 mx-auto mb-2" />
              <div className="font-display font-700 text-lg text-emerald-700">Всё отлично!</div>
              <div className="text-sm text-emerald-600 mt-1">SEO-проблем не найдено</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
