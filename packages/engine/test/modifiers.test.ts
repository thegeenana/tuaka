import { describe, expect, it } from "vitest";
import { calculate, TuakaInputError, type LoanInput } from "../src/index.js";

/**
 * Expected figures were produced by an independent Python (decimal) implementation
 * of the same rules, not by this engine.
 */
const loan: LoanInput = {
  solveFor: "payment",
  principal: "100000",
  annualRatePct: "5",
  termMonths: 360,
  startDate: "2024-08-01",
};

const codes = (r: ReturnType<typeof calculate>) => r.warnings.map((w) => w.code);

describe("prepayments", () => {
  it("one-off, reduce term: finishes sooner and reports the saving", () => {
    const r = calculate({ ...loan, prepayments: [{ kind: "one_off", amount: "10000", date: "2029-08-01" }] });
    expect(r.summary.numberOfPayments).toBe(303);
    expect(r.summary.payoffDate).toBe("2049-10-01");
    expect(r.summary.totalInterest).toBe("72490.92");
    expect(r.summary.baseline).toEqual({ numberOfPayments: 360, totalInterest: "93256.52", payoffDate: "2054-07-01" });
    expect(r.summary.interestSaved).toBe("20765.60");
    expect(r.summary.monthsSaved).toBe(57);
    expect(r.summary.finalPayment).toBe("371.28");
    expect(r.summary.totalPrincipal).toBe("100000.00");
    const row = r.rows.find((x) => x.date === "2029-08-01")!;
    expect(row.extraPrincipal).toBe("10000.00");
    expect(row.payment).toBe("536.82");
  });

  it("one-off on a date between payments applies with the next payment", () => {
    const r = calculate({ ...loan, prepayments: [{ kind: "one_off", amount: "10000", date: "2029-07-15" }] });
    expect(r.rows.find((x) => x.date === "2029-08-01")!.extraPrincipal).toBe("10000.00");
    expect(r.summary.numberOfPayments).toBe(303);
  });

  it("recurring monthly extra", () => {
    const r = calculate({ ...loan, prepayments: [{ kind: "recurring", amount: "100", date: "2024-08-01" }] });
    expect(r.summary.numberOfPayments).toBe(256);
    expect(r.summary.totalInterest).toBe("62675.95");
    expect(r.summary.interestSaved).toBe("30580.57");
    expect(r.summary.finalPayment).toBe("286.85");
    expect(r.summary.firstMonthOutgoing).toBe("636.82");
  });

  it("recurring yearly extra only lands every 12 months, and stops at its end date", () => {
    const r = calculate({
      ...loan,
      prepayments: [{ kind: "recurring", frequency: "yearly", amount: "1000", date: "2025-01-01", endDate: "2027-12-31" }],
    });
    const withExtra = r.rows.filter((x) => x.extraPrincipal !== "0.00").map((x) => x.date);
    expect(withExtra).toEqual(["2025-01-01", "2026-01-01", "2027-01-01"]);
    expect(r.summary.totalExtra).toBe("3000.00");
  });

  it("reduce payment: keeps the end date and lowers the payment", () => {
    const r = calculate({
      ...loan,
      prepayments: [{ kind: "one_off", amount: "10000", date: "2029-08-01", strategy: "reduce_payment" }],
    });
    expect(r.summary.numberOfPayments).toBe(360);
    expect(r.rows[61]!.payment).toBe("478.26");
    expect(r.summary.totalInterest).toBe("85748.47");
  });

  it("caps a prepayment bigger than the balance", () => {
    const r = calculate({ ...loan, prepayments: [{ kind: "one_off", amount: "500000", date: "2025-01-01" }] });
    expect(r.rows.at(-1)!.closingBalance).toBe("0.00");
    expect(r.summary.totalPrincipal).toBe("100000.00");
    expect(codes(r)).toContain("prepayment_capped");
  });
});

