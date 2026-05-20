import { useEffect, useState } from 'react';
import { adminApi, getToken } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

const STATS_URL = 'https://functions.poehali.dev/1d84bd40-ef8c-4bd3-82c3-af294b1ec0b1';

interface HistoryItem {
  id: number;
  listing_id: number;
  user_name: string;
  action: string;
  changes: Record<string, [unknown, unknown]> | null;
  created_at: string;
}

interface OldStats {
  total_views: number;
  views_30d: number;
  views_7d: number;
  leads_total: number;
  leads_30d: number;
  daily: { stat_date: string; views_count: number; leads_count: number }[];
}

interface AggRow { event_type: string; source: string; total: number; last_at: string }
interface HistoryRow { id: number; event_type: string; source: string; count: number; note: string | null; recorded_at: string; user_name: string | null }

interface MultiStats {
  listing_id: number;
  views_site: number;
  aggregated: AggRow[];
  source_totals: Record<string, number>;
  event_totals: Record<string, number>;
  source_labels: Record<string, string>;
  event_labels: Record<string, string>;
  history: HistoryRow[];
}

const ACTION_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  created: { label: 'Создан', icon: 'Plus', color: 'text-emerald-600 bg-emerald-50' },
  updated: { label: 'Изменён', icon: 'Pencil', color: 'text-blue-600 bg-blue-50' },
  archived: { label: 'Архивирован', icon: 'Archive', color: 'text-orange-600 bg-orange-50' },
  restored: { label: 'Восстановлен', icon: 'RotateCcw', color: 'text-violet-600 bg-violet-50' },
  photo_added: { label: 'Фото добавлено', icon: 'Image', color: 'text-sky-600 bg-sky-50' },
  photo_removed: { label: 'Фото удалено', icon: 'ImageOff', color: 'text-red-600 bg-red-50' },
  price_changed: { label: 'Цена изменена', icon: 'TrendingDown', color: 'text-amber-600 bg-amber-50' },
  status_changed: { label: 'Статус изменён', icon: 'RefreshCw', color: 'text-violet-600 bg-violet-50' },
  broker_changed: { label: 'Брокер изменён', icon: 'UserCheck', color: 'text-indigo-600 bg-indigo-50' },
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Название', description: 'Описание', category: 'Категория', deal: 'Тип сделки',
  price: 'Цена', area: 'Площадь', address: 'Адрес', district: 'Район', city: 'Город',
  status: 'Статус', owner_name: 'Имя собственника', owner_phone: 'Телефон собственника',
  owner_phone2: 'Доп. телефон', purpose: 'Назначение', condition: 'Состояние',
  floor: 'Этаж', total_floors: 'Этажей всего', parking: 'Парковка', entrance: 'Вход',
  video_url: 'Видео', is_hot: 'Горячее', is_new: 'Новинка', is_exclusive: 'Эксклюзив',
  is_urgent: 'Срочно', use_watermark: 'Водяной знак', export_yandex: 'Яндекс',
  export_avito: 'Авито', export_cian: 'ЦИАН', tenant_name: 'Арендатор',
  monthly_rent: 'Аренда в мес.', yearly_rent: 'Аренда в год', finishing: 'Отделка',
  ceiling_height: 'Высота потолков', electricity_kw: 'Электричество',
  utilities: 'Коммунальные', road_line: 'Линия', payback: 'Окупаемость', profit: 'Прибыль',
  price_per_m2: 'Цена за м²', slug: 'Слаг', seo_title: 'SEO заголовок',
  seo_description: 'SEO описание', image: 'Фото', images: 'Фотографии', tags: 'Теги',
  lat: 'Широта', lng: 'Долгота', broker_id: 'Брокер',
};

const SOURCES = [
  { value: 'avito', label: 'Авито', icon: 'ShoppingBag', color: 'text-green-600' },
  { value: 'cian', label: 'ЦИАН', icon: 'Building2', color: 'text-blue-600' },
  { value: 'yandex', label: 'Яндекс Недвижимость', icon: 'Home', color: 'text-red-500' },
  { value: 'domclick', label: 'Домклик', icon: 'MousePointer', color: 'text-emerald-600' },
  { value: 'xml', label: 'XML-выгрузка', icon: 'FileCode', color: 'text-slate-500' },
  { value: 'other', label: 'Другое', icon: 'Globe', color: 'text-muted-foreground' },
];

const EVENT_TYPES = [
  { value: 'view_avito', label: 'Просмотры' },
  { value: 'call', label: 'Звонки' },
  { value: 'lead', label: 'Заявки' },
  { value: 'favorite', label: 'В избранном' },
  { value: 'manual', label: 'Прочее' },
];

const EVENT_LABELS_FALLBACK: Record<string, string> = {
  view_avito: 'Просмотры', view_cian: 'Просмотры', view_yandex: 'Просмотры',
  view_domclick: 'Просмотры', view_xml: 'Просмотры', view_site: 'Просмотры сайта',
  view_other: 'Просмотры', call: 'Звонки', lead: 'Заявки',
  favorite: 'В избранном', manual: 'Прочее',
};

