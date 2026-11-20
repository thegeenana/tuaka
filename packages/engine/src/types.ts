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

export type ExpenseKind =
  | "property_tax"
  | "insurance"
  | "mortgage_insurance"
  | "service_charge"
  | "ground_rent"
  | "hoa"
  | "other";

/**
 * A running cost of owning the property. Not part of the loan balance; shown
 * as part of the monthly outgoing. Yearly amounts are spread evenly over 12 months.
 */
export interface ExpenseInput {
  kind: ExpenseKind;
  label?: string;
  /** Money per period, or a percent of property value per period when basis is "pct_of_property". */
  amount: DecimalString;
  /** Default "amount". */
  basis?: "amount" | "pct_of_property";
  /** Default "monthly". */
  frequency?: "monthly" | "yearly";
  /** Yearly increase in percent, applied every 12 payments. Default 0. */
  escalationPct?: DecimalString;
  /** First payment date it applies to (inclusive). Default: the first payment. */
  startDate?: string;
  /** Last payment date it applies to (inclusive). Default: the end of the loan. */
  endDate?: string;
  /** Stop once loan-to-value falls to this percent or below (e.g. mortgage insurance at 78). Needs a property value. */
  stopAtLtvPct?: DecimalString;
}

/**
 * Money paid on top of the regular payment, straight off the balance.
 * - one_off: once, with the first payment on or after `date` ("Prepayment" tab).
 * - recurring: every month or year from `date` until `endDate` ("Extra" tab).
 */
export interface PrepaymentInput {
  kind: "one_off" | "recurring";
  amount: DecimalString;
  date: string;
  endDate?: string;
  /** For recurring only. Default "monthly". */
  frequency?: "monthly" | "yearly";
  /** Keep the payment and finish sooner, or keep the end date and pay less. Default "reduce_term". */
  strategy?: "reduce_term" | "reduce_payment";
}

export type FixedCostKind = "arrangement_fee" | "points" | "valuation" | "legal" | "broker" | "stamp_duty" | "other";

/** An up-front cost of taking the loan ("Fixed" tab). */
export interface FixedCostInput {
  kind: FixedCostKind;
  label?: string;
  amount: DecimalString;
  /** Added to the loan instead of paid up front. Default false. */
  financed?: boolean;
  /** Counted as a cost of credit in the APR. Default true, except stamp duty (a tax). */
  inApr?: boolean;
}

/** A new interest rate from a given date ("Interest" tab), e.g. a fixed period ending. */
export interface RateChangeInput {
  effectiveDate: string;
  annualRatePct: DecimalString;
  /** Recalculate the payment so the loan still ends on time. Default true. If false, the payment stays and the last payment absorbs the difference. */
  recast?: boolean;
}

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
  expenses?: ExpenseInput[];
  prepayments?: PrepaymentInput[];
  fixedCosts?: FixedCostInput[];
  rateChanges?: RateChangeInput[];
}

export interface NormalizedExpense {
  kind: ExpenseKind;
  label: string;
  amount: DecimalString;
  basis: "amount" | "pct_of_property";
  frequency: "monthly" | "yearly";
  escalationPct: DecimalString;
  startDate: string | null;
  endDate: string | null;
  stopAtLtvPct: DecimalString | null;
}

export interface NormalizedPrepayment {
  kind: "one_off" | "recurring";
  amount: DecimalString;
  date: string;
  endDate: string | null;
  frequency: "monthly" | "yearly";
  strategy: "reduce_term" | "reduce_payment";
}

export interface NormalizedFixedCost {
  kind: FixedCostKind;
  label: string;
  amount: DecimalString;
  financed: boolean;
  inApr: boolean;
}

export interface NormalizedRateChange {
  effectiveDate: string;
  annualRatePct: DecimalString;
  recast: boolean;
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
  expenses: NormalizedExpense[];
  prepayments: NormalizedPrepayment[];
  fixedCosts: NormalizedFixedCost[];
  rateChanges: NormalizedRateChange[];
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
  /** Regular payment: interest + scheduled principal. */
  payment: DecimalString;
  interest: DecimalString;
  /** Scheduled principal (excludes extra). */
  principal: DecimalString;
  /** Prepayments and recurring extra paid this period. */
  extraPrincipal: DecimalString;
  /** Running costs this period (not part of the loan). */
  expenses: DecimalString;
  /** payment + extraPrincipal + expenses. */
  totalOutgoing: DecimalString;
  closingBalance: DecimalString;
  /** Closing balance ÷ property value, percent, 1 dp. Null when no property value is given. */
  ltvPct: DecimalString | null;
}

export interface PeriodSummary {
  year: number;
  payments: number;
  interest: DecimalString;
  /** Scheduled principal + extra. */
  principal: DecimalString;
  extraPrincipal: DecimalString;
  expenses: DecimalString;
  /** interest + principal (loan payments only, excludes expenses). */
  total: DecimalString;
  closingBalance: DecimalString;
  ltvPct: DecimalString | null;
}

export interface BaselineComparison {
  numberOfPayments: number;
  totalInterest: DecimalString;
  payoffDate: string;
}

export interface LoanSummary {
  /** Amount borrowed including financed fixed costs. */
  loanAmount: DecimalString;
  regularPayment: DecimalString;
  finalPayment: DecimalString;
  numberOfPayments: number;
  /** Loan payments: interest + all principal. Excludes expenses and fixed costs. */
  totalPaid: DecimalString;
  totalInterest: DecimalString;
  /** Scheduled + extra principal; always equals loanAmount. */
  totalPrincipal: DecimalString;
  totalExtra: DecimalString;
  totalExpenses: DecimalString;
  totalFixedCosts: DecimalString;
  /** Fixed costs paid at the start (not financed). */
  upfrontCosts: DecimalString;
  /** Everything: loan payments + expenses + up-front costs. */
  totalCostOfOwnership: DecimalString;
  /** First month's payment + extra + expenses. */
  firstMonthOutgoing: DecimalString;
  /** Nominal annual APR in percent (monthly rate × 12), 3 dp; includes in-APR fixed costs and prepayments as scheduled. */
  aprPct: DecimalString;
  /** Effective annual rate in percent ((1 + monthly)^12 − 1), 3 dp; the UK "APRC" form. */
  aprcPct: DecimalString;
  firstPaymentDate: string;
  payoffDate: string;
  /** LTV at the start (loan amount ÷ property value), percent, 1 dp. */
  initialLtvPct: DecimalString | null;
  /** The same loan without prepayments; null when there are none. */
  baseline: BaselineComparison | null;
  interestSaved: DecimalString | null;
  monthsSaved: number | null;
}

export interface EngineWarning {
  code:
    | "high_ltv"
    | "ltv_over_100"
    | "final_payment_differs"
    | "zero_rate"
    | "prepayment_capped"
    | "rate_change_after_payoff";
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
