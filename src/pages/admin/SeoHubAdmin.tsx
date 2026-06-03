import { useState } from 'react';
import Icon from '@/components/ui/icon';
import PagesAdmin from './PagesAdmin';
import SeoAdmin from './SeoAdmin';
import SeoSiteTab from './seo/SeoSiteTab';
import SeoTechnicalTab from './seo/SeoTechnicalTab';
import SeoAuditTab from './seo/SeoAuditTab';

type HubTab = 'site' | 'listings' | 'pages' | 'technical' | 'audit';

const TABS: { id: HubTab; label: string; icon: string; desc: string }[] = [
  { id: 'site',      label: 'Сайт',        icon: 'Globe',       desc: 'Мета-теги, описание, ключевые слова' },
  { id: 'listings',  label: 'Объекты',     icon: 'Zap',         desc: 'ИИ-генерация, расписание, покрытие' },
  { id: 'pages',     label: 'Страницы',    icon: 'FileText',    desc: 'CMS-страницы и мета для разделов' },
  { id: 'technical', label: 'Технические', icon: 'FileCode2',   desc: 'Robots.txt, Sitemap, счётчики' },
  { id: 'audit',     label: 'Аудит',       icon: 'ShieldCheck', desc: 'SEO-здоровье сайта и проблемные объекты' },
];

export default function SeoHubAdmin() {
  const [tab, setTab] = useState<HubTab>('site');

  return (
    <div className="max-w-4xl space-y-4">
      {/* Шапка */}
      <div>
        <h1 className="font-display font-700 text-2xl flex items-center gap-2">
          <Icon name="TrendingUp" size={22} className="text-brand-blue" />
          SEO
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Всё для поискового продвижения в одном месте.
        </p>
      </div>

      {/* Вкладки */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl border p-3 text-left transition ${
              tab === t.id
                ? 'border-brand-blue bg-brand-blue/5 text-brand-blue'
                : 'border-border bg-white hover:border-brand-blue/40 text-foreground'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon name={t.icon} size={16} />
              <span className="font-semibold text-sm">{t.label}</span>
            </div>
            <div className="text-xs text-muted-foreground leading-tight">{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Контент */}
      {tab === 'site'      && <SeoSiteTab />}
      {tab === 'listings'  && <SeoAdmin />}
      {tab === 'pages'     && <PagesAdmin />}
      {tab === 'technical' && <SeoTechnicalTab />}
      {tab === 'audit'     && <SeoAuditTab />}
    </div>
  );
}
