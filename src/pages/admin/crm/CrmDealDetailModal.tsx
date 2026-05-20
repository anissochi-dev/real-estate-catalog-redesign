import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/ui/icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Stage, ACTIVITY_ICONS } from './crmKanbanTypes';

interface Activity {
  id: number;
  type: string;
  content?: string;
  user_name?: string;
  created_at?: string;
}

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
}

export default function CrmDealDetailModal({
  detailId, onOpenChange,
  dealDetail, stages,
  newActivity, setNewActivity,
  activityType, setActivityType,
  onMoveStage, onAddActivity,
  addActivityPending,
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
              <div className="grid grid-cols-2 gap-3 text-sm">
                {dealDetail.owner_name && <div><span className="text-muted-foreground">Собственник:</span> <strong>{dealDetail.owner_name}</strong></div>}
                {dealDetail.assignee_name && <div><span className="text-muted-foreground">Ответственный:</span> {dealDetail.assignee_name}</div>}
                {dealDetail.amount && <div><span className="text-muted-foreground">Сумма:</span> <strong>{Number(dealDetail.amount).toLocaleString('ru')} ₽</strong></div>}
                {dealDetail.commission && <div><span className="text-muted-foreground">Комиссия:</span> <strong className="text-green-600">{Number(dealDetail.commission).toLocaleString('ru')} ₽</strong></div>}
                {dealDetail.source && <div><span className="text-muted-foreground">Источник:</span> {dealDetail.source}</div>}
              </div>
              {dealDetail.notes && <div className="bg-muted/40 rounded-xl p-3 text-sm">{dealDetail.notes}</div>}

              {/* Смена этапа */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Перенести в этап</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {stages.map(s => (
                    <button
                      key={s.id}
                      onClick={() => {
                        onMoveStage(dealDetail.id, s.id);
                        qc.invalidateQueries({ queryKey: ['crm-deal', detailId] });
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${s.id === dealDetail.stage_id ? 'text-white border-transparent' : 'border-border hover:bg-muted'}`}
                      style={s.id === dealDetail.stage_id ? { backgroundColor: s.color, borderColor: s.color } : {}}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Активности */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Лента активностей</label>
                <div className="flex gap-2 mt-2">
                  <select
                    value={activityType}
                    onChange={e => setActivityType(e.target.value)}
                    className="border border-border rounded-xl px-2 py-2 text-sm focus:outline-none"
                  >
                    <option value="note">Заметка</option>
                    <option value="call">Звонок</option>
                    <option value="email">Письмо</option>
                    <option value="meeting">Встреча</option>
                  </select>
                  <Input
                    value={newActivity}
                    onChange={e => setNewActivity(e.target.value)}
                    placeholder="Что произошло..."
                    className="flex-1"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newActivity.trim() && detailId) {
                        onAddActivity(detailId, activityType, newActivity);
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="bg-brand-blue text-white"
                    disabled={!newActivity.trim() || addActivityPending}
                    onClick={() => detailId && onAddActivity(detailId, activityType, newActivity)}
                  >
                    <Icon name="Send" size={14} />
                  </Button>
                </div>

                <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                  {dealDetail.activities?.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">Активностей пока нет</div>
                  )}
                  {dealDetail.activities?.map((a: Activity) => (
                    <div key={a.id} className="flex gap-2.5 text-sm">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon name={ACTIVITY_ICONS[a.type] || 'FileText'} size={13} />
                      </div>
                      <div className="flex-1">
                        <div>{a.content}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.user_name} · {a.created_at ? new Date(a.created_at).toLocaleString('ru', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
