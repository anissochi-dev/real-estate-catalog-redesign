import Icon from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { SOURCE_INFO } from './checksTypes';

interface HistoryItem {
  check_type: string;
  query_key: string;
  sources: string[];
  created_at: string;
  user?: string;
}

interface QuotaItem {
  source: string;
  used: number;
  limit: number;
  percent: number;
}

interface HistoryTabProps {
  historySearch: string;
  setHistorySearch: (v: string) => void;
  historyFilter: 'all' | 'company' | 'owner' | 'property';
  setHistoryFilter: (v: 'all' | 'company' | 'owner' | 'property') => void;
  history: HistoryItem[];
  historyLoading: boolean;
  historyError: boolean;
  onLoadCached: (check_type: string, query_key: string) => void;
}

interface QuotaTabProps {
  quota: QuotaItem[];
  quotaLoading: boolean;
  quotaError: boolean;
  newdbBalance?: Record<string, unknown> | null;
}

export function ChecksHistoryTab({
  historySearch, setHistorySearch,
  historyFilter, setHistoryFilter,
  history, historyLoading, historyError,
  onLoadCached,
}: HistoryTabProps) {
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-border p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={historySearch}
            onChange={e => setHistorySearch(e.target.value)}
            placeholder="Поиск в результатах истории"
            className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-sm"
          />
        </div>
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
          {([
            { key: 'all', label: 'Все' },
            { key: 'company', label: 'Компании' },
            { key: 'owner', label: 'Собственники' },
            { key: 'property', label: 'Недвижимость' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setHistoryFilter(opt.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                historyFilter === opt.key
                  ? 'bg-white text-brand-blue shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

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
                <th className="text-left px-4 py-3 font-semibold">Тип</th>
                <th className="text-left px-4 py-3 font-semibold">Источники</th>
                <th className="text-left px-4 py-3 font-semibold">Кто</th>
                <th className="text-left px-4 py-3 font-semibold">Дата</th>
                <th className="text-right px-4 py-3 font-semibold">Действие</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">История пуста</td></tr>
              ) : history.map((h, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3"><Badge variant="outline">{h.check_type}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(h.sources || []).map(s => (
                        <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${SOURCE_INFO[s]?.color || 'bg-muted'}`}>
                          {SOURCE_INFO[s]?.label || s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">{h.user || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {h.created_at ? new Date(h.created_at).toLocaleString('ru', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onLoadCached(h.check_type, h.query_key)}
                      className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1"
                    >
                      <Icon name="Eye" size={12} /> Открыть
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function ChecksQuotaTab({ quota, quotaLoading, quotaError, newdbBalance }: QuotaTabProps) {
  if (quotaLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />)}
      </div>
    );
  }
  if (quotaError) {
    return (
      <div className="flex items-center gap-3 p-6 bg-white rounded-2xl border border-border text-amber-700">
        <Icon name="AlertTriangle" size={18} />
        <span className="text-sm">Не удалось загрузить данные о квотах.</span>
      </div>
    );
  }
  if (quota.length === 0) {
    return (
      <div className="flex items-center gap-3 p-6 bg-white rounded-2xl border border-border text-muted-foreground">
        <Icon name="Info" size={18} />
        <span className="text-sm">Данные о квотах отсутствуют.</span>
      </div>
    );
  }
  return (
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
      {/* Баланс NewDB от самого сервиса */}
      {newdbBalance && !('error' in newdbBalance) && (() => {
        // Человекопонятные названия полей NewDB
        const FIELD_LABELS: Record<string, string> = {
          balance:        'Баланс (руб.)',
          requests_left:  'Запросов осталось',
          requests_used:  'Запросов использовано',
          requests_limit: 'Лимит запросов',
          plan:           'Тариф',
          expires_at:     'Действует до',
          email:          'Email аккаунта',
        };
        const HIDDEN = new Set(['token', 'api_key', 'key', 'secret']);
        const entries = Object.entries(newdbBalance).filter(([k]) => !HIDDEN.has(k));
        if (entries.length === 0) return null;
        return (
          <div className="sm:col-span-3 bg-white rounded-2xl border border-blue-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">NewDB</span>
              <span className="text-sm font-semibold text-foreground">Аккаунт NewDB (реальные данные)</span>
              <Icon name="ShieldCheck" size={14} className="text-emerald-500 ml-auto" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {entries.map(([key, val]) => (
                <div key={key} className="bg-muted/30 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-brand-blue">{String(val ?? '—')}</div>
                  <div className="text-xs text-muted-foreground mt-1">{FIELD_LABELS[key] || key.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <Icon name="Info" size={11} />
              Баланс — рублёвый счёт аккаунта NewDB. Запросы тарифицируются отдельно по методу.
            </p>
          </div>
        );
      })()}
      {newdbBalance && 'error' in newdbBalance && (
        <div className="sm:col-span-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-2 text-sm text-amber-800">
          <Icon name="AlertTriangle" size={15} />
          NewDB баланс: {String(newdbBalance.error)}
        </div>
      )}
    </div>
  );
}