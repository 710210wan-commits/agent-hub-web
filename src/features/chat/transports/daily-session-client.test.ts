import { describe, expect, it, vi } from "vitest";

import {
  DailySessionClientError,
  createDailySessionClient,
} from "./daily-session-client";

const conversationId = "10000000-0000-4000-8000-000000000001";
const turnId = "20000000-0000-4000-8000-000000000002";
const messageId = "40000000-0000-4000-8000-000000000004";
const requestId = "50000000-0000-4000-8000-000000000005";

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
  createdAt: "2026-11-09T01:03:04.000Z",
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
    expect(request.url).toBe("/agent-api/conversations/");
    expect(request.init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({
        clientRequestId: requestId,
        scenarioId: "daily",
        agentKey: "agent-loop",
        title: "新的持久会话",
      }),
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
        body: JSON.stringify({ title: "重命名", expectedVersion: 1 }),
      },
    });
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
