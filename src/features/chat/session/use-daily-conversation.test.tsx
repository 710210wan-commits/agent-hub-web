import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DailySessionClientError,
  type DailySessionClient,
} from "@/features/chat/transports/daily-session-client";
import type {
  AcceptedConversationTurn,
  ConversationEventPage,
  ConversationMessage,
  ConversationMetadata,
  ConversationPublicEvent,
  ConversationSnapshot,
} from "@/features/chat/transports/daily-session-contract";

import { useDailyConversation } from "./use-daily-conversation";

const conversationId = "10000000-0000-4000-8000-000000000001";
const turnId = "20000000-0000-4000-8000-000000000002";
const taskId = "30000000-0000-4000-8000-000000000003";
const userMessageId = "40000000-0000-4000-8000-000000000004";
const assistantMessageId = "50000000-0000-4000-8000-000000000005";
const createKey = "60000000-0000-4000-8000-000000000006";
const turnKey = "70000000-0000-4000-8000-000000000007";

function metadata(overrides: Partial<ConversationMetadata> = {}): ConversationMetadata {
  return {
    conversationId,
    scenarioId: "daily",
    agentKey: "agent-loop",
    title: "持久会话",
    status: "open",
    archivedAt: null,
    version: 1,
    lastEventSeq: "0",
    lastTurnIndex: "0",
    createdAt: "2026-11-09T01:02:03.000Z",
    updatedAt: "2026-11-09T01:03:04.000Z",
    ...overrides,
  };
}

function message(
  messageId: string,
  role: "user" | "assistant",
  ordinal: string,
): ConversationMessage {
  return {
    messageId,
    conversationId,
    turnId,
    ordinal,
    role,
    content: { kind: "text", text: role === "user" ? "问题" : "最终回答" },
    revision: 1,
    status: "committed",
    artifactRefs: [],
    capabilitySelection: null,
    createdAt: "2026-11-09T01:03:04.000Z",
  };
}

function snapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    conversation: metadata(),
    activeTurn: null,
    messages: [],
    nextCursor: null,
    lastEventSeq: "0",
    ...overrides,
  };
}

function event(
  eventSeq: string,
  type: ConversationPublicEvent["type"],
  payload: Record<string, unknown>,
): ConversationPublicEvent {
  return {
    eventId: `80000000-0000-4000-8000-${eventSeq.padStart(12, "0")}`,
    eventSeq,
    conversationId,
    schemaVersion: 1,
    type,
    occurredAt: "2026-11-09T01:03:04.000Z",
    payload,
    turnId,
    taskId,
    ...(type === "message.created" ? { messageId: userMessageId } : {}),
  } as ConversationPublicEvent;
}

function turn(status: "queued" | "running" | "completed") {
  return {
    turnId,
    taskId,
    turnIndex: "1",
    status,
    acceptedEventSeq: "2",
    errorCode: null,
  } as const;
}

function accepted(): AcceptedConversationTurn {
  return {
    conversationId,
    turnId,
    taskId,
    userMessageId,
    acceptedEventSeq: "2",
    status: "queued",
    reused: false,
  };
}

function emptyPage(afterSeq = "0"): ConversationEventPage {
  return {
    events: [],
    nextAfterSeq: afterSeq,
    lastEventSeq: afterSeq,
    hasMore: false,
  };
}

async function* waitStream(
  events: ConversationPublicEvent[],
  signal?: AbortSignal,
): AsyncIterable<ConversationPublicEvent> {
  for (const item of events) yield item;
  await new Promise<void>((resolve) => {
    if (signal?.aborted) resolve();
    else signal?.addEventListener("abort", () => resolve(), { once: true });
  });
}

