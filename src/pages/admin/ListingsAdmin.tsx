import { useState, useEffect } from 'react';
import ListingsTable from './listings/ListingsTable';
import ListingEditor from './listings/ListingEditor';
import ListingHistory from './listings/ListingHistory';
import ListingsToolbar from './listings/ListingsToolbar';
import ListingsBulkBar from './listings/ListingsBulkBar';
import PhotoPickModal from './listings/PhotoPickModal';
import ListingInternalCard from './listings/ListingInternalCard';
import Icon from '@/components/ui/icon';
import { useListingsState } from './listings/useListingsState';

export default function ListingsAdmin() {
  const s = useListingsState();
  const [internalCardId, setInternalCardId] = useState<number | null>(null);

  // Открытие карточки из других разделов (например из SEO-аудита)
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      if (id) setInternalCardId(id);
    };
    window.addEventListener('admin:open-listing', handler);
    return () => window.removeEventListener('admin:open-listing', handler);
  }, []);

  if (s.loading && s.items.length === 0) return <div>Загрузка...</div>;

  const hasMore = s.items.length < s.total;

  return (
    <div className="space-y-4">
      <ListingsToolbar
        statusFilter={s.statusFilter}
        switchTab={s.switchTab}
        search={s.search}
        setSearch={s.setSearch}
        catFilter={s.catFilter}
        setCatFilter={s.setCatFilter}
        hasDraft={s.hasDraft}
        setHasDraft={s.setHasDraft}
        onAdd={() => s.openEdit()}
        counts={s.counts}
        onImport={data => {
          const imagesStr = data.images.join('|');
          s.openEdit({
            title: data.title,
            description: data.description,
            price: data.price || 0,
            area: data.area || 0,
            address: data.address || '',
            district: data.district || '',
            city: data.city || '',
            images: imagesStr,
            image: data.images[0] || '',
            category: data.category || 'office',
            deal: data.deal || 'sale',
            floor: data.floor ?? null,
            total_floors: data.total_floors ?? null,
            ceiling_height: data.ceiling_height ?? null,
            electricity_kw: data.electricity_kw ?? null,
            utilities: data.utilities || '',
            condition: data.condition || null,
            parking: data.parking || null,
          });
          if (data.images.length > 0) s.setPhotos(data.images);
        }}
      />

      <ListingsBulkBar
        selected={s.selected}
        onDeselect={() => s.setSelected(new Set())}
        onBulk={s.runBulk}
        onBulkDelete={s.bulkDelete}
        bulkLoading={s.bulkLoading}
        isAdmin={s.isAdmin}
      />

      <ListingsTable
        items={s.filtered}
        onEdit={s.openEdit}
        onArchive={s.archive}
        onHistory={it => s.setHistoryListing(it)}
        onPhotoDownload={it => s.setPhotoPickListing(it)}
        onInternalCard={it => setInternalCardId(it.id)}
        selected={s.selected}
        onToggleSelect={s.toggleSelect}
        onSelectAll={() => s.setSelected(new Set(s.filtered.map(i => i.id)))}
        onDeselectAll={() => s.setSelected(new Set())}
        siteUrl={s.SITE_URL}
      />

      {/* Показать ещё */}
      <div className="flex items-center justify-between pt-1 pb-2">
        <span className="text-xs text-muted-foreground">
          Показано {s.items.length} из {s.total}
        </span>
        {hasMore && (
          <button
            onClick={s.loadMore}
            disabled={s.loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50 transition"
          >
            {s.loading ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="ChevronDown" size={13} />}
            Показать ещё 25
          </button>
        )}
      </div>

      {s.editing && (
        <ListingEditor
          editing={s.editing}
          setEditing={s.setEditing}
          photos={s.photos}
          setPhotos={s.setPhotos}
          cities={s.cities}
          purposes={s.purposes}
          landVri={s.landVri}
          aiLoading={s.aiLoading}
          aiTitleLoading={s.aiTitleLoading}
          aiTagsLoading={s.aiTagsLoading}
          aiSeoLoading={s.aiSeoLoading}
          aiAllLoading={s.aiAllLoading}
          onDescribe={s.aiDescribe}
          onGenerateTitle={s.aiTitle}
          onGenerateTags={s.generateTags}
          onGenerateSeo={s.generateSeo}
          onGenerateAll={s.generateAll}
          onClose={() => { s.setEditing(null); s.setPhotos([]); }}
          onSave={s.save}
          setEgrnObjects={s.setEgrnObjects}
        />
      )}

      {s.historyListing && (
        <ListingHistory
          listingId={s.historyListing.id!}
          listingTitle={s.historyListing.title}
          onClose={() => s.setHistoryListing(null)}
        />
      )}

      {s.photoPickListing && (
        <PhotoPickModal
          listing={s.photoPickListing}
          onClose={() => s.setPhotoPickListing(null)}
        />
      )}

      {internalCardId !== null && (
        <ListingInternalCard
          listingId={internalCardId}
          onClose={() => setInternalCardId(null)}
          onBrokerChanged={() => { setInternalCardId(null); }}
          onEdit={listing => { setInternalCardId(null); s.openEdit(listing); }}
        />
      )}
    </div>
  );
}