import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';

interface DistrictStatsBarProps {
  placeTitle: string;
  displayName: string;
  itemsCount: number;
}

export default function DistrictStatsBar({ placeTitle, displayName, itemsCount }: DistrictStatsBarProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-white border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm text-muted-foreground">
          <h3 className="inline font-semibold text-foreground">{placeTitle}</h3>
          {' '}— найдено <span className="font-semibold text-foreground">{itemsCount}</span> объектов
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/catalog?search=${encodeURIComponent(displayName)}`)}
            className="text-xs text-brand-blue font-semibold flex items-center gap-1 hover:underline"
          >
            <Icon name="SlidersHorizontal" size={13} />
            Фильтры
          </button>
          <button
            onClick={() => navigate('/catalog')}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Icon name="LayoutGrid" size={13} />
            Все районы
          </button>
        </div>
      </div>
    </div>
  );
}
