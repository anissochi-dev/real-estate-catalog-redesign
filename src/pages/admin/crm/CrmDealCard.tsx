import Icon from '@/components/ui/icon';
import { Deal } from './crmKanbanTypes';

interface Props {
  deal: Deal;
  onDragStart: (deal: Deal) => void;
  onDragEnd: () => void;
  onClick: (id: number) => void;
}

export default function CrmDealCard({ deal, onDragStart, onDragEnd, onClick }: Props) {
  const cardCls = deal.is_overdue
    ? 'bg-amber-50 border-amber-300'
    : deal.is_terminal
      ? 'bg-slate-50 border-slate-200 opacity-90'
      : 'bg-white border-border';

  return (
    <div
      draggable
      onDragStart={() => onDragStart(deal)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(deal.id)}
      className={`rounded-xl border p-3 shadow-sm cursor-pointer hover:shadow-md transition select-none ${cardCls}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-semibold text-sm leading-tight flex-1">{deal.title}</div>
        {deal.is_overdue && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 flex-shrink-0">
            <Icon name="Clock" size={9} /> Просрочено
          </span>
        )}
        {deal.is_win && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
            <Icon name="Trophy" size={9} /> Выигр.
          </span>
        )}
      </div>
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