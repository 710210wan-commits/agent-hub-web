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
