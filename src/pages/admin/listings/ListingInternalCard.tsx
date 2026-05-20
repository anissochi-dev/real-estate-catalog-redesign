import { useEffect, useState, useRef } from 'react';
import { adminApi, aiApi, uploadFile } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { Listing, CATS, DEALS, fmtDate } from './types';

interface Props {
  listingId: number;
  onClose: () => void;
  onBrokerChanged?: () => void;
}

type TabId = 'overview' | 'price_history' | 'stats' | 'leads' | 'ai' | 'documents' | 'broker';

interface HistoryRow {
  id: number;
  action: string;
  changes?: Record<string, [unknown, unknown]>;
  created_at: string;
  user_name?: string;
}

interface StatData {
  total_views?: number;
  total_calls?: number;
  total_leads?: number;
  daily?: { date: string; views?: number; calls?: number; leads?: number }[];
}

interface Lead {
  id: number;
  name: string;
  phone: string;
  status: string;
  created_at: string;
  listing_id: number | null;
}

interface BrokerUser {
  id: number;
  name: string;
  role: string;
}

interface DbDoc {
  id: number;
  listing_id: number;
  name: string;
  url: string;
  created_at: string;
  uploader_name?: string;
}

interface DbComment {
  id: number;
  listing_id: number;
  user_id: number;
  user_name: string;
  comment: string;
  is_ai: boolean;
  created_at: string;
}

interface AiMsg {
  role: 'user' | 'ai';
  text: string;
}

const LEAD_STATUS: Record<string, string> = {
  pending: 'На модерации', new: 'Новый', in_progress: 'В работе', done: 'Закрыт', rejected: 'Отказ',
};

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Обзор', icon: 'Info' },
  { id: 'price_history', label: 'История цен', icon: 'TrendingDown' },
  { id: 'stats', label: 'Статистика', icon: 'BarChart2' },
  { id: 'leads', label: 'Заявки', icon: 'Inbox' },
  { id: 'ai', label: 'Мелания', icon: 'Sparkles' },
  { id: 'documents', label: 'Документы', icon: 'FileText' },
  { id: 'broker', label: 'Брокер', icon: 'UserCheck' },
];

function fmt(n: number) { return n.toLocaleString('ru'); }

