import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Lead, STATUSES, SOURCE_LABELS, LEAD_TYPES } from './leadsTypes';
import { formatPhone } from '@/lib/phone';

interface Props {
  leads: Lead[];
  onOpen: (l: Lead) => void;
  onDelete?: (id: number) => void;
  onStatusChange?: (id: number, status: string) => void;
  search?: string;
  currentUserId?: number;
  isBroker?: boolean;
}

// Цвет левого бордера по статусу
const STATUS_BORDER: Record<string, string> = {
  pending:     'border-l-orange-400',
  new:         'border-l-emerald-500',
  in_progress: 'border-l-amber-400',
  done:        'border-l-blue-400',
  rejected:    'border-l-red-400',
};

// Цвет фона аватара по имени (детерминированный)
const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fmtDate(s: string) {
  const d = new Date(s);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Сегодня, ${time}`;
  if (isYesterday) return `Вчера, ${time}`;
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' }) + ` ${time}`;
}

function highlight(text: string, query: string) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function LeadsTable({ leads, onOpen, onDelete, onStatusChange, search = '', currentUserId, isBroker = false }: Props) {
  const [statusMenuId, setStatusMenuId] = useState<number | null>(null);

  // Брокер видит все лиды, управляет только своими (нет прав update/delete на чужие)
  const canManageLead = (l: Lead) =>
    !isBroker || (l.broker_id != null && l.broker_id === currentUserId);

  const sorted = useMemo(() => {
    const STATUS_ORDER: Record<string, number> = { pending: 0, new: 1, in_progress: 2, done: 3, rejected: 4 };
    return [...leads].sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 9;
      const sb = STATUS_ORDER[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [leads]);

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm py-16 text-center text-muted-foreground">
        <Icon name="Inbox" size={32} className="mx-auto mb-3 opacity-30" />
        <div className="text-sm">Нет заявок</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map(l => {
        const st = STATUSES.find(x => x[0] === l.status);
        const tp = LEAD_TYPES.find(x => x[0] === l.lead_type);
        const borderCls = STATUS_BORDER[l.status] || 'border-l-muted';
        const isNew = l.status === 'new' || l.status === 'pending';
        const name = l.name || 'Без имени';
        const avatarCls = avatarColor(name);
        const canManage = canManageLead(l);

        return (
          <div
            key={l.id}
            className={`bg-white rounded-2xl shadow-sm border-l-4 ${borderCls} overflow-hidden hover:shadow-md transition-shadow cursor-pointer`}
            onClick={() => onOpen(l)}
          >
            <div className="px-4 py-3">

              {/* ── Строка 1: аватар + имя + телефон + дата ── */}
              <div className="flex items-start gap-3">
                {/* Аватар */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarCls}`}>
                  {initials(name)}
                </div>

                {/* Имя + телефон */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${isNew ? 'text-foreground' : 'text-foreground/80'}`}>
                      {highlight(name, search)}
                    </span>
                    {isNew && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Новая" />}
                    {l.company && (
                      <span className="text-xs text-purple-700 font-medium">{l.company}</span>
                    )}
                  </div>

                  {/* Телефон: для брокера на чужом лиде — полностью скрыт */}
                  <div className="flex items-center gap-2 mt-0.5">
                    {canManage ? (
                      <>
                        <a
                          href={`tel:${l.phone}`}
                          onClick={e => e.stopPropagation()}
                          className={`text-xs font-mono hover:underline flex items-center gap-1 ${l.phone_hidden ? 'text-muted-foreground' : 'text-brand-blue font-semibold'}`}
                        >
                          <Icon name="Phone" size={11} />
                          {l.phone ? formatPhone(l.phone) : '—'}
                        </a>
                        {l.phone_hidden && (
                          <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
                            <Icon name="EyeOff" size={10} /> скрыт
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Icon name="Lock" size={10} /> Телефон скрыт
                      </span>
                    )}
                    {l.email && canManage && (
                      <a
                        href={`mailto:${l.email}`}
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-muted-foreground hover:underline truncate max-w-[160px]"
                      >
                        {l.email}
                      </a>
                    )}
                  </div>
                </div>

                {/* Дата */}
                <div className="text-[11px] text-muted-foreground shrink-0 text-right">
                  {fmtDate(l.created_at)}
                </div>
              </div>

              {/* ── Строка 2: объект ── */}
              {(l.seo_h1 || l.object_url) && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon name="Building2" size={12} className="shrink-0" />
                  {l.object_url ? (
                    <a
                      href={l.object_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-brand-blue hover:underline truncate"
                    >
                      {l.seo_h1 || l.object_url}
                    </a>
                  ) : (
                    <span className="truncate">{l.seo_h1}</span>
                  )}
                </div>
              )}

              {/* ── Строка 3: текст сообщения ── */}
              {l.message && (
                <div className="mt-2 text-sm text-foreground/80 bg-muted/30 rounded-xl px-3 py-2 flex gap-2">
                  <Icon name="MessageSquare" size={13} className="text-muted-foreground shrink-0 mt-0.5" />
                  <span className="line-clamp-2 leading-relaxed">
                    {highlight(l.message, search)}
                  </span>
                </div>
              )}

              {/* ── Строка 4: бейджи + статус + бюджет + кнопки ── */}
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">

                {/* Бейджи */}
                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                  {st && (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st[2]}`} />
                      {st[1]}
                    </span>
                  )}
                  {tp && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${tp[2]}`}>{tp[1]}</span>
                  )}
                  {l.is_network_tenant && (
                    <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                      <Icon name="Network" size={10} /> Сетевик
                    </span>
                  )}
                  {l.broker_id && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                      <Icon name="UserCheck" size={10} /> Брокер
                    </span>
                  )}
                  {l.source === 'ai-chat' && (
                    <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                      <Icon name="Bot" size={10} /> ИИ-чат
                    </span>
                  )}
                  {l.source && l.source !== 'ai-chat' && SOURCE_LABELS[l.source] && (
                    <span className="text-[11px] text-muted-foreground">{SOURCE_LABELS[l.source]}</span>
                  )}
                  {l.budget != null && l.budget > 0 && (
                    <span className="text-[11px] font-semibold text-foreground/70">
                      {l.budget.toLocaleString('ru')} ₽
                    </span>
                  )}
                </div>

                {/* Кнопки действий */}
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>

                  {/* Быстрая смена статуса — только если есть права */}
                  {onStatusChange && canManage && (
                    <div className="relative">
                      <button
                        onClick={() => setStatusMenuId(statusMenuId === l.id ? null : l.id)}
                        className="h-7 px-2 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-1"
                        title="Сменить статус"
                      >
                        <Icon name="RefreshCw" size={12} />
                        Статус
                      </button>
                      {statusMenuId === l.id && (
                        <div className="absolute right-0 bottom-full mb-1 bg-white border border-border rounded-xl shadow-lg z-50 py-1 min-w-[140px]">
                          {STATUSES.map(s => (
                            <button
                              key={s[0]}
                              onClick={() => { onStatusChange(l.id, s[0]); setStatusMenuId(null); }}
                              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors ${l.status === s[0] ? 'font-semibold text-brand-blue' : 'text-foreground'}`}
                            >
                              <span className={`w-2 h-2 rounded-full ${s[2]} shrink-0`} />
                              {s[1]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Подробнее */}
                  <button
                    onClick={() => onOpen(l)}
                    className="h-7 px-2 rounded-lg text-[11px] font-medium text-brand-blue hover:bg-brand-blue/10 transition-colors flex items-center gap-1"
                  >
                    <Icon name="Eye" size={12} />
                    Подробнее
                  </button>

                  {/* Удалить — только если есть права */}
                  {onDelete && canManage && (
                    <button
                      onClick={() => onDelete(l.id)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="Удалить"
                    >
                      <Icon name="Trash2" size={13} />
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
}