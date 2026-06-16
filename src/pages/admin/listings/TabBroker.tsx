import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing } from './types';
import { BrokerUser } from './internalCardTypes';
import { useAuth } from '@/contexts/AuthContext';

export function TabBroker({ listing, onSaved, currentUserId }: { listing: Listing; onSaved: () => void; currentUserId?: number }) {
  const { user } = useAuth();
  const [users, setUsers] = useState<BrokerUser[]>([]);
  const [selected, setSelected] = useState<number | null>(
    (listing as Record<string, unknown>).broker_id as number | null ?? null
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Только admin и director могут переназначать брокера
  const canAssign = user && ['admin', 'director'].includes(user.role);

  useEffect(() => {
    if (!canAssign) return;
    adminApi.listUsers().then(r => {
      const all: BrokerUser[] = r.users || [];
      setUsers(all.filter(u => ['admin', 'director', 'broker', 'office_manager', 'manager'].includes(u.role)));
    });
  }, [canAssign]);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateListing(listing.id, { broker_id: selected });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const authorName = (listing as Record<string, unknown>).broker_name as string | null
    || (listing as Record<string, unknown>).author_name as string | null;

  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="text-sm font-semibold mb-1">Текущий брокер</div>
        <div className="px-4 py-3 bg-muted/40 rounded-xl text-sm">
          {authorName || (selected ? users.find(u => u.id === selected)?.name : null) || 'Не назначен'}
        </div>
      </div>

      {canAssign ? (
        <>
          <div>
            <div className="text-sm font-semibold mb-2">Передать объект брокеру</div>
            <select
              value={selected ?? ''}
              onChange={e => setSelected(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2.5 border border-border rounded-xl text-sm"
            >
              <option value="">— Не назначен —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.id === currentUserId ? '(я)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={save}
              disabled={saving}
              className="mt-3 btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2"
            >
              {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : null}
              {saved ? 'Сохранено!' : 'Сохранить'}
            </button>
          </div>
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            При смене брокера объект будет отображаться в его списке объектов. История изменений сохраняется.
          </div>
        </>
      ) : (
        <div className="p-4 bg-muted/40 rounded-xl text-sm text-muted-foreground flex items-center gap-2">
          <Icon name="Lock" size={15} />
          Переназначить брокера может только администратор или директор.
        </div>
      )}
    </div>
  );
}