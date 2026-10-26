import { useEffect, useRef, useState } from 'react';
import { adminApi, aiApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Listing, City, Purpose, LandVri, empty, detectVideoType, splitImages } from './types';
import { loadDraft, clearDraft, useDraftAutosave } from './listingsDraft';
import { buildTagsContext, buildSeoContext, parseTags, parseSeoTitle, buildSeoHeadings } from './listingAiContext';
import { useListingAi } from './useListingAi';
import { useListingsBulk } from './useListingsBulk';

export { DRAFT_KEY, loadDraft, saveDraft, clearDraft } from './listingsDraft';

function toThumbUrl(src: string): string {
  if (!src || !src.includes('cdn.poehali.dev')) return src;
  if (!src.includes('/photos/')) return src;
  if (src.includes('_thumb.webp')) return src;
  return src.replace(/(_wm)?\.(webp|jpe?g|png)$/i, '_thumb.webp');
}

export type StatusFilter = 'active' | 'archived' | 'hidden' | 'all' | 'moderation';

export function useListingsState() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const SITE_URL = (settings.site_url || '').replace(/\/$/, '');
  const isAdmin = user?.role === 'admin';
  const isDirector = user?.role === 'director';
  const isBroker = user?.role === 'broker';

  const [items, setItems] = useState<Listing[]>([]);
  const [myOnly, setMyOnly] = useState<boolean>(true); // брокер по умолчанию видит свои
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ active: 0, archived: 0, hidden: 0, moderation: 0 });
  const [cities, setCities] = useState<City[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [landVri, setLandVri] = useState<LandVri[]>([]);
  const [editing, setEditing] = useState<Partial<Listing> | null>(null);
  const egrnObjectsRef = useRef<import('./types').EgrnStoredObject[] | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [historyListing, setHistoryListing] = useState<Listing | null>(null);
  const [photoPickListing, setPhotoPickListing] = useState<Listing | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [hasDraft, setHasDraft] = useState(() => !!loadDraft());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef('');

  const load = (reset = true, tab?: StatusFilter, overrideMyOnly?: boolean, overrideSearch?: string) => {
    setLoading(true);
    const currentTab = tab ?? statusFilter;
    const currentSearch = overrideSearch !== undefined ? overrideSearch : searchRef.current;
    const offset = reset ? 0 : items.length;
    const useMyOnly = isBroker && (overrideMyOnly !== undefined ? overrideMyOnly : myOnly);
    adminApi.listListings(offset, 25, currentTab, useMyOnly, currentSearch)
      .then(l => {
        const newItems = l.listings || [];
        setItems(prev => reset ? newItems : [...prev, ...newItems]);
        setTotal(l.total || 0);
        if (l.counts) setCounts(l.counts);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : '';
        if (!msg.includes('403') && !msg.includes('прав')) {
          toast.error('Не удалось загрузить объявления');
        }
      })
      .finally(() => setLoading(false));
    // Метаданные: кешируем в sessionStorage, грузим один раз за сессию
    const META_KEY = 'admin_listings_meta';
    try {
      const cached = sessionStorage.getItem(META_KEY);
      if (cached) {
        const { cities: cc, purposes: pp, landVri: vv } = JSON.parse(cached);
        if (cc) setCities(cc);
        if (pp) setPurposes(pp);
        if (vv) setLandVri(vv);
      } else {
        Promise.all([
          adminApi.listCities(),
          adminApi.listPurposes(),
          adminApi.listLandVri(),
        ]).then(([c, p, v]) => {
          const cc = (c.cities || []).filter((x: City) => x.is_active);
          const pp = p.purposes || [];
          const vv = (v.land_vri || []).filter((x: LandVri) => x.is_active !== false);
          setCities(cc); setPurposes(pp); setLandVri(vv);
          try { sessionStorage.setItem(META_KEY, JSON.stringify({ cities: cc, purposes: pp, landVri: vv })); } catch { /* ignore */ }
        }).catch(() => {});
      }
    } catch { /* ignore */ }
  };

  const loadMore = () => {
    if (loading || items.length >= total) return;
    setLoading(true);
    const useMyOnly = isBroker && myOnly;
    adminApi.listListings(items.length, 25, statusFilter, useMyOnly, searchRef.current)
      .then(l => {
        setItems(prev => [...prev, ...(l.listings || [])]);
        setTotal(l.total || 0);
        if (l.counts) setCounts(l.counts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const toggleMyOnly = () => {
    const next = !myOnly;
    setMyOnly(next);
    setSelected(new Set());
    load(true, statusFilter, next);
  };

  // Обёртка setSearch с дебаунсом: меняет локальный state сразу (для отображения в поле),
  // а API-запрос отправляет через 400мс после последнего нажатия.
  const setSearchDebounced = (q: string) => {
    setSearch(q);
    searchRef.current = q;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSelected(new Set());
      load(true, statusFilter, myOnly, q);
    }, 400);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(true, 'active', isBroker ? true : false), []);

  useDraftAutosave(editing, photos, setHasDraft);

  const ai = useListingAi(editing, setEditing);
  const bulk = useListingsBulk(selected, setSelected, () => load(true));

  const switchTab = (tab: StatusFilter) => {
    setStatusFilter(tab);
    setSelected(new Set());
    load(true, tab, myOnly);
  };

  // Поиск выполняется через API (бэкенд), клиентская фильтрация — только по категории.
  // Это гарантирует что поиск работает по всей базе, не только по загруженным 25 объектам.
  const filtered = catFilter ? items.filter(it => it.category === catFilter) : items;

  const openEdit = (it?: Listing | Partial<Listing>) => {
    egrnObjectsRef.current = null; // сбрасываем при открытии нового объекта
    if (it && (it as Listing).id) {
      const full = it as Listing;
      // Сразу открываем с данными из списка, потом подгружаем полные данные
      // (список не содержит description, seo_*, egrn_objects и др. тяжёлых полей)
      setEditing(full);
      const imgs = splitImages(full.images);
      if (!imgs.length && full.image) imgs.push(full.image);
      setPhotos(imgs);
      adminApi.getListing(full.id).then((res: { listing?: Listing } & Listing) => {
        const detailed: Listing = res.listing || res;
        if (!detailed?.id) return;
        setEditing(prev => {
          const base = { ...detailed };
          // Не затираем egrn_objects если они уже загружены в этой сессии
          // (egrnObjectsRef > prev.egrn_objects > detailed.egrn_objects)
          if (egrnObjectsRef.current && egrnObjectsRef.current.length > 0) {
            base.egrn_objects = egrnObjectsRef.current;
          } else if (prev?.egrn_objects && (prev.egrn_objects as unknown[]).length > 0) {
            base.egrn_objects = prev.egrn_objects;
          }
          return base;
        });
        const detailImgs = splitImages(detailed.images);
        if (!detailImgs.length && detailed.image) detailImgs.push(detailed.image);
        setPhotos(detailImgs);
      }).catch(() => {});
    } else if (it) {
      setEditing({ ...empty, ...it });
      const imgs = splitImages((it as Listing).images || '');
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

  // Копировать объект как новый — для брокера, который ведёт и аренду, и продажу одного
  // и того же помещения. Тип сделки переключается на противоположный, цена/доходность/
  // комиссия очищаются (требуют новых значений), заголовок авто-правится по шаблону.
  // Открывает редактор БЕЗ id — в БД ничего не создаётся, пока брокер сам не нажмёт «Сохранить».
  const TITLE_SWAP: [RegExp, string][] = [
    [/аренда/gi, 'Продажа'], [/сдаю/gi, 'Продаю'], [/сдаётся/gi, 'Продаётся'], [/сдается/gi, 'Продаётся'],
    [/продажа/gi, 'Аренда'], [/продаю/gi, 'Сдаю'], [/продаётся/gi, 'Сдаётся'], [/продается/gi, 'Сдаётся'],
  ];
  const swapDealInTitle = (title: string): string => {
    let result = title;
    for (const [re, replacement] of TITLE_SWAP) {
      if (re.test(result)) { result = result.replace(re, replacement); break; }
    }
    return result;
  };

  const copyAsNew = (it: Listing) => {
    egrnObjectsRef.current = null;
    const applyCopy = (src: Listing) => {
      const newDeal = src.deal === 'rent' ? 'sale' : 'rent';
      const copy: Partial<Listing> = {
        ...src,
        id: undefined as unknown as number,
        deal: newDeal,
        title: swapDealInTitle(src.title || ''),
        price: 0,
        price_unit: 'total',
        monthly_rent: null,
        yearly_rent: null,
        broker_commission: '',
        status: 'active',
        is_visible: true,
        is_hot: false,
        is_new: false,
        export_yandex: false,
        export_avito: false,
        export_cian: false,
        export_other: true,
        export_youla: false,
        slug: null,
        created_at: undefined as unknown as string,
        updated_at: undefined as unknown as string,
        last_edited_at: null,
        last_edited_by: null,
        stats_views: 0,
        stats_calls: 0,
        stats_leads: 0,
      };
      setEditing(copy);
      const imgs = splitImages(src.images);
      if (!imgs.length && src.image) imgs.push(src.image);
      setPhotos(imgs);
    };
    // Список содержит не все поля (нет description, seo_* и т.п.) — подгружаем полные данные.
    applyCopy(it);
    adminApi.getListing(it.id).then((res: { listing?: Listing } & Listing) => {
      const detailed: Listing = res.listing || res;
      if (detailed?.id) applyCopy(detailed);
    }).catch(() => {});
  };

  const setEgrnObjects = (objects: import('./types').EgrnStoredObject[]) => {
    egrnObjectsRef.current = objects;
    setEditing(prev => prev ? { ...prev, egrn_objects: objects } : prev);
  };

  const save = async (override?: Partial<Listing>) => {
    if (!editing || saving) return;
    setSaving(true);
    const isNew = !editing.id;
    const merged = { ...editing, ...(override || {}) };
    if (egrnObjectsRef.current && egrnObjectsRef.current.length > 0) {
      merged.egrn_objects = egrnObjectsRef.current;
    }
    const data: Record<string, unknown> = { ...merged };
    if (Array.isArray(data.tags)) data.tags = (data.tags as string[]).join(',');
    data.images = photos.join('|');
    data.image = photos[0] || '';
    data.image_thumb = photos[0] ? toThumbUrl(photos[0]) : '';
    if (data.video_url) data.video_type = detectVideoType(String(data.video_url));

    // При создании нового объекта — автогенерация SEO, тегов и H1-H5 через ИИ
    if (isNew) {
      ai.setAiAllLoading(true);
      try {
        const description = merged.description || '';
        const [tagsRes, seoRes] = await Promise.all([
          aiApi.ask('auto_tags', buildTagsContext(merged, description)).catch(() => ({ text: '' })),
          aiApi.ask('seo_listing', buildSeoContext(merged, description)).catch(() => ({ text: '' })),
        ]);

        // Теги
        data.tags = parseTags(tagsRes.text);

        // SEO title
        data.seo_title = parseSeoTitle(seoRes.text).slice(0, 70);

        // H1-H5 по шаблону
        const h = buildSeoHeadings(merged);
        data.seo_h1 = h.h1;
        data.seo_h2 = h.h2;
        data.seo_h3 = h.h3;
        data.seo_h4 = h.h4;
        data.seo_h5 = h.h5;
      } catch {
        // Не блокируем сохранение если ИИ недоступен
      } finally {
        ai.setAiAllLoading(false);
      }
    }

    try {
      if (editing.id) {
        await adminApi.updateListing(editing.id, data);
      } else {
        const res = await adminApi.createListing(data);
        if (res.id) await adminApi.addListingHistory(res.id, 'created', {});
      }
      clearDraft();
      setHasDraft(false);
      setEditing(null);
      setPhotos([]);
      if (isNew) setStatusFilter('active');
      load(true);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
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
    load(true);
  };

  return {
    // data
    items, filtered, cities, purposes, landVri, loading, total, counts,
    // edit state
    editing, setEditing, photos, setPhotos,
    // modals
    historyListing, setHistoryListing,
    photoPickListing, setPhotoPickListing,
    // ai
    aiLoading: ai.aiLoading, aiTitleLoading: ai.aiTitleLoading, aiTagsLoading: ai.aiTagsLoading,
    aiSeoLoading: ai.aiSeoLoading, aiAllLoading: ai.aiAllLoading, aiImproveLoading: ai.aiImproveLoading,
    saving,
    // bulk
    selected, setSelected, bulkLoading: bulk.bulkLoading,
    // filters
    statusFilter, setStatusFilter, search, setSearch: setSearchDebounced, catFilter, setCatFilter,
    // draft
    hasDraft, setHasDraft,
    // meta
    isAdmin, isDirector, isBroker, SITE_URL,
    canCreate: !['office_manager', 'client'].includes(user?.role || ''),
    myOnly, toggleMyOnly,
    // actions
    load, loadMore, switchTab, openEdit, copyAsNew, save, archive,
    runBulk: bulk.runBulk, bulkDelete: bulk.bulkDelete, toggleSelect: bulk.toggleSelect,
    aiDescribe: ai.aiDescribe, aiTitle: ai.aiTitle, generateTags: ai.generateTags,
    generateSeo: ai.generateSeo, generateAll: ai.generateAll, improveWithAi: ai.improveWithAi,
    setEgrnObjects,
  };
}
