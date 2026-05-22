import ImageUploader from '@/components/admin/ImageUploader';
import Icon from '@/components/ui/icon';
import { S } from './types';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

const ColorField = ({ label, value, hint, onChange }: { label: string; value: string; hint?: string; onChange: (v: string) => void }) => (
  <div>
    <label className="text-sm font-semibold block mb-1">{label}</label>
    <div className="flex items-center gap-2">
      <input
        type="color"
        className="w-12 h-10 rounded-lg border cursor-pointer"
        value={value || '#000000'}
        onChange={e => onChange(e.target.value)}
      />
      <input
        className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
        placeholder="#1e88e5"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
    {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
  </div>
);

export default function BrandKitTab({ s, setS, saved, save }: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="Palette" size={18} /> Цвета бренда
        </div>
        <div className="text-sm text-muted-foreground">
          Цвета применяются на сайте и в шаблонах писем. Можно ввести HEX вручную или выбрать пипеткой.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ColorField
            label="Основной"
            value={s.brand_primary_color || ''}
            hint="Кнопки, ссылки, акценты"
            onChange={v => setS({ ...s, brand_primary_color: v })}
          />
          <ColorField
            label="Дополнительный"
            value={s.brand_secondary_color || ''}
            hint="Заголовки, вторичные элементы"
            onChange={v => setS({ ...s, brand_secondary_color: v })}
          />
          <ColorField
            label="Акцент"
            value={s.brand_accent_color || ''}
            hint="Бейджи «Горячее», «Новое»"
            onChange={v => setS({ ...s, brand_accent_color: v })}
          />
        </div>
        {(s.brand_primary_color || s.brand_secondary_color || s.brand_accent_color) && (
          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs text-muted-foreground">Предпросмотр:</span>
            {s.brand_primary_color && (
              <button type="button" className="px-4 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: s.brand_primary_color }}>
                Кнопка
              </button>
            )}
            {s.brand_accent_color && (
              <span className="px-2.5 py-1 rounded-full text-white text-xs font-semibold" style={{ background: s.brand_accent_color }}>
                Горячее
              </span>
            )}
            {s.brand_secondary_color && (
              <span className="text-lg font-display font-700" style={{ color: s.brand_secondary_color }}>
                Заголовок
              </span>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="Image" size={18} /> Иконки и Open Graph
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Favicon (вкладка браузера)</label>
          <ImageUploader value={s.favicon_url || ''} onChange={v => setS({ ...s, favicon_url: v })} />
          <div className="text-xs text-muted-foreground mt-1">PNG 32×32 или 64×64. Показывается во вкладке браузера.</div>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Apple Touch Icon</label>
          <ImageUploader value={s.apple_touch_icon_url || ''} onChange={v => setS({ ...s, apple_touch_icon_url: v })} />
          <div className="text-xs text-muted-foreground mt-1">PNG 180×180. Иконка при добавлении сайта на главный экран iPhone/iPad.</div>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Open Graph картинка (превью при репосте)</label>
          <ImageUploader value={s.og_image_url || ''} onChange={v => setS({ ...s, og_image_url: v })} />
          <div className="text-xs text-muted-foreground mt-1">1200×630 px. Показывается при шаринге ссылки в соцсетях и мессенджерах.</div>
        </div>
      </div>

      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
      </div>
    </div>
  );
}