function makeClient(
  overrides: Partial<DailySessionClient> = {},
): DailySessionClient {
  return {
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    loadSnapshot: vi.fn(async () => snapshot()),
    loadMessages: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
    submitTurn: vi.fn(),
    listEvents: vi.fn(async (_id, input) => emptyPage(input.afterSeq)),
    streamEvents: vi.fn((_id, _input, signal) => waitStream([], signal)),
    cancelTurn: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("useDailyConversation", () => {
  it("recovers snapshot history through S, buffers future REST events, then streams from S", async () => {
    const historical = [
      event("1", "conversation.created", { version: 1 }),
      event("2", "turn.started", { turn: turn("running") }),
      event("3", "tool.started", {
        stepId: "90000000-0000-4000-8000-000000000009",
        toolCallId: "private-call",
        toolName: "private-tool",
      }),
      event("4", "tool.completed", {
        stepId: "90000000-0000-4000-8000-000000000009",
        toolCallId: "private-call",
        toolName: "private-tool",
        status: "completed",
        turn: 1,
      }),
    ];
    const completed = event("5", "turn.completed", {
      turn: turn("completed"),
      messageId: assistantMessageId,
    });
    const client = makeClient({
      loadSnapshot: vi.fn(async () =>
        snapshot({
          conversation: metadata({ lastEventSeq: "3" }),
          messages: [message(assistantMessageId, "assistant", "2")],
          lastEventSeq: "3",
        }),
      ),
      listEvents: vi.fn(async () => ({
        events: historical,
        nextAfterSeq: "4",
        lastEventSeq: "4",
        hasMore: false,
      })),
      streamEvents: vi.fn((_id, _input, signal) =>
        waitStream([historical[3]!, completed], signal),
      ),
    });
    const { result, unmount } = renderHook(() =>
      useDailyConversation({ client, conversationId, identityGeneration: 4 }),
    );

    await waitFor(() => expect(result.current.state.appliedSeq).toBe("5"));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.state).toMatchObject({
      snapshotWatermark: "3",
      status: "completed",
      completedStepCount: 1,
    });
    expect(client.listEvents).toHaveBeenCalledWith(
      conversationId,
      { afterSeq: "0", limit: 200 },
      expect.any(AbortSignal),
    );
    expect(client.streamEvents).toHaveBeenCalledWith(
      conversationId,
      { afterSeq: "3" },
      expect.any(AbortSignal),
    );
    unmount();
  });

  it("repairs a live sequence gap from REST before applying the SSE event", async () => {
    const queued = event("1", "turn.queued", {
      turn: turn("queued"),
      userMessageId,
    });
    const started = event("2", "turn.started", { turn: turn("running") });
    const client = makeClient({
      listEvents: vi.fn(async (_id, input) =>
        input.afterSeq === "0"
          ? {
              events: [queued],
              nextAfterSeq: "1",
              lastEventSeq: "1",
              hasMore: false,
            }
          : emptyPage(input.afterSeq),
      ),
      streamEvents: vi.fn((_id, _input, signal) =>
        waitStream([started], signal),
      ),
    });
    const { result, unmount } = renderHook(() =>
      useDailyConversation({ client, conversationId, identityGeneration: 1 }),
    );

    await waitFor(() => expect(result.current.state.appliedSeq).toBe("2"));
    expect(result.current.state.activeTurn?.status).toBe("running");
    expect(client.listEvents).toHaveBeenCalledWith(
      conversationId,
      { afterSeq: "0", limit: 200 },
      expect.any(AbortSignal),
    );
    unmount();
  });

  it("resnapshots once on RESYNC_REQUIRED, then stops with readable stale state", async () => {
    const started = event("2", "turn.started", { turn: turn("running") });
    const loadSnapshot = vi
      .fn<DailySessionClient["loadSnapshot"]>()
      .mockResolvedValue(snapshot());
    const client = makeClient({
      loadSnapshot,
      listEvents: vi.fn(async () => {
        throw new DailySessionClientError({
          code: "RESYNC_REQUIRED",
          status: 409,
          message: "事件记录已过期，请重新同步会话",
        });
      }),
      streamEvents: vi.fn((_id, _input, signal) =>
        waitStream([started], signal),
      ),
    });
    const { result, unmount } = renderHook(() =>
      useDailyConversation({ client, conversationId, identityGeneration: 1 }),
    );

    await waitFor(() => expect(result.current.state.status).toBe("stale"));
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.state.notice).toBe("历史执行状态待确认");
    expect(result.current.messages).toEqual([]);
    unmount();
  });

  it("loads a fresh snapshot before opening a stream instead of trusting an orphan cursor", async () => {
    const pendingSnapshot = deferred<ConversationSnapshot>();
    const streamEvents = vi.fn<DailySessionClient["streamEvents"]>(
      (_id, _input, signal) => waitStream([], signal),
    );
    const client = makeClient({
      loadSnapshot: vi.fn(() => pendingSnapshot.promise),
      streamEvents,
    });
    const { unmount } = renderHook(() =>
      useDailyConversation({ client, conversationId, identityGeneration: 1 }),
    );

    await Promise.resolve();
    expect(streamEvents).not.toHaveBeenCalled();
    await act(async () => {
      pendingSnapshot.resolve(snapshot());
      await pendingSnapshot.promise;
    });
    await waitFor(() => expect(streamEvents).toHaveBeenCalledOnce());
    expect(streamEvents).toHaveBeenCalledWith(
      conversationId,
      { afterSeq: "0" },
      expect.any(AbortSignal),
    );
    unmount();
  });

  it("stops on disconnect and reconnects manually from the applied cursor", async () => {
    const disconnected = new DailySessionClientError({
      code: "STREAM_DISCONNECTED",
      message: "会话事件流已断开，请重新连接",
    });
    const streamEvents = vi
      .fn<DailySessionClient["streamEvents"]>()
      .mockImplementationOnce(async function* () {
        throw disconnected;
      })
      .mockImplementationOnce((_id, _input, signal) => waitStream([], signal));
    const client = makeClient({ streamEvents });
    const { result, unmount } = renderHook(() =>
      useDailyConversation({ client, conversationId, identityGeneration: 1 }),
    );

    await waitFor(() => expect(result.current.state.status).toBe("disconnected"));
    act(() => result.current.reconnect());
    await waitFor(() => expect(streamEvents).toHaveBeenCalledTimes(2));

    expect(streamEvents).toHaveBeenLastCalledWith(
      conversationId,
      { afterSeq: "0" },
      expect.any(AbortSignal),
    );
    expect(client.cancelTurn).not.toHaveBeenCalled();
    expect(client.submitTurn).not.toHaveBeenCalled();
    unmount();
  });

  it("keeps stable create and turn keys across an unknown submit retry", async () => {
    const submitTurn = vi
      .fn<DailySessionClient["submitTurn"]>()
      .mockRejectedValueOnce(
        new DailySessionClientError({
          code: "NETWORK_ERROR",
          message: "网络请求失败，请稍后重试",
        }),
      )
      .mockResolvedValueOnce(accepted());
    const client = makeClient({
      createConversation: vi.fn(async () => ({
        conversation: metadata({ lastEventSeq: "1" }),
        reused: false,
      })),
      submitTurn,
      loadSnapshot: vi.fn(async () =>
        snapshot({
          conversation: metadata({ lastEventSeq: "2" }),
          activeTurn: turn("queued"),
          messages: [message(userMessageId, "user", "1")],
          lastEventSeq: "2",
        }),
      ),
      listEvents: vi.fn(async () => ({
        events: [
          event("1", "conversation.created", { version: 1 }),
          event("2", "turn.queued", { turn: turn("queued"), userMessageId }),
        ],
        nextAfterSeq: "2",
        lastEventSeq: "2",
        hasMore: false,
      })),
    });
    const onConversationResolved = vi.fn();
    const idFactory = vi
      .fn()
      .mockReturnValueOnce(createKey)
      .mockReturnValueOnce(turnKey);
    const { result, unmount } = renderHook(() =>
      useDailyConversation({
        client,
        identityGeneration: 1,
        idFactory,
        onConversationResolved,
      }),
    );

    const selection = { knowledgeBaseIds: ["kb-a"], skillIds: ["built-in:aircraft-region-query"], mcpServerIds: ["server-a"] };
    await act(async () => void (await result.current.submit("问题", selection)));
    selection.knowledgeBaseIds.push("kb-late");
    selection.mcpServerIds.push("server-late");
    expect(result.current.state.pendingSend).toMatchObject({
      clientRequestId: turnKey,
      content: "问题",
      status: "unknown",
      capabilitySelection: { knowledgeBaseIds: ["kb-a"], skillIds: ["built-in:aircraft-region-query"], mcpServerIds: ["server-a"] },
    });
    expect(onConversationResolved).not.toHaveBeenCalled();
    await act(async () => void (await result.current.retrySubmit()))
    await waitFor(() => expect(result.current.state.appliedSeq).toBe("2"));

    expect(client.createConversation).toHaveBeenCalledOnce();
    expect(client.createConversation).toHaveBeenCalledWith(
      { clientRequestId: createKey, title: "问题" },
      expect.any(AbortSignal),
    );
    expect(submitTurn).toHaveBeenNthCalledWith(
      1,
      conversationId,
      { clientRequestId: turnKey, input: { kind: "text", text: "问题" }, capabilitySelection: { knowledgeBaseIds: ["kb-a"], skillIds: ["built-in:aircraft-region-query"], mcpServerIds: ["server-a"] } },
      expect.any(AbortSignal),
    );
    expect(submitTurn).toHaveBeenNthCalledWith(
      2,
      conversationId,
      { clientRequestId: turnKey, input: { kind: "text", text: "问题" }, capabilitySelection: { knowledgeBaseIds: ["kb-a"], skillIds: ["built-in:aircraft-region-query"], mcpServerIds: ["server-a"] } },
      expect.any(AbortSignal),
    );
    expect(onConversationResolved).toHaveBeenCalledWith(conversationId);
    expect(result.current.messages).toHaveLength(1);
    unmount();
  });

  it("does not let route catch-up suppress an identity generation reset", async () => {
    const loadSnapshot = vi.fn(async () => snapshot());
    const client = makeClient({
      createConversation: vi.fn(async () => ({
        conversation: metadata(),
        reused: false,
      })),
      submitTurn: vi.fn(async () => accepted()),
      loadSnapshot,
    });
    const ids = [createKey, turnKey];
    const onConversationResolved = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ routeConversationId, generation }) =>
        useDailyConversation({
          client,
          conversationId: routeConversationId,
          identityGeneration: generation,
          idFactory: () => ids.shift() ?? turnKey,
          onConversationResolved,
        }),
      {
        initialProps: {
          routeConversationId: undefined as string | undefined,
          generation: 1,
        },
      },
    );

    await act(async () => void (await result.current.submit("首轮问题")));
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledOnce());
    expect(onConversationResolved).toHaveBeenCalledWith(conversationId);

    rerender({ routeConversationId: conversationId, generation: 2 });

    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(2));
    unmount();
  });

  it("keeps the draft when the backend reports TURN_IN_PROGRESS", async () => {
    const client = makeClient({
      submitTurn: vi.fn(async () => {
        throw new DailySessionClientError({
          code: "TURN_IN_PROGRESS",
          status: 409,
          message: "当前会话已有任务运行中",
        });
      }),
    });
    const { result, unmount } = renderHook(() =>
      useDailyConversation({
        client,
        conversationId,
        identityGeneration: 1,
        idFactory: () => turnKey,
      }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    await act(async () => void (await result.current.submit("保留草稿")));

    expect(result.current.state.pendingSend).toMatchObject({
      clientRequestId: turnKey,
      content: "保留草稿",
      status: "blocked",
    });
    expect(result.current.state.notice).toBe("当前会话已有任务运行中");
    unmount();
  });

  it("cancels only the current active turn and projects queued cancellation locally", async () => {
    const cancelTurn = vi.fn<DailySessionClient["cancelTurn"]>().mockResolvedValue({
      turn: { ...turn("queued"), status: "interrupted" },
    });
    const client = makeClient({
      loadSnapshot: vi.fn(async () =>
        snapshot({ activeTurn: turn("queued") }),
      ),
      cancelTurn,
    });
    const { result, unmount } = renderHook(() =>
      useDailyConversation({ client, conversationId, identityGeneration: 1 }),
    );
    await waitFor(() => expect(result.current.state.activeTurn).not.toBeNull());

    await act(async () => void (await result.current.cancel()));

    expect(cancelTurn).toHaveBeenCalledWith(
      conversationId,
      turnId,
      expect.any(AbortSignal),
    );
    expect(result.current.state.status).toBe("stopped");
    expect(result.current.state.activeTurn?.status).toBe("interrupted");
    unmount();
  });

  it("aborts and ignores a late snapshot after identity generation changes", async () => {
    const oldSnapshot = deferred<ConversationSnapshot>();
    let oldSignal: AbortSignal | undefined;
    const loadSnapshot = vi
      .fn<DailySessionClient["loadSnapshot"]>()
      .mockImplementationOnce((_id, signal) => {
        oldSignal = signal;
        return oldSnapshot.promise;
      })
      .mockResolvedValueOnce(
        snapshot({ conversation: metadata({ title: "新身份会话" }) }),
      );
    const client = makeClient({ loadSnapshot });
    const { result, rerender, unmount } = renderHook(
      ({ generation }) =>
        useDailyConversation({
          client,
          conversationId,
          identityGeneration: generation,
        }),
      { initialProps: { generation: 1 } },
    );
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledOnce());

    rerender({ generation: 2 });
    await waitFor(() =>
      expect(result.current.state.conversation?.title).toBe("新身份会话"),
    );
    expect(oldSignal?.aborted).toBe(true);

    await act(async () => {
      oldSnapshot.resolve(snapshot({ conversation: metadata({ title: "旧身份会话" }) }));
      await oldSnapshot.promise;
    });
    expect(result.current.state.conversation?.title).toBe("新身份会话");
    unmount();
  });

  it("aborts an older-message request when identity generation changes", async () => {
    const olderPage = deferred<Awaited<ReturnType<DailySessionClient["loadMessages"]>>>();
    const newIdentitySnapshot = deferred<ConversationSnapshot>();
    let pageSignal: AbortSignal | undefined;
    const loadMessages = vi
      .fn<DailySessionClient["loadMessages"]>()
      .mockImplementation((_id, _cursor, signal) => {
        pageSignal = signal;
        return olderPage.promise;
      });
    const client = makeClient({
      loadSnapshot: vi
        .fn<DailySessionClient["loadSnapshot"]>()
        .mockResolvedValueOnce(snapshot({ nextCursor: "older" }))
        .mockReturnValueOnce(newIdentitySnapshot.promise),
      loadMessages,
    });
    const { result, rerender, unmount } = renderHook(
      ({ generation }) =>
        useDailyConversation({
          client,
          conversationId,
          identityGeneration: generation,
        }),
      { initialProps: { generation: 1 } },
    );
    await waitFor(() => expect(result.current.state.nextCursor).toBe("older"));

    act(() => void result.current.loadEarlier());
    await waitFor(() => expect(loadMessages).toHaveBeenCalledOnce());
    rerender({ generation: 2 });
    await waitFor(() => expect(client.loadSnapshot).toHaveBeenCalledTimes(2));

    expect(pageSignal?.aborted).toBe(true);
    await act(async () => {
      olderPage.reject(new DOMException("aborted", "AbortError"));
      await olderPage.promise.catch(() => undefined);
    });
    expect(result.current.state.notice).toBeNull();
    newIdentitySnapshot.resolve(snapshot());
    unmount();
  });
});
