import type { CalculationResult } from "@tuaka/engine";
import { groupDigits, longDate, money, termText } from "../format";

export function AnnualTable({ result }: { result: CalculationResult }) {
  const { annual, summary } = result;
  const hasLtv = annual.some((r) => r.ltvPct !== null);
  return (
    <div className="table-wrap">
      <table className="num-table">
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Payments</th>
            <th scope="col" className="c-interest">Interest</th>
            <th scope="col" className="c-principal">Principal</th>
            <th scope="col">Total</th>
            {hasLtv && <th scope="col">LTV %</th>}
            <th scope="col">Balance</th>
          </tr>
        </thead>
        <tbody>
          {annual.map((r) => (
            <tr key={r.year}>
              <th scope="row">{r.year}</th>
              <td>{r.payments}</td>
              <td>{groupDigits(r.interest)}</td>
              <td>{groupDigits(r.principal)}</td>
              <td>{groupDigits(r.total)}</td>
              {hasLtv && <td>{r.ltvPct}</td>}
              <td>{groupDigits(r.closingBalance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td>{summary.numberOfPayments}</td>
            <td>{groupDigits(summary.totalInterest)}</td>
            <td>{groupDigits(summary.totalPrincipal)}</td>
            <td>{groupDigits(summary.totalPaid)}</td>
            {hasLtv && <td />}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function PaymentsTable({ result }: { result: CalculationResult }) {
  const hasLtv = result.rows.some((r) => r.ltvPct !== null);
  return (
    <div className="table-wrap tall">
      <table className="num-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Date</th>
            <th scope="col">Payment</th>
            <th scope="col" className="c-interest">Interest</th>
            <th scope="col" className="c-principal">Principal</th>
            {hasLtv && <th scope="col">LTV %</th>}
            <th scope="col">Balance</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.period}>
              <th scope="row">{r.period}</th>
              <td className="left">{longDate(r.date)}</td>
              <td>{groupDigits(r.payment)}</td>
              <td>{groupDigits(r.interest)}</td>
              <td>{groupDigits(r.principal)}</td>
              {hasLtv && <td>{r.ltvPct}</td>}
              <td>{groupDigits(r.closingBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ROUNDING_TEXT = {
  half_up: "Penny-rounded every month, as a lender bills",
  half_even: "Penny-rounded every month (banker's rounding)",
  none: "Exact, rounded only for display",
} as const;

export function SummaryPanel({ result }: { result: CalculationResult }) {
  const { summary, input, meta, warnings } = result;
  const c = input.currency;
  const cards: Array<[string, string, string?]> = [
    ["Monthly payment", money(summary.regularPayment, c)],
    ["Final payment", money(summary.finalPayment, c), summary.finalPayment !== summary.regularPayment ? "resized to clear the balance" : undefined],
    ["Number of payments", String(summary.numberOfPayments), termText(summary.numberOfPayments)],
    ["First payment", longDate(summary.firstPaymentDate)],
    ["Paid off", longDate(summary.payoffDate)],
    ["Total interest", money(summary.totalInterest, c)],
    ["Total repaid", money(summary.totalPaid, c)],
    ["Starting LTV", summary.initialLtvPct === null ? "—" : `${summary.initialLtvPct}%`, summary.initialLtvPct === null ? "add a property value" : undefined],
  ];
  return (
    <div className="summary">
      <dl className="cards">
        {cards.map(([label, value, note]) => (
          <div key={label} className="card">
            <dt>{label}</dt>
            <dd>{value}</dd>
            {note && <dd className="note">{note}</dd>}
          </div>
        ))}
      </dl>
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={w.code}>{w.message}</li>
          ))}
        </ul>
      )}
      <p className="provenance">
        {ROUNDING_TEXT[input.roundingMode]}. Engine {meta.engineVersion} · input{" "}
        <code title={meta.inputHash}>{meta.inputHash.slice(0, 12)}</code>
      </p>
    </div>
  );
}
