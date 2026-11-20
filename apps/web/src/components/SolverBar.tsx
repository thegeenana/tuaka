import { daysInMonth, formatIsoDate, type CalculationResult, type SolveFor } from "@tuaka/engine";
import { useId, type ReactNode } from "react";
import { MONTHS, currencySymbol, groupDigits, termText } from "../format";
import { useLoanStore } from "../store";

interface RowProps {
  field: SolveFor;
  label: string;
  solving: boolean;
  onSolve(): void;
  slider: ReactNode;
  value: ReactNode;
  invalid: boolean;
  extra?: ReactNode;
}

function SolverRow({ field, label, solving, onSolve, slider, value, invalid, extra }: RowProps) {
  const id = useId();
  return (
    <div className={`solver-row${solving ? " is-solving" : ""}${invalid ? " is-invalid" : ""}`} data-field={field}>
      <label className="solve-radio" title={`Solve for ${label.toLowerCase()}`}>
        <input type="radio" name="solve-for" checked={solving} onChange={onSolve} aria-describedby={id} />
        <span className="sr-only">Solve for {label}</span>
      </label>
      <div className="solver-label" id={id}>
        <span>{label}</span>
        {solving && <span className="badge">Solving</span>}
      </div>
      <div className="solver-slider">{slider}</div>
      <div className="solver-value">{value}</div>
      <div className="solver-extra">{extra}</div>
    </div>
  );
}

const clampStep = (n: number) => (Number.isFinite(n) ? n : 0);

