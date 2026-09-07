import { useEffect, useRef, useState } from 'react';
import { adminApi, uploadFileEx } from '@/lib/adminApi';
import { usePlatformLogos } from '@/contexts/PlatformLogosContext';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';

interface PlatformKey {
  id: number;
  platform: string;
  logo_url: string | null;
}

const PLATFORM_META: Record<string, { label: string; icon: string; color: string }> = {
  yandex_realty: { label: 'Яндекс.Недвижимость', icon: 'Home', color: 'text-red-600 bg-red-50 border-red-200' },
  avito: { label: 'Авито', icon: 'ShoppingBag', color: 'text-green-600 bg-green-50 border-green-200' },
  cian: { label: 'ЦИАН', icon: 'Building2', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  youla: { label: 'Юла', icon: 'ShoppingCart', color: 'text-violet-600 bg-violet-50 border-violet-200' },
  domclick: { label: 'ДомКлик', icon: 'MousePointer', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
};
const PLATFORM_ORDER = ['yandex_realty', 'avito', 'cian', 'youla', 'domclick'];

/** Загрузка логотипов площадок — используются вместо иконки-заглушки везде,
 * где на сайте отображается площадка (список объектов, кабинеты, прайс размещения
 * и т.д.). Не влияет на API-ключи — только картинка. Доступно admin/director. */
export default function XmlPlatformLogosCard() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'director';
  const [platforms, setPlatforms] = useState<PlatformKey[]>([]);
  const [loading, setLoading] = useState(canManage);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const { reload: reloadLogos } = usePlatformLogos();

  const load = () => {
    adminApi.getAdPlatformKeys()
      .then(r => setPlatforms(r.platforms || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (canManage) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Загрузка логотипов — только admin/director (ad_platform_keys содержит секреты,
  // поэтому этот эндпоинт им недоступен; остальные видят лого через platform_logos).
  if (!canManage) return null;

  const handleFile = async (p: PlatformKey, file: File | undefined) => {
    if (!file) return;
    setUploadingId(p.id);
    try {
      const { url } = await uploadFileEx(file, 'logo');
      await adminApi.updateAdPlatformKey(p.id, { logo_url: url });
      setPlatforms(list => list.map(x => x.id === p.id ? { ...x, logo_url: url } : x));
      await reloadLogos();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Не удалось загрузить логотип');
    } finally {
      setUploadingId(null);
    }
  };

  const removeLogo = async (p: PlatformKey) => {
    if (!confirm('Удалить логотип? Вернётся стандартная иконка.')) return;
    setUploadingId(p.id);
    try {
      await adminApi.updateAdPlatformKey(p.id, { logo_url: null });
      setPlatforms(list => list.map(x => x.id === p.id ? { ...x, logo_url: null } : x));
      await reloadLogos();
    } finally {
      setUploadingId(null);
    }
  };

  if (loading) return null;

  const sorted = [...platforms].sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="font-display font-700 text-lg mb-1">Логотипы площадок</div>
      <div className="text-xs text-muted-foreground mb-4">
        Загрузите логотип площадки — он заменит иконку-заглушку везде, где площадка отображается (список объектов, кабинеты, прайс размещения). Если логотип не загружен — остаётся текущая иконка.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {sorted.map(p => {
          const meta = PLATFORM_META[p.platform];
          if (!meta) return null;
          const isUploading = uploadingId === p.id;
          return (
            <div key={p.id} className="flex items-center gap-3 p-3 border border-border rounded-xl">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 overflow-hidden ${meta.color}`}>
                {p.logo_url ? (
                  <img src={p.logo_url} alt="" className="w-full h-full object-contain p-1" />
                ) : (
                  <Icon name={meta.icon} size={20} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{meta.label}</div>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputs.current[p.id]?.click()}
                    className="text-xs px-2 py-1 rounded-lg bg-brand-blue text-white inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {isUploading ? <Icon name="Loader2" size={11} className="animate-spin" /> : <Icon name="Upload" size={11} />}
                    {p.logo_url ? 'Заменить' : 'Загрузить'}
                  </button>
                  {p.logo_url && (
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => removeLogo(p)}
                      className="text-xs px-2 py-1 rounded-lg bg-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Icon name="Trash2" size={11} />
                    </button>
                  )}
                </div>
                <input
                  ref={el => { fileInputs.current[p.id] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { handleFile(p, e.target.files?.[0]); e.target.value = ''; }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}