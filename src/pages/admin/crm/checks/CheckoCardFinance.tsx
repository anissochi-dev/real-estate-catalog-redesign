import Icon from '@/components/ui/icon';
import { Sec } from './checko-ui';
import { fmtMoney, fmtDate } from './checko-types';
import type { CheckoData } from './checko-types';

interface Props {
  data: CheckoData;
}

export default function CheckoCardFinance({ data }: Props) {
  return (
    <>
      {/* ── Налоги уплаченные ─────────────────────────────────────────── */}
      {data.налог_уплачено && data.налог_уплачено.length > 0 && (
        <Sec title="Уплаченные налоги и взносы" icon="Receipt" defaultOpen={false}>
          <div className="space-y-1.5">
            {data.налог_уплачено.map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-3 bg-muted/30 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground leading-snug flex-1">{t.наименование}</span>
                <span className="text-xs font-bold shrink-0">{fmtMoney(t.сумма)}</span>
              </div>
            ))}
          </div>
        </Sec>
      )}

      {/* ── Лицензии ──────────────────────────────────────────────────── */}
      {data.лицензии && data.лицензии.length > 0 && (
        <Sec title="Лицензии" icon="Award" defaultOpen={false}>
          <div className="space-y-1.5">
            {data.лицензии.map((l, i) => (
              <div key={i} className="text-xs bg-muted/30 rounded-lg px-3 py-2">
                <div className="font-semibold">{l.вид}</div>
                <div className="text-muted-foreground flex gap-3 mt-0.5">
                  {l.номер && <span>№ {l.номер}</span>}
                  {l.с && <span>с {fmtDate(l.с)}</span>}
                </div>
              </div>
            ))}
          </div>
        </Sec>
      )}

      {/* ── Финансы ───────────────────────────────────────────────────── */}
      {data.финансы && data.финансы.length > 0 && (
        <Sec title="Финансовые показатели" icon="TrendingUp">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Год', 'Выручка', 'Прибыль', 'Активы', 'Капитал'].map((h, i) => (
                    <th key={h} className={`py-2 pr-3 font-semibold text-muted-foreground ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.финансы.map((f, i) => (
                  <tr key={i} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 font-bold">{f.год}</td>
                    <td className="py-2 pr-3 text-right font-medium">{fmtMoney(f.выручка) || '—'}</td>
                    <td className={`py-2 pr-3 text-right font-medium ${Number(f.прибыль) < 0 ? 'text-red-600' : ''}`}>
                      {fmtMoney(f.прибыль) || '—'}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{fmtMoney(f.активы) || '—'}</td>
                    <td className="py-2 text-right text-muted-foreground">{fmtMoney(f.капитал) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>
      )}

      {/* ── Товарные знаки ────────────────────────────────────────────── */}
      {data.товарные_знаки && data.товарные_знаки.length > 0 && (
        <Sec title="Товарные знаки" icon="Tag" defaultOpen={false}>
          <div className="flex flex-wrap gap-1.5">
            {data.товарные_знаки.map((tm, i) => (
              <span key={i} className="text-xs bg-muted/50 border border-border px-2.5 py-1 rounded-lg">
                {tm.наименование}
                {tm.дата_рег && <span className="text-muted-foreground ml-1">({fmtDate(tm.дата_рег)})</span>}
              </span>
            ))}
          </div>
        </Sec>
      )}

      {/* ── Мета ──────────────────────────────────────────────────────── */}
      {data.запросов_сегодня !== undefined && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border pt-3 mt-4 flex-wrap">
          <Icon name="Info" size={11} className="shrink-0" />
          <span>Запросов сегодня: <b>{data.запросов_сегодня}</b></span>
          {data.запросов_остаток != null && <span>Остаток: <b>{data.запросов_остаток}</b></span>}
          <span className="ml-auto text-[10px] shrink-0">Источник: Checko.ru · ЕГРЮЛ / ЕГРИП</span>
        </div>
      )}
    </>
  );
}
