import Icon from '@/components/ui/icon';
import { CadastreInfo } from './cadastreTypes';

interface Props {
  cadastreInfo: CadastreInfo | null;
}

export default function CadastreCard({ cadastreInfo }: Props) {
  if (!cadastreInfo) return null;

  if (!cadastreInfo.found && cadastreInfo.cadastral_number) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 flex flex-wrap items-center gap-2">
        <Icon name="AlertTriangle" size={13} className="flex-shrink-0" />
        <span>Объект <span className="font-mono font-semibold">{cadastreInfo.cadastral_number}</span> не найден в базе.</span>
        <a
          href={`https://pkk.rosreestr.ru/#/?text=${encodeURIComponent(cadastreInfo.cadastral_number)}&type=1`}
          target="_blank" rel="noopener noreferrer"
          className="text-amber-700 underline hover:text-amber-900 flex items-center gap-1"
        >
          <Icon name="ExternalLink" size={11} />
          Проверить на ПКК Росреестра
        </a>
        <span className="text-amber-600">— номер будет сохранён</span>
      </div>
    );
  }

  if (!cadastreInfo.found) return null;

  return (
    <div className="rounded-xl border border-brand-blue/20 bg-brand-blue/5 px-4 py-3 space-y-2">
      {/* Строка 1: номер + ссылки */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="Building2" size={15} className="text-brand-blue flex-shrink-0" />
          <span className="font-mono text-sm font-semibold text-foreground tracking-wide truncate">
            {cadastreInfo.cadastral_number}
          </span>
          {cadastreInfo.object_type && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue font-medium flex-shrink-0">
              {cadastreInfo.object_type}
            </span>
          )}
          {cadastreInfo.status && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 flex-shrink-0">
              {cadastreInfo.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <a
            href={`https://pkk.rosreestr.ru/#/?text=${encodeURIComponent(cadastreInfo.cadastral_number)}&type=1`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-brand-blue hover:underline flex items-center gap-1"
          >
            <Icon name="Map" size={12} />
            ПКК
          </a>
          <a
            href={`https://rosreestr.gov.ru/eservices/real-estate-objects-online/?search=${encodeURIComponent(cadastreInfo.cadastral_number)}`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-brand-blue hover:underline flex items-center gap-1"
          >
            <Icon name="FileText" size={12} />
            Выписка ЕГРН
          </a>
        </div>
      </div>

      {/* Строка 2: адрес из кадастра */}
      {cadastreInfo.address && (
        <div className="text-xs text-muted-foreground flex items-start gap-1">
          <Icon name="MapPin" size={11} className="flex-shrink-0 mt-0.5" />
          <span>{cadastreInfo.address}</span>
        </div>
      )}

      {/* Строка 3: характеристики объекта */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {cadastreInfo.area_sqm && (
          <span className="flex items-center gap-1">
            <Icon name="Maximize2" size={11} />
            {cadastreInfo.area_sqm.toLocaleString('ru')} м²
          </span>
        )}
        {cadastreInfo.floor && (
          <span className="flex items-center gap-1">
            <Icon name="Layers" size={11} />
            {cadastreInfo.floor} эт.
          </span>
        )}
        {cadastreInfo.flat_count && (
          <span className="flex items-center gap-1">
            <Icon name="Home" size={11} />
            {cadastreInfo.flat_count} пом.
          </span>
        )}
        {cadastreInfo.year_built && (
          <span className="flex items-center gap-1">
            <Icon name="Calendar" size={11} />
            {cadastreInfo.year_built} г.п.
          </span>
        )}
        {cadastreInfo.postal_code && (
          <span className="flex items-center gap-1">
            <Icon name="Mail" size={11} />
            {cadastreInfo.postal_code}
          </span>
        )}
        {cadastreInfo.city_district && (
          <span className="flex items-center gap-1">
            <Icon name="Map" size={11} />
            {cadastreInfo.city_district}
          </span>
        )}
        {cadastreInfo.sqm_price && (
          <span className="flex items-center gap-1">
            <Icon name="TrendingUp" size={11} />
            {cadastreInfo.sqm_price.toLocaleString('ru')} ₽/м²
          </span>
        )}
      </div>

      {/* Строка 4: связанные кадастровые номера */}
      {(cadastreInfo.house_cadnum || cadastreInfo.flat_cadnum || cadastreInfo.stead_cadnum) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground border-t border-brand-blue/10 pt-1.5">
          {cadastreInfo.house_cadnum && (
            <span>Здание: <span className="font-mono font-medium text-foreground">{cadastreInfo.house_cadnum}</span></span>
          )}
          {cadastreInfo.flat_cadnum && (
            <span>Помещение: <span className="font-mono font-medium text-foreground">{cadastreInfo.flat_cadnum}</span></span>
          )}
          {cadastreInfo.stead_cadnum && (
            <span>Участок: <span className="font-mono font-medium text-foreground">{cadastreInfo.stead_cadnum}</span></span>
          )}
        </div>
      )}

      {/* Строка 5: все объекты по адресу (здание + участок и т.д.) */}
      {cadastreInfo.objects && cadastreInfo.objects.length > 0 && (
        <div className="border-t border-brand-blue/10 pt-2 space-y-1.5">
          <div className="text-[11px] text-muted-foreground font-medium">Объекты по адресу:</div>
          {cadastreInfo.objects.map((obj, i) => (
            <div key={i} className="flex items-center justify-between gap-2 flex-wrap bg-brand-blue/5 rounded-lg px-2 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name={obj.type === 'Земельный участок' ? 'Landmark' : 'Building2'} size={12} className="text-brand-blue flex-shrink-0" />
                <span className="font-mono text-xs font-medium text-foreground">{obj.cadastral_number}</span>
                {obj.type && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-brand-blue/10 text-brand-blue font-medium flex-shrink-0">{obj.type}</span>
                )}
                {obj.area && (
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{obj.area} м²</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://pkk.rosreestr.ru/#/?text=${encodeURIComponent(obj.cadastral_number)}&type=1`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-brand-blue hover:underline flex items-center gap-0.5"
                >
                  <Icon name="Map" size={11} />ПКК
                </a>
                <a
                  href={`https://rosreestr.gov.ru/eservices/real-estate-objects-online/?search=${encodeURIComponent(obj.cadastral_number)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-brand-blue hover:underline flex items-center gap-0.5"
                >
                  <Icon name="FileText" size={11} />ЕГРН
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