describe("rate changes", () => {
  it("fixed for two years, then a higher rate with the payment recast", () => {
    const r = calculate({ ...loan, annualRatePct: "4", rateChanges: [{ effectiveDate: "2026-08-01", annualRatePct: "7" }] });
    expect(r.rows[23]!.payment).toBe("477.42");
    expect(r.rows[24]!.payment).toBe("655.18");
    expect(r.rows[24]!.annualRatePct).toBe("7");
    expect(r.summary.numberOfPayments).toBe(360);
    expect(r.summary.totalInterest).toBe("131602.71");
  });

  it("without recast the payment stays and the last payment takes up the slack", () => {
    const r = calculate({ ...loan, rateChanges: [{ effectiveDate: "2026-08-01", annualRatePct: "5.5", recast: false }] });
    expect(r.rows[24]!.payment).toBe("536.82");
    expect(r.summary.finalPayment).toBe("23997.23");
    expect(codes(r)).toContain("final_payment_differs");
  });

  it("errors clearly when a rise without recast no longer covers the interest", () => {
    expect(() =>
      calculate({ ...loan, rateChanges: [{ effectiveDate: "2026-08-01", annualRatePct: "9", recast: false }] }),
    ).toThrow(/does not cover the interest/);
  });

  it("warns about changes dated after payoff", () => {
    const r = calculate({ ...loan, termMonths: 12, rateChanges: [{ effectiveDate: "2030-01-01", annualRatePct: "6" }] });
    expect(codes(r)).toContain("rate_change_after_payoff");
  });

  it("rejects two changes on the same date", () => {
    expect(() =>
      calculate({
        ...loan,
        rateChanges: [
          { effectiveDate: "2026-08-01", annualRatePct: "6" },
          { effectiveDate: "2026-08-01", annualRatePct: "7" },
        ],
      }),
    ).toThrow(TuakaInputError);
  });
});

describe("expenses", () => {
  const withProperty: LoanInput = { ...loan, propertyValue: "200000" };

  it("percent-of-property yearly tax, spread monthly, escalating each year", () => {
    const r = calculate({
      ...withProperty,
      expenses: [{ kind: "property_tax", amount: "1", basis: "pct_of_property", frequency: "yearly", escalationPct: "3" }],
    });
    expect(r.rows[0]!.expenses).toBe("166.67"); // 1% of 200,000 / 12
    expect(r.rows[11]!.expenses).toBe("166.67");
    expect(r.rows[12]!.expenses).toBe("171.67"); // +3% from the 13th payment
    expect(r.rows[0]!.totalOutgoing).toBe("703.49"); // 536.82 + 166.67
    expect(r.rows[0]!.closingBalance).toBe(calculate(withProperty).rows[0]!.closingBalance); // never touches the loan
  });

  it("mortgage insurance stops once LTV reaches the threshold", () => {
    const r = calculate({
      ...loan,
      propertyValue: "110000",
      expenses: [{ kind: "mortgage_insurance", amount: "40", stopAtLtvPct: "78" }],
    });
    const lastCharged = r.rows.filter((x) => x.expenses !== "0.00").at(-1)!;
    const next = r.rows[lastCharged.period]!; // 0-based index = next period
    expect(Number(lastCharged.openingBalance) / 110000).toBeGreaterThan(0.78);
    expect(Number(next.openingBalance) / 110000).toBeLessThanOrEqual(0.78);
  });

  it("needs a property value for percent-based or LTV-based expenses", () => {
    expect(() =>
      calculate({ ...loan, expenses: [{ kind: "property_tax", amount: "1", basis: "pct_of_property" }] }),
    ).toThrow(/propertyValue is required/);
  });

  it("totals appear in the summary and the annual view", () => {
    const r = calculate({ ...loan, expenses: [{ kind: "insurance", amount: "30" }] });
    expect(r.summary.totalExpenses).toBe("10800.00"); // 360 × 30
    expect(r.annual[0]!.expenses).toBe("150.00"); // Aug–Dec 2024
    expect(r.summary.totalCostOfOwnership).toBe("204056.52"); // 193,256.52 + 10,800
  });
});