export default function ListingInternalCard({ listingId, onClose, onBrokerChanged }: Props) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [tab, setTab] = useState<TabId>('overview');
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminApi.getListing(listingId).then(r => {
      setListing(r.listing);
    }).finally(() => setLoading(false));
  }, [listingId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (loading || !listing) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 flex items-center gap-3">
          <Icon name="Loader2" size={20} className="animate-spin text-brand-blue" />
          <span className="text-sm">Загрузка карточки...</span>
        </div>
      </div>
    );
  }

  const catLabel = CATS.find(c => c[0] === listing.category)?.[1] || listing.category;
  const dealLabel = DEALS.find(d => d[0] === listing.deal)?.[1] || listing.deal;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-700 text-base truncate">{listing.title}</span>
              {listing.public_code && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue font-semibold shrink-0">
                  ID {listing.public_code}
                </span>
              )}
              {listing.is_hot && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold shrink-0">Горячее</span>}
              {listing.is_new && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">Новинка</span>}
              {listing.is_exclusive && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold shrink-0">Эксклюзив</span>}
              {listing.is_urgent && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold shrink-0">Срочно</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{catLabel} · {dealLabel} · {listing.city}{listing.district ? `, ${listing.district}` : ''}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted shrink-0">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-4 overflow-x-auto shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-brand-blue text-brand-blue' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'overview' && <TabOverview listing={listing} siteUrl={settings.site_url} />}
          {tab === 'price_history' && <TabPriceHistory listingId={listingId} />}
          {tab === 'stats' && <TabStats listingId={listingId} listing={listing} />}
          {tab === 'leads' && <TabLeads listingId={listingId} />}
          {tab === 'ai' && <TabAi listing={listing} />}
          {tab === 'documents' && <TabDocuments listingId={listingId} />}
          {tab === 'broker' && <TabBroker listing={listing} onSaved={() => { onBrokerChanged?.(); }} currentUserId={user?.id} />}
        </div>
      </div>
    </div>
  );
}

function TabOverview({ listing, siteUrl }: { listing: Listing; siteUrl?: string }) {
  const rows = [
    { label: 'Цена', value: `${fmt(listing.price)} ₽` },
    { label: 'Площадь', value: `${listing.area} м²` },
    { label: 'Цена за м²', value: listing.area ? `${fmt(Math.round(listing.price / listing.area))} ₽/м²` : '—' },
    { label: 'Адрес', value: listing.address || '—' },
    { label: 'Район', value: listing.district || '—' },
    { label: 'Собственник', value: listing.owner_name || '—' },
    { label: 'Телефон', value: listing.owner_phone || '—' },
    { label: 'Состояние', value: listing.condition || '—' },
    { label: 'Этаж', value: listing.floor != null ? `${listing.floor} из ${listing.total_floors ?? '?'}` : '—' },
  ];

  const siteSlug = listing.slug;
  const siteLink = siteUrl && siteSlug ? `${siteUrl.replace(/\/$/, '')}/object/${siteSlug}` : null;

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map(r => (
          <div key={r.label} className="bg-muted/40 rounded-xl px-4 py-3">
            <div className="text-xs text-muted-foreground mb-0.5">{r.label}</div>
            <div className="text-sm font-semibold">{r.value}</div>
          </div>
        ))}
      </div>

      {/* Публикация */}
      <div>
        <div className="text-sm font-semibold mb-2">Площадки размещения</div>
        <div className="flex flex-wrap gap-2">
          {listing.export_avito && <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-semibold">Авито</span>}
          {listing.export_yandex && <span className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-700 font-semibold">Яндекс.Недвижимость</span>}
          {listing.export_cian && <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold">ЦИАН</span>}
          {siteLink && (
            <a href={siteLink} target="_blank" rel="noopener noreferrer"
              className="text-xs px-3 py-1 rounded-full bg-brand-blue/10 text-brand-blue font-semibold hover:bg-brand-blue/20 flex items-center gap-1">
              Наш сайт <Icon name="ExternalLink" size={11} />
            </a>
          )}
          {!listing.export_avito && !listing.export_yandex && !listing.export_cian && !siteLink && (
            <span className="text-sm text-muted-foreground">Нигде не размещено</span>
          )}
        </div>
      </div>

      {listing.description && (
        <div>
          <div className="text-sm font-semibold mb-1">Описание</div>
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{listing.description}</div>
        </div>
      )}
    </div>
  );
}

function TabPriceHistory({ listingId }: { listingId: number }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getListingHistory(listingId).then(r => {
      const all: HistoryRow[] = r.history || [];
      setRows(all.filter(h => h.changes && h.changes.price));
    }).finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return <Spinner />;

  if (!rows.length) return (
    <div className="p-6 text-center text-muted-foreground text-sm">История изменений цены не найдена</div>
  );

  return (
    <div className="p-6">
      <div className="text-sm font-semibold mb-3">История изменений цены</div>
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Дата</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Была</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Стала</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Кто изменил</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(h => {
              const [oldP, newP] = h.changes!.price as [number, number];
              const diff = Number(newP) - Number(oldP);
              return (
                <tr key={h.id} className="border-t border-border">
                  <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(h.created_at)}</td>
                  <td className="px-4 py-2 font-mono">{fmt(Number(oldP))} ₽</td>
                  <td className="px-4 py-2 font-mono font-semibold">
                    {fmt(Number(newP))} ₽
                    <span className={`ml-2 text-xs ${diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {diff > 0 ? `+${fmt(diff)}` : fmt(diff)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{h.user_name || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabStats({ listingId, listing }: { listingId: number; listing: Listing }) {
  const [stats, setStats] = useState<StatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getListingStats(listingId).then(r => {
      setStats(r.stats || r || {});
    }).finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return <Spinner />;

  const cards = [
    { label: 'Просмотров', value: stats?.total_views ?? 0, icon: 'Eye', color: 'from-brand-blue to-indigo-600' },
    { label: 'Звонков', value: stats?.total_calls ?? 0, icon: 'Phone', color: 'from-emerald-500 to-emerald-700' },
    { label: 'Заявок', value: stats?.total_leads ?? 0, icon: 'Inbox', color: 'from-brand-orange to-orange-600' },
  ];

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {cards.map(c => (
          <div key={c.label} className={`rounded-2xl p-4 bg-gradient-to-br ${c.color} text-white`}>
            <Icon name={c.icon} size={20} className="mb-2 opacity-80" />
            <div className="text-2xl font-display font-700">{c.value}</div>
            <div className="text-xs opacity-90">{c.label}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Площадки</div>
        <div className="space-y-2">
          {[
            { key: 'export_avito', label: 'Авито', color: 'text-green-700 bg-green-50 border-green-200' },
            { key: 'export_yandex', label: 'Яндекс.Недвижимость', color: 'text-red-700 bg-red-50 border-red-200' },
            { key: 'export_cian', label: 'ЦИАН', color: 'text-blue-700 bg-blue-50 border-blue-200' },
          ].map(p => (
            <div key={p.key} className={`flex items-center justify-between px-4 py-2 rounded-xl border text-sm ${
              (listing as Record<string, unknown>)[p.key] ? p.color : 'bg-muted/30 border-border text-muted-foreground'
            }`}>
              <span className="font-medium">{p.label}</span>
              <span className="text-xs">
                {(listing as Record<string, unknown>)[p.key] ? 'Размещён' : 'Не размещён'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabLeads({ listingId }: { listingId: number }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.listLeads().then(r => {
      const all: Lead[] = r.leads || [];
      setLeads(all.filter(l => l.listing_id === listingId));
    }).finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return <Spinner />;

  if (!leads.length) return (
    <div className="p-6 text-center text-muted-foreground text-sm">По этому объекту заявок нет</div>
  );

  return (
    <div className="p-6">
      <div className="text-sm font-semibold mb-3">Заявки по объекту ({leads.length})</div>
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Дата</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Имя</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Телефон</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Статус</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(l => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(l.created_at)}</td>
                <td className="px-4 py-2">{l.name}</td>
                <td className="px-4 py-2 font-mono text-brand-blue">{l.phone}</td>
                <td className="px-4 py-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">
                    {LEAD_STATUS[l.status] || l.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabAi({ listing }: { listing: Listing }) {
  const [messages, setMessages] = useState<AiMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ask = async (text: string) => {
    setLoading(true);
    if (text !== '__auto__') setMessages(m => [...m, { role: 'user', text }]);
    try {
      const prompt = text === '__auto__'
        ? `Ты — Мелания, личный ИИ-помощник коммерческого брокера. Проанализируй объект и дай конкретные рекомендации как авитолог, маркетолог и профессиональный коммерческий брокер.\n\nОбъект: ${listing.title}\nКатегория: ${listing.category}, площадь: ${listing.area}м², цена: ${listing.price}₽\nАдрес: ${listing.address || listing.district || listing.city}\nОписание: ${listing.description || '—'}\n\nОтветь структурированно:\n1. На что обратить внимание\n2. Стоит ли снизить/повысить цену\n3. Что изменить в названии\n4. Что улучшить в описании\n5. Рекомендации по фото и размещению`
        : text;
      const r = await aiApi.ask('marketing', prompt);
      setMessages(m => [...m, { role: 'ai', text: r.text }]);
      if (text === '__auto__') {
        await adminApi.addListingComment(listing.id, `[Мелания] ${r.text}`, true).catch(() => {});
      }
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Ошибка при обращении к Мелании. Попробуйте ещё раз.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  useEffect(() => {
    if (!asked) { setAsked(true); ask('__auto__'); }
  }, []);

  const send = () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput('');
    ask(q);
  };

  const applyChange = async (field: 'title' | 'description', value: string) => {
    setApplying(field);
    try {
      await adminApi.updateListing(listing.id, { [field]: value });
      await adminApi.addListingHistory(listing.id, 'updated', { [field]: [(listing as Record<string,unknown>)[field], value] });
      setMessages(m => [...m, { role: 'ai', text: `Поле "${field === 'title' ? 'название' : 'описание'}" успешно обновлено.` }]);
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Не удалось применить изменение.' }]);
    } finally {
      setApplying(null);
    }
  };

  const lastAiText = [...messages].reverse().find(m => m.role === 'ai')?.text || '';

  return (
    <div className="flex flex-col" style={{ minHeight: 500 }}>
      <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ maxHeight: 420 }}>
        {messages.length === 0 && loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="Loader2" size={16} className="animate-spin text-brand-orange" />
            Мелания анализирует объект...
          </div>
        )}
        {messages.map((m, i) => {
          if (m.role === 'user') return (
            <div key={i} className="flex justify-end">
              <div className="bg-brand-blue text-white rounded-2xl rounded-tr-sm px-4 py-2 text-sm max-w-[75%]">{m.text}</div>
            </div>
          );
          return (
            <div key={i} className="flex gap-2 items-start">
              <div className="w-7 h-7 rounded-full bg-brand-orange/10 flex items-center justify-center shrink-0 mt-0.5">
                <Icon name="Sparkles" size={14} className="text-brand-orange" />
              </div>
              <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm max-w-[80%] whitespace-pre-wrap leading-relaxed">{m.text}</div>
            </div>
          );
        })}
        {loading && messages.length > 0 && (
          <div className="flex gap-2 items-center text-xs text-muted-foreground">
            <Icon name="Loader2" size={14} className="animate-spin" /> Мелания печатает...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {lastAiText && (
        <div className="px-5 py-2 border-t border-border bg-amber-50/50">
          <div className="text-xs text-muted-foreground mb-1.5 font-medium">Применить рекомендации Мелании:</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                const match = lastAiText.match(/название[:\s«"]+([^»"\n]{5,100})/i);
                if (match) applyChange('title', match[1].trim());
                else ask('Предложи конкретное новое название для этого объекта одной строкой, без пояснений.');
              }}
              disabled={!!applying}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-blue hover:text-brand-blue transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {applying === 'title' ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Pencil" size={12} />}
              Применить к названию
            </button>
            <button
              onClick={() => {
                const match = lastAiText.match(/описание[:\s«"]+([^»"]{20,})/i);
                if (match) applyChange('description', match[1].trim());
                else ask('Напиши новое описание для этого объекта (2-4 абзаца), без вводных слов.');
              }}
              disabled={!!applying}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-blue hover:text-brand-blue transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {applying === 'description' ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="FileText" size={12} />}
              Применить к описанию
            </button>
            <button
              onClick={() => ask('Предложи новое название и описание для этого объекта. Формат — сначала строка "Название: ..." затем "Описание: ..."')}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-orange hover:text-brand-orange transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Icon name="RefreshCw" size={12} /> Переписать всё
            </button>
          </div>
        </div>
      )}

      <div className="px-5 pb-5 pt-2 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Задать вопрос Мелании..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm outline-none focus:border-brand-blue"
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="btn-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
            <Icon name="Send" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function TabDocuments({ listingId }: { listingId: number }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DbDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renamingVal, setRenamingVal] = useState('');
  const [shareDocId, setShareDocId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canUpload = user?.role && ['admin', 'director', 'broker', 'office_manager'].includes(user.role);

  const loadDocs = () => {
    adminApi.getListingDocuments(listingId).then(r => {
      setDocs(r.documents || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadDocs(); }, [listingId]);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadFile(file, 'photos');
      await adminApi.addListingDocument(listingId, file.name, url);
      loadDocs();
    } catch (e: unknown) {
      alert('Ошибка загрузки: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (docId: number) => {
    if (!confirm('Удалить документ?')) return;
    await adminApi.deleteListingDocument(docId);
    loadDocs();
  };

  const saveRename = async (docId: number) => {
    if (!renamingVal.trim()) return;
    await adminApi.renameListingDocument(docId, renamingVal.trim());
    setRenamingId(null);
    loadDocs();
  };

  const downloadDoc = async (doc: DbDoc) => {
    try {
      const res = await fetch(doc.url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(doc.url, '_blank');
    }
  };

  const shareDoc = (doc: DbDoc) => {
    setShareDocId(doc.id === shareDocId ? null : doc.id);
  };

  const MESSENGERS = [
    { label: 'WhatsApp', icon: 'MessageCircle', color: 'text-green-600', href: (url: string, name: string) => `https://wa.me/?text=${encodeURIComponent(`${name}: ${url}`)}` },
    { label: 'Telegram', icon: 'Send', color: 'text-blue-500', href: (url: string, name: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(name)}` },
    { label: 'Viber', icon: 'Phone', color: 'text-violet-600', href: (url: string, name: string) => `viber://forward?text=${encodeURIComponent(`${name}: ${url}`)}` },
    { label: 'Email', icon: 'Mail', color: 'text-muted-foreground', href: (url: string, name: string) => `mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(url)}` },
  ];

  if (loading) return <Spinner />;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Документы объекта</div>
          <div className="text-xs text-muted-foreground mt-0.5">Видны только в административной панели</div>
        </div>
        {canUpload && (
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
            <Icon name={uploading ? 'Loader2' : 'Upload'} size={15} className={uploading ? 'animate-spin' : ''} />
            {uploading ? 'Загрузка...' : 'Добавить'}
          </button>
        )}
        <input ref={inputRef} type="file" className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>

      {docs.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground border-2 border-dashed border-border rounded-xl"
          onClick={() => canUpload && inputRef.current?.click()}
          style={{ cursor: canUpload ? 'pointer' : 'default' }}>
          <Icon name="FileText" size={28} className="mx-auto mb-2 opacity-30" />
          Нет прикреплённых документов{canUpload ? ' — нажмите для добавления' : ''}
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                <Icon name="FileText" size={18} className="text-brand-blue shrink-0" />
                <div className="flex-1 min-w-0">
                  {renamingId === doc.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        value={renamingVal}
                        onChange={e => setRenamingVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveRename(doc.id); if (e.key === 'Escape') setRenamingId(null); }}
                        className="flex-1 px-2 py-1 border border-brand-blue rounded text-sm outline-none"
                        autoFocus
                      />
                      <button onClick={() => saveRename(doc.id)} className="text-xs text-brand-blue font-semibold">Сохранить</button>
                      <button onClick={() => setRenamingId(null)} className="text-xs text-muted-foreground">Отмена</button>
                    </div>
                  ) : (
                    <div className="text-sm font-medium truncate">{doc.name}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {fmtDate(doc.created_at)}{doc.uploader_name ? ` · ${doc.uploader_name}` : ''}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <a href={doc.url} target="_blank" rel="noopener noreferrer"
                    title="Открыть"
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand-blue">
                    <Icon name="ExternalLink" size={14} />
                  </a>
                  <button onClick={() => downloadDoc(doc)} title="Скачать"
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-emerald-600">
                    <Icon name="Download" size={14} />
                  </button>
                  <button onClick={() => shareDoc(doc)} title="Поделиться"
                    className={`p-2 rounded-lg hover:bg-muted transition-colors ${shareDocId === doc.id ? 'text-brand-orange' : 'text-muted-foreground hover:text-brand-orange'}`}>
                    <Icon name="Share2" size={14} />
                  </button>
                  {canUpload && (
                    <>
                      <button onClick={() => { setRenamingId(doc.id); setRenamingVal(doc.name); }} title="Переименовать"
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-amber-600">
                        <Icon name="Pencil" size={14} />
                      </button>
                      <button onClick={() => deleteDoc(doc.id)} title="Удалить"
                        className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500">
                        <Icon name="Trash2" size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {shareDocId === doc.id && (
                <div className="px-4 py-3 bg-muted/30 border-t border-border flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground self-center">Отправить через:</span>
                  {MESSENGERS.map(m => (
                    <a key={m.label} href={m.href(doc.url, doc.name)} target="_blank" rel="noopener noreferrer"
                      className={`text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:bg-muted inline-flex items-center gap-1.5 ${m.color}`}>
                      <Icon name={m.icon} size={13} />
                      {m.label}
                    </a>
                  ))}
                  <button
                    onClick={() => { navigator.clipboard?.writeText(doc.url); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:bg-muted inline-flex items-center gap-1.5 text-muted-foreground">
                    <Icon name="Copy" size={13} /> Скопировать ссылку
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabBroker({ listing, onSaved, currentUserId }: { listing: Listing; onSaved: () => void; currentUserId?: number }) {
  const [users, setUsers] = useState<BrokerUser[]>([]);
  const [selected, setSelected] = useState<number | null>(
    (listing as Record<string, unknown>).broker_id as number | null ?? null
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminApi.listUsers().then(r => {
      const all: BrokerUser[] = r.users || [];
      setUsers(all.filter(u => ['admin', 'director', 'broker', 'office_manager', 'manager'].includes(u.role)));
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateListing(listing.id, { broker_id: selected });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const authorName = (listing as Record<string, unknown>).broker_name as string | null
    || (listing as Record<string, unknown>).author_name as string | null;

  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="text-sm font-semibold mb-1">Текущий брокер</div>
        <div className="px-4 py-3 bg-muted/40 rounded-xl text-sm">
          {authorName || (selected ? users.find(u => u.id === selected)?.name : null) || 'Не назначен'}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Передать объект брокеру</div>
        <select
          value={selected ?? ''}
          onChange={e => setSelected(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-3 py-2.5 border border-border rounded-xl text-sm"
        >
          <option value="">— Не назначен —</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.name} {u.id === currentUserId ? '(я)' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={saving}
          className="mt-3 btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2"
        >
          {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : null}
          {saved ? 'Сохранено!' : 'Сохранить'}
        </button>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        При смене брокера объект будет отображаться в его списке объектов. История изменений сохраняется.
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Icon name="Loader2" size={24} className="animate-spin text-brand-blue" />
    </div>
  );
}