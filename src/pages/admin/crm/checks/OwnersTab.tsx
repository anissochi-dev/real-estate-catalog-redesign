import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CRM_CHECKS_URL } from '@/lib/adminApi';
import { SOURCE_INFO, CheckResult } from './checksTypes';

// ── Типы ──────────────────────────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  type?: 'text' | 'date';
}

interface MethodMeta {
  id: string;
  label: string;
  desc: string;
  icon: string;
  fields: FieldDef[];
  risk: 'high' | 'medium' | 'low';
}

// ── 12 методов NewDB ──────────────────────────────────────────────────────────

const METHODS: MethodMeta[] = [
  {
    id: 'complex_by_passport',
    label: 'Комплексная проверка',
    desc: 'МВД + ФНС + ФССП по паспорту — самый полный вариант',
    icon: 'ShieldCheck',
    risk: 'high',
    fields: [
      { key: 'lastname',   label: 'Фамилия',        placeholder: 'Иванов',      required: true },
      { key: 'firstname',  label: 'Имя',             placeholder: 'Иван',        required: true },
      { key: 'secondname', label: 'Отчество',        placeholder: 'Иванович',    required: false },
      { key: 'dob',        label: 'Дата рождения',   placeholder: '1990-01-01',  required: true, type: 'date' },
      { key: 'seria',      label: 'Серия паспорта',  placeholder: '1234',        required: true },
      { key: 'number',     label: 'Номер паспорта',  placeholder: '567890',      required: true },
    ],
  },
  {
    id: 'fssp_person',
    label: 'Долги ФССП',
    desc: 'Исполнительные производства — долги, взыскания',
    icon: 'Gavel',
    risk: 'high',
    fields: [
      { key: 'lastname',   label: 'Фамилия',      placeholder: 'Иванов',     required: true },
      { key: 'firstname',  label: 'Имя',           placeholder: 'Иван',       required: true },
      { key: 'secondname', label: 'Отчество',      placeholder: 'Иванович',   required: false },
      { key: 'dob',        label: 'Дата рождения', placeholder: '1990-01-01', required: true, type: 'date' },
    ],
  },
  {
    id: 'passport_mvd',
    label: 'Паспорт (МВД)',
    desc: 'Действительность паспорта РФ по базе МВД',
    icon: 'CreditCard',
    risk: 'medium',
    fields: [
      { key: 'lastname',   label: 'Фамилия',        placeholder: 'Иванов',   required: true },
      { key: 'firstname',  label: 'Имя',             placeholder: 'Иван',     required: true },
      { key: 'secondname', label: 'Отчество',        placeholder: 'Иванович', required: false },
      { key: 'seria',      label: 'Серия паспорта',  placeholder: '1234',     required: true },
      { key: 'number',     label: 'Номер паспорта',  placeholder: '567890',   required: true },
    ],
  },
  {
    id: 'passport_fns',
    label: 'Паспорт + ИНН (ФНС)',
    desc: 'Поиск ИНН физлица и верификация паспорта через ФНС',
    icon: 'FileSearch',
    risk: 'medium',
    fields: [
      { key: 'lastname',   label: 'Фамилия',        placeholder: 'Иванов',     required: true },
      { key: 'firstname',  label: 'Имя',             placeholder: 'Иван',       required: true },
      { key: 'secondname', label: 'Отчество',        placeholder: 'Иванович',   required: false },
      { key: 'dob',        label: 'Дата рождения',   placeholder: '1990-01-01', required: true, type: 'date' },
      { key: 'seria',      label: 'Серия паспорта',  placeholder: '1234',       required: true },
      { key: 'number',     label: 'Номер паспорта',  placeholder: '567890',     required: true },
    ],
  },
  {
    id: 'bankrot_person',
    label: 'Банкротство',
    desc: 'Сведения о банкротстве физлица (ЕФРСБ)',
    icon: 'TrendingDown',
    risk: 'high',
    fields: [
      { key: 'lastname',   label: 'Фамилия',      placeholder: 'Иванов',     required: true },
      { key: 'firstname',  label: 'Имя',           placeholder: 'Иван',       required: true },
      { key: 'secondname', label: 'Отчество',      placeholder: 'Иванович',   required: false },
      { key: 'dob',        label: 'Дата рождения', placeholder: '1990-01-01', required: true, type: 'date' },
    ],
  },
  {
    id: 'pledge_person',
    label: 'Залоги',
    desc: 'Залоги и обременения физлица (реестр ФНП)',
    icon: 'Lock',
    risk: 'medium',
    fields: [
      { key: 'lastname',   label: 'Фамилия',      placeholder: 'Иванов',     required: true },
      { key: 'firstname',  label: 'Имя',           placeholder: 'Иван',       required: true },
      { key: 'secondname', label: 'Отчество',      placeholder: 'Иванович',   required: false },
      { key: 'dob',        label: 'Дата рождения', placeholder: '1990-01-01', required: true, type: 'date' },
    ],
  },
  {
    id: 'arbitr_person',
    label: 'Арбитраж',
    desc: 'Арбитражные дела физлица по ИНН (КАД)',
    icon: 'Scale',
    risk: 'medium',
    fields: [
      { key: 'inn', label: 'ИНН', placeholder: '123456789012', required: true },
    ],
  },
  {
    id: 'nalog_debt',
    label: 'Налог. задолженность',
    desc: 'Долги по налогам и сборам по ИНН физлица',
    icon: 'Receipt',
    risk: 'medium',
    fields: [
      { key: 'inn', label: 'ИНН', placeholder: '123456789012', required: true },
    ],
  },
  {
    id: 'fns_block_person',
    label: 'Блокировки счетов',
    desc: 'Решения ФНС о приостановлении операций по счетам',
    icon: 'Ban',
    risk: 'high',
    fields: [
      { key: 'inn', label: 'ИНН', placeholder: '123456789012', required: true },
    ],
  },
  {
    id: 'egrul_ip',
    label: 'Статус ИП',
    desc: 'Сведения ЕГРИП — активность ИП по ИНН',
    icon: 'Briefcase',
    risk: 'low',
    fields: [
      { key: 'inn', label: 'ИНН', placeholder: '123456789012', required: true },
    ],
  },
  {
    id: 'terrorist',
    label: 'Список террористов',
    desc: 'Проверка по реестрам террористов, экстремистов, ОМУ',
    icon: 'AlertOctagon',
    risk: 'high',
    fields: [
      { key: 'lastname',   label: 'Фамилия',  placeholder: 'Иванов',   required: true },
      { key: 'firstname',  label: 'Имя',       placeholder: 'Иван',     required: true },
      { key: 'secondname', label: 'Отчество',  placeholder: 'Иванович', required: false },
    ],
  },
  {
    id: 'elmk_registry',
    label: 'Медкнижка (ЭЛМК)',
    desc: 'Статус электронной медкнижки (Роспотребнадзор)',
    icon: 'Stethoscope',
    risk: 'low',
    fields: [
      { key: 'lastname',   label: 'Фамилия',      placeholder: 'Иванов',     required: true },
      { key: 'firstname',  label: 'Имя',           placeholder: 'Иван',       required: true },
      { key: 'secondname', label: 'Отчество',      placeholder: 'Иванович',   required: false },
      { key: 'dob',        label: 'Дата рождения', placeholder: '1990-01-01', required: true, type: 'date' },
    ],
  },
];

