import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AdminLayout, { AdminSection } from './admin/AdminLayout';
import Dashboard from './admin/Dashboard';
import ListingsAdmin from './admin/ListingsAdmin';
import LeadsAdmin from './admin/LeadsAdmin';
import UsersAdmin from './admin/UsersAdmin';
import PagesAdmin from './admin/PagesAdmin';
import SettingsAdmin from './admin/SettingsAdmin';
import CrmOwners from './admin/crm/CrmOwners';
import CrmKanban from './admin/crm/CrmKanban';
import CrmGamification from './admin/crm/CrmGamification';
import CrmChecks from './admin/crm/CrmChecks';
import CrmPayments from './admin/crm/CrmPayments';
import PhoneBook from './admin/PhoneBook';
import RolesAdmin from './admin/RolesAdmin';

interface Props {
  onExit: () => void;
}

export default function AdminPage({ onExit }: Props) {
  const { user } = useAuth();
  const [section, setSection] = useState<AdminSection>('dashboard');

  return (
    <AdminLayout section={section} setSection={setSection} onExit={onExit}>
      {section === 'dashboard' && <Dashboard />}
      {section === 'listings' && <ListingsAdmin />}
      {section === 'leads' && <LeadsAdmin />}
      {section === 'users' && <UsersAdmin />}
      {section === 'pages' && <PagesAdmin />}
      {section === 'settings' && <SettingsAdmin />}
      {section === 'crm-owners' && <CrmOwners />}
      {section === 'crm-kanban' && <CrmKanban />}
      {section === 'crm-gamification' && <CrmGamification />}
      {section === 'crm-checks' && <CrmChecks />}
      {section === 'crm-payments' && <CrmPayments />}
      {section === 'phones' && <PhoneBook />}
      {section === 'roles' && <RolesAdmin />}
    </AdminLayout>
  );
}