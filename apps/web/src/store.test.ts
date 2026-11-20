import { calculate } from "@tuaka/engine";
import { describe, expect, it } from "vitest";
import { DEFAULTS, toLoanInput, type LoanFormState } from "./store";

describe("toLoanInput", () => {
  it("leaves out rows that are still being typed, and never sends UI ids", () => {
    const state: LoanFormState = {
      ...DEFAULTS,
      expenses: [
        { id: "a", kind: "insurance", amount: "30" },
        { id: "b", kind: "other", amount: "" },
      ],
      prepayments: [
        { id: "c", kind: "one_off", amount: "5000", date: "2026-01-01" },
        { id: "d", kind: "recurring", amount: "", date: "2026-01-01" },
      ],
      fixedCosts: [{ id: "e", kind: "arrangement_fee", amount: "999", financed: true, inApr: true }],
      rateChanges: [{ id: "f", effectiveDate: "2026-08-01", annualRatePct: "" }],
    };
    const input = toLoanInput(state);
    expect(input.expenses).toEqual([{ kind: "insurance", amount: "30" }]);
    expect(input.prepayments).toEqual([{ kind: "one_off", amount: "5000", date: "2026-01-01" }]);
    expect(input.rateChanges).toEqual([]);
    expect(JSON.stringify(input)).not.toContain('"id"');
    // and the engine accepts it
    expect(calculate(input).summary.loanAmount).toBe("100999.00");
  });

  it("drops an empty optional end date instead of sending a blank string", () => {
    const input = toLoanInput({
      ...DEFAULTS,
      prepayments: [{ id: "x", kind: "recurring", amount: "100", date: "2025-01-01", endDate: "" }],
    });
    expect(input.prepayments![0]).not.toHaveProperty("endDate");
    expect(() => calculate(input)).not.toThrow();
  });
});
