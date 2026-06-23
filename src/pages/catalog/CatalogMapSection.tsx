import { Property } from '@/App';
import { District } from '@/lib/api';
import DistrictOptions from '@/components/DistrictOptions';
import CatalogMap from './CatalogMap';

type SortOption = 'price_asc' | 'price_desc' | 'area_asc' | 'newest';

interface MapPoint {
  id: number;
  lat: number;
  lng: number;
  title: string;
  caption: string;
  type: string;
  isHot: boolean;
}

interface CatalogMapSectionProps {
  showFilters: boolean;
  mapFullscreen: boolean;
  mapPoints: MapPoint[];
  mapSelected: Property | null;
  city: string;
  typeFilter: string;
  districtFilter: string;
  minArea: string;
  maxPrice: string;
  sortBy: SortOption;
  districts: District[];
  setTypeFilter: (v: string) => void;
  setDistrictFilter: (v: string) => void;
  setMinArea: (v: string) => void;
  setMaxPrice: (v: string) => void;
  setSortBy: (v: SortOption) => void;
  setDealFilter: (v: string) => void;
  setMapFullscreen: (v: boolean) => void;
  onCloseMap: () => void;
  onPointClick: (pt: { id: number }) => void;
  onDeselectPoint: () => void;
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'Все типы' },
  { value: 'office', label: 'Офис' },
  { value: 'retail', label: 'Торговое' },
  { value: 'warehouse', label: 'Склад' },
  { value: 'restaurant', label: 'Общепит' },
  { value: 'hotel', label: 'Гостиница' },
  { value: 'free_purpose', label: 'Свободное назначение' },
  { value: 'production', label: 'Производство' },
  { value: 'building', label: 'Здание' },
  { value: 'land', label: 'Земельный участок' },
  { value: 'gab', label: 'ГАБ' },
  { value: 'car_service', label: 'Автосервис' },
];

export default function CatalogMapSection({
  showFilters, mapFullscreen, mapPoints, mapSelected, city,
  typeFilter, districtFilter, minArea, maxPrice, sortBy, districts,
  setTypeFilter, setDistrictFilter, setMinArea, setMaxPrice, setSortBy, setDealFilter,
  setMapFullscreen, onCloseMap, onPointClick, onDeselectPoint,
}: CatalogMapSectionProps) {
  // При открытых фильтрах — side-by-side, иначе на всю ширину
  if (showFilters && !mapFullscreen) {
    return (
      <div className="flex border-b border-border bg-white" style={{ height: 480 }}>
        {/* Панель фильтров слева */}
        <div className="w-72 shrink-0 border-r border-border overflow-y-auto bg-white flex flex-col">
          <div className="px-4 pt-4 pb-2 text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border">
            Фильтры
          </div>
          <div className="px-4 py-4 flex flex-col gap-4 flex-1">
            {/* Тип объекта */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Тип объекта</div>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors">
                {TYPE_OPTIONS.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </select>
            </div>
            {/* Район */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Район</div>
              <select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors">
                <option value="all">Все районы</option>
                <DistrictOptions districts={districts} />
              </select>
            </div>
            {/* Площадь */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">От м²</div>
              <input type="number" value={minArea} onChange={e => setMinArea(e.target.value)}
                placeholder="50"
                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors" />
            </div>
            {/* Цена */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">До цены (млн)</div>
              <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)}
                placeholder="100"
                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors" />
            </div>
            {/* Сортировка */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Сортировка</div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortOption)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors">
                <option value="newest">Сначала свежие</option>
                <option value="price_asc">Цена: по возрастанию</option>
                <option value="price_desc">Цена: по убыванию</option>
                <option value="area_asc">Площадь: по возрастанию</option>
              </select>
            </div>
            {/* Сброс */}
            {(typeFilter !== 'all' || districtFilter !== 'all' || minArea || maxPrice) && (
              <button
                onClick={() => { setDealFilter('all'); setTypeFilter('all'); setMinArea(''); setMaxPrice(''); setDistrictFilter('all'); }}
                className="text-xs text-brand-orange font-semibold flex items-center gap-1 hover:opacity-80 mt-auto pt-2"
              >
                ✕ Сбросить фильтры
              </button>
            )}
          </div>
        </div>
        {/* Карта справа */}
        <div className="flex-1 min-w-0">
          <CatalogMap
            mapPoints={mapPoints}
            mapSelected={mapSelected}
            city={city}
            fullscreen={mapFullscreen}
            onFullscreenChange={setMapFullscreen}
            onClose={onCloseMap}
            onPointClick={onPointClick}
            onDeselectPoint={onDeselectPoint}
            className="relative h-full bg-white"
            height="100%"
          />
        </div>
      </div>
    );
  }

  return (
    <CatalogMap
      mapPoints={mapPoints}
      mapSelected={mapSelected}
      city={city}
      fullscreen={mapFullscreen}
      onFullscreenChange={setMapFullscreen}
      onClose={onCloseMap}
      onPointClick={onPointClick}
      onDeselectPoint={onDeselectPoint}
    />
  );
}
