import Icon from '@/components/ui/icon';
import { HealthResult, SecurityResult } from './siteHealthTypes';

interface HealthSectionProps {
  health: HealthResult | null;
  healthLoading: boolean;
  loadHealth: () => void;
}

export function HealthSection({ health, healthLoading, loadHealth }: HealthSectionProps) {
  const scoreColor = !health ? '' : health.score >= 90 ? 'text-emerald-600' : health.score >= 70 ? 'text-amber-600' : 'text-red-600';
  const barColor   = !health ? 'bg-muted' : health.score >= 90 ? 'bg-emerald-500' : health.score >= 70 ? 'bg-amber-500' : 'bg-red-500';

  return (
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
          <div className="grid gap-2">
            {health.checks.map((c, i) => (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${c.ok ? 'bg-emerald-50/60 border-emerald-200' : 'bg-red-50/60 border-red-200'}`}>
                <Icon name={c.ok ? 'CheckCircle2' : 'AlertCircle'} size={16} className={`flex-shrink-0 mt-0.5 ${c.ok ? 'text-emerald-500' : 'text-red-500'}`} />
                <div>
                  <span className={`font-semibold ${c.ok ? 'text-emerald-800' : 'text-red-800'}`}>{c.name}</span>
                  {c.detail && <span className="text-muted-foreground ml-2 text-xs">{c.detail}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
