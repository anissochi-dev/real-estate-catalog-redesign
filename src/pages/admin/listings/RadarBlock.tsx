import Icon from '@/components/ui/icon';

export default function RadarBlock({ icon, title, children, className = '' }: {
  icon: string; title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-border p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon name={icon} size={15} className="text-brand-blue" />
        <span className="font-semibold text-sm">{title}</span>
      </div>
      {children}
    </div>
  );
}
