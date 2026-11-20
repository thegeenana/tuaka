import { roundMoney, ZERO, type Dec } from "./decimal.js";
import { addMonths, type Ymd } from "./dates.js";
import { TuakaInputError } from "./errors.js";
import { monthlyRate } from "./solve.js";
import type { RoundingMode } from "./types.js";

export interface ScheduleArgs {
  principal: Dec;
  annualRatePct: Dec;
  payment: Dec;
  termMonths: number;
  start: Ymd;
  roundingMode: RoundingMode;
  minorUnits: number;
}

/** One period at full precision; formatting to strings happens once, at the edge. */
export interface Period {
  period: number;
  date: Ymd;
  opening: Dec;
  payment: Dec;
  interest: Dec;
  principal: Dec;
  closing: Dec;
}

/**
 * Period-by-period amortization.
 *
 * Each month: interest = balance × monthly rate (rounded per the rounding
 * mode); principal = payment − interest. The last payment, or any payment
 * that would overpay, is resized to clear the balance exactly, so the
 * schedule always ends at zero.
 */
export function buildSchedule(args: ScheduleArgs): Period[] {
  const { annualRatePct, payment, termMonths, start, roundingMode, minorUnits } = args;
  const r = monthlyRate(annualRatePct);
  const periods: Period[] = [];
  let balance = args.principal;

  for (let period = 1; period <= termMonths && balance.gt(0); period++) {
    const interest = roundMoney(balance.mul(r), roundingMode, minorUnits);
    let principal = payment.minus(interest);
    let paid = payment;

    if (period === termMonths || principal.gte(balance)) {
      principal = balance;
      paid = balance.plus(interest);
    }
    if (principal.lte(0)) {
      throw new TuakaInputError(
        "payment_too_low",
        `In month ${period} the payment does not cover the interest of ${interest.toFixed(minorUnits)}.`,
        "payment",
      );
    }

    const closing = balance.minus(principal);
    periods.push({
      period,
      date: addMonths(start, period - 1),
      opening: balance,
      payment: paid,
      interest,
      principal,
      closing: closing.isNeg() ? ZERO : closing,
    });
    balance = closing;
  }
  return periods;
}
