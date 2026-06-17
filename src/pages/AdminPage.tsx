import { useState, useEffect } from 'react';
import AdminLayout, { AdminSection } from './admin/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import Dashboard from './admin/Dashboard';
import ListingsAdmin from './admin/ListingsAdmin';
import LeadsAdmin from './admin/LeadsAdmin';
import UsersAdmin from './admin/UsersAdmin';
import SettingsAdmin from './admin/SettingsAdmin';
import CrmOwners from './admin/crm/CrmOwners';
import CrmKanban from './admin/crm/CrmKanban';
import CrmGamification from './admin/crm/CrmGamification';
import CrmChecks from './admin/crm/CrmChecks';
import CrmPayments from './admin/crm/CrmPayments';
import PhoneBook from './admin/PhoneBook';
import NetworkTenantsAdmin from './admin/NetworkTenantsAdmin';
import NewsAdmin from './admin/NewsAdmin';
import VBKnowledgeAdmin from './admin/VBKnowledgeAdmin';
import SeoHubAdmin from './admin/SeoHubAdmin';
import DistrictsAdmin from './admin/DistrictsAdmin';
import MarketingAdmin from './admin/MarketingAdmin';


interface Props {
  onExit: () => void;
  initialSection?: string;
}

const SECTION_KEY = 'biznest_admin_section';

export default function AdminPage({ onExit, initialSection }: Props) {
  const { user } = useAuth();
  const [section, setSection] = useState<AdminSection>(() => {
    if (initialSection) return initialSection as AdminSection;
    try { return (localStorage.getItem(SECTION_KEY) as AdminSection) || 'dashboard'; } catch { return 'dashboard'; }
  });

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

  // Переключение на Объекты из любого раздела (например из SEO-аудита)
  useEffect(() => {
    const handler = () => setSection('listings');
    window.addEventListener('admin:open-listing', handler);
    return () => window.removeEventListener('admin:open-listing', handler);
  }, []);

  return (
    <AdminLayout section={section} setSection={setSection} onExit={onExit}>
      {section === 'dashboard' && <Dashboard setSection={(s) => setSection(s as AdminSection)} />}
      {section === 'listings' && <ListingsAdmin />}
      {section === 'leads' && <LeadsAdmin />}
      {section === 'users' && <UsersAdmin />}
      {section === 'settings' && <SettingsAdmin />}
      {section === 'districts' && <DistrictsAdmin />}
      {section === 'crm-owners' && <CrmOwners />}
      {section === 'crm-kanban' && <CrmKanban />}
      {section === 'crm-gamification' && <CrmGamification />}
      {section === 'crm-checks' && <CrmChecks />}
      {section === 'crm-payments' && <CrmPayments />}
      {section === 'phones' && <PhoneBook />}
      {section === 'network-tenants' && <NetworkTenantsAdmin />}
      {section === 'news' && <NewsAdmin />}
      {section === 'seo' && <SeoHubAdmin />}
      {section === 'vb-knowledge' && <VBKnowledgeAdmin />}
      {section === 'marketing' && <MarketingAdmin />}

    </AdminLayout>
  );
}