/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { Listing, City, FINISHING, ROAD_LINES, detectVideoType, BUILDING_CLASSES, PROPERTY_RIGHTS, LAND_STATUSES } from './types';

const UTILITIES_MAP: { key: string; label: string; options: string[] }[] = [
  { key: 'Вода', label: '💧 Вода', options: ['Центральная', 'Скважина', 'Колодец', 'Привозная'] },
  { key: 'Канализация', label: '🚿 Канализация', options: ['Центральная', 'Септик', 'Выгребная яма', 'Ливневая'] },
  { key: 'Отопление', label: '🔥 Отопление', options: ['Центральное', 'Газовое', 'Электрическое', 'Автономное', 'Печное', 'Тепловой насос'] },
  { key: 'Газ', label: '🔵 Газ', options: ['Магистральный', 'Баллонный', 'Отсутствует'] },
  { key: 'Электричество', label: '⚡ Электричество', options: ['220В', '380В (3 фазы)', 'Генератор', 'Солнечные панели'] },
  { key: 'Интернет', label: '🌐 Интернет', options: ['Оптоволокно', 'Wi-Fi', 'Кабельный', '4G/5G'] },
  { key: 'Вентиляция', label: '💨 Вентиляция', options: ['Приточно-вытяжная', 'Принудительная', 'Естественная'] },
  { key: 'Кондиционирование', label: '❄️ Кондиционирование', options: ['Сплит-система', 'Центральное', 'Чиллер', 'Отсутствует'] },
  { key: 'Пожарная сигнализация', label: '🚒 Пожарная сигнализация', options: ['Есть', 'Отсутствует'] },
  { key: 'Видеонаблюдение', label: '📷 Видеонаблюдение', options: ['Есть', 'Отсутствует'] },
];

/* ── Яндекс.Карты типы ── */
declare global {
  interface Window {
    ymaps: any;  
  }
}

