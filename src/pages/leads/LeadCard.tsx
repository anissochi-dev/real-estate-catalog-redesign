import Icon from '@/components/ui/icon';
import { PublicLead, District } from '@/lib/api';

export function fmtBudget(from: number | null, to: number | null): string {
  if (!from && !to) return 'Договорная';
  if (from && to) {
    const fmt = (v: number) => v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)} млн ₽`
      : `${Math.round(v / 1_000)} тыс ₽`;
    return `${fmt(from)} – ${fmt(to)}`;
  }
  const v = from || to!;
  const s = v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)} млн ₽`
    : `${Math.round(v / 1_000)} тыс ₽`;
  return from ? `от ${s}` : `до ${s}`;
}

export function fmtArea(from: number | null, to: number | null): string {
  if (!from && !to) return 'Не указана';
  if (from && to) return `${from.toLocaleString('ru')} – ${to.toLocaleString('ru')} м²`;
  if (from) return `от ${from.toLocaleString('ru')} м²`;
  return `до ${to!.toLocaleString('ru')} м²`;
}

export function fmtDate(s: string | null): string {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return s;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d',
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export const CATEGORY_LABELS: Record<string, string> = {
  office: 'Офис',
  retail: 'Магазин / торговое',
  warehouse: 'Склад',
  restaurant: 'Общепит',
  hotel: 'Гостиница / Хостел',
  business: 'Готовый бизнес',
  gab: 'ГАБ',
  production: 'Производство',
  land: 'Земля',
  building: 'Здание',
  free_purpose: 'Своб. назначения',
  car_service: 'Автосервис',
};

const CATEGORY_ICONS: Record<string, string> = {
  office: 'Building2',
  retail: 'ShoppingBag',
  warehouse: 'Warehouse',
  restaurant: 'UtensilsCrossed',
  hotel: 'Hotel',
  business: 'Briefcase',
  gab: 'LayoutGrid',
  production: 'Factory',
  land: 'Map',
  building: 'Building',
  free_purpose: 'Layers',
  car_service: 'Car',
};

export default function LeadCard({ lead, districts, onContact }: { lead: PublicLead; districts: District[]; onContact: () => void }) {
  const displayName = lead.name || `Клиент #${lead.id}`;
  const color = avatarColor(displayName);
  const typeLabel = lead.property_type === 'sale' ? 'Продажа' : lead.property_type === 'rent' ? 'Аренда' : null;
  const typeSale = lead.property_type === 'sale';
  const cat = lead.property_category || lead.request_category;
  const catLabel = cat ? CATEGORY_LABELS[cat] || cat : null;
  const catIcon = cat ? CATEGORY_ICONS[cat] || 'Tag' : 'Tag';
  const isUpdated = lead.updated_at && lead.updated_at !== lead.created_at;
  const displayDate = fmtDate(isUpdated ? lead.updated_at! : lead.created_at);
  const dateLabel = isUpdated ? 'Обновлено' : 'Добавлено';
  const budgetStr = fmtBudget(lead.budget, lead.budget_to);
  const areaStr = fmtArea(lead.area_from, lead.area_to);
  const districtNames = (lead.district_ids || [])
    .map(id => districts.find(d => d.id === id)?.name)
    .filter(Boolean) as string[];

  const titleParts: string[] = [];
  if (typeLabel) titleParts.push(typeLabel);
  if (catLabel) titleParts.push(catLabel);
  if (districtNames.length > 0) titleParts.push(districtNames[0]);
  if (areaStr && areaStr !== 'Не указана') titleParts.push(areaStr);
  if (budgetStr && budgetStr !== 'Договорная') titleParts.push(budgetStr);
  const cardTitle = titleParts.length > 0 ? titleParts.join(' · ') : null;

  return (
    <article className="bg-white rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-brand-blue/25 transition-all duration-200 p-6">
      {/* Шапка: аватар + название */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ background: color }}
        >
          <Icon name="User" size={20} />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-[17px] text-foreground leading-tight">
            {cardTitle || `Заявка #${lead.id}`}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">№{lead.id}</div>
          {lead.is_network_tenant && (
            <div className="truncate">
              {lead.company && <span className="text-[15px] font-semibold text-red-600">{lead.company} </span>}
              <span className="text-sm text-brand-blue font-medium">• Федеральная сеть</span>
            </div>
          )}
        </div>
      </div>

      {/* Бейджи: тип + категория + районы */}
      <div className="flex flex-wrap gap-2 mb-3">
        {typeLabel && (
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full ${
            typeSale ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'
          }`}>
            <Icon name={typeSale ? 'TrendingUp' : 'Handshake'} size={13} />
            {typeLabel}
          </span>
        )}
        {catLabel && (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            <Icon name={catIcon} size={13} />
            {catLabel}
          </span>
        )}
        {districtNames.map(name => (
          <span key={name} className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">
            <Icon name="MapPin" size={13} />
            {name}
          </span>
        ))}
      </div>

      {/* Параметры: бюджет, площадь, коммуникации */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 bg-slate-50 rounded-xl px-4 py-3 mb-4 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Icon name="Wallet" size={14} className="text-muted-foreground" />
          <span className="text-muted-foreground">Бюджет:</span>
          <span className={`font-semibold ${budgetStr === 'Договорная' ? 'text-muted-foreground font-normal' : ''}`}>
            {budgetStr}
          </span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <Icon name="Maximize2" size={14} className="text-muted-foreground" />
          <span className="text-muted-foreground">Площадь:</span>
          <span className={`font-semibold ${areaStr === 'Не указана' ? 'text-muted-foreground font-normal' : ''}`}>
            {areaStr}
          </span>
        </div>
        {lead.utilities && (
          <div className="flex items-center gap-2 text-foreground">
            <Icon name="Zap" size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">Коммуникации:</span>
            <span className="font-semibold">{lead.utilities}</span>
          </div>
        )}
      </div>

      {/* Описание */}
      {lead.message && (
        <div className="text-[15px] leading-relaxed text-foreground/85 py-4 border-t border-b border-slate-100 mb-4">
          {lead.message}
        </div>
      )}

      {/* Футер */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Icon name="Clock" size={13} />
          {dateLabel} {displayDate}
        </div>
        <button
          onClick={onContact}
          aria-label={`Связаться по заявке №${lead.id}`}
          className="btn-blue text-white px-5 py-2 rounded-full font-semibold text-sm inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Icon name="Phone" size={14} />
          Связаться
        </button>
      </div>
    </article>
  );
}