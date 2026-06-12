import MarketHeader from './price-market/MarketHeader';
import RefreshProgress from './price-market/RefreshProgress';
import ImportBlock from './price-market/ImportBlock';
import MarketCharts from './price-market/MarketCharts';
import { useMarketData } from './price-market/useMarketData';

export default function PriceMarketTab() {
  const {
    data,
    loading,
    viewMode,
    filterDeal,
    filterDistrict,
    filterDays,
    selectedCats,
    refreshState,
    assigningDistricts,
    assignProgress,
    aggregating,
    trendData,
    compareData,
    heatmapData,
    heatIndexData,
    dynamicDistricts,
    setViewMode,
    setFilterDeal,
    setFilterDistrict,
    setFilterDays,
    toggleCat,
    runBatchChain,
    runAutoAssign,
    runAggregate,
  } = useMarketData();

  return (
    <div className="space-y-4">
      {/* Заголовок + статус расписания + фильтры */}
      <MarketHeader
        data={data}
        loading={loading}
        refreshing={refreshState.running}
        assigningDistricts={assigningDistricts}
        assignProgress={assignProgress}
        aggregating={aggregating}
        filterDeal={filterDeal}
        filterDistrict={filterDistrict}
        filterDays={filterDays}
        dynamicDistricts={dynamicDistricts}
        onRefresh={() => runBatchChain(true)}
        onAutoAssign={runAutoAssign}
        onAggregate={runAggregate}
        onDealChange={setFilterDeal}
        onDistrictChange={setFilterDistrict}
        onDaysChange={setFilterDays}
      />

      {/* Прогресс обновления */}
      {(refreshState.running || refreshState.finishedAt) && (
        <RefreshProgress
          state={refreshState}
          onStart={() => runBatchChain(true)}
        />
      )}

      {/* Импорт XLSX */}
      <ImportBlock />

      {/* Графики и пустое состояние */}
      <MarketCharts
        data={data}
        loading={loading}
        refreshing={refreshState.running}
        viewMode={viewMode}
        filterDeal={filterDeal}
        filterDistrict={filterDistrict}
        selectedCats={selectedCats}
        trendData={trendData}
        compareData={compareData}
        heatmapData={heatmapData}
        heatIndexData={heatIndexData}
        onSwitchView={setViewMode}
        onToggleCat={toggleCat}
        onCollectData={() => runBatchChain(true)}
      />
    </div>
  );
}