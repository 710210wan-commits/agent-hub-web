import { describe, expect, it, vi } from "vitest";

import type { ChatStreamEvent } from "../contracts/events";
import { SessionNotFoundError } from "../contracts/session";
import { createXiaozhiTransport } from "./xiaozhi-transport";

const emptySelection = {
  knowledgeBaseIds: [],
  skillIds: [],
  mcpServerIds: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function sseResponse(body: string): Response {
  return new Response(new TextEncoder().encode(body), {
    headers: { "content-type": "text/event-stream" },
  });
}

function sse(event: string, data: unknown, id?: string): string {
  return [
    `event: ${event}`,
    `data: ${JSON.stringify(data)}`,
    ...(id ? [`id: ${id}`] : []),
    "",
    "",
  ].join("\n");
}

async function collect(stream: AsyncIterable<ChatStreamEvent>) {
  const events: ChatStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe("xiaozhi transport", () => {
  it("creates a thread with a compact title before creating the first run", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/chat/thread")) {
        return jsonResponse({
          id: "thread-1",
          uid: "demo-user",
          agent_id: "office-agent",
          title: "测试标题",
          is_pinned: false,
          created_at: "2026-11-06T06:00:00Z",
          updated_at: "2026-11-06T06:00:00Z",
          metadata: {},
        });
      }
      return jsonResponse({
        run_id: "run-1",
        thread_id: "thread-1",
        status: "pending",
        request_id: "request-1",
        stream_url: "/api/agent/runs/run-1/events",
      });
    });
    const transport = createXiaozhiTransport({
      fetchFn,
      idFactory: () => "request-1",
    });

    await expect(
      transport.createRun({
        mode: "work",
        content: "  1234567890   1234567890\n1234567890 1234567890  ",
        selection: emptySelection,
      }),
    ).resolves.toEqual({ runId: "run-1", sessionId: "thread-1" });

    expect(requests.map((item) => item.url)).toEqual([
      "/api/work-agent/chat/thread",
      "/api/work-agent/agent/runs",
    ]);
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      title: "1234567890 1234567890 1234567890",
    });
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      query: "  1234567890   1234567890\n1234567890 1234567890  ",
      thread_id: "thread-1",
      meta: { request_id: "request-1" },
    });
  });

  it("reuses an existing session without creating a replacement thread", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        run_id: "run-2",
        thread_id: "thread-old",
        status: "pending",
        request_id: "request-2",
        stream_url: "/api/agent/runs/run-2/events",
      }),
    );
    const transport = createXiaozhiTransport({
      apiBaseUrl: "/custom/work/",
      fetchFn,
      idFactory: () => "request-2",
    });

    await expect(
      transport.createRun({
        mode: "work",
        content: "继续分析",
        selection: emptySelection,
        sessionId: "thread-old",
      }),
    ).resolves.toEqual({ runId: "run-2", sessionId: "thread-old" });

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith(
      "/custom/work/agent/runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          query: "继续分析",
          thread_id: "thread-old",
          meta: { request_id: "request-2" },
        }),
      }),
    );
  });

  it("rejects unsupported modes and per-request selections before fetch", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const transport = createXiaozhiTransport({ fetchFn });

    await expect(
      transport.createRun({
        mode: "daily",
        content: "错误入口",
        selection: emptySelection,
      }),
    ).rejects.toThrow("办公场景");
    await expect(
      transport.createRun({
        mode: "work",
        content: "使用指定技能",
        selection: { ...emptySelection, skillIds: ["skill-1"] },
      }),
    ).rejects.toThrow("预配置");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(transport.capabilities).toEqual({
      selections: false,
      answerDeltas: true,
      resume: false,
    });
  });

  it("maps only visible deltas and safe activity, then finishes without duplicating output", async () => {
    const internalReasoning = "private chain of thought";
    const rawToolArgs = "secret tool args";
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/events")) {
        return sseResponse(
          sse(
            "messages",
            {
              run_id: "run-stream",
              payload: {
                items: [
                  {
                    stream_event: {
                      type: "message_delta",
                      content: "最终",
                      reasoning_content: internalReasoning,
                    },
                  },
                  {
                    stream_event: {
                      type: "tool_call",
                      name: "天气查询",
                      args: { query: rawToolArgs },
                    },
                  },
                ],
              },
            },
            "10-0",
          ) +
            sse("custom", {
              payload: {
                name: "xiaozhi.agent_state",
                agent_state: {
                  todos: [],
                  files: {},
                  artifacts: [],
                  subagent_runs: [],
                },
              },
            }) +
            sse("custom", {
              payload: {
                name: "xiaozhi.agent_state",
                agent_state: { todos: [{ content: "internal todo" }] },
              },
            }) +
            sse("end", { payload: { status: "completed" } }, "11-0"),
        );
      }
      return jsonResponse({
        status: "completed",
        output: "最终完整正文",
        agent_run_id: "run-stream",
        thread_id: "thread-1",
      });
    });
    const transport = createXiaozhiTransport({ fetchFn });

    const events = await collect(transport.streamRun("run-stream"));

    expect(events).toEqual([
      { type: "answer.delta", delta: "最终" },
      { type: "activity.update", label: "正在调用天气查询" },
      { type: "activity.update", label: "正在处理请求" },
      { type: "answer.done" },
    ]);
    expect(JSON.stringify(events)).not.toContain(internalReasoning);
    expect(JSON.stringify(events)).not.toContain(rawToolArgs);
    expect(JSON.stringify(events)).not.toContain("internal todo");
  });

  it("uses result output when the stream produced no visible delta", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/events")
        ? sseResponse(sse("end", { payload: { status: "completed" } }))
        : jsonResponse({
            status: "completed",
            output: "仅在结果接口出现的正文",
            agent_run_id: "run-result",
          }),
    );
    const transport = createXiaozhiTransport({ fetchFn });

    await expect(collect(transport.streamRun("run-result"))).resolves.toEqual([
      { type: "answer.done", content: "仅在结果接口出现的正文" },
    ]);
  });

  it.each([
    ["error", { message: "internal DB trace" }, { type: "run.failed", message: "任务执行失败，请稍后重试" }],
    ["end", { payload: { status: "failed", error: "private" } }, { type: "run.failed", message: "任务执行失败，请稍后重试" }],
    ["end", { payload: { status: "cancelled" } }, { type: "run.stopped", reason: "生成已停止" }],
  ])("maps %s terminal state to one safe event", async (event, data, expected) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      sseResponse(sse(event, data)),
    );
    const transport = createXiaozhiTransport({ fetchFn });

    const events = await collect(transport.streamRun("run-terminal"));

    expect(events).toEqual([expected]);
    expect(JSON.stringify(events)).not.toContain("internal DB trace");
    expect(JSON.stringify(events)).not.toContain("private");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("reconnects once from the latest SSE cursor during the current run", async () => {
    const eventRequests: Array<{ url: string; headers: Headers }> = [];
    let streamAttempt = 0;
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes("/events")) {
        eventRequests.push({ url, headers: new Headers(init?.headers) });
        streamAttempt += 1;
        return streamAttempt === 1
          ? sseResponse(
              sse(
                "messages",
                {
                  payload: {
                    chunk: {
                      stream_event: { type: "message_delta", content: "A" },
                    },
                  },
                },
                "20-0",
              ),
            )
          : sseResponse(sse("end", { payload: { status: "completed" } }, "21-0"));
      }
      return jsonResponse({
        status: "completed",
        output: "A",
        agent_run_id: "run-retry",
      });
    });
    const transport = createXiaozhiTransport({ fetchFn });

    await expect(collect(transport.streamRun("run-retry"))).resolves.toEqual([
      { type: "answer.delta", delta: "A" },
      { type: "answer.done" },
    ]);
    expect(eventRequests).toHaveLength(2);
    expect(new URL(eventRequests[1]!.url, "https://example.test").searchParams.get("after_seq"))
      .toBe("20-0");
    expect(eventRequests[1]!.headers.get("last-event-id")).toBe("20-0");
  });

  it("posts the explicit cancel endpoint", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ run: {} }));
    const transport = createXiaozhiTransport({ fetchFn });

    await transport.abortRun("run/cancel");

    expect(fetchFn).toHaveBeenCalledWith(
      "/api/work-agent/agent/runs/run%2Fcancel/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lists only schema-valid threads as normalized sessions", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([
        {
          id: "thread-1",
          uid: "demo-user",
          agent_id: "office-agent",
          title: "周报",
          is_pinned: true,
          created_at: "2026-11-05T06:00:00Z",
          updated_at: "2026-11-06T06:00:00Z",
          metadata: {},
        },
      ]),
    );
    const transport = createXiaozhiTransport({ fetchFn });

    await expect(transport.sessions!.listSessions()).resolves.toEqual([
      {
        id: "thread-1",
        title: "周报",
        updatedAt: Date.parse("2026-11-06T06:00:00Z"),
        isPinned: true,
      },
    ]);
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/work-agent/chat/threads?limit=500&offset=0",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("rejects a malformed thread list instead of exposing partial history", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([{ id: "thread-1", title: "缺少更新时间" }]),
    );
    const transport = createXiaozhiTransport({ fetchFn });

    await expect(transport.sessions!.listSessions()).rejects.toThrow(
      "会话列表响应格式错误",
    );
  });

  it("loads only user and assistant history roles in backend order", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        history: [
          { id: 1, type: "human", content: "问题", created_at: "2026-11-06T06:00:00Z" },
          { id: 2, type: "tool", content: "raw tool output", created_at: "2026-11-06T06:00:01Z" },
          { id: 3, type: "ai", content: "回答", created_at: "2026-11-06T06:00:02Z" },
          { id: 4, type: "system", content: "secret prompt", created_at: "2026-11-06T06:00:03Z" },
          { id: "5", type: "user", content: "追问", created_at: null },
          { id: "6", type: "assistant", content: "补充", created_at: "2026-11-06T06:00:04Z" },
        ],
      }),
    );
    const transport = createXiaozhiTransport({ fetchFn });

    const loaded = await transport.sessions!.loadSession("thread/unsafe");

    expect(loaded.messages).toEqual([
      { id: "1", role: "user", content: "问题", createdAt: Date.parse("2026-11-06T06:00:00Z") },
      { id: "3", role: "assistant", content: "回答", createdAt: Date.parse("2026-11-06T06:00:02Z") },
      { id: "5", role: "user", content: "追问", createdAt: 0 },
      { id: "6", role: "assistant", content: "补充", createdAt: Date.parse("2026-11-06T06:00:04Z") },
    ]);
    expect(loaded.session).toEqual({
      id: "thread/unsafe",
      title: "历史会话",
      updatedAt: Date.parse("2026-11-06T06:00:04Z"),
      isPinned: false,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/work-agent/chat/thread/thread%2Funsafe/history",
      expect.objectContaining({ signal: undefined }),
    );
    expect(JSON.stringify(loaded)).not.toContain("raw tool output");
    expect(JSON.stringify(loaded)).not.toContain("secret prompt");
  });

  it("throws SessionNotFoundError on history 404 without creating a thread", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ code: "WORK_AGENT_UPSTREAM_ERROR" }, 404),
    );
    const transport = createXiaozhiTransport({ fetchFn });

    await expect(
      transport.sessions!.loadSession("missing-thread"),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain(
      "/chat/thread/missing-thread/history",
    );
  });
});
