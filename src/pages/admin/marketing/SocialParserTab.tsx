import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import SocialCriteriaPanel from './social-parser/SocialCriteriaPanel';
import SocialQueuePanel from './social-parser/SocialQueuePanel';
import SocialSourcesPanel from './social-parser/SocialSourcesPanel';
import SocialSessionsPanel from './social-parser/SocialSessionsPanel';

const SOCIAL_URL = 'https://functions.poehali.dev/5d1bb364-c893-4d73-a003-e119069371ff';

type SubTab = 'criteria' | 'queue' | 'sources' | 'sessions';

interface QueueStats {
  total_pending: number;
  by_platform: { platform: string; status: string; cnt: number }[];
}

export default function SocialParserTab() {
  const [subTab, setSubTab] = useState<SubTab>('criteria');
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [running, setRunning] = useState(false);
  const [cookieWarnCount, setCookieWarnCount] = useState(0);

  const token = localStorage.getItem('admin_token') || '';

  const loadStats = async () => {
    try {
      const r = await fetch(SOCIAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ action: 'queue_stats' }),
      }).then(r => r.json());
      if (!r.error) setStats(r);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadStats();
    // Проверяем свежесть кук при открытии страницы
    fetch(SOCIAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify({ action: 'sessions_list' }),
    })
      .then(r => r.json())
      .then(r => {
        if (!r.error) {
          const list: { platform: string; is_active: boolean; updated_at: string }[] = r.sessions || [];
          const warn = list.filter(
            s => s.platform !== 'telegram' && s.is_active &&
              Math.floor((Date.now() - new Date(s.updated_at).getTime()) / 86_400_000) >= 14
          ).length;
          setCookieWarnCount(warn);
        }
      })
      .catch(() => {});
  }, []);

  const handleRunAll = async () => {
    setRunning(true);
    try {
      const r = await fetch(SOCIAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ action: 'run', platform: 'all', max_posts: 50 }),
      }).then(r => r.json());
      if (r.error) { toast.error(r.error); return; }
      toast.success(`Готово — найдено ${r.total_saved ?? 0} объявлений`);
      loadStats();
    } catch { toast.error('Ошибка запуска'); }
    finally { setRunning(false); }
  };

  const pendingCount = stats?.total_pending ?? 0;

  const SUBTABS: { id: SubTab; label: string; icon: string; badge?: number; badgeColor?: string }[] = [
    { id: 'criteria', label: 'Критерии поиска', icon: 'SlidersHorizontal' },
    { id: 'queue',    label: 'Очередь',         icon: 'ClipboardList', badge: pendingCount },
    { id: 'sources',  label: 'Источники',       icon: 'Database' },
    { id: 'sessions', label: 'Сессии (куки)',   icon: 'KeyRound', badge: cookieWarnCount, badgeColor: 'bg-orange-500' },
  ];

  return (
    <div className="space-y-4">
      {/* Заголовок + кнопка запуска */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Icon name="Share2" size={20} className="text-violet-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm leading-none">Парсер соцсетей</h3>
              <p className="text-xs text-muted-foreground mt-0.5">VK · Одноклассники · Telegram</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {cookieWarnCount > 0 && (
              <button
                onClick={() => setSubTab('sessions')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl text-xs font-semibold"
              >
                <Icon name="AlertTriangle" size={13} />
                {cookieWarnCount === 1 ? 'Куки устарели — обновите' : `${cookieWarnCount} куки устарели`}
              </button>
            )}
            {pendingCount > 0 && (
              <button
                onClick={() => setSubTab('queue')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-xs font-semibold"
              >
                <Icon name="ClipboardList" size={13} />
                {pendingCount} ожидают проверки
              </button>
            )}
            <button
              onClick={handleRunAll}
              disabled={running}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
            >
              {running
                ? <><Icon name="Loader2" size={13} className="animate-spin" />Парсим…</>
                : <><Icon name="Play" size={13} />Запустить</>}
            </button>
          </div>
        </div>

        {/* Статистика платформ */}
        {stats && (
          <div className="mt-3 flex gap-3 flex-wrap">
            {(['vk', 'ok', 'telegram'] as const).map(p => {
              const rows = stats.by_platform.filter(r => r.platform === p);
              const total = rows.reduce((s, r) => s + Number(r.cnt), 0);
              const pending = rows.find(r => r.status === 'pending');
              const approved = rows.filter(r => r.status.startsWith('approved'));
              const approvedCnt = approved.reduce((s, r) => s + Number(r.cnt), 0);
              const labels: Record<string, string> = { vk: 'ВКонтакте', ok: 'Одноклассники', telegram: 'Telegram' };
              const colors: Record<string, string> = { vk: 'text-blue-600', ok: 'text-orange-500', telegram: 'text-sky-500' };
              return (
                <div key={p} className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 rounded-xl text-xs">
                  <span className={`font-medium ${colors[p]}`}>{labels[p]}</span>
                  <span className="text-muted-foreground">найдено: {total}</span>
                  {pending && <span className="text-amber-600">ожидают: {pending.cnt}</span>}
                  {approvedCnt > 0 && <span className="text-green-600">одобрено: {approvedCnt}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Подвкладки */}
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
        {SUBTABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex-shrink-0 ${
              subTab === t.id
                ? 'bg-violet-600 text-white shadow-sm'
                : 'bg-white border border-border text-foreground/70 hover:bg-muted/50'
            }`}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                subTab === t.id ? 'bg-white/20 text-white' : (t.badgeColor ?? 'bg-amber-500') + ' text-white'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Контент подвкладок */}
      {subTab === 'criteria' && <SocialCriteriaPanel token={token} apiUrl={SOCIAL_URL} onRun={loadStats} />}
      {subTab === 'queue'    && <SocialQueuePanel    token={token} apiUrl={SOCIAL_URL} onUpdate={loadStats} />}
      {subTab === 'sources'  && <SocialSourcesPanel  token={token} apiUrl={SOCIAL_URL} />}
      {subTab === 'sessions' && <SocialSessionsPanel token={token} apiUrl={SOCIAL_URL} onCookieWarning={setCookieWarnCount} />}
    </div>
  );
}