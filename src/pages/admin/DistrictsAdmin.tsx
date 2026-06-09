import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/contexts/AuthContext';
import { AddForm } from './districts/DistrictForms';
import DistrictsTable from './districts/DistrictsTable';
import DistrictHierarchy from './districts/DistrictHierarchy';
import AiPanel from './districts/AiPanel';
import { useDistrictsState } from './districts/useDistrictsState';
import { useGeoTools, GeoOkrugResultPanel, GeoFixResultPanel, OsmPanel } from './districts/GeoToolsPanel';

export default function DistrictsAdmin() {
  const { refreshToken } = useAuth();
  const s = useDistrictsState();
  const geo = useGeoTools();

  const [showHierarchy, setShowHierarchy] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  const closeAiPanel = () => setShowAiPanel(false);

  return (
    <div className="space-y-4">

      {/* Заголовок */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-700 text-xl flex items-center gap-2">
            <Icon name="MapPin" size={20} className="text-brand-blue" />
            Районы города
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Управление районами для фильтрации и группировки объектов</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button"
            onClick={() => { setShowHierarchy(v => !v); setShowAiPanel(false); s.setShowAddForm(false); }}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border transition font-semibold ${showHierarchy ? 'border-brand-blue bg-brand-blue text-white' : 'border-brand-blue/30 bg-brand-blue/5 text-brand-blue hover:bg-brand-blue/10'}`}>
            <Icon name="Network" size={14} />
            Округа
          </button>
          <button type="button" onClick={() => { setShowAiPanel(v => !v); s.setShowAddForm(false); s.setEditId(null); setShowHierarchy(false); }}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border transition ${showAiPanel ? 'border-violet-400 bg-violet-100 text-violet-800' : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'}`}>
            <Icon name="Wand2" size={14} />
            Добавить через ИИ
          </button>
          <div className="inline-flex items-center rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
            <button type="button" onClick={geo.handleGeoOkrugPreview} disabled={geo.geoOkrugLoading}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 text-orange-700 hover:bg-orange-100 transition disabled:opacity-50">
              <Icon name={geo.geoOkrugLoading ? 'Loader2' : 'Globe'} size={14} className={geo.geoOkrugLoading ? 'animate-spin' : ''} />
              {geo.geoOkrugLoading ? 'Запрашиваю...' : 'Округа по улицам'}
            </button>
            <div className="w-px h-5 bg-orange-200" />
            <select
              value={geo.geoOkrugBatch}
              onChange={e => geo.setGeoOkrugBatch(Number(e.target.value))}
              disabled={geo.geoOkrugLoading}
              className="text-sm px-2 py-2 bg-transparent text-orange-700 border-none outline-none cursor-pointer disabled:opacity-50"
            >
              {geo.GEO_OKRUG_BATCHES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button type="button" onClick={geo.handleGeoFixPreview} disabled={geo.geoFixLoading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50">
            <Icon name={geo.geoFixLoading ? 'Loader2' : 'MapPinCheck'} size={14} className={geo.geoFixLoading ? 'animate-spin' : ''} />
            Исправить районы объектов
          </button>
          <button type="button"
            onClick={geo.handleOsmToggle}
            disabled={geo.osmLoading || geo.osmRunAll}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border transition disabled:opacity-50 ${geo.osmOpen ? 'border-sky-400 bg-sky-100 text-sky-800' : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'}`}>
            <Icon name={geo.osmLoading ? 'Loader2' : 'Map'} size={14} className={geo.osmLoading ? 'animate-spin' : ''} />
            {geo.osmLoading ? 'Загружаю улицы...' : geo.osmMeta ? `Улицы из OSM (${Math.max(0, geo.osmMeta.missing_count - geo.osmAddedTotal)} ост.)` : 'Улицы из OSM'}
          </button>
          <button type="button" onClick={s.load} disabled={s.loading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition disabled:opacity-50">
            <Icon name={s.loading ? 'Loader2' : 'RefreshCw'} size={14} className={s.loading ? 'animate-spin' : ''} />
            Обновить
          </button>
          {!s.showAddForm && !showAiPanel && (
            <button type="button" onClick={() => { s.setShowAddForm(true); s.setEditId(null); }}
              className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
              <Icon name="Plus" size={14} />
              Добавить район
            </button>
          )}
        </div>
      </div>

      {s.error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <Icon name="AlertCircle" size={16} /> {s.error}
        </div>
      )}

      {showHierarchy && (
        <DistrictHierarchy
          districts={s.districts}
          token={refreshToken()}
          onSaved={s.load}
        />
      )}

      {geo.geoOkrugResult && (
        <GeoOkrugResultPanel
          result={geo.geoOkrugResult}
          applying={geo.geoOkrugApplying}
          onClose={geo.onGeoOkrugClose}
          onApply={geo.handleGeoOkrugApply}
        />
      )}

      {geo.geoFixResult && (
        <GeoFixResultPanel
          result={geo.geoFixResult}
          applying={geo.geoFixApplying}
          onClose={geo.onGeoFixClose}
          onApply={geo.handleGeoFixApply}
        />
      )}

      {geo.osmOpen && (
        <OsmPanel
          osmError={geo.osmError}
          osmMeta={geo.osmMeta}
          osmCurrentBatch={geo.osmCurrentBatch}
          osmQueue={geo.osmQueue}
          osmAdding={geo.osmAdding}
          osmRunAll={geo.osmRunAll}
          osmLoading={geo.osmLoading}
          osmAddedTotal={geo.osmAddedTotal}
          osmSkippedTotal={geo.osmSkippedTotal}
          osmProgress={geo.osmProgress}
          stopRef={geo.stopRef}
          onLoadForce={() => geo.handleOsmLoad(true)}
          onAddBatch={geo.handleOsmAddBatch}
          onRunAll={geo.handleOsmRunAll}
          onStop={() => { geo.stopRef.current = true; }}
          onClose={geo.onOsmClose}
        />
      )}

      {showAiPanel && (
        <AiPanel
          onImported={s.load}
          onClose={closeAiPanel}
        />
      )}

      {s.showAddForm && (
        <AddForm onSave={s.handleAdd} onCancel={() => s.setShowAddForm(false)} saving={s.addSaving} />
      )}

      <DistrictsTable
        districts={s.districts} loading={s.loading} error={s.error}
        editId={s.editId} editSaving={s.editSaving} deletingId={s.deletingId} togglingId={s.togglingId}
        onEdit={id => { s.setEditId(id); s.setShowAddForm(false); setShowAiPanel(false); }}
        onEditSave={s.handleEdit} onEditCancel={() => s.setEditId(null)}
        onToggleActive={s.handleToggleActive} onDelete={s.handleDelete}
      />
    </div>
  );
}