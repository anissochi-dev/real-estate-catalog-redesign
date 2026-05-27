import Icon from '@/components/ui/icon';
import { CleanAction, CLEAN_ACTIONS } from './siteHealthTypes';

interface SiteHealthCleanProps {
  running: string | null;
  actionLog: { id: string; msg: string; ok: boolean }[];
  runAction: (action: CleanAction) => void;
}

export default function SiteHealthClean({ running, actionLog, runAction }: SiteHealthCleanProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
      <div>
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Icon name="Wrench" size={18} className="text-brand-blue" /> Инструменты обслуживания
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">Очистка, ремонт и оптимизация данных</p>
      </div>
      <div className="grid gap-3">
        {CLEAN_ACTIONS.map(action => {
          const isRunning = running === action.id;
          const log = actionLog.filter(l => l.id === action.id).slice(-1)[0];
          return (
            <div key={action.id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${action.danger ? 'bg-red-100 text-red-600' : 'bg-brand-blue/10 text-brand-blue'}`}>
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
              <button onClick={() => runAction(action)} disabled={!!running}
                className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                  action.danger ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100' : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
                }`}>
                <Icon name={isRunning ? 'Loader2' : 'Play'} size={14} className={isRunning ? 'animate-spin' : ''} />
                {isRunning ? 'Выполняется…' : 'Запустить'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t border-border">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Рекомендации</div>
        <div className="grid gap-2.5 text-sm text-muted-foreground">
          {[
            { icon: 'Lock', text: 'Используйте сложные пароли для учётных записей сотрудников' },
            { icon: 'Eye', text: 'Регулярно проверяйте список активных пользователей во вкладке «Роли»' },
            { icon: 'RefreshCw', text: 'Запускайте диагностику раз в неделю — это помогает выявить проблемы заранее' },
            { icon: 'Image', text: 'Периодически запускайте сжатие фото — уменьшает нагрузку на CDN' },
            { icon: 'Database', text: 'Делайте экспорт данных через «Экспорт/импорт» как резервную копию' },
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <Icon name={tip.icon} size={14} className="flex-shrink-0 mt-0.5 text-brand-blue/60" />
              <span>{tip.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
