import Icon from '@/components/ui/icon';
import CollagePicker from './CollagePicker';
import { Listing } from './types';
import { SocialPostState } from './useSocialPostDialog';

interface Props {
  s: SocialPostState;
  listing: Partial<Listing>;
}

/** Левая колонка окна поста: переключатель «Фото | Карточка», изображение и выбор фото для коллажа. */
export default function SocialPostPicturePanel({ s, listing }: Props) {
  const { picMode, setPicMode, photo, photoState, allImages, loadCard, chosen, selected, setSelected, isMobile } = s;

  const picSwitch = (
    <div className="flex gap-1 bg-muted rounded-xl p-1">
      {([['photos', 'Фото', 'Images'], ['card', 'Карточка', 'LayoutTemplate']] as const).map(([id, label, icon]) => (
        <button key={id} type="button" onClick={() => setPicMode(id)}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 sm:py-2 rounded-lg text-sm sm:text-xs font-semibold transition ${
            picMode === id ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'}`}>
          <Icon name={icon} size={14} /> {label}
        </button>
      ))}
    </div>
  );

  const picture = (
    <div className="rounded-xl border border-border overflow-hidden bg-muted/40 relative">
      {photo && (
        <img src={photo.url} alt={`Объект ${listing.id}`}
          className={`w-full h-auto block transition-opacity ${photoState === 'loading' ? 'opacity-40' : ''}`} />
      )}
      {photoState === 'loading' && (
        <div className={`${photo ? 'absolute inset-0' : 'aspect-square'} flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground`}>
          <Icon name="Loader2" size={22} className="animate-spin text-brand-blue" />
          {picMode === 'photos' ? 'Собираю коллаж…' : 'Готовлю фото-карточку…'}
        </div>
      )}
      {photoState === 'error' && (
        <div className="aspect-square flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground text-center px-6">
          <Icon name="ImageOff" size={22} />
          {picMode === 'photos' && !allImages.length ? 'У объекта нет фото — выберите «Карточка»' : picMode === 'photos' && !chosen.length ? 'Выберите фото снизу — первое станет главным' : 'Не удалось подготовить изображение'}
          {picMode === 'card' && (
            <button type="button" onClick={loadCard} className="font-semibold text-brand-blue hover:underline py-1">Попробовать ещё раз</button>
          )}
        </div>
      )}
    </div>
  );

  const thumbs = picMode === 'photos' && allImages.length > 1 && (
    <CollagePicker allImages={allImages} chosen={chosen} isAuto={!selected} isMobile={isMobile} onChange={setSelected} />
  );

  return (
    <div className="space-y-3 min-w-0">
      {picSwitch}
      {picture}
      {thumbs}
    </div>
  );
}
