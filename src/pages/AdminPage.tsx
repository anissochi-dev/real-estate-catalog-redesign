import { useState, useEffect } from 'react';
import AdminLayout, { AdminSection } from './admin/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import Dashboard from './admin/Dashboard';
import ListingsAdmin from './admin/ListingsAdmin';
import LeadsAdmin from './admin/LeadsAdmin';
import SettingsAdmin from './admin/SettingsAdmin';
import CrmOwners from './admin/crm/CrmOwners';
import CrmKanban from './admin/crm/CrmKanban';
import CrmGamification from './admin/crm/CrmGamification';
import CrmChecks from './admin/crm/CrmChecks';
import CrmPayments from './admin/crm/CrmPayments';
import NetworkTenantsAdmin from './admin/NetworkTenantsAdmin';
import NewsAdmin from './admin/NewsAdmin';
import MarketingAdmin from './admin/MarketingAdmin';
import TrainingCenter from './admin/TrainingCenter';

interface Props {
  onExit: () => void;
  onExitToPath: (path: string) => void;
  initialSection?: string;
}

const SECTION_KEY = 'biznest_admin_section';

export default function AdminPage({ onExit, onExitToPath, initialSection }: Props) {
  const { user } = useAuth();
  const [section, setSection] = useState<AdminSection>(() => {
    if (initialSection) return initialSection as AdminSection;
    try { return (localStorage.getItem(SECTION_KEY) as AdminSection) || 'dashboard'; } catch { return 'dashboard'; }
  });
  // ID карточки, которую нужно открыть при переходе из другого раздела (например
  // из подбора совпадений в заявках/объектах, из SEO-аудита). Храним здесь, а не в
  // самом разделе, потому что при переключении вкладки старый раздел размонтируется
  // и не может «услышать» событие, отправленное после переключения.
  const [openListingId, setOpenListingId] = useState<number | null>(null);
  const [openLeadId, setOpenLeadId] = useState<number | null>(null);

  // Брокер всегда стартует на Объектах (user приходит асинхронно)
  useEffect(() => {
    if (user?.role === 'broker') {
      const saved = localStorage.getItem(SECTION_KEY) as AdminSection;
      // Если сохранена секция недоступная брокеру — сбрасываем на listings
      const brokerAllowed: AdminSection[] = ['dashboard', 'listings', 'leads', 'crm-gamification', 'crm-checks'];
      if (!saved || !brokerAllowed.includes(saved)) {
        setSection('listings');
      }
    }
  }, [user?.role]);

  useEffect(() => {
    try { localStorage.setItem(SECTION_KEY, section); } catch { /* ignore */ }
  }, [section]);

  // Переключение на Объекты + открытие конкретной карточки (например из подбора
  // совпадений в заявках, из SEO-аудита) — id храним тут же, чтобы раздел получил
  // его сразу при монтировании, а не через событие, которое некому слушать.
  useEffect(() => {
    const handler = (e: Event) => {
      setSection('listings');
      setOpenListingId((e as CustomEvent<number>).detail ?? null);
    };
    window.addEventListener('admin:open-listing', handler);
    return () => window.removeEventListener('admin:open-listing', handler);
  }, []);

  // Переключение на Заявки + открытие конкретной заявки (например из подбора совпадений)
  useEffect(() => {
    const handler = (e: Event) => {
      setSection('leads');
      setOpenLeadId((e as CustomEvent<number>).detail ?? null);
    };
    window.addEventListener('admin:open-lead', handler);
    return () => window.removeEventListener('admin:open-lead', handler);
  }, []);

  return (
    <AdminLayout section={section} setSection={setSection} onExit={onExit} onExitToPath={onExitToPath}>
      {section === 'dashboard' && <Dashboard setSection={(s) => setSection(s as AdminSection)} />}
      {section === 'listings' && (
        <ListingsAdmin
          openListingId={openListingId}
          onOpenListingHandled={() => setOpenListingId(null)}
        />
      )}
      {section === 'leads' && (
        <LeadsAdmin
          openLeadId={openLeadId}
          onOpenLeadHandled={() => setOpenLeadId(null)}
        />
      )}
      {section === 'settings' && <SettingsAdmin />}
      {section === 'crm-owners' && <CrmOwners />}
      {section === 'crm-kanban' && <CrmKanban />}
      {section === 'crm-gamification' && <CrmGamification />}
      {section === 'crm-checks' && <CrmChecks />}
      {section === 'crm-payments' && <CrmPayments />}
      {section === 'network-tenants' && <NetworkTenantsAdmin />}
      {section === 'news' && <NewsAdmin />}
      {section === 'marketing' && <MarketingAdmin />}
      {section === 'training' && <TrainingCenter />}

    </AdminLayout>
  );
}