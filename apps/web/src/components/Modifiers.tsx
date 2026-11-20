import { addMonths, formatIsoDate, parseIsoDate, type ExpenseKind, type FixedCostKind } from "@tuaka/engine";
import type { ReactNode } from "react";
import { currencySymbol } from "../format";
import { useLoanStore, type ExpenseRow, type FixedCostRow, type PrepaymentRow, type RateChangeRow } from "../store";

const EXPENSE_KINDS: Array<[ExpenseKind, string]> = [
  ["property_tax", "Property tax / council tax"],
  ["insurance", "Buildings insurance"],
  ["mortgage_insurance", "Mortgage insurance"],
  ["service_charge", "Service charge"],
  ["ground_rent", "Ground rent"],
  ["hoa", "HOA / estate fee"],
  ["other", "Other"],
];

const FIXED_KINDS: Array<[FixedCostKind, string]> = [
  ["arrangement_fee", "Arrangement / product fee"],
  ["points", "Points"],
  ["valuation", "Valuation fee"],
  ["legal", "Legal / conveyancing"],
  ["broker", "Broker fee"],
  ["stamp_duty", "Stamp duty"],
  ["other", "Other"],
];

function monthsAfterStart(startDate: string, months: number): string {
  try {
    return formatIsoDate(addMonths(parseIsoDate(startDate), months));
  } catch {
    return "";
  }
}

