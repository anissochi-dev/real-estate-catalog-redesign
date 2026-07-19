import Icon from '@/components/ui/icon';
import { MarketStats } from './types';
import { TrendView, SupplyView, CompareView, HeatmapView, IndexView, ViewModeSwitcher } from './MarketViews';
import { ViewMode } from './useMarketData';

interface Props {
  data: MarketStats | null;
  loading: boolean;
  refreshing: boolean;
  viewMode: ViewMode;
  filterDeal: 'sale' | 'rent';
  filterDistrict: string;
  selectedCats: string[];
  trendData: Record<string, string | number>[];
  supplyData: Record<string, string | number>[];
  compareData: Record<string, string | number>[];
  heatmapData: {
    cats: string[];
    districts: string[];
    matrix: Record<string, Record<string, number | null>>;
  };
  heatIndexData: { category: string; change_pct: number; current: number; prev: number; analogs: number }[];
  onSwitchView: (v: ViewMode) => void;
  onToggleCat: (cat: string) => void;
  onCollectData: () => void;
}

export default function MarketCharts({
  data,
  loading,
  refreshing,
  viewMode,
  filterDeal,
  filterDistrict,
  selectedCats,
  trendData,
  supplyData,
  compareData,
  heatmapData,
  heatIndexData,
  onSwitchView,
  onToggleCat,
  onCollectData,
}: Props) {
  // Нет данных
  if (!loading && data?.snapshots.length === 0 && !refreshing) {
    return (
      <div className="bg-white rounded-2xl border border-border p-10 text-center">
        <Icon name="BarChart2" size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
        <p className="text-muted-foreground text-sm mb-3">Данных пока нет. Запустите сбор рыночных цен.</p>
        <button
          onClick={onCollectData}
          disabled={refreshing}
          className="bg-brand-blue text-white px-4 py-2 rounded-xl text-sm font-semibold"
        >
          Собрать данные
        </button>
      </div>
    );
  }

  if (!data || (data.snapshots.length === 0 && data.latest.length === 0)) return null;

  return (
    <>
      {/* Переключатель режима */}
      <ViewModeSwitcher viewMode={viewMode} onSwitch={onSwitchView} />

      {viewMode === 'trend' && (
        <TrendView
          trendData={trendData}
          selectedCats={selectedCats}
          onToggleCat={onToggleCat}
        />
      )}

      {viewMode === 'supply' && (
        <SupplyView
          supplyData={supplyData}
          selectedCats={selectedCats}
          onToggleCat={onToggleCat}
        />
      )}

      {viewMode === 'compare' && (
        <CompareView
          compareData={compareData}
          selectedCats={selectedCats}
          onToggleCat={onToggleCat}
        />
      )}

      {viewMode === 'heatmap' && (
        <HeatmapView heatmapData={heatmapData} />
      )}

      {viewMode === 'index' && (
        <IndexView
          heatIndexData={heatIndexData}
          data={data}
          filterDeal={filterDeal}
          filterDistrict={filterDistrict}
        />
      )}
    </>
  );
}