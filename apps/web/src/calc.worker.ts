/// <reference lib="webworker" />
import { calculate, TuakaInputError, type LoanInput } from "@tuaka/engine";
import type { WorkerResponse } from "./useCalculation";

/**
 * Runs the engine off the main thread so sliders stay smooth even for
 * 1,200-payment schedules.
 */
self.onmessage = (event: MessageEvent<{ id: number; input: LoanInput }>) => {
  const { id, input } = event.data;
  let response: WorkerResponse;
  try {
    response = { id, ok: true, result: calculate(input) };
  } catch (err) {
    const e = err instanceof TuakaInputError ? err : null;
    response = {
      id,
      ok: false,
      error: {
        code: e?.code ?? "unexpected",
        field: e?.field,
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
};
