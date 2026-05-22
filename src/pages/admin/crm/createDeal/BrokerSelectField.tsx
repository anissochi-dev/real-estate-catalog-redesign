import Icon from '@/components/ui/icon';
import { BrokerOption } from './createDealHooks';

interface Props {
  value: string;
  currentUserId?: number;
  brokers: BrokerOption[];
  onChange: (v: string) => void;
}

export default function BrokerSelectField({ value, currentUserId, brokers, onChange }: Props) {
  return (
    <div>
      <label className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon name="UserCheck" size={11} />
        Брокер сделки
      </label>
      <select
        value={value || (currentUserId ? String(currentUserId) : '')}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-border rounded-xl bg-white text-sm"
      >
        <option value="">— Не назначен —</option>
        {brokers.map(b => (
          <option key={b.id} value={b.id}>
            {b.name} ({b.role === 'admin' ? 'админ' : b.role === 'director' ? 'директор' :
              b.role === 'broker' ? 'брокер' : b.role === 'manager' ? 'менеджер' :
              b.role === 'office_manager' ? 'офис-менеджер' : b.role})
          </option>
        ))}
      </select>
    </div>
  );
}