export function SolverBar({ result, errorField }: { result: CalculationResult | null; errorField?: string | undefined }) {
  const s = useLoanStore();
  const solved = result?.solved;
  const sym = currencySymbol(s.currency);

  const switchTo = (next: SolveFor) => {
    if (next === s.solveFor) return;
    // Write the current answer into the field we stop solving, so the loan stays the same.
    const carry: Parameters<typeof s.setSolveFor>[1] = {};
    if (solved) {
      if (s.solveFor === "principal") carry.principal = solved.principal;
      if (s.solveFor === "rate") carry.annualRatePct = solved.annualRatePct;
      if (s.solveFor === "term") carry.termMonths = solved.termMonths;
      if (s.solveFor === "payment") carry.payment = solved.payment;
    }
    s.setSolveFor(next, carry);
  };

  const principalShown = s.solveFor === "principal" ? (solved?.principal ?? "") : s.principal;
  const rateShown = s.solveFor === "rate" ? (solved?.annualRatePct ?? "") : s.annualRatePct;
  const termShown = s.solveFor === "term" ? (solved?.termMonths ?? 0) : s.termMonths;
  const paymentShown = s.solveFor === "payment" ? (solved?.payment ?? "") : s.payment;

  const [startYear, startMonth, startDay] = s.startDate.split("-").map(Number) as [number, number, number];
  // Keep the chosen day of month, clamped to the new month's length.
  const setStart = (y: number, m: number) =>
    s.setStartDate(formatIsoDate({ y, m, d: Math.min(startDay || 1, daysInMonth(y, m)) }));

  return (
    <section className="solver" aria-label="Loan solver">
      <SolverRow
        field="principal"
        label="Principal"
        solving={s.solveFor === "principal"}
        onSolve={() => switchTo("principal")}
        invalid={errorField === "principal"}
        slider={
          <input
            type="range"
            className="range range-principal"
            min={0}
            max={s.principalMax}
            step={s.principalMax / 1000}
            value={clampStep(Number(principalShown))}
            disabled={s.solveFor === "principal"}
            onChange={(e) => s.setPrincipal(e.target.value)}
            aria-label="Principal"
          />
        }
        value={
          s.solveFor === "principal" ? (
            <output className="solved-value">{sym}{groupDigits(principalShown)}</output>
          ) : (
            <span className="field-with-unit">
              <span className="unit">{sym}</span>
              <input inputMode="decimal" value={s.principal} onChange={(e) => s.setPrincipal(e.target.value)} aria-label="Principal amount" />
            </span>
          )
        }
        extra={
          <span className="rescale" role="group" aria-label="Principal slider range">
            <button type="button" onClick={() => s.rescale("principalMax", "down")} title="Narrow the slider range">÷10</button>
            <button type="button" onClick={() => s.rescale("principalMax", "up")} title="Widen the slider range">×10</button>
          </span>
        }
      />

      <SolverRow
        field="rate"
        label="Interest"
        solving={s.solveFor === "rate"}
        onSolve={() => switchTo("rate")}
        invalid={errorField === "annualRatePct"}
        slider={
          <input
            type="range"
            className="range range-rate"
            min={0}
            max={20}
            step={0.01}
            value={clampStep(Number(rateShown))}
            disabled={s.solveFor === "rate"}
            onChange={(e) => s.setAnnualRatePct(e.target.value)}
            aria-label="Interest rate"
          />
        }
        value={
          s.solveFor === "rate" ? (
            <output className="solved-value">{Number(rateShown).toFixed(3)}%</output>
          ) : (
            <span className="field-with-unit">
              <input inputMode="decimal" value={s.annualRatePct} onChange={(e) => s.setAnnualRatePct(e.target.value)} aria-label="Annual interest rate, percent" />
              <span className="unit">%</span>
            </span>
          )
        }
      />

      <SolverRow
        field="term"
        label="Term"
        solving={s.solveFor === "term"}
        onSolve={() => switchTo("term")}
        invalid={errorField === "termMonths"}
        slider={
          <input
            type="range"
            className="range range-term"
            min={12}
            max={480}
            step={12}
            value={termShown}
            disabled={s.solveFor === "term"}
            onChange={(e) => s.setTermMonths(Number(e.target.value))}
            aria-label="Term"
          />
        }
        value={
          s.solveFor === "term" ? (
            <output className="solved-value">{termText(termShown)}</output>
          ) : (
            <span className="field-with-unit">
              <input
                inputMode="numeric"
                value={String(s.termMonths / 12).replace(/\.0+$/, "")}
                onChange={(e) => {
                  const years = Number(e.target.value);
                  if (Number.isFinite(years) && years > 0) s.setTermMonths(Math.round(years * 12));
                }}
                aria-label="Term in years"
              />
              <span className="unit">years</span>
            </span>
          )
        }
        extra={
          <span className="start" role="group" aria-label="First payment">
            <select value={startMonth} onChange={(e) => setStart(startYear, Number(e.target.value))} aria-label="First payment month">
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <select value={startYear} onChange={(e) => setStart(Number(e.target.value), startMonth)} aria-label="First payment year">
              {Array.from({ length: 41 }, (_, i) => 2010 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </span>
        }
      />

      <SolverRow
        field="payment"
        label="Payment"
        solving={s.solveFor === "payment"}
        onSolve={() => switchTo("payment")}
        invalid={errorField === "payment"}
        slider={
          <input
            type="range"
            className="range range-payment"
            min={0}
            max={s.paymentMax}
            step={s.paymentMax / 5000}
            value={clampStep(Number(paymentShown))}
            disabled={s.solveFor === "payment"}
            onChange={(e) => s.setPayment(e.target.value)}
            aria-label="Monthly payment"
          />
        }
        value={
          s.solveFor === "payment" ? (
            <output className="solved-value">{sym}{groupDigits(paymentShown)}<small> /month</small></output>
          ) : (
            <span className="field-with-unit">
              <span className="unit">{sym}</span>
              <input inputMode="decimal" value={s.payment} onChange={(e) => s.setPayment(e.target.value)} aria-label="Monthly payment" />
            </span>
          )
        }
        extra={
          <span className="rescale" role="group" aria-label="Payment slider range">
            <button type="button" onClick={() => s.rescale("paymentMax", "down")} title="Narrow the slider range">÷10</button>
            <button type="button" onClick={() => s.rescale("paymentMax", "up")} title="Widen the slider range">×10</button>
          </span>
        }
      />
    </section>
  );
}
