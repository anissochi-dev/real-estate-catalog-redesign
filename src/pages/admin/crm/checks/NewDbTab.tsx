import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { CRM_CHECKS_URL } from '@/lib/adminApi';

// ── Метаданные методов ────────────────────────────────────────────────────────

interface MethodMeta {
  id: string;
  label: string;
  desc: string;
  icon: string;
  fields: FieldDef[];
  risk: 'high' | 'medium' | 'low';
}

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  type?: 'text' | 'date';
}

const METHODS: MethodMeta[] = [
  {
    id: 'complex_by_passport',
    label: 'Комплексная проверка',
    desc: 'МВД + ФНС + ФССП по паспорту — самый полный вариант',
    icon: 'ShieldCheck',
    risk: 'high',
    fields: [
      { key: 'lastname',   label: 'Фамилия',   placeholder: 'Иванов',      required: true },
      { key: 'firstname',  label: 'Имя',        placeholder: 'Иван',        required: true },
      { key: 'secondname', label: 'Отчество',   placeholder: 'Иванович',    required: false },
      { key: 'dob',        label: 'Дата рождения', placeholder: '1990-01-01', required: true, type: 'date' },
      { key: 'seria',      label: 'Серия паспорта', placeholder: '1234',    required: true },
      { key: 'number',     label: 'Номер паспорта', placeholder: '567890',  required: true },
    ],
  },
  {
    id: 'fssp_person',
    label: 'Долги ФССП',
    desc: 'Исполнительные производства — долги, взыскания',
    icon: 'Gavel',
    risk: 'high',
    fields: [
      { key: 'lastname',   label: 'Фамилия',       placeholder: 'Иванов',      required: true },
      { key: 'firstname',  label: 'Имя',            placeholder: 'Иван',        required: true },
      { key: 'secondname', label: 'Отчество',       placeholder: 'Иванович',    required: false },
      { key: 'dob',        label: 'Дата рождения',  placeholder: '1990-01-01',  required: true, type: 'date' },
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
      { key: 'lastname',   label: 'Фамилия',        placeholder: 'Иванов',      required: true },
      { key: 'firstname',  label: 'Имя',             placeholder: 'Иван',        required: true },
      { key: 'secondname', label: 'Отчество',        placeholder: 'Иванович',    required: false },
      { key: 'dob',        label: 'Дата рождения',   placeholder: '1990-01-01',  required: true, type: 'date' },
      { key: 'seria',      label: 'Серия паспорта',  placeholder: '1234',        required: true },
      { key: 'number',     label: 'Номер паспорта',  placeholder: '567890',      required: true },
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
    label: 'Налоговая задолженность',
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
const RISK_LABELS = { high: 'Высокий риск', medium: 'Средний', low: 'Низкий' };

// ── Отображение результата ─────────────────────────────────────────────────

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
            <span className="text-muted-foreground min-w-[130px] flex-shrink-0 font-medium">{k}:</span>
            <ResultValue val={v} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(val)}</span>;
}

// ── Основной компонент ─────────────────────────────────────────────────────

export default function NewDbTab({ newdbConnected }: { newdbConnected: boolean }) {
  const { token } = useAuth();
  const [selectedMethod, setSelectedMethod] = useState<MethodMeta>(METHODS[0]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>(null);
  const [fromCache, setFromCache] = useState(false);

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };

  const mutation = useMutation({
    mutationFn: async (force = false) => {
      const required = selectedMethod.fields.filter(f => f.required);
      const missing = required.filter(f => !fields[f.key]?.trim());
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

  const onMethodChange = (m: MethodMeta) => {
    setSelectedMethod(m);
    setFields({});
    setResult(null);
  };

  const hasError = (result as Record<string, unknown>)?.error;
  const resultData = (result as Record<string, unknown>)?.data;

  return (
    <div className="space-y-5">
      {/* Предупреждение если ключ не настроен */}
      {!newdbConnected && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <Icon name="AlertTriangle" size={17} className="shrink-0 mt-0.5 text-amber-600" />
          <div className="text-sm">
            <div className="font-semibold">NewDB API-ключ не настроен</div>
            <div className="text-amber-800">Перейдите в Настройки → Интеграции → Проверка безопасности и добавьте NEWDB_API_KEY.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Левая панель — выбор метода */}
        <div className="lg:col-span-1 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Метод проверки</div>
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
                <div className={`font-medium leading-tight ${selectedMethod.id === m.id ? 'text-brand-blue' : 'text-foreground'}`}>
                  {m.label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{m.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Правая панель — форма + результат */}
        <div className="lg:col-span-2 space-y-4">
          {/* Заголовок метода */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                    <Icon name={selectedMethod.icon} fallback="Shield" size={18} className="text-brand-blue" />
                  </div>
                  <div>
                    <div className="font-semibold text-base">{selectedMethod.label}</div>
                    <div className="text-xs text-muted-foreground">{selectedMethod.desc}</div>
                  </div>
                </div>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${RISK_COLORS[selectedMethod.risk]}`}>
                {RISK_LABELS[selectedMethod.risk]}
              </span>
            </div>

            {/* Поля формы */}
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

          {/* Результат */}
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
                  <div className="text-sm text-muted-foreground text-center py-4">
                    <Icon name="Info" size={16} className="inline mr-1.5" />
                    Данных не найдено
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Пустое состояние */}
          {!result && !mutation.isPending && (
            <div className="bg-white rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <Icon name="ShieldQuestion" fallback="Shield" size={24} className="text-muted-foreground" />
              </div>
              <div className="text-sm font-medium mb-1">Заполните данные и нажмите «Проверить»</div>
              <div className="text-xs">Результаты кэшируются на 30 дней</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
