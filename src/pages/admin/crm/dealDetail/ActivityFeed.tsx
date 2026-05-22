import Icon from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ACTIVITY_ICONS } from '../crmKanbanTypes';

export interface Activity {
  id: number;
  type: string;
  content?: string;
  user_name?: string;
  created_at?: string;
}

interface Props {
  detailId: number | null;
  activities?: Activity[];
  newActivity: string;
  setNewActivity: (v: string) => void;
  activityType: string;
  setActivityType: (v: string) => void;
  onAddActivity: (dealId: number, type: string, content: string) => void;
  addActivityPending: boolean;
}

export default function ActivityFeed({
  detailId, activities,
  newActivity, setNewActivity,
  activityType, setActivityType,
  onAddActivity, addActivityPending,
}: Props) {
  return (
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
        {activities?.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">Активностей пока нет</div>
        )}
        {activities?.map((a: Activity) => (
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
  );
}
