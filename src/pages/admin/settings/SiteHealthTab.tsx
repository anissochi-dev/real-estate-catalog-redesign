import { useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

interface HealthResult {
  checks: Check[];
  score: number;
  passed: number;
  total: number;
}

interface Action {
  id: string;
  label: string;
  description: string;
  icon: string;
  danger?: boolean;
  confirm?: string;
}

const ACTIONS: Action[] = [
  {
    id: 'clear_old_sessions',
    label: 'Очистить истёкшие сессии',
    description: 'Удаляет просроченные сессии пользователей из БД',
    icon: 'LogOut',
  },
  {
    id: 'clear_ai_logs',
    label: 'Очистить логи ИИ (старше 30 дней)',
    description: 'Удаляет старые записи из журнала запросов к ИИ-ассистенту',
    icon: 'Trash2',
  },
  {
    id: 'clear_orphan_leads',
    label: 'Удалить пустые заявки',
    description: 'Удаляет заявки без телефона, созданные более 7 дней назад',
    icon: 'UserX',
    danger: true,
    confirm: 'Удалить заявки без номера телефона старше 7 дней?',
  },
  {
    id: 'vacuum_stats',
    label: 'Очистить старую статистику',
    description: 'Удаляет записи статистики просмотров старше 90 дней',
    icon: 'BarChart2',
    danger: true,
    confirm: 'Удалить статистику просмотров старше 90 дней?',
  },
  {
    id: 'fix_slugs',
    label: 'Исправить slug новостей',
    description: 'Генерирует slug для новостей, у которых он пустой',
    icon: 'Link',
  },
];

function req(resource: string, opts?: RequestInit) {
  const ADMIN_URL = 'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';
  const token = localStorage.getItem('auth_token') || '';
  return fetch(`${ADMIN_URL}?resource=${resource}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token, ...(opts?.headers || {}) },
  }).then(r => r.json());
}

export default function SiteHealthTab() {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<{ id: string; msg: string; ok: boolean }[]>([]);

  const runCheck = async () => {
    setChecking(true);
    try {
      const data = await req('site_health&action=check');
      if (data.error) { toast.error(data.error); return; }
      setResult(data);
    } catch (e) {
      toast.error('Не удалось выполнить проверку');
    } finally {
      setChecking(false);
    }
  };

  const runAction = async (action: Action) => {
    if (action.confirm && !confirm(action.confirm)) return;
    setRunning(action.id);
    try {
      const data = await req(`site_health&action=${action.id}`, { method: 'POST', body: '{}' });
      if (data.error) {
        setActionLog(l => [...l, { id: action.id, msg: data.error, ok: false }]);
        toast.error(data.error);
      } else {
        const msg = data.message || `Выполнено (${data.deleted ?? data.fixed ?? 0})`;
        setActionLog(l => [...l, { id: action.id, msg, ok: true }]);
        toast.success(msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      setActionLog(l => [...l, { id: action.id, msg, ok: false }]);
      toast.error(msg);
    } finally {
      setRunning(null);
    }
  };

  const scoreColor = !result ? '' :
    result.score >= 90 ? 'text-emerald-600' :
    result.score >= 70 ? 'text-amber-600' : 'text-red-600';

  const barColor = !result ? 'bg-muted' :
    result.score >= 90 ? 'bg-emerald-500' :
    result.score >= 70 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-5">

      {/* Заголовок */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-border">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-display font-700 text-base flex items-center gap-2">
              <Icon name="HeartPulse" size={18} className="text-brand-blue" />
              Диагностика сайта
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Проверяет базу данных, контент, безопасность и SEO. Выявляет проблемы и помогает их устранить.
            </p>
          </div>
          <button
            onClick={runCheck}
            disabled={checking}
            className="btn-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60 flex-shrink-0"
          >
            <Icon name={checking ? 'Loader2' : 'ScanSearch'} size={16} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Проверка…' : 'Запустить проверку'}
          </button>
        </div>

        {/* Результат */}
        {result && (
          <div className="mt-5 space-y-4">
            {/* Скор */}
            <div className="flex items-center gap-4">
              <div className={`text-4xl font-display font-800 ${scoreColor}`}>
                {result.score}%
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Здоровье сайта</span>
                  <span>{result.passed} из {result.total} проверок пройдено</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor} transition-all duration-700 rounded-full`}
                    style={{ width: `${result.score}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Список проверок */}
            <div className="grid gap-2">
              {result.checks.map((c, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                    c.ok
                      ? 'bg-emerald-50/60 border-emerald-200'
                      : 'bg-red-50/60 border-red-200'
                  }`}
                >
                  <Icon
                    name={c.ok ? 'CheckCircle2' : 'AlertCircle'}
                    size={16}
                    className={`flex-shrink-0 mt-0.5 ${c.ok ? 'text-emerald-500' : 'text-red-500'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <span className={`font-semibold ${c.ok ? 'text-emerald-800' : 'text-red-800'}`}>
                      {c.name}
                    </span>
                    {c.detail && (
                      <span className="text-muted-foreground ml-2 text-xs">{c.detail}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Инструменты обслуживания */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-border">
        <h3 className="font-display font-700 text-base flex items-center gap-2 mb-4">
          <Icon name="Wrench" size={18} className="text-brand-blue" />
          Инструменты обслуживания
        </h3>

        <div className="grid gap-3">
          {ACTIONS.map(action => {
            const isRunning = running === action.id;
            const log = actionLog.filter(l => l.id === action.id).slice(-1)[0];
            return (
              <div
                key={action.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  action.danger ? 'bg-red-100 text-red-600' : 'bg-brand-blue/10 text-brand-blue'
                }`}>
                  <Icon name={action.icon} size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{action.label}</div>
                  <div className="text-xs text-muted-foreground">{action.description}</div>
                  {log && (
                    <div className={`text-xs mt-1 font-medium ${log.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                      {log.ok ? '✓' : '✗'} {log.msg}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => runAction(action)}
                  disabled={!!running}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                    action.danger
                      ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                      : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
                  }`}
                >
                  <Icon
                    name={isRunning ? 'Loader2' : 'Play'}
                    size={14}
                    className={isRunning ? 'animate-spin' : ''}
                  />
                  {isRunning ? 'Выполняется…' : 'Запустить'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Подсказки */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-border">
        <h3 className="font-display font-700 text-base flex items-center gap-2 mb-4">
          <Icon name="ShieldCheck" size={18} className="text-brand-blue" />
          Рекомендации по безопасности
        </h3>
        <div className="grid gap-3 text-sm">
          {[
            { icon: 'Lock', text: 'Используйте сложные пароли для учётных записей сотрудников' },
            { icon: 'Eye', text: 'Регулярно проверяйте список активных пользователей во вкладке «Роли»' },
            { icon: 'RefreshCw', text: 'Запускайте диагностику раз в неделю — это помогает выявить проблемы заранее' },
            { icon: 'Image', text: 'Периодически запускайте сжатие фото — уменьшает нагрузку на CDN' },
            { icon: 'Database', text: 'Делайте экспорт данных через «Экспорт/импорт» — хорошая практика резервного копирования' },
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-3 text-muted-foreground">
              <Icon name={tip.icon} size={15} className="flex-shrink-0 mt-0.5 text-brand-blue/60" />
              <span>{tip.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
