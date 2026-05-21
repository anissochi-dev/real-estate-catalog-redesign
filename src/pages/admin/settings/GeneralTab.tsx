import { useRef, useState } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import Icon from '@/components/ui/icon';
import { applyWatermarkClient } from '@/lib/applyWatermark';
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
  const previewInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const previewWatermark = async (file: File) => {
    if (!s.watermark_url) { alert('Сначала загрузите изображение водяного знака'); return; }
    setPreviewing(true);
    try {
      const result = await applyWatermarkClient(file, {
        watermark_enabled: true,
        watermark_url: s.watermark_url,
        watermark_position: s.watermark_position || 'bottom-right',
        watermark_opacity: s.watermark_opacity ?? 50,
      });
      const url = URL.createObjectURL(result);
      setPreviewUrl(url);
    } finally {
      setPreviewing(false);
    }
  };
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
        <div>
          <div className="text-sm font-semibold mb-2">Предпросмотр</div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => previewInputRef.current?.click()}
              disabled={!s.watermark_url || previewing}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name={previewing ? 'Loader2' : 'ImagePlus'} size={15} className={previewing ? 'animate-spin' : ''} />
              {previewing ? 'Обработка...' : 'Загрузить фото для теста'}
            </button>
            {previewUrl && (
              <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
                className="text-xs text-muted-foreground hover:text-red-500 inline-flex items-center gap-1">
                <Icon name="X" size={12} /> Очистить
              </button>
            )}
          </div>
          <input ref={previewInputRef} type="file" className="hidden" accept="image/*"
            onChange={e => { const f = e.target.files?.[0]; if (f) previewWatermark(f); e.target.value = ''; }} />
          {previewUrl && (
            <div className="mt-3">
              <img src={previewUrl} alt="Предпросмотр" className="rounded-xl max-w-full max-h-64 object-contain border border-border shadow" />
              <div className="text-xs text-muted-foreground mt-1">Так будет выглядеть фото с водяным знаком</div>
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          На уровне отдельного объявления можно отключить водяной знак — галочкой «Использовать водяной знак».
          Наложение происходит на сервере при загрузке фото объекта.
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
      </div>
    </div>
  );
}