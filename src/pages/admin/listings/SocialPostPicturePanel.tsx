import Icon from '@/components/ui/icon';
import { COLLAGE_MAX } from '@/lib/photoCollage';
import { Listing } from './types';
import { SocialPostState } from './useSocialPostDialog';

interface Props {
  s: SocialPostState;
  listing: Partial<Listing>;
}

/** Левая колонка окна поста: переключатель «Фото | Карточка», изображение и выбор фото для коллажа. */
export default function SocialPostPicturePanel({ s, listing }: Props) {
  const { picMode, setPicMode, photo, photoState, allImages, loadCard, chosen, selected, setSelected, toggleImage, makeMain, isMobile } = s;

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
          {picMode === 'photos' && !allImages.length ? 'У объекта нет фото — выберите «Карточка»' : 'Не удалось подготовить изображение'}
          {picMode === 'card' && (
            <button type="button" onClick={loadCard} className="font-semibold text-brand-blue hover:underline py-1">Попробовать ещё раз</button>
          )}
        </div>
      )}
    </div>
  );

  const thumbs = picMode === 'photos' && allImages.length > 1 && (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2 text-xs sm:text-[11px] text-muted-foreground">
        <span>Фото в коллаже: {chosen.length} из {COLLAGE_MAX}. Нажмите, чтобы добавить или убрать, ★ — сделать первым.</span>
        {selected && (
          <button type="button" onClick={() => setSelected(null)} className="shrink-0 font-semibold text-brand-blue hover:underline">Сбросить</button>
        )}
      </div>
      <div className="flex gap-2 sm:gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {allImages.map(url => {
          const idx = chosen.indexOf(url);
          const on = idx >= 0;
          return (
            <div key={url} className="relative shrink-0 snap-start">
              <button type="button" onClick={() => toggleImage(url)}
                className={`block w-[72px] h-[72px] sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 transition ${on ? 'border-brand-blue' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
              {on && (
                <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-brand-blue text-white text-[10px] font-bold flex items-center justify-center pointer-events-none">
                  {idx + 1}
                </span>
              )}
              {on && idx > 0 && (
                <button type="button" onClick={() => makeMain(url)} title="Сделать первым"
                  className="absolute bottom-0.5 right-0.5 w-7 h-7 sm:w-5 sm:h-5 rounded-full bg-white/95 text-amber-500 flex items-center justify-center shadow">
                  <Icon name="Star" size={isMobile ? 14 : 11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 min-w-0">
      {picSwitch}
      {picture}
      {thumbs}
    </div>
  );
}
