import { useState } from 'react';
import { NEWS_URL } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { Schedule, HOURS, MINUTES, AUTO_TOPICS_GROUPS, fmtDate } from './newsAdminTypes';

interface Props {
  schedule: Schedule;
  schedSaved: boolean;
  headers: Record<string, string>;
  onScheduleChange: (updater: (prev: Schedule) => Schedule) => void;
  onSave: () => void;
}

export function NewsAdminSchedule({ schedule, schedSaved, headers, onScheduleChange, onSave }: Props) {
  const [showTopics, setShowTopics] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>('Общий рынок');

  const saveSchedule = async () => {
    await fetch(NEWS_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'save_schedule', ...schedule }) });
    onSave();
    toast.success('Расписание сохранено');
  };

  const addTopic = (topic: string) => {
    onScheduleChange(s => {
      const current = (s.topics ?? '').trim();
      const lines = current ? current.split('\n').map(l => l.trim()).filter(Boolean) : [];
      if (lines.includes(topic)) {
        toast('Тема уже добавлена');
        return s;
      }
      return { ...s, topics: [...lines, topic].join('\n') };
    });
  };

  const removeTopic = (topic: string) => {
    onScheduleChange(s => {
      const lines = (s.topics ?? '').split('\n').map(l => l.trim()).filter(l => l && l !== topic);
      return { ...s, topics: lines.join('\n') };
    });
  };

  const activeTags = (schedule.topics ?? '').split('\n').map(l => l.trim()).filter(Boolean);

  return (
    <div className="bg-white rounded-2xl border border-border p-6 max-w-2xl space-y-5">
      <div className="font-display font-700 flex items-center gap-2">
        <Icon name="Clock" size={18} className="text-brand-blue" />
        Расписание автогенерации
      </div>
      <div className="text-sm text-muted-foreground">
        Копирайтер анализирует свежие новости и публикует статьи автоматически.
        {schedule.id && (
          <> Сейчас: <strong>{String((schedule.run_hour + 3) % 24).padStart(2, '0')}:{String(schedule.run_minute || 0).padStart(2, '0')} МСК</strong>, {schedule.articles_per_run} {schedule.articles_per_run === 1 ? 'статья' : 'статьи'} в день.</>
        )}
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
          Запуск в {String((schedule.run_hour + 3) % 24).padStart(2, '0')}:{String(schedule.run_minute ?? 0).padStart(2, '0')} по московскому времени.
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Статей за один запуск</label>
        <input type="number" min={1} max={10} value={schedule.articles_per_run}
          onChange={e => onScheduleChange(s => ({ ...s, articles_per_run: +e.target.value }))}
          className="w-full px-3 py-2 border rounded-lg text-sm" />
      </div>

      {/* Темы */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-muted-foreground font-medium">Темы для автогенерации</label>
          <button
            onClick={() => setShowTopics(v => !v)}
            className="flex items-center gap-1 text-xs text-brand-blue hover:underline"
          >
            <Icon name={showTopics ? 'ChevronUp' : 'ListPlus'} size={13} />
            {showTopics ? 'Скрыть каталог' : 'Выбрать из каталога'}
          </button>
        </div>

        {/* Активные темы — теги */}
        {activeTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {activeTags.map(t => (
              <span key={t} className="inline-flex items-center gap-1 text-xs bg-brand-blue/10 text-brand-blue rounded-lg px-2 py-1">
                <span className="line-clamp-1 max-w-[260px]">{t}</span>
                <button onClick={() => removeTopic(t)} className="shrink-0 hover:text-red-500 transition">
                  <Icon name="X" size={11} />
                </button>
              </span>
            ))}
            <button onClick={() => onScheduleChange(s => ({ ...s, topics: '' }))}
              className="text-xs text-muted-foreground hover:text-red-500 transition px-1">
              очистить всё
            </button>
          </div>
        )}

        {/* Текстовое поле */}
        <textarea
          value={schedule.topics ?? ''}
          onChange={e => onScheduleChange(s => ({ ...s, topics: e.target.value }))}
          placeholder={'Можно добавить темы из каталога выше или написать свои — каждая с новой строки'}
          rows={activeTags.length > 0 ? 2 : 3}
          className="w-full px-3 py-2 border rounded-lg text-sm resize-y font-mono"
        />
        <div className="text-xs text-muted-foreground mt-1">
          Если темы не выбраны — ИИ случайно берёт из встроенного каталога ({AUTO_TOPICS_GROUPS.flatMap(g => g.topics).length} тем).
        </div>

        {/* Каталог тем */}
        {showTopics && (
          <div className="mt-3 border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Icon name="Library" size={13} />
              Каталог тем — нажмите на тему чтобы добавить
            </div>
            <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
              {AUTO_TOPICS_GROUPS.map(group => (
                <div key={group.label}>
                  <button
                    onClick={() => setOpenGroup(openGroup === group.label ? null : group.label)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/20 transition text-left"
                  >
                    <span className="flex items-center gap-2">
                      {group.label}
                      <span className="text-xs text-muted-foreground font-normal">{group.topics.length} тем</span>
                    </span>
                    <Icon name={openGroup === group.label ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-muted-foreground" />
                  </button>
                  {openGroup === group.label && (
                    <div className="px-3 pb-2 space-y-1">
                      {group.topics.map(topic => {
                        const added = activeTags.includes(topic);
                        return (
                          <button
                            key={topic}
                            onClick={() => !added && addTopic(topic)}
                            disabled={added}
                            className={`w-full text-left text-xs px-3 py-2 rounded-lg transition flex items-start gap-2 ${
                              added
                                ? 'bg-brand-blue/10 text-brand-blue cursor-default'
                                : 'hover:bg-muted/40 text-foreground/80'
                            }`}
                          >
                            <Icon name={added ? 'Check' : 'Plus'} size={12} className="mt-0.5 shrink-0" />
                            <span>{topic}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
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
