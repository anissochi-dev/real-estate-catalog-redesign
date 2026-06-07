import { Benchmarks, ModelResult, UserParams, YearRow } from './types';

/** Локальный пересчёт модели (зеркало backend-логики, ползунки работают мгновенно).
 *  NPV включает Terminal Value (реверсию) — стандарт DCF для недвижимости.
 */
export function computeModel(
  listing: { area: number; price: number; type?: string },
  bench: Benchmarks,
  params: Partial<UserParams> = {},
): ModelResult {
  const area = listing.area > 0 ? listing.area : 1;
  const price = listing.price > 0 ? listing.price : 1;

  const rent_rate    = params.rent_rate    ?? bench.rent_rate;
  const vacancy_pct  = params.vacancy_pct  ?? bench.vacancy_pct;
  const opex_per_m2  = params.opex_per_m2  ?? bench.opex_per_m2;
  const tax_pct      = params.property_tax_pct ?? bench.property_tax_pct;
  const indexation   = params.avg_indexation_pct ?? bench.avg_indexation_pct;
  const market_cap   = bench.market_cap_rate_pct;

  const ltv_pct    = params.ltv_pct    ?? 0;
  const loan_rate  = params.loan_rate_pct ?? 18;
  const loan_years = params.loan_years ?? 10;

  const infra_uplift = params.infra_rent_uplift_pct ?? 0;
  const infra_year   = params.infra_year ?? 0;

  const cb_rate = params.cb_rate_pct ?? 21;
  const risk_premium = 4;
  const discount = cb_rate + risk_premium;

  const is_land = listing.type === 'land';

  const gpi = (is_land && rent_rate === 0) ? 0 : rent_rate * 12 * area;
  const egi = gpi * (1 - vacancy_pct / 100);
  const opex_total = opex_per_m2 * 12 * area;
  const tax_total = price * tax_pct / 100;
  const noi_year1 = egi - opex_total - tax_total;

  const cap_rate = price ? (noi_year1 / price) * 100 : 0;

  let loan_amount = 0;
  let debt_service_annual = 0;
  let initial_equity = -price;
  if (ltv_pct > 0) {
    loan_amount = price * (ltv_pct / 100);
    initial_equity = -(price - loan_amount);
    const r = loan_rate / 100 / 12;
    const n = Math.round(loan_years * 12);
    const monthly = r > 0 && n > 0
      ? (loan_amount * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1)
      : loan_amount / Math.max(n, 1);
    debt_service_annual = monthly * 12;
  }

  const cashFlows: number[] = [initial_equity];
  let cumulative = initial_equity;
  let payback_years: number | null = null;
  const yearly: YearRow[] = [];
  let noi_year10 = noi_year1;

  for (let year = 1; year <= 10; year++) {
    const indexFactor = Math.pow(1 + indexation / 100, year - 1);
    const infraFactor = infra_year && year >= infra_year ? 1 + infra_uplift / 100 : 1;
    const rentYear = (is_land && rent_rate === 0) ? 0 : rent_rate * 12 * area * indexFactor * infraFactor;
    const egiYear  = rentYear * (1 - vacancy_pct / 100);
    // OPEX индексируется медленнее аренды (0.4× вместо 1×)
    const opexYear = opex_per_m2 * 12 * area * Math.pow(1 + 0.4 * indexation / 100, year - 1);
    const taxYear  = price * tax_pct / 100;
    const noiYear  = egiYear - opexYear - taxYear;
    if (year === 10) noi_year10 = noiYear;
    const debtYear = year <= loan_years ? debt_service_annual : 0;
    const cashYear = noiYear - debtYear;
    cashFlows.push(cashYear);
    const prevCum = cumulative;
    cumulative += cashYear;
    yearly.push({
      year,
      noi: Math.round(noiYear),
      debt_service: Math.round(debtYear),
      cash_flow: Math.round(cashYear),
      cumulative: Math.round(cumulative),
    });
    if (payback_years === null && cumulative >= 0) {
      if (cashYear > 0) {
        const frac = -prevCum / cashYear;
        payback_years = (year - 1) + Math.max(0, Math.min(1, frac));
      } else {
        payback_years = year;
      }
    }
  }

  // Terminal Value: стоимость актива при продаже на конец года 10
  let terminal_value: number;
  if (is_land && rent_rate === 0) {
    // Земля без аренды: TV = апрециация цены
    terminal_value = price * Math.pow(1 + indexation / 100, 10);
  } else if (market_cap > 0 && noi_year10 > 0) {
    // Метод прямой капитализации, не более 3× от цены покупки
    terminal_value = Math.min(noi_year10 / (market_cap / 100), price * 3);
  } else {
    terminal_value = 0;
  }
  const r = discount / 100;
  const pv_terminal = r > 0 ? terminal_value / Math.pow(1 + r, 10) : terminal_value;

  const npv_operations = computeNPV(cashFlows, discount);
  const npv_total = npv_operations + pv_terminal;

  // IRR с учётом продажи актива: добавляем TV к CF последнего года
  const cashFlowsWithTV = [...cashFlows];
  cashFlowsWithTV[cashFlowsWithTV.length - 1] += terminal_value;
  const irr = computeIRR(cashFlowsWithTV);

  return {
    noi_year1: Math.round(noi_year1),
    cap_rate_pct: Number(cap_rate.toFixed(2)),
    npv_10y: Math.round(npv_total),
    npv_operations: Math.round(npv_operations),
    terminal_value: Math.round(terminal_value),
    pv_terminal: Math.round(pv_terminal),
    irr_pct: Number(irr.toFixed(2)),
    payback_years: payback_years !== null ? Number(payback_years.toFixed(1)) : null,
    discount_pct: Number(discount.toFixed(2)),
    loan_amount: Math.round(loan_amount),
    debt_service_annual: Math.round(debt_service_annual),
    gpi_year1: Math.round(gpi),
    egi_year1: Math.round(egi),
    opex_year1: Math.round(opex_total),
    tax_year1: Math.round(tax_total),
    yearly,
  };
}

function computeNPV(cashFlows: number[], discountPct: number): number {
  const r = discountPct / 100;
  return cashFlows.reduce((s, cf, i) => s + cf / Math.pow(1 + r, i), 0);
}

function computeIRR(cashFlows: number[]): number {
  if (!cashFlows.length || cashFlows[0] >= 0) return 0;
  let lo = -0.49, hi = 2.0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const npv = cashFlows.reduce((s, cf, idx) => s + cf / Math.pow(1 + mid, idx), 0);
    if (Math.abs(npv) < 1e-3) return mid * 100;
    if (npv > 0) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}

export const fmtMoney = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} млрд ₽`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} млн ₽`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)} тыс ₽`;
  return `${Math.round(n)} ₽`;
};

export const fmtMoneyFull = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('ru') + ' ₽';
};