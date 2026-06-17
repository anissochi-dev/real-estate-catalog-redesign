import { useState } from 'react';
import Icon from '@/components/ui/icon';

interface Risk { label: string; level: 'danger' | 'warning' }
interface Founder {
  наименование: string; тип?: string;
  доля_руб?: string | number; доля_пct?: string | number;
  огрн?: string; инн?: string; с?: string;
}
interface DirectorEntry {
  фио: string; должность: string; инн?: string;
  с?: string; по?: string; массовый?: boolean; дисквалифицирован?: boolean;
}
interface OkvedItem { код: string; наименование: string; основной: boolean }
interface License { вид: string; номер: string; с: string }
interface FinanceYear {
  год: string;
  выручка: string | number; прибыль: string | number;
  активы: string | number; капитал: string | number;
}
interface Trademark { наименование: string; дата_рег: string }
interface TaxPayment { наименование: string; сумма: number }

interface CheckoData {
  инн?: string; огрн?: string; кпп?: string; огрнип?: string; окпо?: string;
  наименование?: string; наименование_полное?: string; наименование_англ?: string;
  опф?: string; тип?: string;
  статус?: string; статус_код?: string; действующее?: boolean; ликвидировано?: boolean;
  дата_регистрации?: string; дата_ликвидации?: string;
  адрес?: string;
  оквэд_основной?: string; оквэд_наим?: string; оквэд_список?: OkvedItem[];
  директор_фио?: string; директор_должность?: string; директор_инн?: string;
  директор_массовый?: boolean;
  директора_история?: DirectorEntry[];
  учредители?: Founder[];
  телефоны?: string[]; email?: string[]; сайты?: string[];
  сотрудников?: string | number; сотрудников_год?: string;
  уст_капитал?: string | number;
  лицензии?: License[];
  налог_режим?: string[];
  налог_уплачено?: TaxPayment[];
  мсп_категория?: string; мсп_дата?: string;
  товарные_знаки?: Trademark[];
  финансы?: FinanceYear[];
  риски?: Risk[];
  санкции_нет?: boolean; санкции_связи_нет?: boolean;
  запросов_сегодня?: number; запросов_остаток?: number | null;
  error?: string;
  // совместимость со старым форматом
  name?: string; name_full?: string; inn?: string; ogrn?: string;
  status?: string; is_active?: boolean; is_liquidated?: boolean;
  address?: string; risks?: Risk[];
}

const fmtMoney = (n: string | number | undefined | null): string | null => {
  if (n === '' || n === null || n === undefined) return null;
  const num = Number(n);
  if (isNaN(num) || num === 0) return null;
  const abs = Math.abs(num);
  const sign = num < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)} млрд ₽`;
  if (abs >= 1_000_000)     return `${sign}${(abs / 1_000_000).toFixed(1)} млн ₽`;
  if (abs >= 1_000)         return `${sign}${(abs / 1_000).toFixed(0)} тыс ₽`;
  return `${sign}${abs.toLocaleString('ru')} ₽`;
};

const fmtDate = (s: string | undefined | null): string | null => {
  if (!s) return null;
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return s; }
};

const Sec = ({ title, icon, children, defaultOpen = true }: {
  title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border mt-4 pt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        <Icon name={icon} size={13} className="text-brand-blue shrink-0" />
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex-1">{title}</span>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={12} className="text-muted-foreground/50 group-hover:text-muted-foreground" />
      </button>
      {open && children}
    </div>
  );
};

const Pill = ({ label, green }: { label: string; green: boolean }) => (
  <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg ${
    green ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
  }`}>
    <Icon name={green ? 'CheckCircle2' : 'XCircle'} size={12} />
    {label}
  </div>
);

