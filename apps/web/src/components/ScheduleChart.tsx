import type { ScheduleRow } from "@tuaka/engine";
import { useMemo, useState } from "react";
import { groupDigits, longDate } from "../format";

export type ChartView = "amort" | "repay" | "balance" | "interest";

interface Series {
  key: string;
  label: string;
  className: string;
  values: number[];
}

const W = 720;
const H = 300;
const PAD = { left: 64, right: 16, top: 16, bottom: 36 };

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  // Fine-grained steps so the tallest value fills most of the plot.
  const nice = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((step) => f <= step) ?? 10;
  return nice * exp;
}

function shortNumber(n: number): string {
  const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, "");
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}m`;
  if (n >= 1_000) return `${trim(n / 1_000)}k`;
  return trim(n);
}

function buildSeries(rows: ScheduleRow[], view: ChartView): { series: Series[]; stacked: boolean; title: string } {
  const interest = rows.map((r) => Number(r.interest));
  const principal = rows.map((r) => Number(r.principal));
  const extra = rows.map((r) => Number(r.extraPrincipal));
  const hasExtra = extra.some((x) => x > 0);
  const cumulative = (xs: number[]) => {
    let acc = 0;
    return xs.map((x) => (acc += x));
  };
  switch (view) {
    case "amort":
      return {
        title: hasExtra ? "Each month: interest, principal and extra" : "Each payment split into interest and principal",
        stacked: true,
        series: [
          { key: "principal", label: "Principal", className: "s-principal", values: principal },
          { key: "interest", label: "Interest", className: "s-interest", values: interest },
          ...(hasExtra ? [{ key: "extra", label: "Extra", className: "s-extra", values: extra }] : []),
        ],
      };
    case "repay":
      return {
        title: "Cumulative amount repaid",
        stacked: true,
        series: [
          { key: "principal", label: "Principal repaid", className: "s-principal", values: cumulative(principal.map((p, i) => p + (extra[i] ?? 0))) },
          { key: "interest", label: "Interest paid", className: "s-interest", values: cumulative(interest) },
        ],
      };
    case "balance":
      return {
        title: "Outstanding balance",
        stacked: false,
        series: [{ key: "balance", label: "Balance", className: "s-balance", values: rows.map((r) => Number(r.closingBalance)) }],
      };
    case "interest":
      return {
        title: "Cumulative interest paid",
        stacked: false,
        series: [{ key: "interest", label: "Interest paid", className: "s-interest", values: cumulative(interest) }],
      };
  }
}

export function ScheduleChart({ rows, view, currencySymbol }: { rows: ScheduleRow[]; view: ChartView; currencySymbol: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { series, stacked, title } = useMemo(() => buildSeries(rows, view), [rows, view]);

  const n = rows.length;
  const tops = rows.map((_, i) => (stacked ? series.reduce((a, s) => a + (s.values[i] ?? 0), 0) : Math.max(...series.map((s) => s.values[i] ?? 0))));
  // Scale to typical months, not one-off spikes: a single lump sum would otherwise
  // flatten every regular payment. Months above the cap are clipped and labelled.
  const sorted = [...tops].sort((a, b) => a - b);
  const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
  const peak = sorted[sorted.length - 1] ?? 0;
  const clip = view === "amort" && peak > p95 * 1.5;
  const yMax = niceMax(clip ? p95 * 1.15 : Math.max(peak, 0));
  const spikes = clip ? rows.map((r, i) => ({ i, row: r, total: tops[i] ?? 0 })).filter((t) => t.total > yMax) : [];
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  // Stacked areas: each band sits on the sum of the bands below it.
  const bands = series.map((s, si) => {
    const base = rows.map((_, i) => (stacked ? series.slice(0, si).reduce((a, t) => a + (t.values[i] ?? 0), 0) : 0));
    const cy = (v: number) => y(Math.min(v, yMax));
    const topLine = s.values.map((v, i) => `${x(i).toFixed(1)},${cy(v + (base[i] ?? 0)).toFixed(1)}`);
    const bottomLine = base.map((b, i) => `${x(i).toFixed(1)},${cy(b).toFixed(1)}`).reverse();
    return { ...s, area: `M${topLine.join("L")}L${bottomLine.join("L")}Z`, line: `M${topLine.join("L")}` };
  });

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const firstYear = rows[0]?.year ?? 0;
  const lastYear = rows[n - 1]?.year ?? 0;
  const span = lastYear - firstYear;
  const stepYears = span > 30 ? 10 : span > 12 ? 5 : span > 5 ? 2 : 1;
  const xTicks: Array<{ i: number; year: number }> = [];
  rows.forEach((r, i) => {
    if (r.month === 1 && (r.year - firstYear) % stepYears === 0) xTicks.push({ i, year: r.year });
  });

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / plotW) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  const hoverRow = hover !== null ? rows[hover] : undefined;

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="legend">
          {series.map((s) => (
            <span key={s.key} className={`legend-item ${s.className}`}>
              <svg width="14" height="14" aria-hidden="true">
                <rect width="14" height="14" rx="3" className="swatch" />
              </svg>
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}, ${rows[0] ? longDate(rows[0].date) : ""} to ${rows[n - 1] ? longDate(rows[n - 1]!.date) : ""}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          {/* Hatching so interest is distinguishable without colour. */}
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="hatch-bg" />
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
          </pattern>
        </defs>
        <g className="grid">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">
                {currencySymbol}{shortNumber(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t.year} x={x(t.i)} y={H - 12} textAnchor="middle">
              {t.year}
            </text>
          ))}
        </g>
        {bands.map((b) => (
          <g key={b.key} className={`band ${b.className}`}>
            <path d={b.area} className="area" />
            <path d={b.line} className="line" />
          </g>
        ))}
        {spikes.map((sp, k) => (
          <g key={sp.i} className="spike">
            <path d={`M${x(sp.i) - 5},${PAD.top + 9} L${x(sp.i) + 5},${PAD.top + 9} L${x(sp.i)},${PAD.top + 1} Z`} />
            {k < 6 && (
              <text x={Math.min(x(sp.i) + 8, W - PAD.right - 4)} y={PAD.top + 10} textAnchor={x(sp.i) > W - 140 ? "end" : "start"}>
                {currencySymbol}{shortNumber(sp.total)} in {longDate(sp.row.date).replace(/^\d+ /, "")}
              </text>
            )}
          </g>
        ))}
        {hoverRow && hover !== null && (
          <g className="hover">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} />
          </g>
        )}
      </svg>
      <div className="chart-readout" aria-live="polite">
        {hoverRow ? (
          <>
            <strong>Payment {hoverRow.period}</strong> · {longDate(hoverRow.date)}
            {series.map((s) => (
              <span key={s.key}> · {s.label}: {currencySymbol}{groupDigits((s.values[hover!] ?? 0).toFixed(2))}</span>
            ))}
          </>
        ) : (
          <span className="muted">Hover or drag across the chart to read any payment.</span>
        )}
      </div>
    </figure>
  );
}
