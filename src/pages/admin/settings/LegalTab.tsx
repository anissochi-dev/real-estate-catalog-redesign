import Icon from '@/components/ui/icon';
import { S } from './types';
import ConsentLogSection from './ConsentLogSection';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

const TEMPLATES: { key: keyof S; title: string; icon: string; hint: string; placeholder: string }[] = [
  {
    key: 'legal_personal_data',
    title: 'Согласие на обработку персональных данных',
    icon: 'ShieldCheck',
    hint: 'Показывается под формами заявок и обратной связи. Соответствие 152-ФЗ.',
    placeholder: 'Отправляя форму, я даю согласие на обработку моих персональных данных в соответствии с Федеральным законом № 152-ФЗ «О персональных данных»...',
  },
  {
    key: 'legal_privacy_policy',
    title: 'Политика конфиденциальности',
    icon: 'Lock',
    hint: 'Полный текст политики. Открывается на отдельной странице /privacy.',
    placeholder: '1. Общие положения\n2. Цели обработки данных\n3. Состав обрабатываемых данных\n4. Сроки хранения\n5. Контакты оператора...',
  },
  {
    key: 'legal_marketing_consent',
    title: 'Согласие на рекламные рассылки',
    icon: 'Mail',
    hint: 'Для рассылок по email и SMS. Соответствие закону «О рекламе».',
    placeholder: 'Я даю согласие на получение рекламных и информационных сообщений от компании по указанным контактам...',
  },
];

export default function LegalTab({ s, setS, saved, save }: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="font-display font-700 text-lg flex items-center gap-2 mb-1">
          <Icon name="Scale" size={18} /> Правовые документы
        </div>
        <p className="text-sm text-muted-foreground">
          Тексты для согласий и политик. Используются в формах сайта и на отдельных страницах.
        </p>
      </div>

      {TEMPLATES.map(t => (
        <div key={t.key} className="bg-white rounded-2xl p-6 shadow-sm space-y-2">
          <div className="font-display font-700 text-base flex items-center gap-2">
            <Icon name={t.icon} size={16} /> {t.title}
          </div>
          <div className="text-xs text-muted-foreground">{t.hint}</div>
          <textarea
            rows={8}
            className="w-full px-3 py-2 border rounded-lg text-sm leading-relaxed font-mono"
            placeholder={t.placeholder}
            value={(s[t.key] as string) || ''}
            onChange={e => setS({ ...s, [t.key]: e.target.value })}
          />
          <div className="text-xs text-muted-foreground">
            Символов: {((s[t.key] as string) || '').length}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
      </div>

      {/* Журнал принятых согласий — встроен в конец раздела "Правовые" */}
      <ConsentLogSection />
    </div>
  );
}