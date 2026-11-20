import { calculate, TuakaInputError, type CalculationResult, type LoanInput } from "@tuaka/engine";
import { useEffect, useRef, useState } from "react";

export interface CalcError {
  code: string;
  field: string | undefined;
  message: string;
}

export type WorkerResponse =
  | { id: number; ok: true; result: CalculationResult }
  | { id: number; ok: false; error: CalcError };

export interface CalculationState {
  /** Last successful result; kept on screen while the input is invalid so the page doesn't blank. */
  result: CalculationResult | null;
  /** Error for the current input, if any. */
  error: CalcError | null;
}

function runInline(input: LoanInput): WorkerResponse {
  try {
    return { id: 0, ok: true, result: calculate(input) };
  } catch (err) {
    const e = err instanceof TuakaInputError ? err : null;
    return {
      id: 0,
      ok: false,
      error: { code: e?.code ?? "unexpected", field: e?.field, message: err instanceof Error ? err.message : String(err) },
    };
  }
}

/** Recalculate whenever the input changes, in a Web Worker when the browser has one. */
export function useCalculation(input: LoanInput): CalculationState {
  const key = JSON.stringify(input);
  const [state, setState] = useState<CalculationState>(() => {
    const first = runInline(input);
    return first.ok ? { result: first.result, error: null } : { result: null, error: first.error };
  });
  const workerRef = useRef<Worker | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const worker = new Worker(new URL("./calc.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.id !== latest.current) return; // a newer request is in flight
      setState((prev) => (msg.ok ? { result: msg.result, error: null } : { result: prev.result, error: msg.error }));
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    const parsed = JSON.parse(key) as LoanInput;
    const id = ++latest.current;
    if (workerRef.current) {
      workerRef.current.postMessage({ id, input: parsed });
    } else {
      const msg = runInline(parsed);
      setState((prev) => (msg.ok ? { result: msg.result, error: null } : { result: prev.result, error: msg.error }));
    }
  }, [key]);

  return state;
}