export default function CheckoCard({ data }: { data: CheckoData }) {
  const [showAllOkveds, setShowAllOkveds] = useState(false);
  const [showDirHistory, setShowDirHistory] = useState(false);

  if (data.error) {
    return (
      <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3">
        <Icon name="AlertCircle" size={15} className="shrink-0" />
        {data.error}
      </div>
    );
  }

  const наим        = data.наименование || data.name || '—';
  const наимПолн    = data.наименование_полное || data.name_full;
  const инн         = data.инн || data.inn;
  const огрн        = data.огрн || data.ogrn;
  const адрес       = data.адрес || data.address;
  const ликвид      = data.ликвидировано ?? data.is_liquidated ?? false;
  const действует   = data.действующее ?? data.is_active ?? false;
  const статус      = data.статус || data.status;
  const риски       = data.риски || data.risks || [];

  const statusColor = ликвид
    ? 'bg-red-50 text-red-700 border-red-200'
    : действует
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  const statusIcon = ликвид ? 'XCircle' : действует ? 'CheckCircle2' : 'AlertCircle';

  return (
    <div className="text-sm">

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

        {/* Санкции */}
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

      {/* ── Реквизиты ─────────────────────────────────────────────────── */}
      <Sec title="Реквизиты" icon="FileText">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          {инн && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">ИНН</div>
              <div className="font-mono font-medium">{инн}</div>
            </div>
          )}
          {огрн && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">ОГРН</div>
              <div className="font-mono font-medium">{огрн}</div>
            </div>
          )}
          {data.огрнип && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">ОГРНИП</div>
              <div className="font-mono font-medium">{data.огрнип}</div>
            </div>
          )}
          {data.кпп && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">КПП</div>
              <div className="font-mono font-medium">{data.кпп}</div>
            </div>
          )}
          {data.окпо && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">ОКПО</div>
              <div className="font-mono font-medium">{data.окпо}</div>
            </div>
          )}
          {data.дата_регистрации && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Дата регистрации</div>
              <div className="font-medium">{fmtDate(data.дата_регистрации)}</div>
            </div>
          )}
          {data.уст_капитал && fmtMoney(data.уст_капитал) && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Уставной капитал</div>
              <div className="font-medium">{fmtMoney(data.уст_капитал)}</div>
            </div>
          )}
          {data.сотрудников !== '' && data.сотрудников !== undefined && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Сотрудников (ССЧ)</div>
              <div className="font-medium">
                {data.сотрудников} чел.
                {data.сотрудников_год && <span className="text-muted-foreground text-[10px] ml-1">за {data.сотрудников_год} г.</span>}
              </div>
            </div>
          )}
          {data.мсп_категория && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Категория МСП</div>
              <div className="font-medium capitalize">
                {data.мсп_категория.toLowerCase()}
                {data.мсп_дата && <span className="text-muted-foreground text-[10px] ml-1">с {fmtDate(data.мсп_дата)}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Налоговый режим */}
        {data.налог_режим && data.налог_режим.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.налог_режим.map((r, i) => (
              <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                {r}
              </span>
            ))}
            <span className="text-xs text-muted-foreground self-center">— специальный налоговый режим</span>
          </div>
        )}
      </Sec>

      {/* ── Адрес ─────────────────────────────────────────────────────── */}
      {адрес && (
        <Sec title="Юридический адрес" icon="MapPin">
          <div className="bg-muted/30 rounded-xl px-3 py-2 text-sm leading-relaxed">{адрес}</div>
        </Sec>
      )}

      {/* ── Контакты ──────────────────────────────────────────────────── */}
      {((data.телефоны?.length ?? 0) + (data.email?.length ?? 0) + (data.сайты?.length ?? 0)) > 0 && (
        <Sec title="Контакты" icon="Phone">
          <div className="space-y-2">
            {data.телефоны && data.телефоны.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.телефоны.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-sm bg-muted/50 border border-border px-3 py-1 rounded-lg font-mono">
                    <Icon name="Phone" size={12} className="text-muted-foreground" />
                    {t}
                  </span>
                ))}
              </div>
            )}
            {data.email && data.email.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.email.map((e, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-sm bg-muted/50 border border-border px-3 py-1 rounded-lg">
                    <Icon name="Mail" size={12} className="text-muted-foreground" />
                    {e}
                  </span>
                ))}
              </div>
            )}
            {data.сайты && data.сайты.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.сайты.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-sm bg-muted/50 border border-border px-3 py-1 rounded-lg">
                    <Icon name="Globe" size={12} className="text-muted-foreground" />
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Sec>
      )}

      {/* ── Руководитель ──────────────────────────────────────────────── */}
      {data.директор_фио && (
        <Sec title="Руководитель" icon="User">
          <div className={`rounded-xl p-3 border ${data.директор_массовый ? 'bg-amber-50 border-amber-200' : 'bg-muted/30 border-border'}`}>
            <div className="font-bold text-base">{data.директор_фио}</div>
            {data.директор_должность && <div className="text-xs text-muted-foreground mt-0.5">{data.директор_должность}</div>}
            {data.директор_инн && <div className="text-xs text-muted-foreground mt-0.5">ИНН: <span className="font-mono">{data.директор_инн}</span></div>}
            {data.директор_массовый && (
              <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-700 font-semibold">
                <Icon name="AlertTriangle" size={11} /> Массовый руководитель
              </div>
            )}
          </div>
          {data.директора_история && data.директора_история.length > 1 && (
            <div className="mt-2">
              <button onClick={() => setShowDirHistory(v => !v)}
                className="text-xs text-brand-blue hover:underline flex items-center gap-1">
                <Icon name={showDirHistory ? 'ChevronUp' : 'ChevronDown'} size={11} />
                История руководителей ({data.директора_история.length})
              </button>
              {showDirHistory && (
                <div className="mt-2 space-y-1.5">
                  {data.директора_история.map((d, i) => (
                    <div key={i} className="text-xs bg-muted/30 rounded-lg px-3 py-2">
                      <span className="font-semibold">{d.фио}</span>
                      {d.должность && <span className="text-muted-foreground"> — {d.должность}</span>}
                      {(d.с || d.по) && <span className="text-muted-foreground ml-1">({fmtDate(d.с) || '?'} — {fmtDate(d.по) || 'н.в.'})</span>}
                      {d.массовый && <span className="ml-2 text-amber-600 font-semibold">⚠ массовый</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Sec>
      )}

      {/* ── Учредители ────────────────────────────────────────────────── */}
      {data.учредители && data.учредители.length > 0 && (
        <Sec title={`Учредители (${data.учредители.length})`} icon="Users">
          <div className="space-y-2">
            {data.учредители.map((f, i) => (
              <div key={i} className="bg-muted/30 rounded-xl px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{f.наименование}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {f.инн && <span className="text-xs text-muted-foreground">ИНН: <span className="font-mono">{f.инн}</span></span>}
                      {f.огрн && <span className="text-xs text-muted-foreground">ОГРН: <span className="font-mono">{f.огрн}</span></span>}
                      {f.с && <span className="text-xs text-muted-foreground">с {fmtDate(f.с)}</span>}
                    </div>
                  </div>
                  {(f.доля_пct || f.доля_руб) && (
                    <div className="text-right shrink-0">
                      {f.доля_пct && <div className="font-bold text-brand-blue">{f.доля_пct}%</div>}
                      {f.доля_руб && fmtMoney(f.доля_руб) && (
                        <div className="text-xs text-muted-foreground">{fmtMoney(f.доля_руб)}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Sec>
      )}

      {/* ── Виды деятельности ─────────────────────────────────────────── */}
      {(data.оквэд_основной || (data.оквэд_список && data.оквэд_список.length > 0)) && (
        <Sec title="Виды деятельности (ОКВЭД)" icon="Briefcase">
          {data.оквэд_основной && (
            <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl px-3 py-2.5 mb-2">
              <div className="text-[10px] font-bold text-brand-blue uppercase tracking-wide mb-1">Основной</div>
              <div className="font-mono font-bold text-brand-blue text-base">{data.оквэд_основной}</div>
              {data.оквэд_наим && <div className="text-xs text-muted-foreground mt-0.5">{data.оквэд_наим}</div>}
            </div>
          )}
          {data.оквэд_список && data.оквэд_список.filter(o => !o.основной).length > 0 && (
            <>
              <button onClick={() => setShowAllOkveds(v => !v)}
                className="text-xs text-brand-blue hover:underline flex items-center gap-1 mb-2">
                <Icon name={showAllOkveds ? 'ChevronUp' : 'ChevronDown'} size={11} />
                {showAllOkveds ? 'Скрыть' : `Ещё ${data.оквэд_список.filter(o => !o.основной).length} видов деятельности`}
              </button>
              {showAllOkveds && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {data.оквэд_список.filter(o => !o.основной).map((o, i) => (
                    <div key={i} className="text-xs bg-muted/30 rounded px-2.5 py-1.5 flex gap-2">
                      <span className="font-mono font-bold text-brand-blue shrink-0">{o.код}</span>
                      <span className="text-muted-foreground">{o.наименование}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Sec>
      )}

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
    </div>
  );
}
