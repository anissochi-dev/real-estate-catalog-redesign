import { useState } from 'react';
import Icon from '@/components/ui/icon';
import SeoAuditTab from '@/pages/admin/seo/SeoAuditTab';
import SeoTechnicalTab from '@/pages/admin/seo/SeoTechnicalTab';
import PriceMarketTab from '@/pages/admin/marketing/PriceMarketTab';
import AnalyticsTab from '@/pages/admin/marketing/AnalyticsTab';
import PricingTab from '@/pages/admin/marketing/PricingTab';
import UtmTab from '@/pages/admin/marketing/UtmTab';
import SmartBudgetTab from '@/pages/admin/marketing/SmartBudgetTab';

type Tab = 'analytics' | 'pricing' | 'market-prices' | 'seo-audit' | 'seo-tech' | 'utm' | 'smart-budget';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'smart-budget',  label: 'Умный бюджет',      icon: 'Wallet' },
  { id: 'analytics',     label: 'Аналитика',         icon: 'BarChart3' },
  { id: 'pricing',       label: 'Ценообразование',    icon: 'Sparkles' },
  { id: 'market-prices', label: 'Рынок цен',          icon: 'TrendingUp' },
  { id: 'seo-audit',     label: 'SEO-аудит',          icon: 'ShieldCheck' },
  { id: 'seo-tech',      label: 'Технический SEO',    icon: 'FileCode2' },
  { id: 'utm',           label: 'UTM-ссылки',         icon: 'Link' },
];

export default function MarketingAdmin() {
  const [tab, setTab] = useState<Tab>('analytics');

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
          <Icon name="Megaphone" size={20} className="text-brand-blue" />
        </div>
        <div>
          <h2 className="text-lg font-bold leading-none">Маркетолог</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Аналитика, ценообразование, SEO и UTM-ссылки</p>
        </div>
      </div>

      {/* Вкладки */}
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

      {/* Контент */}
      {tab === 'smart-budget'  && <SmartBudgetTab />}
      {tab === 'analytics'     && <AnalyticsTab />}
      {tab === 'pricing'       && <PricingTab />}
      {tab === 'market-prices' && <PriceMarketTab />}
      {tab === 'seo-audit'     && <SeoAuditTab />}
      {tab === 'seo-tech'      && <SeoTechnicalTab />}
      {tab === 'utm'           && <UtmTab />}
    </div>
  );
}