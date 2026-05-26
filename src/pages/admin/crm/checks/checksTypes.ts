export interface ZachestnyData {
  _type?: string;
  inn?: string;
  ogrn?: string;
  name?: string;
  status?: string;
  address?: string;
  okved?: string;
  okved_name?: string;
  reg_date?: string;
  liquidation_date?: string;
  employees?: string | number;
  capital?: string | number;
  tax_system?: string;
  risk_score?: string | number;
  director?: string;
  director_post?: string;
  error?: string;
}

export type CheckResult = { data?: unknown; error?: string; from_cache?: boolean };

export const SOURCE_INFO: Record<string, { label: string; color: string; desc: string }> = {
  zachestny: { label: 'ЧестныйБизнес', color: 'bg-green-100 text-green-700', desc: 'Компании и ИП' },
  newdb: { label: 'NewDB', color: 'bg-blue-100 text-blue-700', desc: 'Физлица и телефоны' },
  bezopasno: { label: 'Безопасно.org', color: 'bg-purple-100 text-purple-700', desc: 'Комплексная проверка' },
};

export const CHECK_TYPES = [
  { id: 'company', label: 'Компания', placeholder: 'ИНН или название компании', icon: 'Building2' },
  { id: 'owner', label: 'Собственник', placeholder: 'ФИО или телефон', icon: 'User' },
  { id: 'property', label: 'Недвижимость', placeholder: 'Кадастровый номер или адрес', icon: 'MapPin' },
];
