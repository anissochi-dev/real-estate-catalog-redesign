import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { District, FormState } from './DistrictsTypes';
import { EditRow } from './DistrictForms';

function ListingsBadge({ count }: { count?: number }) {
  if (count === undefined || count === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
        —
      </span>
    );
  }
  if (count > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <Icon name="Home" size={11} />
        {count}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
      <Icon name="Home" size={11} />
      0
    </span>
  );
}

function ActiveToggle({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
        value ? 'bg-emerald-500' : 'bg-muted'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          value ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

interface DistrictsTableProps {
  districts: District[];
  loading: boolean;
  error: string;
  editId: number | null;
  editSaving: boolean;
  deletingId: number | null;
  togglingId: number | null;
  onEdit: (id: number) => void;
  onEditSave: (district: District, form: FormState) => void;
  onEditCancel: () => void;
  onToggleActive: (district: District) => void;
  onDelete: (district: District) => void;
}

export default function DistrictsTable({
  districts,
  loading,
  error,
  editId,
  editSaving,
  deletingId,
  togglingId,
  onEdit,
  onEditSave,
  onEditCancel,
  onToggleActive,
  onDelete,
}: DistrictsTableProps) {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const activeCount = districts.filter(d => d.is_active).length;
  const inactiveCount = districts.length - activeCount;

  const filtered = districts.filter(d => {
    if (!showInactive && !d.is_active) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) ||
      d.city.toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q);
  });

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      {/* Шапка: счётчик + поиск */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="List" size={14} />
          {loading ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="Loader2" size={12} className="animate-spin" /> Загрузка...
            </span>
          ) : (
            <span>
              Активных: <strong className="text-foreground">{activeCount}</strong>
              {inactiveCount > 0 && (
                <span className="text-muted-foreground"> · скрытых: {inactiveCount}</span>
              )}
              {search && (
                <span className="text-muted-foreground"> · найдено: {filtered.length}</span>
              )}
            </span>
          )}
        </div>

        {inactiveCount > 0 && (
          <button
            type="button"
            onClick={() => setShowInactive(v => !v)}
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition ${
              showInactive
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-muted border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name={showInactive ? 'EyeOff' : 'Eye'} size={12} />
            {showInactive ? 'Скрыть неактивные' : `Показать неактивные (${inactiveCount})`}
          </button>
        )}

        <div className="flex-1 min-w-[180px] max-w-xs relative">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию, городу..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <Icon name="X" size={13} />
            </button>
          )}
        </div>
      </div>

      {!loading && districts.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Icon name="MapPin" size={40} className="opacity-20" />
          <p className="text-sm">Районов пока нет. Добавьте первый.</p>
        </div>
      ) : !loading && filtered.length === 0 && search ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <Icon name="SearchX" size={32} className="opacity-20" />
          <p className="text-sm">Ничего не найдено по запросу «{search}»</p>
        </div>
      ) : (
        <>
        {/* Мобильный вид */}
        <div className="sm:hidden divide-y divide-border">
          {filtered.map(district => {
            const isEditing = editId === district.id;
            const isDeleting = deletingId === district.id;
            const isToggling = togglingId === district.id;
            if (isEditing) return null; // редактирование только в десктопе
            return (
              <div key={district.id}
                className={`px-4 py-3 ${isDeleting ? 'opacity-40 pointer-events-none' : ''} ${!district.is_active ? 'opacity-50 bg-muted/30' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{district.name}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Icon name="Building2" size={11} />{district.city}
                      </span>
                      <code className="text-xs font-mono bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground">{district.slug}</code>
                      <ListingsBadge count={district.listings_count} />
                    </div>
                    {district.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{district.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ActiveToggle
                      value={district.is_active}
                      disabled={isToggling}
                      onChange={() => onToggleActive(district)}
                    />
                    <button onClick={() => onEdit(district.id)}
                      className="p-1.5 rounded-lg hover:bg-muted text-brand-blue">
                      <Icon name="Pencil" size={15} />
                    </button>
                    <button onClick={() => onDelete(district)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                      <Icon name="Trash2" size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Десктопный вид */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Название</th>
                <th className="text-left px-4 py-3 font-semibold">Slug</th>
                <th className="text-left px-4 py-3 font-semibold">Город</th>
                <th className="text-center px-4 py-3 font-semibold">Объекты</th>
                <th className="text-center px-4 py-3 font-semibold">Активен</th>
                <th className="text-center px-4 py-3 font-semibold">Порядок</th>
                <th className="text-right px-4 py-3 font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(district => {
                const isEditing = editId === district.id;
                const isDeleting = deletingId === district.id;
                const isToggling = togglingId === district.id;

                if (isEditing) {
                  return (
                    <EditRow
                      key={district.id}
                      district={district}
                      onSave={form => onEditSave(district, form)}
                      onCancel={onEditCancel}
                      saving={editSaving}
                    />
                  );
                }

                return (
                  <tr
                    key={district.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/40 transition-colors ${
                      isDeleting ? 'opacity-40 pointer-events-none' : ''
                    } ${!district.is_active ? 'opacity-50 bg-muted/20' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{district.name}</span>
                        {district.description && (
                          <span className="text-muted-foreground/60" title={district.description}>
                            <Icon name="Info" size={13} />
                          </span>
                        )}
                      </div>
                      {district.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 max-w-xs">
                          {district.description}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <code className="text-xs font-mono bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground">
                        {district.slug}
                      </code>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Icon name="Building2" size={13} className="text-muted-foreground" />
                        {district.city}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <ListingsBadge count={district.listings_count} />
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center">
                        <ActiveToggle
                          value={district.is_active}
                          disabled={isToggling}
                          onChange={() => onToggleActive(district)}
                        />
                      </div>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-mono text-muted-foreground">
                        {district.sort_order}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(district.id)}
                          disabled={editSaving || isDeleting}
                          title="Редактировать"
                          className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition disabled:opacity-40"
                        >
                          <Icon name="Pencil" size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => onDelete(district)}
                          disabled={isDeleting || editSaving}
                          title="Удалить"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition disabled:opacity-40"
                        >
                          {isDeleting
                            ? <Icon name="Loader2" size={14} className="animate-spin" />
                            : <Icon name="Trash2" size={14} />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}