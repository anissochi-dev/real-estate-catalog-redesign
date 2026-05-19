import { useEffect, useRef, useState } from 'react';
import { adminApi, aiApi } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import ListingsTable from './listings/ListingsTable';
import ListingEditor from './listings/ListingEditor';
import ListingHistory from './listings/ListingHistory';
import {
  Listing, City, Purpose, empty, detectVideoType, splitImages, CATS,
} from './listings/types';

const SITE_URL = window.location.origin;
const DRAFT_KEY = 'biznest_listing_draft';

function loadDraft(): { editing: Partial<Listing>; photos: string[] } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveDraft(editing: Partial<Listing>, photos: string[]) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ editing, photos })); } catch { /* ignore */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

type StatusFilter = 'active' | 'archived' | 'all';

const BULK_OPS = [
  { op: 'archive', label: 'Архивировать', icon: 'Archive', confirm: true },
  { op: 'activate', label: 'Сделать активными', icon: 'CheckCircle', confirm: true },
  { op: 'set_hot', label: 'Горячее', icon: 'Flame', value: true },
  { op: 'set_hot_off', label: 'Убрать горячее', icon: 'FlameOff', value: false, realOp: 'set_hot' },
  { op: 'set_new', label: 'Новинка', icon: 'Sparkles', value: true },
  { op: 'set_new_off', label: 'Убрать новинку', icon: 'X', value: false, realOp: 'set_new' },
];

export default function ListingsAdmin() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [photoPickListing, setPhotoPickListing] = useState<Listing | null>(null);
  const [items, setItems] = useState<Listing[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [editing, setEditing] = useState<Partial<Listing> | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [historyListing, setHistoryListing] = useState<Listing | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTagsLoading, setAiTagsLoading] = useState(false);
  const [aiSeoLoading, setAiSeoLoading] = useState(false);
  const [aiAllLoading, setAiAllLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [hasDraft, setHasDraft] = useState(() => !!loadDraft());
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Автосохранение черновика для нового (несохранённого) объекта
  useEffect(() => {
    if (!editing || editing.id) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraft(editing, photos);
      setHasDraft(true);
    }, 1500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [editing, photos]);

  const filtered = items.filter(it => {
    if (statusFilter !== 'all' && it.status !== statusFilter) return false;
    if (catFilter && it.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        it.title?.toLowerCase().includes(q) ||
        it.address?.toLowerCase().includes(q) ||
        it.owner_name?.toLowerCase().includes(q) ||
        it.owner_phone?.includes(q) ||
        String(it.public_code || '').includes(q)
      );
    }
    return true;
  });

  const openEdit = (it?: Listing) => {
    if (it) {
      setEditing(it);
      const imgs = splitImages(it.images);
      if (!imgs.length && it.image) imgs.push(it.image);
      setPhotos(imgs);
    } else {
      const draft = loadDraft();
      if (draft) {
        setEditing(draft.editing);
        setPhotos(draft.photos);
      } else {
        setEditing({ ...empty });
        setPhotos([]);
      }
    }
  };

  const save = async () => {
    if (!editing) return;
    const isNew = !editing.id;
    const data: Record<string, unknown> = { ...editing };
    if (Array.isArray(data.tags)) data.tags = (data.tags as string[]).join(',');
    data.images = photos.join('|');
    data.image = photos[0] || '';
    if (data.video_url) data.video_type = detectVideoType(String(data.video_url));
    try {
      if (editing.id) {
        await adminApi.updateListing(editing.id, data);
        await adminApi.addListingHistory(editing.id, 'updated', {});
      } else {
        const res = await adminApi.createListing(data);
        if (res.id) await adminApi.addListingHistory(res.id, 'created', {});
      }
      clearDraft();
      setHasDraft(false);
      setEditing(null);
      setPhotos([]);
      if (isNew) setStatusFilter('active');
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const archive = async (id: number) => {
    const it = items.find(i => i.id === id);
    const isArchived = it?.status === 'archived';
    if (!confirm(isArchived ? 'Восстановить объект?' : 'Архивировать объект?')) return;
    if (isArchived) {
      await adminApi.updateListing(id, { status: 'active' });
      await adminApi.addListingHistory(id, 'restored', {});
    } else {
      await adminApi.archiveListing(id);
      await adminApi.addListingHistory(id, 'archived', {});
    }
    load();
  };

  const runBulk = async (op: string, value?: unknown) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkLoading(true);
    try {
      await adminApi.bulkListings(ids, op, value);
      setSelected(new Set());
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`ПОЛНОСТЬЮ УДАЛИТЬ ${ids.length} объект(ов) без возможности восстановления?`)) return;
    setBulkLoading(true);
    try {
      await adminApi.bulkListings(ids, 'delete');
      setSelected(new Set());
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) { s.delete(id); } else { s.add(id); }
      return s;
    });
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

  const generateSeo = async () => {
    if (!editing) return;
    setAiSeoLoading(true);
    try {
      const dealLabel = editing.deal === 'rent' ? 'аренда' : editing.deal === 'business' ? 'готовый бизнес' : 'продажа';
      const ctx = `Название: ${editing.title || ''}. Тип: ${editing.category || ''}. Сделка: ${dealLabel}. Город: ${editing.city || 'Краснодар'}. Район: ${editing.district || ''}. Адрес: ${editing.address || ''}. Площадь: ${editing.area || 0} м². Цена: ${editing.price || 0} ₽. Описание: ${editing.description || ''}`;
      const r = await aiApi.ask('seo_listing', ctx);
      const txt = r.text || '';
      const titleMatch = txt.match(/TITLE:\s*(.+)/i);
      const descMatch = txt.match(/DESCRIPTION:\s*([\s\S]+)/i);
      const seo_title = (titleMatch ? titleMatch[1] : '').trim().replace(/^["«]|["»]$/g, '');
      const seo_description = (descMatch ? descMatch[1] : '').trim().replace(/^["«]|["»]$/g, '').slice(0, 200);
      setEditing({ ...editing, seo_title, seo_description });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setAiSeoLoading(false);
    }
  };

  const generateAll = async () => {
    if (!editing) return;
    setAiAllLoading(true);
    try {
      const dealLabel = editing.deal === 'rent' ? 'аренда' : editing.deal === 'business' ? 'готовый бизнес' : 'продажа';
      const descPrompt = `Город: ${editing.city || 'Краснодар'}, категория: ${editing.category}, назначение: ${editing.purpose || '-'}, площадь: ${editing.area} м², адрес: ${editing.address || '-'}, цена: ${editing.price}`;
      const descRes = await aiApi.ask('describe', descPrompt);
      const description = descRes.text || editing.description || '';
      const tagsCtx = `Название: ${editing.title}, категория: ${editing.category}, назначение: ${editing.purpose || ''}, состояние: ${editing.condition || ''}, парковка: ${editing.parking || ''}, описание: ${description}`;
      const tagsRes = await aiApi.ask('auto_tags', tagsCtx);
      const tags = (tagsRes.text || '').replace(/\n/g, ',').replace(/\s+,/g, ',');
      const seoCtx = `Название: ${editing.title || ''}. Тип: ${editing.category || ''}. Сделка: ${dealLabel}. Город: ${editing.city || 'Краснодар'}. Район: ${editing.district || ''}. Адрес: ${editing.address || ''}. Площадь: ${editing.area || 0} м². Цена: ${editing.price || 0} ₽. Описание: ${description}`;
      const seoRes = await aiApi.ask('seo_listing', seoCtx);
      const txt = seoRes.text || '';
      const titleMatch = txt.match(/TITLE:\s*(.+)/i);
      const descMatch = txt.match(/DESCRIPTION:\s*([\s\S]+)/i);
      const seo_title = (titleMatch ? titleMatch[1] : '').trim().replace(/^["«]|["»]$/g, '');
      const seo_description = (descMatch ? descMatch[1] : '').trim().replace(/^["«]|["»]$/g, '').slice(0, 200);
      setEditing({ ...editing, description, tags, seo_title, seo_description });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка ИИ');
    } finally {
      setAiAllLoading(false);
    }
  };

  if (loading) return <div>Загрузка...</div>;

  const activeCount = items.filter(i => i.status === 'active').length;
  const archivedCount = items.filter(i => i.status === 'archived').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {([['active', `Активные (${activeCount})`, 'CheckCircle'], ['archived', `Архив (${archivedCount})`, 'Archive'], ['all', `Все (${items.length})`, 'List']] as [StatusFilter, string, string][]).map(([v, l, ic]) => (
            <button key={v} onClick={() => { setStatusFilter(v); setSelected(new Set()); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${statusFilter === v ? 'bg-brand-blue text-white' : 'border border-border hover:bg-muted'}`}>
              <Icon name={ic} size={14} />
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {hasDraft && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg font-semibold inline-flex items-center gap-1">
                <Icon name="FileEdit" size={12} /> Черновик сохранён
              </span>
              <button
                onClick={() => { clearDraft(); setHasDraft(false); }}
                className="text-xs text-muted-foreground hover:text-red-600"
                title="Удалить черновик"
              >
                <Icon name="X" size={14} />
              </button>
            </div>
          )}
          <button onClick={() => openEdit()}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
            <Icon name="Plus" size={16} /> {hasDraft ? 'Продолжить черновик' : 'Добавить'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-border rounded-xl text-sm"
            placeholder="Поиск по названию, адресу, телефону, ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-border rounded-xl px-3 py-2 text-sm"
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
        >
          <option value="">Все категории</option>
          {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-brand-blue/5 border border-brand-blue/20 rounded-xl">
          <span className="text-sm font-semibold text-brand-blue">
            Выбрано: {selected.size}
          </span>
          <div className="flex flex-wrap gap-2 ml-2">
            {BULK_OPS.map(op => (
              <button
                key={op.op}
                disabled={bulkLoading}
                onClick={() => {
                  const realOp = (op as { realOp?: string }).realOp || op.op;
                  const doIt = () => runBulk(realOp, 'value' in op ? op.value : undefined);
                  if (op.confirm) {
                    if (confirm(`${op.label} ${selected.size} объект(ов)?`)) doIt();
                  } else {
                    doIt();
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-white hover:bg-muted disabled:opacity-50"
              >
                <Icon name={op.icon} size={13} />
                {op.label}
              </button>
            ))}
            {isAdmin && (
              <button
                disabled={bulkLoading}
                onClick={bulkDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                <Icon name="Trash2" size={13} />
                Удалить насовсем
              </button>
            )}
            <button onClick={() => setSelected(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground px-2">
              Снять выбор
            </button>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Показано: {filtered.length} из {items.length}
      </div>

      <ListingsTable
        items={filtered}
        onEdit={openEdit}
        onArchive={archive}
        onHistory={it => setHistoryListing(it)}
        onPhotoDownload={it => setPhotoPickListing(it)}
        selected={selected}
        onToggleSelect={toggleSelect}
        onSelectAll={() => setSelected(new Set(filtered.map(i => i.id)))}
        onDeselectAll={() => setSelected(new Set())}
        siteUrl={SITE_URL}
      />

      {editing && (
        <ListingEditor
          editing={editing}
          setEditing={setEditing}
          photos={photos}
          setPhotos={setPhotos}
          cities={cities}
          purposes={purposes}
          aiLoading={aiLoading}
          aiTagsLoading={aiTagsLoading}
          aiSeoLoading={aiSeoLoading}
          aiAllLoading={aiAllLoading}
          onDescribe={aiDescribe}
          onGenerateTags={generateTags}
          onGenerateSeo={generateSeo}
          onGenerateAll={generateAll}
          onClose={() => { setEditing(null); setPhotos([]); }}
          onSave={save}
        />
      )}

      {historyListing && (
        <ListingHistory
          listingId={historyListing.id!}
          listingTitle={historyListing.title}
          onClose={() => setHistoryListing(null)}
        />
      )}

      {photoPickListing && (
        <PhotoPickModal
          listing={photoPickListing}
          onClose={() => setPhotoPickListing(null)}
        />
      )}
    </div>
  );
}

/* ── Модалка выбора фото для скачивания без логотипа ── */
function PhotoPickModal({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const imgs = splitImages(listing.images);
  if (!imgs.length && listing.image) imgs.push(listing.image);
  const [selected, setSelected] = useState<Set<number>>(new Set(imgs.map((_, i) => i)));
  const [loading, setLoading] = useState(false);
  const REMOVE_WM_URL = 'https://functions.poehali.dev/93965724-e0d4-411d-8100-b9468a1a0627';
  const token = typeof window !== 'undefined' ? localStorage.getItem('biznest_token') || '' : '';

  const toggleAll = () => {
    if (selected.size === imgs.length) setSelected(new Set());
    else setSelected(new Set(imgs.map((_, i) => i)));
  };

  const download = async () => {
    const toProcess = imgs.filter((_, i) => selected.has(i));
    if (!toProcess.length) return;
    setLoading(true);
    try {
      for (let i = 0; i < toProcess.length; i++) {
        const url = toProcess[i];
        try {
          const r = await fetch(REMOVE_WM_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
            body: JSON.stringify({ url }),
          });
          const data = await r.json();
          const finalUrl = data.url || url;
          await new Promise<void>(resolve => {
            fetch(finalUrl)
              .then(res => res.blob())
              .then(blob => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `object-${listing.id}-photo-${i + 1}.jpg`;
                a.click();
                URL.revokeObjectURL(a.href);
                resolve();
              })
              .catch(() => { window.open(finalUrl, '_blank'); resolve(); });
          });
        } catch {
          window.open(url, '_blank');
        }
      }
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-700 text-lg">Скачать фото без логотипа</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{listing.title}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <Icon name="X" size={18} />
          </button>
        </div>

        {imgs.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Icon name="ImageOff" size={32} className="mx-auto mb-2 opacity-30" />
            Фотографий нет
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selected.size === imgs.length}
                  onChange={toggleAll}
                  className="rounded"
                />
                Выбрать все ({imgs.length})
              </label>
              <span className="text-xs text-muted-foreground">Выбрано: {selected.size}</span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
              {imgs.map((url, i) => (
                <label key={i} className="relative cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => setSelected(prev => {
                      const s = new Set(prev);
                      if (s.has(i)) s.delete(i); else s.add(i);
                      return s;
                    })}
                    className="absolute top-2 left-2 z-10 rounded"
                  />
                  <img
                    src={url}
                    alt={`Фото ${i + 1}`}
                    className={`w-full aspect-square object-cover rounded-xl border-2 transition ${
                      selected.has(i) ? 'border-brand-blue' : 'border-transparent'
                    } group-hover:opacity-90`}
                  />
                  <span className="absolute bottom-1.5 right-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-md">
                    {i + 1}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={download}
            disabled={loading || selected.size === 0}
            className="flex-1 bg-brand-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading
              ? <><Icon name="Loader2" size={15} className="animate-spin" /> Обработка...</>
              : <><Icon name="Download" size={15} /> Скачать {selected.size > 0 ? `${selected.size} фото` : ''}</>
            }
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}