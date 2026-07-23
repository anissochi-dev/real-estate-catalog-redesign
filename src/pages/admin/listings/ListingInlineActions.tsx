import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

interface Broker { id: number; name: string; role: string }

interface Props {
  listingId: number;
  onBulk: (op: string, value?: unknown) => void;
  onBulkDelete: () => void;
  bulkLoading: boolean;
  isAdmin: boolean;
}

const ROLE_RU: Record<string, string> = {
  admin: 'Админ', editor: 'Редактор', manager: 'Менеджер',
  director: 'Директор', broker: 'Брокер', office_manager: 'Офис',
};

export default function ListingInlineActions({ listingId: _listingId, onBulk, onBulkDelete, bulkLoading, isAdmin }: Props) {
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

  const Menu = ({ children }: { children: React.ReactNode }) => (
    <div
      className="absolute bottom-full mb-1.5 left-0 z-50 min-w-[160px] bg-white border border-border rounded-xl shadow-2xl overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>
  );

  const MenuItem = ({ icon, label, cls, onClick }: {
    icon: string; label: string; cls: string; onClick: () => void;
  }) => (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`w-full text-left flex items-center gap-2 px-3 py-2 text-[11px] font-medium hover:bg-muted/60 border-b border-border/30 last:border-0 transition ${cls}`}
    >
      <Icon name={icon} size={12} />
      {label}
    </button>
  );

  // Универсальная кнопка на тёмном фоне
  const Btn = ({ icon, label, cls, onClick: handleClick, disabled, chevron, open }: {
    icon: string; label: string; cls: string; onClick: () => void;
    disabled?: boolean; chevron?: boolean; open?: boolean;
  }) => (
    <button
      onClick={e => { e.stopPropagation(); handleClick(); }}
      disabled={disabled || bulkLoading}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition disabled:opacity-40 whitespace-nowrap ${cls}`}
    >
      <Icon name={icon} size={11} />
      {label}
      {chevron && <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={10} className="ml-0.5 opacity-70" />}
    </button>
  );

  return (
    <div
      className="bg-brand-blue rounded-t-2xl px-3 pt-2 pb-2 space-y-1.5"
      onClick={e => e.stopPropagation()}
    >
      {bulkLoading && (
        <div className="flex items-center gap-1.5 text-[11px] text-white/70 pb-1">
          <Icon name="Loader2" size={12} className="animate-spin" />
          Применяю...
        </div>
      )}

      {/* ── Строка 1: Действия ── */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest w-14 shrink-0">Действия</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Btn icon="CheckCircle" label="Активный" cls="bg-emerald-500 text-white hover:bg-emerald-400"
            onClick={() => { if (confirm('Сделать активным?')) onBulk('activate'); }} />
          <Btn icon="Archive" label="В архив" cls="bg-amber-500 text-white hover:bg-amber-400"
            onClick={() => { if (confirm('В архив?')) onBulk('archive'); }} />
          {isAdmin && (
            <Btn icon="Trash2" label="Удалить" cls="bg-red-500 text-white hover:bg-red-400"
              onClick={onBulkDelete} />
          )}
        </div>
      </div>

      {/* ── Строка 2: Статусы ── */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest w-14 shrink-0">Статус</span>
        <div className="flex items-center gap-1.5 flex-wrap">

          {/* Горячее */}
          <div className="relative" ref={hotRef}>
            <Btn icon="Flame" label="Горячее" cls="bg-white/15 text-white hover:bg-white/25"
              chevron open={showHot} onClick={() => setShowHot(s => !s)} />
            {showHot && (
              <Menu>
                <MenuItem icon="Flame" label="Горячее" cls="text-orange-700"
                  onClick={() => { onBulk('set_hot', true); setShowHot(false); }} />
                <MenuItem icon="FlameKindling" label="Не горячее" cls="text-muted-foreground"
                  onClick={() => { onBulk('set_hot', false); setShowHot(false); }} />
              </Menu>
            )}
          </div>

          {/* Новинка */}
          <div className="relative" ref={newRef}>
            <Btn icon="Sparkles" label="Новинка" cls="bg-white/15 text-white hover:bg-white/25"
              chevron open={showNew} onClick={() => setShowNew(s => !s)} />
            {showNew && (
              <Menu>
                <MenuItem icon="Sparkles" label="Новинка" cls="text-sky-700"
                  onClick={() => { onBulk('set_new', true); setShowNew(false); }} />
                <MenuItem icon="X" label="Не новинка" cls="text-muted-foreground"
                  onClick={() => { onBulk('set_new', false); setShowNew(false); }} />
              </Menu>
            )}
          </div>

          {/* Видимость */}
          <div className="relative" ref={visibleRef}>
            <Btn icon="Eye" label="Видимость" cls="bg-white/15 text-white hover:bg-white/25"
              chevron open={showVisible} onClick={() => setShowVisible(s => !s)} />
            {showVisible && (
              <Menu>
                <MenuItem icon="Eye" label="Виден на сайте" cls="text-teal-700"
                  onClick={() => { onBulk('set_visible', true); setShowVisible(false); }} />
                <MenuItem icon="EyeOff" label="Скрыт" cls="text-rose-600"
                  onClick={() => { onBulk('set_visible', false); setShowVisible(false); }} />
              </Menu>
            )}
          </div>
        </div>
      </div>

      {/* ── Строка 3: Экспорт + Агент ── */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest w-14 shrink-0">Экспорт</span>
        <div className="flex items-center gap-1.5 flex-wrap">

          {/* XML */}
          <div className="relative" ref={xmlRef}>
            <Btn icon="FileCode2" label="XML" cls="bg-white/15 text-white hover:bg-white/25"
              chevron open={showXml} onClick={() => setShowXml(s => !s)} />
            {showXml && (
              <div
                className="absolute bottom-full mb-1.5 left-0 z-50 w-64 bg-white border border-border rounded-xl shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="px-3 py-2 border-b border-border bg-muted/30 text-[11px] font-semibold">Площадка XML-выгрузки</div>
                {[
                  { platform: 'yandex', label: 'Яндекс.Недвижимость', icon: 'Building2' },
                  { platform: 'avito',  label: 'Авито',               icon: 'ShoppingBag' },
                  { platform: 'cian',   label: 'ЦИАН',                icon: 'MapPin' },
                  { platform: 'other',  label: 'Разное',              icon: 'LayoutGrid' },
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

          {/* Агент */}
          {canAssignBroker && (
            <div className="relative" ref={brokerRef}>
              <Btn icon="UserCheck" label="Агент" cls="bg-white/15 text-white hover:bg-white/25"
                chevron open={showBrokers} onClick={() => setShowBrokers(s => !s)} />
              {showBrokers && (
                <div
                  className="absolute bottom-full mb-1.5 left-0 z-50 w-64 bg-white border border-border rounded-xl shadow-2xl overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
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
                          onClick={e => { e.stopPropagation(); if (confirm(`Передать объект агенту ${b.name}?`)) { onBulk('set_broker', b.id); setShowBrokers(false); setBrokerQuery(''); } }}
                          className="w-full text-left flex items-center justify-between px-3 py-2 text-[11px] hover:bg-muted/60 border-b border-border/30 last:border-0 transition"
                        >
                          <span className="font-medium">{b.name}</span>
                          <span className="text-muted-foreground text-[10px]">{ROLE_RU[b.role] || b.role}</span>
                        </button>
                      ))}
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm('Снять агента?')) { onBulk('set_broker', null); setShowBrokers(false); } }}
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