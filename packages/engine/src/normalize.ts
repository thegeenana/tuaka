import { D } from "./decimal.js";
import { parseIsoDate } from "./dates.js";
import { TuakaInputError } from "./errors.js";
import type {
  ExpenseInput,
  ExpenseKind,
  FixedCostInput,
  FixedCostKind,
  LoanInput,
  NormalizedExpense,
  NormalizedFixedCost,
  NormalizedInput,
  NormalizedPrepayment,
  NormalizedRateChange,
  PrepaymentInput,
  RateChangeInput,
  SolveFor,
} from "./types.js";

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

  const propertyValue = decimalField(input.propertyValue, "propertyValue", { required: false });
  const expenses = normalizeExpenses(input.expenses ?? [], propertyValue !== null);

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
    propertyValue,
    currency,
    roundingMode,
    minorUnits,
    expenses,
    prepayments: normalizePrepayments(input.prepayments ?? []),
    fixedCosts: normalizeFixedCosts(input.fixedCosts ?? []),
    rateChanges: normalizeRateChanges(input.rateChanges ?? []),
  };
}

const EXPENSE_KINDS: readonly ExpenseKind[] = [
  "property_tax",
  "insurance",
  "mortgage_insurance",
  "service_charge",
  "ground_rent",
  "hoa",
  "other",
];
const FIXED_COST_KINDS: readonly FixedCostKind[] = [
  "arrangement_fee",
  "points",
  "valuation",
  "legal",
  "broker",
  "stamp_duty",
  "other",
];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T | undefined, field: string): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!allowed.includes(value as T)) {
    throw new TuakaInputError("out_of_range", `${field} must be one of ${allowed.join(", ")}.`, field);
  }
  return value as T;
}

function optionalDate(value: string | undefined, field: string): string | null {
  if (value === undefined || value === "") return null;
  parseIsoDate(value, field);
  return value;
}

function checkArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new TuakaInputError("invalid_number", `${field} must be a list.`, field);
  if (value.length > 100) throw new TuakaInputError("out_of_range", `${field} can have at most 100 entries.`, field);
  return value;
}

/** Order-independent: the same items in any order normalize (and hash) identically. */
function canonicalOrder<T>(items: T[], key: (item: T) => string = (item) => JSON.stringify(item)): T[] {
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function normalizeExpenses(raw: ExpenseInput[], hasPropertyValue: boolean): NormalizedExpense[] {
  return canonicalOrder(
    checkArray(raw, "expenses").map((item, i) => {
      const e = item as ExpenseInput;
      const f = `expenses[${i}]`;
      const basis = oneOf(e.basis, ["amount", "pct_of_property"] as const, "amount", `${f}.basis`);
      const stopAtLtvPct = decimalField(e.stopAtLtvPct, `${f}.stopAtLtvPct`, { required: false, allowZero: true, max: 200 });
      if ((basis === "pct_of_property" || stopAtLtvPct !== null) && !hasPropertyValue) {
        throw new TuakaInputError(
          "missing_field",
          `${f} depends on the property value, so propertyValue is required.`,
          "propertyValue",
        );
      }
      return {
        kind: oneOf(e.kind, EXPENSE_KINDS, undefined, `${f}.kind`),
        label: String(e.label ?? "").trim(),
        amount: decimalField(e.amount, `${f}.amount`, { required: true, allowZero: true })!,
        basis,
        frequency: oneOf(e.frequency, ["monthly", "yearly"] as const, "monthly", `${f}.frequency`),
        escalationPct: decimalField(e.escalationPct, `${f}.escalationPct`, { required: false, allowZero: true, max: 100 }) ?? "0",
        startDate: optionalDate(e.startDate, `${f}.startDate`),
        endDate: optionalDate(e.endDate, `${f}.endDate`),
        stopAtLtvPct,
      };
    }),
  );
}

function normalizePrepayments(raw: PrepaymentInput[]): NormalizedPrepayment[] {
  return canonicalOrder(
    checkArray(raw, "prepayments").map((item, i) => {
      const p = item as PrepaymentInput;
      const f = `prepayments[${i}]`;
      const kind = oneOf(p.kind, ["one_off", "recurring"] as const, undefined, `${f}.kind`);
      parseIsoDate(p.date, `${f}.date`);
      return {
        kind,
        amount: decimalField(p.amount, `${f}.amount`, { required: true })!,
        date: p.date,
        endDate: kind === "recurring" ? optionalDate(p.endDate, `${f}.endDate`) : null,
        frequency: kind === "recurring" ? oneOf(p.frequency, ["monthly", "yearly"] as const, "monthly", `${f}.frequency`) : "monthly",
        strategy: oneOf(p.strategy, ["reduce_term", "reduce_payment"] as const, "reduce_term", `${f}.strategy`),
      };
    }),
  );
}

function normalizeFixedCosts(raw: FixedCostInput[]): NormalizedFixedCost[] {
  return canonicalOrder(
    checkArray(raw, "fixedCosts").map((item, i) => {
      const c = item as FixedCostInput;
      const f = `fixedCosts[${i}]`;
      const kind = oneOf(c.kind, FIXED_COST_KINDS, undefined, `${f}.kind`);
      return {
        kind,
        label: String(c.label ?? "").trim(),
        amount: decimalField(c.amount, `${f}.amount`, { required: true, allowZero: true })!,
        financed: c.financed === true,
        inApr: c.inApr ?? kind !== "stamp_duty",
      };
    }),
  );
}

function normalizeRateChanges(raw: RateChangeInput[]): NormalizedRateChange[] {
  const changes = checkArray(raw, "rateChanges").map((item, i) => {
    const r = item as RateChangeInput;
    const f = `rateChanges[${i}]`;
    parseIsoDate(r.effectiveDate, `${f}.effectiveDate`);
    return {
      effectiveDate: r.effectiveDate,
      annualRatePct: decimalField(r.annualRatePct, `${f}.annualRatePct`, { required: true, allowZero: true, max: MAX_RATE_PCT })!,
      recast: r.recast ?? true,
    };
  });
  const sorted = canonicalOrder(changes, (c) => c.effectiveDate);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.effectiveDate === sorted[i - 1]!.effectiveDate) {
      throw new TuakaInputError(
        "out_of_range",
        `Two rate changes take effect on ${sorted[i]!.effectiveDate}; keep one.`,
        "rateChanges",
      );
    }
  }
  return sorted;
}
