import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { CRM_CHECKS_URL as CHECKS_URL } from '@/lib/adminApi';
import { SOURCE_INFO, CheckResult } from './checks/checksTypes';
import ChecksSearchTab from './checks/ChecksSearchTab';
import { ChecksHistoryTab, ChecksQuotaTab } from './checks/ChecksHistoryTab';
import NewDbTab from './checks/NewDbTab';

type Tab = 'search' | 'newdb' | 'history' | 'quota';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'search',  label: 'Проверка',       icon: 'Search' },
  { id: 'newdb',   label: 'Физлица (NewDB)', icon: 'UserSearch' },
  { id: 'history', label: 'История',         icon: 'Clock' },
  { id: 'quota',   label: 'Квоты',           icon: 'BarChart2' },
];

export default function CrmChecks() {
  const { token } = useAuth();
  const [checkType, setCheckType] = useState('company');
  const [query, setQuery] = useState('');

  // Источники по умолчанию зависят от типа проверки
  const DEFAULT_SOURCES: Record<string, string[]> = {
    company:  ['zachestny', 'dadata'],
    owner:    ['newdb', 'bezopasno'],
    property: [],  // для property источник всегда egrn (автоматически на бэкенде)
  };
  const [selectedSources, setSelectedSources] = useState(DEFAULT_SOURCES['company']);
  const [results, setResults] = useState<Record<string, CheckResult> | null>(null);
  const [tab, setTab] = useState<Tab>('search');

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };

  interface DadataInfo {
    connected: boolean;
    balance?: number;
    services?: Record<string, number>;
    remaining?: Record<string, number>;
    date?: string;
    error?: string;
  }
  interface ServiceStatus {
    zachestny?: boolean;
    newdb?: boolean;
    bezopasno?: boolean;
    dadata?: boolean;
    dadata_info?: DadataInfo;
    [key: string]: boolean | DadataInfo | undefined;
  }
  const { data: serviceStatus = {} } = useQuery<ServiceStatus>({
    queryKey: ['crm-checks-status'],
    queryFn: async () => {
      const r = await fetch(`${CHECKS_URL}/?action=status`, { headers });
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: quota = [], isLoading: quotaLoading, isError: quotaError } = useQuery<{ source: string; used: number; limit: number; percent: number }[]>({
    queryKey: ['crm-quota'],
    queryFn: async () => {
      const r = await fetch(`${CHECKS_URL}/?action=quota`, { headers });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка загрузки квот');
      return Array.isArray(json) ? json : [];
    },
    enabled: tab === 'quota',
  });

  const { data: newdbBalance } = useQuery<Record<string, unknown>>({
    queryKey: ['crm-newdb-balance'],
    queryFn: async () => {
      const r = await fetch(`${CHECKS_URL}/?action=newdb_balance`, { headers });
      const json = await r.json();
      return json.balance || null;
    },
    enabled: tab === 'quota' && !!serviceStatus['newdb'],
    staleTime: 5 * 60_000,
  });

  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'company' | 'owner' | 'property'>('all');

  const { data: history = [], isLoading: historyLoading, isError: historyError } = useQuery<{ check_type: string; query_key: string; sources: string[]; created_at: string; user?: string }[]>({
    queryKey: ['crm-checks-history', historySearch, historyFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ action: 'history' });
      if (historySearch.trim()) params.set('search', historySearch.trim());
      if (historyFilter !== 'all') params.set('check_type', historyFilter);
      const r = await fetch(`${CHECKS_URL}/?${params.toString()}`, { headers });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка загрузки истории');
      return Array.isArray(json) ? json : [];
    },
    enabled: tab === 'history',
  });

  const loadCachedResult = async (check_type: string, query_key: string) => {
    try {
      const r = await fetch(
        `${CHECKS_URL}/?action=cached&check_type=${encodeURIComponent(check_type)}&query_key=${encodeURIComponent(query_key)}`,
        { headers }
      );
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      setResults(json.results);
      setTab('search');
      toast.success('Результат загружен из кэша');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const checkMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${CHECKS_URL}/`, {
        method: 'POST', headers,
        body: JSON.stringify({ check_type: checkType, query, sources: selectedSources }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: (data) => { setResults(data.results); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSetCheckType = (type: string) => {
    setCheckType(type);
    setSelectedSources(DEFAULT_SOURCES[type] || []);
    setResults(null);
  };

  const toggleSource = (s: string) => {
    setSelectedSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  return (
    <div className="space-y-6">
      {/* Заголовок + статус сервисов */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-700">Проверка безопасности</h2>
          <p className="text-sm text-muted-foreground">Проверка через внешние API с кэшированием на 30 дней</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(SOURCE_INFO).map(([src, info]) => {
            if (src === 'egrn') return null;
            const connected = !!serviceStatus[src];
            return (
              <div
                key={src}
                title={connected ? 'API-ключ настроен' : 'API-ключ не настроен'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition ${
                  connected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-border bg-muted/50 text-muted-foreground'
                }`}
              >
                <Icon
                  name={connected ? 'CheckCircle2' : 'CircleDashed'}
                  size={13}
                  className={connected ? 'text-emerald-500' : 'text-muted-foreground'}
                />
                {info.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Баннер: показываем только если хотя бы один ключ получен с сервера */}
      {Object.keys(serviceStatus).length > 0 && (
        (['zachestny', 'newdb', 'bezopasno', 'dadata'] as const).some(k => serviceStatus[k]) ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            <Icon name="CheckCircle2" size={16} className="shrink-0 text-emerald-600" />
            <span>
              Подключено сервисов: <strong>{(['zachestny', 'newdb', 'bezopasno', 'dadata'] as const).filter(k => serviceStatus[k]).length}</strong> из 4.{' '}
              {(['zachestny', 'newdb', 'bezopasno', 'dadata'] as const).every(k => serviceStatus[k]) ? 'Все сервисы активны.' : 'Остальные можно подключить в Настройках → Интеграции.'}
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
            <Icon name="AlertTriangle" size={18} className="shrink-0 mt-0.5 text-amber-600" />
            <div className="text-sm">
              <div className="font-semibold mb-0.5">Ни один сервис не подключён</div>
              <div className="text-amber-800">
                Добавьте API-ключи в{' '}
                <span className="font-semibold">Настройки → Интеграции → Проверка безопасности</span>.
              </div>
            </div>
          </div>
        )
      )}

      {/* Вкладки */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === t.id ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name={t.icon} fallback="Circle" size={14} />
            {t.label}
            {t.id === 'newdb' && (
              <span className="ml-1 text-[10px] font-bold bg-brand-blue text-white px-1.5 py-0.5 rounded-full leading-none">
                12
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Контент вкладок */}
      {tab === 'search' && (
        <ChecksSearchTab
          checkType={checkType}
          setCheckType={handleSetCheckType}
          query={query}
          setQuery={setQuery}
          selectedSources={selectedSources}
          toggleSource={toggleSource}
          serviceStatus={serviceStatus}
          results={results}
          isPending={checkMutation.isPending}
          onRun={() => checkMutation.mutate()}
        />
      )}

      {tab === 'newdb' && (
        <NewDbTab newdbConnected={!!serviceStatus['newdb']} />
      )}

      {tab === 'history' && (
        <ChecksHistoryTab
          historySearch={historySearch}
          setHistorySearch={setHistorySearch}
          historyFilter={historyFilter}
          setHistoryFilter={setHistoryFilter}
          history={history}
          historyLoading={historyLoading}
          historyError={historyError}
          onLoadCached={loadCachedResult}
        />
      )}

      {tab === 'quota' && (
        <ChecksQuotaTab
          quota={quota}
          quotaLoading={quotaLoading}
          quotaError={quotaError}
          newdbBalance={newdbBalance}
          dadataInfo={serviceStatus.dadata_info}
        />
      )}
    </div>
  );
}