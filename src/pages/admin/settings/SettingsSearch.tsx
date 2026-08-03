import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { adminApi } from '@/lib/adminApi';

/** Ключ sessionStorage, через который SettingsSearch передаёт вкладке «XML фиды»
 * текст поиска, чтобы список сразу отфильтровался на нужный фид. */
export const FEEDS_SEARCH_HANDOFF_KEY = 'settings_search_feeds_query';

interface LiveFeed { id: number; name: string; format: string; }

export interface SearchItem {
  label: string;
  description: string;
  tab: string;
  group: string;
  keywords: string[];
}

export const SETTINGS_INDEX: SearchItem[] = [
  // ── Компания: general ────────────────────────────────────────────────
  { label: 'Логотип', description: 'Загрузить или изменить логотип компании', tab: 'general', group: 'Компания', keywords: ['логотип', 'logo', 'лого', 'изображение компании'] },
  { label: 'Название компании', description: 'Официальное название и описание', tab: 'general', group: 'Компания', keywords: ['название', 'компания', 'company', 'имя'] },
  { label: 'Телефон и контакты', description: 'Контактный телефон, email, адрес офиса', tab: 'general', group: 'Компания', keywords: ['телефон', 'контакты', 'phone', 'email', 'адрес'] },
  { label: 'Главная страница (Hero)', description: 'Заголовок, подзаголовок и фон главного экрана', tab: 'general', group: 'Компания', keywords: ['главная', 'hero', 'заголовок сайта', 'баннер', 'фон'] },
  { label: 'О компании (текст)', description: 'Текст описания компании на главной странице', tab: 'general', group: 'Компания', keywords: ['о компании', 'about', 'описание', 'текст главной'] },
  { label: 'Основной город', description: 'Город по умолчанию для SEO и поиска', tab: 'general', group: 'Компания', keywords: ['город', 'city', 'краснодар', 'регион'] },
  { label: 'Количество объектов на страницах', description: 'Лимиты объектов на главной, в каталоге, категориях', tab: 'general', group: 'Компания', keywords: ['количество', 'лимит', 'объектов на странице', 'пагинация', 'каталог'] },
  { label: 'Блок новостей на сайте', description: 'Включить/выключить блок новостей и его размер', tab: 'general', group: 'Компания', keywords: ['новости', 'блок новостей', 'главная страница'] },
  { label: 'Блок заявок клиентов', description: 'Включить/выключить публичный блок последних заявок', tab: 'general', group: 'Компания', keywords: ['заявки клиентов', 'отзывы', 'блок заявок'] },

  // ── Компания: brand-kit ──────────────────────────────────────────────
  { label: 'Цвета бренда', description: 'Первичный, вторичный и акцентный цвета', tab: 'brand-kit', group: 'Компания', keywords: ['цвета', 'цвет', 'бренд', 'brand', 'palette', 'палитра', 'синий', 'оформление'] },
  { label: 'Favicon и иконки', description: 'Иконка браузера, Apple touch icon, OG-изображение', tab: 'brand-kit', group: 'Компания', keywords: ['favicon', 'иконка', 'og image', 'apple', 'значок', 'вкладка'] },

  // ── Компания: watermark ──────────────────────────────────────────────
  { label: 'Водяной знак', description: 'Наложение водяного знака на фото объектов', tab: 'watermark', group: 'Компания', keywords: ['водяной знак', 'watermark', 'фото', 'защита', 'прозрачность'] },
  { label: 'Позиция и размер водяного знака', description: 'Расположение, прозрачность и размер наложения', tab: 'watermark', group: 'Компания', keywords: ['позиция знака', 'прозрачность', 'размер знака', 'угол'] },

  // ── Компания: cities ─────────────────────────────────────────────────
  { label: 'Города', description: 'Добавить или отключить города присутствия', tab: 'cities', group: 'Компания', keywords: ['города', 'city', 'регион', 'филиал', 'добавить город'] },

  // ── Сайт: pages / footer / legal / purposes / land-vri ──────────────
  { label: 'Статические страницы', description: 'О компании, контакты — CMS-страницы сайта', tab: 'pages', group: 'Сайт', keywords: ['страницы', 'о компании', 'about', 'контакты', 'cms', 'текст'] },
  { label: 'Подвал сайта', description: 'Описание компании, ссылки каталога и категорий в подвале', tab: 'footer', group: 'Сайт', keywords: ['подвал', 'footer', 'низ сайта', 'ссылки', 'колонки'] },
  { label: 'Реквизиты компании', description: 'ИП/ООО, ИНН, ОГРН — реквизиты в подвале сайта', tab: 'footer', group: 'Сайт', keywords: ['реквизиты', 'инн', 'огрн', 'ип', 'ооо', 'юр лицо'] },
  { label: 'Согласие на обработку персональных данных', description: 'Текст согласия по 152-ФЗ', tab: 'legal', group: 'Сайт', keywords: ['согласие', 'персональные данные', '152-фз', 'privacy'] },
  { label: 'Политика конфиденциальности', description: 'Текст страницы /privacy', tab: 'legal', group: 'Сайт', keywords: ['политика конфиденциальности', 'privacy', 'gdpr'] },
  { label: 'Согласие на рекламные рассылки', description: 'Текст согласия для email/SMS рассылок', tab: 'legal', group: 'Сайт', keywords: ['рассылка', 'реклама', 'sms', 'email согласие'] },
  { label: 'Журнал принятых согласий', description: 'Список и статистика согласий пользователей, экспорт в CSV', tab: 'legal', group: 'Сайт', keywords: ['журнал согласий', 'статистика согласий', 'экспорт csv', 'ip адрес'] },
  { label: 'Назначения объектов', description: 'Категории недвижимости: офис, склад, торговля', tab: 'purposes', group: 'Сайт', keywords: ['назначения', 'категории', 'офис', 'склад', 'торговля', 'типы'] },
  { label: 'ВРИ земли', description: 'Виды разрешённого использования земельных участков', tab: 'land-vri', group: 'Сайт', keywords: ['ври', 'земля', 'земельный', 'разрешённое использование'] },

  // ── Интеграции: integrations (AI/Гео/Карты/Оплата/MAX/Безопасность/Вебмастер/Реклама) ──
  { label: 'Яндекс AI (YandexGPT)', description: 'API-ключ и Folder ID для YandexGPT, автогенерация FAQ', tab: 'integrations', group: 'Интеграции', keywords: ['яндекс', 'gpt', 'ai', 'ии', 'апи', 'api', 'yandex', 'искусственный интеллект', 'folder id', 'нейросеть'] },
  { label: 'Геокодеры (определение округов)', description: 'Яндекс Геокодер, DaData, geocode.maps.co, Nominatim OSM — порядок и лимиты', tab: 'integrations', group: 'Интеграции', keywords: ['геокодер', 'dadata', 'nominatim', 'osm', 'округ', 'лимит запросов'] },
  { label: 'Яндекс Карты', description: 'Ключ для геокодирования и подсказок адреса', tab: 'integrations', group: 'Интеграции', keywords: ['карты', 'maps', 'геокодер', 'адрес', 'подсказки', 'яндекс карты'] },
  { label: 'ЮKassa (оплата)', description: 'Shop ID и Secret Key для приёма платежей', tab: 'integrations', group: 'Интеграции', keywords: ['оплата', 'касса', 'yookassa', 'юкасса', 'платёж', 'shop id', 'эквайринг', 'вебхук'] },
  { label: 'MAX Bot (интеграция)', description: 'Токен бота MAX для проверки подключения', tab: 'integrations', group: 'Интеграции', keywords: ['max', 'бот', 'мессенджер', 'bot', 'token', 'токен'] },
  { label: 'Проверка контрагентов (ЧестныйБизнес, NewDB, Безопасно.org)', description: 'API-ключи для проверки компаний, ИП и телефонов', tab: 'integrations', group: 'Интеграции', keywords: ['честныйбизнес', 'newdb', 'безопасно.org', 'проверка контрагента', 'инн', 'антифрод', 'безопасность'] },
  { label: 'Яндекс Вебмастер', description: 'OAuth-токен, отправка sitemap.xml, индексация', tab: 'integrations', group: 'Интеграции', keywords: ['вебмастер', 'yandex webmaster', 'sitemap', 'индексация', 'oauth'] },
  { label: 'Google Search Console', description: 'API-ключ, отправка sitemap и аналитика индексации', tab: 'integrations', group: 'Интеграции', keywords: ['google search console', 'gsc', 'google', 'sitemap', 'индексация'] },
  { label: 'Яндекс.Директ / Метрика (конверсии)', description: 'Передача конверсий из заявок в Метрику', tab: 'integrations', group: 'Интеграции', keywords: ['директ', 'метрика', 'конверсии', 'yandex metrika', 'яндекс директ'] },
  { label: 'VK Пиксель и VK Ads', description: 'VK Пиксель ID, VK Ads Client ID/Secret для ретаргетинга', tab: 'integrations', group: 'Интеграции', keywords: ['vk', 'вконтакте', 'пиксель', 'vk ads', 'ретаргетинг'] },
  { label: 'CallTouch (коллтрекинг)', description: 'CallTouch Mod ID для отслеживания звонков', tab: 'integrations', group: 'Интеграции', keywords: ['calltouch', 'коллтрекинг', 'звонки', 'отслеживание'] },
  { label: 'Telegram Ads Pixel', description: 'ID пикселя для отслеживания конверсий Telegram Ads', tab: 'integrations', group: 'Интеграции', keywords: ['telegram ads', 'пиксель телеграм', 'реклама telegram'] },
  { label: 'MAX Автоответ на заявку', description: 'Автоматический текст ответа клиенту в MAX при новой заявке', tab: 'integrations', group: 'Интеграции', keywords: ['автоответ', 'max сообщение', 'заявка автоответ'] },

  // ── Интеграции: ad-platforms ─────────────────────────────────────────
  { label: 'Авито (ключи доступа)', description: 'Client ID и Client Secret для публикации на Авито', tab: 'ad-platforms', group: 'Интеграции', keywords: ['авито', 'avito', 'client id', 'публикация авито'] },
  { label: 'ЦИАН (API токен)', description: 'API Token для публикации объявлений на ЦИАН', tab: 'ad-platforms', group: 'Интеграции', keywords: ['циан', 'cian', 'api token', 'публикация циан'] },
  { label: 'Яндекс.Недвижимость (доска)', description: 'OAuth Token, Client ID, Agency ID для публикации', tab: 'ad-platforms', group: 'Интеграции', keywords: ['яндекс недвижимость', 'oauth', 'agency id', 'публикация яндекс'] },
  { label: 'Домклик (API Key)', description: 'API-ключ для публикации на Домклик', tab: 'ad-platforms', group: 'Интеграции', keywords: ['домклик', 'domclick', 'api key'] },
  { label: 'Юла (ключи доступа)', description: 'Client ID и Client Secret для публикации на Юле', tab: 'ad-platforms', group: 'Интеграции', keywords: ['юла', 'youla', 'client secret'] },
  { label: 'Доски объявлений — общее', description: 'Avito, ЦИАН, Яндекс Недвижимость, Домклик, Юла — статус подключения', tab: 'ad-platforms', group: 'Интеграции', keywords: ['авито', 'avito', 'циан', 'cian', 'яндекс недвижимость', 'доски', 'объявления', 'публикация'] },

  // ── Интеграции: autoposting ──────────────────────────────────────────
  { label: 'Автопостинг', description: 'Расписание авто-публикации объектов на платформы', tab: 'autoposting', group: 'Интеграции', keywords: ['автопостинг', 'расписание', 'публикация', 'автоматически', 'posting', 'соцсети'] },

  // ── Интеграции: feeds (список функций раздела) ──────────────────────
  { label: 'XML фиды', description: 'Создание и настройка фидов для агрегаторов (Яндекс/Авито/ЦИАН/доп. площадки)', tab: 'feeds', group: 'Интеграции', keywords: ['xml', 'фид', 'feed', 'экспорт', 'выгрузка'] },
  { label: 'Добавить XML фид', description: 'Создать новый фид: название, площадка, фильтры категории и сделки', tab: 'feeds', group: 'Интеграции', keywords: ['добавить фид', 'новый фид', 'создать фид'] },
  { label: 'Импорт из XML', description: 'Загрузить фид по ссылке или вставить XML — объекты добавятся в каталог', tab: 'feeds', group: 'Интеграции', keywords: ['импорт xml', 'загрузить фид', 'импортировать объекты'] },
  { label: 'Обновить фиды сейчас', description: 'Принудительная мгновенная перегенерация всех XML-файлов', tab: 'feeds', group: 'Интеграции', keywords: ['обновить фид', 'перегенерация', 'сгенерировать сейчас'] },

  // ── Интеграции: notifications ────────────────────────────────────────
  { label: 'Email-уведомления', description: 'Получатели, события и SMTP-сервер для писем', tab: 'notifications', group: 'Интеграции', keywords: ['уведомления', 'email', 'smtp', 'почта', 'письма'] },
  { label: 'Telegram-уведомления', description: 'Bot Token и Chat ID для оповещений в Telegram', tab: 'notifications', group: 'Интеграции', keywords: ['telegram', 'бот телеграм', 'chat id', 'оповещение'] },
  { label: 'MAX-уведомления сотрудникам', description: 'Bot Token, роли и User ID сотрудников для оповещений в MAX', tab: 'notifications', group: 'Интеграции', keywords: ['max уведомления', 'мессенджер', 'сотрудники', 'роли'] },

  // ── Администрирование ────────────────────────────────────────────────
  { label: 'Роли и доступы', description: 'Права пользователей: брокер, менеджер, директор', tab: 'roles', group: 'Администрирование', keywords: ['роли', 'доступ', 'права', 'пользователи', 'брокер', 'менеджер', 'roles'] },
  { label: 'Верификация сайта', description: 'Файлы верификации для поисковых систем (Яндекс, Google, Mail.ru, Bing)', tab: 'verification', group: 'Администрирование', keywords: ['верификация', 'verification', 'поисковик', 'google', 'яндекс', 'подтверждение', 'mail.ru', 'bing'] },
  { label: 'Экспорт / Импорт данных', description: 'Полный бэкап, экспорт объектов/контактов/настроек, импорт из JSON', tab: 'migration', group: 'Администрирование', keywords: ['миграция', 'экспорт', 'импорт', 'migration', 'данные', 'перенос', 'бэкап', 'json'] },
  { label: 'Сжатие и оптимизация фото', description: 'Перенос внешних фото на свой CDN, конвертация в WebP, мобильные превью', tab: 'photo-optimize', group: 'Администрирование', keywords: ['фото', 'сжатие', 'оптимизация', 'битые', 'изображения', 'photo', 'webp', 'cdn'] },

  // ── Администрирование: site-health (все 7 подразделов) ──────────────
  { label: 'Диагностика сайта', description: 'Проверка SEO, безопасности, хранилища, фидов, гео', tab: 'site-health', group: 'Администрирование', keywords: ['диагностика', 'здоровье', 'проверка', 'health', 'аудит'] },
  { label: 'Диагностика: SEO и качество объектов', description: 'Проверка заголовков, описаний, цен, дублей объявлений', tab: 'site-health', group: 'Администрирование', keywords: ['seo заголовки', 'дубли объявлений', 'проверка цен', 'качество объектов'] },
  { label: 'Диагностика: безопасность', description: 'Сканирование уязвимостей, SSL, заголовки безопасности, активные сессии', tab: 'site-health', group: 'Администрирование', keywords: ['безопасность', 'ssl', 'уязвимости', 'сессии', 'hsts', 'csp'] },
  { label: 'Диагностика: фотографии', description: 'Проверка доступности внешних фото объектов, удаление битых', tab: 'site-health', group: 'Администрирование', keywords: ['битые фото', 'проверка фото', 'недоступные фото'] },
  { label: 'Диагностика: хранилище S3', description: 'Статистика файлов по папкам, поиск файлов-сирот', tab: 'site-health', group: 'Администрирование', keywords: ['s3', 'хранилище', 'cdn', 'сироты', 'файлы'] },
  { label: 'Диагностика: XML-фиды (доступность и качество)', description: 'Проверка доступности фидов, JPG-копии фото, качество объектов в фидах', tab: 'site-health', group: 'Администрирование', keywords: ['xml диагностика', 'фиды проверка', 'jpg копии', 'качество фида', 'досоздать фото'] },
  { label: 'Диагностика: обслуживание (очистка)', description: 'Очистка сессий, логов ИИ, дублей, пустых заявок, SEO slug', tab: 'site-health', group: 'Администрирование', keywords: ['очистка', 'обслуживание', 'удалить дубли', 'очистить сессии', 'логи ии'] },
  { label: 'Диагностика: геоданные (OSM)', description: 'Инфраструктура рядом с объектами: метро, школы, ТЦ, парки из OpenStreetMap', tab: 'site-health', group: 'Администрирование', keywords: ['геоданные', 'osm', 'openstreetmap', 'инфраструктура', 'метро', 'школы'] },

  // ── База знаний ВБ ────────────────────────────────────────────────────
  { label: 'База знаний ВБ', description: 'Факты, стоп-слова и источники обучения виртуального брокера', tab: 'vb-knowledge', group: 'База знаний ВБ', keywords: ['база знаний', 'вб', 'виртуальный брокер', 'ии', 'ai', 'обучение', 'стоп-слова', 'память'] },

  // ── Прочие разделы (Пользователи/Телефоны/SEO/Районы) ────────────────
  { label: 'Пользователи', description: 'Сотрудники и собственники кабинетов', tab: 'users', group: 'Пользователи', keywords: ['пользователи', 'сотрудники', 'users', 'роли', 'собственники'] },
  { label: 'Телефонная база', description: 'Контакты, звонки и связанные заявки', tab: 'phones', group: 'Телефонная база', keywords: ['телефон', 'телефонная база', 'звонки', 'контакты', 'phones'] },
  { label: 'SEO', description: 'Мета-теги, аудит и технические SEO-параметры', tab: 'seo', group: 'SEO', keywords: ['seo', 'сео', 'мета', 'аудит', 'заголовки'] },
  { label: 'Районы', description: 'Районы города для фильтрации объектов', tab: 'districts', group: 'Районы', keywords: ['районы', 'district', 'округ', 'геолокация'] },
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

  // Живые данные: список реальных XML-фидов — грузим один раз, чтобы поиск
  // находил не только раздел «XML фиды», но и конкретные созданные фиды по имени.
  const canSearchFeeds = !allowedTabs || allowedTabs.includes('feeds');
  const [feeds, setFeeds] = useState<LiveFeed[]>([]);
  useEffect(() => {
    if (!canSearchFeeds) return;
    adminApi.listFeeds().then(d => setFeeds(d.feeds || [])).catch(() => {});
  }, [canSearchFeeds]);

  const results = query.trim().length < 1 ? [] : SETTINGS_INDEX.filter(item => {
    if (allowedTabs && !allowedTabs.includes(item.tab)) return false;
    const q = query.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.keywords.some(k => k.includes(q))
    );
  }).slice(0, 6);

  const feedResults = query.trim().length < 1 || !canSearchFeeds ? [] : feeds
    .filter(f => f.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 5);

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

  const handleSelectFeed = (feed: LiveFeed) => {
    try { sessionStorage.setItem(FEEDS_SEARCH_HANDOFF_KEY, feed.name); } catch { /* ignore */ }
    onNavigate('feeds');
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
    'Пользователи': 'bg-brand-blue/10 text-brand-blue',
    'Телефонная база': 'bg-brand-blue/10 text-brand-blue',
    'SEO': 'bg-brand-blue/10 text-brand-blue',
    'Районы': 'bg-brand-blue/10 text-brand-blue',
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all ${open && query ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-border bg-white'}`}>
        <Icon name="Search" size={18} className="text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Найти настройку..."
          className="flex-1 text-base bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false); }} className="text-muted-foreground hover:text-foreground">
            <Icon name="X" size={16} />
          </button>
        )}
      </div>

      {open && (results.length > 0 || feedResults.length > 0) && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
          {feedResults.map(feed => (
            <button
              key={`feed-${feed.id}`}
              type="button"
              onClick={() => handleSelectFeed(feed)}
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition flex items-start gap-3 border-b border-border last:border-0"
            >
              <div className="shrink-0 mt-0.5">
                <Icon name="Rss" size={14} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{highlight(feed.name)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-50 text-amber-700">
                    XML фид
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">Открыть фид «{feed.name}»</div>
              </div>
              <Icon name="ArrowRight" size={14} className="text-muted-foreground shrink-0 mt-1" />
            </button>
          ))}
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

      {open && query.trim().length > 1 && results.length === 0 && feedResults.length === 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-border rounded-xl shadow-lg px-4 py-3 text-sm text-muted-foreground">
          Ничего не найдено по «{query}»
        </div>
      )}
    </div>
  );
}