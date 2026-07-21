import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/icon';

export interface SearchItem {
  label: string;
  description: string;
  tab: string;
  group: string;
  keywords: string[];
}

export const SETTINGS_INDEX: SearchItem[] = [
  { label: 'Логотип', description: 'Загрузить или изменить логотип компании', tab: 'general', group: 'Компания', keywords: ['логотип', 'logo', 'лого', 'изображение компании'] },
  { label: 'Название компании', description: 'Официальное название и описание', tab: 'general', group: 'Компания', keywords: ['название', 'компания', 'company', 'имя'] },
  { label: 'Телефон и контакты', description: 'Контактный телефон, email, адрес офиса', tab: 'general', group: 'Компания', keywords: ['телефон', 'контакты', 'phone', 'email', 'адрес'] },
  { label: 'Главная страница (Hero)', description: 'Заголовок, подзаголовок и фон главного экрана', tab: 'general', group: 'Компания', keywords: ['главная', 'hero', 'заголовок сайта', 'баннер', 'фон'] },
  { label: 'Основной город', description: 'Город по умолчанию для SEO и поиска', tab: 'general', group: 'Компания', keywords: ['город', 'city', 'краснодар', 'регион'] },
  { label: 'Цвета бренда', description: 'Первичный, вторичный и акцентный цвета', tab: 'brand-kit', group: 'Компания', keywords: ['цвета', 'цвет', 'бренд', 'brand', 'palette', 'палитра', 'синий', 'оформление'] },
  { label: 'Favicon и иконки', description: 'Иконка браузера, Apple touch icon, OG-изображение', tab: 'brand-kit', group: 'Компания', keywords: ['favicon', 'иконка', 'og image', 'apple', 'значок', 'вкладка'] },
  { label: 'Водяной знак', description: 'Наложение водяного знака на фото объектов', tab: 'watermark', group: 'Компания', keywords: ['водяной знак', 'watermark', 'фото', 'защита', 'прозрачность'] },
  { label: 'Города', description: 'Добавить или отключить города присутствия', tab: 'cities', group: 'Компания', keywords: ['города', 'city', 'регион', 'филиал', 'добавить город'] },
  { label: 'Статические страницы', description: 'О компании, контакты — CMS-страницы сайта', tab: 'pages', group: 'Сайт', keywords: ['страницы', 'о компании', 'about', 'контакты', 'cms', 'текст'] },
  { label: 'Подвал сайта', description: 'Ссылки и текст в нижней части сайта', tab: 'footer', group: 'Сайт', keywords: ['подвал', 'footer', 'низ сайта', 'ссылки', 'юридический'] },
  { label: 'Правовые тексты', description: 'Согласие на обработку данных, политика конфиденциальности', tab: 'legal', group: 'Сайт', keywords: ['правовые', 'согласие', 'персональные данные', 'privacy', 'gdpr', 'политика', 'конфиденциальность'] },
  { label: 'Назначения объектов', description: 'Категории недвижимости: офис, склад, торговля', tab: 'purposes', group: 'Сайт', keywords: ['назначения', 'категории', 'офис', 'склад', 'торговля', 'типы'] },
  { label: 'ВРИ земли', description: 'Виды разрешённого использования земельных участков', tab: 'land-vri', group: 'Сайт', keywords: ['ври', 'земля', 'земельный', 'разрешённое использование'] },
  { label: 'Яндекс AI (GPT)', description: 'API-ключ и Folder ID для YandexGPT', tab: 'integrations', group: 'Интеграции', keywords: ['яндекс', 'gpt', 'ai', 'ии', 'апи', 'api', 'yandex', 'искусственный интеллект', 'folder id', 'нейросеть'] },
  { label: 'Яндекс Карты', description: 'Ключ для геокодирования и подсказок адреса', tab: 'integrations', group: 'Интеграции', keywords: ['карты', 'maps', 'геокодер', 'адрес', 'подсказки', 'яндекс карты'] },
  { label: 'Яндекс Касса / Оплата', description: 'Shop ID и Secret для приёма платежей', tab: 'integrations', group: 'Интеграции', keywords: ['оплата', 'касса', 'yookassa', 'платёж', 'shop id', 'эквайринг'] },
  { label: 'MAX Bot', description: 'Токен бота в мессенджере MAX', tab: 'integrations', group: 'Интеграции', keywords: ['max', 'бот', 'мессенджер', 'bot', 'token', 'токен'] },
  { label: 'Вебмастер / Метрика', description: 'Яндекс.Вебмастер, счётчики аналитики', tab: 'integrations', group: 'Интеграции', keywords: ['вебмастер', 'метрика', 'счётчик', 'аналитика', 'webmaster', 'yandex metrika'] },
  { label: 'Доски объявлений', description: 'Avito, ЦИАН, Яндекс Недвижимость — ключи доступа', tab: 'ad-platforms', group: 'Интеграции', keywords: ['авито', 'avito', 'циан', 'cian', 'яндекс недвижимость', 'доски', 'объявления', 'публикация'] },
  { label: 'Автопостинг', description: 'Расписание авто-публикации объектов на платформы', tab: 'autoposting', group: 'Интеграции', keywords: ['автопостинг', 'расписание', 'публикация', 'автоматически', 'posting'] },
  { label: 'XML фиды', description: 'Настройки экспорта XML для агрегаторов', tab: 'feeds', group: 'Интеграции', keywords: ['xml', 'фид', 'feed', 'экспорт', 'выгрузка'] },
  { label: 'Уведомления', description: 'Email, Telegram — оповещения о новых заявках', tab: 'notifications', group: 'Интеграции', keywords: ['уведомления', 'telegram', 'email', 'оповещение', 'почта', 'заявки', 'notification'] },
  { label: 'Роли и доступы', description: 'Права пользователей: брокер, менеджер, директор', tab: 'roles', group: 'Администрирование', keywords: ['роли', 'доступ', 'права', 'пользователи', 'брокер', 'менеджер', 'roles'] },
  { label: 'Верификация сайта', description: 'Файлы верификации для поисковых систем', tab: 'verification', group: 'Администрирование', keywords: ['верификация', 'verification', 'поисковик', 'google', 'яндекс', 'подтверждение'] },
  { label: 'Экспорт / Импорт данных', description: 'Миграция данных из других систем', tab: 'migration', group: 'Администрирование', keywords: ['миграция', 'экспорт', 'импорт', 'migration', 'данные', 'перенос'] },
  { label: 'Сжатие и оптимизация фото', description: 'Сканирование битых фото и авто-ремонт', tab: 'photo-optimize', group: 'Администрирование', keywords: ['фото', 'сжатие', 'оптимизация', 'битые', 'изображения', 'photo'] },
  { label: 'Диагностика сайта', description: 'Проверка SEO, безопасности, хранилища, фидов', tab: 'site-health', group: 'Администрирование', keywords: ['диагностика', 'здоровье', 'проверка', 'health', 'безопасность', 'ssl', 'аудит'] },
  { label: 'База знаний ВБ', description: 'Факты, стоп-слова и источники обучения виртуального брокера', tab: 'vb-knowledge', group: 'База знаний ВБ', keywords: ['база знаний', 'вб', 'виртуальный брокер', 'ии', 'ai', 'обучение', 'стоп-слова', 'память'] },
  { label: 'Пользователи', description: 'Сотрудники и собственники кабинетов', tab: 'users', group: 'Быстрый доступ', keywords: ['пользователи', 'сотрудники', 'users', 'роли', 'собственники'] },
  { label: 'Телефонная база', description: 'Контакты, звонки и связанные заявки', tab: 'phones', group: 'Быстрый доступ', keywords: ['телефон', 'телефонная база', 'звонки', 'контакты', 'phones'] },
  { label: 'SEO', description: 'Мета-теги, аудит и технические SEO-параметры', tab: 'seo', group: 'Быстрый доступ', keywords: ['seo', 'сео', 'мета', 'аудит', 'заголовки'] },
  { label: 'Районы', description: 'Районы города для фильтрации объектов', tab: 'districts', group: 'Быстрый доступ', keywords: ['районы', 'district', 'округ', 'геолокация'] },
];

