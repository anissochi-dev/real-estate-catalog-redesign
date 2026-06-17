import Icon from '@/components/ui/icon';

interface Risk { label: string; level: 'danger' | 'warning' }

interface CheckoData {
  inn?: string;
  ogrn?: string;
  kpp?: string;
  name?: string;
  name_full?: string;
  opf?: string;
  status?: string;
  is_active?: boolean;
  is_liquidated?: boolean;
  address?: string;
  reg_date?: string;
  okved?: string;
  okved_name?: string;
  employees?: string | number;
  msp_category?: string;
  authorized_capital?: string | number;
  director?: string;
  director_post?: string;
  founders?: string[];
  risks?: Risk[];
  revenue?: string | number;
  profit?: string | number;
  finance_year?: string;
  today_request_count?: number;
  requests_remaining?: number | null;
  error?: string;
}

const fmtNum = (n: string | number | undefined) => {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString('ru') + ' ₽';
};

const fmtDate = (s: string | undefined) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('ru'); } catch { return s; }
};

export default function CheckoCard({ data }: { data: CheckoData }) {
  if (data.error) {
    return (
      <div className="flex items-center gap-2 text-red-600 text-sm">
        <Icon name="AlertCircle" size={15} />
        {data.error}
      </div>
    );
  }

  const statusColor = data.is_liquidated
    ? 'text-red-600 bg-red-50 border-red-200'
    : data.is_active
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : 'text-amber-700 bg-amber-50 border-amber-200';

  return (
    <div className="space-y-4">

      {/* Шапка: название + статус */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-base leading-snug">{data.name || '—'}</div>
          {data.name_full && data.name_full !== data.name && (
            <div className="text-xs text-muted-foreground mt-0.5">{data.name_full}</div>
          )}
          {data.opf && <div className="text-xs text-muted-foreground">{data.opf}</div>}
        </div>
        {data.status && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border shrink-0 ${statusColor}`}>
            {data.status}
          </span>
        )}
      </div>

      {/* Риски */}
      {data.risks && data.risks.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Риски</div>
          <div className="flex flex-wrap gap-1.5">
            {data.risks.map((r, i) => (
              <span key={i} className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg ${
                r.level === 'danger' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-700 border border-amber-200'
              }`}>
                <Icon name={r.level === 'danger' ? 'AlertOctagon' : 'AlertTriangle'} size={11} />
                {r.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {(!data.risks || data.risks.length === 0) && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg w-fit">
          <Icon name="ShieldCheck" size={13} />
          Рисков не выявлено
        </div>
      )}

      {/* Реквизиты */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        {[
          { label: 'ИНН',        value: data.inn },
          { label: 'ОГРН',       value: data.ogrn },
          { label: 'КПП',        value: data.kpp },
          { label: 'Дата рег.',  value: fmtDate(data.reg_date) },
          { label: 'ОКВЭД',      value: data.okved ? `${data.okved}${data.okved_name ? ' — ' + data.okved_name : ''}` : undefined },
          { label: 'Сотрудники', value: data.employees ? String(data.employees) : undefined },
          { label: 'МСП',        value: data.msp_category },
          { label: 'Уст. капитал', value: data.authorized_capital ? fmtNum(data.authorized_capital) : undefined },
        ].filter(r => r.value).map(r => (
          <div key={r.label}>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{r.label}</div>
            <div className="text-sm font-medium mt-0.5 break-all">{r.value}</div>
          </div>
        ))}
      </div>

      {/* Адрес */}
      {data.address && (
        <div>
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Адрес</div>
          <div className="text-sm">{data.address}</div>
        </div>
      )}

      {/* Руководитель */}
      {data.director && (
        <div className="bg-muted/40 rounded-xl p-3">
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Руководитель</div>
          <div className="text-sm font-semibold">{data.director}</div>
          {data.director_post && <div className="text-xs text-muted-foreground">{data.director_post}</div>}
        </div>
      )}

      {/* Учредители */}
      {data.founders && data.founders.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Учредители</div>
          <div className="space-y-0.5">
            {data.founders.map((f, i) => (
              <div key={i} className="text-sm">{f}</div>
            ))}
          </div>
        </div>
      )}

      {/* Финансы */}
      {(data.revenue || data.profit) && (
        <div className="bg-muted/40 rounded-xl p-3">
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
            Финансы{data.finance_year ? ` (${data.finance_year})` : ''}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {data.revenue && (
              <div>
                <div className="text-xs text-muted-foreground">Выручка</div>
                <div className="text-sm font-semibold">{fmtNum(data.revenue)}</div>
              </div>
            )}
            {data.profit && (
              <div>
                <div className="text-xs text-muted-foreground">Чистая прибыль</div>
                <div className="text-sm font-semibold">{fmtNum(data.profit)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Мета: остаток запросов */}
      {data.today_request_count !== undefined && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border pt-2 mt-1">
          <span>Запросов сегодня: <b>{data.today_request_count}</b></span>
          {data.requests_remaining != null && (
            <span>Остаток: <b>{data.requests_remaining}</b></span>
          )}
        </div>
      )}
    </div>
  );
}
