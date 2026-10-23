import Icon from '@/components/ui/icon';
import { boldToHtml, TELEGRAM_CAPTION_LIMIT, VK_POST_LIMIT } from '@/lib/socialPostText';
import { LINK_SRC_LABEL, LinkSrc, SocialPostState } from './useSocialPostDialog';

interface Props {
  s: SocialPostState;
}

/** Текст поста: редактор, предпросмотр, переключатель ссылки на объект и счётчики длины. */
export default function SocialPostTextPanel({ s }: Props) {
  const {
    company, isMobile, text, setText, setEdited, edited, generated, textTab, setTextTab, finalText,
    linkOn, toggleLink, linkSrc, setLinkSrc, len, tgOver,
  } = s;

  const previewBox = (
    <div
      className="px-3 py-2.5 rounded-xl bg-muted/50 text-[15px] sm:text-sm leading-relaxed whitespace-pre-wrap break-words md:max-h-44 md:overflow-y-auto"
      dangerouslySetInnerHTML={{ __html: boldToHtml(finalText).replace(/<br>/g, '\n') }}
    />
  );

  const editor = (
    <textarea
      value={text}
      onChange={e => { setText(e.target.value); setEdited(true); }}
      rows={isMobile ? 14 : 8}
      className="w-full px-3 py-2.5 border border-border rounded-xl text-base sm:text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
    />
  );

  const linkControl = company && (
    <div className="rounded-xl border border-border px-3 py-2.5 space-y-2">
      <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="Link" size={15} className="text-brand-blue" /> Ссылка на объект
        </span>
        <button type="button" role="switch" aria-checked={linkOn} onClick={() => toggleLink(!linkOn)}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${linkOn ? 'bg-brand-blue' : 'bg-muted-foreground/30'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${linkOn ? 'translate-x-5' : ''}`} />
        </button>
      </label>
      {linkOn && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-[11px] text-muted-foreground">Метка источника:</span>
            {(Object.keys(LINK_SRC_LABEL) as LinkSrc[]).map(src => (
              <button key={src} type="button" onClick={() => setLinkSrc(src)}
                className={`px-2.5 py-1 rounded-full text-xs sm:text-[11px] font-semibold transition ${
                  linkSrc === src ? 'bg-brand-blue text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {LINK_SRC_LABEL[src]}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground leading-snug">
            Ссылка добавится в конец поста. Кнопки «Телеграм» и «ВК» сами ставят свою метку — переходы видны в Яндекс Метрике (Источники → Метки UTM).
          </div>
        </>
      )}
    </div>
  );

  const counters = (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${tgOver ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
            <Icon name="Send" size={10} /> Телеграм {len}/{TELEGRAM_CAPTION_LIMIT}
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${len > VK_POST_LIMIT ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
            ВК {len > VK_POST_LIMIT ? 'слишком длинно' : 'ок'}
          </span>
        </div>
        {edited && (
          <button type="button" onClick={() => { setEdited(false); setText(generated); }} className="inline-flex items-center gap-1 font-semibold text-brand-blue hover:underline py-1">
            <Icon name="RotateCcw" size={11} /> Вернуть авто
          </button>
        )}
      </div>
      {tgOver && (
        <div className="text-[11px] text-red-600">
          В Телеграме подпись к фото ограничена {TELEGRAM_CAPTION_LIMIT} символами — сократите текст на {len - TELEGRAM_CAPTION_LIMIT}, иначе он уйдёт отдельным сообщением.
        </div>
      )}
    </>
  );

  const textBlock = !company ? (
    <div className="flex items-center justify-center py-10"><Icon name="Loader2" size={20} className="animate-spin text-brand-blue" /></div>
  ) : isMobile ? (
    <div className="space-y-2">
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {([['preview', 'Предпросмотр', 'Eye'], ['edit', 'Править', 'Pencil']] as const).map(([id, label, icon]) => (
          <button key={id} type="button" onClick={() => setTextTab(id)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition ${
              textTab === id ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground'}`}>
            <Icon name={icon} size={14} /> {label}
          </button>
        ))}
      </div>
      {textTab === 'preview' ? previewBox : editor}
      {linkControl}
      {textTab === 'edit' && (
        <div className="text-xs text-muted-foreground">Текст между <b>**звёздочками**</b> будет жирным в Телеграме.</div>
      )}
      {counters}
    </div>
  ) : (
    <div className="space-y-2">
      {editor}
      <div className="text-[11px] text-muted-foreground">
        Так подпись будет выглядеть в Телеграме. Текст между <b>**звёздочками**</b> выделяется жирным.
      </div>
      {previewBox}
      {linkControl}
      {counters}
    </div>
  );

  return textBlock;
}
