import { useState } from 'react';
import Icon from '@/components/ui/icon';

interface Risk { label: string; level: 'danger' | 'warning' }
interface Founder { наименование: string; доля_руб?: string | number; огрн?: string; инн?: string }
interface DirectorHistory { фио: string; должность: string; с: string; по: string }
interface OkvedItem { код: string; наименование: string; основной: boolean }
interface License { вид: string; номер: string; с: string }
interface FinanceYear { год: string; выручка: string | number; прибыль: string | number; активы: string | number; капитал: string | number }
interface Trademark { наименование: string; дата_рег: string }

interface CheckoData {
  инн?: string; огрн?: string; кпп?: string; огрнип?: string;
  наименование?: string; наименование_полное?: string;
  опф?: string; тип?: string;
  статус?: string; статус_код?: string; действующее?: boolean; ликвидировано?: boolean;
  дата_регистрации?: string; дата_ликвидации?: string;
  адрес?: string;
  оквэд_основной?: string; оквэд_наим?: string; оквэд_список?: OkvedItem[];
  директор_фио?: string; директор_должность?: string; директор_инн?: string;
  директора_история?: DirectorHistory[];
  учредители?: Founder[];
  телефоны?: string[]; email?: string[]; сайты?: string[];
  сотрудников?: string | number; уст_капитал?: string | number;
  лицензии?: License[];
  налог_режим?: string[];
  мсп_категория?: string; мсп_дата?: string;
  товарные_знаки?: Trademark[];
  финансы?: FinanceYear[];
  риски?: Risk[];
  запросов_сегодня?: number; запросов_остаток?: number | null;
  _raw_keys?: string[];
  error?: string;
  // Обратная совместимость со старыми полями
  inn?: string; ogrn?: string; name?: string; name_full?: string;
  status?: string; is_active?: boolean; is_liquidated?: boolean;
  address?: string; risks?: Risk[];
}

