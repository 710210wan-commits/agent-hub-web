import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AppMode } from "@/config/modes";

import { SessionNotFoundError } from "./contracts/session";
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
  it("loads history before allowing a send and then reuses that session", async () => {
    const history = deferred<{
      session: { id: string; title: string; updatedAt: number; isPinned: boolean };
      messages: Array<{
        id: string;
        role: "user" | "assistant";
        content: string;
        createdAt: number;
      }>;
    }>();
    const createRun = vi.fn(async () => ({
      runId: "run-history",
      sessionId: "thread-history",
    }));
    const transport: ChatTransport = {
      kind: "xiaozhi",
      capabilities: { selections: false, answerDeltas: true, resume: false },
      sessions: {
        listSessions: vi.fn(async () => []),
        loadSession: vi.fn(() => history.promise),
      },
      createRun,
      streamRun: async function* () {
        yield { type: "answer.done", content: "继续回答" } as const;
      },
      abortRun: vi.fn(async () => undefined),
    };
    const { result } = renderHook(() =>
      useChatController(transport, "work", {
        initialSessionId: "thread-history",
      }),
    );

    expect(result.current.state.sessionStatus).toBe("loading");
    act(() => expect(result.current.submit("加载期间发送")).toBe(false));
    expect(createRun).not.toHaveBeenCalled();

    await act(async () => {
      history.resolve({
        session: {
          id: "thread-history",
          title: "历史会话",
          updatedAt: 2,
          isPinned: false,
        },
        messages: [
          { id: "m1", role: "user", content: "历史问题", createdAt: 1 },
          { id: "m2", role: "assistant", content: "历史回答", createdAt: 2 },
        ],
      });
      await history.promise;
    });
    await waitFor(() => expect(result.current.state.sessionStatus).toBe("ready"));
    expect(result.current.state.messages.map((message) => message.content)).toEqual([
      "历史问题",
      "历史回答",
    ]);

    act(() => expect(result.current.submit("继续追问")).toBe(true));
    await waitFor(() => expect(createRun).toHaveBeenCalledOnce());
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "thread-history" }),
      expect.any(AbortSignal),
    );
  });

  it("resolves a newly created session once and reuses it on later sends", async () => {
    const onSessionResolved = vi.fn();
    const createRun = vi
      .fn()
      .mockResolvedValueOnce({ runId: "run-1", sessionId: "thread-new" })
      .mockResolvedValueOnce({ runId: "run-2", sessionId: "thread-new" });
    const transport: ChatTransport = {
      kind: "xiaozhi",
      capabilities: { selections: false, answerDeltas: true, resume: false },
      createRun,
      streamRun: async function* () {
        yield { type: "answer.done", content: "完成" } as const;
      },
      abortRun: vi.fn(async () => undefined),
    };
    const { result } = renderHook(() =>
      useChatController(transport, "work", { onSessionResolved }),
    );

    act(() => expect(result.current.submit("第一问")).toBe(true));
    await waitFor(() => expect(result.current.state.run.status).toBe("completed"));
    act(() => expect(result.current.submit("第二问")).toBe(true));
    await waitFor(() => expect(createRun).toHaveBeenCalledTimes(2));

    expect(createRun.mock.calls[0]?.[0]).not.toHaveProperty("sessionId");
    expect(createRun.mock.calls[1]?.[0]).toMatchObject({
      sessionId: "thread-new",
    });
    expect(onSessionResolved).toHaveBeenCalledOnce();
    expect(onSessionResolved).toHaveBeenCalledWith("thread-new");
  });

  it("keeps the active run when the route catches up to its resolved session", async () => {
    const streamGate = deferred<void>();
    let streamSignal: AbortSignal | undefined;
    const loadSession = vi.fn();
    const transport: ChatTransport = {
      kind: "xiaozhi",
      capabilities: { selections: false, answerDeltas: true, resume: false },
      sessions: {
        listSessions: vi.fn(async () => []),
        loadSession,
      },
      createRun: vi.fn(async () => ({
        runId: "run-live",
        sessionId: "thread-live",
      })),
      streamRun: async function* (_runId, signal) {
        streamSignal = signal;
        await streamGate.promise;
        yield { type: "answer.done", content: "流式完成" } as const;
      },
      abortRun: vi.fn(async () => undefined),
    };
    const { result, rerender } = renderHook(
      ({ initialSessionId, routeKey }) =>
        useChatController(transport, "work", {
          initialSessionId,
          routeKey,
        }),
      {
        initialProps: {
          initialSessionId: undefined as string | undefined,
          routeKey: "work:draft:nonce-live",
        },
      },
    );

    act(() => expect(result.current.submit("保持当前回答")).toBe(true));
    await waitFor(() => expect(result.current.state.run.runId).toBe("run-live"));
    rerender({
      initialSessionId: "thread-live",
      routeKey: "work:conversation:thread-live",
    });

    expect(streamSignal?.aborted).toBe(false);
    expect(loadSession).not.toHaveBeenCalled();
    expect(result.current.state.messages[0]?.content).toBe("保持当前回答");

    await act(async () => {
      streamGate.resolve();
      await streamGate.promise;
    });
    await waitFor(() => expect(result.current.state.run.status).toBe("completed"));
  });

  it("marks a missing session and never creates a replacement thread", async () => {
    const createRun = vi.fn();
    const transport: ChatTransport = {
      kind: "xiaozhi",
      capabilities: { selections: false, answerDeltas: true, resume: false },
      sessions: {
        listSessions: vi.fn(async () => []),
        loadSession: vi.fn(async () => {
          throw new SessionNotFoundError("missing");
        }),
      },
      createRun,
      streamRun: async function* () {},
      abortRun: vi.fn(async () => undefined),
    };
    const { result } = renderHook(() =>
      useChatController(transport, "work", { initialSessionId: "missing" }),
    );

    await waitFor(() => expect(result.current.state.sessionStatus).toBe("not-found"));
    expect(result.current.state.sessionError).toBe("会话不存在或已删除");
    act(() => expect(result.current.submit("不要新建")).toBe(false));
    expect(createRun).not.toHaveBeenCalled();
  });

  it("aborts old session loads and ignores their result after transport changes", async () => {
    const oldLoad = deferred<{
      session: { id: string; title: string; updatedAt: number; isPinned: boolean };
      messages: Array<{
        id: string;
        role: "user" | "assistant";
        content: string;
        createdAt: number;
      }>;
    }>();
    let oldSignal: AbortSignal | undefined;
    const oldTransport: ChatTransport = {
      kind: "xiaozhi",
      capabilities: { selections: false, answerDeltas: true, resume: false },
      sessions: {
        listSessions: vi.fn(async () => []),
        loadSession: vi.fn((_id, signal) => {
          oldSignal = signal;
          return oldLoad.promise;
        }),
      },
      createRun: vi.fn(),
      streamRun: async function* () {},
      abortRun: vi.fn(async () => undefined),
    };
    const nextTransport: ChatTransport = {
      kind: "mock",
      capabilities: { selections: true, answerDeltas: true, resume: true },
      createRun: vi.fn(async () => ({ runId: "new-run" })),
      streamRun: async function* () {},
      abortRun: vi.fn(async () => undefined),
    };
    const { result, rerender } = renderHook(
      ({ transport, mode, sessionId }) =>
        useChatController(transport, mode, { initialSessionId: sessionId }),
      {
        initialProps: {
          transport: oldTransport,
          mode: "work" as AppMode,
          sessionId: "old-thread" as string | undefined,
        },
      },
    );
    await waitFor(() => expect(result.current.state.sessionStatus).toBe("loading"));

    rerender({
      transport: nextTransport,
      mode: "daily",
      sessionId: undefined,
    });
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      oldLoad.resolve({
        session: { id: "old-thread", title: "旧会话", updatedAt: 1, isPinned: false },
        messages: [
          { id: "old", role: "assistant", content: "旧回答", createdAt: 1 },
        ],
      });
      await oldLoad.promise;
    });

    expect(result.current.state.sessionStatus).toBe("idle");
    expect(result.current.state.messages).toEqual([]);
  });

  it("aborts an old stream and prevents its messages entering the next mode", async () => {
    const oldStream = deferred<void>();
    let oldSignal: AbortSignal | undefined;
    const oldTransport: ChatTransport = {
      kind: "xiaozhi",
      capabilities: { selections: false, answerDeltas: true, resume: false },
      createRun: vi.fn(async () => ({ runId: "old-run", sessionId: "old-thread" })),
      streamRun: async function* (_runId, signal) {
        oldSignal = signal;
        await oldStream.promise;
        yield { type: "answer.done", content: "旧模式回答" } as const;
      },
      abortRun: vi.fn(async () => undefined),
    };
    const nextTransport: ChatTransport = {
      kind: "mock",
      capabilities: { selections: true, answerDeltas: true, resume: true },
      createRun: vi.fn(async () => ({ runId: "new-run" })),
      streamRun: async function* () {
        yield { type: "answer.done", content: "新模式回答" } as const;
      },
      abortRun: vi.fn(async () => undefined),
    };
    const { result, rerender } = renderHook(
      ({ transport, mode }) => useChatController(transport, mode),
      {
        initialProps: {
          transport: oldTransport,
          mode: "work" as AppMode,
        },
      },
    );
    act(() => expect(result.current.submit("旧问题")).toBe(true));
    await waitFor(() => expect(result.current.state.run.runId).toBe("old-run"));

    rerender({ transport: nextTransport, mode: "daily" });
    expect(oldSignal?.aborted).toBe(true);
    act(() => expect(result.current.submit("新问题")).toBe(true));
    await waitFor(() => expect(result.current.state.run.status).toBe("completed"));
    await act(async () => {
      oldStream.resolve();
      await oldStream.promise;
    });

    expect(result.current.state.messages.map((message) => message.content)).toEqual([
      "新问题",
      "新模式回答",
    ]);
  });

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
