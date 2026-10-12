import Icon from '@/components/ui/icon';
import { BUSY_TEXT } from './platformFetch';

export default function BusyNotice() {
  return (
    <div className="bg-white rounded-xl border border-border p-6 flex items-center justify-center gap-3 text-sm text-muted-foreground">
      <Icon name="Loader2" size={18} className="animate-spin text-brand-blue" />
      {BUSY_TEXT}
    </div>
  );
}
