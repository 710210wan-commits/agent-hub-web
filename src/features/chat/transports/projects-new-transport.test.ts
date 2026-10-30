import { describe, expect, it, vi } from "vitest";

import type { ChatStreamEvent } from "../contracts/events";
import type { EventSourceLike } from "./event-source-stream";
import {
  createProjectsNewTransport,
  mapProjectsNewEvent,
} from "./projects-new-transport";

class FakeEventSource implements EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  close() {
    this.closed = true;
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  emitRaw(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>);
  }

  fail() {
    this.onerror?.(new Event("error"));
  }
}

async function nextEvent(stream: AsyncIterable<ChatStreamEvent>) {
  return stream[Symbol.asyncIterator]().next();
}

const emptySelection = {
  knowledgeBaseIds: [],
  skillIds: [],
  mcpIds: [],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("projects-new transport", () => {
  it("posts an empty-selection task to the current backend contract", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ taskId: "task-1", status: "running" }),
    );
    const transport = createProjectsNewTransport({
      apiBaseUrl: "/agent-api",
      fetchFn,
      eventSourceFactory: () => new FakeEventSource(),
      idFactory: () => "fixed-id",
    });

    await expect(
      transport.createRun({
        mode: "daily",
        content: "分析风险",
        selection: emptySelection,
      }),
    ).resolves.toEqual({ runId: "task-1" });

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith(
      "/agent-api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          query: "分析风险",
          userId: "agent-hub-web",
          sessionId: "fixed-id",
          clientRequestId: "fixed-id",
        }),
      }),
    );
  });

  it("rejects selected capabilities before issuing a request", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const transport = createProjectsNewTransport({
      apiBaseUrl: "/agent-api",
      fetchFn,
      eventSourceFactory: () => new FakeEventSource(),
    });

    await expect(
      transport.createRun({
        mode: "work",
        content: "分析风险",
        selection: {
          ...emptySelection,
          knowledgeBaseIds: ["kb-1"],
        },
      }),
    ).rejects.toThrow("当前后端尚未接入所选能力");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("shows a safe generic activity as soon as SSE connects", () => {
    expect(
      mapProjectsNewEvent({ type: "connected", taskId: "task-connected" }),
    ).toEqual([
      { type: "run.connected", runId: "task-connected" },
      { type: "activity.update", label: "正在处理请求" },
    ]);
  });

  it("maps only safe lifecycle summaries and the final answer", () => {
    expect(
      mapProjectsNewEvent({
        type: "context_load",
        phase: "start",
        displayName: "项目资料库",
      }),
    ).toEqual([
      {
        type: "activity.update",
        label: "正在读取项目资料库",
      },
    ]);
    expect(
      mapProjectsNewEvent({
        type: "tool_call",
        displayName: "天气查询",
        reason: "internal secret reasoning",
      }),
    ).toEqual([
      {
        type: "activity.update",
        label: "正在调用天气查询",
      },
    ]);
    expect(
      mapProjectsNewEvent({
        type: "assistant_message",
        message: { content: "raw chain of thought" },
      }),
    ).toEqual([]);
    expect(
      mapProjectsNewEvent({
        type: "loop_stop",
        result: { finalAnswer: "最终可见正文", stoppedBy: "final_answer" },
      }),
    ).toEqual([{ type: "answer.done", content: "最终可见正文" }]);

    expect(
      JSON.stringify(
        mapProjectsNewEvent({
          type: "tool_call",
          displayName: "天气查询",
          reason: "internal secret reasoning",
        }),
      ),
    ).not.toContain("internal secret reasoning");
  });

  it.each([
    [
      "final_answer",
      { finalAnswer: "最终可见正文", stoppedBy: "final_answer" },
      [{ type: "answer.done", content: "最终可见正文" }],
    ],
    [
      "max_turns",
      { finalAnswer: "达到轮次上限后的最终正文", stoppedBy: "max_turns" },
      [{ type: "answer.done", content: "达到轮次上限后的最终正文" }],
    ],
    [
      "model_error",
      { finalAnswer: "internal model error", stoppedBy: "model_error" },
      [{ type: "run.failed", message: "任务执行失败，请稍后重试" }],
    ],
    [
      "aborted",
      { finalAnswer: "partial internal answer", stoppedBy: "aborted" },
      [{ type: "run.stopped", reason: "生成已停止" }],
    ],
  ])("maps %s to one safe terminal event", (_name, result, expected) => {
    const mapped = mapProjectsNewEvent({
      type: "loop_stop",
      result: {
        ...result,
        reasoning: "internal secret reasoning",
        toolInput: "raw tool input",
      },
    });

    expect(mapped).toEqual(expected);
    expect(JSON.stringify(mapped)).not.toContain("internal secret reasoning");
    expect(JSON.stringify(mapped)).not.toContain("raw tool input");
  });

  it.each(["", "   "])(
    "fails safely when a successful terminal event has no visible answer (%j)",
    (finalAnswer) => {
      expect(
        mapProjectsNewEvent({
          type: "loop_stop",
          result: { finalAnswer, stoppedBy: "final_answer" },
        }),
      ).toEqual([
        { type: "run.failed", message: "任务未返回可显示内容，请重试" },
      ]);
    },
  );

  it("attempts abort and emits a truthful warning on EventSource failure", async () => {
    const source = new FakeEventSource();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const transport = createProjectsNewTransport({
      apiBaseUrl: "/agent-api",
      fetchFn,
      eventSourceFactory: () => source,
    });

    const pending = nextEvent(transport.streamRun("task-9"));
    await Promise.resolve();
    source.fail();

    await expect(pending).resolves.toEqual({
      done: false,
      value: {
        type: "run.disconnected",
        warning: "连接已断开，服务端任务可能仍在运行",
      },
    });
    expect(source.closed).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "/agent-api/tasks/task-9/abort",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("emits disconnect immediately without waiting for a hanging abort", async () => {
    const source = new FakeEventSource();
    const fetchFn = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    const transport = createProjectsNewTransport({
      apiBaseUrl: "/agent-api",
      fetchFn,
      eventSourceFactory: () => source,
    });

    const pending = nextEvent(transport.streamRun("task-hangs"));
    await Promise.resolve();
    source.fail();

    await expect(
      Promise.race([
        pending,
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 30)),
      ]),
    ).resolves.toEqual({
      done: false,
      value: {
        type: "run.disconnected",
        warning: "连接已断开，服务端任务可能仍在运行",
      },
    });
  });

  it("ignores malformed SSE data and continues with the next valid event", async () => {
    const source = new FakeEventSource();
    const transport = createProjectsNewTransport({
      apiBaseUrl: "/agent-api",
      fetchFn: vi.fn<typeof fetch>(),
      eventSourceFactory: () => source,
    });
    const iterator = transport.streamRun("task-malformed")[Symbol.asyncIterator]();
    const next = iterator.next();
    await Promise.resolve();

    source.emitRaw("{not-json");
    source.emit({ type: "agent_turn" });

    await expect(next).resolves.toEqual({
      done: false,
      value: { type: "activity.update", label: "正在处理请求" },
    });
    await iterator.return?.();
    expect(source.closed).toBe(true);
  });

  it("closes the SSE iterator immediately after a terminal loop_stop", async () => {
    const source = new FakeEventSource();
    const transport = createProjectsNewTransport({
      apiBaseUrl: "/agent-api",
      fetchFn: vi.fn<typeof fetch>(),
      eventSourceFactory: () => source,
    });
    const iterator = transport.streamRun("task-terminal")[Symbol.asyncIterator]();
    const first = iterator.next();
    await Promise.resolve();
    source.emit({
      type: "loop_stop",
      result: { finalAnswer: "最终正文", stoppedBy: "final_answer" },
    });

    await expect(first).resolves.toEqual({
      done: false,
      value: { type: "answer.done", content: "最终正文" },
    });
    source.emit({
      type: "loop_stop",
      result: { finalAnswer: "晚到正文", stoppedBy: "final_answer" },
    });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    expect(source.closed).toBe(true);
  });

  it("sends an explicit abort request", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const transport = createProjectsNewTransport({
      apiBaseUrl: "/agent-api",
      fetchFn,
      eventSourceFactory: () => new FakeEventSource(),
    });

    await transport.abortRun("task-2");

    expect(fetchFn).toHaveBeenCalledWith(
      "/agent-api/tasks/task-2/abort",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
