const AUTH_URL = 'https://functions.poehali.dev/e5d9d96a-a3ca-45cd-9ea3-3e2982b626f7';
const ADMIN_URL = 'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';
export const OWNER_URL = 'https://functions.poehali.dev/b343cde2-4c90-4a07-8aca-05942c726b7c';

/** Отправляет сведения о клиентской ошибке на бэкенд (для email-уведомления админам).
 * Тихо игнорирует любые сбои — не должен мешать работе сайта. */
export function reportError(info: { message: string; url?: string; stack?: string; userAgent?: string }): void {
  try {
    fetch(`${ADMIN_URL}?resource=error_report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}
export const AI_RETRAIN_URL = 'https://functions.poehali.dev/e2f1d357-fb83-4fbb-8d8b-6fb063357afc';
const AI_URL = 'https://functions.poehali.dev/34bfc4a2-89b9-4c89-bcbc-d82314730aef';

const UPLOADS_URL = 'https://functions.poehali.dev/8983c0a8-a8c8-47ff-97ed-59cc1571aa15';
export const REMOVE_WM_URL = 'https://functions.poehali.dev/d86482e4-0555-457a-8063-0d3305c171ff';
export const CRM_URL = 'https://functions.poehali.dev/221e23fa-e0a4-416e-b878-c2da2914daac';

/** Билдер URL для CRM-функции.
 * Cloud Functions Gateway не маршрутизирует подпути, поэтому передаём resource/id/sub
 * через queryStringParameters. Backend поддерживает оба варианта.
 *
 * Примеры:
 *   crmUrl('stages')                    → ?resource=stages
 *   crmUrl('deals', 123)                → ?resource=deals&id=123
 *   crmUrl('deals', 123, 'win')         → ?resource=deals&id=123&sub=win
 *   crmUrl('deals', null, null, { status: 'active' }) → ?resource=deals&status=active
 */
export function crmUrl(
  resource: string,
  id?: number | string | null,
  sub?: string | null,
  qs?: Record<string, string | number | boolean | undefined | null>,
): string {
  const params = new URLSearchParams();
  params.set('resource', resource);
  if (id !== undefined && id !== null && id !== '') params.set('id', String(id));
  if (sub) params.set('sub', sub);
  if (qs) {
    for (const [k, v] of Object.entries(qs)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
  }
  // Дублируем токен в query — Cloud Functions Gateway иногда обрезает X-Auth-Token
  // на POST/PUT-запросах с JSON. Backend читает оба варианта.
  const t = getToken();
  if (t && !params.has('auth_token')) params.set('auth_token', t);
  return `${CRM_URL}?${params.toString()}`;
}
export const CRM_CHECKS_URL = 'https://functions.poehali.dev/be6cb907-b50e-48fa-b9e2-092dd541a82a';
export const CRM_PAYMENTS_URL = 'https://functions.poehali.dev/74ca5694-a05f-4053-992d-5e04cc5bc7a4';
export const NEWS_URL = 'https://functions.poehali.dev/984cad3a-0783-4408-a614-52ed36f8c77f';
export const PRICE_PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

export type Role = 'admin' | 'editor' | 'manager' | 'client' | 'broker' | 'director' | 'office_manager';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  phone?: string | null;
  max_phone?: string | null;
  max_user_id?: string | null;
  avatar?: string | null;
  is_active?: boolean;
}

const TOKEN_KEY = 'biznest_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/** Ошибка HTTP-запроса с кодом статуса — используется в AuthContext для различения 401 и 503. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Универсальный fetch к админ-API.
 * - Дублирует токен в query-параметр auth_token (Cloud Functions Gateway
 *   режет заголовки на POST/JSON, query — самый надёжный канал).
 * - Один retry со свежим токеном при 401.
 * - На повторный 401 — сбрасывает токен и редиректит на главную.
 */
function buildAuthUrl(url: string, token: string): string {
  if (!token) return url;
  try {
    const u = new URL(url, window.location.origin);
    if (!u.searchParams.has('auth_token')) u.searchParams.set('auth_token', token);
    return u.toString();
  } catch {
    return url.includes('?') ? `${url}&auth_token=${encodeURIComponent(token)}` : `${url}?auth_token=${encodeURIComponent(token)}`;
  }
}

async function req(url: string, init?: RequestInit) {
  const doFetch = async (): Promise<Response> => {
    const token = getToken();
    const finalUrl = buildAuthUrl(url, token);
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? {
        'X-Auth-Token': token,
        'X-Authorization': token,
        'Authorization': `Bearer ${token}`,
      } : {}),
      ...(init?.headers || {}),
    };
    // Прямой нативный fetch. CORS уже корректно настроен на backend.
    return fetch(finalUrl, { ...init, headers });
  };

  let res: Response | null = null;
  let lastNetworkErr: unknown = null;
  // До 3 попыток с возрастающей задержкой
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await doFetch();
      lastNetworkErr = null;
      break;
    } catch (networkErr) {
      lastNetworkErr = networkErr;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        break;
      }
      await new Promise(r => setTimeout(r, 300 + attempt * 400));
    }
  }
  if (!res) {
    const { showError } = await import('./errorTranslator');
    const msg = lastNetworkErr instanceof Error ? lastNetworkErr.message : 'Failed to fetch';
    showError(msg);
    throw new Error(msg);
  }
  // Retry при 401
  if (res.status === 401) {
    await new Promise(r => setTimeout(r, 150));
    try { res = await doFetch(); } catch { /* keep previous response */ }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 401 после retry — сессия точно истекла. Чистим токен,
    // показываем дружелюбное сообщение. Редирект не делаем —
    // в админке это сделает компонент, заметив отсутствие user.
    if (res.status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      const { showError } = await import('./errorTranslator');
      showError('Сессия истекла — войдите заново');
      throw new ApiError('Сессия истекла — войдите заново', 401);
    }
    const msg = data.error || `HTTP ${res.status}`;
    // 503 — временная ошибка сервера (rate limit БД) — бросаем без уведомления,
    // AuthContext поймает статус и НЕ будет стирать токен.
    if (res.status === 503) {
      throw new ApiError(msg, 503);
    }
    // 403 — тихо бросаем ошибку без всплывающего уведомления:
    // каждый раздел сам решает как реагировать (скрыть, показать заглушку и т.д.)
    if (res.status === 403) {
      throw new ApiError(msg, 403);
    }
    const { showError } = await import('./errorTranslator');
    showError(msg);
    throw new ApiError(msg, res.status);
  }
  return data;
}

export const authApi = {
  login: (email: string, password: string) =>
    req(`${AUTH_URL}?action=login`, { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (data: { email: string; password: string; name: string; phone?: string }) =>
    req(`${AUTH_URL}?action=register`, { method: 'POST', body: JSON.stringify(data) }),
  me: () => req(`${AUTH_URL}?action=me`),
  logout: () => req(`${AUTH_URL}?action=logout`, { method: 'POST' }),
};

export const adminApi = {
  // users
  listUsers: () => req(`${ADMIN_URL}?resource=users`),
  createUser: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=users`, { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=users&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: number, toUserId?: number) =>
    req(`${ADMIN_URL}?resource=users&id=${id}`, { method: 'DELETE', body: JSON.stringify(toUserId ? { to_user_id: toUserId } : {}) }),
  archiveUser: (id: number, toUserId?: number) =>
    req(`${ADMIN_URL}?resource=users&id=${id}&action=archive`, { method: 'PUT', body: JSON.stringify(toUserId ? { to_user_id: toUserId } : {}) }),
  unarchiveUser: (id: number) =>
    req(`${ADMIN_URL}?resource=users&id=${id}&action=unarchive`, { method: 'PUT', body: '{}' }),
  grantAccess: (id: number) =>
    req(`${ADMIN_URL}?resource=users&id=${id}&action=grant_access`, { method: 'PUT', body: '{}' }),
  revokeAccess: (id: number) =>
    req(`${ADMIN_URL}?resource=users&id=${id}`, { method: 'PUT', body: JSON.stringify({ is_active: false }) }),
  getUserProfile: (id: number) =>
    req(`${ADMIN_URL}?resource=user_profile&id=${id}`),
  listModeration: () =>
    req(`${ADMIN_URL}?resource=moderation`),
  approveModeration: (id: number) =>
    req(`${ADMIN_URL}?resource=moderation&id=${id}`, { method: 'PUT', body: JSON.stringify({ action: 'approve' }) }),
  rejectModeration: (id: number, comment: string) =>
    req(`${ADMIN_URL}?resource=moderation&id=${id}`, { method: 'PUT', body: JSON.stringify({ action: 'reject', comment }) }),

  // listings
  listListings: (offset = 0, limit = 25, tab = 'active', myOnly = false, search = '') => req(`${ADMIN_URL}?resource=listings&limit=${limit}&offset=${offset}&tab=${tab}${myOnly ? '&my=1' : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  getListing: (id: number) => req(`${ADMIN_URL}?resource=listings&id=${id}`),
  createListing: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=listings`, { method: 'POST', body: JSON.stringify(data) }),
  updateListing: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=listings&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  archiveListing: (id: number) =>
    req(`${ADMIN_URL}?resource=listings&id=${id}`, { method: 'DELETE' }),
  deleteListing: (id: number) =>
    req(`${ADMIN_URL}?resource=listings&id=${id}&force=1`, { method: 'DELETE' }),

  // База знаний Виртуального брокера (ai_memory)
  listAiMemory: () => req(`${ADMIN_URL}?resource=ai_memory`),
  createAiMemory: (data: { key: string; value: string }) =>
    req(`${ADMIN_URL}?resource=ai_memory`, { method: 'POST', body: JSON.stringify(data) }),
  updateAiMemory: (id: number, data: { key?: string; value?: string }) =>
    req(`${ADMIN_URL}?resource=ai_memory&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAiMemory: (id: number) =>
    req(`${ADMIN_URL}?resource=ai_memory&id=${id}`, { method: 'DELETE' }),
  trainVbFromNews: (): Promise<{ success: boolean; saved: number; news_count: number }> =>
    req(`${ADMIN_URL}?resource=ai_memory&action=from_news`, { method: 'POST', body: '{}' }),
  trainVb: (sources: string[]): Promise<{
    success: boolean;
    saved: number;
    per_source: { source: string; saved: number; input_count?: number; error?: string; skipped?: string }[];
  }> =>
    req(`${ADMIN_URL}?resource=ai_memory&action=retrain`, {
      method: 'POST',
      body: JSON.stringify({ sources }),
    }),

  // Расписание автопереобучения ВБ
  getRetrainSchedule: (): Promise<{
    enabled: boolean; hour: number; minute: number; sources: string[];
    last_at: string | null; last_status: string | null; last_saved: number | null;
  }> => req(`${ADMIN_URL}?resource=vb_retrain_schedule`),
  saveRetrainSchedule: (data: { enabled: boolean; hour: number; minute: number; sources: string[] }) =>
    req(`${ADMIN_URL}?resource=vb_retrain_schedule`, { method: 'PUT', body: JSON.stringify(data) }),

  // Стоп-слова ВБ
  listVbStopWords: (): Promise<{ items: { id: number; word: string; created_at: string }[] }> =>
    req(`${ADMIN_URL}?resource=vb_stop_words`),
  createVbStopWord: (data: { word: string }) =>
    req(`${ADMIN_URL}?resource=vb_stop_words`, { method: 'POST', body: JSON.stringify(data) }),
  deleteVbStopWord: (id: number) =>
    req(`${ADMIN_URL}?resource=vb_stop_words&id=${id}`, { method: 'DELETE' }),

  // Источники для самообучения ВБ
  listVbLearnSources: (): Promise<{ items: { id: number; title: string; url: string; is_active: boolean; last_fetched_at: string | null }[] }> =>
    req(`${ADMIN_URL}?resource=vb_learn_sources`),
  createVbLearnSource: (data: { title: string; url: string }) =>
    req(`${ADMIN_URL}?resource=vb_learn_sources`, { method: 'POST', body: JSON.stringify(data) }),
  updateVbLearnSource: (id: number, data: { title?: string; url?: string; is_active?: boolean }) =>
    req(`${ADMIN_URL}?resource=vb_learn_sources&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteVbLearnSource: (id: number) =>
    req(`${ADMIN_URL}?resource=vb_learn_sources&id=${id}`, { method: 'DELETE' }),

  // leads
  listLeads: () => req(`${ADMIN_URL}?resource=leads`),
  getLead: (id: number) => req(`${ADMIN_URL}?resource=leads&id=${id}`),
  updateLead: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=leads&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  addLeadComment: (id: number, comment: string) =>
    req(`${ADMIN_URL}?resource=leads&id=${id}&action=comment`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),

  // users
  listUsers: () => req(`${ADMIN_URL}?resource=users`),
  createUser: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=users`, { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=users&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // pages
  listPages: () => req(`${ADMIN_URL}?resource=pages`),
  createPage: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=pages`, { method: 'POST', body: JSON.stringify(data) }),
  updatePage: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=pages&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // settings
  getSettings: () => req(`${ADMIN_URL}?resource=settings`),
  updateSettings: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=settings`, { method: 'PUT', body: JSON.stringify(data) }),

  // cities
  listCities: () => req(`${ADMIN_URL}?resource=cities`),
  createCity: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=cities`, { method: 'POST', body: JSON.stringify(data) }),
  updateCity: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=cities&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCity: (id: number) =>
    req(`${ADMIN_URL}?resource=cities&id=${id}`, { method: 'DELETE' }),

  // purposes
  listPurposes: () => req(`${ADMIN_URL}?resource=purposes`),
  createPurpose: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=purposes`, { method: 'POST', body: JSON.stringify(data) }),
  updatePurpose: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=purposes&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePurpose: (id: number) =>
    req(`${ADMIN_URL}?resource=purposes&id=${id}`, { method: 'DELETE' }),

  // land VRI (виды разрешённого использования)
  listLandVri: () => req(`${ADMIN_URL}?resource=land_vri`),
  createLandVri: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=land_vri`, { method: 'POST', body: JSON.stringify(data) }),
  updateLandVri: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=land_vri&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLandVri: (id: number) =>
    req(`${ADMIN_URL}?resource=land_vri&id=${id}`, { method: 'DELETE' }),

  // xml feeds
  listFeeds: () => req(`${ADMIN_URL}?resource=xml_feeds`),
  createFeed: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=xml_feeds`, { method: 'POST', body: JSON.stringify(data) }),
  updateFeed: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=xml_feeds&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFeed: (id: number) =>
    req(`${ADMIN_URL}?resource=xml_feeds&id=${id}`, { method: 'DELETE' }),

  // leads CRUD
  createLead: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=leads`, { method: 'POST', body: JSON.stringify(data) }),
  deleteLead: (id: number) =>
    req(`${ADMIN_URL}?resource=leads&id=${id}`, { method: 'DELETE' }),

  // stats
  stats: () => req(`${ADMIN_URL}?resource=stats`),

  // listing history
  getListingHistory: (id: number) => req(`${ADMIN_URL}?resource=listing_history&id=${id}`),
  addListingHistory: (id: number, action: string, changes?: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=listing_history&id=${id}`, {
      method: 'POST',
      body: JSON.stringify({ action, changes: changes || {} }),
    }),

  // listing stats
  getListingStats: (id: number) => req(`${ADMIN_URL}?resource=listing_stats&id=${id}`),

  // AI inpaint (Мелания — убрать лишнее с фото)
  inpaintListingPhoto: (data: { image_url: string; prompt?: string }) =>
    req(`${ADMIN_URL}?resource=ai_inpaint`, { method: 'POST', body: JSON.stringify(data) }),

  // bulk operations
  bulkListings: (ids: number[], op: string, value?: unknown) =>
    req(`${ADMIN_URL}?resource=listings_bulk`, {
      method: 'POST',
      body: JSON.stringify({ ids, op, value }),
    }),

  // phones
  listPhones: (page = 1) => req(`${ADMIN_URL}?resource=phones&page=${page}`),
  searchPhones: (q: string) => req(`${ADMIN_URL}?resource=phones&action=search&q=${encodeURIComponent(q)}`),
  getPhone: (id: number) => req(`${ADMIN_URL}?resource=phones&id=${id}`),
  createPhone: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=phones`, { method: 'POST', body: JSON.stringify(data) }),
  updatePhone: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=phones&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  syncPhones: () =>
    req(`${ADMIN_URL}?resource=phones&action=sync`, { method: 'POST', body: '{}' }),
  linkPhone: (id: number, data: { listing_id?: number; lead_id?: number; role?: string }) =>
    req(`${ADMIN_URL}?resource=phones&id=${id}&action=link`, { method: 'POST', body: JSON.stringify(data) }),
  unlinkPhone: (id: number, data: { listing_id?: number; lead_id?: number }) =>
    req(`${ADMIN_URL}?resource=phones&id=${id}&action=unlink`, { method: 'POST', body: JSON.stringify(data) }),
  getPhoneHistory: (id: number) => req(`${ADMIN_URL}?resource=phones&id=${id}&action=history`),
  deletePhone: (id: number) =>
    req(`${ADMIN_URL}?resource=phones&id=${id}`, { method: 'DELETE', body: '{}' }),

  // listing documents
  getListingDocuments: (listingId: number) => req(`${ADMIN_URL}?resource=listing_documents&listing_id=${listingId}`),
  addListingDocument: (listingId: number, name: string, url: string) =>
    req(`${ADMIN_URL}?resource=listing_documents&listing_id=${listingId}`, { method: 'POST', body: JSON.stringify({ name, url }) }),
  renameListingDocument: (docId: number, name: string) =>
    req(`${ADMIN_URL}?resource=listing_documents&id=${docId}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteListingDocument: (docId: number) =>
    req(`${ADMIN_URL}?resource=listing_documents&id=${docId}`, { method: 'DELETE', body: '{}' }),

  // listing comments
  getListingComments: (listingId: number) => req(`${ADMIN_URL}?resource=listing_comments&listing_id=${listingId}`),
  addListingComment: (listingId: number, comment: string, isAi = false) =>
    req(`${ADMIN_URL}?resource=listing_comments&listing_id=${listingId}`, { method: 'POST', body: JSON.stringify({ comment, is_ai: isAi }) }),
  deleteListingComment: (commentId: number) =>
    req(`${ADMIN_URL}?resource=listing_comments&id=${commentId}`, { method: 'DELETE', body: '{}' }),

  // ad platform keys (integration hub)
  getAdPlatformKeys: () => req(`${ADMIN_URL}?resource=ad_platform_keys`),
  updateAdPlatformKey: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=ad_platform_keys&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // role permissions
  getRolePermissions: () => req(`${ADMIN_URL}?resource=role_permissions`),
  updateRolePermissions: (permissions: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=role_permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),

  // nav order (порядок пунктов меню по ролям)
  getNavOrder: () => req(`${ADMIN_URL}?resource=settings`),
  updateNavOrder: (navOrder: Record<string, string[]>) =>
    req(`${ADMIN_URL}?resource=settings`, {
      method: 'PUT',
      body: JSON.stringify({ nav_order: navOrder }),
    }),

  // notifications (тестовая отправка email/telegram)
  testNotification: (data: { channel: 'email' | 'telegram' }) =>
    req(`${ADMIN_URL}?resource=notifications&action=test`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // webmaster API (Яндекс + Google)
  webmasterCheck: (action: string) =>
    req(`${ADMIN_URL}?resource=webmaster_check&action=${action}`, {
      method: 'POST',
      body: '{}',
    }),
};

export interface UploadResult {
  url: string;
  originalUrl: string;
  watermarked: boolean;
  thumbUrl?: string;
}

/** Расширенная загрузка — возвращает url (с ВЗ), original_url (без ВЗ), watermarked.
 *  При 502/503/504 (таймаут бэкенда во время Pillow-обработки) — до 3 retry с паузой. */
export async function uploadFileEx(
  file: File,
  folder: 'photos' | 'logo' | 'watermark' | 'document' = 'photos',
  applyWatermark = false,
): Promise<UploadResult> {
  const b64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const token = getToken();
  const kind = folder === 'photos' ? 'photo' : folder === 'logo' ? 'logo' : folder === 'document' ? 'document' : 'watermark';
  const body = JSON.stringify({ file_base64: b64, filename: file.name, kind, apply_watermark: applyWatermark });
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) };

  const RETRYABLE = new Set([502, 503, 504]);
  const MAX_ATTEMPTS = 3;

  let lastErr: Error = new Error('Ошибка загрузки');
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // Пауза перед повтором: 1s, 2s
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
    let res: Response;
    try {
      res = await fetch(UPLOADS_URL, { method: 'POST', headers, body });
    } catch (networkErr) {
      lastErr = networkErr instanceof Error ? networkErr : new Error('Сеть недоступна');
      continue; // retry
    }
    if (res.ok) {
      const data = await res.json();
      return {
        url: data.url as string,
        originalUrl: (data.original_url as string) || (data.url as string),
        watermarked: !!data.watermarked,
        thumbUrl: (data.thumb_url as string) || undefined,
      };
    }
    if (RETRYABLE.has(res.status)) {
      lastErr = new Error(`HTTP ${res.status}`);
      continue; // retry
    }
    // Не повторяем при 4xx
    const data = await res.json().catch(() => ({}));
    throw new Error((data as Record<string, string>).error || `HTTP ${res.status}`);
  }
  throw lastErr;
}

/** Обратно-совместимая загрузка — возвращает только URL (с ВЗ если есть, иначе оригинал) */
export async function uploadFile(
  file: File,
  folder: 'photos' | 'logo' | 'watermark' | 'document' = 'photos',
  applyWatermark = false,
): Promise<string> {
  const r = await uploadFileEx(file, folder, applyWatermark);
  return r.url;
}

/**
 * Возвращает URL оригинала фото без водяного знака (если он был наложен).
 * Логика: если URL содержит "_wm" — заменяем на "" (бекенд сохранил оригинал по тому же ключу).
 * Иначе возвращаем тот же URL.
 */
export function getOriginalPhotoUrl(url: string): string {
  if (!url) return url;
  // Преобразуем .../photos/abc123_wm.jpg → .../photos/abc123.jpg (или сохранённое расширение)
  // Бекенд сохраняет оригинал по ключу <token>.<ext>, а ВЗ-версию <token>_wm.jpg
  if (/_wm\.(jpe?g|png|webp)$/i.test(url)) {
    return url.replace(/_wm(\.(jpe?g|png|webp))$/i, '$1');
  }
  return url;
}

export async function removeWatermark(
  photoUrl: string,
  sensitivity = 0.45,
  maskRegions?: { x: number; y: number; w: number; h: number }[]
): Promise<{ url: string; detected: boolean }> {
  const token = getToken();
  const res = await fetch(REMOVE_WM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) },
    body: JSON.stringify({ url: photoUrl, sensitivity, ...(maskRegions ? { mask_regions: maskRegions } : {}) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка обработки');
  return { url: data.url as string, detected: Boolean(data.detected) };
}

export type AiAction = 'describe' | 'reply_lead' | 'seo' | 'moderate' | 'analytics' | 'admin' | 'admin_ops' | 'add_city' | 'auto_tags' | 'agent' | 'security' | 'marketing' | 'analytics_full' | 'modernize' | 'db_check' | 'seo_listing' | 'get_memory';

export interface AgentAction {
  type: string;
  title: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  params: Record<string, unknown>;
}

export interface AgentResponse {
  reasoning: string;
  actions: AgentAction[];
  tokens: number;
}

export interface ExecuteResult {
  type: string;
  result: { ok?: boolean; message?: string; error?: string };
}

/** История диалога: формат [{role: 'user'|'ai', text: '...'}], последние 15-20 сообщений. */
export interface AiHistoryItem { role: 'user' | 'ai'; text: string }

/** Роль, которую ВБ применил к последнему ответу — определяется по тексту запроса.
 *  broker — Коммерческий брокер, it — ИТ-эксперт, mixed — универсальный. */
export type VbRole = 'broker' | 'it' | 'mixed';

export const aiApi = {
  ask: (action: AiAction, prompt: string, context_data?: unknown, history?: AiHistoryItem[]) =>
    req(AI_URL, {
      method: 'POST',
      body: JSON.stringify({ action, prompt, context_data, history: history || [] }),
    }) as Promise<{ text: string; tokens: number; role?: VbRole; topic?: string }>,
  ping: (api_key?: string, folder_id?: string) =>
    req(AI_URL, { method: 'POST', body: JSON.stringify({ action: 'ping', api_key, folder_id }) }) as Promise<{ success: boolean; message: string; reply: string; tokens: number }>,
  agent: (prompt: string, context_data?: unknown, history?: AiHistoryItem[]) =>
    req(AI_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'agent', prompt, context_data, history: history || [] }),
    }) as Promise<AgentResponse>,
  execute: (actions: AgentAction[]) =>
    req(AI_URL, { method: 'POST', body: JSON.stringify({ action: 'execute', actions }) }) as Promise<{ results: ExecuteResult[] }>,
  getMemory: () =>
    req(AI_URL, { method: 'POST', body: JSON.stringify({ action: 'get_memory', prompt: '' }) }) as Promise<{
      persona: string;
      interaction_count: string;
      learned_facts: string[];
      tech_decisions: { date: string; q: string; a: string }[];
      mood: string;
    }>,
};