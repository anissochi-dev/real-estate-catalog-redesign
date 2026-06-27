import type { ListingDetail, Agent } from '@/lib/api';
import Icon from '@/components/ui/icon';
import { DEAL_LABELS } from './propertyLabels';
import { fmtListingId } from '@/lib/formatPrice';

interface Props {
  item: ListingDetail;
  agents: Agent[];
}

export default function PropertySidebar({ item, agents }: Props) {
  return (
    <div className="space-y-4">
      {/* Цена */}
      <div className="bg-white rounded-2xl shadow-sm sticky top-20 overflow-hidden">
        <div className="p-5 pb-4">
          <div className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
            {DEAL_LABELS[item.deal] || item.deal}
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <div className="font-display font-900 text-3xl text-brand-blue leading-none tracking-tight">
              {item.price.toLocaleString('ru')} ₽{item.deal === 'rent' ? '/мес' : ''}
            </div>
            {item.pricePerM2 ? (
              <div className="flex items-center gap-1 shrink-0">
                <Icon name="Scaling" size={12} className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground whitespace-nowrap">{item.pricePerM2.toLocaleString('ru')} ₽/м²</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="px-5 py-2.5 bg-muted/40 border-t border-border flex items-center gap-2">
          <Icon name="Hash" size={12} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">ID объекта:</span>
          <span className="text-xs font-mono font-semibold text-foreground">#{fmtListingId(item.id)}</span>
        </div>
      </div>

      {/* Карточка агента */}
      {agents.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm sticky top-20">
          <div className="text-[10px] text-muted-foreground mb-3 uppercase tracking-widest font-semibold">Представитель собственника</div>
          {agents.slice(0, 1).map(agent => (
            <div key={agent.id}>
              {agent.phone && (
                <a href={`tel:${agent.phone}`}
                  className="inline-flex items-center gap-2 text-lg font-bold text-brand-blue hover:underline">
                  <Icon name="Phone" size={18} />
                  {agent.phone}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}