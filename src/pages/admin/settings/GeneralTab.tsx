import ImageUploader from '@/components/admin/ImageUploader';
import { S, City, WM_POS } from './types';

interface Props {
  tab: 'general' | 'watermark';
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  cities: City[];
  saved: boolean;
  save: () => void;
}

export default function GeneralTab({ tab, s, setS, cities, saved, save }: Props) {
  const field = (key: keyof S, label: string, multiline = false) => (
    <div>
      <label className="text-sm font-semibold block mb-1">{label}</label>
      {multiline ? (
        <textarea className="w-full px-3 py-2 border rounded-lg" rows={3}
          value={(s[key] as string) || ''} onChange={e => setS({ ...s, [key]: e.target.value })} />
      ) : (
        <input className="w-full px-3 py-2 border rounded-lg"
          value={(s[key] as string) || ''} onChange={e => setS({ ...s, [key]: e.target.value })} />
      )}
    </div>
  );

  if (tab === 'general') {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
          <div className="font-display font-700 text-lg mb-2">Логотип</div>
          <ImageUploader
            value={s.logo_url ? [s.logo_url] : []}
            onChange={urls => setS({ ...s, logo_url: urls[0] || '' })}
            folder="logo"
            multiple={false}
            hint="Перетащите файл логотипа или выберите с устройства. PNG прозрачный, рекомендуется 512×512"
          />
          {field('company_name', 'Название компании')}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
          <div className="font-display font-700 text-lg mb-2">Контакты</div>
          {field('company_phone', 'Телефон')}
          {field('company_email', 'Email')}
          {field('company_address', 'Адрес')}
          <div>
            <label className="text-sm font-semibold block mb-1">Основной город</label>
            <select className="w-full px-3 py-2 border rounded-lg" value={s.main_city || 'Краснодар'}
              onChange={e => setS({ ...s, main_city: e.target.value })}>
              {cities.filter(c => c.is_active).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
          <div className="font-display font-700 text-lg mb-2">Главная страница</div>
          {field('hero_title', 'Заголовок Hero')}
          {field('hero_subtitle', 'Подзаголовок Hero', true)}
          {field('about_text', 'О компании', true)}
        </div>

        <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
          <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
          {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
        </div>
      </div>
    );
  }

  // watermark
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg">Водяной знак</div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!s.watermark_enabled}
            onChange={e => setS({ ...s, watermark_enabled: e.target.checked })} />
          <span className="text-sm">Включить водяной знак на фото</span>
        </label>
        <div>
          <label className="text-sm font-semibold block mb-1">Изображение водяного знака</label>
          <ImageUploader
            value={s.watermark_url ? [s.watermark_url] : []}
            onChange={urls => setS({ ...s, watermark_url: urls[0] || '' })}
            folder="watermark" multiple={false}
            hint="PNG с прозрачным фоном"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-semibold block mb-1">Позиция</label>
            <select className="w-full px-3 py-2 border rounded-lg" value={s.watermark_position || 'bottom-right'}
              onChange={e => setS({ ...s, watermark_position: e.target.value })}>
              {WM_POS.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold block mb-1">Прозрачность, %</label>
            <input type="number" min={10} max={100} className="w-full px-3 py-2 border rounded-lg"
              value={s.watermark_opacity ?? 50}
              onChange={e => setS({ ...s, watermark_opacity: +e.target.value })} />
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          На уровне отдельного объявления можно отключить водяной знак — галочкой «Использовать водяной знак».
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
      </div>
    </div>
  );
}
