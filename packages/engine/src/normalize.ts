import { D } from "./decimal.js";
import { parseIsoDate } from "./dates.js";
import { TuakaInputError } from "./errors.js";
import type { LoanInput, NormalizedInput, SolveFor } from "./types.js";

const DECIMAL = /^\d+(\.\d+)?$/;
const SOLVE_FOR: readonly SolveFor[] = ["principal", "rate", "term", "payment"];

export const MAX_TERM_MONTHS = 1200;
export const MAX_RATE_PCT = 100;

function decimalField(
  value: string | undefined,
  field: string,
  opts: { required: boolean; allowZero?: boolean; max?: number },
): string | null {
  if (value === undefined || value === null || value === "") {
    if (opts.required) throw new TuakaInputError("missing_field", `${field} is required.`, field);
    return null;
  }
  const trimmed = String(value).trim();
  if (!DECIMAL.test(trimmed)) {
    throw new TuakaInputError("invalid_number", `${field} must be a non-negative decimal, got "${value}".`, field);
  }
  const d = new D(trimmed);
  if (d.isZero() && !opts.allowZero) {
    throw new TuakaInputError("out_of_range", `${field} must be greater than zero.`, field);
  }
  if (opts.max !== undefined && d.gt(opts.max)) {
    throw new TuakaInputError("out_of_range", `${field} must be at most ${opts.max}.`, field);
  }
  // Canonical form, so "100000.00" and "100000" hash identically.
  return d.toFixed();
}

/** Validate input, apply defaults, and blank the solved field. Throws TuakaInputError. */
export function normalizeInput(input: LoanInput): NormalizedInput {
  if (!SOLVE_FOR.includes(input.solveFor)) {
    throw new TuakaInputError("out_of_range", `solveFor must be one of ${SOLVE_FOR.join(", ")}.`, "solveFor");
  }
  const solveFor = input.solveFor;

  const minorUnits = input.minorUnits ?? 2;
  if (!Number.isInteger(minorUnits) || minorUnits < 0 || minorUnits > 4) {
    throw new TuakaInputError("out_of_range", "minorUnits must be an integer from 0 to 4.", "minorUnits");
  }

  const currency = (input.currency ?? "GBP").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new TuakaInputError("invalid_number", "currency must be a 3-letter ISO 4217 code.", "currency");
  }

  const roundingMode = input.roundingMode ?? "half_up";
  if (roundingMode !== "half_up" && roundingMode !== "half_even" && roundingMode !== "none") {
    throw new TuakaInputError("out_of_range", "roundingMode must be half_up, half_even or none.", "roundingMode");
  }

  parseIsoDate(input.startDate);

  let termMonths: number | null = null;
  if (solveFor !== "term") {
    if (input.termMonths === undefined || input.termMonths === null) {
      throw new TuakaInputError("missing_field", "termMonths is required.", "termMonths");
    }
    if (!Number.isInteger(input.termMonths) || input.termMonths < 1 || input.termMonths > MAX_TERM_MONTHS) {
      throw new TuakaInputError(
        "out_of_range",
        `termMonths must be a whole number from 1 to ${MAX_TERM_MONTHS}.`,
        "termMonths",
      );
    }
    termMonths = input.termMonths;
  }

  return {
    solveFor,
    principal: solveFor === "principal" ? null : decimalField(input.principal, "principal", { required: true }),
    annualRatePct:
      solveFor === "rate"
        ? null
        : decimalField(input.annualRatePct, "annualRatePct", { required: true, allowZero: true, max: MAX_RATE_PCT }),
    termMonths,
    payment: solveFor === "payment" ? null : decimalField(input.payment, "payment", { required: true }),
    startDate: input.startDate,
    propertyValue: decimalField(input.propertyValue, "propertyValue", { required: false }),
    currency,
    roundingMode,
    minorUnits,
  };
}
