import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

interface BulkOp {
  op: string;
  realOp?: string;
  label: string;
  icon: string;
  className: string;
  confirm?: boolean;
  value?: unknown;
}

const BULK_OPS: BulkOp[] = [
  { op: 'activate',        label: 'Активные',       icon: 'CheckCircle',  className: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200', confirm: true },
  { op: 'archive',         label: 'В архив',        icon: 'Archive',      className: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200', confirm: true },
  { op: 'set_hot',         label: 'Горячее',        icon: 'Flame',        className: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200', value: true },
  { op: 'set_hot_off',     label: 'Не горячее',     icon: 'FlameOff',     className: 'bg-muted/40 text-muted-foreground hover:bg-muted border-border', value: false, realOp: 'set_hot' },
  { op: 'set_new',         label: 'Новинка',        icon: 'Sparkles',     className: 'bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200', value: true },
  { op: 'set_new_off',     label: 'Не новинка',     icon: 'X',            className: 'bg-muted/40 text-muted-foreground hover:bg-muted border-border', value: false, realOp: 'set_new' },
  { op: 'set_visible',     label: 'Виден на сайте', icon: 'Eye',          className: 'bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-200', value: true },
  { op: 'set_visible_off', label: 'Не виден на сайте', icon: 'EyeOff',   className: 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200', value: false, realOp: 'set_visible' },
];

interface Broker {
  id: number;
  name: string;
  role: string;
}

interface Props {
  selected: Set<number>;
  onDeselect: () => void;
  onBulk: (op: string, value?: unknown) => void;
  onBulkDelete: () => void;
  bulkLoading: boolean;
  isAdmin: boolean;
}

export default function ListingsBulkBar({
  selected, onDeselect, onBulk, onBulkDelete, bulkLoading, isAdmin,
}: Props) {
  const { user } = useAuth();
  const canAssignBroker = user?.role === 'admin' || user?.role === 'director';

  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [showBrokers, setShowBrokers] = useState(false);
  const [brokerQuery, setBrokerQuery] = useState('');
  const brokerBtnRef = useRef<HTMLDivElement>(null);

  const [showXml, setShowXml] = useState(false);
  const xmlBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canAssignBroker) return;
    adminApi.listUsers()
      .then(d => {
        const list: Broker[] = (d.users || []).filter((u: Broker) =>
          ['broker', 'manager', 'office_manager', 'director'].includes(u.role),
        );
        setBrokers(list);
      })
      .catch(() => { /* showError уже отработал */ });
  }, [canAssignBroker]);

  // Закрываем меню при клике вне
  useEffect(() => {
    if (!showBrokers) return;
    const onClick = (e: MouseEvent) => {
      if (brokerBtnRef.current && !brokerBtnRef.current.contains(e.target as Node)) {
        setShowBrokers(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [showBrokers]);

  useEffect(() => {
    if (!showXml) return;
    const onClick = (e: MouseEvent) => {
      if (xmlBtnRef.current && !xmlBtnRef.current.contains(e.target as Node)) {
        setShowXml(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [showXml]);

  const filteredBrokers = useMemo(() => {
    const q = brokerQuery.trim().toLowerCase();
    if (!q) return brokers;
    return brokers.filter(b => b.name.toLowerCase().includes(q));
  }, [brokers, brokerQuery]);

  if (selected.size === 0) return null;

  const ROLE_RU: Record<string, string> = {
    admin: 'Админ', editor: 'Редактор', manager: 'Менеджер',
    director: 'Директор', broker: 'Брокер', office_manager: 'Офис-менеджер',
  };

  const handleAssignBroker = (bid: number | null) => {
    if (!confirm(
      bid === null
        ? `Снять брокера с ${selected.size} объект(ов)?`
        : `Передать ${selected.size} объект(ов) выбранному агенту?`,
    )) return;
    onBulk('set_broker', bid);
    setShowBrokers(false);
    setBrokerQuery('');
  };

  const mkBtn = (op: BulkOp) => (
    <button
      key={op.op}
      disabled={bulkLoading}
      onClick={() => {
        const realOp = op.realOp || op.op;
        const doIt = () => onBulk(realOp, op.value);
        if (op.confirm) {
          if (confirm(`${op.label} — применить к ${selected.size} объект(ам)?`)) doIt();
        } else { doIt(); }
      }}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition disabled:opacity-50 ${op.className}`}
      title={op.label}
    >
      <Icon name={op.icon} size={11} />
      {op.label}
    </button>
  );

  const getOp = (id: string) => BULK_OPS.find(o => o.op === id)!;

  return (
    <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl p-2.5 space-y-1.5">

      {/* Строка 1: счётчик + Снять + Активные + В архив */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold text-brand-blue bg-white px-2 py-1 rounded-md border border-brand-blue/30 shrink-0">
          <Icon name="CheckSquare" size={12} className="inline -mt-0.5 mr-1" />
          {selected.size} выбрано
        </span>
        <button onClick={onDeselect}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition">
          <Icon name="X" size={11} /> Снять
        </button>
        {mkBtn(getOp('activate'))}
        {mkBtn(getOp('archive'))}
      </div>

      {/* Строка 2: Горячее · Новинка · Видимость */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {mkBtn(getOp('set_hot'))}
        {mkBtn(getOp('set_hot_off'))}
        {mkBtn(getOp('set_new'))}
        {mkBtn(getOp('set_new_off'))}
        {mkBtn(getOp('set_visible'))}
        {mkBtn(getOp('set_visible_off'))}
      </div>

      {/* Строка 3: XML, агент, удалить */}
      <div className="flex items-center gap-1.5 flex-wrap">
      {/* XML-выгрузка */}
      <div className="relative" ref={xmlBtnRef}>
        <button
          disabled={bulkLoading}
          onClick={() => setShowXml(s => !s)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-200 disabled:opacity-50"
          title="XML-выгрузка"
        >
          <Icon name="FileCode2" size={11} />
          <span className="hidden sm:inline">XML-выгрузка</span>
          <Icon name={showXml ? 'ChevronUp' : 'ChevronDown'} size={10} />
        </button>

        {showXml && (
          <div className="absolute z-30 mt-1 w-64 bg-white border border-border rounded-xl shadow-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <div className="text-xs font-semibold text-foreground">Выбрать площадку</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Добавить или убрать {selected.size} объект(ов)</div>
            </div>

            {[
              { platform: 'yandex', label: 'Яндекс.Недвижимость', icon: 'Building2' },
              { platform: 'avito',  label: 'Авито',               icon: 'ShoppingBag' },
              { platform: 'cian',   label: 'ЦИАН',                icon: 'MapPin' },
              { platform: 'all',    label: 'Все площадки',        icon: 'Globe' },
            ].map(({ platform, label, icon }) => (
              <div key={platform} className="flex items-center justify-between px-3 py-2 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-2">
                  <Icon name={icon} size={13} className="text-muted-foreground" />
                  <span className="text-xs font-medium">{label}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { onBulk('set_export', { platform, enabled: true }); setShowXml(false); }}
                    className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium"
                  >+ Добавить</button>
                  <button
                    onClick={() => { onBulk('set_export', { platform, enabled: false }); setShowXml(false); }}
                    className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium"
                  >− Убрать</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canAssignBroker && (
        <div className="relative" ref={brokerBtnRef}>
          <button
            disabled={bulkLoading}
            onClick={() => setShowBrokers(s => !s)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200 disabled:opacity-50"
            title="Передать выбранные объекты другому агенту"
          >
            <Icon name="UserCheck" size={11} />
            <span className="hidden sm:inline">Передать агенту</span>
            <Icon name={showBrokers ? 'ChevronUp' : 'ChevronDown'} size={10} />
          </button>

          {showBrokers && (
            <div className="absolute z-30 mt-1 w-72 bg-white border border-border rounded-xl shadow-xl overflow-hidden">
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Icon name="Search" size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Поиск по имени..."
                    value={brokerQuery}
                    onChange={e => setBrokerQuery(e.target.value)}
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:border-brand-blue"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {filteredBrokers.length === 0 ? (
                  <div className="p-3 text-xs text-center text-muted-foreground">Нет подходящих агентов</div>
                ) : (
                  filteredBrokers.map(b => (
                    <button
                      key={b.id}
                      onClick={() => handleAssignBroker(b.id)}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between border-b border-border/40 last:border-0"
                    >
                      <div>
                        <div className="text-xs font-medium">{b.name}</div>
                        <div className="text-[10px] text-muted-foreground">{ROLE_RU[b.role] || b.role}</div>
                      </div>
                      <Icon name="ChevronRight" size={12} className="text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => handleAssignBroker(null)}
                className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t border-border inline-flex items-center gap-1.5"
              >
                <Icon name="UserMinus" size={12} />
                Снять брокера
              </button>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <button
          disabled={bulkLoading}
          onClick={onBulkDelete}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border bg-red-50 text-red-700 hover:bg-red-100 border-red-200 disabled:opacity-50"
        >
          <Icon name="Trash2" size={11} /> Удалить
        </button>
      )}
      </div>{/* конец строки 3 */}
    </div>
  );
}