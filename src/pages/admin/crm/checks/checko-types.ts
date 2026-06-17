export interface Risk { label: string; level: 'danger' | 'warning' }
export interface Founder {
  наименование: string; тип?: string;
  доля_руб?: string | number; доля_пct?: string | number;
  огрн?: string; инн?: string; с?: string;
}
export interface DirectorEntry {
  фио: string; должность: string; инн?: string;
  с?: string; по?: string; массовый?: boolean; дисквалифицирован?: boolean;
}
export interface OkvedItem { код: string; наименование: string; основной: boolean }
export interface License { вид: string; номер: string; с: string }
export interface FinanceYear {
  год: string;
  выручка: string | number; прибыль: string | number;
  активы: string | number; капитал: string | number;
}
export interface Trademark { наименование: string; дата_рег: string }
export interface TaxPayment { наименование: string; сумма: number }

export interface CheckoData {
  инн?: string; огрн?: string; кпп?: string; огрнип?: string; окпо?: string;
  наименование?: string; наименование_полное?: string; наименование_англ?: string;
  опф?: string; тип?: string;
  статус?: string; статус_код?: string; действующее?: boolean; ликвидировано?: boolean;
  дата_регистрации?: string; дата_ликвидации?: string;
  адрес?: string;
  оквэд_основной?: string; оквэд_наим?: string; оквэд_список?: OkvedItem[];
  директор_фио?: string; директор_должность?: string; директор_инн?: string;
  директор_массовый?: boolean;
  директора_история?: DirectorEntry[];
  учредители?: Founder[];
  телефоны?: string[]; email?: string[]; сайты?: string[];
  сотрудников?: string | number; сотрудников_год?: string;
  уст_капитал?: string | number;
  лицензии?: License[];
  налог_режим?: string[];
  налог_уплачено?: TaxPayment[];
  мсп_категория?: string; мсп_дата?: string;
  товарные_знаки?: Trademark[];
  финансы?: FinanceYear[];
  риски?: Risk[];
  санкции_нет?: boolean; санкции_связи_нет?: boolean;
  запросов_сегодня?: number; запросов_остаток?: number | null;
  error?: string;
  name?: string; name_full?: string; inn?: string; ogrn?: string;
  status?: string; is_active?: boolean; is_liquidated?: boolean;
  address?: string; risks?: Risk[];
}

export const fmtMoney = (n: string | number | undefined | null): string | null => {
  if (n === '' || n === null || n === undefined) return null;
  const num = Number(n);
  if (isNaN(num) || num === 0) return null;
  const abs = Math.abs(num);
  const sign = num < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)} млрд ₽`;
  if (abs >= 1_000_000)     return `${sign}${(abs / 1_000_000).toFixed(1)} млн ₽`;
  if (abs >= 1_000)         return `${sign}${(abs / 1_000).toFixed(0)} тыс ₽`;
  return `${sign}${abs.toLocaleString('ru')} ₽`;
};

export const fmtDate = (s: string | undefined | null): string | null => {
  if (!s) return null;
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return s; }
};
