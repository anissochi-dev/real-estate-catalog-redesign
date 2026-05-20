import Icon from '@/components/ui/icon';
import { Deal } from './crmKanbanTypes';

interface Props {
  deal: Deal;
  onDragStart: (deal: Deal) => void;
  onDragEnd: () => void;
  onClick: (id: number) => void;
}

export default function CrmDealCard({ deal, onDragStart, onDragEnd, onClick }: Props) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(deal)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(deal.id)}
      className="bg-white rounded-xl border border-border p-3 shadow-sm cursor-pointer hover:shadow-md transition select-none"
    >
      <div className="font-semibold text-sm mb-1 leading-tight">{deal.title}</div>
      {deal.owner_name && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <Icon name="User" size={11} />
          {deal.owner_name}
        </div>
      )}
      {deal.listing_title && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 truncate">
          <Icon name="Building2" size={11} />
          {deal.listing_title}
        </div>
      )}
      {deal.assignee_name && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="UserCheck" size={11} />
          {deal.assignee_name}
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        {deal.amount ? (
          <span className="text-xs font-semibold text-brand-blue">
            {Number(deal.amount).toLocaleString('ru')} ₽
          </span>
        ) : <span />}
        {deal.commission ? (
          <span className="text-xs text-green-600">
            +{Number(deal.commission).toLocaleString('ru')} ₽
          </span>
        ) : <span />}
      </div>
    </div>
  );
}
