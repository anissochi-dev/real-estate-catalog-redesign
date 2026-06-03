export const ADMIN_URL = 'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';

export interface District {
  id: number;
  name: string;
  slug: string;
  city: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  listings_count?: number;
}

export interface FormState {
  name: string;
  slug: string;
  city: string;
  description: string;
  sort_order: number;
}

export const BLANK_FORM: FormState = {
  name: '',
  slug: '',
  city: '',
  description: '',
  sort_order: 0,
};

export function buildHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Auth-Token': token,
  };
}

export function buildUrl(params: Record<string, string> = {}): string {
  const qs = new URLSearchParams({ resource: 'districts', ...params }).toString();
  return `${ADMIN_URL}?${qs}`;
}
