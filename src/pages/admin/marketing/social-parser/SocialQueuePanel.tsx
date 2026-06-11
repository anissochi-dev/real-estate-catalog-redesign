import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';

interface SocialPost {
  id: number;
  platform: string;
  source_id: string;
  post_id: string;
  post_url: string | null;
  post_date: string | null;
  author_name: string | null;
  author_url: string | null;
  raw_text: string | null;
  photos: string[];
  detected_deal: string | null;
  detected_category: string | null;
  detected_price: number | null;
  detected_area: number | null;
  detected_address: string | null;
  detected_district: string | null;
  detected_phone: string | null;
  confidence: number | null;
  status: string;
  route_to: string | null;
  result_lead_id: number | null;
  result_listing_id: number | null;
  created_at: string;
}

interface ApproveForm {
  name: string;
  phone: string;
  message: string;
  budget: string;
  lead_type: string;
  category: string;
  deal: string;
  price: string;
  area: string;
  address: string;
  district: string;
  description: string;
  status: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', warehouse: 'Склад', production: 'Производство',
  catering: 'Общепит', free_purpose: 'ПСН', building: 'Здание', land: 'Земля',
  car_service: 'Автосервис', gab: 'ГАБ', hotel: 'Гостиница', other: 'Прочее',
};

const DEAL_LABELS: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' };

const PLATFORM_ICONS: Record<string, { label: string; color: string; icon: string }> = {
  vk:       { label: 'ВКонтакте',     color: 'text-blue-600',   icon: 'Users' },
  ok:       { label: 'Одноклассники', color: 'text-orange-500', icon: 'Users' },
  telegram: { label: 'Telegram',      color: 'text-sky-500',    icon: 'Send' },
};

const CATEGORIES_LIST = [
  { id: 'office', label: 'Офис' }, { id: 'retail', label: 'Торговое' },
  { id: 'warehouse', label: 'Склад' }, { id: 'production', label: 'Производство' },
  { id: 'catering', label: 'Общепит' }, { id: 'free_purpose', label: 'ПСН' },
  { id: 'building', label: 'Здание' }, { id: 'land', label: 'Земля' },
  { id: 'car_service', label: 'Автосервис' }, { id: 'gab', label: 'ГАБ' },
];

const DISTRICTS_LIST = ['ФМР', 'ЦМР', 'ЮМР', 'Гидрострой', 'Музыкальный', 'Прикубанский', 'Карасунский', 'Западный'];

