import Icon from '@/components/ui/icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Listing } from './types';
import { useSocialPostDialog } from './useSocialPostDialog';
import SocialPostPicturePanel from './SocialPostPicturePanel';
import SocialPostTextPanel from './SocialPostTextPanel';
import SocialPostActions from './SocialPostActions';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listing: Partial<Listing>;
}

export default function SocialPostDialog({ open, onOpenChange, listing }: Props) {
  const s = useSocialPostDialog(open, listing);
  const { isMobile } = s;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onClick={e => e.stopPropagation()}
        className="p-0 gap-0 flex flex-col overflow-hidden left-0 top-0 translate-x-0 translate-y-0 w-full max-w-none h-[100dvh] rounded-none border-0
          sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:h-auto sm:max-h-[92vh] sm:max-w-xl md:max-w-4xl sm:rounded-2xl sm:border"
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b border-border shrink-0 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base sm:text-lg">
            <Icon name="Megaphone" size={18} className="text-brand-blue shrink-0" />
            <span className="truncate">Пост для соцсетей · №{listing.id}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4">
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            <SocialPostPicturePanel s={s} listing={listing} />
            <div className="space-y-3 min-w-0">
              <SocialPostTextPanel s={s} />
              {!isMobile && <SocialPostActions s={s} variant="desktop" />}
            </div>
          </div>
        </div>

        {isMobile && (
          <div className="shrink-0 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
            <SocialPostActions s={s} variant="mobile" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