const RISK_COLORS = {
  high:   'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low:    'bg-emerald-50 text-emerald-700 border-emerald-200',
};
const RISK_LABELS = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };

// ── Рендер результата ─────────────────────────────────────────────────────────

function ResultValue({ val, depth = 0 }: { val: unknown; depth?: number }) {
  if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof val === 'boolean') return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${val ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
      {val ? 'Да' : 'Нет'}
    </span>
  );
  if (typeof val === 'string' || typeof val === 'number') return <span className="break-all">{String(val)}</span>;
  if (Array.isArray(val)) {
    if (!val.length) return <span className="text-muted-foreground text-xs">Не найдено</span>;
    return (
      <div className="space-y-1.5">
        {val.slice(0, 10).map((item, i) => (
          <div key={i} className={depth > 0 ? 'ml-3 pl-2 border-l-2 border-border' : 'bg-muted/40 rounded-lg p-2'}>
            <ResultValue val={item} depth={depth + 1} />
          </div>
        ))}
        {val.length > 10 && <div className="text-xs text-muted-foreground">…ещё {val.length - 10}</div>}
      </div>
    );
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>).filter(([, v]) => v !== null && v !== '' && v !== undefined);
    return (
      <div className="space-y-1">
        {entries.slice(0, 20).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-muted-foreground min-w-[130px] flex-shrink-0">{k}:</span>
            <span><ResultValue val={v} depth={depth + 1} /></span>
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(val)}</span>;
}

// ── Быстрый поиск (newdb + bezopasno) ────────────────────────────────────────

interface QuickSearchProps {
  serviceStatus: Record<string, boolean>;
  token: string;
}

