import { useState } from 'react';
import Icon from '@/components/ui/icon';
import UtmTab from '@/pages/admin/marketing/UtmTab';
import SocialParserTab from '@/pages/admin/marketing/SocialParserTab';
import MarketingDashboard from '@/pages/admin/marketing/MarketingDashboard';
import PriceAssessmentTab from '@/pages/admin/marketing/PriceAssessmentTab';

type Tab = 'dashboard' | 'pricing' | 'utm' | 'social';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Пульт',       icon: 'LayoutDashboard' },
  { id: 'pricing',   label: 'Оценка цен',  icon: 'Sparkles' },
  { id: 'utm',       label: 'UTM-ссылки',  icon: 'Link' },
  { id: 'social',    label: 'Соцсети',     icon: 'Share2' },
];

export default function MarketingAdmin() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex-shrink-0 ${
              tab === t.id
                ? 'bg-brand-blue text-white shadow-sm'
                : 'bg-white border border-border text-foreground/70 hover:bg-muted/50'
            }`}>
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <MarketingDashboard />}
      {tab === 'pricing'   && <PriceAssessmentTab />}
      {tab === 'utm'       && <UtmTab />}
      {tab === 'social'    && <SocialParserTab />}
    </div>
  );
}
