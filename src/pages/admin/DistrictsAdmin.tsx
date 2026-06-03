import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { District, FormState, buildHeaders, buildUrl } from './districts/DistrictsTypes';
import { AddForm } from './districts/DistrictForms';
import DistrictsTable from './districts/DistrictsTable';

const DISTRICT_AI_URL = 'https://functions.poehali.dev/eddffe59-b37d-425e-90a3-59d12d44623f';

interface AiDistrict {
  name: string;
  city: string;
  description: string;
  slug: string;
  sort_order: number;
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

  // ИИ-генерация
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiCity, setAiCity] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiDistrict[]>([]);
  const [aiSelected, setAiSelected] = useState<Set<number>>(new Set());
  const [aiImporting, setAiImporting] = useState(false);
  const [aiError, setAiError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const tok = refreshToken();
      const res = await fetch(buildUrl(), { method: 'GET', headers: buildHeaders(tok) });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      const list: District[] = Array.isArray(data?.districts)
        ? data.districts
        : Array.isArray(data)
        ? data
        : [];
      setDistricts(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (form: FormState) => {
    setAddSaving(true);
    try {
      const tok = refreshToken();
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        city: form.city.trim(),
        sort_order: form.sort_order,
      };
      if (form.description.trim()) body.description = form.description.trim();
      const res = await fetch(buildUrl(), {
        method: 'POST',
        headers: buildHeaders(tok),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      toast.success(`Район «${form.name}» добавлен`);
      setShowAddForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось добавить');
    } finally {
      setAddSaving(false);
    }
  };

  const handleEdit = async (district: District, form: FormState) => {
    setEditSaving(true);
    try {
      const tok = refreshToken();
      const body: Record<string, unknown> = {
        id: district.id,
        name: form.name.trim(),
        slug: form.slug.trim(),
        city: form.city.trim(),
        description: form.description.trim(),
        sort_order: form.sort_order,
      };
      const res = await fetch(buildUrl(), {
        method: 'PUT',
        headers: buildHeaders(tok),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      toast.success(`Район «${form.name}» обновлён`);
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleActive = async (district: District) => {
    setTogglingId(district.id);
    try {
      const tok = refreshToken();
      const res = await fetch(buildUrl(), {
        method: 'PUT',
        headers: buildHeaders(tok),
        body: JSON.stringify({ id: district.id, is_active: !district.is_active }),
      });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      setDistricts(ds =>
        ds.map(d => d.id === district.id ? { ...d, is_active: !d.is_active } : d)
      );
      toast.success(
        !district.is_active
          ? `Район «${district.name}» активирован`
          : `Район «${district.name}» скрыт`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось изменить');
    } finally {
      setTogglingId(null);
    }
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
      const res = await fetch(buildUrl(), {
        method: 'DELETE',
        headers: buildHeaders(tok),
        body: JSON.stringify({ id: district.id }),
      });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      setDistricts(ds => ds.filter(d => d.id !== district.id));
      toast.success(`Район «${district.name}» удалён`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось удалить');
    } finally {
      setDeletingId(null);
    }
  };

  // ── ИИ-генерация ──────────────────────────────────────────────────────────
  const handleAiSuggest = async () => {
    if (!aiCity.trim()) return;
    setAiLoading(true); setAiError(''); setAiResult([]); setAiSelected(new Set());
    try {
      const tok = refreshToken();
      const res = await fetch(DISTRICT_AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok },
        body: JSON.stringify({ action: 'suggest', city: aiCity.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      const list: AiDistrict[] = data.districts || [];
      setAiResult(list);
      setAiSelected(new Set(list.map((_, i) => i)));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiImport = async () => {
    const selected = aiResult.filter((_, i) => aiSelected.has(i));
    if (!selected.length) return;
    setAiImporting(true); setAiError('');
    try {
      const tok = refreshToken();
      const res = await fetch(DISTRICT_AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok },
        body: JSON.stringify({ action: 'import', city: aiCity.trim(), districts: selected }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      toast.success(`Добавлено: ${data.imported}, пропущено (уже есть): ${data.skipped}`);
      setShowAiPanel(false);
      setAiResult([]);
      setAiCity('');
      await load();
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setAiImporting(false);
    }
  };

  const toggleAiItem = (i: number) => {
    setAiSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-700 text-xl flex items-center gap-2">
            <Icon name="MapPin" size={20} className="text-brand-blue" />
            Районы города
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Управление районами для фильтрации и группировки объектов
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { setShowAiPanel(v => !v); setShowAddForm(false); setEditId(null); }}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition"
          >
            <Icon name="Wand2" size={14} />
            Найти через ИИ
          </button>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition disabled:opacity-50"
          >
            <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={14} className={loading ? 'animate-spin' : ''} />
            Обновить
          </button>

          {!showAddForm && !showAiPanel && (
            <button
              type="button"
              onClick={() => { setShowAddForm(true); setEditId(null); }}
              className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
            >
              <Icon name="Plus" size={14} />
              Добавить район
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <Icon name="AlertCircle" size={16} />
          {error}
        </div>
      )}

      {/* ИИ-панель */}
      {showAiPanel && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Icon name="Wand2" size={16} className="text-violet-600" />
            <span className="font-semibold text-sm text-violet-700">Найти районы через ИИ</span>
            <button type="button" onClick={() => setShowAiPanel(false)} className="ml-auto text-violet-400 hover:text-violet-600">
              <Icon name="X" size={16} />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={aiCity}
              onChange={e => setAiCity(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAiSuggest()}
              placeholder="Введите город, например: Краснодар"
              className="flex-1 px-3 py-2 border border-violet-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
            />
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={aiLoading || !aiCity.trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 transition"
            >
              <Icon name={aiLoading ? 'Loader2' : 'Search'} size={14} className={aiLoading ? 'animate-spin' : ''} />
              {aiLoading ? 'Ищу...' : 'Найти'}
            </button>
          </div>

          {aiError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <Icon name="AlertCircle" size={14} /> {aiError}
            </div>
          )}

          {aiResult.length > 0 && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-violet-700 font-semibold">
                  ИИ нашёл {aiResult.length} районов для «{aiCity}»
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAiSelected(new Set(aiResult.map((_, i) => i)))}
                    className="text-xs text-violet-600 hover:underline">Выбрать все</button>
                  <span className="text-violet-300">·</span>
                  <button type="button" onClick={() => setAiSelected(new Set())}
                    className="text-xs text-violet-600 hover:underline">Снять все</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                {aiResult.map((d, i) => (
                  <label
                    key={i}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                      aiSelected.has(i)
                        ? 'bg-white border-violet-300'
                        : 'bg-white/50 border-violet-100 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={aiSelected.has(i)}
                      onChange={() => toggleAiItem(i)}
                      className="mt-0.5 accent-violet-600 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{d.name}</div>
                      {d.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.description}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAiImport}
                  disabled={aiImporting || aiSelected.size === 0}
                  className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 transition"
                >
                  <Icon name={aiImporting ? 'Loader2' : 'Download'} size={14} className={aiImporting ? 'animate-spin' : ''} />
                  {aiImporting ? 'Добавляю...' : `Добавить выбранные (${aiSelected.size})`}
                </button>
                <span className="text-xs text-muted-foreground">Уже существующие районы будут пропущены</span>
              </div>
            </>
          )}
        </div>
      )}

      {showAddForm && (
        <AddForm
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
          saving={addSaving}
        />
      )}

      <DistrictsTable
        districts={districts}
        loading={loading}
        error={error}
        editId={editId}
        editSaving={editSaving}
        deletingId={deletingId}
        togglingId={togglingId}
        onEdit={id => { setEditId(id); setShowAddForm(false); setShowAiPanel(false); }}
        onEditSave={handleEdit}
        onEditCancel={() => setEditId(null)}
        onToggleActive={handleToggleActive}
        onDelete={handleDelete}
      />
    </div>
  );
}