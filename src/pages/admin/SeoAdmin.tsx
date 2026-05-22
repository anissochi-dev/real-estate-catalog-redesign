import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';

const SEO_BASE = 'https://functions.poehali.dev/068e7fac-cea4-46c6-9ad2-a02f1f5e250d';
const seoUrl = (token: string) => token ? `${SEO_BASE}?auth_token=${encodeURIComponent(token)}` : SEO_BASE;

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, '0')}:00 UTC (${String((i + 3) % 24).padStart(2, '0')}:00 МСК)`,
}));

interface SeoStatus {
  total_active: number;
  no_seo_title: number;
  no_seo_desc: number;
  no_desc: number;
}

interface Schedule {
  id?: number;
  is_enabled: boolean;
  run_hour: number;
  batch_limit: number;
  last_run_at?: string | null;
  last_run_processed?: number | null;
  last_run_errors?: number | null;
}

interface RunLog {
  id: number;
  triggered_by: string;
  processed: number;
  errors: number;
  total: number;
  dry_run: boolean;
  started_at: string;
  finished_at?: string | null;
}

interface SeoResult {
  id: number;
  status: 'ok' | 'error';
  seo_title?: string;
  seo_description?: string;
  error?: string;
}

const TRIGGER_LABELS: Record<string, { label: string; color: string }> = {
  manual: { label: 'Вручную', color: 'text-blue-600 bg-blue-50' },
  schedule: { label: 'Расписание', color: 'text-emerald-600 bg-emerald-50' },
  preview: { label: 'Превью', color: 'text-amber-600 bg-amber-50' },
};

export default function SeoAdmin() {
  const { token } = useAuth();
  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };

  const [status, setStatus] = useState<SeoStatus | null>(null);
  const [schedule, setSchedule] = useState<Schedule>({ is_enabled: true, run_hour: 3, batch_limit: 20 });
  const [scheduleChanged, setScheduleChanged] = useState(false);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [gptOk, setGptOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [results, setResults] = useState<SeoResult[]>([]);
  const [limit, setLimit] = useState(10);
  const [previewMode, setPreviewMode] = useState(false);
  const [listingId, setListingId] = useState('');
  const [lastRun, setLastRun] = useState<{ processed: number; errors: number; total: number; dry_run: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<'run' | 'schedule' | 'history'>('run');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const r = await fetch(seoUrl(token || ''), {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'status' }),
      });
      if (!r.ok) {
        setErrorMsg(`Не удалось загрузить статус (HTTP ${r.status})`);
        return;
      }
      const d = await r.json();
      if (d.error) { setErrorMsg(d.error); return; }
      if (d.status) setStatus(d.status);
      if (d.schedule) setSchedule(d.schedule);
      if (d.recent_logs) setLogs(d.recent_logs);
      setGptOk(!!d.gpt_configured);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const saveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const r = await fetch(seoUrl(token || ''), {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'schedule_set', ...schedule }),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      setScheduleChanged(false);
      await loadStatus();
    } finally {
      setSavingSchedule(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    setErrorMsg('');
    try {
      const r = await fetch(seoUrl(token || ''), {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'log', limit: 50 }),
      });
      if (!r.ok) {
        setErrorMsg(`Не удалось загрузить историю (HTTP ${r.status})`);
        return;
      }
      const d = await r.json();
      if (d.error) { setErrorMsg(d.error); return; }
      setLogs(d.logs || []);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setHistoryLoading(false);
    }
  };

  const run = async (preview = false) => {
    setRunning(true);
    setResults([]);
    setLastRun(null);
    setErrorMsg('');
    try {
      const r = await fetch(seoUrl(token || ''), {
        method: 'POST', headers,
        body: JSON.stringify({
          action: preview ? 'preview' : 'run',
          limit,
          ...(listingId ? { listing_id: parseInt(listingId) } : {}),
        }),
      });
      const d = await r.json();
      if (d.error) { setErrorMsg(d.error); return; }
      setResults(d.results || []);
      setLastRun({ processed: d.processed, errors: d.errors, total: d.total, dry_run: d.dry_run });
      if (!preview) { await loadStatus(); }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setRunning(false);
    }
  };

  const updateSchedule = (patch: Partial<Schedule>) => {
    setSchedule(s => ({ ...s, ...patch }));
    setScheduleChanged(true);
  };

  const coverage = status
    ? Math.round(((status.total_active - status.no_seo_title) / Math.max(status.total_active, 1)) * 100)
    : 0;

  const fmtDate = (s?: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const fmtDuration = (start: string, end?: string | null) => {
    if (!end) return '';
    const sec = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    if (sec < 60) return `${sec}с`;
    return `${Math.floor(sec / 60)}м ${sec % 60}с`;
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display font-700 text-2xl mb-1 flex items-center gap-2">
          <Icon name="Search" size={22} className="text-brand-blue" />
          Автоматическая SEO-оптимизация
        </h2>
        <p className="text-sm text-muted-foreground">
          ИИ генерирует SEO Title и Description для объектов каталога. Поддерживает ручной запуск и расписание.
        </p>
      </div>

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

      {/* Универсальный баннер ошибок */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <Icon name="AlertCircle" size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-red-800 text-sm">Ошибка</div>
            <div className="text-xs text-red-700 mt-0.5 break-words">{errorMsg}</div>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-600 text-xs">
            <Icon name="X" size={14} />
          </button>
        </div>
      )}

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

      {/* Вкладки */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex border-b border-border">
          {([
            { id: 'run', label: 'Запуск', icon: 'Zap' },
            { id: 'schedule', label: 'Расписание', icon: 'Clock' },
            { id: 'history', label: 'История', icon: 'History' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (tab.id === 'history') loadHistory(); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition border-b-2 ${
                activeTab === tab.id
                  ? 'border-brand-blue text-brand-blue'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={tab.icon} size={15} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Вкладка Запуск */}
          {activeTab === 'run' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Объектов за раз (1–50)</label>
                  <input type="number" min={1} max={50} value={limit}
                    onChange={e => setLimit(Math.min(50, Math.max(1, +e.target.value)))}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">ID объекта (опционально)</label>
                  <input type="number" placeholder="Оставьте пустым для авто"
                    value={listingId} onChange={e => setListingId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={previewMode}
                      onChange={e => setPreviewMode(e.target.checked)} className="w-4 h-4" />
                    <div>
                      <div className="font-medium">Только просмотр</div>
                      <div className="text-xs text-muted-foreground">Не сохранять в БД</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => run(previewMode)} disabled={running || !gptOk}
                  className="btn-blue text-white px-5 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50">
                  {running
                    ? <><Icon name="Loader2" size={15} className="animate-spin" /> Генерация...</>
                    : <><Icon name="Sparkles" size={15} /> {previewMode ? 'Предпросмотр' : 'Запустить'}</>}
                </button>
                <button onClick={loadStatus} disabled={loading}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted inline-flex items-center gap-2">
                  <Icon name="RefreshCw" size={14} /> Обновить
                </button>
              </div>

              {lastRun && (
                <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${lastRun.errors > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                  <Icon name={lastRun.errors > 0 ? 'AlertCircle' : 'CheckCircle2'} size={16} />
                  Обработано: <strong>{lastRun.processed}</strong> из {lastRun.total}
                  {lastRun.errors > 0 && <>, ошибок: <strong className="text-red-600">{lastRun.errors}</strong></>}
                  {lastRun.dry_run && <span className="text-xs opacity-70 ml-1">(превью — не сохранено)</span>}
                </div>
              )}

              {results.length > 0 && (
                <div>
                  <div className="font-semibold text-sm mb-2">Результаты</div>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {results.map(r => (
                      <div key={r.id} className={`p-3 rounded-xl border text-sm ${r.status === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon name={r.status === 'ok' ? 'CheckCircle2' : 'XCircle'} size={14}
                            className={r.status === 'ok' ? 'text-emerald-600' : 'text-red-500'} />
                          <span className="font-semibold">Объект #{r.id}</span>
                        </div>
                        {r.status === 'ok' ? (
                          <div className="space-y-0.5">
                            <div className="text-xs"><span className="font-medium text-muted-foreground">Title:</span> {r.seo_title}</div>
                            <div className="text-xs"><span className="font-medium text-muted-foreground">Desc:</span> {r.seo_description}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-red-600">{r.error}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Вкладка Расписание */}
          {activeTab === 'schedule' && (
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
          )}

          {/* Вкладка История */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Показаны последние {logs.length} запусков (макс. 50)
                </div>
                <button onClick={loadHistory} disabled={historyLoading}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50">
                  <Icon name={historyLoading ? 'Loader2' : 'RefreshCw'} size={12} className={historyLoading ? 'animate-spin' : ''} />
                  Обновить
                </button>
              </div>
              {historyLoading && logs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  <Icon name="Loader2" size={24} className="mx-auto mb-2 animate-spin opacity-60" />
                  Загружаю историю...
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  <Icon name="History" size={32} className="mx-auto mb-2 opacity-40" />
                  История запусков пуста
                </div>
              ) : (
                logs.map(log => {
                  const trig = TRIGGER_LABELS[log.triggered_by] || { label: log.triggered_by, color: 'text-muted-foreground bg-muted' };
                  const dur = fmtDuration(log.started_at, log.finished_at);
                  return (
                    <div key={log.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-white hover:bg-muted/30 transition">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${log.errors > 0 ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                        <Icon name={log.errors > 0 ? 'AlertTriangle' : 'CheckCircle2'} size={16}
                          className={log.errors > 0 ? 'text-amber-600' : 'text-emerald-600'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${trig.color}`}>
                            {trig.label}
                          </span>
                          {log.dry_run && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              превью
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">{fmtDate(log.started_at)}</span>
                          {dur && <span className="text-xs text-muted-foreground">· {dur}</span>}
                        </div>
                        <div className="text-xs mt-0.5 text-foreground">
                          {log.processed} обработано из {log.total}
                          {log.errors > 0 && <span className="text-red-600 ml-1">· {log.errors} ошибок</span>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Подсказка */}
      <div className="bg-muted/30 rounded-2xl p-4 space-y-1">
        <div className="font-semibold text-sm flex items-center gap-2">
          <Icon name="Info" size={14} /> Как работает
        </div>
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Выбирает активные объекты без seo_title (или конкретный по ID)</li>
          <li>YandexGPT генерирует уникальный Title (65 симв.) и Description (155 симв.)</li>
          <li>Расписание автоматически обрабатывает новые объекты каждую ночь</li>
          <li>Все запуски сохраняются в истории</li>
        </ul>
      </div>
    </div>
  );
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