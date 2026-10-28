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
  let sequence = 0;
  const runs = new Map<string, { cursor: number; aborted: boolean }>();

  const createRunAt = (cursor: number) => {
    sequence += 1;
    const runId = `mock-run-${options.scenario}-${sequence}`;
    runs.set(runId, { cursor, aborted: false });
    return { runId };
  };

  return {
    kind: "mock",
    capabilities: { selections: true, answerDeltas: true, resume: true },
    async createRun() {
      return createRunAt(0);
    },
    async resumeRun(runId) {
      return createRunAt(runs.get(runId)?.cursor ?? 0);
    },
    async *streamRun(runId, signal) {
      const state = runs.get(runId);
      if (!state) return;
      for (let index = state.cursor; index < mockRunFixtures[options.scenario].length; index += 1) {
        if (signal?.aborted || state.aborted) return;
        if (!(await wait(options.delayMs, signal))) return;
        if (signal?.aborted || state.aborted) return;
        state.cursor = index + 1;
        yield mockRunFixtures[options.scenario][index];
      }
    },
    async abortRun(runId) {
      const state = runs.get(runId);
      if (state) state.aborted = true;
    },
  };
}
