import { describe, expect, it, vi } from "vitest";

import {
  DailySessionClientError,
  createDailySessionClient,
} from "./daily-session-client";

const conversationId = "10000000-0000-4000-8000-000000000001";
const turnId = "20000000-0000-4000-8000-000000000002";
const messageId = "40000000-0000-4000-8000-000000000004";
const requestId = "50000000-0000-4000-8000-000000000005";
const userMessageId = "60000000-0000-4000-8000-000000000006";
const taskId = "30000000-0000-4000-8000-000000000003";
const eventId = "70000000-0000-4000-8000-000000000007";

const metadata = {
  conversationId,
  scenarioId: "daily",
  agentKey: "agent-loop",
  title: "日常会话",
  status: "open",
  archivedAt: null,
  version: 1,
  lastEventSeq: "2",
  lastTurnIndex: "1",
  createdAt: "2026-11-09T01:02:03.000Z",
  updatedAt: "2026-11-09T01:03:04.000Z",
} as const;

const message = {
  messageId,
  conversationId,
  turnId,
  ordinal: "2",
  role: "assistant",
  content: { kind: "text", text: "回答" },
  revision: 1,
  status: "committed",
  artifactRefs: [],
  capabilitySelection: null,
  createdAt: "2026-11-09T01:03:04.000Z",
} as const;