const fmtMoney = (n: string | number | undefined | null) => {
  if (n === '' || n === null || n === undefined) return null;
  const num = Number(n);
  if (isNaN(num) || num === 0) return null;
  if (Math.abs(num) >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)} млрд ₽`;
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)} млн ₽`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(0)} тыс ₽`;
  return `${num.toLocaleString('ru')} ₽`;
};

const fmtDate = (s: string | undefined | null) => {
  if (!s) return null;
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return s; }
};

const Section = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <div className="border-t border-border pt-4 mt-4">
    <div className="flex items-center gap-1.5 mb-3">
      <Icon name={icon} size={13} className="text-brand-blue shrink-0" />
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</span>
    </div>
    {children}
  </div>
);

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</div>
    <div className="text-sm font-medium break-all">{value}</div>
  </div>
);

export default function CheckoCard({ data }: { data: CheckoData }) {
  const [showOkveds, setShowOkveds] = useState(false);
  const [showDirectorHistory, setShowDirectorHistory] = useState(false);

  if (data.error) {
    return (
      <div className="flex items-center gap-2 text-red-600 text-sm">
        <Icon name="AlertCircle" size={15} />
        {data.error}
      </div>
    );
  }

  // Поддержка обоих форматов (старый и новый)
  const наим = data.наименование || data.name || '—';
  const наимПолн = data.наименование_полное || data.name_full;
  const инн = data.инн || data.inn;
  const огрн = data.огрн || data.ogrn;
  const адрес = data.адрес || data.address;
  const ликвид = data.ликвидировано ?? data.is_liquidated ?? false;
  const действует = data.действующее ?? data.is_active ?? false;
  const статус = data.статус || data.status;
  const риски = data.риски || data.risks || [];

  const statusColor = ликвид
    ? 'text-red-700 bg-red-50 border-red-200'
    : действует
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : 'text-amber-700 bg-amber-50 border-amber-200';

  return (
    <div>

      {/* ── Шапка ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-base leading-snug">{наим}</div>
          {наимПолн && наимПолн !== наим && (
            <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{наимПолн}</div>
          )}
          {data.опф && <div className="text-xs text-muted-foreground mt-0.5">{data.опф}</div>}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {статус && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${statusColor}`}>
              {статус}
            </span>
          )}
          {data.тип && <span className="text-[10px] text-muted-foreground font-semibold">{data.тип}</span>}
        </div>
      </div>

      {/* ── Риски ─────────────────────────────────────────────────────── */}
      {риски.length > 0 ? (
        <Section title="Факторы риска" icon="AlertOctagon">
          <div className="flex flex-wrap gap-1.5">
            {риски.map((r, i) => (
              <span key={i} className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg ${
                r.level === 'danger'
                  ? 'bg-red-100 text-red-700 border border-red-200'
                  : 'bg-amber-100 text-amber-700 border border-amber-200'
              }`}>
                <Icon name={r.level === 'danger' ? 'AlertOctagon' : 'AlertTriangle'} size={10} />
                {r.label}
              </span>
            ))}
          </div>
        </Section>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg w-fit mt-3">
          <Icon name="ShieldCheck" size={12} />
          Факторов риска не выявлено
        </div>
      )}

      {/* ── Реквизиты ─────────────────────────────────────────────────── */}
      <Section title="Реквизиты" icon="FileText">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          {инн && <Field label="ИНН" value={инн} />}
          {огрн && <Field label="ОГРН" value={огрн} />}
          {data.огрнип && <Field label="ОГРНИП" value={data.огрнип} />}
          {data.кпп && <Field label="КПП" value={data.кпп} />}
          {data.дата_регистрации && <Field label="Дата регистрации" value={fmtDate(data.дата_регистрации)} />}
          {data.дата_ликвидации && <Field label="Дата ликвидации" value={fmtDate(data.дата_ликвидации)} />}
          {data.сотрудников && <Field label="Сотрудников (ССЧ)" value={`${data.сотрудников} чел.`} />}
          {data.уст_капитал && fmtMoney(data.уст_капитал) && (
            <Field label="Уставной капитал" value={fmtMoney(data.уст_капитал)} />
          )}
          {data.мсп_категория && (
            <Field label="Категория МСП" value={
              <span>{data.мсп_категория}{data.мсп_дата ? ` (с ${fmtDate(data.мсп_дата)})` : ''}</span>
            } />
          )}
          {data.налог_режим && data.налог_режим.length > 0 && (
            <Field label="Налоговый режим" value={data.налог_режим.join(', ')} />
          )}
        </div>
      </Section>

      {/* ── Адрес ─────────────────────────────────────────────────────── */}
      {адрес && (
        <Section title="Юридический адрес" icon="MapPin">
          <div className="text-sm">{адрес}</div>
        </Section>
      )}

      {/* ── Контакты ──────────────────────────────────────────────────── */}
      {((data.телефоны?.length ?? 0) + (data.email?.length ?? 0) + (data.сайты?.length ?? 0)) > 0 && (
        <Section title="Контакты" icon="Phone">
          <div className="space-y-2">
            {data.телефоны && data.телефоны.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Телефоны</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.телефоны.map((t, i) => (
                    <span key={i} className="text-sm bg-muted/50 px-2 py-0.5 rounded font-mono">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {data.email && data.email.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Электронная почта</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.email.map((e, i) => <span key={i} className="text-sm bg-muted/50 px-2 py-0.5 rounded">{e}</span>)}
                </div>
              </div>
            )}
            {data.сайты && data.сайты.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Сайты</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.сайты.map((s, i) => <span key={i} className="text-sm bg-muted/50 px-2 py-0.5 rounded">{s}</span>)}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Руководитель ──────────────────────────────────────────────── */}
      {data.директор_фио && (
        <Section title="Руководитель" icon="User">
          <div className="bg-muted/40 rounded-xl p-3">
            <div className="text-sm font-bold">{data.директор_фио}</div>
            {data.директор_должность && <div className="text-xs text-muted-foreground mt-0.5">{data.директор_должность}</div>}
            {data.директор_инн && <div className="text-xs text-muted-foreground mt-0.5">ИНН: {data.директор_инн}</div>}
          </div>
          {data.директора_история && data.директора_история.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowDirectorHistory(v => !v)}
                className="text-xs text-brand-blue hover:underline flex items-center gap-1"
              >
                <Icon name={showDirectorHistory ? 'ChevronUp' : 'ChevronDown'} size={12} />
                История смены руководителей ({data.директора_история.length})
              </button>
              {showDirectorHistory && (
                <div className="mt-2 space-y-1.5">
                  {data.директора_история.map((d, i) => (
                    <div key={i} className="text-xs bg-muted/30 rounded-lg px-3 py-2">
                      <span className="font-semibold">{d.фио}</span>
                      {d.должность && <span className="text-muted-foreground"> — {d.должность}</span>}
                      {(d.с || d.по) && (
                        <span className="text-muted-foreground ml-1">
                          ({fmtDate(d.с) || '?'} — {fmtDate(d.по) || 'настоящее время'})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {/* ── Учредители ────────────────────────────────────────────────── */}
      {data.учредители && data.учредители.length > 0 && (
        <Section title="Учредители и участники" icon="Users">
          <div className="space-y-2">
            {data.учредители.map((f, i) => (
              <div key={i} className="bg-muted/30 rounded-xl px-3 py-2">
                <div className="text-sm font-semibold">{f.наименование}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  {f.доля_руб && fmtMoney(f.доля_руб) && (
                    <span className="text-xs text-muted-foreground">Номинальная стоимость: {fmtMoney(f.доля_руб)}</span>
                  )}
                  {f.инн && <span className="text-xs text-muted-foreground">ИНН: {f.инн}</span>}
                  {f.огрн && <span className="text-xs text-muted-foreground">ОГРН: {f.огрн}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── ОКВЭД ─────────────────────────────────────────────────────── */}
      {(data.оквэд_основной || (data.оквэд_список && data.оквэд_список.length > 0)) && (
        <Section title="Виды деятельности (ОКВЭД)" icon="Briefcase">
          {data.оквэд_основной && (
            <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl px-3 py-2 mb-2">
              <div className="text-[10px] font-semibold text-brand-blue uppercase tracking-wide mb-0.5">Основной вид деятельности</div>
              <div className="text-sm font-semibold font-mono">{data.оквэд_основной}</div>
              {data.оквэд_наим && <div className="text-xs text-muted-foreground mt-0.5">{data.оквэд_наим}</div>}
            </div>
          )}
          {data.оквэд_список && data.оквэд_список.filter(o => !o.основной).length > 0 && (
            <>
              <button
                onClick={() => setShowOkveds(v => !v)}
                className="text-xs text-brand-blue hover:underline flex items-center gap-1 mb-2"
              >
                <Icon name={showOkveds ? 'ChevronUp' : 'ChevronDown'} size={12} />
                {showOkveds ? 'Скрыть дополнительные' : `Дополнительные виды (${data.оквэд_список.filter(o => !o.основной).length})`}
              </button>
              {showOkveds && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {data.оквэд_список.filter(o => !o.основной).map((o, i) => (
                    <div key={i} className="text-xs bg-muted/30 rounded px-2 py-1.5">
                      <span className="font-mono font-semibold mr-2 text-brand-blue">{o.код}</span>
                      <span className="text-muted-foreground">{o.наименование}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Section>
      )}

      {/* ── Лицензии ──────────────────────────────────────────────────── */}
      {data.лицензии && data.лицензии.length > 0 && (
        <Section title="Лицензии" icon="Award">
          <div className="space-y-1.5">
            {data.лицензии.map((l, i) => (
              <div key={i} className="text-xs bg-muted/30 rounded-lg px-3 py-2">
                <div className="font-semibold">{l.вид}</div>
                <div className="text-muted-foreground mt-0.5 flex gap-3">
                  {l.номер && <span>№ {l.номер}</span>}
                  {l.с && <span>Дата выдачи: {fmtDate(l.с)}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Финансы ───────────────────────────────────────────────────── */}
      {data.финансы && data.финансы.length > 0 && (
        <Section title="Финансовые показатели" icon="TrendingUp">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Год', 'Выручка', 'Прибыль', 'Активы', 'Капитал'].map(h => (
                    <th key={h} className={`py-1.5 pr-3 text-muted-foreground font-semibold ${h === 'Год' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.финансы.map((f, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-3 font-bold">{f.год}</td>
                    <td className="py-1.5 pr-3 text-right font-medium">{fmtMoney(f.выручка) || '—'}</td>
                    <td className={`py-1.5 pr-3 text-right font-medium ${Number(f.прибыль) < 0 ? 'text-red-600' : ''}`}>
                      {fmtMoney(f.прибыль) || '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{fmtMoney(f.активы) || '—'}</td>
                    <td className="py-1.5 text-right">{fmtMoney(f.капитал) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── Товарные знаки ────────────────────────────────────────────── */}
      {data.товарные_знаки && data.товарные_знаки.length > 0 && (
        <Section title="Товарные знаки" icon="Tag">
          <div className="flex flex-wrap gap-1.5">
            {data.товарные_знаки.map((tm, i) => (
              <span key={i} className="text-xs bg-muted/50 border border-border px-2 py-0.5 rounded-lg">
                {tm.наименование}
                {tm.дата_рег && <span className="text-muted-foreground ml-1">({fmtDate(tm.дата_рег)})</span>}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* ── Мета ──────────────────────────────────────────────────────── */}
      {data.запросов_сегодня !== undefined && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border pt-3 mt-4 flex-wrap">
          <Icon name="Info" size={11} className="shrink-0" />
          <span>Запросов сегодня: <b>{data.запросов_сегодня}</b></span>
          {data.запросов_остаток != null && (
            <span>Остаток: <b>{data.запросов_остаток}</b></span>
          )}
          <span className="ml-auto text-[10px] shrink-0">Источник: Checko.ru · ЕГРЮЛ / ЕГРИП</span>
        </div>
      )}
    </div>
  );
}
