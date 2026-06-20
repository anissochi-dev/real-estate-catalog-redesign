export interface DadataFinance {
  year?: string | number;
  income?: string | number;
  expense?: string | number;
  profit?: string | number;
  debt?: string | number;
  penalty?: string | number;
}

export interface DadataFounder {
  name?: string;
  share?: string;
  inn?: string;
}

export interface DadataLicense {
  activity?: string;
  series?: string;
  num?: string;
  date?: string;
  date_end?: string;
  authority?: string;
  status?: string;
}

export interface DadataData {
  _type?: string;
  _source?: 'dadata';
  inn?: string;
  ogrn?: string;
  kpp?: string;
  name?: string;
  name_full?: string;
  opf?: string;
  status?: string;
  status_code?: string;
  address?: string;
  address_postal?: string;
  address_region?: string;
  reg_date?: string;
  liquidation_date?: string;
  okved?: string;
  okved_name?: string;
  employees?: string | number;
  ustavcap?: string | number;
  tax_system?: string;
  director?: string;
  director_post?: string;
  branch_type?: string;
  branch_count?: string | number;
  phones?: string[];
  emails?: string[];
  founders?: DadataFounder[];
  licenses?: DadataLicense[];
  finance?: DadataFinance | null;
  is_liquidated?: boolean;
  is_active?: boolean;
  error?: string;
}

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
  zachestny: { label: 'ЧестныйБизнес', color: 'bg-green-100 text-green-700',   desc: 'Компании и ИП' },
  newdb:     { label: 'NewDB',          color: 'bg-blue-100 text-blue-700',     desc: 'Физлица и телефоны' },
  bezopasno: { label: 'Безопасно.org', color: 'bg-purple-100 text-purple-700', desc: 'Комплексная проверка' },
  dadata:    { label: 'DaData',         color: 'bg-sky-100 text-sky-700',       desc: 'ФНС / реестр компаний' },
  checko:    { label: 'Checko',         color: 'bg-indigo-100 text-indigo-700', desc: 'ЕГРЮЛ / риски / финансы' },
  egrn:      { label: 'ЕГРН',           color: 'bg-orange-100 text-orange-700', desc: 'Кадастровые данные' },
};

export const CHECK_TYPES = [
  { id: 'company', label: 'Компания', placeholder: 'ИНН или название компании', icon: 'Building2' },
  { id: 'owner', label: 'Собственник', placeholder: 'ФИО или телефон', icon: 'User' },
  { id: 'property', label: 'Недвижимость', placeholder: 'Кадастровый номер или адрес', icon: 'MapPin' },
];