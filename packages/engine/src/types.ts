/**
 * Public types for the TuaKa engine.
 *
 * Money and rates cross the boundary as decimal strings ("100000", "5.125"),
 * never as JavaScript numbers, so no value is ever silently rounded by
 * floating point on the way in or out.
 */

/** A base-10 number written as a string, e.g. "536.82". */
export type DecimalString = string;

/** The one variable the engine derives from the other three. */
export type SolveFor = "principal" | "rate" | "term" | "payment";

/**
 * How the payment and each month's interest are rounded.
 * - "half_up" / "half_even": rounded to the minor unit every period, as a lender bills (default "half_up").
 * - "none": kept at full precision and rounded only for display; matches most desktop/mobile calculators.
 */
export type RoundingMode = "half_up" | "half_even" | "none";

export interface LoanInput {
  /** Which of principal, rate, term, payment is computed. The matching field is ignored. */
  solveFor: SolveFor;
  /** Amount borrowed. */
  principal?: DecimalString;
  /** Nominal annual interest rate in percent, e.g. "5" for 5%. */
  annualRatePct?: DecimalString;
  /** Number of monthly payments. */
  termMonths?: number;
  /** Regular monthly payment (principal + interest). */
  payment?: DecimalString;
  /** Date of the first payment, YYYY-MM-DD. Later payments fall on the same day of each month (clamped to month end). */
  startDate: string;
  /** Property value, used for loan-to-value (LTV). Optional. */
  propertyValue?: DecimalString;
  /** ISO 4217 code, display only. Default "GBP". */
  currency?: string;
  /** Default "half_up". */
  roundingMode?: RoundingMode;
  /** Decimal places of the currency's minor unit. Default 2. */
  minorUnits?: number;
}

/** The input after validation and defaults; this is what the input hash is computed from. */
export interface NormalizedInput {
  solveFor: SolveFor;
  principal: DecimalString | null;
  annualRatePct: DecimalString | null;
  termMonths: number | null;
  payment: DecimalString | null;
  startDate: string;
  propertyValue: DecimalString | null;
  currency: string;
  roundingMode: RoundingMode;
  minorUnits: number;
}

export interface Solved {
  field: SolveFor;
  principal: DecimalString;
  annualRatePct: DecimalString;
  /** Contractual number of payments (for a solved term, the payments needed to clear the loan). */
  termMonths: number;
  payment: DecimalString;
}

export interface ScheduleRow {
  period: number;
  /** Payment date, YYYY-MM-DD. */
  date: string;
  year: number;
  month: number;
  openingBalance: DecimalString;
  annualRatePct: DecimalString;
  payment: DecimalString;
  interest: DecimalString;
  principal: DecimalString;
  closingBalance: DecimalString;
  /** Closing balance ÷ property value, percent, 1 dp. Null when no property value is given. */
  ltvPct: DecimalString | null;
}

export interface PeriodSummary {
  year: number;
  payments: number;
  interest: DecimalString;
  principal: DecimalString;
  total: DecimalString;
  closingBalance: DecimalString;
  ltvPct: DecimalString | null;
}

export interface LoanSummary {
  regularPayment: DecimalString;
  finalPayment: DecimalString;
  numberOfPayments: number;
  totalPaid: DecimalString;
  totalInterest: DecimalString;
  totalPrincipal: DecimalString;
  firstPaymentDate: string;
  payoffDate: string;
  /** LTV at the start (principal ÷ property value), percent, 1 dp. */
  initialLtvPct: DecimalString | null;
}

export interface EngineWarning {
  code: "high_ltv" | "ltv_over_100" | "final_payment_differs" | "zero_rate";
  message: string;
}

export interface CalculationResult {
  input: NormalizedInput;
  solved: Solved;
  rows: ScheduleRow[];
  annual: PeriodSummary[];
  summary: LoanSummary;
  warnings: EngineWarning[];
  meta: {
    engineVersion: string;
    /** SHA-256 (hex) of the canonical JSON of the normalized input. */
    inputHash: string;
  };
}
