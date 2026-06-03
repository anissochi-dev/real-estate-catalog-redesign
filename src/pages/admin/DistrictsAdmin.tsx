import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { District, FormState, buildHeaders, buildUrl } from './districts/DistrictsTypes';
import { AddForm } from './districts/DistrictForms';
import DistrictsTable from './districts/DistrictsTable';

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

  return (
    <div className="space-y-4">
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition disabled:opacity-50"
          >
            <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={14} className={loading ? 'animate-spin' : ''} />
            Обновить
          </button>

          {!showAddForm && (
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
        onEdit={id => { setEditId(id); setShowAddForm(false); }}
        onEditSave={handleEdit}
        onEditCancel={() => setEditId(null)}
        onToggleActive={handleToggleActive}
        onDelete={handleDelete}
      />
    </div>
  );
}
