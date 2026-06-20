import Icon from '@/components/ui/icon';
import { DadataData } from './checksTypes';

function fmt(n: string | number | undefined): string {
  if (n === undefined || n === null || n === '') return '';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return String(n);
  return num.toLocaleString('ru-RU');
}

function fmtDate(raw: string | undefined): string {
  if (!raw) return '';
  // Unix timestamp (ms или s)
  const asNum = Number(raw);
  if (!isNaN(asNum) && asNum > 1_000_000) {
    const d = new Date(asNum > 9_999_999_999 ? asNum : asNum * 1000);
    return d.toLocaleDateString('ru-RU');
  }
  // ISO string
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('ru-RU');
  } catch { /* ignore */ }
  return raw;
}

function Row({ label, value, wide }: { label: string; value?: string | number | React.ReactNode; wide?: boolean }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className={`flex gap-2 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-muted-foreground min-w-[150px] shrink-0 text-xs pt-0.5">{label}</span>
      <span className="font-medium text-xs break-all">{value}</span>
    </div>
  );
}

export default function DadataCard({ data }: { data: DadataData }) {
  const statusCode = data.status_code || '';
  const isActive     = statusCode === 'ACTIVE';
  const isLiquidated = statusCode === 'LIQUIDATED' || statusCode === 'BANKRUPT';
  const isWarning    = statusCode === 'LIQUIDATING' || statusCode === 'REORGANIZING';

  const statusColor = isLiquidated
    ? 'bg-red-100 text-red-700 border-red-200'
    : isWarning
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : isActive
        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
        : 'bg-muted text-muted-foreground border-border';

  const isIp = data._type === 'ip';
  const hasFounders = data.founders && data.founders.length > 0;
  const hasLicenses = data.licenses && data.licenses.length > 0;
  const hasFinance  = data.finance && Object.values(data.finance).some(Boolean);
  const hasContacts = (data.phones && data.phones.length > 0) || (data.emails && data.emails.length > 0);

  return (
    <div className="space-y-4">

      {/* ── Шапка: название + статус ── */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
          <Icon name={isIp ? 'User' : 'Building2'} size={18} className="text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight">{data.name || '—'}</div>
          {data.name_full && data.name_full !== data.name && (
            <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{data.name_full}</div>
          )}
          <div className="flex items-center flex-wrap gap-2 mt-1.5">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusColor}`}>
              {data.status || 'Статус неизвестен'}
            </span>
            {data.opf && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 font-medium">
                {data.opf}
              </span>
            )}
            {isIp && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                Индивидуальный предприниматель
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Реквизиты ── */}
      <div className="rounded-xl border border-border p-3 space-y-0.5">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Icon name="FileText" size={12} />
          Реквизиты
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          <Row label="ИНН"       value={data.inn} />
          <Row label="ОГРН"      value={data.ogrn} />
          {!isIp && <Row label="КПП" value={data.kpp} />}
          <Row label="Дата регистрации"  value={fmtDate(data.reg_date)} />
          {data.liquidation_date && (
            <Row label="Дата ликвидации" value={fmtDate(data.liquidation_date)} />
          )}
          {data.branch_type && (
            <Row label="Тип"             value={data.branch_type === 'MAIN' ? 'Головная организация' : 'Филиал'} />
          )}
          {data.branch_count ? (
            <Row label="Филиалов"        value={String(data.branch_count)} />
          ) : null}
        </div>
      </div>

      {/* ── Адрес ── */}
      {data.address && (
        <div className="rounded-xl border border-border p-3 space-y-1.5">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Icon name="MapPin" size={12} />
            Адрес
          </div>
          <div className="text-xs font-medium">{data.address}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
            {data.address_region && (
              <Row label="Регион"  value={data.address_region} />
            )}
            {data.address_postal && (
              <Row label="Индекс"  value={data.address_postal} />
            )}
          </div>
        </div>
      )}

      {/* ── Деятельность ── */}
      <div className="rounded-xl border border-border p-3">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Icon name="Briefcase" size={12} />
          Деятельность
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          <Row label="Основной ОКВЭД"
            value={data.okved && data.okved_name
              ? `${data.okved} — ${data.okved_name}`
              : data.okved || data.okved_name}
            wide />
          <Row label="Руководитель"
            value={data.director && data.director_post
              ? `${data.director} (${data.director_post})`
              : data.director} />
          <Row label="Сотрудников"       value={data.employees ? String(data.employees) : undefined} />
          <Row label="Система налогов"   value={data.tax_system} />
          {data.ustavcap ? (
            <Row label="Уставной капитал" value={`${fmt(data.ustavcap)} руб.`} />
          ) : null}
        </div>
      </div>

      {/* ── Финансы ── */}
      {hasFinance && data.finance && (
        <div className="rounded-xl border border-border p-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Icon name="TrendingUp" size={12} />
            Финансы {data.finance.year ? `(${data.finance.year})` : ''}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.finance.income ? (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground mb-0.5">Выручка</div>
                <div className="text-sm font-bold text-emerald-700">{fmt(data.finance.income)} ₽</div>
              </div>
            ) : null}
            {data.finance.expense ? (
              <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground mb-0.5">Расходы</div>
                <div className="text-sm font-bold text-red-700">{fmt(data.finance.expense)} ₽</div>
              </div>
            ) : null}
            {data.finance.profit !== undefined && data.finance.profit !== '' ? (
              <div className={`border rounded-lg px-3 py-2 ${Number(data.finance.profit) >= 0 ? 'bg-sky-50 border-sky-100' : 'bg-orange-50 border-orange-100'}`}>
                <div className="text-[10px] text-muted-foreground mb-0.5">Прибыль</div>
                <div className={`text-sm font-bold ${Number(data.finance.profit) >= 0 ? 'text-sky-700' : 'text-orange-700'}`}>
                  {fmt(data.finance.profit)} ₽
                </div>
              </div>
            ) : null}
            {data.finance.debt ? (
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground mb-0.5">Долг</div>
                <div className="text-sm font-bold text-amber-700">{fmt(data.finance.debt)} ₽</div>
              </div>
            ) : null}
            {data.finance.penalty ? (
              <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground mb-0.5">Штрафы</div>
                <div className="text-sm font-bold text-red-700">{fmt(data.finance.penalty)} ₽</div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Учредители ── */}
      {hasFounders && data.founders && (
        <div className="rounded-xl border border-border p-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Icon name="Users" size={12} />
            Учредители ({data.founders.length})
          </div>
          <div className="space-y-1.5">
            {data.founders.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-3 py-2">
                <div className="font-medium">{f.name || '—'}</div>
                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                  {f.inn && <span>ИНН: {f.inn}</span>}
                  {f.share && (
                    <span className="font-semibold text-brand-blue">{f.share}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Лицензии ── */}
      {hasLicenses && data.licenses && (
        <div className="rounded-xl border border-border p-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Icon name="Award" size={12} />
            Лицензии ({data.licenses.length})
          </div>
          <div className="space-y-2">
            {data.licenses.map((lic, i) => (
              <div key={i} className="text-xs bg-muted/40 rounded-lg px-3 py-2 space-y-1">
                {lic.activity && <div className="font-medium">{lic.activity}</div>}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                  {(lic.series || lic.num) && <span>№ {[lic.series, lic.num].filter(Boolean).join(' ')}</span>}
                  {lic.date && <span>от {fmtDate(lic.date)}</span>}
                  {lic.date_end && <span>до {fmtDate(lic.date_end)}</span>}
                  {lic.status && (
                    <span className={lic.status.toLowerCase().includes('действ') ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                      {lic.status}
                    </span>
                  )}
                </div>
                {lic.authority && <div className="text-muted-foreground">{lic.authority}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Контакты ── */}
      {hasContacts && (
        <div className="rounded-xl border border-border p-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Icon name="Phone" size={12} />
            Контакты
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {data.phones?.map((p, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-muted-foreground min-w-[150px] shrink-0 pt-0.5">
                  {i === 0 ? 'Телефон' : `Телефон ${i + 1}`}
                </span>
                <a href={`tel:${p}`} className="font-medium text-brand-blue hover:underline">{p}</a>
              </div>
            ))}
            {data.emails?.map((e, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-muted-foreground min-w-[150px] shrink-0 pt-0.5">
                  {i === 0 ? 'Email' : `Email ${i + 1}`}
                </span>
                <a href={`mailto:${e}`} className="font-medium text-brand-blue hover:underline">{e}</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
