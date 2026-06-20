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
  counts: { active: number; archived: number; hidden: number; moderation: number };
  canCreate?: boolean;
  canModerate?: boolean;
  isBroker?: boolean;
  myOnly?: boolean;
  toggleMyOnly?: () => void;
}

export default function ListingsToolbar({
  statusFilter, switchTab,
  search, setSearch, catFilter, setCatFilter,
  hasDraft, setHasDraft, onAdd, onImport,
  counts, canCreate = true, canModerate = false,
  isBroker = false, myOnly = true, toggleMyOnly,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      {/* Вкладки статуса — одна линия, на мобиле центрированы */}
      <div className="flex items-center justify-center lg:justify-start gap-2 flex-wrap">
        {canModerate && counts.moderation > 0 && (
          <button onClick={() => switchTab('moderation')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
              statusFilter === 'moderation'
                ? 'bg-amber-500 text-white'
                : 'border-2 border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100'
            }`}>
            <Icon name="Clock" size={14} />
            На модерации
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusFilter === 'moderation' ? 'bg-white/25' : 'bg-amber-500 text-white'}`}>
              {counts.moderation}
            </span>
          </button>
        )}
        {([
          ['active',   `Активные (${counts.active})`,   'CheckCircle'],
          ['hidden',   `Скрытые (${counts.hidden})`,    'EyeOff'],
          ['archived', `Архив (${counts.archived})`,    'Archive'],
        ] as [StatusFilter, string, string][]).map(([v, l, ic]) => (
          <button key={v} onClick={() => switchTab(v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${statusFilter === v ? 'bg-brand-blue text-white' : 'border border-border hover:bg-muted'}`}>
            <Icon name={ic} size={14} />
            {l}
          </button>
        ))}
      </div>

      {/* Кнопки Импорт + Добавить */}
      {canCreate && (
        <div className="flex items-center gap-2 justify-center lg:justify-start">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            <Icon name="Link" size={14} /> Импорт
          </button>
          <button
            onClick={onAdd}
            className="inline-flex items-center justify-center gap-1.5 w-[160px] h-[36px] rounded-xl btn-blue text-white text-sm font-semibold transition-colors shrink-0"
          >
            <Icon name={hasDraft ? 'FileEdit' : 'Plus'} size={14} className="shrink-0" />
            {hasDraft ? 'Продолжить' : 'Добавить объект'}
          </button>
          <button
            onClick={hasDraft ? () => { clearDraft(); setHasDraft(false); } : undefined}
            title={hasDraft ? 'Удалить черновик' : undefined}
            className={`inline-flex items-center justify-center w-[36px] h-[36px] rounded-xl border transition-colors shrink-0 ${
              hasDraft
                ? 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                : 'invisible pointer-events-none'
            }`}
          >
            <Icon name="X" size={14} />
          </button>
        </div>
      )}

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