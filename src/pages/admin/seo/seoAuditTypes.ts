export interface AuditData {
  score: number;
  total: number;
  stats: Record<string, number>;
  issues: { key: string; message: string; fill_pct: number; severity: string }[];
  top_problems: { id: number; title: string; category: string; no_seo_title: boolean; no_seo_desc: boolean; short_desc: boolean; no_image: boolean; no_faq: boolean }[];
  all_listings: { id: number; title: string; has_faq: boolean; faq_updated_at?: string | null }[];
}

export interface FixResult {
  processed: number;
  skipped: number;
  errors: number;
  results?: { id: number; status: string; seo_title?: string; error?: string }[];
}
