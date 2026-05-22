import type { ListingDetail } from '@/lib/api';
import Icon from '@/components/ui/icon';
import PropertyMapInfrastructure from '@/components/PropertyMapInfrastructure';
import PropertyCalculators from '@/components/calculators/PropertyCalculators';
import InvestmentModel from '@/components/property/InvestmentModel';
import SimilarListings from '@/components/SimilarListings';
import RecentlyViewed from '@/components/RecentlyViewed';
import CharCount from '@/components/ui/CharCount';
import {
  CONDITION_LABELS, FINISHING_LABELS, PARKING_LABELS,
  ENTRANCE_LABELS, UTILITY_ICONS, ROAD_LINE_LABELS, PURPOSE_LABELS,
} from './propertyLabels';

interface Props {
  item: ListingDetail;
  dealLabel: string;
  typeLabel: string;
  sent: boolean;
  sending: boolean;
  form: { name: string; phone: string; message: string };
  setForm: (f: { name: string; phone: string; message: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function ParamCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-2.5 py-2">
      <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
        <Icon name={icon} size={12} className="text-brand-blue" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground leading-none">{label}</div>
        <div className="font-display font-700 text-xs leading-tight mt-0.5 truncate">{value}</div>
      </div>
    </div>
  );
}

export default function PropertyMainContent({
  item, dealLabel, typeLabel, sent, sending, form, setForm, onSubmit,
}: Props) {
  const itemExt = item as ListingDetail & { condition?: string; parking?: string; entrance?: string };
  const addressStr = [item.city || 'Краснодар', item.district, item.address].filter(Boolean).join(', ');

  return (
    <>
      {/* Название */}
      <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
        <h1 className="font-display font-800 text-xl md:text-2xl text-foreground">{item.title}</h1>
      </div>

      {/* Адрес — отдельный блок между названием и параметрами */}
      <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => document.getElementById('property-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="w-full inline-flex items-start gap-2 text-left text-sm text-foreground hover:text-brand-blue transition-colors group"
        >
          <Icon name="MapPin" size={16} className="flex-shrink-0 text-brand-blue mt-0.5" />
          <span className="flex-1">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Адрес</span>
            <span className="font-medium leading-snug group-hover:underline underline-offset-2">{addressStr}</span>
          </span>
          {item.lat && item.lng ? (
            <Icon name="Map" size={14} className="opacity-50 group-hover:opacity-100 transition-opacity mt-0.5" />
          ) : null}
        </button>
      </div>

      {/* Параметры объекта */}
      <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
        <div className="font-display font-700 text-base mb-3">Параметры объекта</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <ParamCard icon="Maximize" label="Площадь" value={`${item.area} м²`} />
          <ParamCard icon="Briefcase" label="Тип сделки" value={dealLabel} />
          <ParamCard icon="Building2" label="Тип объекта" value={typeLabel} />
          {item.floor ? <ParamCard icon="Layers" label="Этаж" value={`${item.floor}${item.totalFloors ? ` из ${item.totalFloors}` : ''}`} /> : null}
          {(item as ListingDetail).rooms ? <ParamCard icon="LayoutGrid" label="Комнат" value={String((item as ListingDetail).rooms)} /> : null}
          {item.purpose ? <ParamCard icon="Target" label="Назначение" value={
            item.purpose.includes('|')
              ? item.purpose.split('|').map(s => s.trim()).filter(Boolean).join(', ')
              : (PURPOSE_LABELS[item.purpose] || item.purpose)
          } /> : null}
          {item.ceilingHeight ? <ParamCard icon="MoveVertical" label="Высота потолка" value={`${item.ceilingHeight} м`} /> : null}
          {item.electricityKw ? <ParamCard icon="Zap" label="Эл. мощность" value={`${item.electricityKw} кВт`} /> : null}
          {itemExt.condition ? (
            <ParamCard icon="CheckCircle2" label="Состояние" value={CONDITION_LABELS[itemExt.condition] || itemExt.condition} />
          ) : null}
          {item.finishing ? <ParamCard icon="Paintbrush" label="Отделка" value={FINISHING_LABELS[item.finishing] || item.finishing} /> : null}
          {itemExt.parking && itemExt.parking !== 'none' ? (
            <ParamCard icon="ParkingSquare" label="Парковка" value={PARKING_LABELS[itemExt.parking] || itemExt.parking} />
          ) : null}
          {itemExt.entrance ? (
            <ParamCard icon="DoorOpen" label="Вход" value={ENTRANCE_LABELS[itemExt.entrance] || itemExt.entrance} />
          ) : null}
          {item.roadLine ? <ParamCard icon="Milestone" label="Линия расположения" value={ROAD_LINE_LABELS[item.roadLine] || item.roadLine} /> : null}
          {item.payback ? <ParamCard icon="TrendingUp" label="Окупаемость" value={`${item.payback} мес${item.payback >= 12 ? ` (~${(item.payback / 12).toFixed(1)} лет)` : ''}`} /> : null}
          {item.monthlyRent ? <ParamCard icon="Wallet" label="Арендный поток/мес" value={`${item.monthlyRent.toLocaleString('ru')} ₽`} /> : null}
          {item.yearlyRent ? <ParamCard icon="Coins" label="Арендный поток/год" value={`${item.yearlyRent.toLocaleString('ru')} ₽`} /> : null}
          {item.profit && !item.monthlyRent ? <ParamCard icon="LineChart" label="Прибыль/мес" value={`${(item.profit / 1000).toFixed(0)} тыс ₽`} /> : null}
          {item.tenantName ? <ParamCard icon="Users" label="Арендатор" value={item.tenantName} /> : null}
        </div>

        {/* Коммуникации */}
        {item.utilities && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="font-display font-700 text-sm mb-2">Коммуникации</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {item.utilities.split(',').map(u => u.trim()).filter(Boolean).map(u => {
                const [key, val] = u.includes(':') ? u.split(':').map(s => s.trim()) : [u, ''];
                const icon = UTILITY_ICONS[key] || 'Plug';
                return (
                  <div key={u} className="flex items-center gap-2 bg-muted/40 rounded-lg px-2.5 py-2">
                    <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Icon name={icon} size={12} className="text-brand-blue" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground leading-tight truncate">{key}</div>
                      {val && <div className="font-600 text-xs leading-tight truncate">{val}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Назначение — отдельный блок */}
      {item.purpose && (
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
          <div className="font-display font-700 text-base mb-3 flex items-center gap-2">
            <Icon name="Target" size={16} className="text-brand-blue" /> Подходящее назначение
          </div>
          <div className="flex flex-wrap gap-2">
            {(item.purpose.includes('|')
              ? item.purpose.split('|').map(s => s.trim()).filter(Boolean)
              : [PURPOSE_LABELS[item.purpose] || item.purpose]
            ).map(name => (
              <span key={name} className="inline-flex items-center gap-1.5 text-sm bg-brand-blue/8 text-brand-blue border border-brand-blue/20 px-3 py-1.5 rounded-xl font-medium">
                <Icon name="CheckCircle2" size={13} />
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Описание */}
      {item.description && (
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
          <div className="font-display font-700 text-base mb-2">Описание</div>
          <div className="text-sm whitespace-pre-wrap text-foreground/80 leading-relaxed">{item.description}</div>
        </div>
      )}

      {/* Карта */}
      {(!!item.lat && !!item.lng) && (
        <div id="property-map" className="bg-white rounded-2xl px-4 py-3 shadow-sm">
          <div className="font-display font-700 text-base mb-0.5 flex items-center gap-2">
            <Icon name="Map" size={16} /> Расположение и инфраструктура
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Выберите категорию — объекты в радиусе 800 м
          </p>
          <PropertyMapInfrastructure lat={item.lat} lng={item.lng} title={item.title} address={addressStr} />
        </div>
      )}

      {/* Форма заявки */}
      <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
        <div className="font-display font-700 text-base mb-3 flex items-center gap-2">
          <Icon name="CalendarCheck" size={16} className="text-brand-blue" /> Заказать просмотр
        </div>
        {sent ? (
          <div className="py-4 text-center">
            <Icon name="CheckCircle2" size={36} className="mx-auto mb-2 text-emerald-500" />
            <div className="font-semibold">Заявка отправлена!</div>
            <div className="text-sm text-muted-foreground mt-1">Менеджер свяжется с вами в течение 15 минут.</div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input required placeholder="Ваше имя" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
            <input required placeholder="Телефон" value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
            <div className="sm:col-span-2">
              <CharCount as="textarea" placeholder="Комментарий (необязательно)" rows={2} max={500} warnAt={400}
                value={form.message} onChange={e => setForm({ ...form, message: (e.target as HTMLTextAreaElement).value })}
                className="text-sm" />
            </div>
            <button type="submit" disabled={sending}
              className="sm:col-span-2 w-full btn-blue text-white py-2.5 rounded-xl font-semibold disabled:opacity-50 text-sm">
              {sending ? 'Отправка...' : 'Заказать просмотр'}
            </button>
          </form>
        )}
      </div>

      {/* Инвестиционная NOI-модель (AI) — над финансовыми калькуляторами */}
      <InvestmentModel
        listingId={item.id}
        price={item.price}
        area={item.area}
        deal={item.deal}
      />

      {/* Калькулятор */}
      <PropertyCalculators
        price={item.price}
        area={item.area}
        deal={item.deal}
        type={item.type}
        payback={item.payback}
        profit={item.profit}
        pricePerM2={item.pricePerM2}
      />

      {/* Особенности */}
      {item.tags && item.tags.length > 0 && (
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
          <div className="font-display font-700 text-base mb-2">Особенности</div>
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map(t => (
              <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue font-medium">{t}</span>
            ))}
          </div>
        </div>
      )}

      <SimilarListings listingId={item.id} />
      <RecentlyViewed currentId={item.id} />
    </>
  );
}