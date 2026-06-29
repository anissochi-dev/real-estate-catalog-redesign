import { useAuth } from '@/contexts/AuthContext';
import { Listing } from './types';
import ListingsTableDesktopRow from './ListingsTableDesktopRow';
import ListingsTableMobileCard from './ListingsTableMobileCard';

interface Props {
  items: Listing[];
  onEdit: (it: Listing) => void;
  onArchive: (id: number) => void;
  onHistory: (it: Listing) => void;
  onPhotoDownload: (it: Listing) => void;
  onInternalCard?: (it: Listing) => void;
  onModerate?: (id: number, action: 'approve' | 'reject') => void;
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  siteUrl?: string;
  // bulk actions
  onBulk?: (op: string, value?: unknown) => void;
  onBulkDelete?: () => void;
  bulkLoading?: boolean;
  isAdmin?: boolean;
}

export default function ListingsTable({
  items, onEdit, onArchive, onHistory, onPhotoDownload, onInternalCard, onModerate,
  selected, onToggleSelect, onSelectAll, onDeselectAll,
  siteUrl,
  onBulk, onBulkDelete, bulkLoading = false, isAdmin = false,
}: Props) {
  const { user } = useAuth();
  const isBrokerRole = user?.role === 'broker';
  const canSeeFullDetails = user?.role && ['admin', 'director', 'broker', 'office_manager'].includes(user.role);
  const allSelected = items.length > 0 && items.every(i => selected.has(i.id));

  return (
    <div className="space-y-0.5">

      {/* ── Шапка с чекбоксом «Выбрать все» (скрыта для брокера) ── */}
      {!isBrokerRole && (
        <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-xl border border-border shadow-sm mb-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={allSelected ? onDeselectAll : onSelectAll}
            className="rounded accent-brand-blue w-4 h-4 flex-shrink-0"
          />
          <span className="text-xs text-muted-foreground font-medium">
            {selected.size > 0
              ? `Выбрано: ${selected.size} из ${items.length}`
              : `Выбрать все (${items.length})`}
          </span>
        </div>
      )}

      {/* ── Карточки ── */}
      {items.map(it => {
        const isSelected = selected.has(it.id);
        const isHidden = it.is_visible === false;
        const isBroker = user?.role === 'broker';
        const isBrokerOwner = isBroker && (it.author_id === user?.id || it.broker_id === user?.id);
        const showPhone = !isBroker || isBrokerOwner;
        const canEdit = !isBroker || isBrokerOwner;
        const canSelect = !isBroker || isBrokerOwner;
        const isArchived = it.status === 'archived';

        return (
          <div key={it.id} className="space-y-0">
            <div
              className={[
                'group bg-white border overflow-hidden shadow-sm transition-all duration-150',
                'rounded-2xl',
                'hover:shadow-md hover:border-brand-blue/30',
                isSelected ? 'border-brand-blue/50' : 'border-border',
                isHidden ? 'opacity-70' : '',
                isArchived ? 'opacity-60' : '',
              ].filter(Boolean).join(' ')}
            >
              <ListingsTableDesktopRow
                it={it}
                isSelected={isSelected}
                canSelect={canSelect}
                canEdit={canEdit}
                showPhone={showPhone}
                canSeeFullDetails={!!canSeeFullDetails}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                onArchive={onArchive}
                onHistory={onHistory}
                onInternalCard={onInternalCard}
                onModerate={onModerate}
              />
              <ListingsTableMobileCard
                it={it}
                isSelected={isSelected}
                canSelect={canSelect}
                canEdit={canEdit}
                showPhone={showPhone}
                siteUrl={siteUrl}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                onHistory={onHistory}
                onInternalCard={onInternalCard}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
