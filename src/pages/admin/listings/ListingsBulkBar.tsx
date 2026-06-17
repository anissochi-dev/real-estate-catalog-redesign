import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

interface Broker { id: number; name: string; role: string }

interface Props {
  selected: Set<number>;
  onDeselect: () => void;
  onBulk: (op: string, value?: unknown) => void;
  onBulkDelete: () => void;
  bulkLoading: boolean;
  isAdmin: boolean;
}

const ROLE_RU: Record<string, string> = {
  admin: 'Админ', editor: 'Редактор', manager: 'Менеджер',
  director: 'Директор', broker: 'Брокер', office_manager: 'Офис',
};

export default function ListingsBulkBar({ selected, onDeselect, onBulk, onBulkDelete, bulkLoading, isAdmin }: Props) {
  const { user } = useAuth();
  const canAssignBroker = user?.role === 'admin' || user?.role === 'director';

  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [showBrokers, setShowBrokers] = useState(false);
  const [brokerQuery, setBrokerQuery] = useState('');
  const [showXml, setShowXml] = useState(false);
  const [showHot, setShowHot] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showVisible, setShowVisible] = useState(false);

  const brokerRef = useRef<HTMLDivElement>(null);
  const xmlRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canAssignBroker) return;
    adminApi.listUsers()
      .then(d => setBrokers((d.users || []).filter((u: Broker) =>
        ['broker', 'manager', 'office_manager', 'director'].includes(u.role))))
      .catch(() => {});
  }, [canAssignBroker]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (brokerRef.current && !brokerRef.current.contains(e.target as Node)) setShowBrokers(false);
      if (xmlRef.current && !xmlRef.current.contains(e.target as Node)) setShowXml(false);
      if (hotRef.current && !hotRef.current.contains(e.target as Node)) setShowHot(false);
      if (newRef.current && !newRef.current.contains(e.target as Node)) setShowNew(false);
      if (visibleRef.current && !visibleRef.current.contains(e.target as Node)) setShowVisible(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  const filteredBrokers = useMemo(() => {
    const q = brokerQuery.trim().toLowerCase();
    return q ? brokers.filter(b => b.name.toLowerCase().includes(q)) : brokers;
  }, [brokers, brokerQuery]);

  if (selected.size === 0) return null;

  const handleAssignBroker = (bid: number | null) => {
    if (!confirm(bid === null ? `Снять брокера с ${selected.size} объект(ов)?` : `Передать ${selected.size} объект(ов) агенту?`)) return;
    onBulk('set_broker', bid);
    setShowBrokers(false);
    setBrokerQuery('');
  };

  // Кнопка светлой темы
  const Btn = ({ icon, label, cls, onClick: handleClick, disabled }: {
    icon: string; label: string; cls: string; onClick: () => void; disabled?: boolean;
  }) => (
    <button
      onClick={e => { e.stopPropagation(); handleClick(); }}
      disabled={disabled || bulkLoading}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition disabled:opacity-40 whitespace-nowrap ${cls}`}
    >
      <Icon name={icon} size={11} />
      {label}
    </button>
  );

  const DropBtn = ({ icon, label, cls, open, onClick: handleClick }: {
    icon: string; label: string; cls: string; open: boolean; onClick: () => void;
  }) => (
    <button
      onClick={e => { e.stopPropagation(); handleClick(); }}
      disabled={bulkLoading}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition disabled:opacity-40 whitespace-nowrap ${cls}`}
    >
      <Icon name={icon} size={11} />
      {label}
      <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={10} className="ml-0.5 opacity-60" />
    </button>
  );

  const Menu = ({ children }: { children: React.ReactNode }) => (
    <div className="absolute top-full mt-1 left-0 z-50 min-w-[160px] bg-white border border-border rounded-xl shadow-2xl overflow-hidden">
      {children}
    </div>
  );

  const MenuItem = ({ icon, label, cls, onClick: handleClick }: {
    icon: string; label: string; cls: string; onClick: () => void;
  }) => (
    <button
      onClick={e => { e.stopPropagation(); handleClick(); }}
      className={`w-full text-left flex items-center gap-2 px-3 py-2 text-[11px] font-medium hover:bg-muted/60 border-b border-border/30 last:border-0 transition ${cls}`}
    >
      <Icon name={icon} size={12} />
      {label}
    </button>
  );

  const Label = ({ children }: { children: string }) => (
    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest w-16 shrink-0">{children}</span>
  );

  return (
    <div className="bg-muted/40 border border-border rounded-xl px-3 pt-2.5 pb-2 space-y-1.5">

      {/* Шапка: счётчик + кнопка снять */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-blue bg-brand-blue/10 px-2 py-1 rounded-lg border border-brand-blue/20">
          <Icon name="CheckSquare" size={11} />
          {selected.size} выбрано
        </span>
        <button
          onClick={onDeselect}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border border-border text-muted-foreground hover:bg-muted transition"
        >
          <Icon name="X" size={11} /> Снять
        </button>
        {bulkLoading && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Icon name="Loader2" size={11} className="animate-spin" /> Применяю...
          </span>
        )}
      </div>

      {/* Строка 1: Действия */}
      <div className="flex items-center gap-1.5">
        <Label>Действия</Label>
        <div className="flex items-center gap-1 flex-wrap">
          <Btn icon="CheckCircle" label="Активные" cls="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            onClick={() => { if (confirm(`Активные — ${selected.size} объект(ов)?`)) onBulk('activate'); }} />
          <Btn icon="Archive" label="В архив" cls="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            onClick={() => { if (confirm(`В архив — ${selected.size} объект(ов)?`)) onBulk('archive'); }} />
          {isAdmin && (
            <Btn icon="Trash2" label="Удалить" cls="bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
              onClick={onBulkDelete} />
          )}
        </div>
      </div>

      {/* Строка 2: Статус */}
      <div className="flex items-center gap-1.5">
        <Label>Статус</Label>
        <div className="flex items-center gap-1 flex-wrap">
          <div className="relative" ref={hotRef}>
            <DropBtn icon="Flame" label="Горячее" cls="bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
              open={showHot} onClick={() => setShowHot(s => !s)} />
            {showHot && <Menu>
              <MenuItem icon="Flame" label="Горячее" cls="text-orange-700"
                onClick={() => { onBulk('set_hot', true); setShowHot(false); }} />
              <MenuItem icon="FlameKindling" label="Не горячее" cls="text-muted-foreground"
                onClick={() => { onBulk('set_hot', false); setShowHot(false); }} />
            </Menu>}
          </div>
          <div className="relative" ref={newRef}>
            <DropBtn icon="Sparkles" label="Новинка" cls="bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100"
              open={showNew} onClick={() => setShowNew(s => !s)} />
            {showNew && <Menu>
              <MenuItem icon="Sparkles" label="Новинка" cls="text-sky-700"
                onClick={() => { onBulk('set_new', true); setShowNew(false); }} />
              <MenuItem icon="X" label="Не новинка" cls="text-muted-foreground"
                onClick={() => { onBulk('set_new', false); setShowNew(false); }} />
            </Menu>}
          </div>
          <div className="relative" ref={visibleRef}>
            <DropBtn icon="Eye" label="Видимость" cls="bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
              open={showVisible} onClick={() => setShowVisible(s => !s)} />
            {showVisible && <Menu>
              <MenuItem icon="Eye" label="Виден на сайте" cls="text-teal-700"
                onClick={() => { onBulk('set_visible', true); setShowVisible(false); }} />
              <MenuItem icon="EyeOff" label="Скрыт" cls="text-rose-600"
                onClick={() => { onBulk('set_visible', false); setShowVisible(false); }} />
            </Menu>}
          </div>
        </div>
      </div>

      {/* Строка 3: Экспорт */}
      <div className="flex items-center gap-1.5">
        <Label>Экспорт</Label>
        <div className="flex items-center gap-1 flex-wrap">
          <div className="relative" ref={xmlRef}>
            <DropBtn icon="FileCode2" label="XML" cls="bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
              open={showXml} onClick={() => setShowXml(s => !s)} />
            {showXml && (
              <div className="absolute top-full mt-1 left-0 z-50 w-64 bg-white border border-border rounded-xl shadow-2xl overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-muted/30 text-[11px] font-semibold">Площадка XML-выгрузки</div>
                {[
                  { platform: 'yandex', label: 'Яндекс.Недвижимость', icon: 'Building2' },
                  { platform: 'avito',  label: 'Авито',               icon: 'ShoppingBag' },
                  { platform: 'cian',   label: 'ЦИАН',                icon: 'MapPin' },
                  { platform: 'all',    label: 'Все площадки',        icon: 'Globe' },
                ].map(({ platform, label, icon }) => (
                  <div key={platform} className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Icon name={icon} size={12} className="text-muted-foreground" />
                      {label}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={e => { e.stopPropagation(); onBulk('set_export', { platform, enabled: true }); setShowXml(false); }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">+</button>
                      <button onClick={e => { e.stopPropagation(); onBulk('set_export', { platform, enabled: false }); setShowXml(false); }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium">−</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canAssignBroker && (
            <div className="relative" ref={brokerRef}>
              <DropBtn icon="UserCheck" label="Агент" cls="bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                open={showBrokers} onClick={() => setShowBrokers(s => !s)} />
              {showBrokers && (
                <div className="absolute top-full mt-1 left-0 z-50 w-64 bg-white border border-border rounded-xl shadow-2xl overflow-hidden">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Icon name="Search" size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input autoFocus type="text" placeholder="Поиск..." value={brokerQuery}
                        onChange={e => setBrokerQuery(e.target.value)}
                        className="w-full pl-6 pr-2 py-1 text-[11px] border border-border rounded-lg focus:outline-none focus:border-brand-blue" />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {filteredBrokers.length === 0
                      ? <div className="p-3 text-[11px] text-center text-muted-foreground">Нет агентов</div>
                      : filteredBrokers.map(b => (
                        <button key={b.id}
                          onClick={e => { e.stopPropagation(); handleAssignBroker(b.id); }}
                          className="w-full text-left flex items-center justify-between px-3 py-2 text-[11px] hover:bg-muted/60 border-b border-border/30 last:border-0 transition"
                        >
                          <span className="font-medium">{b.name}</span>
                          <span className="text-muted-foreground text-[10px]">{ROLE_RU[b.role] || b.role}</span>
                        </button>
                      ))}
                    <button
                      onClick={e => { e.stopPropagation(); handleAssignBroker(null); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground hover:bg-red-50 hover:text-red-600 border-t border-border/40 transition"
                    >
                      <Icon name="UserX" size={11} /> Снять агента
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
