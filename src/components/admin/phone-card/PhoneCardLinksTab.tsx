import Icon from '@/components/ui/icon';
import { PhoneContact, LISTING_ROLE_LABELS, LEAD_STATUS_LABELS, fmtDt } from './types';

interface Props {
  contact: PhoneContact;
  canUnlink: boolean;
  onUnlink: (type: 'listing' | 'lead', id: number) => void;
  onOpenListing?: (listingId: number) => void;
  onOpenLead?: (leadId: number) => void;
  onClose: () => void;
}

export default function PhoneCardLinksTab({ contact, canUnlink, onUnlink, onOpenListing, onOpenLead, onClose }: Props) {
  return (
    <div className="p-5 space-y-5">
      <div>
        <div className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Icon name="Building2" size={15} />
          Объекты ({contact.linked_listings?.length || 0})
        </div>
        {contact.linked_listings && contact.linked_listings.length > 0 ? (
          <div className="space-y-2">
            {contact.linked_listings.map(l => (
              <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                {l.image && <img src={l.image} alt="" className="w-10 h-10 rounded object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {LISTING_ROLE_LABELS[l.role] || l.role} · {l.status === 'active' ? 'Активен' : 'Архив'}
                  </div>
                </div>
                {onOpenListing && (
                  <button onClick={() => { onOpenListing(l.id); onClose(); }}
                    className="text-brand-blue hover:opacity-70 p-1 shrink-0" title="Открыть объект">
                    <Icon name="ExternalLink" size={14} />
                  </button>
                )}
                {canUnlink && (
                  <button onClick={() => onUnlink('listing', l.id)}
                    className="text-red-500 hover:text-red-700 p-1 shrink-0" title="Отвязать">
                    <Icon name="Unlink" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Не привязан к объектам</div>
        )}
      </div>

      <div>
        <div className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Icon name="Inbox" size={15} />
          Лиды ({contact.linked_leads?.length || 0})
        </div>
        {contact.linked_leads && contact.linked_leads.length > 0 ? (
          <div className="space-y-2">
            {contact.linked_leads.map(l => (
              <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {LEAD_STATUS_LABELS[l.status] || l.status} · {fmtDt(l.created_at)}
                  </div>
                </div>
                {onOpenLead && (
                  <button onClick={() => { onOpenLead(l.id); onClose(); }}
                    className="text-brand-blue hover:opacity-70 p-1 shrink-0" title="Открыть лид">
                    <Icon name="ExternalLink" size={14} />
                  </button>
                )}
                {canUnlink && (
                  <button onClick={() => onUnlink('lead', l.id)}
                    className="text-red-500 hover:text-red-700 p-1 shrink-0" title="Отвязать">
                    <Icon name="Unlink" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Нет привязанных лидов</div>
        )}
      </div>
    </div>
  );
}
