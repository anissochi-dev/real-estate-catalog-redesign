import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { CATS } from './types';
import { StatusFilter, clearDraft } from './useListingsState';
import ImportFromUrlModal from '@/components/admin/ImportFromUrlModal';

interface ImportedListing {
  title: string;
  description: string;
  price: number;
  area: number;
  images: string[];
  address: string;
  source_url: string;
}

interface Props {
  statusFilter: StatusFilter;
  switchTab: (v: StatusFilter) => void;
  search: string;
  setSearch: (v: string) => void;
  catFilter: string;
  setCatFilter: (v: string) => void;
  hasDraft: boolean;
  setHasDraft: (v: boolean) => void;
  onAdd: () => void;
  onImport: (data: ImportedListing) => void;
  counts: { active: number; archived: number; hidden: number };
  canCreate?: boolean;
  isBroker?: boolean;
  myOnly?: boolean;
  toggleMyOnly?: () => void;
}

export default function ListingsToolbar({
  statusFilter, switchTab,
  search, setSearch, catFilter, setCatFilter,
  hasDraft, setHasDraft, onAdd, onImport,
  counts, canCreate = true,
  isBroker = false, myOnly = true, toggleMyOnly,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      {/* Фильтры статуса */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          ['active',   `Активные (${counts.active})`,   'CheckCircle'],
          ['hidden',   `Скрытые (${counts.hidden})`,    'EyeOff'],
          ['archived', `Архив (${counts.archived})`,    'Archive'],
          ['all',      'Все',                           'List'],
        ] as [StatusFilter, string, string][]).map(([v, l, ic]) => (
          <button key={v} onClick={() => switchTab(v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${statusFilter === v ? 'bg-brand-blue text-white' : 'border border-border hover:bg-muted'}`}>
            <Icon name={ic} size={14} />
            {l}
          </button>
        ))}
      </div>

      {/* Переключатель Мои / Все для брокера */}
      {isBroker && toggleMyOnly && (
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-xl p-1 gap-1">
            <button
              onClick={() => !myOnly && toggleMyOnly()}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${myOnly ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon name="User" size={14} />
              Мои объекты
            </button>
            <button
              onClick={() => myOnly && toggleMyOnly()}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${!myOnly ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon name="Building2" size={14} />
              Все объекты
            </button>
          </div>
          {myOnly && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Icon name="Info" size={12} />
              Телефоны и управление доступны только на своих
            </span>
          )}
        </div>
      )}

      {/* Кнопки действий */}
      {canCreate && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            <Icon name="Link" size={14} /> Импорт
          </button>
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-blue text-white text-xs font-semibold leading-tight text-left"
          >
            <Icon name="Plus" size={14} className="shrink-0" />
            {hasDraft ? <span>Продолжить<br/>черновик</span> : 'Добавить объект'}
          </button>
          {hasDraft && (
            <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700" title="Черновик сохранён">
              <Icon name="Pencil" size={14} className="shrink-0 text-orange-500" />
              <button onClick={() => { clearDraft(); setHasDraft(false); }} className="hover:text-red-600 transition-colors shrink-0" title="Удалить черновик">
                <Icon name="X" size={12} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Поиск и фильтр категории */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl text-sm"
            placeholder="Поиск по названию, адресу, телефону, ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="w-full sm:w-48 border border-border rounded-xl px-3 py-2.5 text-sm bg-white"
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
        >
          <option value="">Все категории</option>
          {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {importOpen && (
        <ImportFromUrlModal
          onImport={onImport}
          onClose={() => setImportOpen(false)}
        />
      )}
    </>
  );
}