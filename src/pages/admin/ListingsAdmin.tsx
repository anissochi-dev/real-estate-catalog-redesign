import { useEffect, useState } from 'react';
import { adminApi, aiApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import ListingsTable from './listings/ListingsTable';
import ListingEditor from './listings/ListingEditor';
import ListingHistory from './listings/ListingHistory';
import {
  Listing, City, Purpose, empty, detectVideoType, splitImages, CATS,
} from './listings/types';

const SITE_URL = window.location.origin;

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
      setEditing({ ...empty });
      setPhotos([]);
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
        <button onClick={() => openEdit()}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="Plus" size={16} /> Добавить
        </button>
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
    </div>
  );
}