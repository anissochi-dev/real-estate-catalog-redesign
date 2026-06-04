import Icon from '@/components/ui/icon';

// ── Описание батчей ───────────────────────────────────────────────────────────

export const BATCH_STEPS = [
  { key: 'db',       label: 'База данных',   icon: 'Database',    estSec: 5  },
  { key: 'arrpro',   label: 'АРР Про',       icon: 'Globe',       estSec: 20 },
  { key: 'ayax',     label: 'Аякс',          icon: 'Globe',       estSec: 20 },
  { key: 'etagi',    label: 'Этажи',         icon: 'Globe',       estSec: 20 },
  { key: 'moreon',   label: 'Мореон',        icon: 'Globe',       estSec: 20 },
  { key: 'finalize', label: 'Сохранение',    icon: 'Save',        estSec: 8  },
];

export const TOTAL_EST_SEC = BATCH_STEPS.reduce((a, s) => a + s.estSec, 0); // ~93 сек

export interface RefreshState {
  running: boolean;
  currentBatch: number;       // 0-5, -1 = не запущен
  completedBatches: string[]; // завершённые source-имена
  startedAt: Date | null;
  batchTimes: number[];       // реальное время каждого завершённого батча (мс)
  estimatedFinishAt: Date | null;
  savedCount: number | null;
  finishedAt: Date | null;
}

export const INITIAL_STATE: RefreshState = {
  running: false,
  currentBatch: -1,
  completedBatches: [],
  startedAt: null,
  batchTimes: [],
  estimatedFinishAt: null,
  savedCount: null,
  finishedAt: null,
};

// ── Утилиты ───────────────────────────────────────────────────────────────────

function fmtTime(d: Date) {
  return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(d: Date) {
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const timeStr = fmtTime(d);
  if (isToday) return `сегодня в ${timeStr}`;
  if (isTomorrow) return `завтра в ${timeStr}`;
  return `${d.toLocaleDateString('ru', { day: 'numeric', month: 'long' })} в ${timeStr}`;
}

function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} сек`;
  return `${Math.floor(s / 60)} мин ${s % 60} сек`;
}

// ── Компонент ─────────────────────────────────────────────────────────────────

interface Props {
  state: RefreshState;
  onStart: () => void;
}

export default function RefreshProgress({ state, onStart }: Props) {
  const { running, currentBatch, completedBatches, estimatedFinishAt, savedCount, finishedAt, startedAt, batchTimes } = state;

  // Вычисляем реальное среднее время батча для уточнения прогноза
  const avgBatchMs = batchTimes.length > 0
    ? batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length
    : null;

  const totalElapsedMs = startedAt ? Date.now() - startedAt.getTime() : null;

  if (!running && !finishedAt) {
    return (
      <button
        onClick={onStart}
        className="flex items-center gap-1.5 text-xs bg-brand-blue text-white px-3 py-1.5 rounded-xl font-semibold"
      >
        <Icon name="RefreshCw" size={13} />
        Обновить сейчас
      </button>
    );
  }

  return (
    <div className="w-full mt-3 space-y-3">
      {/* Прогресс-бар */}
      <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {running
              ? <Icon name="Loader2" size={15} className="animate-spin text-brand-blue" />
              : <Icon name="CheckCircle2" size={15} className="text-emerald-500" />
            }
            <span className="text-sm font-semibold">
              {running ? 'Сбор рыночных цен…' : `Готово — сохранено ${savedCount} снапшотов`}
            </span>
          </div>
          {estimatedFinishAt && running && (
            <span className="text-xs text-muted-foreground">
              ~завершится {fmtDateTime(estimatedFinishAt)}
            </span>
          )}
          {finishedAt && (
            <span className="text-xs text-muted-foreground">
              завершено {fmtDateTime(finishedAt)}
              {totalElapsedMs && ` · ${fmtDuration(totalElapsedMs)}`}
            </span>
          )}
        </div>

        {/* Шаги */}
        <div className="grid grid-cols-6 gap-1">
          {BATCH_STEPS.map((step, idx) => {
            const isDone = completedBatches.includes(step.key);
            const isCurrent = running && currentBatch === idx;
            const isPending = !isDone && !isCurrent;
            return (
              <div key={step.key} className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  isDone    ? 'bg-emerald-100 text-emerald-600' :
                  isCurrent ? 'bg-brand-blue text-white ring-2 ring-brand-blue/30' :
                              'bg-muted/40 text-muted-foreground/40'
                }`}>
                  {isDone
                    ? <Icon name="Check" size={13} />
                    : isCurrent
                      ? <Icon name="Loader2" size={13} className="animate-spin" />
                      : <Icon name={step.icon} size={13} />
                  }
                </div>
                <span className={`text-[9px] text-center leading-tight ${
                  isDone ? 'text-emerald-600 font-medium' :
                  isCurrent ? 'text-brand-blue font-semibold' :
                  'text-muted-foreground/50'
                }`}>
                  {step.label}
                </span>
                {isDone && batchTimes[idx] && (
                  <span className="text-[9px] text-muted-foreground/60">{Math.round(batchTimes[idx] / 1000)}с</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Общая полоса прогресса */}
        <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${running ? 'bg-brand-blue' : 'bg-emerald-500'}`}
            style={{ width: `${Math.round((completedBatches.length / BATCH_STEPS.length) * 100)}%` }}
          />
        </div>

        {/* Уточнённый прогноз на основе реальных замеров */}
        {avgBatchMs && running && (
          <p className="text-[10px] text-muted-foreground">
            Среднее время батча: {Math.round(avgBatchMs / 1000)} сек ·
            Осталось батчей: {BATCH_STEPS.length - completedBatches.length}
          </p>
        )}
      </div>
    </div>
  );
}
