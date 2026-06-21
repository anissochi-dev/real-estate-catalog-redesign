import Icon from '@/components/ui/icon';

interface Encumbrance {
  number: string;
  type: string;
  date: string;
  holder: string;
}

interface Right {
  number: string;
  type: string;
  date: string;
  person: string;
  share: string;
}

export interface EgrnData {
  _source?: string;
  cadastral_number?: string;
  address?: string;
  area?: string;
  purpose?: string;
  cadastral_cost?: string;
  cadastral_cost_date?: string;
  registration_date?: string;
  status?: string;
  encumbrances?: Encumbrance[];
  rights?: Right[];
  has_encumbrances?: boolean;
  _raw?: Record<string, unknown>;
}

interface Props {
  data: EgrnData;
  onCheckOwner?: (name: string) => void;
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground min-w-[160px] flex-shrink-0">{label}</span>
      <span className="text-xs font-medium text-foreground break-all">{value}</span>
    </div>
  );
}

export default function EgrnCard({ data, onCheckOwner }: Props) {
  const hasEncumbrances = (data.encumbrances?.length ?? 0) > 0;
  const hasRights = (data.rights?.length ?? 0) > 0;

  return (
    <div className="space-y-4">

      {/* Основные сведения */}
      <div className="bg-muted/30 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
            <Icon name="Building2" size={14} className="text-orange-600" />
          </div>
          <span className="text-sm font-semibold">Основные сведения</span>
          {data.cadastral_number && (
            <span className="ml-auto text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {data.cadastral_number}
            </span>
          )}
        </div>
        <div>
          <Row label="Адрес" value={data.address} />
          <Row label="Площадь" value={data.area ? `${data.area} м²` : undefined} />
          <Row label="Назначение" value={data.purpose} />
          <Row label="Кадастровая стоимость" value={data.cadastral_cost} />
          <Row label="Дата оценки" value={data.cadastral_cost_date} />
          <Row label="Дата регистрации" value={data.registration_date} />
          <Row label="Статус" value={data.status} />
        </div>
      </div>

      {/* Обременения */}
      <div className={`rounded-xl border-2 p-4 ${hasEncumbrances ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${hasEncumbrances ? 'bg-red-100' : 'bg-emerald-100'}`}>
            <Icon
              name={hasEncumbrances ? 'AlertTriangle' : 'ShieldCheck'}
              size={14}
              className={hasEncumbrances ? 'text-red-600' : 'text-emerald-600'}
            />
          </div>
          <span className="text-sm font-semibold">
            {hasEncumbrances ? `Обременения (${data.encumbrances!.length})` : 'Обременения отсутствуют'}
          </span>
        </div>

        {hasEncumbrances ? (
          <div className="space-y-3">
            {data.encumbrances!.map((enc, i) => (
              <div key={i} className="bg-white rounded-lg p-3 border border-red-100">
                {enc.type && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                      {enc.type}
                    </span>
                  </div>
                )}
                {enc.number && <div className="text-xs text-muted-foreground">№ {enc.number}</div>}
                {enc.date && <div className="text-xs text-muted-foreground">Дата: {enc.date}</div>}
                {enc.holder && <div className="text-xs text-muted-foreground">Держатель: {enc.holder}</div>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-emerald-700">Залогов, арестов и ограничений не зарегистрировано</p>
        )}
      </div>

      {/* Права собственности */}
      {hasRights && (
        <div className="bg-muted/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-brand-blue/10 flex items-center justify-center">
              <Icon name="UserCheck" size={14} className="text-brand-blue" />
            </div>
            <span className="text-sm font-semibold">Права собственности ({data.rights!.length})</span>
          </div>
          <div className="space-y-3">
            {data.rights!.map((r, i) => (
              <div key={i} className="bg-white rounded-lg p-3 border border-border">
                {r.type && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-semibold text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded-full">
                      {r.type}
                    </span>
                    {r.share && (
                      <span className="text-xs text-muted-foreground">Доля: {r.share}</span>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  {r.person && <div className="text-xs font-medium">{r.person}</div>}
                  {r.person && onCheckOwner && (
                    <button
                      onClick={() => onCheckOwner(r.person)}
                      className="flex items-center gap-1 text-[11px] text-brand-blue hover:bg-brand-blue/10 px-2 py-1 rounded-lg transition shrink-0"
                      title="Проверить владельца в разделе Собственники"
                    >
                      <Icon name="UserSearch" size={11} />
                      Проверить
                    </button>
                  )}
                </div>
                {r.number && <div className="text-xs text-muted-foreground mt-0.5">№ {r.number}</div>}
                {r.date && <div className="text-xs text-muted-foreground">Зарег.: {r.date}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Нет данных */}
      {!data.address && !data.purpose && !hasEncumbrances && !hasRights && (
        <div className="text-center py-6 text-muted-foreground">
          <Icon name="FileSearch" size={32} className="mx-auto mb-2 opacity-30" />
          <div className="text-sm">Данные ЕГРН получены, но не содержат структурированной информации</div>
          {data._raw && (
            <details className="mt-3 text-left">
              <summary className="text-xs cursor-pointer hover:text-foreground">Показать сырой ответ</summary>
              <pre className="text-[10px] mt-2 bg-muted p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(data._raw, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
