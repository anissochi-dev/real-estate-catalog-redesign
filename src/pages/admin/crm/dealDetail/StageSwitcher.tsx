import { Stage } from '../crmKanbanTypes';

interface Props {
  stages: Stage[];
  currentStageId: number;
  onSelectStage: (stageId: number) => void;
}

export default function StageSwitcher({ stages, currentStageId, onSelectStage }: Props) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Перенести в этап</label>
      <div className="flex flex-wrap gap-2 mt-2">
        {stages.map(s => (
          <button
            key={s.id}
            onClick={() => onSelectStage(s.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${s.id === currentStageId ? 'text-white border-transparent' : 'border-border hover:bg-muted'}`}
            style={s.id === currentStageId ? { backgroundColor: s.color, borderColor: s.color } : {}}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
