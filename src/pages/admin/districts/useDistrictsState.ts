import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { District, FormState, buildHeaders, buildUrl } from './DistrictsTypes';

export function useDistrictsState() {
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

  return {
    districts, loading, error,
    showAddForm, setShowAddForm,
    addSaving,
    editId, setEditId,
    editSaving,
    togglingId, deletingId,
    load, handleAdd, handleEdit, handleToggleActive, handleDelete,
  };
}
