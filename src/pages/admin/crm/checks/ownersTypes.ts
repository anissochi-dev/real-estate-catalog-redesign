export interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  type?: 'text' | 'date';
}

export interface MethodMeta {
  id: string;
  label: string;
  desc: string;
  icon: string;
  fields: FieldDef[];
  risk: 'high' | 'medium' | 'low';
}

export const METHODS: MethodMeta[] = [
  {
    id: 'complex_by_passport',
    label: 'Комплексная проверка',
    desc: 'МВД + ФНС + ФССП по паспорту — самый полный вариант',
    icon: 'ShieldCheck',
    risk: 'high',
    fields: [
      { key: 'lastname',   label: 'Фамилия',        placeholder: 'Иванов',      required: true },
      { key: 'firstname',  label: 'Имя',             placeholder: 'Иван',        required: true },
      { key: 'secondname', label: 'Отчество',        placeholder: 'Иванович',    required: false },
      { key: 'dob',        label: 'Дата рождения',   placeholder: '1990-01-01',  required: true, type: 'date' },
      { key: 'seria',      label: 'Серия паспорта',  placeholder: '1234',        required: true },
      { key: 'number',     label: 'Номер паспорта',  placeholder: '567890',      required: true },
    ],
  },
  {
    id: 'fssp_person',
    label: 'Долги ФССП',
    desc: 'Исполнительные производства — долги, взыскания',
    icon: 'Gavel',
    risk: 'high',
    fields: [
      { key: 'lastname',   label: 'Фамилия',      placeholder: 'Иванов',     required: true },
      { key: 'firstname',  label: 'Имя',           placeholder: 'Иван',       required: true },
      { key: 'secondname', label: 'Отчество',      placeholder: 'Иванович',   required: false },
      { key: 'dob',        label: 'Дата рождения', placeholder: '1990-01-01', required: true, type: 'date' },
    ],
  },
  {
    id: 'passport_mvd',
    label: 'Паспорт (МВД)',
    desc: 'Действительность паспорта РФ по базе МВД',
    icon: 'CreditCard',
    risk: 'medium',
    fields: [
      { key: 'lastname',   label: 'Фамилия',        placeholder: 'Иванов',   required: true },
      { key: 'firstname',  label: 'Имя',             placeholder: 'Иван',     required: true },
      { key: 'secondname', label: 'Отчество',        placeholder: 'Иванович', required: false },
      { key: 'seria',      label: 'Серия паспорта',  placeholder: '1234',     required: true },
      { key: 'number',     label: 'Номер паспорта',  placeholder: '567890',   required: true },
    ],
  },
  {
    id: 'passport_fns',
    label: 'Паспорт + ИНН (ФНС)',
    desc: 'Поиск ИНН физлица и верификация паспорта через ФНС',
    icon: 'FileSearch',
    risk: 'medium',
    fields: [
      { key: 'lastname',   label: 'Фамилия',        placeholder: 'Иванов',     required: true },
      { key: 'firstname',  label: 'Имя',             placeholder: 'Иван',       required: true },
      { key: 'secondname', label: 'Отчество',        placeholder: 'Иванович',   required: false },
      { key: 'dob',        label: 'Дата рождения',   placeholder: '1990-01-01', required: true, type: 'date' },
      { key: 'seria',      label: 'Серия паспорта',  placeholder: '1234',       required: true },
      { key: 'number',     label: 'Номер паспорта',  placeholder: '567890',     required: true },
    ],
  },
  {
    id: 'bankrot_person',
    label: 'Банкротство',
    desc: 'Сведения о банкротстве физлица (ЕФРСБ)',
    icon: 'TrendingDown',
    risk: 'high',
    fields: [
      { key: 'lastname',   label: 'Фамилия',      placeholder: 'Иванов',     required: true },
      { key: 'firstname',  label: 'Имя',           placeholder: 'Иван',       required: true },
      { key: 'secondname', label: 'Отчество',      placeholder: 'Иванович',   required: false },
      { key: 'dob',        label: 'Дата рождения', placeholder: '1990-01-01', required: true, type: 'date' },
    ],
  },
  {
    id: 'pledge_person',
    label: 'Залоги',
    desc: 'Залоги и обременения физлица (реестр ФНП)',
    icon: 'Lock',
    risk: 'medium',
    fields: [
      { key: 'lastname',   label: 'Фамилия',      placeholder: 'Иванов',     required: true },
      { key: 'firstname',  label: 'Имя',           placeholder: 'Иван',       required: true },
      { key: 'secondname', label: 'Отчество',      placeholder: 'Иванович',   required: false },
      { key: 'dob',        label: 'Дата рождения', placeholder: '1990-01-01', required: true, type: 'date' },
    ],
  },
  {
    id: 'arbitr_person',
    label: 'Арбитраж',
    desc: 'Арбитражные дела физлица по ИНН (КАД)',
    icon: 'Scale',
    risk: 'medium',
    fields: [
      { key: 'inn', label: 'ИНН', placeholder: '123456789012', required: true },
    ],
  },
  {
    id: 'nalog_debt',
    label: 'Налог. задолженность',
    desc: 'Долги по налогам и сборам по ИНН физлица',
    icon: 'Receipt',
    risk: 'medium',
    fields: [
      { key: 'inn', label: 'ИНН', placeholder: '123456789012', required: true },
    ],
  },
  {
    id: 'fns_block_person',
    label: 'Блокировки счетов',
    desc: 'Решения ФНС о приостановлении операций по счетам',
    icon: 'Ban',
    risk: 'high',
    fields: [
      { key: 'inn', label: 'ИНН', placeholder: '123456789012', required: true },
    ],
  },
  {
    id: 'egrul_ip',
    label: 'Статус ИП',
    desc: 'Сведения ЕГРИП — активность ИП по ИНН',
    icon: 'Briefcase',
    risk: 'low',
    fields: [
      { key: 'inn', label: 'ИНН', placeholder: '123456789012', required: true },
    ],
  },
  {
    id: 'terrorist',
    label: 'Список террористов',
    desc: 'Проверка по реестрам террористов, экстремистов, ОМУ',
    icon: 'AlertOctagon',
    risk: 'high',
    fields: [
      { key: 'lastname',   label: 'Фамилия',  placeholder: 'Иванов',   required: true },
      { key: 'firstname',  label: 'Имя',       placeholder: 'Иван',     required: true },
      { key: 'secondname', label: 'Отчество',  placeholder: 'Иванович', required: false },
    ],
  },
  {
    id: 'elmk_registry',
    label: 'Медкнижка (ЭЛМК)',
    desc: 'Статус электронной медкнижки (Роспотребнадзор)',
    icon: 'Stethoscope',
    risk: 'low',
    fields: [
      { key: 'lastname',   label: 'Фамилия',      placeholder: 'Иванов',     required: true },
      { key: 'firstname',  label: 'Имя',           placeholder: 'Иван',       required: true },
      { key: 'secondname', label: 'Отчество',      placeholder: 'Иванович',   required: false },
      { key: 'dob',        label: 'Дата рождения', placeholder: '1990-01-01', required: true, type: 'date' },
    ],
  },
];

export const RISK_COLORS = {
  high:   'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low:    'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const RISK_LABELS = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
