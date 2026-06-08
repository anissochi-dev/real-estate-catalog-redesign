import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { District, FormState, buildHeaders, buildUrl } from './districts/DistrictsTypes';
import { AddForm } from './districts/DistrictForms';
import DistrictsTable from './districts/DistrictsTable';
import AiResultGrid, { AiDistrict } from './districts/AiResultGrid';

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

  const [showAddForm, setShowAddForm] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Исправление районов
  const [geoFixLoading, setGeoFixLoading] = useState(false);
  const [geoFixResult, setGeoFixResult] = useState<{ changed_count: number; unchanged_count: number; not_found_count: number; changed: { id: number; address: string; district_old: string; district_new: string }[] } | null>(null);
  const [geoFixApplying, setGeoFixApplying] = useState(false);

  // Заполнение улиц через Overpass + ИИ
  type StreetItem = { street: string; base: string };
  const [osmLoading, setOsmLoading] = useState(false);
  const [osmResult, setOsmResult] = useState<{ osm_total: number; in_map: number; missing_count: number; missing: StreetItem[]; has_more: boolean } | null>(null);
  const [osmOffset, setOsmOffset] = useState(0);
  const [osmAdding, setOsmAdding] = useState(false);
  const [osmAddedTotal, setOsmAddedTotal] = useState(0);
  const [osmRunAll, setOsmRunAll] = useState(false);
  const [osmStopFlag, setOsmStopFlag] = useState(false);
  const [osmProgress, setOsmProgress] = useState({ done: 0, total: 0 });
  const OSM_BATCH = 20;

  const fetchOsmPage = async (offset: number): Promise<{ osm_total: number; in_map: number; missing_count: number; missing: StreetItem[]; has_more: boolean }> => {
    const res = await fetch(GEO_FIX_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'overpass_streets', offset, limit: OSM_BATCH }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  const addBatch = async (streets: StreetItem[]): Promise<number> => {
    const res = await fetch(GEO_FIX_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ai_map_streets', streets }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.added_count || 0;
  };

  const handleOsmLoad = async (offset = 0) => {
    setOsmLoading(true);
    try {
      const data = await fetchOsmPage(offset);
      setOsmResult(data); setOsmOffset(offset);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка загрузки OSM'); }
    finally { setOsmLoading(false); }
  };

  const handleOsmAddBatch = async () => {
    if (!osmResult?.missing?.length) return;
    setOsmAdding(true);
    try {
      const added = await addBatch(osmResult.missing);
      setOsmAddedTotal(t => t + added);
      toast.success(`Добавлено ${added} улиц`);
      const next = await fetchOsmPage(osmOffset + OSM_BATCH);
      setOsmResult(next); setOsmOffset(osmOffset + OSM_BATCH);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setOsmAdding(false); }
  };

  const handleOsmRunAll = async () => {
    setOsmRunAll(true); setOsmStopFlag(false);
    let offset = osmOffset;
    let totalAdded = osmAddedTotal;
    let missingTotal = osmResult?.missing_count ?? 0;
    setOsmProgress({ done: offset, total: missingTotal });
    try {
       
      while (true) {
        // Загружаем страницу
        const page = await fetchOsmPage(offset);
        missingTotal = page.missing_count;
        setOsmResult(page); setOsmOffset(offset);
        setOsmProgress({ done: offset, total: missingTotal });
        if (!page.missing.length) break;
        // Проверяем флаг остановки через замыкание — используем ref-подобный трюк через state
        // Передаём через setOsmStopFlag callback чтобы прочитать текущее значение
        let stopped = false;
        setOsmStopFlag(v => { stopped = v; return v; });
        if (stopped) { toast('Остановлено'); break; }
        // Отправляем батч в ИИ
        const added = await addBatch(page.missing);
        totalAdded += added;
        setOsmAddedTotal(totalAdded);
        offset += OSM_BATCH;
        if (!page.has_more) break;
      }
      toast.success(`Готово! Всего добавлено улиц: ${totalAdded}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка в процессе'); }
    finally { setOsmRunAll(false); setOsmStopFlag(false); }
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
          <button type="button" onClick={() => { setShowAiPanel(v => !v); setShowAddForm(false); setEditId(null); }}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border transition ${showAiPanel ? 'border-violet-400 bg-violet-100 text-violet-800' : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'}`}>
            <Icon name="Wand2" size={14} />
            Добавить через ИИ
          </button>
          <button type="button" onClick={handleGeoFixPreview} disabled={geoFixLoading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50">
            <Icon name={geoFixLoading ? 'Loader2' : 'MapPinCheck'} size={14} className={geoFixLoading ? 'animate-spin' : ''} />
            Исправить районы объектов
          </button>
          <button type="button" onClick={() => osmResult ? setOsmResult(null) : handleOsmLoad(0)} disabled={osmLoading}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border transition disabled:opacity-50 ${osmResult ? 'border-sky-400 bg-sky-100 text-sky-800' : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'}`}>
            <Icon name={osmLoading ? 'Loader2' : 'Map'} size={14} className={osmLoading ? 'animate-spin' : ''} />
            Улицы из OSM
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

      {/* ── OSM-панель (Overpass + ИИ) ─────────────────────────────────────── */}
      {osmResult && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-sky-800 flex items-center gap-2">
                <Icon name="Map" size={16} /> Улицы из OpenStreetMap
              </div>
              <div className="text-sm text-sky-700 mt-0.5">
                Всего в OSM: <b>{osmResult.osm_total}</b> &nbsp;·&nbsp;
                Уже в справочнике: <b>{osmResult.in_map}</b> &nbsp;·&nbsp;
                Недостаёт: <b>{osmResult.missing_count}</b>
                {osmAddedTotal > 0 && <> &nbsp;·&nbsp; Добавлено за сессию: <b className="text-sky-900">{osmAddedTotal}</b></>}
              </div>
            </div>
            <button onClick={() => { if (!osmRunAll) { setOsmResult(null); setOsmAddedTotal(0); } }}
              disabled={osmRunAll}
              className="text-sky-400 hover:text-sky-600 disabled:opacity-30"><Icon name="X" size={16} /></button>
          </div>

          {/* Прогресс-бар во время "Запустить всё" */}
          {osmRunAll && osmProgress.total > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-sky-700">
                <span>Обрабатываю улицы...</span>
                <span>{Math.min(osmProgress.done + OSM_BATCH, osmProgress.total)} / {osmProgress.total}</span>
              </div>
              <div className="h-2 bg-sky-200 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, ((osmProgress.done + OSM_BATCH) / osmProgress.total) * 100)}%` }} />
              </div>
            </div>
          )}

          {osmResult.missing.length > 0 ? (
            <>
              <div className="bg-white rounded-xl border border-sky-200 overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sky-50 text-sky-700 text-xs uppercase tracking-wide sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Улица (OSM)</th>
                      <th className="px-3 py-2 text-left">Основа</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-50">
                    {osmResult.missing.map((s, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-medium">{s.street}</td>
                        <td className="px-3 py-1.5 text-muted-foreground text-xs">{s.base}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Запустить ВСЁ автоматически */}
                {!osmRunAll ? (
                  <button onClick={handleOsmRunAll} disabled={osmAdding || osmLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-700 text-white text-sm font-semibold hover:bg-sky-800 transition disabled:opacity-50">
                    <Icon name="PlayCircle" size={14} />
                    Запустить все {osmResult.missing_count} улиц автоматически
                  </button>
                ) : (
                  <button onClick={() => setOsmStopFlag(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition">
                    <Icon name="StopCircle" size={14} />
                    Остановить
                  </button>
                )}
                {/* Батч вручную */}
                <button onClick={handleOsmAddBatch} disabled={osmAdding || osmLoading || osmRunAll}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-sky-300 text-sky-700 text-sm hover:bg-sky-100 transition disabled:opacity-50">
                  <Icon name={osmAdding ? 'Loader2' : 'Sparkles'} size={14} className={osmAdding ? 'animate-spin' : ''} />
                  {osmAdding ? 'Добавляю...' : `Только этот батч (${osmResult.missing.length})`}
                </button>
                <span className="text-xs text-sky-500">
                  {osmOffset + 1}–{osmOffset + osmResult.missing.length} из {osmResult.missing_count}
                </span>
              </div>
            </>
          ) : (
            <div className="text-sm text-sky-700 py-2">Все улицы из OSM уже есть в справочнике!</div>
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