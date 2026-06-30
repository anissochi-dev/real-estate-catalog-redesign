export interface Benchmarks {
  rent_rate: number;
  vacancy_pct: number;
  opex_per_m2: number;
  property_tax_pct: number;
  market_cap_rate_pct: number;
  avg_indexation_pct: number;
  comment: string;
  source: 'yandex_gpt' | 'fallback' | 'real_data';
  // ГАБ-режим: объект сдан в аренду, арендатор несёт все расходы
  is_gab?: boolean;
  usn_annual?: number;
  property_tax_annual?: number;
  net_income_annual?: number;
}

export interface YearRow {
  year: number;
  noi: number;
  debt_service: number;
  cash_flow: number;
  cumulative: number;
}

export interface ModelResult {
  noi_year1: number;
  cap_rate_pct: number;
  npv_10y: number;
  npv_operations: number;
  terminal_value: number;
  pv_terminal: number;
  irr_pct: number;
  payback_years: number | null;
  discount_pct: number;
  loan_amount: number;
  debt_service_annual: number;
  gpi_year1: number;
  egi_year1: number;
  opex_year1: number;
  tax_year1: number;
  yearly: YearRow[];
}

export interface Scenarios {
  base: ModelResult;
  cb_up_4pct: ModelResult;
  cb_down_6pct: ModelResult;
  metro_open: ModelResult;
  leverage_50: ModelResult;
  growth_high: ModelResult;
}

export interface MarketSnapshot {
  price_per_m2: number;
  price_median?: number | null;
  price_min?: number | null;
  price_max?: number | null;
  analogs_count: number;
  district: string;
  snapshot_date?: string | null;
}

export interface PriceVsMarket {
  obj_price_per_m2: number;
  market_price_per_m2: number;
  diff_pct: number;
  assessment: 'above' | 'below' | 'fair';
  analogs_count: number;
  district: string;
}

export interface AnalogsMeta {
  analogs_count: number;
  analogs_source_level: 'address' | 'district' | 'city' | 'none' | null;
  analogs_sources: string[];
  area_range?: [number, number] | null;
  external_scraped?: number | null;
  external_source?: string | null;
}

export interface NoiApiResponse {
  listing: {
    id: number;
    title?: string;
    area: number;
    price: number;
    type?: string;
    deal?: string;
    monthly_rent?: number | null;
    yearly_rent?: number | null;
    tenant_name?: string | null;
    building_class?: string | null;
    building_year?: number | null;
    total_floors?: number | null;
    has_tenant?: boolean;
  };
  benchmarks: Benchmarks;
  scenarios: Scenarios;
  data_source?: 'real_rent' | 'yandex_gpt' | 'fallback';
  market_rent_rate?: number | null;
  actual_rent_rate?: number | null;
  comparables?: {
    rent?: MarketSnapshot | null;
    sale?: MarketSnapshot | null;
    sources: string[];
    snapshot_date?: string | null;
  };
  price_vs_market?: PriceVsMarket | null;
  analogs_meta?: AnalogsMeta | null;
}

export interface UserParams {
  rent_rate: number;
  vacancy_pct: number;
  opex_per_m2: number;
  property_tax_pct: number;
  avg_indexation_pct: number;
  cb_rate_pct: number;
  ltv_pct: number;
  loan_rate_pct: number;
  loan_years: number;
  infra_rent_uplift_pct: number;
  infra_year: number;
}

export const PRICE_PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';