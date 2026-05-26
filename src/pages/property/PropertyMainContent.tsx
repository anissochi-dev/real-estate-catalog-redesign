import type { ListingDetail } from '@/lib/api';
import Icon from '@/components/ui/icon';
import PublicPhoneInput from '@/components/PublicPhoneInput';
import PropertyMapInfrastructure from '@/components/PropertyMapInfrastructure';
import InvestmentModel from '@/components/property/InvestmentModel';
import SimilarListings from '@/components/SimilarListings';
import {
  CONDITION_LABELS, FINISHING_LABELS, PARKING_LABELS,
  ENTRANCE_LABELS, UTILITY_ICONS, ROAD_LINE_LABELS,
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
    <div className="flex items-start gap-2.5 bg-muted/40 rounded-xl px-3 py-2.5">
      <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
        <Icon name={icon} size={14} className="text-brand-blue" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
        <div className="font-display font-700 text-sm leading-tight mt-0.5 break-words">{value}</div>
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
      {/* Название и адрес */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h1 className="font-display font-800 text-2xl md:text-3xl text-foreground mb-2">{item.title}</h1>
        <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon name="MapPin" size={14} className="flex-shrink-0 text-brand-blue" />
          <span>{addressStr}</span>
        </div>
      </div>

      {/* Инвестиционная NOI-модель (AI) — между адресом и параметрами */}
      <InvestmentModel
        listingId={item.id}
        price={item.price}
        area={item.area}
        deal={item.deal}
      />

      {/* Параметры объекта */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="font-display font-700 text-lg mb-4">Параметры объекта</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <ParamCard icon="Maximize" label="Площадь" value={`${item.area} м²`} />
          <ParamCard icon="Briefcase" label="Тип сделки" value={dealLabel} />
          <ParamCard icon="Building2" label="Тип объекта" value={typeLabel} />
          {item.floor ? <ParamCard icon="Layers" label="Этаж" value={`${item.floor}${item.totalFloors ? ` из ${item.totalFloors}` : ''}`} /> : null}
          {item.purpose ? <ParamCard icon="Target" label="Назначение" value={item.purpose} /> : null}
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
          <div className="mt-5 pt-4 border-t border-border">
            <div className="font-display font-700 text-base mb-3">Коммуникации</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {item.utilities.split(',').map(u => u.trim()).filter(Boolean).map(u => {
                const [key, val] = u.includes(':') ? u.split(':').map(s => s.trim()) : [u, ''];
                const icon = UTILITY_ICONS[key] || 'Plug';
                return (
                  <div key={u} className="flex items-start gap-2.5 bg-muted/40 rounded-xl px-3 py-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                      <Icon name={icon} size={14} className="text-brand-blue" />
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{key}</div>
                      {val && <div className="font-display font-700 text-sm leading-tight mt-0.5">{val}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Описание */}
      {item.description && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="font-display font-700 text-lg mb-3">Описание</div>
          <div className="text-sm whitespace-pre-wrap text-foreground/85 leading-relaxed">{item.description}</div>
        </div>
      )}

      {/* Карта */}
      {(!!item.lat && !!item.lng) && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="font-display font-700 text-lg mb-1 flex items-center gap-2">
            <Icon name="Map" size={18} /> Расположение и инфраструктура
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Выберите категорию — отобразятся ближайшие объекты в радиусе 800 м
          </p>
          <PropertyMapInfrastructure
            lat={item.lat}
            lng={item.lng}
            title={item.title}
            address={addressStr}
          />
        </div>
      )}

      {/* Форма заявки — только мобильный */}
      <div className="lg:hidden bg-white rounded-2xl p-5 shadow-sm">
        <div className="font-display font-700 text-lg mb-4 flex items-center gap-2">
          <Icon name="CalendarCheck" size={18} className="text-brand-blue" /> Заказать просмотр
        </div>
        {sent ? (
          <div className="py-4 text-center">
            <Icon name="CheckCircle2" size={36} className="mx-auto mb-2 text-emerald-500" />
            <div className="font-semibold">Заявка отправлена!</div>
            <div className="text-sm text-muted-foreground mt-1">Менеджер свяжется с вами в течение 15 минут.</div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Ваше имя" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-lg text-sm" />
            <PublicPhoneInput required value={form.phone}
              onChange={v => setForm({ ...form, phone: v })}
              className="w-full px-3 py-2.5 border rounded-lg text-sm" />
            <textarea placeholder="Комментарий (необязательно)" rows={2}
              value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-lg text-sm sm:col-span-2" />
            <button type="submit" disabled={sending}
              className="sm:col-span-2 w-full btn-blue text-white py-3 rounded-xl font-semibold disabled:opacity-50">
              {sending ? 'Отправка...' : 'Заказать просмотр'}
            </button>
          </form>
        )}
      </div>



      {/* Особенности */}
      {item.tags && item.tags.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="font-display font-700 text-lg mb-3">Особенности</div>
          <div className="flex flex-wrap gap-2">
            {item.tags.map(t => (
              <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-brand-blue/10 text-brand-blue font-medium">{t}</span>
            ))}
          </div>
        </div>
      )}

      <SimilarListings listingId={item.id} />
    </>
  );
}