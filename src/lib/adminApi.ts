const AUTH_URL = 'https://functions.poehali.dev/e5d9d96a-a3ca-45cd-9ea3-3e2982b626f7';
const ADMIN_URL = 'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';
const AI_URL = 'https://functions.poehali.dev/34bfc4a2-89b9-4c89-bcbc-d82314730aef';
const UPLOADS_URL = 'https://functions.poehali.dev/82b9e0bc-2ffa-4045-a74b-a09985cec2b5';
const REMOVE_WM_URL = 'https://functions.poehali.dev/93965724-e0d4-411d-8100-b9468a1a0627';
export const CRM_URL = 'https://functions.poehali.dev/221e23fa-e0a4-416e-b878-c2da2914daac';
export const CRM_CHECKS_URL = 'https://functions.poehali.dev/be6cb907-b50e-48fa-b9e2-092dd541a82a';
export const CRM_PAYMENTS_URL = 'https://functions.poehali.dev/74ca5694-a05f-4053-992d-5e04cc5bc7a4';

export type Role = 'admin' | 'editor' | 'manager' | 'client';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  phone?: string | null;
  avatar?: string | null;
}

const TOKEN_KEY = 'biznest_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function req(url: string, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Auth-Token': token } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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
  // listings
  listListings: () => req(`${ADMIN_URL}?resource=listings`),
  getListing: (id: number) => req(`${ADMIN_URL}?resource=listings&id=${id}`),
  createListing: (data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=listings`, { method: 'POST', body: JSON.stringify(data) }),
  updateListing: (id: number, data: Record<string, unknown>) =>
    req(`${ADMIN_URL}?resource=listings&id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  archiveListing: (id: number) =>
    req(`${ADMIN_URL}?resource=listings&id=${id}`, { method: 'DELETE' }),

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
};

export async function uploadFile(file: File, folder: 'photos' | 'logo' | 'watermark' = 'photos'): Promise<string> {
  const b64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const token = getToken();
  const res = await fetch(UPLOADS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) },
    body: JSON.stringify({ file_base64: b64, filename: file.name, folder }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
  return data.url as string;
}

export async function removeWatermark(photoUrl: string, sensitivity = 0.35): Promise<{ url: string; detected: boolean }> {
  const token = getToken();
  const res = await fetch(REMOVE_WM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) },
    body: JSON.stringify({ url: photoUrl, sensitivity }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка обработки');
  return { url: data.url as string, detected: Boolean(data.detected) };
}

export type AiAction = 'describe' | 'reply_lead' | 'seo' | 'moderate' | 'analytics' | 'admin' | 'add_city' | 'auto_tags' | 'agent';

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

export const aiApi = {
  ask: (action: AiAction, prompt: string, context_data?: unknown) =>
    req(AI_URL, { method: 'POST', body: JSON.stringify({ action, prompt, context_data }) }) as Promise<{ text: string; tokens: number }>,
  ping: (api_key?: string, folder_id?: string) =>
    req(AI_URL, { method: 'POST', body: JSON.stringify({ action: 'ping', api_key, folder_id }) }) as Promise<{ success: boolean; message: string; reply: string; tokens: number }>,
  agent: (prompt: string, context_data?: unknown) =>
    req(AI_URL, { method: 'POST', body: JSON.stringify({ action: 'agent', prompt, context_data }) }) as Promise<AgentResponse>,
  execute: (actions: AgentAction[]) =>
    req(AI_URL, { method: 'POST', body: JSON.stringify({ action: 'execute', actions }) }) as Promise<{ results: ExecuteResult[] }>,
};