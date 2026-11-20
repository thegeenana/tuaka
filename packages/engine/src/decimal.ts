import Decimal from "decimal.js";
import type { RoundingMode } from "./types.js";

/** Engine-local Decimal with enough precision for 1,200-period compounding. */
export const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;

export const ZERO = new D(0);
export const ONE = new D(1);

/** Round a money value as the rounding mode requires; "none" keeps full precision. */
export function roundMoney(value: Dec, mode: RoundingMode, minorUnits: number): Dec {
  if (mode === "none") return value;
  return value.toDecimalPlaces(minorUnits, mode === "half_even" ? D.ROUND_HALF_EVEN : D.ROUND_HALF_UP);
}

/** Fixed-point display string with exactly `dp` decimals, rounded half-up, e.g. "536.80". */
export function fmt(value: Dec, dp: number): string {
  return value.toFixed(dp, D.ROUND_HALF_UP);
}
