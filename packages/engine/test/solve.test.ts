import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculate, TuakaInputError, type LoanInput } from "../src/index.js";

const base = { startDate: "2025-01-15" } as const;

describe("solve for each variable", () => {
  it("payment", () => {
    const r = calculate({ ...base, solveFor: "payment", principal: "250000", annualRatePct: "4.5", termMonths: 300 });
    expect(r.solved.payment).toBe("1389.58");
  });

  it("principal", () => {
    const r = calculate({ ...base, solveFor: "principal", payment: "1389.58", annualRatePct: "4.5", termMonths: 300 });
    expect(r.solved.principal).toBe("249999.79"); // cross-checked with Python decimal PV
  });

  it("term", () => {
    const r = calculate({ ...base, solveFor: "term", principal: "250000", annualRatePct: "4.5", payment: "2000" });
    expect(r.solved.termMonths).toBe(169); // exact 168.99 months
    expect(r.rows).toHaveLength(169);
    expect(Number(r.summary.finalPayment)).toBeLessThan(2000);
  });

  it("rate", () => {
    const r = calculate({ ...base, solveFor: "rate", principal: "250000", payment: "1389.58", termMonths: 300 });
    expect(Number(r.solved.annualRatePct)).toBeCloseTo(4.5, 3);
  });

  it("raises a penny-rounded payment that would not cover the first month's interest", () => {
    // Found by property testing: exact payment ≈ 7.2800…, first interest 7.28.
    const r = calculate({ ...base, solveFor: "payment", principal: "501", annualRatePct: "17.43", termMonths: 473 });
    expect(r.solved.payment).toBe("7.29");
    expect(r.rows.at(-1)!.closingBalance).toBe("0.00");
  });

  it("zero interest", () => {
    const r = calculate({ ...base, solveFor: "payment", principal: "1200", annualRatePct: "0", termMonths: 12 });
    expect(r.solved.payment).toBe("100.00");
    expect(r.summary.totalInterest).toBe("0.00");
    expect(r.warnings.map((w) => w.code)).toContain("zero_rate");
  });
});

describe("round trips (exact mode)", () => {
  const loan = fc.record({
    principal: fc.integer({ min: 1_000, max: 2_000_000 }),
    rateThousandths: fc.integer({ min: 1, max: 15_000 }),
    termMonths: fc.integer({ min: 12, max: 480 }),
  });

  it("solving term or principal from a solved payment gives back the input", () => {
    fc.assert(
      fc.property(loan, ({ principal, rateThousandths, termMonths }) => {
        const annualRatePct = (rateThousandths / 1000).toFixed(3);
        const common = { ...base, roundingMode: "none" as const, annualRatePct };
        const exactPayment = calculate({ ...common, solveFor: "payment", principal: String(principal), termMonths });
        const pmt = (Number(exactPayment.summary.totalPaid) / exactPayment.summary.numberOfPayments).toFixed(6);
        const term = calculate({ ...common, solveFor: "term", principal: String(principal), payment: pmt });
        expect(Math.abs(term.solved.termMonths - termMonths)).toBeLessThanOrEqual(1);
        const back = calculate({ ...common, solveFor: "principal", payment: pmt, termMonths });
        expect(Math.abs(Number(back.solved.principal) - principal)).toBeLessThan(principal * 1e-6 + 0.05);
      }),
      { numRuns: 150 },
    );
  });
});

describe("schedule invariants (lender mode)", () => {
  const arb = fc.record({
    principal: fc.integer({ min: 500, max: 3_000_000 }),
    rateHundredths: fc.integer({ min: 0, max: 2_000 }),
    termMonths: fc.integer({ min: 1, max: 600 }),
    day: fc.integer({ min: 1, max: 31 }),
  });

  it("balance never rises, never goes negative, and principal repaid equals principal borrowed", () => {
    fc.assert(
      fc.property(arb, ({ principal, rateHundredths, termMonths, day }) => {
        const input: LoanInput = {
          solveFor: "payment",
          principal: String(principal),
          annualRatePct: (rateHundredths / 100).toFixed(2),
          termMonths,
          startDate: `2024-01-${String(Math.min(day, 31)).padStart(2, "0")}`,
        };
        const r = calculate(input);
        let previous = principal + 0.001;
        for (const row of r.rows) {
          const close = Number(row.closingBalance);
          expect(close).toBeGreaterThanOrEqual(0);
          expect(close).toBeLessThan(previous);
          expect(Number(row.interest)).toBeGreaterThanOrEqual(0);
          previous = close;
        }
        expect(r.rows.at(-1)!.closingBalance).toBe("0.00");
        expect(r.summary.totalPrincipal).toBe(Number(principal).toFixed(2));
        // A payment rounded up to the penny can clear a small, long loan a few months early.
        expect(r.rows.length).toBeLessThanOrEqual(termMonths);
      }),
      { numRuns: 200 },
    );
  });
});

describe("dates", () => {
  it("clamps to month end and handles leap years", () => {
    const r = calculate({ solveFor: "payment", principal: "1000", annualRatePct: "5", termMonths: 3, startDate: "2028-01-31" });
    expect(r.rows.map((x) => x.date)).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
  });

  it("rejects impossible dates", () => {
    expect(() =>
      calculate({ solveFor: "payment", principal: "1000", annualRatePct: "5", termMonths: 3, startDate: "2027-02-29" }),
    ).toThrow(TuakaInputError);
  });
});

describe("input errors", () => {
  const err = (input: LoanInput) => {
    try {
      calculate(input);
    } catch (e) {
      return e as TuakaInputError;
    }
    throw new Error("expected an error");
  };

  it("missing field", () => {
    const e = err({ ...base, solveFor: "payment", principal: "1000", termMonths: 12 });
    expect(e.code).toBe("missing_field");
    expect(e.field).toBe("annualRatePct");
  });

  it("payment that never repays", () => {
    const e = err({ ...base, solveFor: "term", principal: "100000", annualRatePct: "5", payment: "416.67" });
    expect(e.code).toBe("payment_too_low");
  });

  it("payments that total less than the principal", () => {
    const e = err({ ...base, solveFor: "rate", principal: "100000", payment: "100", termMonths: 12 });
    expect(e.code).toBe("payment_too_low");
  });

  it("non-numeric and negative values", () => {
    expect(err({ ...base, solveFor: "payment", principal: "1e5", annualRatePct: "5", termMonths: 12 }).code).toBe(
      "invalid_number",
    );
    expect(err({ ...base, solveFor: "payment", principal: "-5", annualRatePct: "5", termMonths: 12 }).code).toBe(
      "invalid_number",
    );
  });
});

describe("determinism", () => {
  const input: LoanInput = { ...base, solveFor: "payment", principal: "100000", annualRatePct: "5", termMonths: 360 };

  it("same input, same hash and output", () => {
    expect(calculate(input)).toEqual(calculate(input));
  });

  it("formatting differences do not change the hash; real changes do", () => {
    const a = calculate(input).meta.inputHash;
    expect(calculate({ ...input, principal: "100000.00", annualRatePct: "5.0" }).meta.inputHash).toBe(a);
    expect(calculate({ ...input, payment: "999" }).meta.inputHash).toBe(a); // solved field is ignored
    expect(calculate({ ...input, annualRatePct: "5.01" }).meta.inputHash).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
