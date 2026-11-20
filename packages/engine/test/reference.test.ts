import { describe, expect, it } from "vitest";
import { calculate } from "../src/index.js";

/**
 * Golden case: the reference calculator screen this project started from.
 * 100,000 at 5% over 30 years, first payment 1 Aug 2024, property value 100,000.
 *
 * That app keeps the payment at full precision (536.8216…) and rounds only
 * for display, which is why each full year totals 6,441.86 rather than
 * 12 × 536.82 = 6,441.84. Our "none" rounding mode reproduces it exactly.
 */
const reference = {
  solveFor: "payment",
  principal: "100000",
  annualRatePct: "5",
  termMonths: 360,
  startDate: "2024-08-01",
  propertyValue: "100000",
} as const;

// [year, interest, principal, total, ltv, balance] — transcribed from the screen.
const SCREEN: Array<[number, string, string, string, string, string]> = [
  [2024, "2078.31", "605.80", "2684.11", "99.4", "99394.20"],
  [2025, "4935.50", "1506.36", "6441.86", "97.9", "97887.84"],
  [2026, "4858.43", "1583.43", "6441.86", "96.3", "96304.41"],
  [2027, "4777.42", "1664.44", "6441.86", "94.6", "94639.97"],
  [2028, "4692.26", "1749.59", "6441.86", "92.9", "92890.38"],
  [2029, "4602.75", "1839.11", "6441.86", "91.1", "91051.27"],
  [2030, "4508.66", "1933.20", "6441.86", "89.1", "89118.07"],
  [2031, "4409.75", "2032.11", "6441.86", "87.1", "87085.97"],
  [2032, "4305.79", "2136.07", "6441.86", "84.9", "84949.89"],
  [2033, "4196.50", "2245.36", "6441.86", "82.7", "82704.54"],
  [2034, "4081.63", "2360.23", "6441.86", "80.3", "80344.30"],
  [2035, "3960.87", "2480.99", "6441.86", "77.9", "77863.31"],
  [2036, "3833.94", "2607.92", "6441.86", "75.3", "75255.39"],
  [2037, "3700.51", "2741.35", "6441.86", "72.5", "72514.05"],
  [2038, "3560.26", "2881.60", "6441.86", "69.6", "69632.45"],
  [2039, "3412.83", "3029.03", "6441.86", "66.6", "66603.42"],
  [2040, "3257.86", "3184.00", "6441.86", "63.4", "63419.42"],
  [2041, "3094.96", "3346.90", "6441.86", "60.1", "60072.53"],
  [2042, "2923.73", "3518.13", "6441.86", "56.6", "56554.40"],
  [2043, "2743.73", "3698.12", "6441.86", "52.9", "52856.27"],
  [2044, "2554.53", "3887.33", "6441.86", "49.0", "48968.94"],
];

describe("reference screen (exact mode)", () => {
  const result = calculate({ ...reference, roundingMode: "none" });

  it("solves the payment shown on screen", () => {
    expect(result.solved.payment).toBe("536.82");
  });

  it.each(SCREEN)("matches the %i row to the penny", (year, interest, principal, total, ltv, balance) => {
    const row = result.annual.find((r) => r.year === year);
    expect(row).toEqual({
      year,
      payments: year === 2024 ? 5 : 12,
      interest,
      principal,
      extraPrincipal: "0.00",
      expenses: "0.00",
      total,
      closingBalance: balance,
      ltvPct: ltv,
    });
  });

  it("runs 360 payments from Aug 2024 to Jul 2054 and ends at zero", () => {
    expect(result.summary.numberOfPayments).toBe(360);
    expect(result.summary.firstPaymentDate).toBe("2024-08-01");
    expect(result.summary.payoffDate).toBe("2054-07-01");
    expect(result.rows.at(-1)!.closingBalance).toBe("0.00");
  });
});

describe("reference screen (lender mode, penny-rounded)", () => {
  const result = calculate(reference);

  it("bills 536.82 a month, so each full year is 6,441.84", () => {
    expect(result.solved.payment).toBe("536.82");
    expect(result.annual.find((r) => r.year === 2025)!.total).toBe("6441.84");
    expect(result.annual[0]!.total).toBe("2684.10");
  });

  it("repays exactly the principal and resizes the final payment", () => {
    expect(result.summary.totalPrincipal).toBe("100000.00");
    expect(result.summary.numberOfPayments).toBe(360);
    expect(result.summary.finalPayment).not.toBe("536.82");
    expect(result.warnings.map((w) => w.code)).toContain("final_payment_differs");
  });

  it("flags a 100% loan-to-value", () => {
    expect(result.summary.initialLtvPct).toBe("100.0");
    expect(result.warnings.map((w) => w.code)).toContain("high_ltv");
  });
});
