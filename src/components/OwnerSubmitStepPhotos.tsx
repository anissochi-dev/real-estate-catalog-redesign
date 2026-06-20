import { useRef, useState } from 'react';
import Icon from '@/components/ui/icon';

const MAX_FILES = 15;

interface Props {
  photos: string[];
  photoLoading: boolean;
  videoUrl: string;
  setVideoUrl: (v: string) => void;
  onFiles: (files: FileList | File[]) => void;
  onRemovePhoto: (i: number) => void;
  inputCls: (field: string) => string;
}

export default function OwnerSubmitStepPhotos({
  photos,
  photoLoading,
  videoUrl,
  setVideoUrl,
  onFiles,
  onRemovePhoto,
  inputCls,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-brand-blue mb-1">
        <Icon name="Camera" size={16} />
        <span className="font-semibold text-sm">Фотографии объекта</span>
      </div>

      {/* Зона загрузки */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl py-6 px-4 text-center transition ${
          dragOver ? 'border-brand-blue bg-brand-blue/5' : 'border-border hover:border-brand-blue/50 bg-muted/20'
        }`}
      >
        <input ref={fileRef} type="file" multiple accept="image/*" className="hidden"
          onChange={e => e.target.files && onFiles(e.target.files)} />
        <Icon name={photoLoading ? 'Loader2' : 'Upload'} size={28}
          className={`mx-auto mb-2 text-brand-blue ${photoLoading ? 'animate-spin' : ''}`} />
        <div className="font-semibold text-sm">
          {photoLoading ? 'Обработка фото…' : 'Нажмите или перетащите фото'}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          До {MAX_FILES} фото, JPG/PNG/WEBP · Сжимаются автоматически
        </div>
      </div>

      {/* Превью фото */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((b64, i) => (
            <div key={i} className="relative group rounded-xl overflow-hidden border border-border aspect-square">
              <img src={b64} alt="" className="w-full h-full object-cover" />
              {i === 0 && (
                <div className="absolute top-1 left-1 text-[9px] bg-brand-blue text-white px-1.5 py-0.5 rounded-full font-bold">
                  Главное
                </div>
              )}
              <button type="button" onClick={() => onRemovePhoto(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow">
                <Icon name="X" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Видео */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">
          Ссылка на видео <span className="font-normal opacity-60">(необязательно)</span>
        </label>
        <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
          placeholder="https://vk.com/video... или https://rutube.ru/video/..."
          className={inputCls('videoUrl')} />
      </div>

      {/* Итоговая подсказка */}
      <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
        <Icon name="ShieldCheck" size={16} className="text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-800 leading-relaxed">
          Объект будет проверен модератором и опубликован в течение 24 часов.
          После публикации мы свяжемся с вами.
        </div>
      </div>
    </div>
  );
}
