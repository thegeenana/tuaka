import Decimal from "decimal.js";
import type { LoanInput, RoundingMode, SolveFor } from "@tuaka/engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Everything the user has typed, as strings exactly as entered.
 * The solved field keeps its last typed value but is ignored by the engine.
 */
export interface LoanFormState {
  solveFor: SolveFor;
  principal: string;
  annualRatePct: string;
  termMonths: number;
  payment: string;
  startDate: string;
  propertyValue: string;
  downPayment: string;
  roundingMode: RoundingMode;
  currency: string;
  /** Upper end of the principal slider; the ↑/↓ buttons rescale it. */
  principalMax: number;
  paymentMax: number;
}

export interface LoanFormActions {
  setSolveFor(next: SolveFor, solvedValues?: Partial<Pick<LoanFormState, "principal" | "annualRatePct" | "termMonths" | "payment">>): void;
  setPrincipal(value: string): void;
  setAnnualRatePct(value: string): void;
  setTermMonths(value: number): void;
  setPayment(value: string): void;
  setStartDate(value: string): void;
  setPropertyValue(value: string): void;
  setDownPayment(value: string): void;
  setDownPaymentPct(value: string): void;
  setRoundingMode(value: RoundingMode): void;
  setCurrency(value: string): void;
  rescale(field: "principalMax" | "paymentMax", direction: "up" | "down"): void;
  reset(): void;
}

export const DEFAULTS: LoanFormState = {
  solveFor: "payment",
  principal: "100000",
  annualRatePct: "5",
  termMonths: 360,
  payment: "536.82",
  startDate: "2024-08-01",
  propertyValue: "100000",
  downPayment: "",
  roundingMode: "half_up",
  currency: "GBP",
  principalMax: 1_000_000,
  paymentMax: 5_000,
};

const isNumber = (v: string) => /^\d+(\.\d+)?$/.test(v.trim());

/** Principal = property value − down payment, when both are usable numbers. */
function principalFrom(property: string, down: string): string | null {
  if (!isNumber(property)) return null;
  const d = isNumber(down) ? new Decimal(down) : new Decimal(0);
  const p = new Decimal(property).minus(d);
  return p.gt(0) ? p.toFixed() : null;
}

export const useLoanStore = create<LoanFormState & LoanFormActions>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      setSolveFor(next, solvedValues) {
        // Carry the current answer into the field that stops being solved,
        // so switching what you solve for never changes the loan itself.
        set({ ...solvedValues, solveFor: next });
      },

      setPrincipal(value) {
        const { propertyValue } = get();
        let downPayment = get().downPayment;
        if (isNumber(propertyValue) && isNumber(value)) {
          const down = new Decimal(propertyValue).minus(value);
          downPayment = down.gt(0) ? down.toFixed() : "";
        }
        set({ principal: value, downPayment });
      },

      setAnnualRatePct: (value) => set({ annualRatePct: value }),
      setTermMonths: (value) => set({ termMonths: value }),
      setPayment: (value) => set({ payment: value }),
      setStartDate: (value) => set({ startDate: value }),

      setPropertyValue(value) {
        const principal = principalFrom(value, get().downPayment);
        set(principal && get().solveFor !== "principal" ? { propertyValue: value, principal } : { propertyValue: value });
      },

      setDownPayment(value) {
        const principal = principalFrom(get().propertyValue, value);
        set(principal && get().solveFor !== "principal" ? { downPayment: value, principal } : { downPayment: value });
      },

      setDownPaymentPct(value) {
        const { propertyValue } = get();
        if (!isNumber(propertyValue) || !isNumber(value)) return;
        const down = new Decimal(propertyValue).mul(value).div(100).toDecimalPlaces(2).toFixed();
        get().setDownPayment(down);
      },

      setRoundingMode: (value) => set({ roundingMode: value }),
      setCurrency: (value) => set({ currency: value }),

      rescale(field, direction) {
        const current = get()[field];
        const next = direction === "up" ? current * 10 : current / 10;
        if (next >= 1_000 && next <= 100_000_000) set({ [field]: next } as Partial<LoanFormState>);
      },

      reset: () => set(DEFAULTS),
    }),
    {
      name: "tuaka.scenario.v1",
      // Storage can be unavailable (private mode, blocked cookies); the app still works without it.
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          return undefined as unknown as Storage;
        }
      }),
      // Persist data only, never the action functions.
      partialize: (s) =>
        Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, s[k as keyof LoanFormState]])) as Partial<LoanFormState>,
    },
  ),
);

/** The engine input for the current form state. */
export function toLoanInput(s: LoanFormState): LoanInput {
  return {
    solveFor: s.solveFor,
    principal: s.principal.trim(),
    annualRatePct: s.annualRatePct.trim(),
    termMonths: s.termMonths,
    payment: s.payment.trim(),
    startDate: s.startDate,
    propertyValue: s.propertyValue.trim() || undefined,
    roundingMode: s.roundingMode,
    currency: s.currency,
  };
}