function Intro({ children }: { children: ReactNode }) {
  return <p className="intro">{children}</p>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

function RemoveButton({ onClick, label }: { onClick(): void; label: string }) {
  return (
    <button type="button" className="icon-button" onClick={onClick} aria-label={label} title={label}>
      ×
    </button>
  );
}

function Cell({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`cell${wide ? " wide" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function ExpensesEditor() {
  const { expenses, addRow, updateRow, removeRow, currency, propertyValue } = useLoanStore();
  const sym = currencySymbol(currency);
  const update = (id: string, patch: Partial<ExpenseRow>) => updateRow("expenses", id, patch);
  return (
    <div className="editor">
      <Intro>
        Running costs of owning the property. They add to what you pay each month but never change the loan balance.
        Yearly amounts are spread evenly across the 12 months.
      </Intro>
      {expenses.length === 0 && <Empty>No expenses yet.</Empty>}
      {expenses.map((e) => (
        <div className="editor-row" key={e.id}>
          <Cell label="Type">
            <select value={e.kind} onChange={(ev) => update(e.id, { kind: ev.target.value as ExpenseKind })}>
              {EXPENSE_KINDS.map(([k, t]) => (
                <option key={k} value={k}>{t}</option>
              ))}
            </select>
          </Cell>
          <Cell label={e.basis === "pct_of_property" ? "% of property value" : `Amount (${sym})`}>
            <input inputMode="decimal" value={e.amount} onChange={(ev) => update(e.id, { amount: ev.target.value })} placeholder="0" />
          </Cell>
          <Cell label="Based on">
            <select value={e.basis ?? "amount"} onChange={(ev) => update(e.id, { basis: ev.target.value as ExpenseRow["basis"] })}>
              <option value="amount">Fixed amount</option>
              <option value="pct_of_property" disabled={!propertyValue.trim()}>% of property value</option>
            </select>
          </Cell>
          <Cell label="Every">
            <select value={e.frequency ?? "monthly"} onChange={(ev) => update(e.id, { frequency: ev.target.value as ExpenseRow["frequency"] })}>
              <option value="monthly">Month</option>
              <option value="yearly">Year</option>
            </select>
          </Cell>
          <Cell label="Rises % a year">
            <input inputMode="decimal" value={e.escalationPct ?? ""} onChange={(ev) => update(e.id, { escalationPct: ev.target.value })} placeholder="0" />
          </Cell>
          <Cell label="Stop at LTV %">
            <input
              inputMode="decimal"
              value={e.stopAtLtvPct ?? ""}
              onChange={(ev) => update(e.id, { stopAtLtvPct: ev.target.value })}
              placeholder={e.kind === "mortgage_insurance" ? "e.g. 78" : "never"}
              disabled={!propertyValue.trim()}
              title={propertyValue.trim() ? undefined : "Add a property value to use this"}
            />
          </Cell>
          <RemoveButton onClick={() => removeRow("expenses", e.id)} label="Remove expense" />
        </div>
      ))}
      <button
        type="button"
        className="add"
        onClick={() => addRow("expenses", { kind: "property_tax", amount: "", basis: "amount", frequency: "yearly" })}
      >
        + Add expense
      </button>
    </div>
  );
}

function PrepaymentRows({ kind }: { kind: "one_off" | "recurring" }) {
  const { prepayments, addRow, updateRow, removeRow, currency, startDate } = useLoanStore();
  const sym = currencySymbol(currency);
  const rows = prepayments.filter((p) => p.kind === kind);
  const update = (id: string, patch: Partial<PrepaymentRow>) => updateRow("prepayments", id, patch);
  return (
    <div className="editor">
      {kind === "one_off" ? (
        <Intro>
          A lump sum paid off the balance once, with the first payment on or after the date. Choose whether to finish
          sooner (keep the payment) or keep the end date and pay less each month.
        </Intro>
      ) : (
        <Intro>
          A regular overpayment on top of the monthly payment, from a start date until an optional end date. Many UK
          lenders allow up to 10% of the balance a year without an early repayment charge.
        </Intro>
      )}
      {rows.length === 0 && <Empty>{kind === "one_off" ? "No lump sums yet." : "No regular overpayments yet."}</Empty>}
      {rows.map((p) => (
        <div className="editor-row" key={p.id}>
          <Cell label={`Amount (${sym})`}>
            <input inputMode="decimal" value={p.amount} onChange={(ev) => update(p.id, { amount: ev.target.value })} placeholder="0" />
          </Cell>
          {kind === "recurring" && (
            <Cell label="Every">
              <select value={p.frequency ?? "monthly"} onChange={(ev) => update(p.id, { frequency: ev.target.value as PrepaymentRow["frequency"] })}>
                <option value="monthly">Month</option>
                <option value="yearly">Year</option>
              </select>
            </Cell>
          )}
          <Cell label={kind === "one_off" ? "Date" : "From"}>
            <input type="date" value={p.date} onChange={(ev) => update(p.id, { date: ev.target.value })} />
          </Cell>
          {kind === "recurring" && (
            <Cell label="Until (optional)">
              <input type="date" value={p.endDate ?? ""} onChange={(ev) => update(p.id, { endDate: ev.target.value })} />
            </Cell>
          )}
          <Cell label="Effect" wide>
            <select value={p.strategy ?? "reduce_term"} onChange={(ev) => update(p.id, { strategy: ev.target.value as PrepaymentRow["strategy"] })}>
              <option value="reduce_term">Finish sooner, same payment</option>
              <option value="reduce_payment">Same end date, lower payment</option>
            </select>
          </Cell>
          <RemoveButton onClick={() => removeRow("prepayments", p.id)} label="Remove" />
        </div>
      ))}
      <button
        type="button"
        className="add"
        onClick={() =>
          addRow(
            "prepayments",
            kind === "one_off"
              ? { kind, amount: "", date: monthsAfterStart(startDate, 12), strategy: "reduce_term" }
              : { kind, amount: "", date: startDate, frequency: "monthly", strategy: "reduce_term" },
          )
        }
      >
        {kind === "one_off" ? "+ Add lump sum" : "+ Add regular overpayment"}
      </button>
    </div>
  );
}

export const PrepaymentEditor = () => <PrepaymentRows kind="one_off" />;
export const ExtraEditor = () => <PrepaymentRows kind="recurring" />;

export function FixedCostsEditor() {
  const { fixedCosts, addRow, updateRow, removeRow, currency } = useLoanStore();
  const sym = currencySymbol(currency);
  const update = (id: string, patch: Partial<FixedCostRow>) => updateRow("fixedCosts", id, patch);
  return (
    <div className="editor">
      <Intro>
        One-off costs of taking the loan. Fees can be paid up front or added to the loan. Costs of credit count towards
        the APR; taxes such as stamp duty don't, by default.
      </Intro>
      {fixedCosts.length === 0 && <Empty>No up-front costs yet.</Empty>}
      {fixedCosts.map((c) => (
        <div className="editor-row" key={c.id}>
          <Cell label="Type" wide>
            <select
              value={c.kind}
              onChange={(ev) => {
                const kind = ev.target.value as FixedCostKind;
                update(c.id, { kind, inApr: kind !== "stamp_duty" });
              }}
            >
              {FIXED_KINDS.map(([k, t]) => (
                <option key={k} value={k}>{t}</option>
              ))}
            </select>
          </Cell>
          <Cell label={`Amount (${sym})`}>
            <input inputMode="decimal" value={c.amount} onChange={(ev) => update(c.id, { amount: ev.target.value })} placeholder="0" />
          </Cell>
          <label className="check">
            <input type="checkbox" checked={c.financed === true} onChange={(ev) => update(c.id, { financed: ev.target.checked })} />
            Add to loan
          </label>
          <label className="check">
            <input type="checkbox" checked={c.inApr ?? c.kind !== "stamp_duty"} onChange={(ev) => update(c.id, { inApr: ev.target.checked })} />
            Count in APR
          </label>
          <RemoveButton onClick={() => removeRow("fixedCosts", c.id)} label="Remove cost" />
        </div>
      ))}
      <button type="button" className="add" onClick={() => addRow("fixedCosts", { kind: "arrangement_fee", amount: "", financed: false, inApr: true })}>
        + Add cost
      </button>
    </div>
  );
}

export function RateChangesEditor() {
  const { rateChanges, addRow, updateRow, removeRow, startDate } = useLoanStore();
  const update = (id: string, patch: Partial<RateChangeRow>) => updateRow("rateChanges", id, patch);
  return (
    <div className="editor">
      <Intro>
        A new interest rate from a date, for example when a 2- or 5-year fixed period ends and the lender's standard
        variable rate starts. By default the payment is recalculated so the loan still ends on time.
      </Intro>
      {rateChanges.length === 0 && <Empty>The rate stays the same for the whole loan.</Empty>}
      {rateChanges.map((r) => (
        <div className="editor-row" key={r.id}>
          <Cell label="From">
            <input type="date" value={r.effectiveDate} onChange={(ev) => update(r.id, { effectiveDate: ev.target.value })} />
          </Cell>
          <Cell label="New rate %">
            <input inputMode="decimal" value={r.annualRatePct} onChange={(ev) => update(r.id, { annualRatePct: ev.target.value })} placeholder="0" />
          </Cell>
          <label className="check">
            <input type="checkbox" checked={r.recast ?? true} onChange={(ev) => update(r.id, { recast: ev.target.checked })} />
            Recalculate payment
          </label>
          <RemoveButton onClick={() => removeRow("rateChanges", r.id)} label="Remove rate change" />
        </div>
      ))}
      <button
        type="button"
        className="add"
        onClick={() => addRow("rateChanges", { effectiveDate: monthsAfterStart(startDate, 24 * (rateChanges.length + 1)), annualRatePct: "", recast: true })}
      >
        + Add rate change
      </button>
    </div>
  );
}
