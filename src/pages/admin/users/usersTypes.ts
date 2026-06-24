import { Role } from '@/lib/adminApi';

export type { Role };

export interface U {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  avatar: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export const ROLES: { id: Role; label: string }[] = [
  { id: 'admin', label: 'Администратор' },
  { id: 'editor', label: 'Редактор' },
  { id: 'manager', label: 'Менеджер' },
  { id: 'broker', label: 'Брокер' },
  { id: 'office_manager', label: 'Офис-менеджер' },
  { id: 'director', label: 'Директор' },
  { id: 'client', label: 'Клиент' },
];

export const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-violet-100 text-violet-700',
  director: 'bg-blue-100 text-blue-700',
  editor: 'bg-sky-100 text-sky-700',
  manager: 'bg-emerald-100 text-emerald-700',
  broker: 'bg-amber-100 text-amber-700',
  office_manager: 'bg-orange-100 text-orange-700',
  client: 'bg-slate-100 text-slate-600',
};

export function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
