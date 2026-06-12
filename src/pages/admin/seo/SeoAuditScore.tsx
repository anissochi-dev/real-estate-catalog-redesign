import Icon from '@/components/ui/icon';
import { AuditData } from './seoAuditTypes';

const SEVERITY_STYLES: Record<string, string> = {
  error:   'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info:    'bg-blue-50 border-blue-200 text-blue-700',
};
const SEVERITY_ICONS: Record<string, string> = {
  error: 'XCircle', warning: 'AlertTriangle', info: 'Info',
};

interface Props {
  data: AuditData;
  canFix: boolean;
  fixedIds: Set<number>;
  fixedFaqIds: Set<number>;
  fixingId: number | null;
  fixingFaqId: number | null;
  onFixOne: (id: number) => void;
  onFixOneFaq: (id: number) => void;
}

export default function SeoAuditScore({
  data, canFix, fixedIds, fixedFaqIds,
  fixingId, fixingFaqId, onFixOne, onFixOneFaq,
}: Props) {
  const scoreColor = data.score >= 80 ? 'text-emerald-600' : data.score >= 50 ? 'text-amber-600' : 'text-red-600';
  const scoreBg   = data.score >= 80 ? 'bg-emerald-50 border-emerald-200' : data.score >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  return (
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
              <div key={p.id} className={`flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors ${fixedIds.has(p.id) ? 'bg-emerald-50 border-emerald-200' : 'border-border hover:bg-muted/30'}`}>
                <span className="text-xs font-mono text-muted-foreground shrink-0">#{p.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{p.title}</div>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {fixedIds.has(p.id)
                      ? <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded">SEO заполнен ИИ</span>
                      : <>
                          {p.no_seo_title && <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded">Нет SEO-заголовка</span>}
                          {p.no_seo_desc  && <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded">Нет SEO-описания</span>}
                          {p.short_desc   && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded">Короткое описание</span>}
                          {p.no_image     && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded">Нет фото</span>}
                          {p.no_faq && !fixedFaqIds.has(p.id) && <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded">Нет FAQ</span>}
                          {fixedFaqIds.has(p.id) && <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded">FAQ готов</span>}
                        </>
                    }
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(p.no_seo_title || p.no_seo_desc) && !fixedIds.has(p.id) && (
                    <button
                      onClick={() => onFixOne(p.id)}
                      disabled={fixingId === p.id}
                      className="text-[11px] bg-violet-600 hover:bg-violet-700 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors"
                    >
                      <Icon name={fixingId === p.id ? 'Loader2' : 'Wand2'} size={11} className={fixingId === p.id ? 'animate-spin' : ''} />
                      {fixingId === p.id ? 'SEO...' : 'SEO'}
                    </button>
                  )}
                  {p.no_faq && !fixedFaqIds.has(p.id) && (
                    <button
                      onClick={() => onFixOneFaq(p.id)}
                      disabled={fixingFaqId === p.id}
                      className="text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors"
                    >
                      <Icon name={fixingFaqId === p.id ? 'Loader2' : 'HelpCircle'} size={11} className={fixingFaqId === p.id ? 'animate-spin' : ''} />
                      {fixingFaqId === p.id ? 'FAQ...' : 'FAQ'}
                    </button>
                  )}
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('admin:open-listing', { detail: p.id }))}
                    className="text-xs text-brand-blue hover:underline"
                  >Открыть</button>
                </div>
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
  );
}
