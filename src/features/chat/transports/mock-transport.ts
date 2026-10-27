import type { ChatTransport } from "../contracts/transport";
import {
  mockRunFixtures,
  type MockRunScenario,
} from "../fixtures/default-run";

function wait(delayMs: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  if (delayMs <= 0) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createMockTransport(_options?: {
  delayMs?: number;
  scenario?: MockRunScenario;
}): ChatTransport {
  const options = {
    delayMs: _options?.delayMs ?? 180,
    scenario: _options?.scenario ?? "completed",
  };
  const abortedRuns = new Set<string>();

  return {
    kind: "mock",
    capabilities: { selections: true, answerDeltas: true, resume: true },
    async createRun() {
      return { runId: `mock-run-${options.scenario}` };
    },
    async *streamRun(runId, signal) {
      for (const event of mockRunFixtures[options.scenario]) {
        if (signal?.aborted || abortedRuns.has(runId)) return;
        if (!(await wait(options.delayMs, signal))) return;
        if (signal?.aborted || abortedRuns.has(runId)) return;
        yield event;
      }
    },
    async abortRun(runId) {
      abortedRuns.add(runId);
    },
  };
}
