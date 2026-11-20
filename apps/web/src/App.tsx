import { useMemo, useState } from "react";
import { LoanDataForm } from "./components/LoanDataForm";
import { ScheduleChart, type ChartView } from "./components/ScheduleChart";
import { SolverBar } from "./components/SolverBar";
import { AnnualTable, PaymentsTable, SummaryPanel } from "./components/Tables";
import { currencySymbol } from "./format";
import { toLoanInput, useLoanStore } from "./store";
import { useCalculation } from "./useCalculation";

type TableView = "annual" | "payments" | "summary";

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

function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Array<[T, string]>; value: T; onChange(v: T): void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="tabs">
      {tabs.map(([key, text]) => (
        <button key={key} role="tab" type="button" aria-selected={value === key} className={value === key ? "active" : ""} onClick={() => onChange(key)}>
          {text}
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

      <section className="panel" aria-label="Loan data">
        <h2>Loan data</h2>
        <LoanDataForm result={result} errorField={error?.field} />
      </section>

      <footer className="foot">
        Illustration only, not financial advice. Calculations run on your device; nothing is sent anywhere.
      </footer>
    </div>
  );
}
