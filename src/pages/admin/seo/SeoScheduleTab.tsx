import Icon from '@/components/ui/icon';
import { Schedule, HOURS } from './seoTypes';

interface Props {
  schedule: Schedule;
  scheduleChanged: boolean;
  savingSchedule: boolean;
  updateSchedule: (patch: Partial<Schedule>) => void;
  saveSchedule: () => void;
}

export default function SeoScheduleTab({
  schedule, scheduleChanged, savingSchedule, updateSchedule, saveSchedule,
}: Props) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">Автоматический запуск</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Каждый день в указанное время ИИ оптимизирует новые объекты без SEO
          </div>
        </div>
        <button
          onClick={() => updateSchedule({ is_enabled: !schedule.is_enabled })}
          className={`relative w-12 h-6 rounded-full transition-colors ${schedule.is_enabled ? 'bg-emerald-500' : 'bg-muted'}`}
        >
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${schedule.is_enabled ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      {schedule.is_enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Время запуска</label>
            <select
              value={schedule.run_hour}
              onChange={e => updateSchedule({ run_hour: +e.target.value })}
              className="w-full px-3 py-2 border rounded-xl text-sm"
            >
              {HOURS.map(h => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
              Объектов за один запуск (1–50)
            </label>
            <input type="number" min={1} max={50} value={schedule.batch_limit}
              onChange={e => updateSchedule({ batch_limit: Math.min(50, Math.max(1, +e.target.value)) })}
              className="w-full px-3 py-2 border rounded-xl text-sm" />
            <div className="text-xs text-muted-foreground mt-1">
              Рекомендуем 10–20 — оптимальный баланс скорости и расхода токенов
            </div>
          </div>
        </div>
      )}

      <button
        onClick={saveSchedule}
        disabled={savingSchedule || !scheduleChanged}
        className="btn-blue text-white px-5 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50"
      >
        {savingSchedule
          ? <><Icon name="Loader2" size={14} className="animate-spin" /> Сохранение...</>
          : <><Icon name="Save" size={14} /> {scheduleChanged ? 'Сохранить расписание' : 'Сохранено'}</>}
      </button>

      {/* Как работает встроенный автозапуск */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
        <div className="font-semibold text-sm flex items-center gap-2 text-emerald-800">
          <Icon name="CheckCircle2" size={14} /> Автозапуск встроен в сайт — ничего не нужно настраивать
        </div>
        <p className="text-xs text-emerald-700">
          При каждом открытии сайта посетителем браузер автоматически отправляет тихий ping-запрос на сервер.
          Сервер проверяет: включено ли расписание, наступил ли нужный час и прошло ли 23 часа с последнего запуска.
          Если всё совпало — запускает оптимизацию. Никаких сторонних сервисов.
        </p>
        <div className="flex items-center gap-2 text-xs text-emerald-700">
          <Icon name="Activity" size={12} />
          Ping отправляется раз в час с каждого устройства. Чем больше посетителей — тем точнее расписание.
        </div>
      </div>
    </div>
  );
}
