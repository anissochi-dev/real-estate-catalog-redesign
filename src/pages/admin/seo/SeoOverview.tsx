import Icon from '@/components/ui/icon';
import { SeoStatus, Schedule, fmtDate } from './seoTypes';

interface Props {
  loading: boolean;
  status: SeoStatus | null;
  schedule: Schedule;
  gptOk: boolean;
  errorMsg: string;
  setErrorMsg: (v: string) => void;
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number | string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colorMap[color]}`}>
        <Icon name={icon} size={18} />
      </div>
      <div className="font-display font-700 text-2xl">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export default function SeoOverview({ loading, status, schedule, gptOk, errorMsg, setErrorMsg }: Props) {
  const coverage = status
    ? Math.round(((status.total_active - status.no_seo_title) / Math.max(status.total_active, 1)) * 100)
    : 0;

  return (
    <>
      {/* Статистика */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon name="Loader2" size={18} className="animate-spin" /> Загрузка...
        </div>
      ) : status ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon="Building2" label="Активных объектов" value={status.total_active} color="blue" />
            <StatCard icon="AlertCircle" label="Без SEO Title" value={status.no_seo_title} color={status.no_seo_title > 0 ? 'amber' : 'green'} />
            <StatCard icon="FileText" label="Без SEO Desc" value={status.no_seo_desc} color={status.no_seo_desc > 0 ? 'amber' : 'green'} />
            <StatCard icon="Gauge" label="Покрытие SEO" value={`${coverage}%`} color={coverage >= 80 ? 'green' : 'amber'} />
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Покрытие каталога</span>
              <span className="text-sm text-muted-foreground">{coverage}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all duration-700 ${coverage >= 80 ? 'bg-emerald-500' : coverage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${coverage}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                {status.no_seo_title > 0
                  ? `${status.no_seo_title} объектов без SEO Title — запусти оптимизацию`
                  : 'Все активные объекты имеют SEO Title ✓'}
              </p>
              {schedule.last_run_at && (
                <p className="text-xs text-muted-foreground">
                  Последний запуск: {fmtDate(schedule.last_run_at)}
                  {schedule.last_run_processed != null && ` · ${schedule.last_run_processed} обработано`}
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}

      {/* Универсальный баннер ошибок — дружелюбный, без HTTP-кодов */}
      {errorMsg && (() => {
        const isSession = /сесси|истек|войдите|401/i.test(errorMsg);
        const cls = isSession
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-red-50 border-red-200 text-red-800';
        const iconColor = isSession ? 'text-amber-600' : 'text-red-600';
        return (
          <div className={`border rounded-xl p-4 flex items-start gap-3 ${cls}`}>
            <Icon
              name={isSession ? 'LogIn' : 'AlertCircle'}
              size={18}
              className={`${iconColor} shrink-0 mt-0.5`}
            />
            <div className="flex-1">
              <div className="font-semibold text-sm">
                {isSession ? 'Нужно войти заново' : 'Не удалось загрузить данные'}
              </div>
              <div className="text-xs mt-0.5 opacity-80 break-words">{errorMsg}</div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => window.location.reload()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white hover:bg-muted border border-current/20 font-semibold inline-flex items-center gap-1"
                >
                  <Icon name="RefreshCw" size={12} /> Обновить
                </button>
                {isSession && (
                  <button
                    onClick={() => { try { localStorage.removeItem('biznest_token'); } catch { /* ignore */ } window.location.href = '/'; }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-brand-blue text-white font-semibold inline-flex items-center gap-1"
                  >
                    <Icon name="LogIn" size={12} /> Войти заново
                  </button>
                )}
              </div>
            </div>
            <button onClick={() => setErrorMsg('')} className="opacity-60 hover:opacity-100">
              <Icon name="X" size={14} />
            </button>
          </div>
        );
      })()}

      {/* GPT предупреждение */}
      {!gptOk && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Icon name="AlertTriangle" size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-800 text-sm">YandexGPT не настроен</div>
            <div className="text-xs text-amber-700 mt-0.5">
              Добавьте API-ключ и Folder ID в <span className="font-semibold">Настройки → Интеграции</span>.
            </div>
          </div>
        </div>
      )}

      {/* Расписание-статус */}
      {schedule.is_enabled && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <Icon name="Clock" size={16} className="text-emerald-600 shrink-0" />
          <div className="text-sm text-emerald-800">
            Автозапуск включён — каждый день в{' '}
            <strong>{String(schedule.run_hour).padStart(2, '0')}:00 UTC</strong>{' '}
            ({String((schedule.run_hour + 3) % 24).padStart(2, '0')}:00 МСК),
            пакет <strong>{schedule.batch_limit}</strong> объектов
          </div>
        </div>
      )}
    </>
  );
}