function QuickSearch({ serviceStatus, token }: QuickSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>(['newdb', 'bezopasno']);
  const [results, setResults] = useState<Record<string, CheckResult> | null>(null);

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token };

  const toggleSource = (s: string) =>
    setSelectedSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${CRM_CHECKS_URL}/`, {
        method: 'POST', headers,
        body: JSON.stringify({ check_type: 'owner', query, sources: selectedSources }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: (data) => setResults(data.results),
    onError: (e: Error) => toast.error(e.message),
  });

  const ownerSources = ['newdb', 'bezopasno'];

  return (
    <div className="space-y-4">
      {/* Источники + поле поиска */}
      <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {ownerSources.map(src => {
            const info = SOURCE_INFO[src];
            const connected = serviceStatus[src];
            const selected = selectedSources.includes(src);
            return (
              <button
                key={src}
                onClick={() => toggleSource(src)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                  selected ? 'border-brand-blue bg-brand-blue/5 text-brand-blue' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                {info?.label || src}
                {!connected && <Icon name="WifiOff" size={11} className="text-muted-foreground" />}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && query.trim() && !mutation.isPending && mutation.mutate()}
            placeholder="ФИО или номер телефона..."
            className="flex-1 px-3 py-2.5 border border-border rounded-xl text-sm outline-none focus:border-brand-blue"
          />
          <button
            onClick={() => mutation.mutate()}
            disabled={!query.trim() || selectedSources.length === 0 || mutation.isPending}
            className="btn-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
          >
            {mutation.isPending
              ? <Icon name="Loader2" size={15} className="animate-spin" />
              : <Icon name="Search" size={15} />}
          </button>
        </div>
      </div>

      {/* Результаты */}
      {results && (
        <div className="space-y-3">
          {Object.entries(results).map(([src, res]) => (
            <div key={src} className="bg-white rounded-2xl border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_INFO[src]?.color || 'bg-muted text-foreground'}`}>
                  {SOURCE_INFO[src]?.label || src}
                </span>
                {res.from_cache && <Badge variant="outline" className="text-xs">Из кэша</Badge>}
              </div>
              {res.error ? (
                <div className="text-red-600 text-sm flex items-center gap-2">
                  <Icon name="AlertCircle" size={15} />
                  {res.error}
                </div>
              ) : (
                <div className="text-sm"><ResultValue val={res.data} /></div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Детальные проверки NewDB ──────────────────────────────────────────────────

interface DetailedChecksProps {
  newdbConnected: boolean;
  token: string;
}

function DetailedChecks({ newdbConnected, token }: DetailedChecksProps) {
  const [selectedMethod, setSelectedMethod] = useState<MethodMeta>(METHODS[0]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>(null);
  const [fromCache, setFromCache] = useState(false);

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token };

  const mutation = useMutation({
    mutationFn: async (force = false) => {
      const missing = selectedMethod.fields.filter(f => f.required && !fields[f.key]?.trim());
      if (missing.length) throw new Error(`Заполните: ${missing.map(f => f.label).join(', ')}`);

      const body: Record<string, unknown> = { action: 'newdb_v2', method: selectedMethod.id };
      selectedMethod.fields.forEach(f => { if (fields[f.key]?.trim()) body[f.key] = fields[f.key].trim(); });
      if (force) body.force_refresh = true;

      const r = await fetch(`${CRM_CHECKS_URL}/`, { method: 'POST', headers, body: JSON.stringify(body) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: (data) => {
      setResult(data.result);
      setFromCache(data.from_cache);
      if (data.from_cache) toast.info('Результат из кэша (30 дней)');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onMethodChange = (m: MethodMeta) => { setSelectedMethod(m); setFields({}); setResult(null); };

  const hasError = (result as Record<string, unknown>)?.error;
  const resultData = (result as Record<string, unknown>)?.data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Список методов */}
      <div className="lg:col-span-1 space-y-1.5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Метод проверки
        </div>
        {METHODS.map(m => (
          <button
            key={m.id}
            onClick={() => onMethodChange(m)}
            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition text-sm ${
              selectedMethod.id === m.id
                ? 'border-brand-blue bg-brand-blue/5'
                : 'border-border hover:bg-muted/50'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
              selectedMethod.id === m.id ? 'bg-brand-blue text-white' : 'bg-muted text-muted-foreground'
            }`}>
              <Icon name={m.icon} fallback="Shield" size={15} />
            </div>
            <div className="min-w-0">
              <div className={`font-medium text-xs leading-tight ${selectedMethod.id === m.id ? 'text-brand-blue' : 'text-foreground'}`}>
                {m.label}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{m.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Форма + результат */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand-blue/10 flex items-center justify-center shrink-0">
                <Icon name={selectedMethod.icon} fallback="Shield" size={18} className="text-brand-blue" />
              </div>
              <div>
                <div className="font-semibold text-sm">{selectedMethod.label}</div>
                <div className="text-xs text-muted-foreground">{selectedMethod.desc}</div>
              </div>
            </div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${RISK_COLORS[selectedMethod.risk]}`}>
              {RISK_LABELS[selectedMethod.risk]}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {selectedMethod.fields.map(f => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <input
                  type={f.type === 'date' ? 'date' : 'text'}
                  placeholder={f.type !== 'date' ? f.placeholder : undefined}
                  value={fields[f.key] || ''}
                  onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-brand-blue"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => mutation.mutate(false)}
              disabled={mutation.isPending || !newdbConnected}
              className="btn-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
            >
              {mutation.isPending
                ? <><Icon name="Loader2" size={15} className="animate-spin" />Проверяю...</>
                : <><Icon name="Search" size={15} />Проверить</>}
            </button>
            {result && (
              <button
                onClick={() => mutation.mutate(true)}
                disabled={mutation.isPending}
                className="px-4 py-2.5 rounded-xl text-sm border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Icon name="RefreshCw" size={14} />
                Обновить
              </button>
            )}
          </div>
        </div>

        {result && (
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Icon
                  name={hasError ? 'XCircle' : 'CheckCircle2'}
                  size={16}
                  className={hasError ? 'text-red-500' : 'text-emerald-500'}
                />
                <span className="text-sm font-medium">
                  {hasError ? 'Ошибка запроса' : 'Результат проверки'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {fromCache && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground border border-border">
                    Из кэша (30 дней)
                  </span>
                )}
                <span className="text-xs text-muted-foreground font-mono">{selectedMethod.id}</span>
              </div>
            </div>
            <div className="p-5">
              {hasError ? (
                <div className="text-sm text-red-600 bg-red-50 rounded-xl p-4">
                  <Icon name="AlertCircle" size={15} className="inline mr-1.5" />
                  {String(hasError)}
                </div>
              ) : resultData ? (
                <ResultValue val={resultData} />
              ) : (
                <div className="text-sm text-muted-foreground italic">Данные не найдены</div>
              )}
            </div>
          </div>
        )}

        {!result && !mutation.isPending && (
          <div className="bg-white rounded-2xl border border-border p-8 text-center text-muted-foreground">
            <Icon name="UserSearch" size={32} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm">Заполните поля и нажмите «Проверить»</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Главный компонент OwnersTab ───────────────────────────────────────────────

interface Props {
  serviceStatus: Record<string, boolean>;
  newdbConnected: boolean;
}

type Mode = 'quick' | 'detailed';

export default function OwnersTab({ serviceStatus, newdbConnected }: Props) {
  const { token } = useAuth();
  const [mode, setMode] = useState<Mode>('quick');

  return (
    <div className="space-y-5">
      {/* Переключатель режимов */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        <button
          onClick={() => setMode('quick')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            mode === 'quick' ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon name="Zap" size={14} />
          Быстрый поиск
        </button>
        <button
          onClick={() => setMode('detailed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            mode === 'detailed' ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon name="ShieldCheck" size={14} />
          Детальные проверки
          <span className="text-[10px] font-bold bg-brand-blue text-white px-1.5 py-0.5 rounded-full leading-none">
            12
          </span>
        </button>
      </div>

      {mode === 'quick' && (
        <>
          <div className="text-sm text-muted-foreground">
            Быстрый поиск физлица по ФИО или телефону через несколько источников одновременно.
          </div>
          <QuickSearch serviceStatus={serviceStatus} token={token || ''} />
        </>
      )}

      {mode === 'detailed' && (
        <>
          <div className="text-sm text-muted-foreground">
            Глубокая проверка по государственным базам данных: ФССП, МВД, ФНС, ЕФРСБ, КАД и другим. Требует данные паспорта или ИНН.
          </div>
          {!newdbConnected && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
              <Icon name="AlertTriangle" size={17} className="shrink-0 mt-0.5 text-amber-600" />
              <div className="text-sm">
                <div className="font-semibold">NewDB API-ключ не настроен</div>
                <div className="text-amber-800">Перейдите в Настройки → Интеграции → Проверка безопасности.</div>
              </div>
            </div>
          )}
          <DetailedChecks newdbConnected={newdbConnected} token={token || ''} />
        </>
      )}
    </div>
  );
}
