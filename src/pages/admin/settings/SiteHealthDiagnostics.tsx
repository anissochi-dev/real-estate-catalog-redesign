import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { HealthResult, SecurityResult, ViewItem, ViewResult, req } from './siteHealthTypes';

// ── Метки для view/fix действий ──────────────────────────────────────────────
const VIEW_LABELS: Record<string, string> = {
  view_listings_no_desc:  'Объявления без описания',
  view_listings_no_price: 'Объявления без цены',
  view_orphan_leads:      'Заявки без телефона',
  view_duplicates:        'Дубли объявлений',
  view_xss:               'Подозрительный код',
  view_listings_no_seo:   'Объявления без SEO',
  view_settings:          'Настройки сайта',
};

const FIX_LABELS: Record<string, string> = {
  clear_orphan_leads:   'Удалить',
  clear_old_sessions:   'Очистить',
  clear_ai_logs:        'Очистить',
  fix_seo_titles:       'Проставить SEO',
  open_settings:        'Перейти',
  ai_fix_settings:      'Заполнить через ИИ',
  ai_fix_descriptions:  'Написать через ИИ',
  fix_duplicates:       'Убрать дубли',
};

const FIX_AI_ACTIONS = new Set(['ai_fix_settings', 'ai_fix_descriptions']);

const FIX_CONFIRMS: Record<string, string> = {
  clear_orphan_leads: 'Удалить заявки без телефона старше 7 дней?',
  clear_old_sessions: 'Удалить все истёкшие сессии?',
  clear_ai_logs:      'Очистить логи ИИ старше 30 дней?',
  fix_seo_titles:     'Автоматически проставить SEO-заголовки из названий объявлений?',
  fix_duplicates:     'Оставить первое объявление в каждой группе, остальные убрать в архив?',
};

// ── Интерфейс ответа настроек ─────────────────────────────────────────────────
interface SettingsField { key: string; label: string; value: string; filled: boolean; }
interface SettingsViewResult { fields: SettingsField[]; exists: boolean; message?: string; error?: string; }

// ── Панель просмотра настроек ─────────────────────────────────────────────────
interface SettingsPanelProps {
  data: SettingsViewResult;
  onClose: () => void;
  onAiFix: () => void;
  aiFilling: boolean;
}