const createdEvent = {
  eventId,
  eventSeq: "3",
  conversationId,
  schemaVersion: 1,
  type: "conversation.created",
  occurredAt: "2026-11-09T01:03:04.000Z",
  payload: { version: 1 },
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestAt(fetchFn: ReturnType<typeof vi.fn>, index = 0) {
  const call = fetchFn.mock.calls[index];
  return {
    url: String(call?.[0]),
    init: call?.[1] as RequestInit,
  };
}

describe("daily Session client", () => {
  it("sends the original explicit selection with canonical Turn input", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ conversationId, turnId, taskId, userMessageId, acceptedEventSeq: "3", status: "queued", reused: false }, 202));
    const capabilitySelection = { knowledgeBaseIds: ["kb-a"], skillIds: ["built-in:aircraft-region-query"], mcpServerIds: [] };
    await createDailySessionClient({ fetchFn }).submitTurn(conversationId, { clientRequestId: requestId, input: { kind: "text", text: "hello" }, capabilitySelection });
    expect(JSON.parse(String(requestAt(fetchFn).init.body)).capabilitySelection).toEqual(capabilitySelection);
  });
  it("rejects a cross-origin API base before issuing a request", () => {
    expect(() =>
      createDailySessionClient({ apiBaseUrl: "https://evil.example/api" }),
    ).toThrow("API 地址必须是同源路径");
  });

  it("lists only daily agent-loop conversations with an opaque cursor", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ conversations: [metadata], nextCursor: "next-page" }),
      );
    const signal = new AbortController().signal;
    const client = createDailySessionClient({ fetchFn });

    await expect(
      client.listConversations(
        { limit: 47, cursor: "opaque /+? cursor" },
        signal,
      ),
    ).resolves.toMatchObject({ nextCursor: "next-page" });

    const request = requestAt(fetchFn);
    const url = new URL(request.url, "https://agent-hub.test");
    expect(url.pathname).toBe("/agent-api/conversations");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "47",
      cursor: "opaque /+? cursor",
      archived: "exclude",
      scenarioId: "daily",
      agentKey: "agent-loop",
    });
    expect(request.init).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      signal,
    });
  });

  it("creates a conversation with the caller-owned idempotency key", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ conversation: metadata, reused: false }, 201),
      );
    const client = createDailySessionClient({ fetchFn });

    await expect(
      client.createConversation({
        clientRequestId: requestId,
        title: "新的持久会话",
      }),
    ).resolves.toMatchObject({ conversation: metadata, reused: false });

    const request = requestAt(fetchFn);
    expect(request.url).toBe("/agent-api/conversations");
    expect(request.init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
    });
    expect(JSON.parse(String(request.init.body))).toEqual({
      clientRequestId: requestId,
      scenarioId: "daily",
      agentKey: "agent-loop",
      title: "新的持久会话",
    });
  });

  it("loads snapshot and older messages with bounded paging", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          conversation: metadata,
          activeTurn: null,
          messages: [message],
          nextCursor: "older /+? cursor",
          lastEventSeq: "2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [message],
          nextCursor: null,
          lastEventSeq: "2",
        }),
      );
    const client = createDailySessionClient({ fetchFn });

    await client.loadSnapshot(conversationId);
    await client.loadMessages(conversationId, "older /+? cursor");

    expect(requestAt(fetchFn, 0).url).toBe(
      `/agent-api/conversations/${conversationId}/snapshot?limit=100`,
    );
    const older = new URL(requestAt(fetchFn, 1).url, "https://agent-hub.test");
    expect(older.pathname).toBe(
      `/agent-api/conversations/${conversationId}/messages`,
    );
    expect(Object.fromEntries(older.searchParams)).toEqual({
      limit: "100",
      cursor: "older /+? cursor",
    });
  });

  it("renames with optimistic concurrency and returns current metadata", async () => {
    const renamed = { ...metadata, title: "重命名", version: 2 };
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ conversation: renamed }));
    const client = createDailySessionClient({ fetchFn });

    await expect(
      client.renameConversation(conversationId, {
        title: "重命名",
        expectedVersion: 1,
      }),
    ).resolves.toEqual(renamed);

    expect(requestAt(fetchFn)).toMatchObject({
      url: `/agent-api/conversations/${conversationId}`,
      init: {
        method: "PATCH",
        credentials: "same-origin",
      },
    });
    expect(JSON.parse(String(requestAt(fetchFn).init.body))).toEqual({
      title: "重命名",
      expectedVersion: 1,
    });
  });

  it("submits a canonical turn and accepts the 202 receipt", async () => {
    const accepted = {
      conversationId,
      turnId,
      taskId,
      userMessageId,
      acceptedEventSeq: "3",
      status: "queued",
      reused: false,
    } as const;
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(accepted, 202));
    const signal = new AbortController().signal;
    const client = createDailySessionClient({ fetchFn });

    await expect(
      client.submitTurn(
        conversationId,
        {
          clientRequestId: requestId,
          input: { kind: "text", text: "1+1" },
        },
        signal,
      ),
    ).resolves.toEqual(accepted);

    const request = requestAt(fetchFn);
    expect(request.url).toBe(
      `/agent-api/conversations/${conversationId}/turns`,
    );
    expect(request.init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      signal,
    });
    expect(JSON.parse(String(request.init.body))).toEqual({
      clientRequestId: requestId,
      input: { kind: "text", text: "1+1" },
    });
    const headers = new Headers(request.init.headers);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("origin")).toBe(false);
  });

  it("pages canonical events after an exact sequence", async () => {
    const page = {
      events: [createdEvent],
      nextAfterSeq: "3",
      lastEventSeq: "3",
      hasMore: false,
    } as const;
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(page));
    const client = createDailySessionClient({ fetchFn });

    await expect(
      client.listEvents(conversationId, { afterSeq: "2", limit: 37 }),
    ).resolves.toEqual(page);

    const request = requestAt(fetchFn);
    const url = new URL(request.url, "https://agent-hub.test");
    expect(url.pathname).toBe(
      `/agent-api/conversations/${conversationId}/events`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      afterSeq: "2",
      limit: "37",
    });
  });

  it.each([
    [200, "completed"],
    [202, "cancelling"],
  ] as const)("accepts cancel HTTP %i with %s state", async (status, turnStatus) => {
    const cancelled = {
      turn: {
        turnId,
        taskId,
        turnIndex: "1",
        acceptedEventSeq: "3",
        status: turnStatus,
        errorCode: null,
      },
    };
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(cancelled, status));
    const client = createDailySessionClient({ fetchFn });

    await expect(client.cancelTurn(conversationId, turnId)).resolves.toEqual(
      cancelled,
    );
    expect(requestAt(fetchFn)).toMatchObject({
      url: `/agent-api/conversations/${conversationId}/turns/${turnId}/cancel`,
      init: { method: "POST", credentials: "same-origin" },
    });
    expect(requestAt(fetchFn).init.body).toBeUndefined();
  });

  it("streams with afterSeq and a conversation-scoped Last-Event-ID", async () => {
    const body =
      `id: ${conversationId}:3\n` +
      "event: conversation.created\n" +
      `data: ${JSON.stringify(createdEvent)}\n\n`;
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const client = createDailySessionClient({ fetchFn });
    const events = client.streamEvents(conversationId, {
      afterSeq: "2",
      lastEventId: `${conversationId}:2`,
    });
    const iterator = events[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: createdEvent,
    });

    const request = requestAt(fetchFn);
    const url = new URL(request.url, "https://agent-hub.test");
    expect(url.pathname).toBe(
      `/agent-api/conversations/${conversationId}/stream`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({ afterSeq: "2" });
    expect(request.init).toMatchObject({
      method: "GET",
      credentials: "same-origin",
    });
    const headers = new Headers(request.init.headers);
    expect(headers.get("last-event-id")).toBe(`${conversationId}:2`);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("origin")).toBe(false);
  });

  it("reports a stream HTTP envelope on first iteration", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "RESYNC_REQUIRED",
            message: "PRIVATE_UPSTREAM_DETAIL",
            requestId,
          },
        },
        409,
      ),
    );
    const client = createDailySessionClient({ fetchFn });
    const iterator = client
      .streamEvents(conversationId, { afterSeq: "2" })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toMatchObject({
      status: 409,
      code: "RESYNC_REQUIRED",
      requestId,
      message: "事件记录已过期，请重新同步会话",
    });
  });

  it("reports EOF as STREAM_DISCONNECTED without synthesizing a terminal event", async () => {
    const body =
      `id: ${conversationId}:3\n` +
      "event: conversation.created\n" +
      `data: ${JSON.stringify(createdEvent)}\n\n`;
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const client = createDailySessionClient({ fetchFn });
    const iterator = client
      .streamEvents(conversationId, { afterSeq: "2" })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: createdEvent,
    });
    await expect(iterator.next()).rejects.toMatchObject({
      code: "STREAM_DISCONNECTED",
      message: "会话事件流已断开，请重新连接",
    });
  });

  it("preserves AbortError when the stream request is cancelled", async () => {
    const abort = new DOMException("aborted", "AbortError");
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(abort);
    const signal = new AbortController().signal;
    const client = createDailySessionClient({ fetchFn });
    const iterator = client
      .streamEvents(conversationId, { afterSeq: "2" }, signal)
      [Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toBe(abort);
    expect(requestAt(fetchFn).init.signal).toBe(signal);
  });

  it("rejects a Last-Event-ID from another conversation before fetching", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = createDailySessionClient({ fetchFn });
    const iterator = client
      .streamEvents(conversationId, {
        lastEventId: "90000000-0000-4000-8000-000000000009:2",
      })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toThrow(
      "Last-Event-ID 必须属于当前会话",
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does not own global authentication operations", () => {
    const client = createDailySessionClient({ fetchFn: vi.fn<typeof fetch>() });

    expect(client).not.toHaveProperty("getAuthStatus");
    expect(client).not.toHaveProperty("login");
    expect(client).not.toHaveProperty("logout");
  });

  it.each([
    [401, "AUTH_REQUIRED", "登录状态已失效，请重新登录"],
    [403, "ORIGIN_REJECTED", "请求来源校验失败，请联系管理员检查部署配置"],
    [404, "NOT_FOUND", "会话不存在或无权访问"],
    [409, "CONFLICT", "会话已被更新，请刷新后重试"],
    [503, "STORAGE_UNAVAILABLE", "服务暂不可用，请稍后重试"],
  ])("maps HTTP %i to a safe typed error", async (status, code, messageText) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code,
            message: "PRIVATE_UPSTREAM_DETAIL",
            requestId,
          },
        },
        status,
      ),
    );
    const client = createDailySessionClient({ fetchFn });

    const error = await client
      .loadSnapshot(conversationId)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(DailySessionClientError);
    expect(error).toMatchObject({ status, code, requestId, message: messageText });
    expect(String(error)).not.toContain("PRIVATE_UPSTREAM_DETAIL");
  });

  it.each([
    [409, "TURN_IN_PROGRESS", "当前会话已有任务运行中"],
    [409, "IDEMPOTENCY_CONFLICT", "请求标识冲突，请重新发起请求"],
    [409, "RESYNC_REQUIRED", "事件记录已过期，请重新同步会话"],
    [503, "CONVERSATION_EXECUTION_DISABLED", "当前会话暂不可执行"],
  ])(
    "preserves backend error code %s instead of replacing it from HTTP status",
    async (status, code, messageText) => {
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            error: { code, message: "PRIVATE_UPSTREAM_DETAIL", requestId },
          },
          status,
        ),
      );
      const client = createDailySessionClient({ fetchFn });

      await expect(client.loadSnapshot(conversationId)).rejects.toMatchObject({
        status,
        code,
        requestId,
        message: messageText,
      });
    },
  );

  it("falls back to HTTP status only when the error envelope is malformed", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: { code: "RESYNC_REQUIRED" } }, 409));
    const client = createDailySessionClient({ fetchFn });

    await expect(client.loadSnapshot(conversationId)).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
      requestId: undefined,
      message: "会话已被更新，请刷新后重试",
    });
  });

  it("fails safely for malformed success JSON without exposing it", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{"conversations":[{"ownerKey":"PRIVATE"}]}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const client = createDailySessionClient({ fetchFn });

    await expect(client.listConversations({})).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message: "服务响应格式错误，请稍后重试",
    });
    await expect(client.listConversations({})).rejects.not.toThrow("PRIVATE");
  });

  it("preserves AbortError instead of turning cancellation into a failure", async () => {
    const abort = new DOMException("aborted", "AbortError");
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(abort);
    const client = createDailySessionClient({ fetchFn });

    await expect(client.listConversations({})).rejects.toBe(abort);
  });

  it("never includes raw network errors in the safe message", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private-password upstream socket detail"));
    const client = createDailySessionClient({ fetchFn });

    await expect(client.listConversations({})).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "网络请求失败，请稍后重试",
    });
  });
});


describe("conversation soft deletion", () => {
  it("accepts an empty 204 without parsing JSON and sends the exact DELETE", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(createDailySessionClient({ fetchFn }).deleteConversation(conversationId)).resolves.toBeUndefined();
    expect(requestAt(fetchFn).url).toBe(`/agent-api/conversations/${conversationId}`);
    expect(requestAt(fetchFn).init).toMatchObject({ method: "DELETE", credentials: "same-origin" });
  });
  it.each([401, 403, 503])("preserves HTTP %s for delete failures", async status => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: { code: "DELETE_REJECTED", message: "private detail", requestId } }, status));
    await expect(createDailySessionClient({ fetchFn }).deleteConversation(conversationId)).rejects.toMatchObject({ status });
  });
  it("rejects a malformed ID without a request", async () => {
    const fetchFn = vi.fn();
    await expect(createDailySessionClient({ fetchFn }).deleteConversation("../other")).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
