import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { getToken } from '@/lib/adminApi';

const ADMIN_URL = 'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';

interface ConsentLogItem {
  id: number;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  documents_opened: string[] | string | null;
  page_url: string | null;
  session_id: string | null;
}

interface Stats {
  total: number;
  today: number;
  week: number;
  month: number;
}

type Period = 'all' | 'today' | 'week' | 'month';

const DOC_LABELS: Record<string, { label: string; color: string }> = {
  privacy: { label: 'Политика', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  personal: { label: 'ПД', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  marketing: { label: 'Рассылки', color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function shortenUA(ua: string | null): string {
  if (!ua) return '—';
  // Простое определение устройства
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone/iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Браузер';
}

function fmtDate(s: string): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('ru', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return s;
  }
}

function parseDocs(raw: ConsentLogItem['documents_opened']): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(raw as string);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export default function ConsentLogSection() {
  const [stats, setStats] = useState<Stats>({ total: 0, today: 0, week: 0, month: 0 });
  const [logs, setLogs] = useState<ConsentLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [ipFilter, setIpFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  const buildQuery = (extra: Record<string, string | number> = {}) => {
    const t = getToken();
    const p = new URLSearchParams();
    p.set('resource', 'consent_log');
    if (period !== 'all') p.set('period', period);
    if (ipFilter.trim()) p.set('ip', ipFilter.trim());
    if (t) p.set('auth_token', t);
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return p.toString();
  };

  const headers = () => {
    const t = getToken();
    return {
      'Content-Type': 'application/json',
      ...(t ? { 'X-Auth-Token': t, 'X-Authorization': t, Authorization: `Bearer ${t}` } : {}),
    };
  };

  const loadStats = async () => {
    try {
      const r = await fetch(`${ADMIN_URL}?${buildQuery({ action: 'stats' })}`, { headers: headers() });
      if (!r.ok) return;
      const d = await r.json();
      setStats({
        total: Number(d.total) || 0,
        today: Number(d.today) || 0,
        week: Number(d.week) || 0,
        month: Number(d.month) || 0,
      });
    } catch {
      // ignore
    }
  };

  const loadLogs = async (p: number = 1) => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${ADMIN_URL}?${buildQuery({ page: p, limit })}`, { headers: headers() });
      if (r.status === 401) { setError('Сессия истекла — войдите заново'); return; }
      if (r.status === 403) { setError('Доступ только для администратора и директора'); return; }
      if (!r.ok) { setError(`Не удалось загрузить журнал (код ${r.status})`); return; }
      const d = await r.json();
      const list = Array.isArray(d.logs) ? d.logs : [];
      if (p === 1) {
        setLogs(list);
      } else {
        setLogs(prev => [...prev, ...list]);
      }
      setTotal(Number(d.total) || 0);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const applyIpFilter = () => {
    setPage(1);
    loadStats();
    loadLogs(1);
  };

  const exportCsv = () => {
    const url = `${ADMIN_URL}?${buildQuery({ action: 'export' })}`;
    window.open(url, '_blank');
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon name="ScrollText" size={18} className="text-brand-blue" />
          <div>
            <div className="font-display font-700 text-base sm:text-lg">Журнал принятых согласий</div>
            <div className="text-xs text-muted-foreground">Кто и когда соглашался с документами на сайте — для юр. защиты</div>
          </div>
        </div>
        <button
          onClick={exportCsv}
          className="text-xs sm:text-sm px-3 py-2 rounded-lg border hover:bg-muted inline-flex items-center gap-1.5"
        >
          <Icon name="Download" size={13} /> Экспорт CSV
        </button>
      </div>

      {/* Счётчики */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-slate-50 rounded-xl px-3 py-2.5">
          <div className="text-[11px] text-muted-foreground">Всего</div>
          <div className="font-display font-700 text-xl">{stats.total}</div>
        </div>
        <div className="bg-emerald-50 rounded-xl px-3 py-2.5">
          <div className="text-[11px] text-emerald-700/70">Сегодня</div>
          <div className="font-display font-700 text-xl text-emerald-700">{stats.today}</div>
        </div>
        <div className="bg-sky-50 rounded-xl px-3 py-2.5">
          <div className="text-[11px] text-sky-700/70">За 7 дней</div>
          <div className="font-display font-700 text-xl text-sky-700">{stats.week}</div>
        </div>
        <div className="bg-amber-50 rounded-xl px-3 py-2.5">
          <div className="text-[11px] text-amber-700/70">За 30 дней</div>
          <div className="font-display font-700 text-xl text-amber-700">{stats.month}</div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {([
            ['all', 'Все'], ['today', 'Сегодня'], ['week', '7 дней'], ['month', '30 дней'],
          ] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setPeriod(k as Period)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                period === k ? 'bg-white shadow text-brand-blue' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            value={ipFilter}
            onChange={e => setIpFilter(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyIpFilter(); }}
            placeholder="Поиск по IP…"
            className="px-3 py-1.5 border rounded-lg text-xs w-44"
          />
          <button
            onClick={applyIpFilter}
            className="px-3 py-1.5 rounded-lg border hover:bg-muted text-xs inline-flex items-center gap-1"
          >
            <Icon name="Search" size={12} /> Найти
          </button>
          {ipFilter && (
            <button
              onClick={() => { setIpFilter(''); setTimeout(() => { setPage(1); loadStats(); loadLogs(1); }, 0); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <Icon name="X" size={13} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <Icon name="AlertCircle" size={14} /> {error}
        </div>
      )}

      {/* Таблица */}
      {loading && logs.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-8">
          <Icon name="Loader2" size={20} className="animate-spin mx-auto mb-2" />
          Загрузка…
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-8">
          Согласий пока нет
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Дата</th>
                  <th className="text-left px-3 py-2 font-medium">IP-адрес</th>
                  <th className="text-left px-3 py-2 font-medium">Устройство</th>
                  <th className="text-left px-3 py-2 font-medium">Документы</th>
                  <th className="text-left px-3 py-2 font-medium">Страница</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map(item => {
                  const docs = parseDocs(item.documents_opened);
                  return (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(item.accepted_at)}</td>
                      <td className="px-3 py-2 text-xs font-mono">{item.ip_address || '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        <span title={item.user_agent || ''}>{shortenUA(item.user_agent)}</span>
                      </td>
                      <td className="px-3 py-2">
                        {docs.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">не открывал</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {docs.map(d => {
                              const meta = DOC_LABELS[d];
                              return (
                                <span
                                  key={d}
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                    meta?.color || 'bg-slate-50 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {meta?.label || d}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={item.page_url || ''}>
                        {item.page_url || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {logs.length < total && (
            <div className="p-3 border-t border-border bg-muted/20 text-center">
              <button
                onClick={() => loadLogs(page + 1)}
                disabled={loading}
                className="text-xs px-4 py-2 rounded-lg border bg-white hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Icon name={loading ? 'Loader2' : 'ChevronDown'} size={13} className={loading ? 'animate-spin' : ''} />
                Показать ещё ({total - logs.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
