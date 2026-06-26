import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import { fetchPublicLeads, PublicLead } from '@/lib/api';
import { fmtBudget, fmtArea, CATEGORY_LABELS } from '@/pages/leads/LeadCard';

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

const AVATAR_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d',
];
function avatarColor(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

interface Props {
  limit?: number;
}

function HomeLeadCard({ lead }: { lead: PublicLead }) {
  const color = avatarColor(lead.id);
  const typeLabel = lead.property_type === 'sale' ? 'Продажа' : lead.property_type === 'rent' ? 'Аренда' : null;
  const typeSale = lead.property_type === 'sale';
  const cat = lead.property_category || lead.request_category;
  const catLabel = cat ? CATEGORY_LABELS[cat] || cat : null;
  const catIcon = cat ? CATEGORY_ICONS[cat] || 'Tag' : 'Tag';
  const budgetStr = fmtBudget(lead.budget, lead.budget_to);
  const areaStr = fmtArea(lead.area_from, lead.area_to);

  const titleParts: string[] = [];
  if (typeLabel) titleParts.push(typeLabel);
  if (catLabel) titleParts.push(catLabel);
  if (areaStr && areaStr !== 'Не указана') titleParts.push(areaStr);
  if (budgetStr && budgetStr !== 'Договорная') titleParts.push(budgetStr);
  const cardTitle = titleParts.length > 0 ? titleParts.join(' · ') : null;

  return (
    <article role="listitem" className="bg-white rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-brand-blue/25 transition-all duration-200 p-5 flex flex-col">
      {/* Шапка */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0"
          style={{ background: color }}
        >
          <Icon name="User" size={16} />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-[15px] text-foreground leading-tight truncate">
            {cardTitle || `Заявка #${lead.id}`}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">№{lead.id}
            {lead.is_network_tenant && lead.company && (
              <span className="ml-2 text-brand-blue font-medium">• {lead.company}</span>
            )}
          </div>
        </div>
      </div>

      {/* Бейджи */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {typeLabel && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            typeSale ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'
          }`}>
            <Icon name={typeSale ? 'TrendingUp' : 'Handshake'} size={11} />
            {typeLabel}
          </span>
        )}
        {catLabel && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            <Icon name={catIcon} size={11} />
            {catLabel}
          </span>
        )}
      </div>

      {/* Параметры */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 bg-slate-50 rounded-xl px-3 py-2 mb-3 text-xs">
        <div className="flex items-center gap-1.5 text-foreground">
          <Icon name="Wallet" size={12} className="text-muted-foreground" />
          <span className="text-muted-foreground">Бюджет:</span>
          <span className={`font-semibold ${budgetStr === 'Договорная' ? 'text-muted-foreground font-normal' : ''}`}>
            {budgetStr}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-foreground">
          <Icon name="Maximize2" size={12} className="text-muted-foreground" />
          <span className="text-muted-foreground">Площадь:</span>
          <span className={`font-semibold ${areaStr === 'Не указана' ? 'text-muted-foreground font-normal' : ''}`}>
            {areaStr}
          </span>
        </div>
      </div>

      {/* Описание */}
      {lead.message && (
        <div className="text-[13px] leading-relaxed text-foreground/80 mb-4 flex-1 line-clamp-4">
          {lead.message}
        </div>
      )}

      {/* Кнопка */}
      <Link
        to="/leads"
        className="btn-orange text-white px-4 py-2 rounded-xl text-sm font-semibold font-display inline-flex items-center justify-center gap-2 mt-auto"
      >
        <Icon name="ArrowRight" size={15} />
        Подробнее о заявке
      </Link>
    </article>
  );
}

export default function ClientLeadsSection({ limit = 6 }: Props) {
  const [leads, setLeads] = useState<PublicLead[]>([]);

  useEffect(() => {
    fetchPublicLeads({ limit, sort: 'newest' })
      .then(r => setLeads(r.leads))
      .catch(() => undefined);
  }, [limit]);

  if (!leads.length) return null;

  return (
    <section className="py-6 bg-white">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display font-700 text-base text-foreground flex items-center gap-2 mb-1">
              <Icon name="Users" size={16} className="text-brand-blue" />
              Куплю и сниму недвижимость в Краснодаре — актуальные заявки
            </h2>
            <p className="text-xs text-muted-foreground max-w-xl">
              Есть подходящий объект? Предложите его клиенту — заявка попадёт нашему менеджеру.
            </p>
          </div>
          <Link
            to="/leads"
            aria-label="Смотреть все заявки клиентов"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 sm:justify-start px-4 py-2.5 sm:px-0 sm:py-0 rounded-xl sm:rounded-none border border-brand-blue/30 sm:border-0 bg-brand-blue/5 sm:bg-transparent text-brand-blue font-semibold text-sm sm:hover:gap-3 transition-all duration-200 shrink-0"
          >
            Смотреть все заявки <Icon name="ArrowRight" size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="list">
          {leads.slice(0, limit).map(lead => (
            <HomeLeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      </div>
    </section>
  );
}
