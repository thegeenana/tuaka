import Decimal from "decimal.js";
import type {
  ExpenseInput,
  FixedCostInput,
  LoanInput,
  PrepaymentInput,
  RateChangeInput,
  RoundingMode,
  SolveFor,
} from "@tuaka/engine";
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
  expenses: ExpenseRow[];
  prepayments: PrepaymentRow[];
  fixedCosts: FixedCostRow[];
  rateChanges: RateChangeRow[];
}

/** Each editable row carries a local id for React keys; ids never reach the engine. */
export type ExpenseRow = ExpenseInput & { id: string };
export type PrepaymentRow = PrepaymentInput & { id: string };
export type FixedCostRow = FixedCostInput & { id: string };
export type RateChangeRow = RateChangeInput & { id: string };

export interface ListRows {
  expenses: ExpenseRow;
  prepayments: PrepaymentRow;
  fixedCosts: FixedCostRow;
  rateChanges: RateChangeRow;
}
export type ListKey = keyof ListRows;

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
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
  addRow<K extends ListKey>(key: K, row: Omit<ListRows[K], "id">): void;
  updateRow<K extends ListKey>(key: K, id: string, patch: Partial<ListRows[K]>): void;
  removeRow(key: ListKey, id: string): void;
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
  expenses: [],
  prepayments: [],
  fixedCosts: [],
  rateChanges: [],
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

      addRow(key, row) {
        set({ [key]: [...get()[key], { ...row, id: newId() }] } as Partial<LoanFormState>);
      },
      updateRow(key, id, patch) {
        set({ [key]: (get()[key] as Array<{ id: string }>).map((r) => (r.id === id ? { ...r, ...patch } : r)) } as Partial<LoanFormState>);
      },
      removeRow(key, id) {
        set({ [key]: (get()[key] as Array<{ id: string }>).filter((r) => r.id !== id) } as Partial<LoanFormState>);
      },

      reset: () => set(DEFAULTS),
    }),
    {
      name: "tuaka.scenario.v1",
      version: 2,
      // v1 had no modifier lists; start them empty.
      migrate: (persisted) => ({ ...DEFAULTS, ...(persisted as Partial<LoanFormState>) }),
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

const filled = (v: string | undefined) => v !== undefined && v.trim() !== "";
/** Drop the UI id and blank optional fields. */
function strip<T extends { id: string }>(row: T): Omit<T, "id"> {
  const { id: _id, ...rest } = row;
  void _id;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== "" && v !== undefined)) as Omit<T, "id">;
}

/**
 * The engine input for the current form state. Rows still being typed
 * (no amount, rate or date yet) are left out rather than raising an error.
 */
export function toLoanInput(s: LoanFormState): LoanInput {
  return {
    expenses: s.expenses.filter((r) => filled(r.amount)).map(strip),
    prepayments: s.prepayments.filter((r) => filled(r.amount) && filled(r.date)).map(strip),
    fixedCosts: s.fixedCosts.filter((r) => filled(r.amount)).map(strip),
    rateChanges: s.rateChanges.filter((r) => filled(r.annualRatePct) && filled(r.effectiveDate)).map(strip),
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
