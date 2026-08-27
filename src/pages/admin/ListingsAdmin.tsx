import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import ListingsTable from './listings/ListingsTable';
import ListingEditor from './listings/ListingEditor';
import ListingHistory from './listings/ListingHistory';
import ListingsToolbar from './listings/ListingsToolbar';
import ListingsBulkBar from './listings/ListingsBulkBar';
import PhotoPickModal from './listings/PhotoPickModal';
import ListingInternalCard from './listings/ListingInternalCard';
import MatchingModal from './MatchingModal';
import Icon from '@/components/ui/icon';
import { useListingsState } from './listings/useListingsState';
import { adminApi } from '@/lib/adminApi';

interface Props {
  openListingId?: number | null;
  onOpenListingHandled?: () => void;
}

export default function ListingsAdmin({ openListingId, onOpenListingHandled }: Props = {}) {
  const s = useListingsState();
  const [internalCardId, setInternalCardId] = useState<number | null>(null);
  const [matchingListingId, setMatchingListingId] = useState<number | null>(null);

  const handleModerate = async (id: number, action: 'approve' | 'reject') => {
    try {
      if (action === 'approve') {
        await adminApi.updateListing(id, { status: 'active', is_visible: true });
        toast.success('Объект одобрен и опубликован в каталоге');
        s.load(true);
      } else {
        await adminApi.updateListing(id, { status: 'archived', is_visible: false });
        toast.success('Объект отклонён — отправлен в архив');
        s.load(true);
      }
    } catch {
      toast.error('Ошибка при обработке');
    }
  };

  // Открытие карточки из других разделов (например из подбора совпадений в заявках,
  // из SEO-аудита) — id приходит пропсом от AdminPage, а не событием, т.к. этот
  // компонент был размонтирован в момент отправки события.
  useEffect(() => {
    if (openListingId) {
      setInternalCardId(openListingId);
      onOpenListingHandled?.();
    }
  }, [openListingId, onOpenListingHandled]);

  if (s.loading && s.items.length === 0) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
      <Icon name="Loader2" size={18} className="animate-spin" />
      Загрузка объявлений...
    </div>
  );

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
        canCreate={s.canCreate}
        canModerate={s.isAdmin || s.isDirector}
        isBroker={s.isBroker}
        myOnly={s.myOnly}
        toggleMyOnly={s.toggleMyOnly}
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
        onCopy={s.copyAsNew}
        onArchive={s.archive}
        onHistory={it => s.setHistoryListing(it)}
        onPhotoDownload={it => s.setPhotoPickListing(it)}
        onInternalCard={it => setInternalCardId(it.id)}
        onModerate={(s.isAdmin || s.isDirector) ? handleModerate : undefined}
        onShowMatching={setMatchingListingId}
        selected={s.selected}
        onToggleSelect={s.toggleSelect}
        onSelectAll={() => s.setSelected(new Set(s.filtered.map(i => i.id)))}
        onDeselectAll={() => s.setSelected(new Set())}
        siteUrl={s.SITE_URL}
        onBulk={s.runBulk}
        onBulkDelete={s.bulkDelete}
        bulkLoading={s.bulkLoading}
        isAdmin={s.isAdmin}
      />

      {/* Показать ещё — кнопка загрузки слева (с отступом от плавающих стрелок), счётчик справа */}
      <div className="flex items-center justify-between gap-3 pt-1 pb-2 pl-16 sm:pl-20">
        {hasMore ? (
          <button
            onClick={s.loadMore}
            disabled={s.loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50 transition"
          >
            {s.loading ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="ChevronDown" size={13} />}
            Загрузить ещё 25
          </button>
        ) : <span />}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {(s.search || s.catFilter)
            ? <>Показано <b>{s.filtered.length}</b> (фильтр) из {s.items.length} загружено / {s.total} всего</>
            : <>Показано {s.items.length} из {s.total}</>
          }
        </span>
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
          aiImproveLoading={s.aiImproveLoading}
          saving={s.saving}
          onDescribe={s.aiDescribe}
          onGenerateTitle={s.aiTitle}
          onGenerateTags={s.generateTags}
          onGenerateSeo={s.generateSeo}
          onGenerateAll={s.generateAll}
          onImproveWithAi={s.improveWithAi}
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

      {matchingListingId !== null && (
        <MatchingModal
          mode="leads_for_listing"
          id={matchingListingId}
          onClose={() => setMatchingListingId(null)}
          onOpenLead={id => {
            setMatchingListingId(null);
            window.dispatchEvent(new CustomEvent('admin:open-lead', { detail: id }));
          }}
        />
      )}

      {/* Быстрый переход в начало списка */}
      <button
        type="button"
        onClick={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
        title="Прокрутить наверх"
        className="fixed bottom-20 left-4 sm:left-6 z-40 w-11 h-11 rounded-full bg-white text-brand-blue border border-border shadow-lg flex items-center justify-center hover:bg-muted transition"
      >
        <Icon name="ChevronUp" size={20} />
      </button>

      {/* Быстрый переход в конец списка */}
      <button
        type="button"
        onClick={() => document.querySelector('main')?.scrollTo({ top: 999999, behavior: 'smooth' })}
        title="Прокрутить вниз"
        className="fixed bottom-6 left-4 sm:left-6 z-40 w-11 h-11 rounded-full bg-brand-blue text-white shadow-lg flex items-center justify-center hover:bg-brand-blue/90 transition"
      >
        <Icon name="ChevronDown" size={20} />
      </button>
    </div>
  );
}