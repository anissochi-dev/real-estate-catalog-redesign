import Icon from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { Stage, Deal } from '../crmKanbanTypes';
import CrmDealCard from '../CrmDealCard';

interface Props {
  isLoading: boolean;
  stages: Stage[];
  deals: Deal[];
  onDragStart: (deal: Deal) => void;
  onDragEnd: () => void;
  onDrop: (stageId: number) => void;
  onCardClick: (id: number) => void;
}

export default function CrmKanbanBoard({
  isLoading, stages, deals, onDragStart, onDragEnd, onDrop, onCardClick,
}: Props) {
  const dealsByStage = (stageId: number) => deals.filter(d => d.stage_id === stageId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Icon name="Loader2" size={24} className="animate-spin mr-2" /> Загрузка...
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map(stage => {
        const stageDeals = dealsByStage(stage.id);
        const totalAmt = stageDeals.reduce((s, d) => s + (d.amount || 0), 0);
        return (
          <div
            key={stage.id}
            className="flex-shrink-0 w-72 flex flex-col"
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(stage.id)}
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="font-semibold text-sm">{stage.name}</span>
                <Badge variant="secondary" className="text-xs">{stageDeals.length}</Badge>
              </div>
              {totalAmt > 0 && (
                <span className="text-xs text-muted-foreground">{(totalAmt / 1000000).toFixed(1)}М ₽</span>
              )}
            </div>

            <div
              className={`flex-1 min-h-[200px] rounded-2xl p-2 space-y-2 transition ${stage.is_terminal ? 'bg-muted/20' : 'bg-muted/40'}`}
              style={{ borderTop: `3px solid ${stage.color}` }}
            >
              {stageDeals.map(deal => (
                <CrmDealCard
                  key={deal.id}
                  deal={deal}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onClick={onCardClick}
                />
              ))}
              {stageDeals.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-6">Перетащите сделку сюда</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