interface Props {
  onNavigate: (tab: string) => void;
  /** Если задано — в результатах поиска показываются только вкладки из этого списка. */
  allowedTabs?: string[];
}

export default function SettingsSearch({ onNavigate, allowedTabs }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = query.trim().length < 1 ? [] : SETTINGS_INDEX.filter(item => {
    if (allowedTabs && !allowedTabs.includes(item.tab)) return false;
    const q = query.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.keywords.some(k => k.includes(q))
    );
  }).slice(0, 6);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (item: SearchItem) => {
    onNavigate(item.tab);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const highlight = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-brand-blue/20 text-brand-blue rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const groupColors: Record<string, string> = {
    'Компания': 'bg-blue-50 text-blue-700',
    'Сайт': 'bg-violet-50 text-violet-700',
    'Интеграции': 'bg-amber-50 text-amber-700',
    'Администрирование': 'bg-slate-100 text-slate-600',
    'База знаний ВБ': 'bg-emerald-50 text-emerald-700',
    'Быстрый доступ': 'bg-brand-blue/10 text-brand-blue',
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${open && query ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-border bg-white'}`}>
        <Icon name="Search" size={15} className="text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Найти настройку..."
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false); }} className="text-muted-foreground hover:text-foreground">
            <Icon name="X" size={14} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
          {results.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition flex items-start gap-3 border-b border-border last:border-0"
            >
              <div className="shrink-0 mt-0.5">
                <Icon name="Settings" size={14} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{highlight(item.label)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${groupColors[item.group] || 'bg-muted text-muted-foreground'}`}>
                    {item.group}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{highlight(item.description)}</div>
              </div>
              <Icon name="ArrowRight" size={14} className="text-muted-foreground shrink-0 mt-1" />
            </button>
          ))}
        </div>
      )}

      {open && query.trim().length > 1 && results.length === 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-border rounded-xl shadow-lg px-4 py-3 text-sm text-muted-foreground">
          Ничего не найдено по «{query}»
        </div>
      )}
    </div>
  );
}