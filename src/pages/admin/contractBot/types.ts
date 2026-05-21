import { getToken } from '@/lib/adminApi';

export const H = () => ({ 'Content-Type': 'application/json', 'X-Auth-Token': getToken() });

export const CONTRACT_TYPES = [
  { value: 'lease',       label: 'Договор аренды' },
  { value: 'sale',        label: 'Договор купли-продажи' },
  { value: 'agency',      label: 'Агентский договор' },
  { value: 'service',     label: 'Договор оказания услуг' },
  { value: 'preliminary', label: 'Предварительный договор' },
  { value: 'intent',      label: 'Соглашение о намерениях' },
  { value: 'custom',      label: 'Произвольный договор' },
];

export const DOC_TYPES = [
  { value: 'party1',   label: 'Арендодатель (Сторона 1)' },
  { value: 'party2',   label: 'Арендатор (Сторона 2)' },
  { value: 'template', label: 'Шаблон договора' },
  { value: 'other',    label: 'Прочие документы' },
];

export const ALLOWED = ['png', 'jpg', 'jpeg', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];

export const EXT_ICON: Record<string, string> = {
  pdf: 'FileText', doc: 'FileText', docx: 'FileText',
  xls: 'FileSpreadsheet', xlsx: 'FileSpreadsheet',
  png: 'Image', jpg: 'Image', jpeg: 'Image',
};

export interface Session {
  id: number;
  title: string;
  contract_type: string;
  status: string;
  conditions_text?: string;
  filled_contract?: string;
  result_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Doc {
  id: number;
  doc_type: string;
  file_name: string;
  file_url: string;
  file_ext: string;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const getDocTypeLabel = (v: string) => DOC_TYPES.find(d => d.value === v)?.label || v;
export const getTypeLabel    = (v: string) => CONTRACT_TYPES.find(t => t.value === v)?.label || v;
