import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { CRM_CHECKS_URL } from '@/lib/adminApi';
import { METHODS, RISK_COLORS, RISK_LABELS, MethodMeta } from './ownersTypes';
import ResultValue from './OwnerResultValue';

interface Props {
  newdbConnected: boolean;
  token: string;
}

export default function OwnerDetailedChecks({ newdbConnected, token }: Props) {
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
