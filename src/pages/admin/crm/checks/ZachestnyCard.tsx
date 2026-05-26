import { ZachestnyData } from './checksTypes';

export default function ZachestnyCard({ data }: { data: ZachestnyData }) {
  const isActive = data.status && (
    data.status.toLowerCase().includes('действу') ||
    data.status.toLowerCase().includes('активн') ||
    data.status === '1' || data.status === 'true'
  );
  const isLiquidated = data.status && (
    data.status.toLowerCase().includes('ликвид') ||
    data.status.toLowerCase().includes('прекращ')
  );

  const statusColor = isLiquidated
    ? 'bg-red-100 text-red-700'
    : isActive
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-amber-100 text-amber-700';

  const fields: [string, string | number | undefined, string?][] = [
    ['ИНН', data.inn],
    ['ОГРН', data.ogrn],
    ['Тип', data._type === 'ip' ? 'Индивидуальный предприниматель' : 'Юридическое лицо'],
    ['Адрес', data.address],
    ['ОКВЭД', data.okved && data.okved_name ? `${data.okved} — ${data.okved_name}` : (data.okved || data.okved_name)],
    ['Руководитель', data.director && data.director_post ? `${data.director} (${data.director_post})` : data.director],
    ['Дата регистрации', data.reg_date],
    ['Сотрудников', data.employees],
    ['Уставной капитал', data.capital ? `${Number(data.capital).toLocaleString('ru-RU')} руб.` : undefined],
    ['Система налогообложения', data.tax_system],
    ['Оценка риска', data.risk_score],
    ...(data.liquidation_date ? [['Дата прекращения', data.liquidation_date] as [string, string]] : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base leading-tight">{data.name || '—'}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
              {data.status || 'Статус неизвестен'}
            </span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm border-t pt-3">
        {fields.map(([label, value]) =>
          value ? (
            <div key={label} className="flex gap-2">
              <span className="text-muted-foreground min-w-[140px] shrink-0 text-xs pt-0.5">{label}</span>
              <span className="font-medium text-xs break-all">{String(value)}</span>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
