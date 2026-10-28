import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ChatTransport } from "./contracts/transport";
import { useChatController } from "./use-chat-controller";

const never = new Promise<void>(() => undefined);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useChatController run lifecycle", () => {
  it("stops locally without waiting for a hanging abort request", async () => {
    const transport: ChatTransport = {
      kind: "projects-new",
      capabilities: { selections: false, answerDeltas: false, resume: false },
      createRun: vi.fn(async () => ({ runId: "run-a" })),
      streamRun: async function* (_runId, signal) {
        await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
      },
      abortRun: vi.fn(() => never),
    };
    const { result } = renderHook(() => useChatController(transport, "daily"));

    act(() => {
      void result.current.submit("开始任务");
    });
    await waitFor(() => expect(result.current.state.run.runId).toBe("run-a"));
    act(() => {
      void result.current.stop();
    });

    expect(result.current.state.run.status).toBe("stopped");
  });

  it("ignores a stale terminal event from an older run", async () => {
    const stale = deferred<void>();
    let createCount = 0;
    const transport: ChatTransport = {
      kind: "projects-new",
      capabilities: { selections: false, answerDeltas: false, resume: false },
      createRun: vi.fn(async () => ({ runId: `run-${++createCount}` })),
      streamRun: async function* (runId) {
        if (runId === "run-1") {
          await stale.promise;
          yield { type: "run.disconnected", warning: "旧连接已断开" } as const;
        } else {
          yield { type: "answer.done", content: "新回答" } as const;
        }
      },
      abortRun: vi.fn(async () => undefined),
    };
    const { result } = renderHook(() => useChatController(transport, "daily"));

    act(() => {
      void result.current.submit("旧任务");
    });
    await waitFor(() => expect(result.current.state.run.runId).toBe("run-1"));
    act(() => {
      void result.current.submit("新任务");
    });
    await waitFor(() => expect(result.current.state.run.status).toBe("completed"));
    await act(async () => {
      stale.resolve();
      await stale.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.state.run.status).toBe("completed");
    expect(result.current.state.run.notice).toBeNull();
    expect(result.current.state.messages.at(-1)?.content).toBe("新回答");
  });
});
