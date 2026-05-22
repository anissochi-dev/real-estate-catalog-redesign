export interface Benchmarks {
  rent_rate: number;
  vacancy_pct: number;
  opex_per_m2: number;
  property_tax_pct: number;
  market_cap_rate_pct: number;
  avg_indexation_pct: number;
  comment: string;
  source: 'yandex_gpt' | 'fallback';
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

export interface NoiApiResponse {
  listing: {
    id: number;
    title?: string;
    area: number;
    price: number;
    type?: string;
    deal?: string;
  };
  benchmarks: Benchmarks;
  scenarios: Scenarios;
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
