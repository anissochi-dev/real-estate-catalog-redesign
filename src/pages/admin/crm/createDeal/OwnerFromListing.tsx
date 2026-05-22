import Icon from '@/components/ui/icon';

interface Props {
  ownerFromListing: { name: string; phone: string } | null;
}

export default function OwnerFromListing({ ownerFromListing }: Props) {
  return (
    <div className="bg-muted/40 border border-border rounded-xl px-3 py-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
        <Icon name="User" size={10} />
        Собственник <span className="text-muted-foreground/70 normal-case tracking-normal">(из объекта)</span>
      </div>
      {ownerFromListing ? (
        <div className="text-sm">
          <span className="font-medium">{ownerFromListing.name || 'Без имени'}</span>
          {ownerFromListing.phone && (
            <span className="text-muted-foreground ml-2">{ownerFromListing.phone}</span>
          )}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Данные подтянутся после загрузки объекта</div>
      )}
    </div>
  );
}
