import { useEffect, useState } from 'react';
import { adminApi, aiApi } from '@/lib/adminApi';
import ImageUploader from '@/components/admin/ImageUploader';
import Icon from '@/components/ui/icon';

interface Listing {
  id: number;
  title: string;
  category: string;
  deal: string;
  price: number;
  area: number;
  address: string;
  district: string;
  city: string;
  status: string;
  description: string;
  image: string;
  images: string;
  tags: string[] | string;
  is_hot: boolean;
  is_new: boolean;
  owner_name: string | null;
  owner_phone: string | null;
  price_unit: 'm2' | 'sotka' | 'total' | string;
  purpose: string | null;
  condition: string | null;
  parking: string | null;
  entrance: string | null;
  floor: number | null;
  total_floors: number | null;
  video_url: string | null;
  video_type: string | null;
  use_watermark: boolean;
  export_yandex: boolean;
  export_avito: boolean;
  export_cian: boolean;
  created_at: string;
  updated_at: string;
}

interface City { id: number; name: string; is_active: boolean }
interface Purpose { id: number; name: string; slug: string }

const CATS = [
  ['office', 'Офис'], ['retail', 'Торговля'], ['warehouse', 'Склад'],
  ['restaurant', 'Ресторан'], ['business', 'Бизнес'], ['production', 'Производство'],
];
const DEALS: [string, string, string][] = [
  ['sale', 'Продажа', 'bg-emerald-100 text-emerald-700'],
  ['rent', 'Аренда', 'bg-blue-100 text-blue-700'],
  ['business', 'Готовый бизнес', 'bg-violet-100 text-violet-700'],
];
const CONDITIONS = [
  ['new', 'Новое'], ['euro', 'Евроремонт'], ['good', 'Хорошее'],
  ['cosmetic', 'Требуется косметика'], ['rough', 'Без отделки'], ['shellcore', 'Shell&Core'],
];
const PARKING = [['none', 'Нет'], ['street', 'На улице'], ['building', 'В здании']];
const ENTRANCE = [['street', 'С улицы'], ['yard', 'Со двора']];

const empty: Partial<Listing> = {
  title: '', category: 'office', deal: 'sale', price: 0, area: 0,
  address: '', district: '', city: 'Краснодар', description: '', image: '', images: '', tags: '',
  status: 'active', is_hot: false, is_new: false,
  owner_name: '', owner_phone: '', price_unit: 'total',
  purpose: '', condition: '', parking: 'none', entrance: 'street',
  floor: null, total_floors: null, video_url: '', video_type: '',
  use_watermark: true, export_yandex: false, export_avito: false, export_cian: false,
};

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const perM2 = (price: number, area: number) => {
  if (!price || !area) return 0;
  return Math.round(price / area);
};

const detectVideoType = (url: string): string => {
  if (!url) return '';
  if (url.includes('vk.com') || url.includes('vkvideo')) return 'vk';
  if (url.includes('rutube.ru')) return 'rutube';
  return 'other';
};

const splitImages = (raw: string | undefined): string[] => {
  if (!raw) return [];
  const sep = raw.includes('|') ? '|' : ',';
  return raw.split(sep).map(s => s.trim()).filter(Boolean);
};

