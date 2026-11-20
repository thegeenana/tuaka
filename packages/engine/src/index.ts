import { aprFigures, monthlyIrr } from "./apr.js";
import { D, ZERO, fmt, type Dec } from "./decimal.js";
import { parseIsoDate } from "./dates.js";
import { TuakaInputError } from "./errors.js";
import { canonicalJson, sha256Hex } from "./hash.js";
import { normalizeInput } from "./normalize.js";
import { buildSchedule, type Period, type ScheduleArgs } from "./schedule.js";
import { solvePayment, solvePrincipal, solveRate, solveTerm } from "./solve.js";
import type {
  BaselineComparison,
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
export const ENGINE_VERSION = "0.2.0";

const HIGH_LTV_PCT = 95;

interface SolvedValues {
  /** Cash principal (excludes financed fixed costs). */
  principal: Dec;
  /** Opening loan balance: principal + financed fixed costs. */
  loanAmount: Dec;
  rate: Dec;
  term: number;
  payment: Dec;
}

/**
 * Solve the unknown using the opening terms: the starting rate and the
 * contractual term. Later rate changes and prepayments then reshape the schedule.
 */
function solve(input: NormalizedInput, financed: Dec): SolvedValues {
  const { roundingMode: mode, minorUnits: dp } = input;
  const principal = input.principal === null ? null : new D(input.principal);
  const rate = input.annualRatePct === null ? null : new D(input.annualRatePct);
  const payment = input.payment === null ? null : new D(input.payment);
  const term = input.termMonths;
  const loan = principal === null ? null : principal.plus(financed);

  // normalizeInput guarantees every field except the solved one is present.
  switch (input.solveFor) {
    case "payment":
      return { principal: principal!, loanAmount: loan!, rate: rate!, term: term!, payment: solvePayment(loan!, rate!, term!, mode, dp) };
    case "term":
      return { principal: principal!, loanAmount: loan!, rate: rate!, term: solveTerm(loan!, rate!, payment!, mode, dp), payment: payment! };
    case "rate":
      return { principal: principal!, loanAmount: loan!, rate: solveRate(loan!, payment!, term!), term: term!, payment: payment! };
    case "principal": {
      const loanAmount = solvePrincipal(payment!, rate!, term!, mode, dp);
      const cash = loanAmount.minus(financed);
      if (cash.lte(0)) {
        throw new TuakaInputError(
          "payment_too_low",
          "That payment only covers the financed fees, leaving nothing to borrow.",
          "payment",
        );
      }
      return { principal: cash, loanAmount, rate: rate!, term: term!, payment: payment! };
    }
  }
}

function ltvPct(balance: Dec, propertyValue: Dec | null): string | null {
  if (!propertyValue || propertyValue.isZero()) return null;
  return fmt(balance.div(propertyValue).mul(100), 1);
}

function sum<T>(items: T[], pick: (p: T) => Dec | string): Dec {
  return items.reduce((acc, p) => acc.plus(pick(p)), ZERO);
}

function toRow(p: Period, propertyValue: Dec | null, dp: number): ScheduleRow {
  return {
    period: p.period,
    date: p.iso,
    year: p.date.y,
    month: p.date.m,
    openingBalance: fmt(p.opening, dp),
    annualRatePct: p.annualRatePct.toFixed(),
    payment: fmt(p.payment, dp),
    interest: fmt(p.interest, dp),
    principal: fmt(p.principal, dp),
    extraPrincipal: fmt(p.extra, dp),
    expenses: fmt(p.expenses, dp),
    totalOutgoing: fmt(p.payment.plus(p.extra).plus(p.expenses), dp),
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
    const principal = sum(ps, (p) => p.principal.plus(p.extra));
    const last = ps[ps.length - 1]!;
    return {
      year,
      payments: ps.length,
      interest: fmt(interest, dp),
      principal: fmt(principal, dp),
      extraPrincipal: fmt(sum(ps, (p) => p.extra), dp),
      expenses: fmt(sum(ps, (p) => p.expenses), dp),
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

  const financed = sum(input.fixedCosts.filter((c) => c.financed), (c) => c.amount);
  const upfront = sum(input.fixedCosts.filter((c) => !c.financed), (c) => c.amount);
  const inAprCosts = sum(input.fixedCosts.filter((c) => c.inApr), (c) => c.amount);

  const { principal, loanAmount, rate, term, payment } = solve(input, financed);
  const propertyValue = input.propertyValue === null ? null : new D(input.propertyValue);

  const scheduleArgs: ScheduleArgs = {
    loanAmount,
    annualRatePct: rate,
    payment,
    termMonths: term,
    start: parseIsoDate(input.startDate),
    roundingMode: input.roundingMode,
    minorUnits: dp,
    propertyValue,
    expenses: input.expenses,
    prepayments: input.prepayments,
    rateChanges: input.rateChanges,
  };
  const { periods, prepaymentCapped, unusedRateChanges } = buildSchedule(scheduleArgs);

  // The same loan without prepayments, to show what they save.
  let baseline: BaselineComparison | null = null;
  let baselineInterest: Dec | null = null;
  if (input.prepayments.length > 0) {
    const base = buildSchedule({ ...scheduleArgs, prepayments: [], expenses: [] }).periods;
    baselineInterest = sum(base, (p) => p.interest);
    baseline = {
      numberOfPayments: base.length,
      totalInterest: fmt(baselineInterest, dp),
      payoffDate: base[base.length - 1]!.iso,
    };
  }

  const rows = periods.map((p) => toRow(p, propertyValue, dp));
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  const totalInterest = sum(periods, (p) => p.interest);
  const totalPrincipal = sum(periods, (p) => p.principal.plus(p.extra));
  const totalExtra = sum(periods, (p) => p.extra);
  const totalExpenses = sum(periods, (p) => p.expenses);
  const totalPaid = totalInterest.plus(totalPrincipal);
  const initialLtv = ltvPct(loanAmount, propertyValue);
  const regularPayment = fmt(payment, dp);

  // APR: what the borrower actually receives vs. every loan payment they make.
  const monthly = monthlyIrr(
    loanAmount.minus(inAprCosts),
    periods.map((p) => p.payment.plus(p.extra)),
  );

  const summary: LoanSummary = {
    loanAmount: fmt(loanAmount, dp),
    regularPayment,
    finalPayment: fmt(last.payment, dp),
    numberOfPayments: periods.length,
    totalPaid: fmt(totalPaid, dp),
    totalInterest: fmt(totalInterest, dp),
    totalPrincipal: fmt(totalPrincipal, dp),
    totalExtra: fmt(totalExtra, dp),
    totalExpenses: fmt(totalExpenses, dp),
    totalFixedCosts: fmt(financed.plus(upfront), dp),
    upfrontCosts: fmt(upfront, dp),
    totalCostOfOwnership: fmt(totalPaid.plus(totalExpenses).plus(upfront), dp),
    firstMonthOutgoing: fmt(first.payment.plus(first.extra).plus(first.expenses), dp),
    ...aprFigures(monthly),
    firstPaymentDate: first.iso,
    payoffDate: last.iso,
    initialLtvPct: initialLtv,
    baseline,
    interestSaved: baselineInterest === null ? null : fmt(baselineInterest.minus(totalInterest), dp),
    monthsSaved: baseline === null ? null : baseline.numberOfPayments - periods.length,
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
  // Compare the last payment with the one before it, since rate changes and prepayments move the "regular" payment.
  const previous = periods.length > 1 ? periods[periods.length - 2]! : null;
  const expectedLast = previous ? fmt(previous.payment, dp) : regularPayment;
  if (fmt(last.payment, dp) !== expectedLast) {
    warnings.push({
      code: "final_payment_differs",
      message: `The final payment is ${fmt(last.payment, dp)} rather than ${expectedLast}, to clear the balance exactly.`,
    });
  }
  if (rate.isZero() && input.rateChanges.length === 0) {
    warnings.push({ code: "zero_rate", message: "The interest rate is 0%, so every payment is principal." });
  }
  if (prepaymentCapped) {
    warnings.push({
      code: "prepayment_capped",
      message: "A prepayment was larger than the remaining balance, so only the balance was taken.",
    });
  }
  if (unusedRateChanges.length > 0) {
    warnings.push({
      code: "rate_change_after_payoff",
      message: `${unusedRateChanges.length} rate change${unusedRateChanges.length === 1 ? "" : "s"} fall after the loan is paid off and had no effect.`,
    });
  }

  const solved: Solved = {
    field: input.solveFor,
    principal: fmt(principal, dp),
    annualRatePct: rate.toFixed(),
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