let ymapsLoadPromise: Promise<void> | null = null;
function loadYmaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject();
  if (window.ymaps) return Promise.resolve();
  if (ymapsLoadPromise) return ymapsLoadPromise;
  ymapsLoadPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&load=package.full${apiKey ? `&apikey=${apiKey}` : ''}`;
    s.async = true;
    s.onload = () => window.ymaps ? window.ymaps.ready(() => resolve()) : (ymapsLoadPromise = null, reject());
    s.onerror = () => { ymapsLoadPromise = null; reject(); };
    document.head.appendChild(s);
  });
  return ymapsLoadPromise;
}

/* ── Компонент адреса с автодополнением и картой ── */
interface AddressProps {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  cities: City[];
}

function AddressWithMap({ editing, setEditing, cities }: AddressProps) {
  const { settings } = useSettings();
  const apiKey = settings.yandex_maps_api_key || '';
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const suggestRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const fullAddress = [editing.city || 'Краснодар', editing.district, editing.address]
    .filter(Boolean).join(', ');

  /* Инициализация карты */
  useEffect(() => {
    let destroyed = false;
    loadYmaps(apiKey)
      .then(() => {
        if (destroyed || !mapRef.current) return;
        const center: [number, number] = (editing.lat && editing.lng)
          ? [+editing.lat, +editing.lng]
          : [45.0355, 38.9753];

        ymapInstance.current = new window.ymaps.Map(mapRef.current, {
          center, zoom: editing.lat ? 16 : 11,
          controls: ['zoomControl'],
        });

        // Маркер
        markerRef.current = new window.ymaps.Placemark(center, {}, {
          preset: 'islands#blueCircleDotIcon',
          draggable: true,
        });
        ymapInstance.current.geoObjects.add(markerRef.current);

        // При перетаскивании маркера — геокодируем координаты
        markerRef.current.events.add('dragend', () => {
          const coords = markerRef.current.geometry.getCoordinates();
          reverseGeocode(coords[0], coords[1]);
        });

        // Клик по карте → ставим маркер
        ymapInstance.current.events.add('click', (e: any) => {
          const coords = e.get('coords') as [number, number];
          markerRef.current.geometry.setCoordinates(coords);
          reverseGeocode(coords[0], coords[1]);
        });

        setMapReady(true);
      })
      .catch(() => { if (!destroyed) setMapError(true); });

    return () => { destroyed = true; ymapInstance.current?.destroy(); ymapInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  /* Suggest (автодополнение) */
  useEffect(() => {
    if (!mapReady || !inputRef.current) return;
    let destroyed = false;
    try {
      suggestRef.current = new window.ymaps.SuggestView(inputRef.current, {
        results: 7,
        boundedBy: ymapInstance.current?.getBounds(),
      });
      suggestRef.current.events.add('select', (e: any) => {
        const value: string = e.get('item').value;
        if (destroyed) return;
        geocodeAddress(value);
      });
    } catch { /* ignore */ }
    return () => {
      destroyed = true;
      try { suggestRef.current?.destroy(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  /* Геокодирование адреса → координаты + разбор компонентов */
  function geocodeAddress(addr: string) {
    if (!window.ymaps) return;
    window.ymaps.geocode(addr, { results: 1 }).then((res: any) => {
      const obj = res.geoObjects.get(0);
      if (!obj) return;
      const coords: [number, number] = obj.geometry.getCoordinates();
      markerRef.current?.geometry.setCoordinates(coords);
      ymapInstance.current?.setCenter(coords, 16, { duration: 400 });
      parseGeoObject(obj, coords);
    });
  }

  /* Обратное геокодирование: координаты → адрес */
  function reverseGeocode(lat: number, lng: number) {
    if (!window.ymaps) return;
    window.ymaps.geocode([lat, lng], { results: 1 }).then((res: any) => {
      const obj = res.geoObjects.get(0);
      if (!obj) return;
      parseGeoObject(obj, [lat, lng]);
    });
  }

  /* Разбор geo-объекта на составляющие */
  function parseGeoObject(obj: any, coords: [number, number]) {
    const meta = obj.properties.get('metaDataProperty.GeocoderMetaData');
    const parts = meta?.Address?.Components || [];
    let city = '', district = '', street = '', house = '';
    for (const p of parts) {
      if (p.kind === 'locality') city = p.name;
      else if (p.kind === 'district') district = p.name;
      else if (p.kind === 'street') street = p.name;
      else if (p.kind === 'house') house = p.name;
    }
    const address = [street, house].filter(Boolean).join(', ');
    setEditing({
      ...editing,
      city: city || editing.city || '',
      district: district || editing.district || '',
      address: address || obj.properties.get('name') || editing.address || '',
      lat: coords[0],
      lng: coords[1],
    });
  }

  /* При изменении координат из editing → двигаем маркер */
  useEffect(() => {
    if (!mapReady || !markerRef.current || !editing.lat || !editing.lng) return;
    const coords: [number, number] = [+editing.lat, +editing.lng];
    markerRef.current.geometry.setCoordinates(coords);
    ymapInstance.current?.setCenter(coords, 16);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.lat, editing.lng]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      geocodeAddress((e.target as HTMLInputElement).value);
    }
  };

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Icon name="MapPin" size={15} className="text-brand-blue" />
        Расположение
      </div>

      {/* Единое поле адреса */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Адрес (начните вводить — появятся подсказки)
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            className="w-full px-3 py-2 border rounded-lg pr-10 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            placeholder="Например: Краснодар, ул. Красная, 1"
            defaultValue={fullAddress}
            onKeyDown={handleInputKeyDown}
            onBlur={e => {
              const v = e.target.value.trim();
              if (v && v !== fullAddress) geocodeAddress(v);
            }}
          />
          <Icon name="Search" size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Разобранные поля — для ручной корректировки */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Город</label>
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={editing.city || 'Краснодар'}
            onChange={e => setEditing({ ...editing, city: e.target.value })}>
            {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Район</label>
          <input className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="Центральный"
            value={editing.district || ''}
            onChange={e => setEditing({ ...editing, district: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Улица и дом</label>
          <input className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="ул. Красная, 1"
            value={editing.address || ''}
            onChange={e => setEditing({ ...editing, address: e.target.value })} />
        </div>
      </div>

      {/* Карта */}
      <div className="relative rounded-xl overflow-hidden border border-border" style={{ height: 280 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {!mapReady && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-sm text-muted-foreground gap-2">
            <Icon name="Loader2" size={16} className="animate-spin" /> Загрузка карты...
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 text-sm text-muted-foreground gap-2">
            <Icon name="MapOff" size={20} className="opacity-40" />
            <span>Добавьте API-ключ Яндекс.Карт в Настройки → SEO</span>
          </div>
        )}
        {mapReady && editing.lat && editing.lng && (
          <div className="absolute bottom-2 left-2 bg-white/90 text-[10px] px-2 py-1 rounded-lg text-muted-foreground">
            {(+editing.lat).toFixed(5)}, {(+editing.lng).toFixed(5)}
          </div>
        )}
        {mapReady && (
          <div className="absolute top-2 right-2 bg-white/90 text-[10px] px-2 py-1 rounded-lg text-muted-foreground">
            Кликните на карте или перетащите метку
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Основной компонент секции деталей ── */
interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  cities: City[];
}

export default function ListingEditorDetailsSection({ editing, setEditing, cities }: Props) {
  return (
    <>
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold">Характеристики помещения</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Отделка</label>
            <select className="w-full px-3 py-2 border rounded-lg" value={editing.finishing || ''}
              onChange={e => setEditing({ ...editing, finishing: e.target.value })}>
              <option value="">— Не указано —</option>
              {FINISHING.map(f => <option key={f[0]} value={f[0]}>{f[1]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Высота потолка, м</label>
            <input type="number" step="0.1" min="0" className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. 3.2"
              value={editing.ceiling_height ?? ''}
              onChange={e => setEditing({ ...editing, ceiling_height: e.target.value === '' ? null : +e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Эл. мощность, кВт</label>
            <input type="number" step="0.1" min="0" className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. 15"
              value={editing.electricity_kw ?? ''}
              onChange={e => setEditing({ ...editing, electricity_kw: e.target.value === '' ? null : +e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <label className="text-xs text-muted-foreground block mb-2">Коммуникации</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {UTILITIES_MAP.map(({ key, label, options }) => {
                const list = (editing.utilities || '').split(',').map(s => s.trim()).filter(Boolean);
                const current = list.find(v => v.startsWith(key + ':'));
                const selected = current ? current.split(':')[1]?.trim() : '';

                const handleChange = (val: string) => {
                  const without = list.filter(v => !v.startsWith(key + ':'));
                  const next = val ? [...without, `${key}: ${val}`] : without;
                  setEditing({ ...editing, utilities: next.join(', ') });
                };

                return (
                  <div key={key} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                    <span className="text-xs font-medium min-w-[120px]">{label}</span>
                    <select
                      value={selected}
                      onChange={e => handleChange(e.target.value)}
                      className="flex-1 text-xs px-2 py-1 border border-border rounded-md bg-white outline-none"
                    >
                      <option value="">— Не указано —</option>
                      {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Линия расположения</label>
            <select className="w-full px-3 py-2 border rounded-lg" value={editing.road_line || ''}
              onChange={e => setEditing({ ...editing, road_line: e.target.value })}>
              <option value="">— Не указано —</option>
              {ROAD_LINES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold">Доходность и арендатор</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">МАП (мес. арендный поток), ₽</label>
            <input type="number" min="0" className="w-full px-3 py-2 border rounded-lg"
              value={editing.monthly_rent ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? null : +e.target.value;
                setEditing({ ...editing, monthly_rent: v, yearly_rent: v ? Math.round(v * 12) : editing.yearly_rent ?? null });
              }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">ГАП (год. арендный поток), ₽</label>
            <input type="number" min="0" className="w-full px-3 py-2 border rounded-lg"
              value={editing.yearly_rent ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? null : +e.target.value;
                setEditing({ ...editing, yearly_rent: v, monthly_rent: v ? Math.round(v / 12) : editing.monthly_rent ?? null });
              }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Окупаемость, мес</label>
            <input type="number" min="0" className="w-full px-3 py-2 border rounded-lg"
              placeholder="авто, если пусто"
              value={editing.payback ?? ''}
              onChange={e => setEditing({ ...editing, payback: e.target.value === '' ? null : +e.target.value })} />
            {!editing.payback && editing.price && (editing.monthly_rent || editing.profit) ? (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Авто: ~{Math.round(+editing.price / +(editing.monthly_rent || editing.profit || 1))} мес
              </div>
            ) : null}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Прибыль/мес, ₽</label>
            <input type="number" min="0" className="w-full px-3 py-2 border rounded-lg"
              value={editing.profit ?? ''}
              onChange={e => setEditing({ ...editing, profit: e.target.value === '' ? null : +e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Название арендатора (если есть)</label>
            <input className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. «Магнит», «Сбербанк»..."
              value={editing.tenant_name || ''}
              onChange={e => setEditing({ ...editing, tenant_name: e.target.value })} />
          </div>
        </div>
      </div>

      <AddressWithMap editing={editing} setEditing={setEditing} cities={cities} />

      {/* Метро */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Icon name="Train" size={15} className="text-brand-blue" />
          Транспортная доступность
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Ближайшая станция метро</label>
            <input className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. «Площадь Революции»"
              value={editing.subway_station || ''}
              onChange={e => setEditing({ ...editing, subway_station: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Расстояние до метро, мин пешком</label>
            <input type="number" min={1} max={60} className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. 5"
              value={editing.subway_distance ?? ''}
              onChange={e => setEditing({ ...editing, subway_distance: e.target.value === '' ? null : +e.target.value })} />
          </div>
        </div>
      </div>

      {/* Дополнительные параметры для досок объявлений */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Icon name="Share2" size={15} className="text-brand-blue" />
          Параметры для досок объявлений
          <span className="text-[10px] font-normal text-muted-foreground px-1.5 py-0.5 bg-muted rounded">Яндекс / Авито / ЦИАН</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Класс здания</label>
            <select className="w-full px-3 py-2 border rounded-lg"
              value={editing.building_class || ''}
              onChange={e => setEditing({ ...editing, building_class: e.target.value || null })}>
              <option value="">— Не указано —</option>
              {BUILDING_CLASSES.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Год постройки здания</label>
            <input type="number" min={1900} max={2030} className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. 2005"
              value={editing.building_year ?? ''}
              onChange={e => setEditing({ ...editing, building_year: e.target.value === '' ? null : +e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Права на объект</label>
            <select className="w-full px-3 py-2 border rounded-lg"
              value={editing.property_rights || ''}
              onChange={e => setEditing({ ...editing, property_rights: e.target.value || null })}>
              <option value="">— Не указано —</option>
              {PROPERTY_RIGHTS.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Мин. площадь нарезки, м²</label>
            <input type="number" min={1} className="w-full px-3 py-2 border rounded-lg"
              placeholder="если делится на части"
              value={editing.min_area ?? ''}
              onChange={e => setEditing({ ...editing, min_area: e.target.value === '' ? null : +e.target.value })} />
          </div>
          {(editing.category === 'land') && (
            <>
              <div>
                <label className="text-xs text-muted-foreground">Площадь участка, сотки</label>
                <input type="number" min={0} step={0.1} className="w-full px-3 py-2 border rounded-lg"
                  placeholder="напр. 15"
                  value={editing.land_area ?? ''}
                  onChange={e => setEditing({ ...editing, land_area: e.target.value === '' ? null : +e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Назначение земли</label>
                <select className="w-full px-3 py-2 border rounded-lg"
                  value={editing.land_status || ''}
                  onChange={e => setEditing({ ...editing, land_status: e.target.value || null })}>
                  <option value="">— Не указано —</option>
                  {LAND_STATUSES.map(s => <option key={s[0]} value={s[0]}>{s[1]}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-4 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!editing.has_furniture}
              onChange={e => setEditing({ ...editing, has_furniture: e.target.checked })} />
            <span className="text-sm">Мебель есть</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!editing.has_equipment}
              onChange={e => setEditing({ ...editing, has_equipment: e.target.checked })} />
            <span className="text-sm">Оборудование есть</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!editing.is_apartments}
              onChange={e => setEditing({ ...editing, is_apartments: e.target.checked })} />
            <span className="text-sm">Апартаменты</span>
          </label>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Видео (VK Видео или RuTube URL)</label>
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="https://vk.com/video... или https://rutube.ru/video/..."
          value={editing.video_url || ''} onChange={e => setEditing({ ...editing, video_url: e.target.value })} />
        {editing.video_url && (
          <div className="text-xs text-muted-foreground mt-1">
            Тип: {detectVideoType(editing.video_url) === 'vk' ? 'VK Видео' : detectVideoType(editing.video_url) === 'rutube' ? 'RuTube' : 'Другое'}
          </div>
        )}
      </div>
    </>
  );
}