import { useMemo } from 'react';
import Icon from '@/components/ui/icon';

interface Props {
  startsAt: string; // YYYY-MM-DDTHH:mm
  endsAt: string;
  onChange: (next: { startsAt: string; endsAt: string }) => void;
  error?: string;
}

/** Парсит строку datetime-local в части (день, время). Безопасно для пустых строк. */
function split(dt: string): { date: string; time: string } {
  if (!dt) return { date: '', time: '' };
  const [d = '', t = ''] = dt.split('T');
  return { date: d, time: t.slice(0, 5) };
}

function combine(date: string, time: string): string {
  if (!date) return '';
  return `${date}T${time || '09:00'}`;
}

function addMinutes(dt: string, minutes: number): string {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return '';
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DURATIONS: { label: string; minutes: number }[] = [
  { label: '15 мин', minutes: 15 },
  { label: '30 мин', minutes: 30 },
  { label: '1 ч',    minutes: 60 },
  { label: '2 ч',    minutes: 120 },
  { label: 'Весь день', minutes: 0 },
];

const TIME_PRESETS = ['09:00', '10:00', '12:00', '14:00', '16:00', '18:00'];

export default function EventDateTimeBlock({ startsAt, endsAt, onChange, error }: Props) {
  const start = split(startsAt);
  const end = split(endsAt);

  const currentDuration = useMemo(() => {
    if (!startsAt || !endsAt) return null;
    const s = new Date(startsAt).getTime();
    const e = new Date(endsAt).getTime();
    if (isNaN(s) || isNaN(e)) return null;
    return Math.max(0, Math.round((e - s) / 60000));
  }, [startsAt, endsAt]);

  const todayStr = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  const setStartDate = (date: string) => {
    const newStart = combine(date, start.time || '09:00');
    onChange({ startsAt: newStart, endsAt });
  };
  const setStartTime = (time: string) => {
    const newStart = combine(start.date || todayStr, time);
    onChange({ startsAt: newStart, endsAt });
  };
  const setEndDate = (date: string) => {
    onChange({ startsAt, endsAt: combine(date, end.time || '10:00') });
  };
  const setEndTime = (time: string) => {
    onChange({ startsAt, endsAt: combine(end.date || start.date || todayStr, time) });
  };

  const applyQuickDay = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    onChange({ startsAt: combine(dateStr, start.time || '09:00'), endsAt: '' });
  };

  const applyDuration = (minutes: number) => {
    if (!startsAt) return;
    if (minutes === 0) {
      // Весь день — 09:00 → 18:00
      const newStart = combine(start.date, '09:00');
      const newEnd = combine(start.date, '18:00');
      onChange({ startsAt: newStart, endsAt: newEnd });
    } else {
      onChange({ startsAt, endsAt: addMinutes(startsAt, minutes) });
    }
  };

  const clearEnd = () => onChange({ startsAt, endsAt: '' });

  const invalidRange = startsAt && endsAt && new Date(endsAt) <= new Date(startsAt);

  return (
    <div className="space-y-3">
      {/* Быстрые дни */}
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => applyQuickDay(0)}
          className="text-[11px] px-2.5 py-1 rounded-md bg-brand-blue/10 text-brand-blue font-medium hover:bg-brand-blue/20">
          Сегодня
        </button>
        <button type="button" onClick={() => applyQuickDay(1)}
          className="text-[11px] px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 font-medium">
          Завтра
        </button>
        <button type="button" onClick={() => applyQuickDay(2)}
          className="text-[11px] px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 font-medium">
          Послезавтра
        </button>
        <button type="button" onClick={() => applyQuickDay(7)}
          className="text-[11px] px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 font-medium">
          Через неделю
        </button>
      </div>

      {/* Начало */}
      <div className="bg-muted/30 rounded-xl p-3 space-y-2">
        <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
          <Icon name="Play" size={10} /> Начало <span className="text-red-500">*</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={start.date} onChange={e => setStartDate(e.target.value)}
            className={`px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 ${error ? 'border-red-400' : 'border-border'}`} />
          <input type="time" value={start.time} onChange={e => setStartTime(e.target.value)}
            className={`px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 ${error ? 'border-red-400' : 'border-border'}`} />
        </div>
        <div className="flex flex-wrap gap-1">
          {TIME_PRESETS.map(t => (
            <button key={t} type="button" onClick={() => setStartTime(t)}
              className={`text-[11px] px-2 py-0.5 rounded-md font-medium transition ${
                start.time === t ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' : 'text-muted-foreground hover:bg-muted'
              }`}>
              {t}
            </button>
          ))}
        </div>
        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <Icon name="AlertCircle" size={11} /> {error}
          </p>
        )}
      </div>

      {/* Длительность */}
      {startsAt && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
            <Icon name="Clock" size={10} /> Длительность
          </div>
          <div className="flex flex-wrap gap-1">
            {DURATIONS.map(d => {
              const active = currentDuration === d.minutes
                || (d.minutes === 0 && start.time === '09:00' && end.time === '18:00' && start.date === end.date);
              return (
                <button key={d.label} type="button" onClick={() => applyDuration(d.minutes)}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition ${
                    active ? 'bg-brand-blue text-white' : 'bg-muted hover:bg-muted/80 text-foreground'
                  }`}>
                  {d.label}
                </button>
              );
            })}
            {endsAt && (
              <button type="button" onClick={clearEnd}
                className="text-[11px] px-2.5 py-1 rounded-md font-medium text-muted-foreground hover:text-red-600 hover:bg-red-50 inline-flex items-center gap-1">
                <Icon name="X" size={10} /> Без окончания
              </button>
            )}
          </div>
        </div>
      )}

      {/* Конец (если указана длительность) */}
      {endsAt && (
        <div className="bg-muted/30 rounded-xl p-3 space-y-2">
          <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1">
            <Icon name="Square" size={10} /> Окончание
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={end.date} onChange={e => setEndDate(e.target.value)}
              className={`px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 ${invalidRange ? 'border-red-400' : 'border-border'}`} />
            <input type="time" value={end.time} onChange={e => setEndTime(e.target.value)}
              className={`px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 ${invalidRange ? 'border-red-400' : 'border-border'}`} />
          </div>
          {invalidRange && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <Icon name="AlertCircle" size={11} /> Окончание должно быть позже начала
            </p>
          )}
        </div>
      )}
    </div>
  );
}
