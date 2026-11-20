import Decimal from "decimal.js";
import type { Dec } from "./decimal.js";

/** Lower precision is ample for a rate quoted to 3 dp, and keeps 1,200-period discounting fast. */
const A = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/**
 * Monthly rate i such that the present value of the monthly cash flows equals
 * the amount the borrower actually receives:
 *
 *   amountFinanced = Σ cashflow_k / (1 + i)^k,  k = 1..n
 *
 * Solved by bisection (always converges, same answer everywhere). Returns null
 * when nothing sensible can be computed (no cash flows, or nothing financed).
 */
export function monthlyIrr(amountFinanced: Dec, cashflows: Dec[]): Dec | null {
  const target = new A(amountFinanced.toString());
  const flows = cashflows.map((c) => new A(c.toString()));
  if (target.lte(0) || flows.length === 0) return null;
  const total = flows.reduce((a, c) => a.plus(c), new A(0));
  if (total.lte(target)) return new A(0) as unknown as Dec;

  const presentValue = (i: Decimal): Decimal => {
    const v = new A(1).div(new A(1).plus(i));
    let factor = new A(1);
    let pv = new A(0);
    for (const c of flows) {
      factor = factor.mul(v);
      pv = pv.plus(c.mul(factor));
    }
    return pv;
  };

  // Newton–Raphson from a sensible guess: usually converges in 3–6 steps.
  // f(i) = PV(i) − target, f'(i) = −Σ k·c_k·v^(k+1). Falls back to bisection if it misbehaves.
  const guess = total.div(target).minus(1).div(flows.length).mul(2);
  let i = guess.gt(0) ? guess : new A("0.001");
  const tolerance = new A("1e-18");
  for (let step = 0; step < 40; step++) {
    const v = new A(1).div(new A(1).plus(i));
    let factor = new A(1);
    let pv = new A(0);
    let slope = new A(0);
    flows.forEach((c, k) => {
      factor = factor.mul(v);
      pv = pv.plus(c.mul(factor));
      slope = slope.minus(c.mul(k + 1).mul(factor).mul(v));
    });
    if (slope.isZero()) break;
    const next = i.minus(pv.minus(target).div(slope));
    if (!next.isFinite() || next.lte(0) || next.gt(1)) break;
    if (next.minus(i).abs().lt(tolerance)) return next as unknown as Dec;
    i = next;
  }

  let lo = new A(0);
  let hi = new A(1);
  for (let k = 0; k < 90; k++) {
    const mid = lo.plus(hi).div(2);
    if (presentValue(mid).gt(target)) lo = mid;
    else hi = mid;
  }
  return lo.plus(hi).div(2) as unknown as Dec;
}

/** Nominal APR (i × 12) and effective annual rate ((1 + i)^12 − 1), both in percent, 3 dp. */
export function aprFigures(monthly: Dec | null): { aprPct: string; aprcPct: string } {
  if (monthly === null) return { aprPct: "0.000", aprcPct: "0.000" };
  const i = new A(monthly.toString());
  return {
    aprPct: i.mul(1200).toFixed(3, A.ROUND_HALF_UP),
    aprcPct: new A(1).plus(i).pow(12).minus(1).mul(100).toFixed(3, A.ROUND_HALF_UP),
  };
}
