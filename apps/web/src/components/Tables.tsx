import type { CalculationResult } from "@tuaka/engine";
import { groupDigits, longDate, money, termText } from "../format";

const nonZero = (v: string) => v !== "0.00" && Number(v) !== 0;

export function AnnualTable({ result }: { result: CalculationResult }) {
  const { annual, summary } = result;
  const hasLtv = annual.some((r) => r.ltvPct !== null);
  const hasExtra = nonZero(summary.totalExtra);
  const hasExpenses = nonZero(summary.totalExpenses);
  return (
    <div className="table-wrap">
      <table className="num-table">
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Payments</th>
            <th scope="col" className="c-interest">Interest</th>
            <th scope="col" className="c-principal">Principal</th>
            {hasExtra && <th scope="col" className="c-extra" title="Included in Principal">of which extra</th>}
            <th scope="col">Total</th>
            {hasExpenses && <th scope="col">Expenses</th>}
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
              {hasExtra && <td>{groupDigits(r.extraPrincipal)}</td>}
              <td>{groupDigits(r.total)}</td>
              {hasExpenses && <td>{groupDigits(r.expenses)}</td>}
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
            {hasExtra && <td>{groupDigits(summary.totalExtra)}</td>}
            <td>{groupDigits(summary.totalPaid)}</td>
            {hasExpenses && <td>{groupDigits(summary.totalExpenses)}</td>}
            {hasLtv && <td />}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function PaymentsTable({ result }: { result: CalculationResult }) {
  const { rows, summary, input } = result;
  const hasLtv = rows.some((r) => r.ltvPct !== null);
  const hasExtra = nonZero(summary.totalExtra);
  const hasExpenses = nonZero(summary.totalExpenses);
  const hasRateChanges = input.rateChanges.length > 0;
  return (
    <div className="table-wrap tall">
      <table className="num-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Date</th>
            {hasRateChanges && <th scope="col">Rate %</th>}
            <th scope="col">Payment</th>
            <th scope="col" className="c-interest">Interest</th>
            <th scope="col" className="c-principal">Principal</th>
            {hasExtra && <th scope="col" className="c-extra">Extra</th>}
            {hasExpenses && <th scope="col">Expenses</th>}
            {(hasExtra || hasExpenses) && <th scope="col">Outgoing</th>}
            {hasLtv && <th scope="col">LTV %</th>}
            <th scope="col">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const rateChanged = hasRateChanges && i > 0 && rows[i - 1]!.annualRatePct !== r.annualRatePct;
            return (
              <tr key={r.period} className={rateChanged ? "rate-changed" : undefined}>
                <th scope="row">{r.period}</th>
                <td className="left">{longDate(r.date)}</td>
                {hasRateChanges && <td>{r.annualRatePct}</td>}
                <td>{groupDigits(r.payment)}</td>
                <td>{groupDigits(r.interest)}</td>
                <td>{groupDigits(r.principal)}</td>
                {hasExtra && <td>{nonZero(r.extraPrincipal) ? groupDigits(r.extraPrincipal) : ""}</td>}
                {hasExpenses && <td>{groupDigits(r.expenses)}</td>}
                {(hasExtra || hasExpenses) && <td>{groupDigits(r.totalOutgoing)}</td>}
                {hasLtv && <td>{r.ltvPct}</td>}
                <td>{groupDigits(r.closingBalance)}</td>
              </tr>
            );
          })}
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

type Card = { label: string; value: string; note?: string | undefined; tone?: "good" };

export function SummaryPanel({ result }: { result: CalculationResult }) {
  const { summary: s, input, meta, warnings } = result;
  const c = input.currency;
  const cards: Card[] = [
    { label: "Monthly payment", value: money(s.regularPayment, c) },
  ];
  if (s.firstMonthOutgoing !== s.regularPayment) {
    cards.push({ label: "First month in total", value: money(s.firstMonthOutgoing, c), note: "payment + extra + expenses" });
  }
  cards.push(
    {
      label: "Final payment",
      value: money(s.finalPayment, c),
      note: warnings.some((w) => w.code === "final_payment_differs") ? "resized to clear the balance" : undefined,
    },
    { label: "Number of payments", value: String(s.numberOfPayments), note: termText(s.numberOfPayments) },
    { label: "Paid off", value: longDate(s.payoffDate), note: `first payment ${longDate(s.firstPaymentDate)}` },
  );
  if (s.interestSaved !== null && s.baseline) {
    cards.push({
      label: "Interest saved",
      value: money(s.interestSaved, c),
      note: s.monthsSaved ? `${termText(s.monthsSaved)} sooner than without overpayments` : "versus no overpayments",
      tone: "good",
    });
  }
  cards.push(
    { label: "Total interest", value: money(s.totalInterest, c) },
    { label: "APR", value: `${s.aprPct}%`, note: `APRC (effective) ${s.aprcPct}%` },
  );
  if (s.loanAmount !== result.solved.principal) {
    cards.push({ label: "Loan amount", value: money(s.loanAmount, c), note: "includes fees added to the loan" });
  }
  if (nonZero(s.totalExtra)) cards.push({ label: "Total overpaid", value: money(s.totalExtra, c) });
  if (nonZero(s.totalExpenses)) cards.push({ label: "Total expenses", value: money(s.totalExpenses, c) });
  if (nonZero(s.totalFixedCosts)) {
    cards.push({ label: "Up-front costs", value: money(s.totalFixedCosts, c), note: nonZero(s.upfrontCosts) ? `${money(s.upfrontCosts, c)} paid at the start` : "all added to the loan" });
  }
  cards.push(
    { label: "Total loan repayments", value: money(s.totalPaid, c) },
    ...(s.totalCostOfOwnership !== s.totalPaid
      ? [{ label: "Total cost", value: money(s.totalCostOfOwnership, c), note: "repayments + expenses + up-front costs" }]
      : []),
    {
      label: "Starting LTV",
      value: s.initialLtvPct === null ? "—" : `${s.initialLtvPct}%`,
      note: s.initialLtvPct === null ? "add a property value" : undefined,
    },
  );

  return (
    <div className="summary">
      <dl className="cards">
        {cards.map((card) => (
          <div key={card.label} className={`card${card.tone === "good" ? " good" : ""}`}>
            <dt>{card.label}</dt>
            <dd>{card.value}</dd>
            {card.note && <dd className="note">{card.note}</dd>}
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
