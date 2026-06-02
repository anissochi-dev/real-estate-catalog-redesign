import { useState, useMemo, useEffect } from 'react';
import ListingsTable from './listings/ListingsTable';
import ListingEditor from './listings/ListingEditor';
import ListingHistory from './listings/ListingHistory';
import ListingsToolbar from './listings/ListingsToolbar';
import ListingsBulkBar from './listings/ListingsBulkBar';
import PhotoPickModal from './listings/PhotoPickModal';
import ListingInternalCard from './listings/ListingInternalCard';
import Icon from '@/components/ui/icon';
import { useListingsState } from './listings/useListingsState';

const PAGE_SIZE_KEY = 'biznest_admin_page_size';

export default function ListingsAdmin() {
  const s = useListingsState();
  const [internalCardId, setInternalCardId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    try { return Number(localStorage.getItem(PAGE_SIZE_KEY)) || 25; } catch { return 25; }
  });

  // сброс на 1 стр при смене фильтров
  useEffect(() => { setPage(1); }, [s.filtered.length, s.statusFilter, s.search, s.catFilter]);

  const totalPages = Math.max(1, Math.ceil(s.filtered.length / pageSize));
  const safeP = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (safeP - 1) * pageSize;
    return s.filtered.slice(start, start + pageSize);
  }, [s.filtered, safeP, pageSize]);

  if (s.loading) return <div>Загрузка...</div>;

  const activeCount = s.items.filter(i => i.status === 'active').length;
  const archivedCount = s.items.filter(i => i.status === 'archived').length;

  const goToPage = (n: number) => setPage(Math.max(1, Math.min(n, totalPages)));

  const changePageSize = (n: number) => {
    try { localStorage.setItem(PAGE_SIZE_KEY, String(n)); } catch { /* ignore */ }
    setPageSize(n);
    setPage(1);
  };

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
        items={pageItems}
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

      {/* Пагинация */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Показывать:</span>
          {[25, 50, 100].map(n => (
            <button
              key={n}
              onClick={() => changePageSize(n)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${pageSize === n ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground hover:border-brand-blue hover:text-brand-blue'}`}
            >
              {n}
            </button>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button disabled={safeP === 1} onClick={() => goToPage(safeP - 1)}
              className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold disabled:opacity-40 hover:bg-muted">
              <Icon name="ChevronLeft" size={13} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - safeP) <= 2)
              .map((n, idx, arr) => (
                <span key={n} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== n - 1 && <span className="px-1.5 text-xs text-muted-foreground">…</span>}
                  <button onClick={() => goToPage(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${n === safeP ? 'bg-brand-blue text-white' : 'border border-border hover:bg-muted'}`}>
                    {n}
                  </button>
                </span>
              ))}
            <button disabled={safeP === totalPages} onClick={() => goToPage(safeP + 1)}
              className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold disabled:opacity-40 hover:bg-muted">
              <Icon name="ChevronRight" size={13} />
            </button>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          {(safeP - 1) * pageSize + 1}–{Math.min(safeP * pageSize, s.filtered.length)} из {s.filtered.length}
        </div>
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