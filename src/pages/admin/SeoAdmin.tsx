import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import {
  SeoStatus, Schedule, RunLog, SeoResult, seoUrl,
} from './seo/seoTypes';
import SeoOverview from './seo/SeoOverview';
import SeoRunTab from './seo/SeoRunTab';
import SeoScheduleTab from './seo/SeoScheduleTab';
import SeoHistoryTab from './seo/SeoHistoryTab';
import SeoPagesTab from './seo/SeoPagesTab';
import SeoFilesTab from './seo/SeoFilesTab';

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
  const [activeTab, setActiveTab] = useState<'run' | 'pages' | 'files' | 'schedule' | 'history'>('run');
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
            <SeoPagesTab token={token || ''} gptOk={gptOk} />
          )}

          {activeTab === 'files' && (
            <SeoFilesTab token={token || ''} />
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