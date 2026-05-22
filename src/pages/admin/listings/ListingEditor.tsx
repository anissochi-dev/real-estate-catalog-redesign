import { useRef, useState } from 'react';
import { Listing, City } from './types';
import ListingEditorPriceSection from './ListingEditorPriceSection';
import ListingEditorDetailsSection from './ListingEditorDetailsSection';
import ListingEditorContentSection from './ListingEditorContentSection';
import ListingEditorExtraSection from './ListingEditorExtraSection';
import ListingEditorHeader, { EditorTab } from './ListingEditorHeader';
import ListingEditorMainTab from './ListingEditorMainTab';
import ListingEditorPhotosTab from './ListingEditorPhotosTab';
import ListingEditorFooter from './ListingEditorFooter';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  photos: string[];
  setPhotos: (p: string[]) => void;
  cities: City[];
  aiLoading: boolean;
  aiTagsLoading: boolean;
  aiSeoLoading: boolean;
  aiAllLoading: boolean;
  onDescribe: () => void;
  onGenerateTags: () => void;
  onGenerateSeo: () => void;
  onGenerateAll: () => void;
  onClose: () => void;
  onSave: () => void;
}

export default function ListingEditor({
  editing, setEditing, photos, setPhotos, cities,
  aiLoading, aiTagsLoading, aiSeoLoading, aiAllLoading,
  onDescribe, onGenerateTags, onGenerateSeo, onGenerateAll, onClose, onSave,
}: Props) {
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<EditorTab>('main');
  const formRef = useRef<HTMLDivElement>(null);

  // Определяем какие вкладки имеют ошибки
  const tabErrors: Partial<Record<EditorTab, boolean>> = {
    main:     !!(errors.title || errors.category || errors.deal || errors.condition || errors.owner_name || errors.owner_phone),
    photos:   !!errors.photos,
    location: !!errors.address,
    details:  !!(errors.price || errors.area || errors.floor || errors.total_floors || errors.broker_commission),
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
    if (!editing.finishing) e.finishing = true;
    if (!editing.building_class) e.building_class = true;
    if (!editing.building_year) e.building_year = true;
    if (!editing.property_rights) e.property_rights = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (validate()) { onSave(); return; }
    // Переключаемся на первую вкладку с ошибкой
    const order: EditorTab[] = ['main', 'photos', 'location', 'details', 'extra'];
    const bc = (editing as Record<string, unknown>).broker_commission as string | undefined;
    const firstErrTab = order.find(t => {
      if (t === 'main') return !editing.title?.trim() || !editing.owner_name?.trim() || !editing.owner_phone?.trim() || !editing.category || !editing.deal || !editing.condition;
      if (t === 'photos') return !photos.length;
      if (t === 'location') return !editing.address?.trim() && !editing.district?.trim();
      if (t === 'details') return !editing.price || !editing.area || editing.floor == null || editing.total_floors == null || !bc?.trim();
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
                addressError={false}
                detailsOnly
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
        />
      </div>
    </div>
  );
}
