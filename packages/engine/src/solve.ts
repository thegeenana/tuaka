import { D, ONE, ZERO, roundMoney, type Dec } from "./decimal.js";
import { TuakaInputError } from "./errors.js";
import { MAX_RATE_PCT, MAX_TERM_MONTHS } from "./normalize.js";
import type { RoundingMode } from "./types.js";

/** Annual nominal percent → monthly rate as a fraction (5 → 0.0041666…). */
export function monthlyRate(annualRatePct: Dec): Dec {
  return annualRatePct.div(1200);
}

/** Exact (unrounded) level payment that repays `principal` over `n` months at monthly rate `r`. */
export function annuityPayment(principal: Dec, r: Dec, n: number): Dec {
  if (r.isZero()) return principal.div(n);
  const growth = ONE.plus(r).pow(n);
  return principal.mul(r).mul(growth).div(growth.minus(1));
}

/** Exact (unrounded) principal that a level `payment` repays over `n` months at monthly rate `r`. */
export function presentValue(payment: Dec, r: Dec, n: number): Dec {
  if (r.isZero()) return payment.mul(n);
  const growth = ONE.plus(r).pow(n);
  return payment.mul(growth.minus(1)).div(r.mul(growth));
}

/**
 * Level payment, rounded per the rounding mode. If rounding would leave the
 * payment no larger than the first month's interest (tiny loans at high rates
 * over long terms), it is raised by one minor unit so the loan always amortizes.
 */
export function solvePayment(principal: Dec, annualRatePct: Dec, n: number, mode: RoundingMode, dp: number): Dec {
  const r = monthlyRate(annualRatePct);
  const payment = roundMoney(annuityPayment(principal, r, n), mode, dp);
  if (mode === "none") return payment;
  const firstInterest = roundMoney(principal.mul(r), mode, dp);
  return payment.gt(firstInterest) ? payment : firstInterest.plus(new D(1).div(new D(10).pow(dp)));
}

export function solvePrincipal(payment: Dec, annualRatePct: Dec, n: number, mode: RoundingMode, dp: number): Dec {
  return roundMoney(presentValue(payment, monthlyRate(annualRatePct), n), mode, dp);
}

/**
 * Number of monthly payments needed to clear `principal` with a level `payment`.
 *
 * If the exact answer overshoots a whole number by under 1% of a period
 * (typically because the payment was rounded down to the penny), the extra
 * sliver is absorbed into a slightly larger final payment instead of adding
 * a near-empty extra month.
 */
export function solveTerm(principal: Dec, annualRatePct: Dec, payment: Dec, mode: RoundingMode, dp: number): number {
  const r = monthlyRate(annualRatePct);
  const firstInterest = roundMoney(principal.mul(r), mode, dp);
  if (payment.lte(firstInterest)) {
    throw new TuakaInputError(
      "payment_too_low",
      `A payment of ${payment.toFixed(dp)} does not cover the first month's interest of ${firstInterest.toFixed(dp)}, so the loan would never be repaid.`,
      "payment",
    );
  }
  const exact = r.isZero()
    ? principal.div(payment)
    : ONE.minus(principal.mul(r).div(payment)).ln().neg().div(ONE.plus(r).ln());

  const whole = exact.floor();
  const fraction = exact.minus(whole);
  const n = (whole.gte(1) && fraction.lt("0.01") ? whole : exact.ceil()).toNumber();

  if (n > MAX_TERM_MONTHS) {
    throw new TuakaInputError(
      "payment_too_low",
      `That payment would take ${n} months; the maximum is ${MAX_TERM_MONTHS}.`,
      "payment",
    );
  }
  return n;
}

/**
 * Annual nominal rate (percent, 6 dp) at which a level `payment` repays `principal` over `n` months.
 * Uses bisection, which always converges and gives the same answer on every platform.
 */
export function solveRate(principal: Dec, payment: Dec, n: number): Dec {
  const totalPaid = payment.mul(n);
  if (totalPaid.lt(principal)) {
    throw new TuakaInputError(
      "payment_too_low",
      `${n} payments of ${payment.toFixed(2)} total less than the principal, so no interest rate fits.`,
      "payment",
    );
  }
  if (totalPaid.eq(principal)) return ZERO;

  let lo = ZERO;
  let hi = new D(MAX_RATE_PCT).div(1200);
  if (annuityPayment(principal, hi, n).lt(payment)) {
    throw new TuakaInputError(
      "payment_too_high",
      `That payment implies a rate above ${MAX_RATE_PCT}% a year.`,
      "payment",
    );
  }
  for (let i = 0; i < 200; i++) {
    const mid = lo.plus(hi).div(2);
    if (annuityPayment(principal, mid, n).lt(payment)) lo = mid;
    else hi = mid;
  }
  return lo.plus(hi).div(2).mul(1200).toDecimalPlaces(6, D.ROUND_HALF_UP);
}
