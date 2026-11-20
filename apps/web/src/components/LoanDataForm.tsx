import Decimal from "decimal.js";
import type { CalculationResult, RoundingMode } from "@tuaka/engine";
import { termText } from "../format";
import { useLoanStore } from "../store";

const isNumber = (v: string) => /^\d+(\.\d+)?$/.test(v.trim());

function Field({ label, children, hint, invalid }: { label: string; children: React.ReactNode; hint?: string; invalid?: boolean }) {
  return (
    <label className={`field${invalid ? " is-invalid" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function LoanDataForm({ result, errorField }: { result: CalculationResult | null; errorField?: string | undefined }) {
  const s = useLoanStore();
  const solved = result?.solved;

  const downPct =
    isNumber(s.propertyValue) && isNumber(s.downPayment) && !new Decimal(s.propertyValue).isZero()
      ? new Decimal(s.downPayment).div(s.propertyValue).mul(100).toDecimalPlaces(2).toFixed()
      : "";

  return (
    <form className="loan-form" onSubmit={(e) => e.preventDefault()} aria-label="Loan data">
      <fieldset>
        <legend>Property</legend>
        <Field label="Property value" invalid={errorField === "propertyValue"}>
          <input inputMode="decimal" value={s.propertyValue} onChange={(e) => s.setPropertyValue(e.target.value)} />
        </Field>
        <Field label="Down payment">
          <input inputMode="decimal" value={s.downPayment} onChange={(e) => s.setDownPayment(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Down payment %">
          <input inputMode="decimal" value={downPct} onChange={(e) => s.setDownPaymentPct(e.target.value)} placeholder="0" />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Loan</legend>
        <Field label="Principal" invalid={errorField === "principal"} hint={s.solveFor === "principal" ? "Solved" : undefined}>
          <input
            inputMode="decimal"
            value={s.solveFor === "principal" ? (solved?.principal ?? "") : s.principal}
            readOnly={s.solveFor === "principal"}
            onChange={(e) => s.setPrincipal(e.target.value)}
          />
        </Field>
        <Field label="Interest % a year" invalid={errorField === "annualRatePct"} hint={s.solveFor === "rate" ? "Solved" : undefined}>
          <input
            inputMode="decimal"
            value={s.solveFor === "rate" ? (solved?.annualRatePct ?? "") : s.annualRatePct}
            readOnly={s.solveFor === "rate"}
            onChange={(e) => s.setAnnualRatePct(e.target.value)}
          />
        </Field>
        <Field
          label="Term (months)"
          invalid={errorField === "termMonths"}
          hint={s.solveFor === "term" ? `Solved · ${termText(solved?.termMonths ?? 0)}` : termText(s.termMonths)}
        >
          <input
            inputMode="numeric"
            value={s.solveFor === "term" ? String(solved?.termMonths ?? "") : String(s.termMonths)}
            readOnly={s.solveFor === "term"}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n > 0) s.setTermMonths(n);
            }}
          />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Payments</legend>
        <Field label="Monthly payment" invalid={errorField === "payment"} hint={s.solveFor === "payment" ? "Solved" : undefined}>
          <input
            inputMode="decimal"
            value={s.solveFor === "payment" ? (solved?.payment ?? "") : s.payment}
            readOnly={s.solveFor === "payment"}
            onChange={(e) => s.setPayment(e.target.value)}
          />
        </Field>
        <Field label="First payment" invalid={errorField === "startDate"}>
          <input type="date" value={s.startDate} onChange={(e) => e.target.value && s.setStartDate(e.target.value)} />
        </Field>
        <Field label="Rounding">
          <select value={s.roundingMode} onChange={(e) => s.setRoundingMode(e.target.value as RoundingMode)}>
            <option value="half_up">Lender: round to the penny</option>
            <option value="none">Exact: like most calculators</option>
            <option value="half_even">Lender: banker's rounding</option>
          </select>
        </Field>
        <Field label="Currency">
          <select value={s.currency} onChange={(e) => s.setCurrency(e.target.value)}>
            {["GBP", "USD", "EUR", "GHS", "NGN", "KES"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
      </fieldset>
    </form>
  );
}
