export interface S {
  company_name: string;
  company_phone: string;
  company_email: string;
  company_address: string;
  hero_title: string;
  hero_subtitle: string;
  about_text: string;
  logo_url: string;
  main_city: string;
  watermark_url: string;
  watermark_enabled: boolean;
  watermark_position: string;
  watermark_opacity: number;
  yandex_maps_api_key: string;
  yandex_metrika_id: string;
  google_analytics_id: string;
  company_since_year: number;
  site_url: string;
  seo_keywords: string;
  seo_description: string;
  yandex_api_key: string;
  yandex_folder_id: string;
  yookassa_shop_id: string;
  yookassa_secret_key: string;
  zachestny_api_key: string;
  newdb_api_key: string;
  bezopasno_api_key: string;
  legal_personal_data: string;
  legal_privacy_policy: string;
  legal_marketing_consent: string;
}

export interface City {
  id: number;
  name: string;
  region: string | null;
  is_active: boolean;
}

export interface PingState {
  loading: boolean;
  status: 'idle' | 'ok' | 'err';
  message: string;
}

export const WM_POS: [string, string][] = [
  ['bottom-right', 'Снизу справа'],
  ['bottom-left', 'Снизу слева'],
  ['top-right', 'Сверху справа'],
  ['top-left', 'Сверху слева'],
  ['center', 'По центру'],
];