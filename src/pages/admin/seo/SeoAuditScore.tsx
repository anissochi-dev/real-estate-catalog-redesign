import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { AuditData } from './seoAuditTypes';
import { adminApi } from '@/lib/adminApi';

const SEVERITY_STYLES: Record<string, string> = {
  error:   'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info:    'bg-blue-50 border-blue-200 text-blue-700',
};
const SEVERITY_ICONS: Record<string, string> = {
  error: 'XCircle', warning: 'AlertTriangle', info: 'Info',
};

type FieldFilter = 'seo_title' | 'seo_desc' | 'desc' | 'faq' | null;

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

interface EditState {
  seo_title: string;
  seo_desc: string;
  description: string;
  saving: boolean;
  saved: boolean;
}

const FIELD_CARDS = [
  { label: 'SEO-заголовок', key: 'has_seo_title', icon: 'Type',        filter: 'seo_title' as FieldFilter },
  { label: 'SEO-описание',  key: 'has_seo_desc',  icon: 'AlignLeft',   filter: 'seo_desc'  as FieldFilter },
  { label: 'Описание',      key: 'has_desc',      icon: 'FileText',    filter: 'desc'      as FieldFilter },
  { label: 'Фото',          key: 'has_image',     icon: 'Image',       filter: null },
  { label: 'Адрес',         key: 'has_address',   icon: 'MapPin',      filter: null },
  { label: 'Координаты',    key: 'has_coords',    icon: 'Navigation',  filter: null },
  { label: 'FAQ',           key: 'has_faq',       icon: 'HelpCircle',  filter: 'faq'       as FieldFilter },
];

