import { useNavigate } from 'react-router-dom';
import { Property, Page } from '@/types';
import { formatPrice } from '@/lib/formatPrice';
import Icon from '@/components/ui/icon';
import { listingSlug } from '@/lib/slug';

interface ComparePageProps {
  properties: Property[];
  onRemove: (id: number) => void;
  onNavigate: (page: Page) => void;
}

const TYPE_LABELS: Record<string, string> = {
  office: '🏢 Офис',
  retail: '🛒 Торговое помещение',
  warehouse: '🏭 Склад',
  restaurant: '🍽️ Общепит',
  business: '💼 Готовый бизнес',
  production: '⚙️ Производственное помещение',
  hotel: '🛏️ Гостиница',
  gab: '📈 ГАБ',
  land: '🌳 Земельный участок',
  building: '🏛️ Отдельно стоящее здание',
  free_purpose: '🔄 Помещение свободного назначения',
  car_service: '🔧 Автосервис',
};

const DEAL_LABELS: Record<string, string> = {
  sale: 'Продажа',
  rent: 'Аренда',
  business: 'Готовый бизнес',
};

interface CompareRow {
  label: string;
  icon: string;
  getValue: (p: Property) => string | React.ReactNode;
  highlight?: (values: string[]) => string;
}

const COMPARE_ROWS: CompareRow[] = [
  {
    label: 'Тип объекта',
    icon: 'Tag',
    getValue: (p) => TYPE_LABELS[p.type],
  },
  {
    label: 'Тип сделки',
    icon: 'FileText',
    getValue: (p) => DEAL_LABELS[p.deal],
  },
  {
    label: 'Цена',
    icon: 'CircleDollarSign',
    getValue: (p) => formatPrice(p.price, p.deal),
  },
  {
    label: 'Площадь',
    icon: 'Maximize',
    getValue: (p) => `${p.area} м²`,
  },
  {
    label: 'Цена за м²',
    icon: 'Calculator',
    getValue: (p) => p.pricePerM2 ? `${p.pricePerM2.toLocaleString()} ₽` : '—',
  },
  {
    label: 'Район',
    icon: 'MapPin',
    getValue: (p) => p.district,
  },
  {
    label: 'Этаж',
    icon: 'Layers',
    getValue: (p) => p.floor ? `${p.floor} из ${p.totalFloors}` : '—',
  },
  {
    label: 'Окупаемость',
    icon: 'TrendingUp',
    getValue: (p) => p.payback ? `${p.payback} мес.` : '—',
  },
  {
    label: 'Прибыль/мес',
    icon: 'Wallet',
    getValue: (p) => p.profit ? `${(p.profit / 1000).toFixed(0)} тыс ₽` : '—',
  },
  {
    label: 'Особенности',
    icon: 'Star',
    getValue: (p) => (
      <div className="flex flex-wrap gap-1">
        {p.tags.map(tag => (
          <span key={tag} className="tag-blue text-[10px] px-2 py-0.5 rounded-full">{tag}</span>
        ))}
      </div>
    ),
  },
];

export default function ComparePage({ properties, onRemove, onNavigate }: ComparePageProps) {
  const navigate = useNavigate();
  if (properties.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-7xl mb-6">⚖️</div>
          <h2 className="font-display font-700 text-2xl text-foreground mb-3">Нечего сравнивать</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            Добавьте от 2 до 3 объектов через кнопку сравнения в карточках
          </p>
          <button
            onClick={() => onNavigate('catalog')}
            className="btn-blue text-white px-6 py-3 rounded-xl font-semibold font-display"
          >
            Перейти в каталог
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-white border-b border-border py-5">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-brand-orange/10 flex items-center justify-center">
                <Icon name="GitCompare" size={24} className="text-brand-orange" />
              </div>
              <div>
                <h1 className="font-display font-800 text-2xl text-foreground">Сравнение объектов</h1>
                <p className="text-sm text-muted-foreground">{properties.length} объекта выбрано</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('catalog')}
              className="flex items-center gap-2 text-sm text-brand-blue font-semibold hover:opacity-80 transition-opacity"
            >
              <Icon name="Plus" size={16} />
              Добавить объект
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 overflow-x-auto">
        <div className="min-w-max">
          {/* Property headers */}
          <div className="flex gap-0 mb-0">
            {/* Row label column */}
            <div className="w-44 flex-shrink-0" />

            {/* Property cards row */}
            <div className="flex gap-4 flex-1">
              {properties.map((property, i) => (
                <div
                  key={property.id}
                  className="w-72 flex-shrink-0 bg-white rounded-t-2xl border border-b-0 border-border overflow-hidden animate-fade-in-up"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="relative">
                    <img src={property.image} alt={property.title} className="w-full h-40 object-cover" />
                    <button
                      onClick={() => onRemove(property.id)}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                    >
                      <Icon name="X" size={14} />
                    </button>
                    {property.isHot && (
                      <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full btn-orange text-white text-[11px] font-semibold">
                        🔥 Горячее
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-display font-700 text-sm leading-snug mb-1 line-clamp-2">{property.title}</h3>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Icon name="MapPin" size={11} />
                      <span className="truncate">{property.address}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Compare rows */}
          {COMPARE_ROWS.map((row, rowIdx) => (
            <div
              key={row.label}
              className={`flex gap-0 ${rowIdx === COMPARE_ROWS.length - 1 ? '' : ''}`}
            >
              {/* Label */}
              <div className="w-44 flex-shrink-0 flex items-center gap-2 py-3 pr-4 border-b border-border">
                <Icon name={row.icon} size={15} className="text-brand-blue flex-shrink-0" />
                <span className="text-xs font-semibold text-muted-foreground">{row.label}</span>
              </div>

              {/* Values */}
              <div className="flex gap-4 flex-1">
                {properties.map((property, i) => (
                  <div
                    key={property.id}
                    className={`w-72 flex-shrink-0 flex items-center px-4 py-3 border border-t-0 border-border
                      ${rowIdx === COMPARE_ROWS.length - 1 ? 'rounded-b-2xl' : ''}
                      ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-muted/30'}`}
                  >
                    <div className="font-medium text-sm text-foreground">
                      {row.getValue(property)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Action row */}
          <div className="flex gap-0 mt-0">
            <div className="w-44 flex-shrink-0" />
            <div className="flex gap-4 flex-1 mt-4">
              {properties.map(property => (
                <div key={property.id} className="w-72 flex-shrink-0 flex gap-2">
                  <button
                    onClick={() => navigate(`/object/${listingSlug(property.title, property.id)}`)}
                    className="flex-1 btn-orange text-white py-3 rounded-xl font-semibold font-display text-sm"
                  >
                    Подробнее
                  </button>
                  <button
                    onClick={() => onRemove(property.id)}
                    className="px-3 py-3 rounded-xl border-2 border-border text-muted-foreground hover:border-red-400 hover:text-red-500 transition-all duration-200"
                  >
                    <Icon name="X" size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}