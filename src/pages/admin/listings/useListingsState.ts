import { useEffect, useRef, useState } from 'react';
import { adminApi, aiApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Listing, City, Purpose, LandVri, empty, detectVideoType, splitImages } from './types';

export const DRAFT_KEY = 'biznest_listing_draft';

export function loadDraft(): { editing: Partial<Listing>; photos: string[] } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function saveDraft(editing: Partial<Listing>, photos: string[]) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ editing, photos })); } catch { /* ignore */ }
}
export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

export type StatusFilter = 'active' | 'archived' | 'hidden' | 'all';

export function useListingsState() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const SITE_URL = (settings.site_url || '').replace(/\/$/, '');
  const isAdmin = user?.role === 'admin';
  const isBroker = user?.role === 'broker';

  const [items, setItems] = useState<Listing[]>([]);
  const [myOnly, setMyOnly] = useState<boolean>(true); // брокер по умолчанию видит свои
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ active: 0, archived: 0, hidden: 0 });
  const [cities, setCities] = useState<City[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [landVri, setLandVri] = useState<LandVri[]>([]);
  const [editing, setEditing] = useState<Partial<Listing> | null>(null);
  const egrnObjectsRef = useRef<import('./types').EgrnStoredObject[] | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [historyListing, setHistoryListing] = useState<Listing | null>(null);
  const [photoPickListing, setPhotoPickListing] = useState<Listing | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTitleLoading, setAiTitleLoading] = useState(false);
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

  const load = (reset = true, tab?: StatusFilter, overrideMyOnly?: boolean) => {
    setLoading(true);
    const currentTab = tab ?? statusFilter;
    const offset = reset ? 0 : items.length;
    const useMyOnly = isBroker && (overrideMyOnly !== undefined ? overrideMyOnly : myOnly);
    adminApi.listListings(offset, 25, currentTab, useMyOnly)
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
    adminApi.listCities().then(c => setCities((c.cities || []).filter((x: City) => x.is_active))).catch(() => {});
    adminApi.listPurposes().then(p => setPurposes(p.purposes || [])).catch(() => {});
    adminApi.listLandVri().then(v => setLandVri((v.land_vri || []).filter((x: LandVri) => x.is_active !== false))).catch(() => {});
  };

  const loadMore = () => {
    if (loading || items.length >= total) return;
    setLoading(true);
    const useMyOnly = isBroker && myOnly;
    adminApi.listListings(items.length, 25, statusFilter, useMyOnly)
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

  useEffect(() => load(true, 'active', isBroker ? true : false), []);

  useEffect(() => {
    if (!editing || editing.id) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraft(editing, photos);
      setHasDraft(true);
    }, 1500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [editing, photos]);

  const switchTab = (tab: StatusFilter) => {
    setStatusFilter(tab);
    setSelected(new Set());
    load(true, tab, myOnly);
  };

  // Фильтрация без клиентской сортировки — бэкенд отдаёт объекты уже отсортированными
  // по updated_at DESC. Клиентская сортировка ломала порядок при пагинации (loadMore).
  const filtered = items.filter(it => {
    if (catFilter && it.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase().replace(/^#/, '');
      return (
        it.title?.toLowerCase().includes(q) ||
        it.address?.toLowerCase().includes(q) ||
        it.owner_name?.toLowerCase().includes(q) ||
        it.owner_phone?.includes(q) ||
        String(`123${it.id}`).includes(q) ||
        String(it.id).includes(q)
      );
    }
    return true;
  });

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

  const setEgrnObjects = (objects: import('./types').EgrnStoredObject[]) => {
    egrnObjectsRef.current = objects;
    setEditing(prev => prev ? { ...prev, egrn_objects: objects } : prev);
  };

  // Генерация H1-H5 из данных объекта (без ИИ, по шаблону)
  const _buildHeadings = (e: Partial<Listing>) => {
    const DEAL: Record<string, string> = { sale: 'Продажа', rent: 'Аренда', business: 'Готовый бизнес' };
    const TYPE: Record<string, string> = {
      office: 'офиса', retail: 'торгового помещения', warehouse: 'склада',
      restaurant: 'помещения под общепит', hotel: 'гостиницы', business: 'готового бизнеса',
      gab: 'готового арендного бизнеса', production: 'производственного помещения',
      land: 'земельного участка', building: 'здания', free_purpose: 'помещения',
      car_service: 'помещения под автосервис',
    };
    const city = e.city || 'Краснодар';
    const deal = DEAL[e.deal || ''] || 'Аренда';
    const type = TYPE[e.category || ''] || 'объекта';
    const area = e.area ? `${e.area} м²` : '';
    const addr = e.district || e.address || city;
    const price = e.price ? `${(e.price / 1_000_000).toFixed(e.price >= 10_000_000 ? 0 : 1)} млн ₽` : '';
    return {
      h1: e.title || `${deal} ${type} в ${city}`,
      h2: [deal, type, area, `в ${city}`].filter(Boolean).join(' '),
      h3: addr ? `${deal} ${type} — ${addr}` : `${deal} ${type} в ${city}`,
      h4: [area, price].filter(Boolean).join(' · ') || `Параметры ${type}`,
      h5: price ? `Стоимость: ${price}` : `Цена по запросу — ${city}`,
    };
  };

  const save = async (override?: Partial<Listing>) => {
    if (!editing) return;
    const isNew = !editing.id;
    const merged = { ...editing, ...(override || {}) };
    if (egrnObjectsRef.current && egrnObjectsRef.current.length > 0) {
      merged.egrn_objects = egrnObjectsRef.current;
    }
    const data: Record<string, unknown> = { ...merged };
    if (Array.isArray(data.tags)) data.tags = (data.tags as string[]).join(',');
    data.images = photos.join('|');
    data.image = photos[0] || '';
    if (data.video_url) data.video_type = detectVideoType(String(data.video_url));

    // При создании нового объекта — автогенерация SEO, тегов и H1-H5 через ИИ
    if (isNew) {
      setAiAllLoading(true);
      try {
        const dealLabel = merged.deal === 'rent' ? 'аренда' : merged.deal === 'business' ? 'готовый бизнес' : 'продажа';
        const tagsCtx = `Название: ${merged.title}, категория: ${merged.category}, назначение: ${(merged as Record<string, unknown>).purpose || ''}, состояние: ${merged.condition || ''}, парковка: ${merged.parking || ''}, описание: ${merged.description || ''}`;
        const seoCtx = `Название: ${merged.title || ''}. Тип: ${merged.category || ''}. Сделка: ${dealLabel}. Город: ${merged.city || 'Краснодар'}. Район: ${merged.district || ''}. Адрес: ${merged.address || ''}. Площадь: ${merged.area || 0} м². Цена: ${merged.price || 0} ₽. Описание: ${merged.description || ''}`;

        const [tagsRes, seoRes] = await Promise.all([
          aiApi.ask('auto_tags', tagsCtx).catch(() => ({ text: '' })),
          aiApi.ask('seo_listing', seoCtx).catch(() => ({ text: '' })),
        ]);

        // Теги
        data.tags = (tagsRes.text || '').replace(/\n/g, ',').replace(/\s+,/g, ',');

        // SEO title + description
        const txt = seoRes.text || '';
        const titleMatch = txt.match(/TITLE:\s*(.+)/i);
        const descMatch = txt.match(/DESCRIPTION:\s*([\s\S]+)/i);
        data.seo_title = (titleMatch ? titleMatch[1] : '').trim().replace(/^["«]|["»]$/g, '').slice(0, 70);
        data.seo_description = (descMatch ? descMatch[1] : '').trim().replace(/^["«]|["»]$/g, '').slice(0, 160);

        // H1-H5 по шаблону
        const h = _buildHeadings(merged);
        data.seo_h1 = h.h1;
        data.seo_h2 = h.h2;
        data.seo_h3 = h.h3;
        data.seo_h4 = h.h4;
        data.seo_h5 = h.h5;
      } catch {
        // Не блокируем сохранение если ИИ недоступен
      } finally {
        setAiAllLoading(false);
      }
    }

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
      load(true);
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
    load(true);
  };

  const runBulk = async (op: string, value?: unknown) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkLoading(true);
    try {
      await adminApi.bulkListings(ids, op, value);
      setSelected(new Set());
      load(true);
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
      load(true);
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

  // Собирает все заполненные поля объекта в текст для ИИ.
  // Пустые поля пропускаются. Цену для описания НЕ передаём (по требованию).
  const buildListingContext = (e: Partial<Listing>, includePrice: boolean): string => {
    const dealLabel = e.deal === 'rent' ? 'аренда (сдаём)' : e.deal === 'business' ? 'готовый бизнес' : 'продажа (продаём)';
    const parkingLabel: Record<string, string> = { none: 'нет', street: 'на улице', building: 'в здании' };
    const parts: string[] = [];
    if (e.deal) parts.push(`Тип сделки: ${dealLabel}`);
    if (e.category) parts.push(`Категория: ${e.category}`);
    if (e.city) parts.push(`Город: ${e.city}`);
    if (e.district) parts.push(`Район: ${e.district}`);
    if (e.address) parts.push(`Адрес: ${e.address}`);
    if (e.area) parts.push(`Площадь: ${e.area} м²`);
    if (e.land_area) parts.push(`Площадь участка: ${e.land_area} сот.`);
    if (e.floor) parts.push(`Этаж: ${e.floor}${e.total_floors ? ` из ${e.total_floors}` : ''}`);
    if (e.ceiling_height) parts.push(`Высота потолков: ${e.ceiling_height} м`);
    if (e.condition) parts.push(`Состояние: ${e.condition}`);
    if (e.finishing) parts.push(`Отделка: ${e.finishing}`);
    if (e.electricity_kw) parts.push(`Электричество: ${e.electricity_kw} кВт`);
    if (e.utilities) parts.push(`Коммуникации: ${e.utilities}`);
    if (e.parking) parts.push(`Парковка: ${parkingLabel[e.parking] || e.parking}`);
    if (e.road_line) parts.push(`Линия дороги: ${e.road_line}`);
    if (e.purpose) parts.push(`Назначение (направления использования): ${e.purpose}`);
    // Доходность — важно для аренды/готового бизнеса
    if (e.monthly_rent) parts.push(`Доход в месяц: ${e.monthly_rent} ₽`);
    if (e.yearly_rent) parts.push(`Доход в год: ${e.yearly_rent} ₽`);
    if (e.profit) parts.push(`Чистая прибыль: ${e.profit} ₽`);
    if (e.payback) parts.push(`Окупаемость: ${e.payback} мес.`);
    if (includePrice && e.price) parts.push(`Цена: ${e.price} ₽`);
    return parts.join('; ');
  };

  // Проверка обязательных полей перед генерацией ИИ
  const checkRequiredForAi = (e: Partial<Listing>): string | null => {
    const missing: string[] = [];
    if (!e.deal) missing.push('Тип сделки');
    if (!e.category) missing.push('Категория объекта');
    if (!e.address && !e.district) missing.push('Адрес или район');
    if (!e.area) missing.push('Площадь');
    if (missing.length > 0) {
      return `Для генерации ИИ необходимо заполнить:\n• ${missing.join('\n• ')}`;
    }
    return null;
  };

  const aiDescribe = async () => {
    if (!editing) return;
    const err = checkRequiredForAi(editing);
    if (err) { alert(err); return; }
    setAiLoading(true);
    try {
      // Цену в описание НЕ передаём — по требованию её не должно быть в тексте
      const prompt = buildListingContext(editing, false);
      const r = await aiApi.ask('describe', prompt);
      setEditing({ ...editing, description: (r.text || '').slice(0, 3000) });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка ИИ');
    } finally {
      setAiLoading(false);
    }
  };

  const aiTitle = async () => {
    if (!editing) return;
    const err = checkRequiredForAi(editing);
    if (err) { alert(err); return; }
    setAiTitleLoading(true);
    try {
      const prompt = buildListingContext(editing, false);
      const r = await aiApi.ask('title', prompt);
      // Заголовок: одна строка, без кавычек, максимум 70 символов
      const title = (r.text || '').split('\n')[0].trim().replace(/^["«]|["»]$/g, '').slice(0, 70);
      setEditing({ ...editing, title });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка ИИ');
    } finally {
      setAiTitleLoading(false);
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
      const descPrompt = buildListingContext(editing, false);
      const descRes = await aiApi.ask('describe', descPrompt);
      const description = (descRes.text || editing.description || '').slice(0, 3000);
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

  return {
    // data
    items, filtered, cities, purposes, landVri, loading, total, counts,
    // edit state
    editing, setEditing, photos, setPhotos,
    // modals
    historyListing, setHistoryListing,
    photoPickListing, setPhotoPickListing,
    // ai
    aiLoading, aiTitleLoading, aiTagsLoading, aiSeoLoading, aiAllLoading,
    // bulk
    selected, setSelected, bulkLoading,
    // filters
    statusFilter, setStatusFilter, search, setSearch, catFilter, setCatFilter,
    // draft
    hasDraft, setHasDraft,
    // meta
    isAdmin, isBroker, SITE_URL,
    canCreate: !['office_manager', 'client'].includes(user?.role || ''),
    myOnly, toggleMyOnly,
    // actions
    load, loadMore, switchTab, openEdit, save, archive, runBulk, bulkDelete, toggleSelect,
    aiDescribe, aiTitle, generateTags, generateSeo, generateAll,
    setEgrnObjects,
  };
}