export default function SeoAuditScore({
  data, canFix, fixedIds, fixedFaqIds,
  fixingId, fixingFaqId, onFixOne, onFixOneFaq,
}: Props) {
  const scoreColor = data.score >= 80 ? 'text-emerald-600' : data.score >= 50 ? 'text-amber-600' : 'text-red-600';
  const scoreBg   = data.score >= 80 ? 'bg-emerald-50 border-emerald-200' : data.score >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  const [activeFilter, setActiveFilter] = useState<FieldFilter>(null);
  const [editing, setEditing] = useState<Record<number, EditState>>({});

  const toggleFilter = (filter: FieldFilter) => {
    setActiveFilter(prev => prev === filter ? null : filter);
  };

  const filteredProblems = data.top_problems.filter(p => {
    if (!activeFilter) return true;
    if (activeFilter === 'seo_title') return p.no_seo_title;
    if (activeFilter === 'seo_desc')  return p.no_seo_desc;
    if (activeFilter === 'desc')      return p.short_desc;
    if (activeFilter === 'faq')       return p.no_faq && !fixedFaqIds.has(p.id);
    return true;
  });

  const openEdit = (id: number, p: typeof data.top_problems[0]) => {
    setEditing(prev => ({
      ...prev,
      [id]: prev[id] ?? { seo_title: '', seo_desc: '', description: '', saving: false, saved: false },
    }));
  };

  const closeEdit = (id: number) => {
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const saveEdit = async (id: number) => {
    const e = editing[id];
    if (!e || e.saving) return;
    setEditing(prev => ({ ...prev, [id]: { ...prev[id], saving: true } }));
    try {
      const fields: Record<string, string> = {};
      if (e.seo_title.trim())   fields.seo_title        = e.seo_title.trim();
      if (e.seo_desc.trim())    fields.seo_description  = e.seo_desc.trim();
      if (e.description.trim()) fields.description      = e.description.trim();
      await adminApi.updateListing(id, fields);
      setEditing(prev => ({ ...prev, [id]: { ...prev[id], saving: false, saved: true } }));
      setTimeout(() => closeEdit(id), 1200);
    } catch {
      setEditing(prev => ({ ...prev, [id]: { ...prev[id], saving: false } }));
    }
  };

  const filterLabel: Record<NonNullable<FieldFilter>, string> = {
    seo_title: 'SEO-заголовок',
    seo_desc:  'SEO-описание',
    desc:      'Описание',
    faq:       'FAQ',
  };

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

      {/* Статистика заполненности — кликабельные карточки */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-700 text-base">Заполненность полей</h3>
          {activeFilter && (
            <button
              onClick={() => setActiveFilter(null)}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Icon name="X" size={12} />
              Сбросить фильтр: {filterLabel[activeFilter]}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FIELD_CARDS.map(({ label, key, icon, filter }) => {
            const n = data.stats[key] || 0;
            const pct = data.total > 0 ? Math.round(n / data.total * 100) : 0;
            const fill = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
            const isActive = activeFilter === filter;
            const isClickable = filter !== null && pct < 100;
            return (
              <div
                key={key}
                onClick={() => isClickable ? toggleFilter(filter) : undefined}
                className={`border rounded-xl p-3 transition-all ${
                  isActive
                    ? 'border-brand-blue bg-blue-50 ring-2 ring-brand-blue/20'
                    : isClickable
                    ? 'border-border hover:border-brand-blue/40 hover:bg-muted/40 cursor-pointer'
                    : 'border-border'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon name={icon} size={13} className={isActive ? 'text-brand-blue' : 'text-muted-foreground'} />
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  {isClickable && <Icon name="ChevronDown" size={11} className="ml-auto text-muted-foreground" />}
                </div>
                <div className="flex items-end gap-1">
                  <span className="font-display font-700 text-xl leading-none">{pct}%</span>
                  <span className="text-xs text-muted-foreground mb-0.5">{n}/{data.total}</span>
                </div>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
                </div>
                {isClickable && (
                  <div className="mt-2 text-[10px] text-brand-blue font-medium">
                    {isActive ? 'Показаны проблемные ↓' : 'Нажми — исправить ↓'}
                  </div>
                )}
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-700 text-base">
              {activeFilter ? `Объекты без «${filterLabel[activeFilter]}»` : 'Объекты требуют внимания'}
            </h3>
            <span className="text-xs text-muted-foreground">{filteredProblems.length} объектов</span>
          </div>

          {filteredProblems.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <Icon name="CheckCircle" size={16} />
              Все объекты заполнены по этому полю
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProblems.map(p => {
                const ed = editing[p.id];
                const isEditing = !!ed;

                return (
                  <div key={p.id} className={`border rounded-xl transition-colors ${
                    fixedIds.has(p.id) ? 'bg-emerald-50 border-emerald-200' :
                    isEditing ? 'bg-blue-50/40 border-brand-blue/30' :
                    'border-border hover:bg-muted/30'
                  }`}>
                    {/* Основная строка */}
                    <div className="flex items-center gap-3 px-4 py-3">
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

                      {/* Кнопки действий */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(p.no_seo_title || p.no_seo_desc) && !fixedIds.has(p.id) && (
                          <button
                            onClick={() => onFixOne(p.id)}
                            disabled={fixingId === p.id}
                            title="Заполнить SEO через ИИ"
                            className="text-[11px] bg-violet-600 hover:bg-violet-700 text-white px-2 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors"
                          >
                            <Icon name={fixingId === p.id ? 'Loader2' : 'Wand2'} size={11} className={fixingId === p.id ? 'animate-spin' : ''} />
                            {fixingId === p.id ? 'SEO...' : 'ИИ'}
                          </button>
                        )}
                        {p.no_faq && !fixedFaqIds.has(p.id) && (
                          <button
                            onClick={() => onFixOneFaq(p.id)}
                            disabled={fixingFaqId === p.id}
                            title="Сгенерировать FAQ через ИИ"
                            className="text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors"
                          >
                            <Icon name={fixingFaqId === p.id ? 'Loader2' : 'HelpCircle'} size={11} className={fixingFaqId === p.id ? 'animate-spin' : ''} />
                            {fixingFaqId === p.id ? '...' : 'FAQ'}
                          </button>
                        )}
                        <button
                          onClick={() => isEditing ? closeEdit(p.id) : openEdit(p.id, p)}
                          title={isEditing ? 'Закрыть редактор' : 'Редактировать вручную'}
                          className={`text-[11px] px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${
                            isEditing
                              ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                              : 'bg-muted hover:bg-muted/80 text-foreground'
                          }`}
                        >
                          <Icon name={isEditing ? 'ChevronUp' : 'Pencil'} size={11} />
                          {isEditing ? 'Закрыть' : 'Вручную'}
                        </button>
                        <button
                          onClick={() => window.dispatchEvent(new CustomEvent('admin:open-listing', { detail: p.id }))}
                          title="Открыть карточку объекта"
                          className="text-[11px] text-brand-blue hover:underline px-1"
                        >
                          Открыть
                        </button>
                      </div>
                    </div>

                    {/* Inline-форма ручного редактирования */}
                    {isEditing && (
                      <div className="px-4 pb-4 space-y-3 border-t border-brand-blue/20 pt-3">
                        {/* SEO-заголовок */}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                            <Icon name="Type" size={11} className="text-muted-foreground" />
                            SEO-заголовок
                            <span className="text-muted-foreground font-normal">(до 70 символов)</span>
                          </label>
                          <input
                            type="text"
                            maxLength={70}
                            placeholder="Введите SEO-заголовок..."
                            value={ed.seo_title}
                            onChange={e => setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], seo_title: e.target.value } }))}
                            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                          />
                          <div className="text-[10px] text-muted-foreground text-right">{ed.seo_title.length}/70</div>
                        </div>

                        {/* SEO-описание */}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                            <Icon name="AlignLeft" size={11} className="text-muted-foreground" />
                            SEO-описание
                            <span className="text-muted-foreground font-normal">(до 160 символов)</span>
                          </label>
                          <textarea
                            maxLength={160}
                            rows={2}
                            placeholder="Введите SEO-описание..."
                            value={ed.seo_desc}
                            onChange={e => setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], seo_desc: e.target.value } }))}
                            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-none"
                          />
                          <div className="text-[10px] text-muted-foreground text-right">{ed.seo_desc.length}/160</div>
                        </div>

                        {/* Описание объекта */}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                            <Icon name="FileText" size={11} className="text-muted-foreground" />
                            Описание объекта
                            <span className="text-muted-foreground font-normal">(продающий текст)</span>
                          </label>
                          <textarea
                            rows={4}
                            placeholder="Введите описание объекта..."
                            value={ed.description}
                            onChange={e => setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], description: e.target.value } }))}
                            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-none"
                          />
                          <div className="text-[10px] text-muted-foreground text-right">{ed.description.length} символов</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => saveEdit(p.id)}
                            disabled={ed.saving || ed.saved || (!ed.seo_title.trim() && !ed.seo_desc.trim() && !ed.description.trim())}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue text-white text-xs font-semibold hover:bg-brand-blue/90 disabled:opacity-50 transition-colors"
                          >
                            <Icon name={ed.saving ? 'Loader2' : ed.saved ? 'Check' : 'Save'} size={12} className={ed.saving ? 'animate-spin' : ''} />
                            {ed.saving ? 'Сохранение...' : ed.saved ? 'Сохранено!' : 'Сохранить'}
                          </button>
                          <button
                            onClick={() => closeEdit(p.id)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
