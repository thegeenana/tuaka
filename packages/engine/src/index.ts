import { D, ZERO, fmt, type Dec } from "./decimal.js";
import { formatIsoDate, parseIsoDate } from "./dates.js";
import { canonicalJson, sha256Hex } from "./hash.js";
import { normalizeInput } from "./normalize.js";
import { buildSchedule, type Period } from "./schedule.js";
import { solvePayment, solvePrincipal, solveRate, solveTerm } from "./solve.js";
import type {
  CalculationResult,
  EngineWarning,
  LoanInput,
  LoanSummary,
  NormalizedInput,
  PeriodSummary,
  ScheduleRow,
  Solved,
} from "./types.js";

export * from "./types.js";
export { TuakaInputError, type InputErrorCode } from "./errors.js";
export { normalizeInput, MAX_RATE_PCT, MAX_TERM_MONTHS } from "./normalize.js";
export { addMonths, daysInMonth, formatIsoDate, parseIsoDate } from "./dates.js";

/** Bump whenever a change could alter any output for the same input (rounding, dates, solving). */
export const ENGINE_VERSION = "0.1.0";

const HIGH_LTV_PCT = 95;

interface SolvedValues {
  principal: Dec;
  rate: Dec;
  term: number;
  payment: Dec;
}

function solve(input: NormalizedInput): SolvedValues {
  const { roundingMode: mode, minorUnits: dp } = input;
  const principal = input.principal === null ? null : new D(input.principal);
  const rate = input.annualRatePct === null ? null : new D(input.annualRatePct);
  const payment = input.payment === null ? null : new D(input.payment);
  const term = input.termMonths;

  // normalizeInput guarantees every field except the solved one is present.
  switch (input.solveFor) {
    case "payment":
      return { principal: principal!, rate: rate!, term: term!, payment: solvePayment(principal!, rate!, term!, mode, dp) };
    case "principal":
      return { principal: solvePrincipal(payment!, rate!, term!, mode, dp), rate: rate!, term: term!, payment: payment! };
    case "term":
      return { principal: principal!, rate: rate!, term: solveTerm(principal!, rate!, payment!, mode, dp), payment: payment! };
    case "rate":
      return { principal: principal!, rate: solveRate(principal!, payment!, term!), term: term!, payment: payment! };
  }
}

function ltvPct(balance: Dec, propertyValue: Dec | null): string | null {
  if (!propertyValue || propertyValue.isZero()) return null;
  return fmt(balance.div(propertyValue).mul(100), 1);
}

function sum(periods: Period[], pick: (p: Period) => Dec): Dec {
  return periods.reduce((acc, p) => acc.plus(pick(p)), ZERO);
}

function toRow(p: Period, rate: string, propertyValue: Dec | null, dp: number): ScheduleRow {
  return {
    period: p.period,
    date: formatIsoDate(p.date),
    year: p.date.y,
    month: p.date.m,
    openingBalance: fmt(p.opening, dp),
    annualRatePct: rate,
    payment: fmt(p.payment, dp),
    interest: fmt(p.interest, dp),
    principal: fmt(p.principal, dp),
    closingBalance: fmt(p.closing, dp),
    ltvPct: ltvPct(p.closing, propertyValue),
  };
}

/** Calendar-year totals, summed at full precision before rounding for display. */
function rollUpByYear(periods: Period[], propertyValue: Dec | null, dp: number): PeriodSummary[] {
  const byYear = new Map<number, Period[]>();
  for (const p of periods) {
    const bucket = byYear.get(p.date.y);
    if (bucket) bucket.push(p);
    else byYear.set(p.date.y, [p]);
  }
  return [...byYear.entries()].map(([year, ps]) => {
    const interest = sum(ps, (p) => p.interest);
    const principal = sum(ps, (p) => p.principal);
    const last = ps[ps.length - 1]!;
    return {
      year,
      payments: ps.length,
      interest: fmt(interest, dp),
      principal: fmt(principal, dp),
      total: fmt(interest.plus(principal), dp),
      closingBalance: fmt(last.closing, dp),
      ltvPct: ltvPct(last.closing, propertyValue),
    };
  });
}

/**
 * Solve the loan and build its full schedule.
 *
 * Pure and deterministic: no clock, no I/O, no floating point. The same input
 * always produces the same result, identified by `meta.inputHash`.
 * Throws `TuakaInputError` when the input cannot describe a valid loan.
 */
export function calculate(raw: LoanInput): CalculationResult {
  const input = normalizeInput(raw);
  const dp = input.minorUnits;
  const { principal, rate, term, payment } = solve(input);
  const propertyValue = input.propertyValue === null ? null : new D(input.propertyValue);
  const rateText = rate.toFixed();

  const periods = buildSchedule({
    principal,
    annualRatePct: rate,
    payment,
    termMonths: term,
    start: parseIsoDate(input.startDate),
    roundingMode: input.roundingMode,
    minorUnits: dp,
  });

  const rows = periods.map((p) => toRow(p, rateText, propertyValue, dp));
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const totalInterest = sum(periods, (p) => p.interest);
  const totalPrincipal = sum(periods, (p) => p.principal);
  const initialLtv = ltvPct(principal, propertyValue);
  const regularPayment = fmt(payment, dp);

  const summary: LoanSummary = {
    regularPayment,
    finalPayment: last.payment,
    numberOfPayments: rows.length,
    totalPaid: fmt(totalInterest.plus(totalPrincipal), dp),
    totalInterest: fmt(totalInterest, dp),
    totalPrincipal: fmt(totalPrincipal, dp),
    firstPaymentDate: first.date,
    payoffDate: last.date,
    initialLtvPct: initialLtv,
  };

  const warnings: EngineWarning[] = [];
  if (initialLtv !== null && new D(initialLtv).gt(100)) {
    warnings.push({
      code: "ltv_over_100",
      message: `The loan is ${initialLtv}% of the property value, more than the property is worth.`,
    });
  } else if (initialLtv !== null && new D(initialLtv).gt(HIGH_LTV_PCT)) {
    warnings.push({
      code: "high_ltv",
      message: `Loan-to-value starts at ${initialLtv}%; most lenders cap it at ${HIGH_LTV_PCT}%.`,
    });
  }
  if (last.payment !== regularPayment) {
    warnings.push({
      code: "final_payment_differs",
      message: `The final payment is ${last.payment} rather than ${regularPayment}, to clear the balance exactly.`,
    });
  }
  if (rate.isZero()) {
    warnings.push({ code: "zero_rate", message: "The interest rate is 0%, so every payment is principal." });
  }

  const solved: Solved = {
    field: input.solveFor,
    principal: fmt(principal, dp),
    annualRatePct: rateText,
    termMonths: term,
    payment: regularPayment,
  };

  return {
    input,
    solved,
    rows,
    annual: rollUpByYear(periods, propertyValue, dp),
    summary,
    warnings,
    meta: {
      engineVersion: ENGINE_VERSION,
      inputHash: sha256Hex(canonicalJson({ engine: ENGINE_VERSION, input })),
    },
  };
}
