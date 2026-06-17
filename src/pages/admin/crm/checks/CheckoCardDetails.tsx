import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { Sec } from './checko-ui';
import { fmtMoney, fmtDate } from './checko-types';
import type { CheckoData } from './checko-types';

interface Props {
  data: CheckoData;
  инн?: string;
  огрн?: string;
  адрес?: string;
}

export default function CheckoCardDetails({ data, инн, огрн, адрес }: Props) {
  const [showAllOkveds, setShowAllOkveds] = useState(false);
  const [showDirHistory, setShowDirHistory] = useState(false);

  return (
    <>
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
    </>
  );
}
