import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

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

const DIVIDER = <div className="w-px self-stretch bg-border/60 mx-0.5" />;

const GROUP_LABEL = ({ children }: { children: string }) => (
  <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wide mr-0.5 shrink-0">
    {children}
  </span>
);

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

  const [showHot, setShowHot] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showVisible, setShowVisible] = useState(false);
  const hotRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canAssignBroker) return;
    adminApi.listUsers()
      .then(d => {
        const list: Broker[] = (d.users || []).filter((u: Broker) =>
          ['broker', 'manager', 'office_manager', 'director'].includes(u.role),
        );
        setBrokers(list);
      })
      .catch(() => {});
  }, [canAssignBroker]);

  useEffect(() => {
    const closeAll = (e: MouseEvent) => {
      if (brokerBtnRef.current && !brokerBtnRef.current.contains(e.target as Node)) setShowBrokers(false);
      if (xmlBtnRef.current && !xmlBtnRef.current.contains(e.target as Node)) setShowXml(false);
      if (hotRef.current && !hotRef.current.contains(e.target as Node)) setShowHot(false);
      if (newRef.current && !newRef.current.contains(e.target as Node)) setShowNew(false);
      if (visibleRef.current && !visibleRef.current.contains(e.target as Node)) setShowVisible(false);
    };
    window.addEventListener('mousedown', closeAll);
    return () => window.removeEventListener('mousedown', closeAll);
  }, []);

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

  const dropdownBtn = (label: string, icon: string, className: string, open: boolean) => (
    <button
      disabled={bulkLoading}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition disabled:opacity-50 ${className}`}
    >
      <Icon name={icon} size={11} />
      {label}
      <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={10} className="ml-0.5" />
    </button>
  );

  const dropdownMenu = (children: React.ReactNode) => (
    <div className="absolute z-30 mt-1 min-w-[160px] bg-white border border-border rounded-xl shadow-xl overflow-hidden">
      {children}
    </div>
  );

  const dropdownItem = (label: string, icon: string, colorCls: string, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-muted/60 border-b border-border/40 last:border-0 transition ${colorCls}`}
    >
      <Icon name={icon} size={12} />
      {label}
    </button>
  );

  return (
    <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl p-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">

        {/* Счётчик + Снять */}
        <span className="text-xs font-semibold text-brand-blue bg-white px-2 py-1 rounded-md border border-brand-blue/30 shrink-0">
          <Icon name="CheckSquare" size={12} className="inline -mt-0.5 mr-1" />
          {selected.size} выбрано
        </span>
        <button onClick={onDeselect}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition">
          <Icon name="X" size={11} /> Снять
        </button>

        {DIVIDER}

        {/* Действия */}
        <GROUP_LABEL>Действия</GROUP_LABEL>
        <button
          disabled={bulkLoading}
          onClick={() => { if (confirm(`Активные — применить к ${selected.size} объект(ам)?`)) onBulk('activate'); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 transition disabled:opacity-50"
        >
          <Icon name="CheckCircle" size={11} /> Активные
        </button>
        <button
          disabled={bulkLoading}
          onClick={() => { if (confirm(`В архив — применить к ${selected.size} объект(ам)?`)) onBulk('archive'); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200 transition disabled:opacity-50"
        >
          <Icon name="Archive" size={11} /> В архив
        </button>
        {isAdmin && (
          <button
            disabled={bulkLoading}
            onClick={onBulkDelete}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border bg-red-50 text-red-600 hover:bg-red-100 border-red-200 transition disabled:opacity-50"
          >
            <Icon name="Trash2" size={11} /> Удалить
          </button>
        )}

        {DIVIDER}

        {/* Статусы — 3 выпадашки */}
        <GROUP_LABEL>Статусы</GROUP_LABEL>

        {/* Горячее */}
        <div className="relative" ref={hotRef}>
          <div onClick={() => setShowHot(s => !s)}>
            {dropdownBtn('Горячее', 'Flame', 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200', showHot)}
          </div>
          {showHot && dropdownMenu(<>
            {dropdownItem('Горячее', 'Flame', 'text-orange-700', () => { onBulk('set_hot', true); setShowHot(false); })}
            {dropdownItem('Не горячее', 'FlameKindling', 'text-muted-foreground', () => { onBulk('set_hot', false); setShowHot(false); })}
          </>)}
        </div>

        {/* Новинка */}
        <div className="relative" ref={newRef}>
          <div onClick={() => setShowNew(s => !s)}>
            {dropdownBtn('Новинка', 'Sparkles', 'bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200', showNew)}
          </div>
          {showNew && dropdownMenu(<>
            {dropdownItem('Новинка', 'Sparkles', 'text-sky-700', () => { onBulk('set_new', true); setShowNew(false); })}
            {dropdownItem('Не новинка', 'SparkleOff', 'text-muted-foreground', () => { onBulk('set_new', false); setShowNew(false); })}
          </>)}
        </div>

        {/* Видимость */}
        <div className="relative" ref={visibleRef}>
          <div onClick={() => setShowVisible(s => !s)}>
            {dropdownBtn('Видимость', 'Eye', 'bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-200', showVisible)}
          </div>
          {showVisible && dropdownMenu(<>
            {dropdownItem('Виден на сайте', 'Eye', 'text-teal-700', () => { onBulk('set_visible', true); setShowVisible(false); })}
            {dropdownItem('Не виден на сайте', 'EyeOff', 'text-rose-600', () => { onBulk('set_visible', false); setShowVisible(false); })}
          </>)}
        </div>

        {DIVIDER}

        {/* Экспорт / передача */}
        <GROUP_LABEL>Экспорт</GROUP_LABEL>

        {/* XML-выгрузка */}
        <div className="relative" ref={xmlBtnRef}>
          <button
            disabled={bulkLoading}
            onClick={() => setShowXml(s => !s)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-200 disabled:opacity-50"
          >
            <Icon name="FileCode2" size={11} />
            XML-выгрузка
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

        {/* Передать агенту */}
        {canAssignBroker && (
          <div className="relative" ref={brokerBtnRef}>
            <button
              disabled={bulkLoading}
              onClick={() => setShowBrokers(s => !s)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200 disabled:opacity-50"
            >
              <Icon name="UserCheck" size={11} />
              Передать агенту
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

      </div>
    </div>
  );
}
