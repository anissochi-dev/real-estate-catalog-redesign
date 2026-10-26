import Icon from '@/components/ui/icon';
import { usePrerender } from './usePrerender';

type Props = ReturnType<typeof usePrerender>;

export default function SeoPrerenderCard({
  prerenderRunning, prerenderLog, prerenderDone, prerenderErrors,
  prerenderTotal, prerenderFinished, runPrerender,
}: Props) {
  return (
    <>
  {/* Prerender для поисковых ботов */}
  <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="font-display font-700 text-lg flex items-center gap-2">
        <Icon name="Bot" size={18} className="text-brand-blue" /> Индексация для поисковых ботов
      </div>
      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
        <Icon name="Clock" size={12} />
        Автозапуск каждый день в 01:00 МСК
      </div>
    </div>
    <p className="text-sm text-muted-foreground">
      Прогревает HTML-кеш для всех страниц — Яндекс и Google видят готовый контент без JavaScript.
      Запускается автоматически каждую ночь. Можно запустить вручную после добавления новых объектов.
    </p>

    {/* Прогресс */}
    {(prerenderRunning || prerenderFinished) && prerenderTotal > 0 && (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Прогресс</span>
          <span className="text-muted-foreground">{prerenderDone + prerenderErrors} / {prerenderTotal}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-brand-blue rounded-full transition-all duration-300"
            style={{ width: `${Math.round(((prerenderDone + prerenderErrors) / prerenderTotal) * 100)}%` }}
          />
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="text-emerald-700 font-medium">✓ {prerenderDone} ОК</span>
          {prerenderErrors > 0 && <span className="text-red-600 font-medium">✗ {prerenderErrors} ошибок</span>}
        </div>
      </div>
    )}

    {/* Кнопка */}
    <button
      onClick={runPrerender}
      disabled={prerenderRunning}
      className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue text-white rounded-xl text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-60"
    >
      <Icon name={prerenderRunning ? 'Loader2' : 'RefreshCw'} size={16} className={prerenderRunning ? 'animate-spin' : ''} />
      {prerenderRunning
        ? `Генерирую... ${prerenderDone + prerenderErrors} / ${prerenderTotal}`
        : prerenderFinished
          ? 'Запустить ещё раз'
          : 'Сгенерировать HTML для ботов'}
    </button>

    {prerenderFinished && prerenderErrors === 0 && (
      <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-medium">
        <Icon name="CheckCircle2" size={16} />
        Готово — {prerenderDone} страниц доступны для поисковых ботов
      </div>
    )}

    {/* Лог */}
    {prerenderLog.length > 0 && (
      <div className="bg-muted rounded-xl p-3 max-h-48 overflow-y-auto space-y-0.5">
        {prerenderLog.map((line, i) => (
          <div key={i} className={`text-xs font-mono ${line.startsWith('✗') ? 'text-red-600' : line.startsWith('✓') ? 'text-emerald-700' : 'text-muted-foreground'}`}>
            {line}
          </div>
        ))}
      </div>
    )}
  </div>
    </>
  );
}