export default function ListingsAdmin() {
  const [items, setItems] = useState<Listing[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [editing, setEditing] = useState<Partial<Listing> | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTagsLoading, setAiTagsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([adminApi.listListings(), adminApi.listCities(), adminApi.listPurposes()])
      .then(([l, c, p]) => {
        setItems(l.listings);
        setCities(c.cities.filter((x: City) => x.is_active));
        setPurposes(p.purposes);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openEdit = (it?: Listing) => {
    if (it) {
      setEditing(it);
      const imgs = splitImages(it.images) ;
      if (!imgs.length && it.image) imgs.push(it.image);
      setPhotos(imgs);
    } else {
      setEditing({ ...empty });
      setPhotos([]);
    }
  };

  const save = async () => {
    if (!editing) return;
    const data: Record<string, unknown> = { ...editing };
    if (Array.isArray(data.tags)) data.tags = (data.tags as string[]).join(',');
    data.images = photos.join('|');
    data.image = photos[0] || '';
    if (data.video_url) data.video_type = detectVideoType(String(data.video_url));
    try {
      if (editing.id) await adminApi.updateListing(editing.id, data);
      else await adminApi.createListing(data);
      setEditing(null);
      setPhotos([]);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const archive = async (id: number) => {
    if (!confirm('Архивировать объект?')) return;
    await adminApi.archiveListing(id);
    load();
  };

  const aiDescribe = async () => {
    if (!editing) return;
    setAiLoading(true);
    try {
      const prompt = `Город: ${editing.city || 'Краснодар'}, категория: ${editing.category}, назначение: ${editing.purpose || '-'}, площадь: ${editing.area} м², адрес: ${editing.address || '-'}, цена: ${editing.price}`;
      const r = await aiApi.ask('describe', prompt);
      setEditing({ ...editing, description: r.text });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка ИИ');
    } finally {
      setAiLoading(false);
    }
  };

  const generateTags = async () => {
    if (!editing) return;
    setAiTagsLoading(true);
    try {
      const ctx = `Название: ${editing.title}, категория: ${editing.category}, назначение: ${editing.purpose || ''}, состояние: ${editing.condition || ''}, парковка: ${editing.parking || ''}, описание: ${editing.description || ''}`;
      const r = await aiApi.ask('auto_tags', ctx);
      setEditing({ ...editing, tags: r.text.replace(/\n/g, ',').replace(/\s+,/g, ',') });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setAiTagsLoading(false);
    }
  };

  if (loading) return <div>Загрузка...</div>;
  const dealMeta = (d: string) => DEALS.find(x => x[0] === d);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Всего: {items.length}</div>
        <button onClick={() => openEdit()}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="Plus" size={16} /> Добавить
        </button>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-3">Фото</th>
              <th className="px-3 py-3">Объект</th>
              <th className="px-3 py-3">Сделка</th>
              <th className="px-3 py-3">Цена</th>
              <th className="px-3 py-3">Собственник</th>
              <th className="px-3 py-3">Создан</th>
              <th className="px-3 py-3">Изменён</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const dm = dealMeta(it.deal);
              const m2 = perM2(it.price, it.area);
              const mainImg = splitImages(it.images)[0] || it.image;
              return (
                <tr key={it.id} className="border-t border-border hover:bg-muted/30 align-top">
                  <td className="px-3 py-3">
                    {mainImg ? (
                      <img src={mainImg} alt={it.title}
                        className="w-16 h-16 rounded-lg object-cover border border-border" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                        <Icon name="Image" size={20} className="text-muted-foreground" />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold">{it.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.city || 'Краснодар'}{it.district ? ` · ${it.district}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">{it.area} м²</div>
                  </td>
                  <td className="px-3 py-3">
                    {dm && (
                      <span className={`text-xs px-2 py-0.5 rounded ${dm[2]} font-semibold`}>{dm[1]}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="font-semibold">{(it.price || 0).toLocaleString('ru')} ₽</div>
                    {m2 > 0 && <div className="text-xs text-muted-foreground">{m2.toLocaleString('ru')} ₽/м²</div>}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {it.owner_name && <div>{it.owner_name}</div>}
                    {it.owner_phone && (
                      <a href={`tel:${it.owner_phone}`} className="text-brand-blue hover:underline">{it.owner_phone}</a>
                    )}
                    {!it.owner_name && !it.owner_phone && <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap">{fmtDate(it.created_at)}</td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap">{fmtDate(it.updated_at)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(it)} className="text-brand-blue hover:underline mr-3">
                      <Icon name="Pencil" size={16} />
                    </button>
                    <button onClick={() => archive(it.id)} className="text-red-600 hover:underline">
                      <Icon name="Archive" size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-white z-10">
              <div className="font-display font-700 text-lg">
                {editing.id ? 'Редактировать' : 'Новый объект'}
              </div>
              <button onClick={() => { setEditing(null); setPhotos([]); }}><Icon name="X" size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="Название"
                value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })} />

              <div>
                <label className="text-sm font-semibold block mb-1">Фотографии</label>
                <ImageUploader value={photos} onChange={setPhotos} folder="photos" multiple />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Категория</label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={editing.category}
                    onChange={e => setEditing({ ...editing, category: e.target.value })}>
                    {CATS.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Тип сделки</label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={editing.deal}
                    onChange={e => setEditing({ ...editing, deal: e.target.value })}>
                    {DEALS.map(d => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Назначение</label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={editing.purpose || ''}
                    onChange={e => setEditing({ ...editing, purpose: e.target.value })}>
                    <option value="">— Не выбрано —</option>
                    {purposes.map(p => <option key={p.id} value={p.slug}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Состояние</label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={editing.condition || ''}
                    onChange={e => setEditing({ ...editing, condition: e.target.value })}>
                    <option value="">— Не выбрано —</option>
                    {CONDITIONS.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Цена, ₽</label>
                  <input type="number" className="w-full px-3 py-2 border rounded-lg"
                    value={editing.price || ''} onChange={e => setEditing({ ...editing, price: +e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Площадь, м²</label>
                  <input type="number" className="w-full px-3 py-2 border rounded-lg"
                    value={editing.area || ''} onChange={e => setEditing({ ...editing, area: +e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Единица цены</label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={editing.price_unit || 'total'}
                    onChange={e => setEditing({ ...editing, price_unit: e.target.value })}>
                    <option value="total">За весь объект</option>
                    <option value="m2">За м²</option>
                    <option value="sotka">За сотку</option>
                  </select>
                </div>
              </div>

              {editing.price && editing.area ? (
                <div className="text-sm bg-muted/40 rounded-lg p-3">
                  За м²: <b>{perM2(+editing.price, +editing.area).toLocaleString('ru')} ₽</b>
                  {editing.price_unit === 'total' && ' (рассчитано из цены за объект)'}
                </div>
              ) : null}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Этаж</label>
                  <input type="number" className="w-full px-3 py-2 border rounded-lg"
                    value={editing.floor ?? ''} onChange={e => setEditing({ ...editing, floor: e.target.value === '' ? null : +e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Этажность</label>
                  <input type="number" className="w-full px-3 py-2 border rounded-lg"
                    value={editing.total_floors ?? ''} onChange={e => setEditing({ ...editing, total_floors: e.target.value === '' ? null : +e.target.value })} />
                </div>
                <div></div>
                <div>
                  <label className="text-xs text-muted-foreground">Парковка</label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={editing.parking || 'none'}
                    onChange={e => setEditing({ ...editing, parking: e.target.value })}>
                    {PARKING.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Вход</label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={editing.entrance || 'street'}
                    onChange={e => setEditing({ ...editing, entrance: e.target.value })}>
                    {ENTRANCE.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Город</label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={editing.city || 'Краснодар'}
                    onChange={e => setEditing({ ...editing, city: e.target.value })}>
                    {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Район</label>
                  <input className="w-full px-3 py-2 border rounded-lg"
                    value={editing.district || ''} onChange={e => setEditing({ ...editing, district: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Адрес</label>
                  <input className="w-full px-3 py-2 border rounded-lg"
                    value={editing.address || ''} onChange={e => setEditing({ ...editing, address: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Имя собственника</label>
                  <input className="w-full px-3 py-2 border rounded-lg"
                    value={editing.owner_name || ''} onChange={e => setEditing({ ...editing, owner_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Телефон собственника</label>
                  <input className="w-full px-3 py-2 border rounded-lg" placeholder="+7..."
                    value={editing.owner_phone || ''} onChange={e => setEditing({ ...editing, owner_phone: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Видео (VK Видео или RuTube URL)</label>
                <input className="w-full px-3 py-2 border rounded-lg" placeholder="https://vk.com/video... или https://rutube.ru/video/..."
                  value={editing.video_url || ''} onChange={e => setEditing({ ...editing, video_url: e.target.value })} />
                {editing.video_url && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Тип: {detectVideoType(editing.video_url) === 'vk' ? 'VK Видео' : detectVideoType(editing.video_url) === 'rutube' ? 'RuTube' : 'Другое'}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold">Описание</label>
                  <button onClick={aiDescribe} disabled={aiLoading}
                    className="text-xs text-brand-orange hover:underline inline-flex items-center gap-1">
                    <Icon name="Sparkles" size={12} />
                    {aiLoading ? 'Генерация...' : 'Сгенерировать ИИ'}
                  </button>
                </div>
                <textarea className="w-full px-3 py-2 border rounded-lg" rows={4}
                  value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold">Теги для поиска</label>
                  <button onClick={generateTags} disabled={aiTagsLoading}
                    className="text-xs text-brand-orange hover:underline inline-flex items-center gap-1">
                    <Icon name="Sparkles" size={12} />
                    {aiTagsLoading ? 'Генерация...' : 'Сгенерировать ИИ'}
                  </button>
                </div>
                <input className="w-full px-3 py-2 border rounded-lg bg-muted/30" readOnly
                  placeholder="Теги создаются автоматически на основе данных объекта"
                  value={typeof editing.tags === 'string' ? editing.tags : (editing.tags || []).join(', ')} />
                <div className="text-xs text-muted-foreground mt-1">Создаются на основе данных. Кнопка ИИ — пересоздать.</div>
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <div className="text-sm font-semibold">Дополнительно</div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!editing.use_watermark}
                      onChange={e => setEditing({ ...editing, use_watermark: e.target.checked })} />
                    Использовать водяной знак
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!editing.is_hot}
                      onChange={e => setEditing({ ...editing, is_hot: e.target.checked })} />
                    Горячее
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!editing.is_new}
                      onChange={e => setEditing({ ...editing, is_new: e.target.checked })} />
                    Новинка
                  </label>
                </div>
                <div className="text-xs text-muted-foreground pt-2">Выгрузка в XML фиды:</div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!editing.export_yandex}
                      onChange={e => setEditing({ ...editing, export_yandex: e.target.checked })} />
                    Яндекс.Недвижимость
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!editing.export_avito}
                      onChange={e => setEditing({ ...editing, export_avito: e.target.checked })} />
                    Авито
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!editing.export_cian}
                      onChange={e => setEditing({ ...editing, export_cian: e.target.checked })} />
                    ЦИАН
                  </label>
                </div>
              </div>

              {editing.id && (
                <div className="text-xs text-muted-foreground border-t border-border pt-3">
                  Создан: {fmtDate(editing.created_at as string)} ·
                  Обновлён: {fmtDate(editing.updated_at as string)}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => { setEditing(null); setPhotos([]); }} className="px-4 py-2 rounded-xl text-sm">Отмена</button>
              <button onClick={save} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
