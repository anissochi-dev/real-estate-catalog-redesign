import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import { Stage } from './crmKanbanTypes';
import DealHeaderInfo from './dealDetail/DealHeaderInfo';
import StageSwitcher from './dealDetail/StageSwitcher';
import ActivityFeed, { Activity } from './dealDetail/ActivityFeed';

interface DealDetail {
  id: number;
  title: string;
  stage_id: number;
  stage_name: string;
  stage_color: string;
  owner_name?: string;
  assignee_name?: string;
  amount?: number;
  commission?: number;
  source?: string;
  notes?: string;
  activities?: Activity[];
}

interface Props {
  detailId: number | null;
  onOpenChange: (open: boolean) => void;
  dealDetail: DealDetail | undefined;
  stages: Stage[];
  newActivity: string;
  setNewActivity: (v: string) => void;
  activityType: string;
  setActivityType: (v: string) => void;
  onMoveStage: (dealId: number, stageId: number) => void;
  onAddActivity: (dealId: number, type: string, content: string) => void;
  addActivityPending: boolean;
  onEdit?: () => void;
}

export default function CrmDealDetailModal({
  detailId, onOpenChange,
  dealDetail, stages,
  newActivity, setNewActivity,
  activityType, setActivityType,
  onMoveStage, onAddActivity,
  addActivityPending,
  onEdit,
}: Props) {
  const qc = useQueryClient();

  return (
    <Dialog open={!!detailId} onOpenChange={open => { if (!open) onOpenChange(false); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {dealDetail && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {dealDetail.title}
                <span className="text-sm font-normal px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: dealDetail.stage_color }}>
                  {dealDetail.stage_name}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {onEdit && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onEdit}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Icon name="Pencil" size={14} /> Редактировать
                  </Button>
                </div>
              )}
              <DealHeaderInfo dealDetail={dealDetail} />

              {/* Смена этапа */}
              <StageSwitcher
                stages={stages}
                currentStageId={dealDetail.stage_id}
                onSelectStage={stageId => {
                  onMoveStage(dealDetail.id, stageId);
                  qc.invalidateQueries({ queryKey: ['crm-deal', detailId] });
                }}
              />

              {/* Активности */}
              <ActivityFeed
                detailId={detailId}
                activities={dealDetail.activities}
                newActivity={newActivity}
                setNewActivity={setNewActivity}
                activityType={activityType}
                setActivityType={setActivityType}
                onAddActivity={onAddActivity}
                addActivityPending={addActivityPending}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}