describe("fixed costs and APR", () => {
  it("with no fees, APR equals the rate", () => {
    const r = calculate(loan);
    expect(r.summary.aprPct).toBe("5.000");
    expect(r.summary.aprcPct).toBe("5.116");
  });

  it("an up-front fee raises the APR", () => {
    const r = calculate({ ...loan, fixedCosts: [{ kind: "arrangement_fee", amount: "2000" }] });
    expect(r.summary.aprPct).toBe("5.178");
    expect(r.summary.aprcPct).toBe("5.303");
    expect(r.summary.upfrontCosts).toBe("2000.00");
    expect(r.solved.payment).toBe("536.82"); // not financed, so the payment is unchanged
  });

  it("a financed fee is added to the loan", () => {
    const r = calculate({ ...loan, fixedCosts: [{ kind: "arrangement_fee", amount: "999", financed: true }] });
    expect(r.summary.loanAmount).toBe("100999.00");
    expect(r.solved.payment).toBe("542.18");
    expect(r.summary.aprPct).toBe("5.088");
    expect(r.summary.upfrontCosts).toBe("0.00");
  });

  it("stamp duty is a tax, so it is left out of the APR by default", () => {
    const r = calculate({ ...loan, fixedCosts: [{ kind: "stamp_duty", amount: "5000" }] });
    expect(r.summary.aprPct).toBe("5.000");
    expect(r.summary.totalFixedCosts).toBe("5000.00");
    expect(r.summary.totalCostOfOwnership).toBe("198256.52");
  });

  it("solving for principal subtracts financed fees from what you can borrow", () => {
    const r = calculate({
      ...loan,
      solveFor: "principal",
      payment: "542.18",
      fixedCosts: [{ kind: "arrangement_fee", amount: "999", financed: true }],
    });
    expect(Number(r.solved.principal)).toBeCloseTo(100000, -1);
    expect(Number(r.summary.loanAmount) - Number(r.solved.principal)).toBeCloseTo(999, 2);
  });
});

describe("determinism with modifiers", () => {
  it("listing items in a different order gives the same hash", () => {
    const a = { kind: "insurance", amount: "30" } as const;
    const b = { kind: "service_charge", amount: "120", frequency: "yearly" } as const;
    const h1 = calculate({ ...loan, expenses: [a, b] }).meta.inputHash;
    const h2 = calculate({ ...loan, expenses: [b, a] }).meta.inputHash;
    expect(h1).toBe(h2);
  });
});

describe("invariants with random modifiers", () => {
  it("balance only falls, ends at zero, and all principal is repaid exactly", async () => {
    const fc = (await import("fast-check")).default;
    const arb = fc.record({
      principal: fc.integer({ min: 5_000, max: 1_000_000 }),
      rate: fc.integer({ min: 0, max: 1200 }),
      term: fc.integer({ min: 24, max: 480 }),
      oneOff: fc.integer({ min: 0, max: 50_000 }),
      oneOffMonth: fc.integer({ min: 1, max: 200 }),
      extra: fc.integer({ min: 0, max: 500 }),
      newRate: fc.integer({ min: 0, max: 1200 }),
      changeMonth: fc.integer({ min: 1, max: 200 }),
      reducePayment: fc.boolean(),
    });
    const date = (monthsAfter: number) => {
      const y = 2025 + Math.floor(monthsAfter / 12);
      const m = (monthsAfter % 12) + 1;
      return `${y}-${String(m).padStart(2, "0")}-01`;
    };
    fc.assert(
      fc.property(arb, (a) => {
        const r = calculate({
          solveFor: "payment",
          principal: String(a.principal),
          annualRatePct: (a.rate / 100).toFixed(2),
          termMonths: a.term,
          startDate: "2025-01-01",
          prepayments: [
            ...(a.oneOff > 0 ? [{ kind: "one_off" as const, amount: String(a.oneOff), date: date(a.oneOffMonth), strategy: a.reducePayment ? ("reduce_payment" as const) : ("reduce_term" as const) }] : []),
            ...(a.extra > 0 ? [{ kind: "recurring" as const, amount: String(a.extra), date: "2025-01-01" }] : []),
          ],
          rateChanges: [{ effectiveDate: date(a.changeMonth), annualRatePct: (a.newRate / 100).toFixed(2) }],
        });
        let previous = Infinity;
        for (const row of r.rows) {
          const close = Number(row.closingBalance);
          expect(close).toBeGreaterThanOrEqual(0);
          expect(close).toBeLessThan(previous);
          previous = close;
        }
        expect(r.rows.at(-1)!.closingBalance).toBe("0.00");
        expect(r.summary.totalPrincipal).toBe(r.summary.loanAmount);
        expect(r.rows.length).toBeLessThanOrEqual(a.term);
        if (r.summary.interestSaved !== null) expect(Number(r.summary.interestSaved)).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 120 },
    );
  }, 120_000);
});
