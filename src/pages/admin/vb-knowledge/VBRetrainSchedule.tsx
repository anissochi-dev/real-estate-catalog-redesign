import Icon from '@/components/ui/icon';
import { RetrainSchedule, TRAINING_SOURCES, fmtDate } from './types';

interface Props {
  schedule: RetrainSchedule;
  scheduleLoading: boolean;
  scheduleSaving: boolean;
  onScheduleChange: (s: RetrainSchedule) => void;
  onSave: () => void;
}

export default function VBRetrainSchedule({
  schedule, scheduleLoading, scheduleSaving, onScheduleChange, onSave,
}: Props) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Icon name="CalendarClock" size={18} className="text-brand-blue" />
          <h3 className="font-display font-700 text-base">Автопереобучение по расписанию</h3>
        </div>
        <div
          onClick={() => onScheduleChange({ ...schedule, enabled: !schedule.enabled })}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${schedule.enabled ? 'bg-brand-blue' : 'bg-muted-foreground/30'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${schedule.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
      </div>

      {scheduleLoading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Icon name="Loader2" size={14} className="animate-spin" /> Загрузка…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Время запуска (UTC / МСК)</label>
              <div className="flex items-center gap-1.5">
                <select
                  value={schedule.hour}
                  onChange={e => onScheduleChange({ ...schedule, hour: +e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm w-20"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="text-muted-foreground font-bold">:</span>
                <select
                  value={schedule.minute}
                  onChange={e => onScheduleChange({ ...schedule, minute: +e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm w-20"
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground ml-1">
                  = {String((schedule.hour + 3) % 24).padStart(2, '0')}:{String(schedule.minute).padStart(2, '0')} МСК
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Источники</div>
              <div className="flex flex-wrap gap-2">
                {TRAINING_SOURCES.map(src => {
                  const active = schedule.sources.includes(src.id);
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => onScheduleChange({
                        ...schedule,
                        sources: active
                          ? schedule.sources.filter(x => x !== src.id)
                          : [...schedule.sources, src.id],
                      })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${active ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30' : 'bg-muted/40 text-muted-foreground border-border'}`}
                      title={src.hint}
                    >
                      {src.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {schedule.last_at && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 flex items-center gap-2">
              <Icon name="CheckCircle2" size={13} className="text-emerald-500 shrink-0" />
              Последний запуск: {fmtDate(schedule.last_at)}
              {schedule.last_saved != null && ` — сохранено ${schedule.last_saved} фактов`}
            </div>
          )}

          <button
            onClick={onSave}
            disabled={scheduleSaving}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Icon name={scheduleSaving ? 'Loader2' : 'Save'} size={14} className={scheduleSaving ? 'animate-spin' : ''} />
            {scheduleSaving ? 'Сохранение…' : 'Сохранить расписание'}
          </button>
        </div>
      )}
    </div>
  );
}
