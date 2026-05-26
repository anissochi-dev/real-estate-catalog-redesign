import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import {
  SeoStatus, Schedule, RunLog, SeoResult, seoUrl, seoHeaders,
} from './seo/seoTypes';
import SeoOverview from './seo/SeoOverview';
import SeoRunTab from './seo/SeoRunTab';
import SeoScheduleTab from './seo/SeoScheduleTab';
import SeoHistoryTab from './seo/SeoHistoryTab';
import SeoPagesTab from './seo/SeoPagesTab';
import SeoFilesTab from './seo/SeoFilesTab';

export default function SeoAdmin() {
  const { refreshToken } = useAuth();

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
  const [activeTab, setActiveTab] = useState<'run' | 'pages' | 'files' | 'schedule' | 'history'>('run');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [historyLoading, setHistoryLoading] = useState(false);

  /**
   * Универсальный вызов SEO-API с защитой от 401:
   * 1. Дублирует токен в query И в headers (Gateway режет разные поля по-разному).
   * 2. Передаёт токен также в body — backend читает его оттуда как fallback.
   * 3. При 401 делает ОДИН retry со свежим токеном из localStorage.
   * 4. Возвращает понятное сообщение об ошибке вместо HTTP-кода.
   */
  const seoCall = async (payload: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: string | null }> => {
    const doFetch = async () => {
      const tok = refreshToken();
      return fetch(seoUrl(tok), {
        method: 'POST',
        headers: seoHeaders(tok),
        body: JSON.stringify({ ...payload, auth_token: tok || undefined }),
      });
    };
    try {
      let r = await doFetch();
      if (r.status === 401) {
        // Один retry со свежим токеном — на случай если первый запрос был сделан
        // до того, как React-стейт получил актуальный токен.
        await new Promise(res => setTimeout(res, 150));
        r = await doFetch();
      }
      if (r.status === 401) {
        return { data: null, error: 'Сессия истекла — войдите заново' };
      }
      if (!r.ok) {
        return { data: null, error: `Сервис временно недоступен (код ${r.status})` };
      }
      const d = await r.json();
      if (d && d.error) return { data: null, error: String(d.error) };
      return { data: d, error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : 'Нет связи с сервером' };
    }
  };

  const loadStatus = async () => {
    setLoading(true);
    setErrorMsg('');
    const { data, error } = await seoCall({ action: 'status' });
    setLoading(false);
    if (error) { setErrorMsg(error); return; }
    if (!data) return;
    if (data.status) setStatus(data.status as SeoStatus);
    if (data.schedule) setSchedule(data.schedule as Schedule);
    if (data.recent_logs) setLogs(data.recent_logs as RunLog[]);
    setGptOk(!!data.gpt_configured);
  };

  useEffect(() => { loadStatus(); }, []);

  const saveSchedule = async () => {
    setSavingSchedule(true);
    const { error } = await seoCall({ action: 'schedule_set', ...schedule });
    setSavingSchedule(false);
    if (error) { toast.error(error); return; }
    setScheduleChanged(false);
    toast.success('Расписание сохранено');
    await loadStatus();
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    setErrorMsg('');
    const { data, error } = await seoCall({ action: 'log', limit: 50 });
    setHistoryLoading(false);
    if (error) { setErrorMsg(error); return; }
    if (data && Array.isArray(data.logs)) setLogs(data.logs as RunLog[]);
  };

  const run = async (preview = false) => {
    setRunning(true);
    setResults([]);
    setLastRun(null);
    setErrorMsg('');
    const { data, error } = await seoCall({
      action: preview ? 'preview' : 'run',
      limit,
      ...(listingId ? { listing_id: parseInt(listingId) } : {}),
    });
    setRunning(false);
    if (error) { setErrorMsg(error); return; }
    if (!data) return;
    setResults((data.results as SeoResult[]) || []);
    setLastRun({
      processed: Number(data.processed) || 0,
      errors: Number(data.errors) || 0,
      total: Number(data.total) || 0,
      dry_run: !!data.dry_run,
    });
    if (!preview) { await loadStatus(); }
  };

  const updateSchedule = (patch: Partial<Schedule>) => {
    setSchedule(s => ({ ...s, ...patch }));
    setScheduleChanged(true);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display font-700 text-2xl mb-1 flex items-center gap-2">
          <Icon name="Search" size={22} className="text-brand-blue" />
          Автоматическая SEO-оптимизация
        </h2>
        <p className="text-sm text-muted-foreground">
          ИИ генерирует Title и Description для объектов каталога и страниц сайта. Управление robots.txt и sitemap.xml,
          ручной запуск и расписание.
        </p>
      </div>

      <SeoOverview
        loading={loading}
        status={status}
        schedule={schedule}
        gptOk={gptOk}
        errorMsg={errorMsg}
        setErrorMsg={setErrorMsg}
      />

      {/* Вкладки */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex border-b border-border">
          {([
            { id: 'run', label: 'Объекты', icon: 'Zap' },
            { id: 'pages', label: 'Страницы', icon: 'FileText' },
            { id: 'files', label: 'Файлы', icon: 'FileCode2' },
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
          {activeTab === 'run' && (
            <SeoRunTab
              limit={limit}
              setLimit={setLimit}
              listingId={listingId}
              setListingId={setListingId}
              previewMode={previewMode}
              setPreviewMode={setPreviewMode}
              running={running}
              loading={loading}
              gptOk={gptOk}
              lastRun={lastRun}
              results={results}
              onRun={run}
              onRefresh={loadStatus}
            />
          )}

          {activeTab === 'pages' && (
            <SeoPagesTab token={refreshToken() || ''} gptOk={gptOk} />
          )}

          {activeTab === 'files' && (
            <SeoFilesTab token={refreshToken() || ''} />
          )}

          {activeTab === 'schedule' && (
            <SeoScheduleTab
              schedule={schedule}
              scheduleChanged={scheduleChanged}
              savingSchedule={savingSchedule}
              updateSchedule={updateSchedule}
              saveSchedule={saveSchedule}
            />
          )}

          {activeTab === 'history' && (
            <SeoHistoryTab
              logs={logs}
              historyLoading={historyLoading}
              loadHistory={loadHistory}
            />
          )}
        </div>
      </div>

      {/* Подсказка */}
      <div className="bg-muted/30 rounded-2xl p-4 space-y-1">
        <div className="font-semibold text-sm flex items-center gap-2">
          <Icon name="Info" size={14} /> Как работает
        </div>
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          <li><b>Объекты</b> — массовая генерация Title/Description для карточек каталога</li>
          <li><b>Страницы</b> — ручное и ИИ-управление мета-тегами главной, каталога, контактов и др.</li>
          <li><b>Файлы</b> — robots.txt (закрывает админку и логин) и sitemap.xml для поисковиков</li>
          <li><b>Расписание</b> — ночной автозапуск для новых объектов</li>
          <li><b>История</b> — все запуски и их результаты</li>
        </ul>
      </div>
    </div>
  );
}