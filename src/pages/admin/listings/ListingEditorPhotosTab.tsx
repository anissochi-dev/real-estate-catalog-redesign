import ImageUploader from '@/components/admin/ImageUploader';
import { Listing, detectVideoType } from './types';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  photos: string[];
  setPhotos: (p: string[]) => void;
  errors: Record<string, boolean>;
  setErrors: (fn: (v: Record<string, boolean>) => Record<string, boolean>) => void;
}

export default function ListingEditorPhotosTab({ editing, setEditing, photos, setPhotos, errors, setErrors }: Props) {
  const errWrap = (field: string) => errors[field] ? { 'data-field-error': 'true' as const } : {};

  return (
    <div className="space-y-4">

      {/* 1. Видео — вверху */}
      <div>
        <label className="text-sm font-semibold block mb-1">Видео (VK Видео или RuTube URL)</label>
        <input
          className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
          placeholder="https://vk.com/video... или https://rutube.ru/video/..."
          value={editing.video_url || ''}
          onChange={e => setEditing({ ...editing, video_url: e.target.value })}
        />
        {editing.video_url && (
          <div className="text-xs text-muted-foreground mt-1">
            Тип: {detectVideoType(editing.video_url) === 'vk' ? 'VK Видео' : detectVideoType(editing.video_url) === 'rutube' ? 'RuTube' : 'Другое'}
          </div>
        )}
      </div>

      {/* 2. Метки и оформление */}
      <div className="border border-border rounded-xl px-4 py-3 space-y-2">
        <div className="text-sm font-semibold">Метки и оформление</div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!editing.use_watermark}
              onChange={e => setEditing({ ...editing, use_watermark: e.target.checked })} />
            Использовать водяной знак
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!editing.is_hot}
              onChange={e => setEditing({ ...editing, is_hot: e.target.checked })} />
            🔥 Горячее
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!editing.is_new}
              onChange={e => setEditing({ ...editing, is_new: e.target.checked })} />
            Новинка
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!editing.is_exclusive}
              onChange={e => setEditing({ ...editing, is_exclusive: e.target.checked })} />
            ⭐ Эксклюзив
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!editing.is_urgent}
              onChange={e => setEditing({ ...editing, is_urgent: e.target.checked })} />
            ⚡ Срочно
          </label>
        </div>
        <div className="text-xs text-muted-foreground">Эксклюзив и Срочно отображаются бейджами на фото в каталоге.</div>
      </div>

      {/* 3. Фотографии — внизу */}
      <div {...errWrap('photos')}>
        <label className={`text-sm font-semibold block mb-2 ${errors.photos ? 'text-red-600' : ''}`}>
          Фотографии *{errors.photos && <span className="ml-2 text-xs font-normal text-red-500">Добавьте хотя бы одно фото</span>}
        </label>
        <ImageUploader
          value={photos}
          onChange={p => { setPhotos(p); setErrors(v => ({ ...v, photos: false })); }}
          onThumbChange={thumbUrl => setEditing({ ...editing, image_thumb: thumbUrl })}
          folder="photos"
          multiple
          applyWatermark={!!editing.use_watermark}
        />
      </div>

    </div>
  );
}