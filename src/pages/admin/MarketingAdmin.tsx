import { useState } from 'react';
import Icon from '@/components/ui/icon';
import UtmTab from '@/pages/admin/marketing/UtmTab';
import SocialParserTab from '@/pages/admin/marketing/SocialParserTab';
import MarketingDashboard from '@/pages/admin/marketing/MarketingDashboard';
import PriceAssessmentTab from '@/pages/admin/marketing/PriceAssessmentTab';
import VkAdsTab from '@/pages/admin/marketing/VkAdsTab';
import AdCabinetDashboard from '@/pages/admin/ad-cabinet/AdCabinetDashboard';
import CianCabinetTab from '@/pages/admin/ad-cabinet/CianCabinetTab';
import YandexCallsTab from '@/pages/admin/ad-cabinet/YandexCallsTab';

type Tab = 'ad-cabinet' | 'dashboard' | 'pricing' | 'utm' | 'social' | 'vk-ads';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'ad-cabinet', label: 'Рекламный кабинет', icon: 'Megaphone' },
  { id: 'dashboard', label: 'Пульт',       icon: 'LayoutDashboard' },
  { id: 'pricing',   label: 'Оценка цен',  icon: 'Sparkles' },
  { id: 'utm',       label: 'UTM-ссылки',  icon: 'Link' },
  { id: 'social',    label: 'Соцсети',     icon: 'Share2' },
  { id: 'vk-ads',   label: 'VK Ads',      icon: 'Megaphone' },
];

export default function MarketingAdmin() {
  const [tab, setTab] = useState<Tab>('ad-cabinet');
  const [adPlatform, setAdPlatform] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setAdPlatform(null); }}
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

      {tab === 'ad-cabinet' && (
        adPlatform === 'cian' || adPlatform === 'yandex_realty' ? (
          <div className="space-y-3">
            <button
              onClick={() => setAdPlatform(null)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <Icon name="ArrowLeft" size={14} /> Назад к дашборду
            </button>
            {adPlatform === 'cian' ? <CianCabinetTab /> : <YandexCallsTab />}
          </div>
        ) : (
          <AdCabinetDashboard onOpenPlatform={setAdPlatform} />
        )
      )}
      {tab === 'dashboard' && <MarketingDashboard />}
      {tab === 'pricing'   && <PriceAssessmentTab />}
      {tab === 'utm'       && <UtmTab />}
      {tab === 'social'    && <SocialParserTab />}
      {tab === 'vk-ads'   && <VkAdsTab />}
    </div>
  );
}