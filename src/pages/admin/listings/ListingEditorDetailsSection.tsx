/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import PhonePickerInput from '@/components/admin/PhonePickerInput';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { Listing, City, FINISHING, ROAD_LINES, detectVideoType } from './types';

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
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Коммуникации</label>
            <input className="w-full px-3 py-2 border rounded-lg"
              placeholder="вода, канализация, отопление, газ, интернет..."
              value={editing.utilities || ''}
              onChange={e => setEditing({ ...editing, utilities: e.target.value })} />
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-4">
        <div>
          <label className="text-xs text-muted-foreground">Имя собственника</label>
          <input className="w-full px-3 py-2 border rounded-lg"
            value={editing.owner_name || ''} onChange={e => setEditing({ ...editing, owner_name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Телефон собственника</label>
          <PhonePickerInput
            value={editing.owner_phone || ''}
            onChange={(phone, name) => setEditing({ ...editing, owner_phone: phone, ...(name && !editing.owner_name ? { owner_name: name } : {}) })}
            onNameChange={name => { if (!editing.owner_name) setEditing({ ...editing, owner_name: name }); }}
          />
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