export default function SocialQueuePanel({
  token, apiUrl, onUpdate,
}: { token: string; apiUrl: string; onUpdate: () => void }) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [approvePost, setApprovePost] = useState<SocialPost | null>(null);
  const [approveRoute, setApproveRoute] = useState<'leads' | 'listings' | 'market'>('leads');
  const [approveForm, setApproveForm] = useState<ApproveForm | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejectPost, setRejectPost] = useState<SocialPost | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

  const post = async (body: object) => {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify(body),
    }).then(r => r.json());
    return r;
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await post({
        action: 'queue_list',
        platform: filterPlatform,
        status: filterStatus,
        limit: 20,
      });
      if (!r.error) {
        setPosts(r.posts || []);
        setTotal(r.total || 0);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterPlatform, filterStatus]);

  const openApprove = (p: SocialPost, route: 'leads' | 'listings' | 'market') => {
    setApprovePost(p);
    setApproveRoute(route);
    setApproveForm({
      name: p.author_name || '',
      phone: p.detected_phone || '',
      message: (p.raw_text || '').slice(0, 300),
      budget: p.detected_price ? String(p.detected_price) : '',
      lead_type: p.detected_deal === 'rent' ? 'offer' : 'offer',
      category: p.detected_category || 'office',
      deal: p.detected_deal || 'sale',
      price: p.detected_price ? String(p.detected_price) : '',
      area: p.detected_area ? String(p.detected_area) : '',
      address: p.detected_address || '',
      district: p.detected_district || '',
      description: p.raw_text || '',
      status: 'moderation',
    });
  };

  const handleApprove = async () => {
    if (!approvePost || !approveForm) return;
    setApproving(true);
    try {
      const override = approveRoute === 'leads'
        ? { name: approveForm.name, phone: approveForm.phone, message: approveForm.message, budget: approveForm.budget ? Number(approveForm.budget) : null, lead_type: approveForm.lead_type }
        : { category: approveForm.category, deal: approveForm.deal, price: approveForm.price ? Number(approveForm.price) : null, area: approveForm.area ? Number(approveForm.area) : null, address: approveForm.address, district: approveForm.district, description: approveForm.description, status: approveForm.status };

      const r = await post({ action: 'queue_approve', post_id: approvePost.id, route: approveRoute, override });
      if (r.error) { toast.error(r.error); return; }

      const msg = approveRoute === 'leads'
        ? `Заявка #${r.lead_id} создана`
        : approveRoute === 'listings'
          ? `Объект #${r.listing_id} создан`
          : 'Добавлено в статистику';
      toast.success(msg);
      setApprovePost(null);
      load(); onUpdate();
    } finally { setApproving(false); }
  };

  const handleReject = async () => {
    if (!rejectPost) return;
    setRejecting(true);
    try {
      const r = await post({ action: 'queue_reject', post_id: rejectPost.id, reason: rejectReason });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Пост отклонён');
      setRejectPost(null);
      setRejectReason('');
      load(); onUpdate();
    } finally { setRejecting(false); }
  };

  const fmtDate = (s: string | null) => {
    if (!s) return '';
    return new Date(s).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const fmtMoney = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
    if (n >= 1_000) return `${Math.round(n / 1_000)} тыс`;
    return String(n);
  };

  const confidenceColor = (c: number | null) => {
    if (!c) return 'text-muted-foreground';
    if (c >= 0.7) return 'text-green-600';
    if (c >= 0.4) return 'text-amber-600';
    return 'text-red-500';
  };

  return (
    <div className="space-y-3">
      {/* Фильтры */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {[
            { id: 'pending',           label: 'Ожидают' },
            { id: 'approved_lead',     label: 'В заявки' },
            { id: 'approved_listing',  label: 'В объекты' },
            { id: 'rejected',          label: 'Отклонены' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setFilterStatus(s.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                filterStatus === s.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white border-border text-foreground/70'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {['', 'vk', 'ok', 'telegram'].map(p => (
            <button
              key={p}
              onClick={() => setFilterPlatform(p)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                filterPlatform === p ? 'bg-slate-700 text-white border-slate-700' : 'bg-white border-border text-foreground/70'
              }`}
            >
              {p === '' ? 'Все' : p === 'vk' ? 'VK' : p === 'ok' ? 'OK' : 'TG'}
            </button>
          ))}
        </div>
      </div>

      {/* Счётчик */}
      <p className="text-xs text-muted-foreground">
        Найдено: {total} постов
      </p>

      {/* Посты */}
      {loading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <Icon name="Loader2" size={20} className="animate-spin mx-auto mb-2" />Загрузка…
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-8 text-center">
          <Icon name="ClipboardList" size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">
            {filterStatus === 'pending' ? 'Нет постов, ожидающих проверки' : 'Нет постов с таким статусом'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(p => {
            const plt = PLATFORM_ICONS[p.platform] || { label: p.platform, color: 'text-slate-500', icon: 'Globe' };
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-border overflow-hidden">
                {/* Заголовок поста */}
                <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/50">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`font-semibold ${plt.color}`}>
                      <Icon name={plt.icon} size={12} className="inline mr-0.5" />
                      {plt.label}
                    </span>
                    <span>·</span>
                    <span>{p.source_id}</span>
                    {p.author_name && <><span>·</span><span>{p.author_name}</span></>}
                    {p.post_date && <><span>·</span><span>{fmtDate(p.post_date)}</span></>}
                  </div>
                  {p.post_url && (
                    <a href={p.post_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                      <Icon name="ExternalLink" size={11} />Оригинал
                    </a>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  {/* Текст поста */}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-4">
                    {p.raw_text || '—'}
                  </p>

                  {/* Фото */}
                  {p.photos && p.photos.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {p.photos.slice(0, 6).map((ph, i) => (
                        <button
                          key={i}
                          onClick={() => setExpandedPhoto(ph)}
                          className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted border border-border hover:opacity-90 transition"
                        >
                          <img src={ph} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </button>
                      ))}
                      {p.photos.length > 6 && (
                        <div className="w-16 h-16 rounded-lg flex-shrink-0 bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          +{p.photos.length - 6}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Распознанные поля */}
                  <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1 mb-1">
                      <Icon name="Bot" size={12} className="text-violet-500" />
                      <span className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide">Распознано</span>
                      {p.confidence !== null && (
                        <span className={`ml-auto text-xs font-semibold ${confidenceColor(p.confidence)}`}>
                          {Math.round((p.confidence || 0) * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {p.detected_deal && (
                        <div className="flex gap-1">
                          <span className="text-muted-foreground">Сделка:</span>
                          <span className="font-medium">{DEAL_LABELS[p.detected_deal] || p.detected_deal}</span>
                        </div>
                      )}
                      {p.detected_category && (
                        <div className="flex gap-1">
                          <span className="text-muted-foreground">Тип:</span>
                          <span className="font-medium">{CATEGORY_LABELS[p.detected_category] || p.detected_category}</span>
                        </div>
                      )}
                      {p.detected_price && (
                        <div className="flex gap-1">
                          <span className="text-muted-foreground">Цена:</span>
                          <span className="font-medium">{fmtMoney(p.detected_price)} ₽</span>
                        </div>
                      )}
                      {p.detected_area && (
                        <div className="flex gap-1">
                          <span className="text-muted-foreground">Площадь:</span>
                          <span className="font-medium">{p.detected_area} м²</span>
                        </div>
                      )}
                      {p.detected_phone && (
                        <div className="flex gap-1">
                          <span className="text-muted-foreground">Телефон:</span>
                          <span className="font-medium">{p.detected_phone}</span>
                        </div>
                      )}
                      {p.detected_district && (
                        <div className="flex gap-1">
                          <span className="text-muted-foreground">Район:</span>
                          <span className="font-medium">{p.detected_district}</span>
                        </div>
                      )}
                      {p.detected_address && (
                        <div className="flex gap-1 col-span-2">
                          <span className="text-muted-foreground">Адрес:</span>
                          <span className="font-medium">{p.detected_address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Кнопки действий */}
                  {p.status === 'pending' && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => openApprove(p, 'leads')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold"
                      >
                        <Icon name="UserCheck" size={12} />
                        В заявки
                      </button>
                      <button
                        onClick={() => openApprove(p, 'listings')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-semibold"
                      >
                        <Icon name="Building2" size={12} />
                        В объекты
                      </button>
                      <button
                        onClick={() => openApprove(p, 'market')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                      >
                        <Icon name="BarChart2" size={12} />
                        В статистику
                      </button>
                      <button
                        onClick={() => { setRejectPost(p); setRejectReason(''); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold ml-auto"
                      >
                        <Icon name="X" size={12} />
                        Отклонить
                      </button>
                    </div>
                  )}
                  {p.status === 'approved_lead' && (
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <Icon name="CheckCircle2" size={14} />
                      Отправлено в заявки{p.result_lead_id ? ` (заявка #${p.result_lead_id})` : ''}
                    </div>
                  )}
                  {p.status === 'approved_listing' && (
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <Icon name="CheckCircle2" size={14} />
                      Отправлено в объекты{p.result_listing_id ? ` (объект #${p.result_listing_id})` : ''}
                    </div>
                  )}
                  {p.status === 'rejected' && (
                    <div className="flex items-center gap-2 text-xs text-red-500">
                      <Icon name="XCircle" size={14} />
                      Отклонено
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модал: одобрение → заявка */}
      {approvePost && approveRoute === 'leads' && approveForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-semibold flex items-center gap-2">
                <Icon name="UserCheck" size={16} className="text-blue-600" />
                Создать заявку
              </h3>
              <button onClick={() => setApprovePost(null)} className="p-1 hover:bg-muted rounded-lg"><Icon name="X" size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Имя</label>
                  <input value={approveForm.name} onChange={e => setApproveForm(f => f && ({ ...f, name: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Телефон</label>
                  <input value={approveForm.phone} onChange={e => setApproveForm(f => f && ({ ...f, phone: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Бюджет, руб</label>
                <input type="number" value={approveForm.budget} onChange={e => setApproveForm(f => f && ({ ...f, budget: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Комментарий</label>
                <textarea value={approveForm.message} onChange={e => setApproveForm(f => f && ({ ...f, message: e.target.value }))}
                  rows={3}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
              </div>
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">
                Источник: <strong>social_{approvePost.platform}</strong> · Статус: <strong>new</strong>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-border">
              <button onClick={() => setApprovePost(null)} className="px-4 py-2 border border-border rounded-xl text-sm">Отмена</button>
              <button onClick={handleApprove} disabled={approving}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                {approving && <Icon name="Loader2" size={14} className="animate-spin" />}
                Создать заявку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модал: одобрение → объект */}
      {approvePost && approveRoute === 'listings' && approveForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-semibold flex items-center gap-2">
                <Icon name="Building2" size={16} className="text-green-600" />
                Создать объект
              </h3>
              <button onClick={() => setApprovePost(null)} className="p-1 hover:bg-muted rounded-lg"><Icon name="X" size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
                  <select value={approveForm.category} onChange={e => setApproveForm(f => f && ({ ...f, category: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30">
                    {CATEGORIES_LIST.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Тип сделки</label>
                  <select value={approveForm.deal} onChange={e => setApproveForm(f => f && ({ ...f, deal: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30">
                    <option value="sale">Продажа</option>
                    <option value="rent">Аренда</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Цена, руб</label>
                  <input type="number" value={approveForm.price} onChange={e => setApproveForm(f => f && ({ ...f, price: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Площадь, м²</label>
                  <input type="number" value={approveForm.area} onChange={e => setApproveForm(f => f && ({ ...f, area: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Адрес</label>
                <input value={approveForm.address} onChange={e => setApproveForm(f => f && ({ ...f, address: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Район</label>
                <select value={approveForm.district} onChange={e => setApproveForm(f => f && ({ ...f, district: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30">
                  <option value="">— Не указан —</option>
                  {DISTRICTS_LIST.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
                <textarea value={approveForm.description} onChange={e => setApproveForm(f => f && ({ ...f, description: e.target.value }))}
                  rows={3} className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 resize-none" />
              </div>
              {approvePost.photos && approvePost.photos.length > 0 && (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">
                  <Icon name="Image" size={12} className="inline mr-1" />
                  {approvePost.photos.length} фото будут добавлены к объекту
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Статус объекта</label>
                <select value={approveForm.status} onChange={e => setApproveForm(f => f && ({ ...f, status: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30">
                  <option value="moderation">На модерации</option>
                  <option value="draft">Черновик</option>
                  <option value="active">Активный</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-border">
              <button onClick={() => setApprovePost(null)} className="px-4 py-2 border border-border rounded-xl text-sm">Отмена</button>
              <button onClick={handleApprove} disabled={approving}
                className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                {approving && <Icon name="Loader2" size={14} className="animate-spin" />}
                Создать объект
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модал: одобрение → рыночная статистика */}
      {approvePost && approveRoute === 'market' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="p-5">
              <h3 className="font-semibold mb-2">Добавить в рыночную статистику?</h3>
              <p className="text-sm text-muted-foreground">
                Пост будет сохранён в базу рыночных объявлений для аналитики цен. Брокеру не поступит никаких уведомлений.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button onClick={() => setApprovePost(null)} className="px-4 py-2 border border-border rounded-xl text-sm">Отмена</button>
              <button onClick={handleApprove} disabled={approving}
                className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                {approving && <Icon name="Loader2" size={14} className="animate-spin" />}
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модал: отклонение */}
      {rejectPost && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="p-5">
              <h3 className="font-semibold mb-3">Отклонить пост</h3>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Причина (необязательно)…"
                rows={3}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button onClick={() => setRejectPost(null)} className="px-4 py-2 border border-border rounded-xl text-sm">Отмена</button>
              <button onClick={handleReject} disabled={rejecting}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                {rejecting && <Icon name="Loader2" size={14} className="animate-spin" />}
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Просмотр фото */}
      {expandedPhoto && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setExpandedPhoto(null)}>
          <img src={expandedPhoto} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}