function SettingsPanel({ data, onClose, onAiFix, aiFilling }: SettingsPanelProps) {
  const empty = data.fields.filter(f => !f.filled);
  const filled = data.fields.filter(f => f.filled);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h4 className="font-semibold text-base flex items-center gap-2">
            <Icon name="Settings2" size={16} className="text-brand-blue" /> Настройки сайта
          </h4>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <Icon name="X" size={18} />
          </button>
        </div>

        {!data.exists ? (
          <div className="px-5 py-8 text-center">
            <Icon name="AlertCircle" size={32} className="text-red-400 mx-auto mb-3" />
            <div className="font-semibold text-red-700 mb-1">Строка настроек не найдена</div>
            <div className="text-sm text-muted-foreground">{data.message}</div>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {/* Незаполненные */}
            {empty.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">
                  Не заполнено ({empty.length})
                </div>
                <div className="grid gap-2">
                  {empty.map(f => (
                    <div key={f.key} className="flex items-center gap-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm">
                      <Icon name="AlertCircle" size={14} className="text-red-400 flex-shrink-0" />
                      <span className="text-red-800 font-medium">{f.label}</span>
                      <span className="ml-auto text-xs text-red-400 font-mono">{f.key}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Заполненные */}
            {filled.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Заполнено ({filled.length})
                </div>
                <div className="grid gap-2">
                  {filled.map(f => (
                    <div key={f.key} className="px-3 py-2.5 bg-emerald-50/60 border border-emerald-200 rounded-xl text-sm">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Icon name="CheckCircle2" size={13} className="text-emerald-500 flex-shrink-0" />
                        <span className="font-medium text-emerald-800">{f.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground ml-5 truncate">{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="px-5 py-3 border-t border-border flex-shrink-0 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {data.exists ? `${filled.length} из ${data.fields.length} полей заполнено` : ''}
          </div>
          {empty.length > 0 && (
            <button
              onClick={onAiFix}
              disabled={aiFilling}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-blue text-white hover:bg-brand-blue/90 disabled:opacity-60 transition">
              <Icon name={aiFilling ? 'Loader2' : 'Sparkles'} size={14} className={aiFilling ? 'animate-spin' : ''} />
              {aiFilling ? 'ИИ заполняет…' : 'Заполнить через ИИ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Универсальная панель просмотра записей ────────────────────────────────────
interface ViewPanelProps {
  title: string;
  items: ViewItem[];
  onClose: () => void;
}

function ViewPanel({ title, items, onClose }: ViewPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h4 className="font-semibold text-base">{title}</h4>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">Записи не найдены</div>
          )}
          {items.map((item, i) => (
            <div key={i} className="px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm">
              {item.cnt !== undefined ? (
                <div>
                  <div className="font-semibold">{item.title || '—'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.cnt} копий · цена {item.price ?? '—'} · ID: {item.ids?.join(', ')}
                  </div>
                </div>
              ) : item.email !== undefined ? (
                <div>
                  <div className="font-semibold">{item.name || 'Без имени'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{item.email} · {new Date(item.created_at!).toLocaleDateString('ru')}</div>
                  {item.comment && <div className="text-xs mt-0.5 text-foreground/60">{item.comment}</div>}
                </div>
              ) : item.description_preview !== undefined ? (
                <div>
                  <div className="font-semibold">#{item.id} {item.title}</div>
                  <div className="text-xs text-red-600 mt-0.5 font-mono truncate">{item.description_preview}</div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold">#{item.id}</span>
                    <span className="ml-2 text-foreground/80">{item.title || '—'}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex-shrink-0">
                    {item.price ? `${Number(item.price).toLocaleString('ru')} ₽` : 'без цены'}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border flex-shrink-0">
          <div className="text-xs text-muted-foreground">Показано: {items.length} записей</div>
        </div>
      </div>
    </div>
  );
}

// ── HealthSection ─────────────────────────────────────────────────────────────
interface HealthSectionProps {
  health: HealthResult | null;
  healthLoading: boolean;
  loadHealth: () => void;
}

export function HealthSection({ health, healthLoading, loadHealth }: HealthSectionProps) {
  const scoreColor = !health ? '' : health.score >= 90 ? 'text-emerald-600' : health.score >= 70 ? 'text-amber-600' : 'text-red-600';
  const barColor   = !health ? 'bg-muted' : health.score >= 90 ? 'bg-emerald-500' : health.score >= 70 ? 'bg-amber-500' : 'bg-red-500';

  const [viewData, setViewData] = useState<{ title: string; items: ViewItem[] } | null>(null);
  const [settingsData, setSettingsData] = useState<SettingsViewResult | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [aiFilling, setAiFilling] = useState(false);

  const handleView = async (viewAction: string) => {
    setLoadingAction(viewAction);
    try {
      if (viewAction === 'view_settings') {
        const d = await req(`site_health&action=view_settings`) as SettingsViewResult;
        if (d.error) { toast.error(d.error); return; }
        setSettingsData(d);
      } else {
        const d = await req(`site_health&action=${viewAction}`) as ViewResult & { error?: string };
        if (d.error) { toast.error(d.error); return; }
        setViewData({ title: VIEW_LABELS[viewAction] || viewAction, items: d.items });
      }
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoadingAction(null); }
  };

  const handleAiFix = async () => {
    setAiFilling(true);
    try {
      const d = await req('site_health&action=ai_fix_settings', { method: 'POST', body: '{}' });
      if (d.error) { toast.error(d.error); return; }
      toast.success(d.message || 'ИИ заполнил настройки');
      setSettingsData(null);
      loadHealth();
    } catch { toast.error('Ошибка ИИ'); }
    finally { setAiFilling(false); }
  };

  const handleFix = async (fixAction: string) => {
    if (fixAction === 'ai_fix_settings') { await handleAiFix(); return; }
    if (fixAction === 'open_settings') { toast.info('Перейдите в раздел «Настройки сайта»'); return; }
    const confirmMsg = FIX_CONFIRMS[fixAction];
    if (confirmMsg && !confirm(confirmMsg)) return;

    const isAi = FIX_AI_ACTIONS.has(fixAction);
    if (isAi) setAiFilling(true); else setLoadingAction(fixAction);
    try {
      const d = await req(`site_health&action=${fixAction}`, { method: 'POST', body: '{}' });
      if (d.error) { toast.error(d.error); return; }
      toast.success(d.message || 'Исправлено');
      loadHealth();
    } catch { toast.error('Ошибка'); }
    finally { if (isAi) setAiFilling(false); else setLoadingAction(null); }
  };

  return (
    <>
      {viewData && <ViewPanel title={viewData.title} items={viewData.items} onClose={() => setViewData(null)} />}
      {settingsData && (
        <SettingsPanel
          data={settingsData}
          onClose={() => setSettingsData(null)}
          onAiFix={handleAiFix}
          aiFilling={aiFilling}
        />
      )}

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Icon name="HeartPulse" size={18} className="text-brand-blue" /> Диагностика сайта
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">База данных, контент, SEO и безопасность — 12 проверок</p>
          </div>
          <button onClick={loadHealth} disabled={healthLoading}
            className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
            <Icon name={healthLoading ? 'Loader2' : 'ScanSearch'} size={16} className={healthLoading ? 'animate-spin' : ''} />
            {healthLoading ? 'Проверка…' : 'Запустить'}
          </button>
        </div>

        {health && (
          <div className="space-y-4">
            {/* Скор */}
            <div className="flex items-center gap-4">
              <div className={`text-4xl font-bold ${scoreColor}`}>{health.score}%</div>
              <div className="flex-1">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Здоровье сайта</span><span>{health.passed}/{health.total} пройдено</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} transition-all duration-700 rounded-full`} style={{ width: `${health.score}%` }} />
                </div>
              </div>
            </div>

            {/* Список проверок */}
            <div className="grid gap-2">
              {health.checks.map((c, i) => {
                const isAiFix = !!c.fix_action && FIX_AI_ACTIONS.has(c.fix_action);
                const isFixLoading = isAiFix ? aiFilling : loadingAction === c.fix_action;
                const isViewLoading = loadingAction === c.view_action;
                return (
                  <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${c.ok ? 'bg-emerald-50/60 border-emerald-200' : 'bg-red-50/60 border-red-200'}`}>
                    <Icon name={c.ok ? 'CheckCircle2' : 'AlertCircle'} size={16}
                      className={`flex-shrink-0 mt-0.5 ${c.ok ? 'text-emerald-500' : 'text-red-500'}`} />
                    <div className="flex-1 min-w-0">
                      <span className={`font-semibold ${c.ok ? 'text-emerald-800' : 'text-red-800'}`}>{c.name}</span>
                      {c.detail && <span className="text-muted-foreground ml-2 text-xs">{c.detail}</span>}
                    </div>
                    {!c.ok && (c.view_action || c.fix_action) && (
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        {c.view_action && (
                          <button
                            onClick={() => handleView(c.view_action!)}
                            disabled={!!loadingAction || aiFilling}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 transition">
                            <Icon name={isViewLoading ? 'Loader2' : 'Eye'} size={12} className={isViewLoading ? 'animate-spin' : ''} />
                            Просмотр
                          </button>
                        )}
                        {c.fix_action && (
                          <button
                            onClick={() => handleFix(c.fix_action!)}
                            disabled={!!loadingAction || aiFilling}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold disabled:opacity-50 transition ${
                              isAiFix
                                ? 'bg-brand-blue text-white hover:bg-brand-blue/90'
                                : 'bg-red-600 text-white hover:bg-red-700'
                            }`}>
                            <Icon name={isFixLoading ? 'Loader2' : (isAiFix ? 'Sparkles' : 'Wrench')} size={12} className={isFixLoading ? 'animate-spin' : ''} />
                            {isFixLoading ? (isAiFix ? 'ИИ работает…' : 'Выполняется…') : (FIX_LABELS[c.fix_action] || 'Исправить')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── SecuritySection ───────────────────────────────────────────────────────────
interface SecuritySectionProps {
  security: SecurityResult | null;
  secLoading: boolean;
  loadSecurity: () => void;
}

export function SecuritySection({ security, secLoading, loadSecurity }: SecuritySectionProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Icon name="ShieldAlert" size={18} className="text-brand-blue" /> Антивирус и безопасность
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">XSS, SQL-инъекции, brute force, подозрительные аккаунты</p>
        </div>
        <button onClick={loadSecurity} disabled={secLoading}
          className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
          <Icon name={secLoading ? 'Loader2' : 'ShieldCheck'} size={16} className={secLoading ? 'animate-spin' : ''} />
          {secLoading ? 'Сканирование…' : 'Сканировать'}
        </button>
      </div>
      {security && (
        <div className="space-y-4">
          <div className={`flex items-center gap-3 px-4 py-4 rounded-xl border ${security.safe ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <Icon name={security.safe ? 'ShieldCheck' : 'ShieldX'} size={28} className={security.safe ? 'text-emerald-500' : 'text-red-500'} />
            <div>
              <div className={`font-bold text-base ${security.safe ? 'text-emerald-700' : 'text-red-700'}`}>
                {security.safe ? 'Угроз не обнаружено' : `Найдено угроз: ${security.threat_count}`}
              </div>
              <div className="text-xs text-muted-foreground">
                {security.warnings.length > 0 ? `${security.warnings.length} предупреждений` : 'Предупреждений нет'}
              </div>
            </div>
          </div>

          {security.threats.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Угрозы</div>
              <div className="grid gap-2">
                {security.threats.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm">
                    <Icon name="Bug" size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <div><span className="font-semibold text-red-800">{t.type}</span><span className="text-red-600 ml-2">{t.where}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {security.warnings.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">Предупреждения</div>
              <div className="grid gap-2">
                {security.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm">
                    <Icon name="AlertTriangle" size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-amber-800">{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Администраторы', value: security.admins.join(', ') || 'нет', icon: 'ShieldHalf', warn: false },
              { label: 'Неактивные аккаунты', value: `${security.old_inactive_users} (>180 дней)`, icon: 'UserX', warn: security.old_inactive_users > 0 },
              { label: 'Внешние ссылки в объявлениях', value: `${security.external_links_in_listings} шт`, icon: 'ExternalLink', warn: security.external_links_in_listings > 50 },
              { label: 'API-ключ ИИ', value: security.api_key_configured ? 'Настроен' : 'Не настроен', icon: 'Key', warn: !security.api_key_configured },
            ].map((item, i) => (
              <div key={i} className={`p-3 rounded-xl border text-sm ${item.warn ? 'bg-amber-50 border-amber-200' : 'bg-muted/30 border-border'}`}>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Icon name={item.icon} size={12} />{item.label}
                </div>
                <div className={`font-semibold text-xs ${item.warn ? 'text-amber-700' : ''}`}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}