import ImageUploader from '@/components/admin/ImageUploader';
import Icon from '@/components/ui/icon';
import {
  Listing, City, Purpose,
  CATS, DEALS, CONDITIONS,
} from './types';
import ListingEditorPriceSection from './ListingEditorPriceSection';
import ListingEditorDetailsSection from './ListingEditorDetailsSection';
import ListingEditorContentSection from './ListingEditorContentSection';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  photos: string[];
  setPhotos: (p: string[]) => void;
  cities: City[];
  purposes: Purpose[];
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
  editing, setEditing, photos, setPhotos, cities, purposes,
  aiLoading, aiTagsLoading, aiSeoLoading, aiAllLoading,
  onDescribe, onGenerateTags, onGenerateSeo, onGenerateAll, onClose, onSave,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-white z-10 gap-3">
          <div className="font-display font-700 text-lg flex items-center gap-2">
            {editing.id ? 'Редактировать' : 'Новый объект'}
            {editing.public_code ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
                ID: {editing.public_code}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onGenerateAll} disabled={aiAllLoading}
              title="Сгенерировать описание, теги и SEO одним кликом"
              className="btn-orange text-white px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
              <Icon name={aiAllLoading ? 'Loader2' : 'Sparkles'} size={13} className={aiAllLoading ? 'animate-spin' : ''} />
              {aiAllLoading ? 'Генерация...' : 'Сгенерировать всё'}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <Icon name="X" size={20} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="relative">
            <input className="w-full px-3 py-2 border rounded-lg pr-16" placeholder="Название"
              maxLength={60}
              value={editing.title || ''}
              onChange={e => setEditing({ ...editing, title: e.target.value })} />
            <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums ${
              (editing.title?.length || 0) >= 55 ? 'text-red-500' : 'text-muted-foreground'
            }`}>
              {editing.title?.length || 0}/60
            </span>
          </div>

          <div>
            <label className="text-sm font-semibold block mb-1">Фотографии</label>
            <ImageUploader value={photos} onChange={setPhotos} folder="photos" multiple />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Категория</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.category}
                onChange={e => setEditing({ ...editing, category: e.target.value })}>
                {CATS.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Тип сделки</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.deal}
                onChange={e => setEditing({ ...editing, deal: e.target.value })}>
                {DEALS.map(d => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Назначение</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.purpose || ''}
                onChange={e => setEditing({ ...editing, purpose: e.target.value })}>
                <option value="">— Не выбрано —</option>
                {purposes.map(p => <option key={p.id} value={p.slug}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Состояние</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.condition || ''}
                onChange={e => setEditing({ ...editing, condition: e.target.value })}>
                <option value="">— Не выбрано —</option>
                {CONDITIONS.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
              </select>
            </div>
          </div>

          <ListingEditorPriceSection editing={editing} setEditing={setEditing} />

          <ListingEditorDetailsSection editing={editing} setEditing={setEditing} cities={cities} />

          <ListingEditorContentSection
            editing={editing}
            setEditing={setEditing}
            aiLoading={aiLoading}
            aiTagsLoading={aiTagsLoading}
            aiSeoLoading={aiSeoLoading}
            onDescribe={onDescribe}
            onGenerateTags={onGenerateTags}
            onGenerateSeo={onGenerateSeo}
          />
        </div>

        <div className="p-5 border-t border-border flex justify-end gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm">Отмена</button>
          <button onClick={onSave} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}