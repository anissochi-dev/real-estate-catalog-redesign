import { useRef, useState } from 'react';
import { Listing, City, LandVri, Purpose } from './types';
import ListingEditorPriceSection from './ListingEditorPriceSection';
import ListingEditorDetailsSection from './ListingEditorDetailsSection';
import ListingEditorContentSection from './ListingEditorContentSection';
import ListingEditorExtraSection from './ListingEditorExtraSection';
import ListingEditorHeader, { EditorTab } from './ListingEditorHeader';
import ListingEditorMainTab from './ListingEditorMainTab';
import ListingEditorPhotosTab from './ListingEditorPhotosTab';
import ListingEditorFooter from './ListingEditorFooter';
import { useSettings } from '@/contexts/SettingsContext';
import { geocodeAddress } from '@/lib/yandexGeocode';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  photos: string[];
  setPhotos: (p: string[]) => void;
  cities: City[];
  purposes: Purpose[];
  landVri: LandVri[];
  aiLoading: boolean;
  aiTitleLoading: boolean;
  aiTagsLoading: boolean;
  aiSeoLoading: boolean;
  aiAllLoading: boolean;
  onDescribe: () => void;
  onGenerateTitle: () => void;
  onGenerateTags: () => void;
  onGenerateSeo: () => void;
  onGenerateAll: () => void;
  onClose: () => void;
  onSave: (override?: Partial<Listing>) => void;
}

