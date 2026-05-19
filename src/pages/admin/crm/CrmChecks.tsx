import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CRM_CHECKS_URL as CHECKS_URL } from '@/lib/adminApi';

const SOURCE_INFO: Record<string, { label: string; color: string; desc: string }> = {
  zachestny: { label: 'ЧестныйБизнес', color: 'bg-green-100 text-green-700', desc: 'Компании и ИП' },
  newdb: { label: 'NewDB', color: 'bg-blue-100 text-blue-700', desc: 'Физлица и телефоны' },
  bezopasno: { label: 'Безопасно.org', color: 'bg-purple-100 text-purple-700', desc: 'Комплексная проверка' },
};

const CHECK_TYPES = [
  { id: 'company', label: 'Компания', placeholder: 'ИНН или название компании', icon: 'Building2' },
  { id: 'owner', label: 'Собственник', placeholder: 'ФИО или телефон', icon: 'User' },
  { id: 'property', label: 'Недвижимость', placeholder: 'Кадастровый номер или адрес', icon: 'MapPin' },
];

export default function CrmChecks() {
  const { token } = useAuth();
  const [checkType, setCheckType] = useState('company');
  const [query, setQuery] = useState('');
  const [selectedSources, setSelectedSources] = useState(['zachestny', 'newdb', 'bezopasno']);
  const [results, setResults] = useState<Record<string, { data?: unknown; error?: string; from_cache?: boolean }> | null>(null);
  const [tab, setTab] = useState<'search' | 'history' | 'quota'>('search');

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };

  const { data: serviceStatus = {} } = useQuery<Record<string, boolean>>({
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

  const { data: history = [], isLoading: historyLoading, isError: historyError } = useQuery<{ check_type: string; query_key: string; source: string; created_at: string; user?: string }[]>({
    queryKey: ['crm-checks-history'],
    queryFn: async () => {
      const r = await fetch(`${CHECKS_URL}/?action=history`, { headers });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка загрузки истории');
      return Array.isArray(json) ? json : [];
    },
    enabled: tab === 'history',
  });

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
    onSuccess: (data) => {
      setResults(data.results);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSource = (s: string) => {
    setSelectedSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const renderValue = (val: unknown, depth = 0): React.ReactNode => {
    if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
    if (typeof val === 'boolean') return <Badge variant={val ? 'default' : 'outline'}>{val ? 'Да' : 'Нет'}</Badge>;
    if (typeof val === 'string' || typeof val === 'number') return <span>{String(val)}</span>;
    if (Array.isArray(val)) {
      if (val.length === 0) return <span className="text-muted-foreground">Пусто</span>;
      return (
        <div className="space-y-1">
          {val.slice(0, 5).map((item, i) => (
            <div key={i} className={depth > 0 ? 'ml-3 border-l border-border pl-2' : ''}>
              {renderValue(item, depth + 1)}
            </div>
          ))}
          {val.length > 5 && <div className="text-xs text-muted-foreground">...ещё {val.length - 5}</div>}
        </div>
      );
    }
    if (typeof val === 'object') {
      return (
        <div className="space-y-1">
          {Object.entries(val as Record<string, unknown>).slice(0, 15).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="text-muted-foreground min-w-[120px] flex-shrink-0">{k}:</span>
              <span className="break-all">{renderValue(v, depth + 1)}</span>
            </div>
          ))}
        </div>
      );
    }
    return <span>{String(val)}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-700">Проверка безопасности</h2>
          <p className="text-sm text-muted-foreground">Проверка через внешние API с кэшированием на 30 дней</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(SOURCE_INFO).map(([src, info]) => {
            const connected = serviceStatus[src];
            return (
              <div
                key={src}
                title={connected ? 'API-ключ настроен' : 'API-ключ не настроен — перейдите в Настройки → Интеграции ИИ'}
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

      {Object.values(serviceStatus).length > 0 && Object.values(serviceStatus).every(v => !v) && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <Icon name="AlertTriangle" size={18} className="shrink-0 mt-0.5 text-amber-600" />
          <div className="text-sm">
            <div className="font-semibold mb-0.5">Ни один сервис не подключён</div>
            <div className="text-amber-800">
              Добавьте API-ключи в{' '}
              <span className="font-semibold">Настройки → Интеграции ИИ → Проверка безопасности</span>.
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        {(['search', 'history', 'quota'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === t ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'search' ? 'Проверка' : t === 'history' ? 'История' : 'Квоты'}
          </button>
        ))}
      </div>

      {tab === 'search' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-2xl border border-border p-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Тип проверки</label>
                <div className="flex flex-col gap-2 mt-2">
                  {CHECK_TYPES.map(ct => (
                    <button
                      key={ct.id}
                      onClick={() => setCheckType(ct.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition ${checkType === ct.id ? 'border-brand-blue bg-brand-blue/5 text-brand-blue' : 'border-border hover:bg-muted'}`}
                    >
                      <Icon name={ct.icon} size={16} />
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Источники</label>
                <div className="flex flex-col gap-2 mt-2">
                  {Object.entries(SOURCE_INFO).map(([src, info]) => {
                    const connected = serviceStatus[src];
                    const selected = selectedSources.includes(src);
                    return (
                      <button
                        key={src}
                        onClick={() => toggleSource(src)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-sm transition ${selected ? 'border-brand-blue bg-brand-blue/5' : 'border-border opacity-60'}`}
                      >
                        <div className="text-left">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${info.color}`}>{info.label}</span>
                            {connected === true && (
                              <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                                <Icon name="Wifi" size={10} />подключён
                              </span>
                            )}
                            {connected === false && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Icon name="WifiOff" size={10} />нет ключа
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{info.desc}</div>
                        </div>
                        <Icon name={selected ? 'CheckCircle2' : 'Circle'} size={16} className={selected ? 'text-brand-blue' : 'text-muted-foreground'} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-border p-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {CHECK_TYPES.find(c => c.id === checkType)?.label}
              </label>
              <div className="flex gap-2 mt-2">
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={CHECK_TYPES.find(c => c.id === checkType)?.placeholder}
                  className="flex-1"
                  onKeyDown={e => e.key === 'Enter' && query.trim() && !checkMutation.isPending && checkMutation.mutate()}
                />
                <Button
                  className="bg-brand-blue text-white"
                  disabled={!query.trim() || selectedSources.length === 0 || checkMutation.isPending}
                  onClick={() => checkMutation.mutate()}
                >
                  {checkMutation.isPending ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Search" size={15} />}
                </Button>
              </div>
            </div>

            {results && (
              <div className="space-y-3">
                {Object.entries(results).map(([src, res]) => (
                  <div key={src} className="bg-white rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_INFO[src]?.color || 'bg-muted text-foreground'}`}>
                          {SOURCE_INFO[src]?.label || src}
                        </span>
                        {res.from_cache && <Badge variant="outline" className="text-xs">Из кэша</Badge>}
                      </div>
                    </div>
                    {res.error ? (
                      <div className="text-red-600 text-sm flex items-center gap-2">
                        <Icon name="AlertCircle" size={15} />
                        {res.error}
                      </div>
                    ) : (
                      <div className="text-sm">{renderValue(res.data)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          {historyLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : historyError ? (
            <div className="flex items-center gap-3 p-6 text-amber-700">
              <Icon name="AlertTriangle" size={18} />
              <span className="text-sm">Не удалось загрузить историю. Проверьте подключение к сервису.</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Запрос</th>
                  <th className="text-left px-4 py-3 font-semibold">Тип</th>
                  <th className="text-left px-4 py-3 font-semibold">Источник</th>
                  <th className="text-left px-4 py-3 font-semibold">Кто</th>
                  <th className="text-left px-4 py-3 font-semibold">Дата</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">История пуста</td></tr>
                ) : history.map((h, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{h.query_key?.slice(0, 12)}...</td>
                    <td className="px-4 py-3"><Badge variant="outline">{h.check_type}</Badge></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${SOURCE_INFO[h.source]?.color || 'bg-muted'}`}>
                        {SOURCE_INFO[h.source]?.label || h.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">{h.user || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {h.created_at ? new Date(h.created_at).toLocaleString('ru', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'quota' && (
        quotaLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />)}
          </div>
        ) : quotaError ? (
          <div className="flex items-center gap-3 p-6 bg-white rounded-2xl border border-border text-amber-700">
            <Icon name="AlertTriangle" size={18} />
            <span className="text-sm">Не удалось загрузить данные о квотах.</span>
          </div>
        ) : quota.length === 0 ? (
          <div className="flex items-center gap-3 p-6 bg-white rounded-2xl border border-border text-muted-foreground">
            <Icon name="Info" size={18} />
            <span className="text-sm">Данные о квотах отсутствуют.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {quota.map(q => (
              <div key={q.source} className="bg-white rounded-2xl border border-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_INFO[q.source]?.color || 'bg-muted'}`}>
                    {SOURCE_INFO[q.source]?.label || q.source}
                  </span>
                  <span className={`text-xs font-bold ${q.percent > 80 ? 'text-red-500' : q.percent > 50 ? 'text-amber-500' : 'text-green-600'}`}>
                    {q.percent}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all ${q.percent > 80 ? 'bg-red-500' : q.percent > 50 ? 'bg-amber-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(q.percent, 100)}%` }}
                  />
                </div>
                <div className="text-sm text-muted-foreground">{q.used} / {q.limit} запросов</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}