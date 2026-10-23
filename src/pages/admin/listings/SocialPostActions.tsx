import Icon from '@/components/ui/icon';
import { SocialPostState } from './useSocialPostDialog';

interface Props {
  s: SocialPostState;
  variant: 'mobile' | 'desktop';
}

/** Кнопки действий окна поста: закреплённая панель для телефона или блок кнопок для компьютера. */
export default function SocialPostActions({ s, variant }: Props) {
  const {
    text, flash, sending, picReady, canCopyImage, canNativeShare,
    copyPostText, copyAll, sendFromPhone, openApp, savePhoto,
  } = s;

  const btnBase = 'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition disabled:opacity-50 active:scale-[0.98]';
  const btnPrimary = `${btnBase} bg-brand-blue text-white hover:opacity-90`;
  const btnGhost = `${btnBase} border border-border bg-white hover:bg-muted/50`;

  const mobileFooter = (
    <div className="space-y-2">
      {canNativeShare ? (
        <button type="button" onClick={sendFromPhone} disabled={!picReady || sending || !text} className={`${btnPrimary} w-full py-3.5 text-base`}>
          <Icon name={sending ? 'Loader2' : 'Share2'} size={18} className={sending ? 'animate-spin' : ''} />
          Отправить фото + текст
        </button>
      ) : (
        <button type="button" onClick={savePhoto} disabled={!picReady} className={`${btnPrimary} w-full py-3.5 text-base`}>
          <Icon name="Download" size={18} /> Сохранить фото
        </button>
      )}
      <div className="grid grid-cols-4 gap-2">
        {([
          ['text', copyPostText, flash === 'text' ? 'Check' : 'Copy', 'Текст', !text],
          ['photo', savePhoto, flash === 'photo' ? 'Check' : 'Download', 'Фото', !picReady],
          ['tg', () => openApp('tg'), flash === 'tg' ? 'Check' : 'Send', 'Телеграм', !text],
          ['vk', () => openApp('vk'), flash === 'vk' ? 'Check' : 'Globe', 'ВК', !text],
        ] as const).map(([id, fn, icon, label, dis]) => (
          <button key={id} type="button" onClick={fn} disabled={dis}
            className={`${btnGhost} flex-col py-2 text-[11px] leading-tight min-h-[56px]`}>
            <Icon name={icon} size={18} className={flash === id ? 'text-emerald-600' : 'text-brand-blue'} />
            {flash === id ? 'Готово' : label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        «Телеграм» и «ВК» копируют текст и открывают приложение — вставьте текст и прикрепите фото (сохраните его кнопкой «Фото»).
      </p>
    </div>
  );

  const desktopFooter = (
    <div className="space-y-2">
      {canCopyImage && (
        <button type="button" onClick={copyAll} disabled={!picReady || !text} className={`${btnPrimary} w-full py-2.5 text-sm`}>
          <Icon name={flash === 'all' ? 'Check' : 'ClipboardCopy'} size={15} />
          {flash === 'all' ? 'Скопировано — вставьте в Телеграм (Ctrl+V)' : 'Скопировать фото + текст'}
        </button>
      )}
      <div className={`grid gap-2 ${canNativeShare ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <button type="button" onClick={copyPostText} disabled={!text} className={`${btnGhost} py-2.5 text-sm`}>
          <Icon name={flash === 'text' ? 'Check' : 'Copy'} size={15} /> {flash === 'text' ? 'Скопировано' : 'Текст'}
        </button>
        <button type="button" onClick={savePhoto} disabled={!picReady} className={`${btnGhost} py-2.5 text-sm`}>
          <Icon name="Download" size={15} /> Скачать фото
        </button>
        {canNativeShare && (
          <button type="button" onClick={sendFromPhone} disabled={!picReady || sending || !text} className={`${btnGhost} py-2.5 text-sm`}>
            <Icon name={sending ? 'Loader2' : 'Share2'} size={15} className={sending ? 'animate-spin' : ''} /> Отправить
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Телеграм: «Скопировать фото + текст» → Ctrl+V в чате — фото придёт с подписью. ВК: «Скачать фото» и «Текст».
        Ник и строку «Партнёрам» можно изменить в Настройки → Основные → Контакты.
      </p>
    </div>
  );

  return variant === 'mobile' ? mobileFooter : desktopFooter;
}
