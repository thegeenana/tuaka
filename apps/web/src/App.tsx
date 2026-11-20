import { useMemo, useState } from "react";
import { LoanDataForm } from "./components/LoanDataForm";
import { ExpensesEditor, ExtraEditor, FixedCostsEditor, PrepaymentEditor, RateChangesEditor } from "./components/Modifiers";
import { ScheduleChart, type ChartView } from "./components/ScheduleChart";
import { SolverBar } from "./components/SolverBar";
import { AnnualTable, PaymentsTable, SummaryPanel } from "./components/Tables";
import { currencySymbol } from "./format";
import { toLoanInput, useLoanStore } from "./store";
import { useCalculation } from "./useCalculation";

type TableView = "annual" | "payments" | "summary";
type InputView = "loan" | "expenses" | "prepayment" | "extra" | "fixed" | "interest";

const CHART_TABS: Array<[ChartView, string]> = [
  ["amort", "Amort"],
  ["repay", "Repay"],
  ["balance", "Balance"],
  ["interest", "Interest"],
];
const TABLE_TABS: Array<[TableView, string]> = [
  ["annual", "Annual"],
  ["payments", "Payments"],
  ["summary", "Summary"],
];

function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  counts,
}: {
  tabs: Array<[T, string]>;
  value: T;
  onChange(v: T): void;
  label: string;
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div role="tablist" aria-label={label} className="tabs">
      {tabs.map(([key, text]) => (
        <button key={key} role="tab" type="button" aria-selected={value === key} className={value === key ? "active" : ""} onClick={() => onChange(key)}>
          {text}
          {counts?.[key] ? <span className="count">{counts[key]}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const state = useLoanStore();
  const input = useMemo(() => toLoanInput(state), [state]);
  const { result, error } = useCalculation(input);
  const [chartView, setChartView] = useState<ChartView>("amort");
  const [tableView, setTableView] = useState<TableView>("annual");
  const [inputView, setInputView] = useState<InputView>("loan");
  const inputTabs: Array<[InputView, string]> = [
    ["loan", "Loan data"],
    ["expenses", "Expenses"],
    ["prepayment", "Prepayment"],
    ["extra", "Extra"],
    ["fixed", "Fixed"],
    ["interest", "Interest"],
  ];
  const counts: Partial<Record<InputView, number>> = {
    expenses: state.expenses.length,
    prepayment: state.prepayments.filter((p) => p.kind === "one_off").length,
    extra: state.prepayments.filter((p) => p.kind === "recurring").length,
    fixed: state.fixedCosts.length,
    interest: state.rateChanges.length,
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" width="28" height="28" />
          <span className="name">TuaKa</span>
          <span className="tagline">See every payment until it's paid.</span>
        </div>
        <button type="button" className="ghost" onClick={state.reset}>Reset</button>
      </header>

      <SolverBar result={result} errorField={error?.field} />

      {error && (
        <div className="error" role="alert">
          {error.message}
          {result && <span className="muted"> Showing the last valid result.</span>}
        </div>
      )}

      {result && (
        <main className={`results${error ? " stale" : ""}`}>
          <section className="panel" aria-label="Chart">
            <Tabs<ChartView> tabs={CHART_TABS} value={chartView} onChange={setChartView} label="Chart views" />
            <ScheduleChart rows={result.rows} view={chartView} currencySymbol={currencySymbol(result.input.currency)} />
          </section>
          <section className="panel" aria-label="Schedule">
            <Tabs<TableView> tabs={TABLE_TABS} value={tableView} onChange={setTableView} label="Schedule views" />
            {tableView === "annual" && <AnnualTable result={result} />}
            {tableView === "payments" && <PaymentsTable result={result} />}
            {tableView === "summary" && <SummaryPanel result={result} />}
          </section>
        </main>
      )}

      <section className="panel" aria-label="Loan inputs">
        <Tabs<InputView> tabs={inputTabs} value={inputView} onChange={setInputView} label="Loan inputs" counts={counts} />
        {inputView === "loan" && <LoanDataForm result={result} errorField={error?.field} />}
        {inputView === "expenses" && <ExpensesEditor />}
        {inputView === "prepayment" && <PrepaymentEditor />}
        {inputView === "extra" && <ExtraEditor />}
        {inputView === "fixed" && <FixedCostsEditor />}
        {inputView === "interest" && <RateChangesEditor />}
      </section>

      <footer className="foot">
        Illustration only, not financial advice. Calculations run on your device; nothing is sent anywhere.
      </footer>
    </div>
  );
}
