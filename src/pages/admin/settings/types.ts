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
  yandex_webmaster_verification: string;
  google_search_console_verification: string;
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
  footer_description: string;
  footer_catalog_links: string;
  footer_extra_links: string;
  footer_legal_info: string;
  // Бренд-кит
  brand_primary_color: string;
  brand_secondary_color: string;
  brand_accent_color: string;
  favicon_url: string;
  og_image_url: string;
  apple_touch_icon_url: string;
  // Уведомления
  notify_email_enabled: boolean;
  notify_email_recipients: string;
  notify_email_on_lead: boolean;
  notify_email_on_deal: boolean;
  notify_email_on_complaint: boolean;
  notify_telegram_enabled: boolean;
  notify_telegram_bot_token: string;
  notify_telegram_chat_ids: string;
  notify_telegram_on_lead: boolean;
  notify_telegram_on_deal: boolean;
  notify_telegram_on_complaint: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from: string;
  home_listings_limit: number;
  catalog_page_size: number;
  news_list_limit: number;
  category_page_size: number;
  leads_page_size: number;
  show_news_on_home: boolean;
  home_news_limit: number;
  show_leads_on_home: boolean;
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