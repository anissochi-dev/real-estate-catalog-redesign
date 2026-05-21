import { useState } from 'react';
import ListingsTable from './listings/ListingsTable';
import ListingEditor from './listings/ListingEditor';
import ListingHistory from './listings/ListingHistory';
import ListingsToolbar from './listings/ListingsToolbar';
import ListingsBulkBar from './listings/ListingsBulkBar';
import PhotoPickModal from './listings/PhotoPickModal';
import ListingInternalCard from './listings/ListingInternalCard';
import { useListingsState } from './listings/useListingsState';

export default function ListingsAdmin() {
  const s = useListingsState();
  const [internalCardId, setInternalCardId] = useState<number | null>(null);

  if (s.loading) return <div>Загрузка...</div>;

  const activeCount = s.items.filter(i => i.status === 'active').length;
  const archivedCount = s.items.filter(i => i.status === 'archived').length;

  return (
    <div className="space-y-4">
      <ListingsToolbar
        statusFilter={s.statusFilter}
        setStatusFilter={s.setStatusFilter}
        setSelected={s.setSelected}
        search={s.search}
        setSearch={s.setSearch}
        catFilter={s.catFilter}
        setCatFilter={s.setCatFilter}
        hasDraft={s.hasDraft}
        setHasDraft={s.setHasDraft}
        onAdd={() => s.openEdit()}
        onImport={data => {
          const imagesStr = data.images.join('|');
          s.openEdit({
            title: data.title,
            description: data.description,
            price: data.price || 0,
            area: data.area || 0,
            address: data.address,
            images: imagesStr,
            image: data.images[0] || '',
            category: data.category || 'office',
            deal: data.deal || 'sale',
          });
          if (data.images.length > 0) s.setPhotos(data.images);
        }}
        activeCount={activeCount}
        archivedCount={archivedCount}
        totalCount={s.items.length}
        filteredCount={s.filtered.length}
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

      {s.editing && (
        <ListingEditor
          editing={s.editing}
          setEditing={s.setEditing}
          photos={s.photos}
          setPhotos={s.setPhotos}
          cities={s.cities}
          purposes={s.purposes}
          aiLoading={s.aiLoading}
          aiTagsLoading={s.aiTagsLoading}
          aiSeoLoading={s.aiSeoLoading}
          aiAllLoading={s.aiAllLoading}
          onDescribe={s.aiDescribe}
          onGenerateTags={s.generateTags}
          onGenerateSeo={s.generateSeo}
          onGenerateAll={s.generateAll}
          onClose={() => { s.setEditing(null); s.setPhotos([]); }}
          onSave={s.save}
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
          onBrokerChanged={() => { setInternalCardId(null); /* listings reload is not needed since broker_name is loaded fresh each open */ }}
        />
      )}
    </div>
  );
}