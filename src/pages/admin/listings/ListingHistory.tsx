import { useEffect, useState } from 'react';
import { adminApi, getToken } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { STATS_URL, HistoryItem, OldStats, MultiStats } from './listingHistoryUtils';
import { ListingHistorySummaryTab, ListingHistoryPlatformsTab } from './ListingHistoryStatsTabs';
import ListingHistoryAddTab from './ListingHistoryAddTab';
import ListingHistoryChangesTab from './ListingHistoryChangesTab';

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="flex border-b border-border shrink-0 overflow-x-auto scrollbar-hide">
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
            <ListingHistorySummaryTab
              oldStats={oldStats}
              multiStats={multiStats}
              totalViews={totalViews}
              totalCalls={totalCalls}
              totalLeads={totalLeads}
            />
          ) : tab === 'platforms' ? (
            <ListingHistoryPlatformsTab oldStats={oldStats} multiStats={multiStats} bySource={bySource} />
          ) : tab === 'add' ? (
            <ListingHistoryAddTab
              multiStats={multiStats}
              addSource={addSource}
              setAddSource={setAddSource}
              addEvent={addEvent}
              setAddEvent={setAddEvent}
              addCount={addCount}
              setAddCount={setAddCount}
              addNote={addNote}
              setAddNote={setAddNote}
              addLoading={addLoading}
              addOk={addOk}
              handleAddStat={handleAddStat}
            />
          ) : (
            <ListingHistoryChangesTab history={history} />
          )}
        </div>
      </div>
    </div>
  );
}
