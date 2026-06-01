import { NEWS_URL } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { Schedule, HOURS, MINUTES, fmtDate } from './newsAdminTypes';

interface Props {
  schedule: Schedule;
  schedSaved: boolean;
  headers: Record<string, string>;
  onScheduleChange: (updater: (prev: Schedule) => Schedule) => void;
  onSave: () => void;
}

export function NewsAdminSchedule({ schedule, schedSaved, headers, onScheduleChange, onSave }: Props) {
  const saveSchedule = async () => {
    await fetch(NEWS_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'save_schedule', ...schedule }) });
    onSave();
    toast.success('Расписание сохранено');
  };

  return (
    <div className="bg-white rounded-2xl border border-border p-6 max-w-lg space-y-5">
      <div className="font-display font-700 flex items-center gap-2">
        <Icon name="Clock" size={18} className="text-brand-blue" />
        Расписание автогенерации
      </div>
      <div className="text-sm text-muted-foreground">
        Копирайтер автоматически генерирует статьи с картинками и сразу публикует их на сайте.
        {schedule.id && (
          <> Сейчас настроено: <strong>{String((schedule.run_hour + 3) % 24).padStart(2, '0')}:{String(schedule.run_minute || 0).padStart(2, '0')} МСК</strong>, {schedule.articles_per_run} {schedule.articles_per_run === 1 ? 'статья' : 'статьи'} в день.</>
        )}
      </div>
      <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-emerald-800">
        Статьи генерируются с уникальными фото через ИИ и автоматически публикуются.
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={schedule.is_enabled}
          onChange={e => onScheduleChange(s => ({ ...s, is_enabled: e.target.checked }))}
          className="w-4 h-4 accent-brand-blue" />
        <span className="font-medium">Включить автозапуск</span>
      </label>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Время запуска (МСК)</label>
        <div className="flex gap-2 items-center">
          <select value={schedule.run_hour} onChange={e => onScheduleChange(s => ({ ...s, run_hour: +e.target.value }))}
            className="flex-1 px-3 py-2 border rounded-lg text-sm">
            {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
          </select>
          <span className="text-muted-foreground font-bold">:</span>
          <select value={schedule.run_minute ?? 0} onChange={e => onScheduleChange(s => ({ ...s, run_minute: +e.target.value }))}
            className="w-24 px-3 py-2 border rounded-lg text-sm">
            {MINUTES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          МСК = UTC+3. Запуск произойдёт в {String((schedule.run_hour + 3) % 24).padStart(2, '0')}:{String(schedule.run_minute ?? 0).padStart(2, '0')} по московскому времени.
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Статей за один запуск</label>
        <input type="number" min={1} max={10} value={schedule.articles_per_run}
          onChange={e => onScheduleChange(s => ({ ...s, articles_per_run: +e.target.value }))}
          className="w-full px-3 py-2 border rounded-lg text-sm" />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Темы для автогенерации (каждая с новой строки)</label>
        <textarea
          value={schedule.topics ?? ''}
          onChange={e => onScheduleChange(s => ({ ...s, topics: e.target.value }))}
          placeholder={'Аренда офисов в Краснодаре\nСклады Краснодарского края\nГотовый бизнес 2025'}
          rows={4}
          className="w-full px-3 py-2 border rounded-lg text-sm resize-y font-mono"
        />
        <div className="text-xs text-muted-foreground mt-1">
          Если темы не заданы — ВБ выбирает их случайно из встроенного списка.
        </div>
      </div>

      {schedule.last_run_at && (
        <div className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
          Последний запуск: {fmtDate(schedule.last_run_at)} · Создано статей: {schedule.last_run_count ?? 0}
        </div>
      )}

      <button onClick={saveSchedule}
        className="btn-blue text-white px-6 py-2.5 rounded-xl text-sm font-semibold w-full">
        {schedSaved ? 'Сохранено!' : 'Сохранить расписание'}
      </button>
    </div>
  );
}
