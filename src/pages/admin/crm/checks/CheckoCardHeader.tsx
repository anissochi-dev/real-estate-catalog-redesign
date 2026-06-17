import Icon from '@/components/ui/icon';
import { Pill } from './checko-ui';
import type { CheckoData, Risk } from './checko-types';

interface Props {
  наим: string;
  наимПолн?: string;
  статус?: string;
  statusColor: string;
  statusIcon: string;
  риски: Risk[];
  data: CheckoData;
}

export default function CheckoCardHeader({ наим, наимПолн, статус, statusColor, statusIcon, риски, data }: Props) {
  return (
    <>
      {/* ── Шапка ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg leading-tight">{наим}</div>
          {наимПолн && наимПолн !== наим && (
            <div className="text-xs text-muted-foreground mt-0.5">{наимПолн}</div>
          )}
          {data.наименование_англ && (
            <div className="text-xs text-muted-foreground/60 italic">{data.наименование_англ}</div>
          )}
          {data.опф && <div className="text-xs text-muted-foreground mt-0.5">{data.опф}</div>}
        </div>
        {статус && (
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border shrink-0 ${statusColor}`}>
            <Icon name={statusIcon} size={12} />
            {статус}
          </span>
        )}
      </div>

      {/* ── Риски / Санкции ───────────────────────────────────────────── */}
      <div className="mt-4 space-y-2">
        {риски.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1.5">
              <Icon name="AlertOctagon" size={13} /> Факторы риска
            </div>
            <div className="flex flex-wrap gap-1.5">
              {риски.map((r, i) => (
                <span key={i} className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg ${
                  r.level === 'danger' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  <Icon name={r.level === 'danger' ? 'AlertOctagon' : 'AlertTriangle'} size={10} />
                  {r.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {(data.санкции_нет !== undefined || data.санкции_связи_нет !== undefined) && (
          <div className="flex flex-wrap gap-2">
            {data.санкции_нет !== undefined && (
              <Pill green={!!data.санкции_нет} label={data.санкции_нет ? 'Не в санкционных списках' : 'Входит в санкционные списки'} />
            )}
            {data.санкции_связи_нет !== undefined && (
              <Pill green={!!data.санкции_связи_нет} label={data.санкции_связи_нет ? 'Нет связей с подсанкционными' : 'Есть связи с подсанкционными'} />
            )}
          </div>
        )}

        {риски.length === 0 && data.санкции_нет === undefined && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl w-fit">
            <Icon name="ShieldCheck" size={13} />
            Факторов риска не выявлено
          </div>
        )}
      </div>
    </>
  );
}