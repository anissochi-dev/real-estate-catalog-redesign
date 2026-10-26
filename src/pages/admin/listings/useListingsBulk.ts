import { useState } from 'react';
import { adminApi } from '@/lib/adminApi';

export function useListingsBulk(
  selected: Set<number>,
  setSelected: (s: Set<number> | ((prev: Set<number>) => Set<number>)) => void,
  reload: () => void,
) {
  const [bulkLoading, setBulkLoading] = useState(false);

  const runBulk = async (op: string, value?: unknown) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkLoading(true);
    try {
      await adminApi.bulkListings(ids, op, value);
      setSelected(new Set());
      reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`ПОЛНОСТЬЮ УДАЛИТЬ ${ids.length} объект(ов) без возможности восстановления?`)) return;
    setBulkLoading(true);
    try {
      await adminApi.bulkListings(ids, 'delete');
      setSelected(new Set());
      reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) { s.delete(id); } else { s.add(id); }
      return s;
    });
  };

  return { bulkLoading, runBulk, bulkDelete, toggleSelect };
}
