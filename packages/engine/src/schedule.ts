import { D, ONE, roundMoney, ZERO, type Dec } from "./decimal.js";
import { addMonths, formatIsoDate, type Ymd } from "./dates.js";
import { TuakaInputError } from "./errors.js";
import { monthlyRate, solvePayment } from "./solve.js";
import type { NormalizedExpense, NormalizedPrepayment, NormalizedRateChange, RoundingMode } from "./types.js";

export interface ScheduleArgs {
  /** Opening balance: principal plus any financed fixed costs. */
  loanAmount: Dec;
  annualRatePct: Dec;
  payment: Dec;
  termMonths: number;
  start: Ymd;
  roundingMode: RoundingMode;
  minorUnits: number;
  propertyValue: Dec | null;
  expenses: NormalizedExpense[];
  prepayments: NormalizedPrepayment[];
  rateChanges: NormalizedRateChange[];
}

/** One period at full precision; formatting to strings happens once, at the edge. */
export interface Period {
  period: number;
  date: Ymd;
  iso: string;
  annualRatePct: Dec;
  opening: Dec;
  payment: Dec;
  interest: Dec;
  principal: Dec;
  extra: Dec;
  expenses: Dec;
  closing: Dec;
}

export interface ScheduleOutcome {
  periods: Period[];
  /** A prepayment was larger than the remaining balance and was reduced. */
  prepaymentCapped: boolean;
  /** Rate changes dated after the loan was paid off (never applied). */
  unusedRateChanges: NormalizedRateChange[];
}

function wholeYearsElapsed(period: number): number {
  const months = period - 1;
  return (months - (months % 12)) / 12;
}

/** Running costs for one period. Yearly amounts are spread evenly over 12 months. */
function expensesFor(
  list: NormalizedExpense[],
  period: number,
  iso: string,
  opening: Dec,
  propertyValue: Dec | null,
  mode: RoundingMode,
  dp: number,
): Dec {
  let total = ZERO;
  for (const e of list) {
    if (e.startDate !== null && iso < e.startDate) continue;
    if (e.endDate !== null && iso > e.endDate) continue;
    if (e.stopAtLtvPct !== null && propertyValue && opening.div(propertyValue).mul(100).lte(e.stopAtLtvPct)) continue;
    let base = new D(e.amount);
    if (e.basis === "pct_of_property") base = base.mul(propertyValue ?? ZERO).div(100);
    if (e.frequency === "yearly") base = base.div(12);
    const growth = ONE.plus(new D(e.escalationPct).div(100)).pow(wholeYearsElapsed(period));
    total = total.plus(roundMoney(base.mul(growth), mode, dp));
  }
  return total;
}

/**
 * Period-by-period amortization with rate changes, prepayments and expenses.
 *
 * Each month, in this order:
 * 1. Apply any rate change now in effect; if it recasts, re-solve the payment
 *    over the months left so the loan still ends on time.
 * 2. Interest = balance × monthly rate (rounded per the rounding mode).
 * 3. Scheduled principal = payment − interest. The last contractual payment,
 *    or any that would overpay, is resized to clear the balance exactly.
 * 4. Prepayments due this month come off what is left (capped at the balance).
 *    A "reduce_payment" prepayment re-solves the payment over the months left;
 *    "reduce_term" keeps the payment, so the loan simply ends sooner.
 * 5. Running costs are added to the month's outgoing; they never touch the balance.
 */
export function buildSchedule(args: ScheduleArgs): ScheduleOutcome {
  const { termMonths, start, roundingMode: mode, minorUnits: dp, propertyValue } = args;
  const periods: Period[] = [];
  let balance = args.loanAmount;
  let payment = args.payment;
  let rate = args.annualRatePct;
  let nextChange = 0;
  let prepaymentCapped = false;
  const anchors: Array<number | null> = args.prepayments.map(() => null);

  for (let period = 1; period <= termMonths && balance.gt(0); period++) {
    const date = addMonths(start, period - 1);
    const iso = formatIsoDate(date);

    // 1. Rate changes now in effect.
    while (nextChange < args.rateChanges.length && args.rateChanges[nextChange]!.effectiveDate <= iso) {
      const change = args.rateChanges[nextChange]!;
      rate = new D(change.annualRatePct);
      if (change.recast) payment = solvePayment(balance, rate, termMonths - period + 1, mode, dp);
      nextChange++;
    }

    // 2–3. Interest and scheduled principal.
    const interest = roundMoney(balance.mul(monthlyRate(rate)), mode, dp);
    let principal = payment.minus(interest);
    let paid = payment;
    if (period === termMonths || principal.gte(balance)) {
      principal = balance;
      paid = balance.plus(interest);
    }
    if (principal.lte(0)) {
      throw new TuakaInputError(
        "payment_too_low",
        `In month ${period} (${iso}) the payment of ${payment.toFixed(dp)} does not cover the interest of ${interest.toFixed(dp)}.`,
        "payment",
      );
    }
    const afterScheduled = balance.minus(principal);

    // 4. Prepayments due this month.
    let extraDue = ZERO;
    let recastAfter = false;
    args.prepayments.forEach((p, i) => {
      if (iso < p.date) return;
      let due = false;
      if (p.kind === "one_off") {
        due = anchors[i] === null;
        if (due) anchors[i] = period;
      } else if (p.endDate === null || iso <= p.endDate) {
        if (anchors[i] === null) anchors[i] = period;
        due = p.frequency === "monthly" || (period - anchors[i]!) % 12 === 0;
      }
      if (due) {
        extraDue = extraDue.plus(p.amount);
        if (p.strategy === "reduce_payment") recastAfter = true;
      }
    });
    let extra = extraDue;
    if (extra.gt(afterScheduled)) {
      extra = afterScheduled;
      prepaymentCapped = true;
    }
    const closing = afterScheduled.minus(extra);
    if (recastAfter && closing.gt(0) && period < termMonths) {
      payment = solvePayment(closing, rate, termMonths - period, mode, dp);
    }

    // 5. Running costs.
    const expenses = expensesFor(args.expenses, period, iso, balance, propertyValue, mode, dp);

    periods.push({
      period,
      date,
      iso,
      annualRatePct: rate,
      opening: balance,
      payment: paid,
      interest,
      principal,
      extra,
      expenses,
      closing: closing.isNeg() ? ZERO : closing,
    });
    balance = closing;
  }

  return { periods, prepaymentCapped, unusedRateChanges: args.rateChanges.slice(nextChange) };
}