export default function ListingEditor({
  editing, setEditing, photos, setPhotos, cities, purposes, landVri,
  aiLoading, aiTitleLoading, aiTagsLoading, aiSeoLoading, aiAllLoading,
  onDescribe, onGenerateTitle, onGenerateTags, onGenerateSeo, onGenerateAll, onClose, onSave,
}: Props) {
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<EditorTab>('main');
  const [geocoding, setGeocoding] = useState(false);
  /**
   * Признак того, что текущие координаты выставлены пользователем вручную
   * (клик по карте или перетаскивание маркера). Если true — при сохранении
   * lat/lng НЕ перезаписываются автогеокодом. Любое ручное изменение
   * адресной строки / смена города сбрасывают этот флаг в false.
   * При открытии редактора (модалка монтируется) флаг всегда false —
   * адрес считается источником истины, координаты будут пересчитаны при сохранении,
   * если адрес не был подтверждён через карту в этой сессии редактирования.
   */
  const [coordsManual, setCoordsManual] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();
  const yandexApiKey = settings.yandex_maps_api_key || '';

  // Определяем какие вкладки имеют ошибки
  const tabErrors: Partial<Record<EditorTab, boolean>> = {
    main:     !!(errors.title || errors.category || errors.deal || errors.condition || errors.owner_name || errors.owner_phone),
    photos:   !!errors.photos,
    location: !!errors.address,
    details:  !!(errors.price || errors.area || errors.floor || errors.total_floors || errors.broker_commission || errors.land_status || errors.land_vri),
    content:  !!errors.description,
    extra:    !!(errors.finishing || errors.building_class || errors.building_year || errors.property_rights),
  };

  const validate = (): boolean => {
    const e: Record<string, boolean> = {};
    if (!editing.title?.trim()) e.title = true;
    if (!editing.owner_phone?.trim()) e.owner_phone = true;
    if (!editing.owner_name?.trim()) e.owner_name = true;
    if (!photos.length) e.photos = true;
    if (!editing.category) e.category = true;
    if (!editing.deal) e.deal = true;
    if (!editing.condition) e.condition = true;
    if (!editing.price) e.price = true;
    if (!editing.area) e.area = true;
    if (editing.floor == null) e.floor = true;
    if (editing.total_floors == null) e.total_floors = true;
    if (!editing.address?.trim() && !editing.district?.trim()) e.address = true;
    const bc = (editing as Record<string, unknown>).broker_commission as string | undefined;
    if (!bc || !bc.trim()) e.broker_commission = true;
    // Описание — обязательное, минимум 30 символов
    if (!editing.description?.trim() || editing.description.trim().length < 30) e.description = true;
    if (!editing.finishing) e.finishing = true;
    if (!editing.building_class) e.building_class = true;
    if (!editing.building_year) e.building_year = true;
    if (!editing.property_rights) e.property_rights = true;
    // Для земельного участка обязательны категория земли и ВРИ
    if (editing.category === 'land') {
      if (!editing.land_status) e.land_status = true;
      if (!editing.land_vri) e.land_vri = true;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /**
   * Синхронизация координат с адресом перед сохранением.
   *
   * Правило: при сохранении объекта всегда обновляем lat/lng по введённому
   * адресу через Yandex Geocoder, КРОМЕ случая, когда пользователь явно
   * выставил координаты вручную (кликом по карте или перетаскиванием маркера)
   * в текущей сессии редактирования.
   *
   * Таким образом адрес — источник истины: если изменили адрес, но забыли
   * подтвердить на карте (Enter/blur не сработали), координаты всё равно
   * подтянутся к новому адресу при сохранении.
   *
   * Возвращает patch с lat/lng/district либо null, если геокодинг не нужен
   * или не удался. Параллельно обновляет локальный стейт editing, но из-за
   * асинхронности React этот апдейт может не успеть к моменту вызова onSave —
   * поэтому patch явно возвращается и пробрасывается в onSave override.
   */
  const ensureCoordinates = async (): Promise<Partial<Listing> | null> => {
    const addr = editing.address?.trim();
    if (!addr) return null;
    // Если пользователь выставил точку на карте вручную — доверяем ей.
    if (coordsManual) return null;
    const city = editing.city?.trim();
    const fullQuery = city ? `${city}, ${addr}` : addr;
    setGeocoding(true);
    try {
      const res = await geocodeAddress(fullQuery, yandexApiKey);
      if (!res) return null;
      const patch: Partial<Listing> = {
        lat: res.lat,
        lng: res.lng,
        // Район следует за адресом: берём из свежего геокодинга, иначе очищаем
        district: res.district || '',
      };
      setEditing({ ...editing, ...patch });
      return patch;
    } catch {
      return null;
    } finally {
      setGeocoding(false);
    }
  };

  const handleSave = async () => {
    if (validate()) {
      const patch = await ensureCoordinates();
      // Передаём patch явно — React-стейт ещё не успел обновиться,
      // но координаты обязаны попасть в сохраняемый объект.
      onSave(patch || undefined);
      return;
    }
    // Переключаемся на первую вкладку с ошибкой
    const order: EditorTab[] = ['main', 'photos', 'location', 'details', 'content', 'extra'];
    const bc = (editing as Record<string, unknown>).broker_commission as string | undefined;
    const firstErrTab = order.find(t => {
      if (t === 'main') return !editing.title?.trim() || !editing.owner_name?.trim() || !editing.owner_phone?.trim() || !editing.category || !editing.deal || !editing.condition;
      if (t === 'photos') return !photos.length;
      if (t === 'location') return !editing.address?.trim() && !editing.district?.trim();
      if (t === 'details') return !editing.price || !editing.area || editing.floor == null || editing.total_floors == null || !bc?.trim() || (editing.category === 'land' && (!editing.land_status || !editing.land_vri));
      if (t === 'content') return !editing.description?.trim() || editing.description.trim().length < 30;
      if (t === 'extra') return !editing.finishing || !editing.building_class || !editing.building_year || !editing.property_rights;
      return false;
    });
    if (firstErrTab) setTab(firstErrTab);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div ref={formRef} className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">

        <ListingEditorHeader
          editing={editing}
          setEditing={setEditing}
          tab={tab}
          setTab={setTab}
          tabErrors={tabErrors}
          hasErrors={Object.keys(errors).length > 0}
          aiAllLoading={aiAllLoading}
          onGenerateAll={onGenerateAll}
          onClose={onClose}
        />

        {/* Контент вкладки */}
        <div className="overflow-y-auto flex-1 p-5">

          {/* ── ОСНОВНОЕ ── */}
          {tab === 'main' && (
            <ListingEditorMainTab
              editing={editing}
              setEditing={setEditing}
              errors={errors}
              setErrors={setErrors}
              onGenerateTitle={onGenerateTitle}
              aiTitleLoading={aiTitleLoading}
              purposes={purposes}
            />
          )}

          {/* ── ФОТО ── */}
          {tab === 'photos' && (
            <ListingEditorPhotosTab
              editing={editing}
              setEditing={setEditing}
              photos={photos}
              setPhotos={setPhotos}
              errors={errors}
              setErrors={setErrors}
            />
          )}

          {/* ── РАСПОЛОЖЕНИЕ ── */}
          {tab === 'location' && (
            <ListingEditorDetailsSection
              editing={editing}
              setEditing={(l) => { setEditing(l); setErrors(v => ({ ...v, address: false })); }}
              cities={cities}
              addressError={!!errors.address}
              locationOnly
              onCoordsManualChange={setCoordsManual}
            />
          )}

          {/* ── ХАРАКТЕРИСТИКИ ── */}
          {tab === 'details' && (
            <div className="space-y-1">
              <ListingEditorPriceSection editing={editing} setEditing={setEditing} errors={errors} setErrors={setErrors} />
              <ListingEditorDetailsSection
                editing={editing}
                setEditing={(l) => { setEditing(l); setErrors(v => ({ ...v, address: false })); }}
                cities={cities}
                landVri={landVri}
                errors={errors}
                setErrors={setErrors}
                addressError={false}
                detailsOnly
                onCoordsManualChange={setCoordsManual}
              />
            </div>
          )}

          {/* ── ОПИСАНИЕ ── */}
          {tab === 'content' && (
            <ListingEditorContentSection
              editing={editing}
              setEditing={setEditing}
              aiLoading={aiLoading}
              aiTagsLoading={aiTagsLoading}
              onDescribe={onDescribe}
              onGenerateTags={onGenerateTags}
              errors={errors}
              setErrors={setErrors}
            />
          )}

          {/* ── ДОПОЛНИТЕЛЬНОЕ ── */}
          {tab === 'extra' && (
            <ListingEditorExtraSection
              editing={editing}
              setEditing={setEditing}
              errors={errors}
              setErrors={setErrors}
              aiSeoLoading={aiSeoLoading}
              onGenerateSeo={onGenerateSeo}
            />
          )}
        </div>

        <ListingEditorFooter
          editing={editing}
          tab={tab}
          setTab={setTab}
          tabErrors={tabErrors}
          onClose={onClose}
          onSave={handleSave}
          saving={geocoding}
        />
      </div>
    </div>
  );
}