import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DailySessionClientError,
  createDailySessionClient,
  type DailySessionClient,
} from "@/features/chat/transports/daily-session-client";
import type { ConversationMetadata } from "@/features/chat/transports/daily-session-contract";

import { useDailySessionStore } from "./daily-session-store";

const FIRST_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_ID = "00000000-0000-4000-8000-000000000002";

function conversation(
  conversationId: string,
  overrides: Partial<ConversationMetadata> = {},
): ConversationMetadata {
  return {
    conversationId,
    scenarioId: "daily",
    agentKey: "agent-loop",
    title: `会话 ${conversationId.slice(-1)}`,
    status: "open",
    archivedAt: null,
    version: 1,
    lastEventSeq: "0",
    lastTurnIndex: "0",
    createdAt: "2026-11-09T00:00:00.000Z",
    updatedAt: "2026-11-09T00:00:00.000Z",
    ...overrides,
  };
}

function createClient(): DailySessionClient {
  return {
    listConversations: vi.fn().mockResolvedValue({
      conversations: [],
      nextCursor: null,
    }),
    createConversation: vi.fn(),
    loadSnapshot: vi.fn(),
    loadMessages: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
    submitTurn: vi.fn(),
    listEvents: vi.fn(),
    streamEvents: vi.fn(),
    cancelTurn: vi.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("useDailySessionStore", () => {
  let client: DailySessionClient;
  let idFactory: () => string;

  beforeEach(() => {
    client = createClient();
    idFactory = vi.fn().mockReturnValueOnce(FIRST_ID).mockReturnValue(SECOND_ID);
  });

  it("appends pages without duplicates and preserves the opaque cursor", async () => {
    vi.mocked(client.listConversations)
      .mockResolvedValueOnce({
        conversations: [conversation(FIRST_ID)],
        nextCursor: "opaque/+==",
      })
      .mockResolvedValueOnce({
        conversations: [
          conversation(FIRST_ID, { title: "已刷新" }),
          conversation(SECOND_ID),
        ],
        nextCursor: null,
      });

    const { result } = renderHook(() =>
      useDailySessionStore(client, 1, { requestIdFactory: idFactory }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => result.current.loadMore());

    expect(client.listConversations).toHaveBeenNthCalledWith(
      2,
      { cursor: "opaque/+==" },
      expect.any(AbortSignal),
    );
    expect(result.current.conversations.map((item) => item.conversationId)).toEqual([
      FIRST_ID,
      SECOND_ID,
    ]);
    expect(result.current.conversations[0]?.title).toBe("已刷新");
  });

  it("reuses a create key after network uncertainty, then uses a new key", async () => {
    vi.mocked(client.createConversation)
      .mockRejectedValueOnce(
        new DailySessionClientError({ code: "NETWORK_ERROR", message: "网络错误" }),
      )
      .mockResolvedValueOnce({ conversation: conversation(FIRST_ID), reused: true })
      .mockResolvedValueOnce({ conversation: conversation(SECOND_ID), reused: false });
    const { result } = renderHook(() =>
      useDailySessionStore(client, 1, { requestIdFactory: idFactory }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      expect(await result.current.createConversation()).toEqual({ status: "unknown" });
    });
    await act(async () => {
      expect(await result.current.retryCreate()).toEqual({
        status: "created",
        conversationId: FIRST_ID,
      });
    });
    await act(async () => {
      await result.current.createConversation("第二个");
    });

    expect(client.createConversation).toHaveBeenNthCalledWith(
      1,
      { clientRequestId: FIRST_ID },
      expect.any(AbortSignal),
    );
    expect(client.createConversation).toHaveBeenNthCalledWith(
      2,
      { clientRequestId: FIRST_ID },
      expect.any(AbortSignal),
    );
    expect(client.createConversation).toHaveBeenNthCalledWith(
      3,
      { clientRequestId: SECOND_ID, title: "第二个" },
      expect.any(AbortSignal),
    );
  });

  it("reuses a create key after an invalid success response", async () => {
    let createAttempts = 0;
    const fetchFn = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "GET") {
        return jsonResponse({ conversations: [], nextCursor: null });
      }
      createAttempts += 1;
      return createAttempts === 1
        ? new Response("{", {
            status: 201,
            headers: { "content-type": "application/json" },
          })
        : jsonResponse({ conversation: conversation(FIRST_ID), reused: true }, 201);
    });
    const realClient = createDailySessionClient({ fetchFn });
    const { result } = renderHook(() =>
      useDailySessionStore(realClient, 1, { requestIdFactory: idFactory }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      expect(await result.current.createConversation("标题")).toEqual({
        status: "unknown",
      });
    });
    await act(async () => void (await result.current.retryCreate()));

    const retriedBody = JSON.parse(String(fetchFn.mock.calls[2]?.[1]?.body));
    expect(retriedBody).toMatchObject(
      { clientRequestId: FIRST_ID, title: "标题" },
    );
  });

  it("releases a create key after an explicit rejection", async () => {
    vi.mocked(client.createConversation)
      .mockRejectedValueOnce(
        new DailySessionClientError({
          code: "INVALID_REQUEST",
          message: "请求无效",
          status: 400,
        }),
      )
      .mockResolvedValueOnce({ conversation: conversation(SECOND_ID), reused: false });
    const { result } = renderHook(() =>
      useDailySessionStore(client, 1, { requestIdFactory: idFactory }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => void (await result.current.createConversation("标题")));
    await act(async () => void (await result.current.retryCreate()));

    expect(client.createConversation).toHaveBeenNthCalledWith(
      2,
      { clientRequestId: SECOND_ID, title: "标题" },
      expect.any(AbortSignal),
    );
  });

  it("updates the renamed conversation with the current expectedVersion", async () => {
    vi.mocked(client.listConversations).mockResolvedValue({
      conversations: [conversation(FIRST_ID, { version: 3 })],
      nextCursor: null,
    });
    vi.mocked(client.renameConversation).mockResolvedValue(
      conversation(FIRST_ID, { title: "新标题", version: 4 }),
    );
    const { result } = renderHook(() =>
      useDailySessionStore(client, 1, { requestIdFactory: idFactory }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      expect(await result.current.renameConversation(FIRST_ID, "新标题")).toBe("renamed");
    });

    expect(client.renameConversation).toHaveBeenCalledWith(
      FIRST_ID,
      { title: "新标题", expectedVersion: 3 },
      expect.any(AbortSignal),
    );
    expect(result.current.conversations[0]).toMatchObject({ title: "新标题", version: 4 });
  });

  it("refreshes the list after a rename conflict", async () => {
    vi.mocked(client.listConversations)
      .mockResolvedValueOnce({ conversations: [conversation(FIRST_ID)], nextCursor: null })
      .mockResolvedValueOnce({
        conversations: [conversation(FIRST_ID, { title: "服务端标题", version: 2 })],
        nextCursor: null,
      });
    vi.mocked(client.renameConversation).mockRejectedValue(
      new DailySessionClientError({ code: "CONFLICT", message: "冲突", status: 409 }),
    );
    const { result } = renderHook(() =>
      useDailySessionStore(client, 1, { requestIdFactory: idFactory }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      expect(await result.current.renameConversation(FIRST_ID, "本地标题")).toBe("conflict");
    });

    expect(client.listConversations).toHaveBeenCalledTimes(2);
    expect(result.current.conversations[0]).toMatchObject({
      title: "服务端标题",
      version: 2,
    });
  });

  it("resets for a new identity and suppresses the old response", async () => {
    const oldPage = deferred<{
      conversations: ConversationMetadata[];
      nextCursor: null;
    }>();
    vi.mocked(client.listConversations)
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce({
        conversations: [conversation(SECOND_ID, { title: "新用户会话" })],
        nextCursor: null,
      });
    const { result, rerender } = renderHook(
      ({ generation }) =>
        useDailySessionStore(client, generation, { requestIdFactory: idFactory }),
      { initialProps: { generation: 1 } },
    );

    rerender({ generation: 2 });
    await waitFor(() => expect(result.current.conversations[0]?.title).toBe("新用户会话"));
    await act(async () => {
      oldPage.resolve({
        conversations: [conversation(FIRST_ID, { title: "旧用户迟到会话" })],
        nextCursor: null,
      });
      await oldPage.promise;
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0]?.title).toBe("新用户会话");
  });

  it("invalidates auth when the initial list returns 401", async () => {
    const onAuthRequired = vi.fn();
    vi.mocked(client.listConversations).mockRejectedValue(authRequired());

    renderHook(() =>
      useDailySessionStore(client, 1, { requestIdFactory: idFactory, onAuthRequired }),
    );

    await waitFor(() => expect(onAuthRequired).toHaveBeenCalledOnce());
  });

  it("invalidates auth on pagination 401 and clears loaded rows", async () => {
    const onAuthRequired = vi.fn();
    vi.mocked(client.listConversations)
      .mockResolvedValueOnce({
        conversations: [conversation(FIRST_ID)],
        nextCursor: "next-page",
      })
      .mockRejectedValueOnce(authRequired());
    const { result } = renderHook(() =>
      useDailySessionStore(client, 1, { requestIdFactory: idFactory, onAuthRequired }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => void (await result.current.loadMore()));

    expect(onAuthRequired).toHaveBeenCalledOnce();
    expect(result.current.conversations).toHaveLength(0);
  });

  it("invalidates auth when create returns 401", async () => {
    const onAuthRequired = vi.fn();
    vi.mocked(client.listConversations).mockResolvedValue({
      conversations: [conversation(FIRST_ID)],
      nextCursor: null,
    });
    vi.mocked(client.createConversation).mockRejectedValue(authRequired());
    const { result } = renderHook(() =>
      useDailySessionStore(client, 1, { requestIdFactory: idFactory, onAuthRequired }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => void (await result.current.createConversation()));

    expect(onAuthRequired).toHaveBeenCalledOnce();
    expect(result.current.conversations).toHaveLength(0);
  });

  it("invalidates auth when rename returns 401", async () => {
    const onAuthRequired = vi.fn();
    vi.mocked(client.listConversations).mockResolvedValue({
      conversations: [conversation(FIRST_ID)],
      nextCursor: null,
    });
    vi.mocked(client.renameConversation).mockRejectedValue(authRequired());
    const { result } = renderHook(() =>
      useDailySessionStore(client, 1, { requestIdFactory: idFactory, onAuthRequired }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.renameConversation(FIRST_ID, "新标题");
    });

    expect(onAuthRequired).toHaveBeenCalledOnce();
    expect(result.current.conversations).toHaveLength(0);
  });
});


describe("history deletion", () => {
  it("removes only the confirmed ID after success and keeps same-title siblings", async () => {
    const client = createClient();
    vi.mocked(client.listConversations).mockResolvedValue({ conversations: [conversation(FIRST_ID), conversation(SECOND_ID, { title: conversation(FIRST_ID).title })], nextCursor: null });
    const pending = deferred<void>();
    vi.mocked(client.deleteConversation).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useDailySessionStore(client, 1));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let done!: Promise<boolean>;
    act(() => { done = result.current.deleteConversation(FIRST_ID); });
    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.deletingId).toBe(FIRST_ID);
    await act(async () => { pending.resolve(); await done; });
    expect(result.current.conversations.map(x => x.conversationId)).toEqual([SECOND_ID]);
  });
  it("retains the row and exposes a local error for forbidden deletion", async () => {
    const client = createClient();
    vi.mocked(client.listConversations).mockResolvedValue({ conversations: [conversation(FIRST_ID)], nextCursor: null });
    vi.mocked(client.deleteConversation).mockRejectedValue(new DailySessionClientError({ status: 403, code: "FORBIDDEN", message: "权限不足" }));
    const { result } = renderHook(() => useDailySessionStore(client, 1));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => { expect(await result.current.deleteConversation(FIRST_ID)).toBe(false); });
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.deleteError).toBe("权限不足");
    expect(result.current.deletingId).toBeUndefined();
  });
  it("invalidates auth on 401", async () => {
    const client = createClient(), onAuthRequired = vi.fn();
    vi.mocked(client.listConversations).mockResolvedValue({ conversations: [conversation(FIRST_ID)], nextCursor: null });
    vi.mocked(client.deleteConversation).mockRejectedValue(authRequired());
    const { result } = renderHook(() => useDailySessionStore(client, 1, { onAuthRequired }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => { await result.current.deleteConversation(FIRST_ID); });
    expect(onAuthRequired).toHaveBeenCalledOnce();
    expect(result.current.conversations).toHaveLength(0);
  });
  it("does not resurrect a deleted row when an older page response arrives", async () => {
    const client = createClient(), page = deferred<{ conversations: ConversationMetadata[]; nextCursor: string | null }>();
    vi.mocked(client.listConversations).mockResolvedValueOnce({ conversations: [conversation(FIRST_ID)], nextCursor: "page-2" }).mockReturnValueOnce(page.promise);
    vi.mocked(client.deleteConversation).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDailySessionStore(client, 1));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let loading!: Promise<void>;
    act(() => { loading = result.current.loadMore(); });
    await act(async () => { await result.current.deleteConversation(FIRST_ID); });
    await act(async () => { page.resolve({ conversations: [conversation(FIRST_ID), conversation(SECOND_ID)], nextCursor: null }); await loading; });
    expect(result.current.conversations.map(x => x.conversationId)).toEqual([SECOND_ID]);
  });

  it("ignores deletion completion after identity changes", async () => {
    const client = createClient(), pending = deferred<void>();
    vi.mocked(client.listConversations).mockResolvedValueOnce({ conversations: [conversation(FIRST_ID)], nextCursor: null }).mockResolvedValue({ conversations: [conversation(FIRST_ID, { title: "新用户会话" })], nextCursor: null });
    vi.mocked(client.deleteConversation).mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(({ identity }) => useDailySessionStore(client, identity), { initialProps: { identity: 1 } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let done!: Promise<boolean>;act(() => { done=result.current.deleteConversation(FIRST_ID); });
    rerender({ identity: 2 });
    await waitFor(() => expect(result.current.conversations[0]?.title).toBe("新用户会话"));
    await act(async () => { pending.resolve(); await done; });
    expect(result.current.conversations[0]?.title).toBe("新用户会话");
  });
});

function authRequired() {
  return new DailySessionClientError({
    code: "AUTH_REQUIRED",
    message: "登录已失效",
    status: 401,
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
