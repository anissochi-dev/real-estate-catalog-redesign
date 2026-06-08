import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { District, FormState, buildHeaders, buildUrl } from './districts/DistrictsTypes';
import { AddForm } from './districts/DistrictForms';
import DistrictsTable from './districts/DistrictsTable';
import AiResultGrid, { AiDistrict } from './districts/AiResultGrid';
import DistrictHierarchy from './districts/DistrictHierarchy';

const DISTRICT_AI_URL = 'https://functions.poehali.dev/eddffe59-b37d-425e-90a3-59d12d44623f';
const GEO_FIX_URL = 'https://functions.poehali.dev/9b2f9622-9d12-4809-a614-023af6958251';

type AiTab = 'auto' | 'text';

function useSelectable(items: AiDistrict[]) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setSelected(prev => { const s = new Set(prev); if (s.has(i)) { s.delete(i); } else { s.add(i); } return s; });
  const selectAll = () => setSelected(new Set(items.map((_, i) => i)));
  const deselectAll = () => setSelected(new Set());
  const reset = () => setSelected(new Set());
  return { selected, toggle, selectAll, deselectAll, reset };
}

export default function DistrictsAdmin() {
  const { refreshToken } = useAuth();

  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showHierarchy, setShowHierarchy] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Обновление округов улиц через geocode.maps.co
  const [geoOkrugLoading, setGeoOkrugLoading] = useState(false);
  type GeoOkrugResult = { total_streets: number; matched_count: number; not_found_count: number; results: { street: string; okrug: string | null; suburb: string; city_district: string }[] };
  const [geoOkrugResult, setGeoOkrugResult] = useState<GeoOkrugResult | null>(null);
  const [geoOkrugApplying, setGeoOkrugApplying] = useState(false);

  // Исправление районов
  const [geoFixLoading, setGeoFixLoading] = useState(false);
  const [geoFixResult, setGeoFixResult] = useState<{ changed_count: number; unchanged_count: number; not_found_count: number; changed: { id: number; address: string; district_old: string; district_new: string }[] } | null>(null);
  const [geoFixApplying, setGeoFixApplying] = useState(false);

  // Заполнение улиц через Overpass + ИИ
  type StreetItem = { street: string; base: string };
  type OsmMeta = { osm_total: number; in_map: number; missing_count: number };

  const [osmLoading, setOsmLoading] = useState(false);
  const [osmError, setOsmError] = useState<string | null>(null);
  const [osmOpen, setOsmOpen] = useState(false);                        // панель открыта/закрыта
  const [osmMeta, setOsmMeta] = useState<OsmMeta | null>(null);        // статистика из первого запроса
  const [osmQueue, setOsmQueue] = useState<StreetItem[]>([]);           // ВСЕ недостающие улицы
  const [osmCurrentBatch, setOsmCurrentBatch] = useState<StreetItem[]>([]); // текущий батч на экране
  const [osmAdding, setOsmAdding] = useState(false);
  const [osmRunAll, setOsmRunAll] = useState(false);
  const [osmAddedTotal, setOsmAddedTotal] = useState(0);
  const [osmSkippedTotal, setOsmSkippedTotal] = useState(0);
  const [osmProgress, setOsmProgress] = useState({ done: 0, total: 0 });
  const stopRef = useRef(false);
  const OSM_BATCH = 20;

  // Загружаем ВСЕ недостающие улицы за один Overpass-запрос (лимит 2500)
  // force=true — принудительно перезагружает список (сбрасывает прогресс)
  const handleOsmLoad = async (force = false) => {
    // Если панель уже открыта и данные есть — просто показываем (не перезагружаем)
    if (!force && osmMeta) {
      setOsmOpen(true);
      return;
    }
    setOsmLoading(true);
    setOsmError(null);
    try {
      const res = await fetch(GEO_FIX_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'overpass_streets', offset: 0, limit: 2500 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOsmMeta({ osm_total: data.osm_total, in_map: data.in_map, missing_count: data.missing_count });
      setOsmQueue(data.missing || []);
      setOsmCurrentBatch((data.missing || []).slice(0, OSM_BATCH));
      setOsmAddedTotal(0);
      setOsmSkippedTotal(0);
      setOsmProgress({ done: 0, total: data.missing_count });
      setOsmOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка загрузки OSM';
      setOsmError(msg);
      setOsmOpen(true); // открываем панель чтобы показать ошибку с кнопкой retry
    }
    finally { setOsmLoading(false); }
  };

  // Добавить один батч вручную
  const handleOsmAddBatch = async () => {
    if (!osmCurrentBatch.length) return;
    setOsmAdding(true);
    try {
      const res = await fetch(GEO_FIX_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_map_streets', streets: osmCurrentBatch }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const added = data.added_count || 0;
      const skipped = data.skipped_count || 0;
      const newTotal = osmAddedTotal + added;
      setOsmAddedTotal(newTotal);
      setOsmSkippedTotal(v => v + skipped);
      toast.success(`Добавлено ${added} улиц${skipped > 0 ? `, пропущено ${skipped}` : ''}`);
      // Сдвигаем очередь
      const remaining = osmQueue.slice(OSM_BATCH);
      setOsmQueue(remaining);
      setOsmCurrentBatch(remaining.slice(0, OSM_BATCH));
      setOsmProgress({ done: newTotal, total: osmMeta?.missing_count ?? 0 });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка ИИ'); }
    finally { setOsmAdding(false); }
  };

  // Запустить все батчи автоматически
  const handleOsmRunAll = async () => {
    if (!osmQueue.length) return;
    stopRef.current = false;
    setOsmRunAll(true);
    let queue = [...osmQueue];
    let totalAdded = osmAddedTotal;
    let totalSkipped = osmSkippedTotal;
    const grandTotal = osmMeta?.missing_count ?? queue.length;

    try {
      while (queue.length > 0) {
        if (stopRef.current) { toast('Остановлено'); break; }
        const batch = queue.slice(0, OSM_BATCH);
        const res = await fetch(GEO_FIX_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ai_map_streets', streets: batch }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        totalAdded += data.added_count || 0;
        totalSkipped += data.skipped_count || 0;
        queue = queue.slice(OSM_BATCH);
        setOsmQueue(queue);
        setOsmCurrentBatch(queue.slice(0, OSM_BATCH));
        setOsmAddedTotal(totalAdded);
        setOsmSkippedTotal(totalSkipped);
        setOsmProgress({ done: grandTotal - queue.length, total: grandTotal });
      }
      if (!stopRef.current) toast.success(`Готово! Добавлено: ${totalAdded}, не определён район: ${totalSkipped}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка в процессе'); }
    finally { setOsmRunAll(false); stopRef.current = false; }
  };

  const handleGeoOkrugPreview = async () => {
    setGeoOkrugLoading(true); setGeoOkrugResult(null);
    try {
      const res = await fetch(GEO_FIX_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'geo_okrug', mode: 'preview', limit: 30 }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      setGeoOkrugResult(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка проверки округов');
    } finally { setGeoOkrugLoading(false); }
  };

  const handleGeoOkrugApply = async () => {
    if (!window.confirm(`Применить округа для ${geoOkrugResult?.matched_count} улиц?`)) return;
    setGeoOkrugApplying(true);
    try {
      const res = await fetch(GEO_FIX_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'geo_okrug', mode: 'apply', limit: 30 }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      toast.success(`Округа присвоены для ${data.matched_count} улиц`);
      setGeoOkrugResult(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка применения');
    } finally { setGeoOkrugApplying(false); }
  };

  const handleGeoFixPreview = async () => {
    setGeoFixLoading(true); setGeoFixResult(null);
    try {
      const res = await fetch(GEO_FIX_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fix', mode: 'preview' }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      setGeoFixResult(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка проверки');
    } finally { setGeoFixLoading(false); }
  };

  const handleGeoFixApply = async () => {
    if (!window.confirm(`Применить исправления районов для ${geoFixResult?.changed_count} объектов?`)) return;
    setGeoFixApplying(true);
    try {
      const res = await fetch(GEO_FIX_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fix', mode: 'apply' }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      toast.success(`Исправлено районов: ${data.changed_count}`);
      setGeoFixResult(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка применения');
    } finally { setGeoFixApplying(false); }
  };

  // ИИ-панель
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiTab, setAiTab] = useState<AiTab>('auto');
  const [aiCity, setAiCity] = useState('');

  // Авто-режим
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiDistrict[]>([]);
  const [aiImporting, setAiImporting] = useState(false);
  const [aiError, setAiError] = useState('');
  const aiSel = useSelectable(aiResult);

  // Текстовый режим
  const [textInput, setTextInput] = useState('');
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichResult, setEnrichResult] = useState<AiDistrict[]>([]);
  const [enrichImporting, setEnrichImporting] = useState(false);
  const [enrichError, setEnrichError] = useState('');
  const enrichSel = useSelectable(enrichResult);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const tok = refreshToken();
      const res = await fetch(buildUrl(), { method: 'GET', headers: buildHeaders(tok) });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      const list: District[] = Array.isArray(data?.districts) ? data.districts : Array.isArray(data) ? data : [];
      setDistricts(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
      setError(msg); toast.error(msg);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (form: FormState) => {
    setAddSaving(true);
    try {
      const tok = refreshToken();
      const body: Record<string, unknown> = { name: form.name.trim(), city: form.city.trim(), sort_order: form.sort_order };
      if (form.description.trim()) body.description = form.description.trim();
      const res = await fetch(buildUrl(), { method: 'POST', headers: buildHeaders(tok), body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      toast.success(`Район «${form.name}» добавлен`);
      setShowAddForm(false); await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось добавить');
    } finally { setAddSaving(false); }
  };

  const handleEdit = async (district: District, form: FormState) => {
    setEditSaving(true);
    try {
      const tok = refreshToken();
      const body = { id: district.id, name: form.name.trim(), slug: form.slug.trim(), city: form.city.trim(), description: form.description.trim(), sort_order: form.sort_order };
      const res = await fetch(buildUrl(), { method: 'PUT', headers: buildHeaders(tok), body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      toast.success(`Район «${form.name}» обновлён`);
      setEditId(null); await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally { setEditSaving(false); }
  };

  const handleToggleActive = async (district: District) => {
    setTogglingId(district.id);
    try {
      const tok = refreshToken();
      const res = await fetch(buildUrl(), { method: 'PUT', headers: buildHeaders(tok), body: JSON.stringify({ id: district.id, is_active: !district.is_active }) });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      setDistricts(ds => ds.map(d => d.id === district.id ? { ...d, is_active: !d.is_active } : d));
      toast.success(!district.is_active ? `Район «${district.name}» активирован` : `Район «${district.name}» скрыт`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось изменить');
    } finally { setTogglingId(null); }
  };

  const handleDelete = async (district: District) => {
    const hasListings = (district.listings_count ?? 0) > 0;
    const confirmText = hasListings
      ? `Удалить район «${district.name}»?\n\nВНИМАНИЕ: у этого района ${district.listings_count} объект(ов). После удаления они останутся связаны с этим районом в базе данных.`
      : `Удалить район «${district.name}»? Это действие нельзя отменить.`;
    if (!window.confirm(confirmText)) return;
    setDeletingId(district.id);
    try {
      const tok = refreshToken();
      const res = await fetch(buildUrl({ id: String(district.id) }), { method: 'DELETE', headers: buildHeaders(tok) });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      setDistricts(ds => ds.filter(d => d.id !== district.id));
      toast.success(`Район «${district.name}» удалён`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось удалить');
    } finally { setDeletingId(null); }
  };

  // ── Авто-режим ────────────────────────────────────────────────────────────
  const handleAiSuggest = async () => {
    if (!aiCity.trim()) return;
    setAiLoading(true); setAiError(''); setAiResult([]); aiSel.reset();
    try {
      const tok = refreshToken();
      const res = await fetch(DISTRICT_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify({ action: 'suggest', city: aiCity.trim() }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      const list: AiDistrict[] = data.districts || [];
      setAiResult(list);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Ошибка');
    } finally { setAiLoading(false); }
  };

  // после загрузки результатов — выделяем все
  useEffect(() => { if (aiResult.length) aiSel.selectAll(); }, [aiResult]);
  useEffect(() => { if (enrichResult.length) enrichSel.selectAll(); }, [enrichResult]);

  const handleAiImport = async () => {
    const selected = aiResult.filter((_, i) => aiSel.selected.has(i));
    if (!selected.length) return;
    setAiImporting(true); setAiError('');
    try {
      const tok = refreshToken();
      const res = await fetch(DISTRICT_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify({ action: 'import', city: aiCity.trim(), districts: selected }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      toast.success(`Добавлено: ${data.imported}, пропущено (уже есть): ${data.skipped}`);
      setShowAiPanel(false); setAiResult([]); setAiCity(''); await load();
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally { setAiImporting(false); }
  };

  // ── Текстовый режим ───────────────────────────────────────────────────────
  const handleEnrich = async () => {
    if (!textInput.trim() || !aiCity.trim()) return;
    setEnrichLoading(true); setEnrichError(''); setEnrichResult([]); enrichSel.reset();
    try {
      const tok = refreshToken();
      const res = await fetch(DISTRICT_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify({ action: 'enrich', city: aiCity.trim(), text: textInput }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      setEnrichResult(data.districts || []);
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : 'Ошибка');
    } finally { setEnrichLoading(false); }
  };

  const handleEnrichImport = async () => {
    const selected = enrichResult.filter((_, i) => enrichSel.selected.has(i));
    if (!selected.length) return;
    setEnrichImporting(true); setEnrichError('');
    try {
      const tok = refreshToken();
      const res = await fetch(DISTRICT_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify({ action: 'import', city: aiCity.trim(), districts: selected }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      toast.success(`Добавлено: ${data.imported}, пропущено (уже есть): ${data.skipped}`);
      setShowAiPanel(false); setEnrichResult([]); setTextInput(''); setAiCity(''); await load();
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally { setEnrichImporting(false); }
  };

  const closeAiPanel = () => {
    setShowAiPanel(false);
    setAiResult([]); setAiError('');
    setEnrichResult([]); setEnrichError('');
  };

  const textLineCount = textInput.split('\n').filter(l => l.trim()).length;

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
            onClick={() => { setShowHierarchy(v => !v); setShowAiPanel(false); setShowAddForm(false); }}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border transition font-semibold ${showHierarchy ? 'border-brand-blue bg-brand-blue text-white' : 'border-brand-blue/30 bg-brand-blue/5 text-brand-blue hover:bg-brand-blue/10'}`}>
            <Icon name="Network" size={14} />
            Округа
          </button>
          <button type="button" onClick={() => { setShowAiPanel(v => !v); setShowAddForm(false); setEditId(null); setShowHierarchy(false); }}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border transition ${showAiPanel ? 'border-violet-400 bg-violet-100 text-violet-800' : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'}`}>
            <Icon name="Wand2" size={14} />
            Добавить через ИИ
          </button>
          <button type="button" onClick={handleGeoOkrugPreview} disabled={geoOkrugLoading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 transition disabled:opacity-50">
            <Icon name={geoOkrugLoading ? 'Loader2' : 'Globe'} size={14} className={geoOkrugLoading ? 'animate-spin' : ''} />
            {geoOkrugLoading ? 'Запрашиваю geocode...' : 'Округа по улицам'}
          </button>
          <button type="button" onClick={handleGeoFixPreview} disabled={geoFixLoading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50">
            <Icon name={geoFixLoading ? 'Loader2' : 'MapPinCheck'} size={14} className={geoFixLoading ? 'animate-spin' : ''} />
            Исправить районы объектов
          </button>
          <button type="button"
            onClick={() => osmOpen ? setOsmOpen(false) : handleOsmLoad()}
            disabled={osmLoading || osmRunAll}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border transition disabled:opacity-50 ${osmOpen ? 'border-sky-400 bg-sky-100 text-sky-800' : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'}`}>
            <Icon name={osmLoading ? 'Loader2' : 'Map'} size={14} className={osmLoading ? 'animate-spin' : ''} />
            {osmLoading ? 'Загружаю улицы...' : osmMeta ? `Улицы из OSM (${Math.max(0, osmMeta.missing_count - osmAddedTotal)} ост.)` : 'Улицы из OSM'}
          </button>
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition disabled:opacity-50">
            <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={14} className={loading ? 'animate-spin' : ''} />
            Обновить
          </button>
          {!showAddForm && !showAiPanel && (
            <button type="button" onClick={() => { setShowAddForm(true); setEditId(null); }}
              className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
              <Icon name="Plus" size={14} />
              Добавить район
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <Icon name="AlertCircle" size={16} /> {error}
        </div>
      )}

      {/* ── Иерархия округов ──────────────────────────────────────────────── */}
      {showHierarchy && (
        <DistrictHierarchy
          districts={districts}
          token={refreshToken()}
          onSaved={load}
        />
      )}

      {/* Панель результатов geo-okrug */}
      {geoOkrugResult && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-orange-800 flex items-center gap-2">
                <Icon name="Globe" size={16} /> Округа по улицам — geocode.maps.co
              </div>
              <div className="text-sm text-orange-700 mt-0.5">
                Улиц обработано: <b>{geoOkrugResult.total_streets}</b> &nbsp;·&nbsp;
                Округ определён: <b>{geoOkrugResult.matched_count}</b> &nbsp;·&nbsp;
                Не определено: <b>{geoOkrugResult.not_found_count}</b>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setGeoOkrugResult(null)}
                className="text-sm px-3 py-1.5 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-100 transition">
                Закрыть
              </button>
              {geoOkrugResult.matched_count > 0 && (
                <button onClick={handleGeoOkrugApply} disabled={geoOkrugApplying}
                  className="text-sm px-4 py-1.5 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 transition disabled:opacity-50 flex items-center gap-1.5">
                  <Icon name={geoOkrugApplying ? 'Loader2' : 'Check'} size={14} className={geoOkrugApplying ? 'animate-spin' : ''} />
                  Сохранить {geoOkrugResult.matched_count} округов
                </button>
              )}
            </div>
          </div>
          {geoOkrugResult.results.length > 0 && (
            <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-orange-50 text-orange-700 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Улица</th>
                    <th className="text-left px-3 py-2">Округ</th>
                    <th className="text-left px-3 py-2 hidden sm:table-cell">suburb / city_district</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-100">
                  {geoOkrugResult.results.map((r, i) => (
                    <tr key={i} className={r.okrug ? '' : 'opacity-50'}>
                      <td className="px-3 py-1.5 font-medium">{r.street}</td>
                      <td className="px-3 py-1.5">
                        {r.okrug
                          ? <span className="text-orange-700 font-semibold">{r.okrug}</span>
                          : <span className="text-muted-foreground italic">не определён</span>}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground hidden sm:table-cell text-xs">
                        {[r.suburb, r.city_district].filter(Boolean).join(' / ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Панель результатов geo-fix */}
      {geoFixResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-emerald-800 flex items-center gap-2">
                <Icon name="MapPinCheck" size={16} /> Результат проверки районов
              </div>
              <div className="text-sm text-emerald-700 mt-0.5">
                Найдено исправлений: <b>{geoFixResult.changed_count}</b> &nbsp;·&nbsp;
                Верных: <b>{geoFixResult.unchanged_count}</b> &nbsp;·&nbsp;
                Не определено: <b>{geoFixResult.not_found_count}</b>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setGeoFixResult(null)}
                className="text-sm px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition">
                Отмена
              </button>
              {geoFixResult.changed_count > 0 && (
                <button onClick={handleGeoFixApply} disabled={geoFixApplying}
                  className="text-sm px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-1.5">
                  <Icon name={geoFixApplying ? 'Loader2' : 'Check'} size={14} className={geoFixApplying ? 'animate-spin' : ''} />
                  Применить {geoFixResult.changed_count} исправлений
                </button>
              )}
            </div>
          </div>
          {geoFixResult.changed.length > 0 && (
            <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-emerald-50 text-emerald-700 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left">ID</th>
                    <th className="px-3 py-2 text-left">Адрес</th>
                    <th className="px-3 py-2 text-left">Было</th>
                    <th className="px-3 py-2 text-left">Станет</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100">
                  {geoFixResult.changed.map(r => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-muted-foreground font-mono">#{r.id}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate">{r.address}</td>
                      <td className="px-3 py-2 text-red-600 line-through text-xs">{r.district_old}</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold text-xs">{r.district_new}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── OSM-панель: ошибка загрузки ──────────────────────────────────────── */}
      {osmOpen && osmError && !osmMeta && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Icon name="AlertTriangle" size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-red-800 mb-1">Ошибка загрузки из OpenStreetMap</div>
              <div className="text-sm text-red-700 mb-3">{osmError}</div>
              <div className="text-xs text-red-600 mb-3">
                Серверы OpenStreetMap иногда перегружены. Подождите 1–2 минуты и попробуйте снова.
              </div>
              <button
                onClick={() => handleOsmLoad(true)}
                disabled={osmLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50">
                <Icon name={osmLoading ? 'Loader2' : 'RefreshCw'} size={14} className={osmLoading ? 'animate-spin' : ''} />
                {osmLoading ? 'Загружаю...' : 'Попробовать снова'}
              </button>
            </div>
            <button onClick={() => setOsmOpen(false)} className="text-red-300 hover:text-red-500">
              <Icon name="X" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── OSM-панель (Overpass + ИИ) ─────────────────────────────────────── */}
      {osmOpen && osmMeta && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5 space-y-4">

          {/* Заголовок */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-sky-800 flex items-center gap-2">
                <Icon name="Map" size={16} /> Улицы из OpenStreetMap
              </div>
              <div className="text-sm text-sky-700 mt-0.5">
                Всего в OSM: <b>{osmMeta.osm_total}</b> &nbsp;·&nbsp;
                Уже в справочнике: <b>{osmMeta.in_map + osmAddedTotal}</b> &nbsp;·&nbsp;
                Осталось добавить: <b>{Math.max(0, osmMeta.missing_count - osmAddedTotal)}</b>
                {osmAddedTotal > 0 && <> &nbsp;·&nbsp; Добавлено: <b className="text-emerald-700">{osmAddedTotal}</b></>}
                {osmSkippedTotal > 0 && <> &nbsp;·&nbsp; Без района: <b className="text-amber-600">{osmSkippedTotal}</b></>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOsmLoad(true)}
                disabled={osmLoading || osmRunAll}
                title="Обновить список из OSM (сбросит прогресс)"
                className="text-sky-400 hover:text-sky-600 disabled:opacity-30">
                <Icon name={osmLoading ? 'Loader2' : 'RefreshCw'} size={15} className={osmLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setOsmOpen(false)} disabled={osmRunAll}
                className="text-sky-400 hover:text-sky-600 disabled:opacity-30">
                <Icon name="X" size={16} />
              </button>
            </div>
          </div>

          {/* Прогресс-бар */}
          {(osmRunAll || osmAddedTotal > 0) && osmProgress.total > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-sky-700">
                <span>{osmRunAll ? 'Обрабатываю...' : 'Прогресс'}</span>
                <span>{osmProgress.done} / {osmProgress.total}</span>
              </div>
              <div className="h-2.5 bg-sky-200 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (osmProgress.done / osmProgress.total) * 100)}%` }} />
              </div>
            </div>
          )}

          {osmCurrentBatch.length > 0 ? (
            <>
              {/* Таблица текущего батча */}
              <div className="bg-white rounded-xl border border-sky-200 overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sky-50 text-sky-700 text-xs uppercase tracking-wide sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left w-8">#</th>
                      <th className="px-3 py-2 text-left">Улица</th>
                      <th className="px-3 py-2 text-left hidden sm:table-cell">Основа для маппинга</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-50">
                    {osmCurrentBatch.map((s, i) => (
                      <tr key={i} className="hover:bg-sky-50/50">
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium">{s.street}</td>
                        <td className="px-3 py-1.5 text-muted-foreground text-xs hidden sm:table-cell">{s.base}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Кнопки */}
              <div className="flex items-center gap-3 flex-wrap">
                {!osmRunAll ? (
                  <>
                    <button onClick={handleOsmRunAll} disabled={osmAdding || osmLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-700 text-white text-sm font-semibold hover:bg-sky-800 transition disabled:opacity-50">
                      <Icon name="PlayCircle" size={14} />
                      Запустить все {osmQueue.length} улиц автоматически
                    </button>
                    <button onClick={handleOsmAddBatch} disabled={osmAdding || osmLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-sky-300 text-sky-700 text-sm hover:bg-sky-100 transition disabled:opacity-50">
                      <Icon name={osmAdding ? 'Loader2' : 'Sparkles'} size={14} className={osmAdding ? 'animate-spin' : ''} />
                      {osmAdding ? 'Добавляю...' : `Батч из ${osmCurrentBatch.length}`}
                    </button>
                  </>
                ) : (
                  <button onClick={() => { stopRef.current = true; }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition">
                    <Icon name="StopCircle" size={14} />
                    Остановить
                  </button>
                )}
                <span className="text-xs text-sky-500 ml-auto">
                  В очереди: {osmQueue.length} улиц
                </span>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-emerald-700 py-1">
                <Icon name="CheckCircle2" size={16} className="text-emerald-500" />
                Очередь обработана. Добавлено: <b>{osmAddedTotal}</b>
                {osmSkippedTotal > 0 && (
                  <span className="text-amber-600 ml-1">· не определён район: <b>{osmSkippedTotal}</b></span>
                )}
              </div>
              {osmSkippedTotal > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Для пропущенных улиц DaData не вернул район. Это нормально для частных секторов и новых улиц.
                  Нажмите <b>↺</b> чтобы загрузить обновлённый список и повторить.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ИИ-панель ─────────────────────────────────────────────────────── */}
      {showAiPanel && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 space-y-4">

          <div className="flex items-center gap-2">
            <Icon name="Wand2" size={16} className="text-violet-600" />
            <span className="font-semibold text-sm text-violet-700">Добавление районов через ИИ</span>
            <button type="button" onClick={closeAiPanel} className="ml-auto text-violet-400 hover:text-violet-600">
              <Icon name="X" size={16} />
            </button>
          </div>

          {/* Город */}
          <div className="relative max-w-xs">
            <Icon name="Building2" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input type="text" value={aiCity}
              onChange={e => { setAiCity(e.target.value); setAiResult([]); setEnrichResult([]); }}
              placeholder="Город (напр. Краснодар)"
              className="w-full pl-8 pr-3 py-2 border border-violet-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white" />
          </div>

          {/* Вкладки */}
          <div className="flex gap-1 bg-violet-100 rounded-xl p-1 w-fit">
            <button type="button" onClick={() => { setAiTab('auto'); setEnrichResult([]); setEnrichError(''); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${aiTab === 'auto' ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-500 hover:text-violet-700'}`}>
              <Icon name="Sparkles" size={13} />
              Авто-поиск
            </button>
            <button type="button" onClick={() => { setAiTab('text'); setAiResult([]); setAiError(''); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${aiTab === 'text' ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-500 hover:text-violet-700'}`}>
              <Icon name="List" size={13} />
              Свой список
            </button>
          </div>

          {/* ── Авто ── */}
          {aiTab === 'auto' && (
            <div className="space-y-3">
              <p className="text-xs text-violet-600">ИИ сам сформирует полный список районов города с описаниями.</p>
              <button type="button" onClick={handleAiSuggest} disabled={aiLoading || !aiCity.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 transition">
                <Icon name={aiLoading ? 'Loader2' : 'Search'} size={14} className={aiLoading ? 'animate-spin' : ''} />
                {aiLoading ? 'ИИ ищет районы...' : 'Найти районы'}
              </button>
              {aiError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <Icon name="AlertCircle" size={14} /> {aiError}
                </div>
              )}
              {aiResult.length > 0 && (
                <AiResultGrid
                  items={aiResult} selected={aiSel.selected} cityName={aiCity}
                  onToggle={aiSel.toggle} onSelectAll={aiSel.selectAll} onDeselectAll={aiSel.deselectAll}
                  importing={aiImporting} onImport={handleAiImport} error=""
                />
              )}
            </div>
          )}

          {/* ── Свой список ── */}
          {aiTab === 'text' && (
            <div className="space-y-3">
              <p className="text-xs text-violet-600">
                Вставьте названия районов — по одному на строку. ИИ добавит к каждому описание, тип застройки и инфраструктуру на основе своих знаний о городе.
              </p>
              <textarea
                value={textInput}
                onChange={e => { setTextInput(e.target.value); setEnrichResult([]); }}
                rows={7}
                placeholder={'Центральный\nФМР\nЮМР\nКарасунский\nПашковский\nЗападный обход\nСтаврополькая'}
                className="w-full px-3 py-2.5 border border-violet-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white resize-none font-mono leading-relaxed"
              />
              <div className="flex items-center gap-3">
                <button type="button" onClick={handleEnrich} disabled={enrichLoading || !textInput.trim() || !aiCity.trim()}
                  className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 transition">
                  <Icon name={enrichLoading ? 'Loader2' : 'Wand2'} size={14} className={enrichLoading ? 'animate-spin' : ''} />
                  {enrichLoading ? 'ИИ анализирует...' : 'Обогатить через ИИ'}
                </button>
                {textLineCount > 0 && (
                  <span className="text-xs text-muted-foreground">{textLineCount} районов в списке</span>
                )}
              </div>
              {enrichError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <Icon name="AlertCircle" size={14} /> {enrichError}
                </div>
              )}
              {enrichResult.length > 0 && (
                <AiResultGrid
                  items={enrichResult} selected={enrichSel.selected} cityName={aiCity}
                  onToggle={enrichSel.toggle} onSelectAll={enrichSel.selectAll} onDeselectAll={enrichSel.deselectAll}
                  importing={enrichImporting} onImport={handleEnrichImport} error=""
                />
              )}
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <AddForm onSave={handleAdd} onCancel={() => setShowAddForm(false)} saving={addSaving} />
      )}

      <DistrictsTable
        districts={districts} loading={loading} error={error}
        editId={editId} editSaving={editSaving} deletingId={deletingId} togglingId={togglingId}
        onEdit={id => { setEditId(id); setShowAddForm(false); setShowAiPanel(false); }}
        onEditSave={handleEdit} onEditCancel={() => setEditId(null)}
        onToggleActive={handleToggleActive} onDelete={handleDelete}
      />
    </div>
  );
}