function fmtDt(s: string) {
  return new Date(s).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  listingId: number;
  listingTitle: string;
  onClose: () => void;
}

export default function ListingHistory({ listingId, listingTitle, onClose }: Props) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [oldStats, setOldStats] = useState<OldStats | null>(null);
  const [multiStats, setMultiStats] = useState<MultiStats | null>(null);
  const [tab, setTab] = useState<'stats' | 'platforms' | 'add' | 'history'>('stats');
  const [loading, setLoading] = useState(true);

  // Форма ручного ввода
  const [addSource, setAddSource] = useState('avito');
  const [addEvent, setAddEvent] = useState('view_avito');
  const [addCount, setAddCount] = useState('1');
  const [addNote, setAddNote] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addOk, setAddOk] = useState(false);

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      adminApi.getListingHistory(listingId),
      adminApi.getListingStats(listingId),
      fetch(`${STATS_URL}?listing_id=${listingId}&history=1`, {
        headers: { 'X-Auth-Token': getToken() },
      }).then(r => r.json()).catch(() => null),
    ]).then(([h, s, ms]) => {
      setHistory(h.history || []);
      setOldStats(s);
      if (ms && !ms.error) setMultiStats(ms);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, [listingId]);

  const handleAddStat = async () => {
    setAddLoading(true);
    setAddOk(false);
    try {
      const res = await fetch(STATS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
        body: JSON.stringify({
          listing_id: listingId,
          event_type: addEvent,
          source: addSource,
          count: parseInt(addCount) || 1,
          note: addNote || undefined,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setAddOk(true);
        setAddNote('');
        loadAll();
      }
    } finally {
      setAddLoading(false);
    }
  };

  // Агрегация по источникам для вкладки «Площадки»
  const bySource: Record<string, Record<string, number>> = {};
  if (multiStats?.aggregated) {
    for (const row of multiStats.aggregated) {
      if (!bySource[row.source]) bySource[row.source] = {};
      bySource[row.source][row.event_type] = (bySource[row.source][row.event_type] || 0) + row.total;
    }
  }

  const totalViews = (multiStats?.views_site || 0) + (multiStats?.event_totals?.['view_avito'] || 0)
    + (multiStats?.event_totals?.['view_cian'] || 0) + (multiStats?.event_totals?.['view_yandex'] || 0)
    + (multiStats?.event_totals?.['view_domclick'] || 0) + (multiStats?.event_totals?.['view_xml'] || 0)
    + (multiStats?.event_totals?.['view_other'] || 0);
  const totalCalls = multiStats?.event_totals?.['call'] || 0;
  const totalLeads = (multiStats?.event_totals?.['lead'] || 0) + (oldStats?.leads_total || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <div className="font-display font-700 text-base truncate max-w-xs">{listingTitle}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Статистика и история</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted shrink-0">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0 overflow-x-auto">
          {([
            ['stats', 'Сводка', 'BarChart2'],
            ['platforms', 'По площадкам', 'Globe'],
            ['add', 'Добавить данные', 'Plus'],
            ['history', 'История изменений', 'Clock'],
          ] as const).map(([t, l, ic]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${tab === t ? 'text-brand-blue border-b-2 border-brand-blue' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon name={ic} size={13} />
              {l}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Загрузка...</div>
          ) : tab === 'stats' ? (
            <div className="space-y-4">
              {/* Сводные карточки */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Просмотров всего" value={totalViews} icon="Eye" color="from-brand-blue to-indigo-600" />
                <StatCard label="Наш сайт" value={multiStats?.views_site || oldStats?.total_views || 0} icon="Monitor" color="from-sky-500 to-sky-700" />
                <StatCard label="Звонков" value={totalCalls} icon="Phone" color="from-emerald-500 to-emerald-700" />
                <StatCard label="Заявок" value={totalLeads} icon="Inbox" color="from-brand-orange to-orange-600" />
              </div>

              {/* Просмотры по дням (старая статистика сайта) */}
              {oldStats?.daily && oldStats.daily.length > 0 && (
                <div className="bg-muted/30 rounded-xl p-3">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">Просмотры на сайте по дням</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {[...oldStats.daily].reverse().map(d => (
                      <div key={d.stat_date} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                        <span className="text-muted-foreground">{d.stat_date}</span>
                        <div className="flex gap-3">
                          <span><Icon name="Eye" size={11} className="inline mr-0.5" />{d.views_count}</span>
                          <span><Icon name="Inbox" size={11} className="inline mr-0.5" />{d.leads_count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {totalViews === 0 && totalLeads === 0 && (
                <div className="text-center text-muted-foreground text-sm py-6">
                  Пока нет данных.<br />
                  <span className="text-xs">Просмотры на сайте накапливаются автоматически. Данные с площадок вводите вручную.</span>
                </div>
              )}
            </div>

          ) : tab === 'platforms' ? (
            <div className="space-y-3">
              {/* Наш сайт */}
              <div className="border border-brand-blue/20 rounded-xl p-4 bg-brand-blue/[0.03]">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="Monitor" size={16} className="text-brand-blue" />
                  <span className="font-semibold text-sm">Наш сайт</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="Просмотры" value={multiStats?.views_site || oldStats?.total_views || 0} />
                  <MiniStat label="Заявки" value={oldStats?.leads_total || 0} />
                </div>
              </div>

              {/* Внешние площадки */}
              {SOURCES.map(src => {
                const data = bySource[src.value] || {};
                const hasData = Object.values(data).some(v => v > 0);
                return (
                  <div key={src.value} className={`border rounded-xl p-4 ${hasData ? 'border-border' : 'border-dashed border-border opacity-60'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon name={src.icon} size={15} className={src.color} />
                        <span className="font-semibold text-sm">{src.label}</span>
                      </div>
                      {!hasData && <span className="text-[11px] text-muted-foreground">нет данных</span>}
                    </div>
                    {hasData && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Object.entries(data).map(([ev, val]) => (
                          <MiniStat key={ev} label={multiStats?.event_labels?.[ev] || EVENT_LABELS_FALLBACK[ev] || ev} value={val} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {Object.keys(bySource).length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-6">
                  Данных с площадок нет.<br />
                  <span className="text-xs">Добавьте их вручную на вкладке «Добавить данные»</span>
                </div>
              )}
            </div>

          ) : tab === 'add' ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Вручную вносите показатели с Авито, ЦИАН, Яндекс Недвижимости и других площадок.
                Эти данные отобразятся в сводке и по площадкам.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Площадка</label>
                  <select className="w-full px-3 py-2 border rounded-lg text-sm"
                    value={addSource} onChange={e => setAddSource(e.target.value)}>
                    {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Тип события</label>
                  <select className="w-full px-3 py-2 border rounded-lg text-sm"
                    value={addEvent} onChange={e => setAddEvent(e.target.value)}>
                    {EVENT_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Количество</label>
                <input type="number" min="1" className="w-full px-3 py-2 border rounded-lg text-sm"
                  value={addCount} onChange={e => setAddCount(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Комментарий (необязательно)</label>
                <input className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Например: данные за май 2026"
                  value={addNote} onChange={e => setAddNote(e.target.value)} />
              </div>
              <button onClick={handleAddStat} disabled={addLoading}
                className="w-full btn-blue text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {addLoading ? <><Icon name="Loader2" size={15} className="animate-spin" /> Сохранение...</> : <><Icon name="Plus" size={15} /> Добавить запись</>}
              </button>
              {addOk && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                  <Icon name="CheckCircle2" size={15} />
                  Данные сохранены
                </div>
              )}

              {/* История ручных записей */}
              {multiStats?.history && multiStats.history.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Последние записи</div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {multiStats.history.filter(h => h.event_type !== 'view_site').slice(0, 20).map(h => (
                      <div key={h.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-muted/40">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold">{multiStats.source_labels?.[h.source] || SOURCES.find(s => s.value === h.source)?.label || h.source}</span>
                          <span className="text-muted-foreground">{multiStats.event_labels?.[h.event_type] || EVENT_LABELS_FALLBACK[h.event_type] || h.event_type}</span>
                          {h.note && <span className="text-muted-foreground truncate">— {h.note}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="font-700 text-brand-blue">+{h.count}</span>
                          <span className="text-muted-foreground">{fmtDt(h.recorded_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          ) : (
            // История изменений
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">История пуста</div>
              ) : (
                history.map(h => {
                  const meta = ACTION_LABELS[h.action] || { label: h.action, icon: 'Activity', color: 'text-slate-600 bg-slate-50' };
                  return (
                    <div key={h.id} className="flex gap-3 p-3 rounded-xl hover:bg-muted/30">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.color}`}>
                        <Icon name={meta.icon} size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{meta.label}</span>
                          <span className="text-xs text-muted-foreground">{h.user_name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{fmtDt(h.created_at)}</span>
                        </div>
                        {h.changes && Object.keys(h.changes).length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                            {Object.entries(h.changes).slice(0, 5).map(([field, [oldV, newV]]) => (
                              <div key={field}>
                                <span className="font-medium">{FIELD_LABELS[field] || field}:</span>{' '}
                                <span className="line-through opacity-60">{String(oldV)}</span>
                                {' → '}
                                <span>{String(newV)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className={`rounded-xl p-3 bg-gradient-to-br ${color} text-white`}>
      <Icon name={icon} size={16} className="mb-1.5 opacity-80" />
      <div className="text-2xl font-display font-700">{value}</div>
      <div className="text-[11px] opacity-90 mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2">
      <div className="text-[10px] text-muted-foreground leading-none">{label}</div>
      <div className="font-display font-700 text-base mt-0.5">{value}</div>
    </div>
  );
}