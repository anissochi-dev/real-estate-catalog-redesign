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
  setStatusFilter: (v: StatusFilter) => void;
  setSelected: (s: Set<number>) => void;
  search: string;
  setSearch: (v: string) => void;
  catFilter: string;
  setCatFilter: (v: string) => void;
  hasDraft: boolean;
  setHasDraft: (v: boolean) => void;
  onAdd: () => void;
  onImport: (data: ImportedListing) => void;
  activeCount: number;
  archivedCount: number;
  totalCount: number;
  filteredCount: number;
}

export default function ListingsToolbar({
  statusFilter, setStatusFilter, setSelected,
  search, setSearch, catFilter, setCatFilter,
  hasDraft, setHasDraft, onAdd, onImport,
  activeCount, archivedCount, totalCount, filteredCount,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      {/* Фильтры статуса */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          ['active', `Активные (${activeCount})`, 'CheckCircle'],
          ['archived', `Архив (${archivedCount})`, 'Archive'],
          ['all', `Все (${totalCount})`, 'List'],
        ] as [StatusFilter, string, string][]).map(([v, l, ic]) => (
          <button key={v} onClick={() => { setStatusFilter(v); setSelected(new Set()); }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${statusFilter === v ? 'bg-brand-blue text-white' : 'border border-border hover:bg-muted'}`}>
            <Icon name={ic} size={14} />
            {l}
          </button>
        ))}
      </div>

      {/* Кнопки действий */}
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
          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold leading-tight">
            <Icon name="Pencil" size={12} className="shrink-0 text-orange-500" />
            <span>Черновик<br/>сохранён</span>
            <button onClick={() => { clearDraft(); setHasDraft(false); }} className="hover:text-red-600 transition-colors ml-0.5 shrink-0" title="Удалить">
              <Icon name="X" size={12} />
            </button>
          </span>
        )}
      </div>

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

      <div className="text-xs text-muted-foreground">
        Показано: {filteredCount} из {totalCount}
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