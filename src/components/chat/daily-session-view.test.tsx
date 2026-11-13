import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GlobalAuthClient } from "@/features/auth/global-auth-client";
import {
  DailySessionClientError,
  type DailySessionClient,
} from "@/features/chat/transports/daily-session-client";
import type {
  AcceptedConversationTurn,
  ConversationMessage,
  ConversationMetadata,
  ConversationPublicEvent,
  ConversationSnapshot,
} from "@/features/chat/transports/daily-session-contract";
import { AuthProvider, useAuth } from "@/providers/auth-provider";

import { DailySessionView } from "./daily-session-view";

vi.mock("@/features/chat/capabilities/daily-capability-client", () => ({ createDailyCapabilityClient: () => ({ getCatalog: async () => ({
  schemaVersion: 1, scenarioId: "daily",
  knowledgeBases: { status: "available", items: [{ id: "kb-a", name: "真实资料库" }, { id: "kb-b", name: "第二资料库" }] },
  skills: { status: "available", items: [{ id: "built-in:aircraft-region-query", title: "真实查询 Skill" }, { id: "market:report", title: "真实报告 Skill" }] },
  mcpServers: { status: "unavailable", items: [], reasonCode: "MCP_PROVIDER_NOT_CONFIGURED" },
}) }) }));

const conversationId = "10000000-0000-4000-8000-000000000001";
const userA = {
  id: "user-a",
  displayName: "用户 A",
  sessionExpiresAt: "2026-11-10T00:00:00.000Z",
};
const userB = {
  id: "user-b",
  displayName: "用户 B",
  sessionExpiresAt: "2026-11-10T01:00:00.000Z",
};

function metadata(overrides: Partial<ConversationMetadata> = {}): ConversationMetadata {
  return {
    conversationId,
    scenarioId: "daily",
    agentKey: "agent-loop",
    title: "日常持久会话",
    status: "open",
    archivedAt: null,
    version: 1,
    lastEventSeq: "0",
    lastTurnIndex: "2",
    createdAt: "2026-11-09T00:00:00.000Z",
    updatedAt: "2026-11-09T01:00:00.000Z",
    ...overrides,
  };
}

function message(
  messageId: string,
  ordinal: string,
  text: string,
  role: "user" | "assistant" = "assistant",
): ConversationMessage {
  return {
    messageId,
    conversationId,
    turnId: "20000000-0000-4000-8000-000000000002",
    ordinal,
    role,
    content: { kind: "text", text },
    revision: 1,
    status: "committed",
    artifactRefs: [],
    capabilitySelection: null,
    createdAt: "2026-11-09T01:00:00.000Z",
  };
}

function accepted(): AcceptedConversationTurn {
  return {
    conversationId,
    turnId: "20000000-0000-4000-8000-000000000002",
    taskId: "30000000-0000-4000-8000-000000000003",
    userMessageId: "40000000-0000-4000-8000-000000000004",
    acceptedEventSeq: "0",
    status: "queued",
    reused: false,
  };
}

function publicEvent(
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
    occurredAt: "2026-11-09T01:00:00.000Z",
    payload,
    turnId: "20000000-0000-4000-8000-000000000002",
    taskId: "30000000-0000-4000-8000-000000000003",
  } as ConversationPublicEvent;
}

function activeTurn(status: "queued" | "running" | "completed") {
  return {
    turnId: "20000000-0000-4000-8000-000000000002",
    taskId: "30000000-0000-4000-8000-000000000003",
    turnIndex: "1",
    status,
    acceptedEventSeq: "0",
    errorCode: null,
  } as const;
}

function snapshot(
  messages: ConversationMessage[] = [],
  nextCursor: string | null = null,
  activeTurn: ConversationSnapshot["activeTurn"] = null,
): ConversationSnapshot {
  return {
    conversation: metadata(),
    activeTurn,
    messages,
    nextCursor,
    lastEventSeq: "0",
  };
}

function makeClient(overrides: Partial<DailySessionClient> = {}): DailySessionClient {
  return {
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    loadSnapshot: vi.fn(async () => snapshot()),
    loadMessages: vi.fn(),
    renameConversation: vi.fn(),
    submitTurn: vi.fn(),
    listEvents: vi.fn(async (_id, input) => ({
      events: [],
      nextAfterSeq: input.afterSeq,
      lastEventSeq: input.afterSeq,
      hasMore: false,
    })),
    streamEvents: vi.fn(async function* () {}),
    cancelTurn: vi.fn(),
    ...overrides,
  };
}

function makeAuthClient(
  getAuthStatus: GlobalAuthClient["getAuthStatus"] = vi
    .fn()
    .mockResolvedValue({ enabled: true, user: userA }),
): GlobalAuthClient {
  return {
    getAuthStatus,
    login: vi.fn(),
    loginDemo: vi.fn(),
    logout: vi.fn(),
  };
}

function renderView(
  client: DailySessionClient,
  extra?: React.ReactNode,
  authClient = makeAuthClient(),
  initialConversationId: string | null = conversationId,
  onConversationResolved?: (id: string) => void,
) {
  return render(
    <AuthProvider client={authClient}>
      {extra}
      <DailySessionView
        client={client}
        conversationId={initialConversationId ?? undefined}
        onConversationResolved={onConversationResolved}
      />
    </AuthProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function IdentityRetry() {
  const auth = useAuth();
  return <button onClick={auth.retry}>切换身份</button>;
}

function AuthStatusProbe() {
  const auth = useAuth();
  return <output data-testid="auth-status">{auth.status}</output>;
}

describe("DailySessionView", () => {
  it("keeps catalog 403 local and invalidates global auth on 401", async () => {
    const capabilityClient = { getCatalog: vi.fn().mockRejectedValue(new DailySessionClientError({ status: 403, code: "FORBIDDEN", message: "denied" })) };
    const view = render(<AuthProvider client={makeAuthClient()}><AuthStatusProbe /><DailySessionView client={makeClient()} capabilityClient={capabilityClient} /></AuthProvider>);
    expect(await screen.findByText("知识库：暂无权限访问能力目录")).toBeInTheDocument();
    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
    view.unmount();
    const unauthorized = { getCatalog: vi.fn().mockRejectedValue(new DailySessionClientError({ status: 401, code: "AUTH_REQUIRED", message: "expired" })) };
    render(<AuthProvider client={makeAuthClient()}><AuthStatusProbe /><DailySessionView client={makeClient()} capabilityClient={unauthorized} /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("auth-status")).not.toHaveTextContent("authenticated"));
  });
  it("does not request capability catalog without authenticated identity", async () => {
    const capabilityClient = { getCatalog: vi.fn() };
    render(<AuthProvider client={makeAuthClient(vi.fn().mockResolvedValue({ enabled: true, user: null }))}><DailySessionView client={makeClient()} capabilityClient={capabilityClient} /></AuthProvider>);
    await screen.findByRole("heading", { name: "完整登录后使用日常会话" });
    expect(capabilityClient.getCatalog).not.toHaveBeenCalled();
  });
  it("shows section-specific disabled and unavailable states", async () => {
    const capabilityClient = { getCatalog: vi.fn().mockResolvedValue({ schemaVersion: 1, scenarioId: "daily",
      knowledgeBases: { status: "disabled", items: [], reasonCode: "KNOWLEDGE_BASE_DISABLED" },
      skills: { status: "unavailable", items: [], reasonCode: "SKILL_CATALOG_UNAVAILABLE" },
      mcpServers: { status: "unavailable", items: [], reasonCode: "MCP_PROVIDER_NOT_CONFIGURED" } }) };
    render(<AuthProvider client={makeAuthClient()}><DailySessionView client={makeClient()} capabilityClient={capabilityClient} /></AuthProvider>);
    expect(await screen.findByText("知识库：已禁用")).toBeInTheDocument();
    expect(screen.getByText("Skill：暂不可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^知识库/ })).toBeDisabled();
  });
  it("shows persisted selection as read-only chips even when catalog resources disappeared", async () => {
    const historical = { ...message("40000000-0000-4000-8000-000000000019", "1", "旧提问"), role: "user" as const,
      capabilitySelection: { knowledgeBaseIds: ["deleted-kb"], skillIds: ["market:old-publication"], mcpServerIds: ["deleted-mcp"] } };
    renderView(makeClient({ loadSnapshot: vi.fn(async () => snapshot([historical])) }));
    expect(await screen.findByText("知识库 · deleted-kb")).toBeInTheDocument();
    expect(screen.getByText("Skill · market:old-publication")).toBeInTheDocument();
    expect(screen.getByText("MCP · deleted-mcp")).toBeInTheDocument();
    expect(screen.getByLabelText("本轮能力").querySelector("button,input")).toBeNull();
  });
  it("loads real multi-select capabilities and keeps MCP unavailable", async () => {
    const client = makeClient({ createConversation: vi.fn(async () => ({ conversation: metadata(), reused: false })), submitTurn: vi.fn(async () => accepted()) });
    renderView(client, undefined, makeAuthClient(), null);

    expect(
      await screen.findByRole("heading", { name: "今天想聊些什么？" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "消息" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /^知识库/ })).toBeEnabled());
    expect(screen.getByRole("button", { name: /^Skill/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^MCP/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^知识库/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "真实资料库" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "第二资料库" }));
    expect(screen.getByRole("button", { name: "知识库 · 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Skill/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "真实查询 Skill" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "真实报告 Skill" }));
    fireEvent.change(screen.getByRole("textbox", { name: "消息" }), { target: { value: "使用选中能力" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(client.submitTurn).toHaveBeenCalledWith(conversationId, expect.objectContaining({
      capabilitySelection: { knowledgeBaseIds: ["kb-a", "kb-b"], skillIds: ["built-in:aircraft-region-query", "market:report"], mcpServerIds: [] },
    }), expect.any(AbortSignal)));
    expect(screen.getByRole("button", { name: "知识库 · 2" })).toBeInTheDocument();
    expect(screen.queryByText("项目资料库")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent Loop")).not.toBeInTheDocument();
  });

  it("submits MCP IDs only and retries the original snapshot after selection changes", async () => {
    const capabilityClient = { getCatalog: vi.fn().mockResolvedValue({ schemaVersion: 1, scenarioId: "daily",
      knowledgeBases: { status: "available", items: [] }, skills: { status: "available", items: [] },
      mcpServers: { status: "available", items: [
        { id: "server-a", name: "船舶查询", description: "" },
        { id: "server-b", name: "飞机查询", description: "" },
      ] },
    }) };
    const submitTurn = vi.fn().mockRejectedValueOnce(new DailySessionClientError({ status: 503, code: "NETWORK_ERROR", message: "发送结果尚未确认" }))
      .mockResolvedValue(accepted());
    const client = makeClient({ submitTurn });
    render(<AuthProvider client={makeAuthClient()}><DailySessionView client={client} conversationId={conversationId} capabilityClient={capabilityClient} /></AuthProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "MCP" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "MCP" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "船舶查询" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "飞机查询" }));
    fireEvent.change(screen.getByRole("textbox", { name: "消息" }), { target: { value: "查询态势" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await screen.findByRole("button", { name: "重试发送" });
    const original = submitTurn.mock.calls[0][1];
    expect(original).toEqual({ clientRequestId: expect.any(String), input: { kind: "text", text: "查询态势" },
      capabilitySelection: { knowledgeBaseIds: [], skillIds: [], mcpServerIds: ["server-a", "server-b"] } });
    fireEvent.click(screen.getByRole("checkbox", { name: "船舶查询" }));
    expect(screen.getByRole("button", { name: "MCP · 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试发送" }));
    await waitFor(() => expect(submitTurn).toHaveBeenCalledTimes(2));
    expect(submitTurn.mock.calls[1][1]).toEqual(original);
    expect(screen.getByRole("button", { name: "MCP · 1" })).toBeInTheDocument();
  });

  it("creates on first send, resolves the route only after turn acceptance, and keeps the controller on URL catch-up", async () => {
    const onConversationResolved = vi.fn();
    const client = makeClient({
      createConversation: vi.fn(async () => ({
        conversation: metadata(),
        reused: false,
      })),
      submitTurn: vi.fn(async () => accepted()),
    });
    const authClient = makeAuthClient();
    const view = renderView(
      client,
      undefined,
      authClient,
      null,
      onConversationResolved,
    );

    fireEvent.change(await screen.findByRole("textbox", { name: "消息" }), {
      target: { value: "首轮问题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(onConversationResolved).toHaveBeenCalledWith(conversationId));
    expect(client.createConversation).toHaveBeenCalledOnce();
    expect(client.submitTurn).toHaveBeenCalledOnce();

    view.rerender(
      <AuthProvider client={authClient}>
        <DailySessionView
          client={client}
          conversationId={conversationId}
          onConversationResolved={onConversationResolved}
        />
      </AuthProvider>,
    );
    expect(client.loadSnapshot).toHaveBeenCalledOnce();
    expect(client.submitTurn).toHaveBeenCalledOnce();
  });

  it("shows only safe activity text before the final canonical answer", async () => {
    const releaseFinal = deferred<void>();
    const assistant = message(
      "50000000-0000-4000-8000-000000000005",
      "2",
      "最终正文",
    );
    const client = makeClient({
      streamEvents: vi.fn(async function* () {
        yield publicEvent("1", "turn.started", { turn: activeTurn("running") });
        yield publicEvent("2", "tool.started", {
          stepId: "private-step",
          toolCallId: "private-call",
          toolName: "private-tool-name",
        });
        await releaseFinal.promise;
        yield {
          ...publicEvent("3", "message.created", { message: assistant }),
          messageId: assistant.messageId,
        } as ConversationPublicEvent;
        yield publicEvent("4", "turn.completed", {
          turn: activeTurn("completed"),
          messageId: assistant.messageId,
        });
      }),
    });
    renderView(client);

    expect(await screen.findByText("正在使用工具…")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private-tool-name");
    await act(async () => {
      releaseFinal.resolve();
      await releaseFinal.promise;
    });
    expect(await screen.findByText("最终正文")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-line")).not.toBeInTheDocument();
  });

  it("uses canonical cancel for an active turn", async () => {
    const client = makeClient({
      loadSnapshot: vi.fn(async () =>
        snapshot([], null, activeTurn("running")),
      ),
      cancelTurn: vi.fn(async () => ({
        turn: {
          ...activeTurn("running"),
          status: "cancelling" as const,
        },
      })),
    });
    renderView(client);

    fireEvent.click(await screen.findByRole("button", { name: "停止" }));
    await waitFor(() =>
      expect(client.cancelTurn).toHaveBeenCalledWith(
        conversationId,
        activeTurn("running").turnId,
        expect.any(AbortSignal),
      ),
    );
  });

  it("shows the queued activity as one safe line", async () => {
    renderView(
      makeClient({
        loadSnapshot: vi.fn(async () =>
          snapshot([], null, activeTurn("queued")),
        ),
      }),
    );

    expect(await screen.findByText("正在准备…")).toBeInTheDocument();
    expect(screen.getAllByTestId("activity-line")).toHaveLength(1);
  });

  it("offers reconnect after a stream disconnect without offering regenerate", async () => {
    const streamEvents = vi
      .fn<DailySessionClient["streamEvents"]>()
      .mockImplementationOnce(async function* () {
        throw new DailySessionClientError({
          code: "STREAM_DISCONNECTED",
          message: "连接断开",
        });
      })
      .mockImplementation(async function* () {});
    renderView(makeClient({ streamEvents }));

    fireEvent.click(await screen.findByRole("button", { name: "重新连接" }));
    await waitFor(() => expect(streamEvents).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "重新生成" })).not.toBeInTheDocument();
  });

  it("prepends older messages with the opaque cursor and removes duplicates", async () => {
    const duplicate = message(
      "40000000-0000-4000-8000-000000000006",
      "3",
      "保留当前副本",
    );
    const client = makeClient({
      loadSnapshot: vi.fn(async () =>
        snapshot(
          [
            duplicate,
            message("40000000-0000-4000-8000-000000000007", "4", "最新消息"),
          ],
          "opaque /+==",
        ),
      ),
      loadMessages: vi.fn(async () => ({
        messages: [
          message("40000000-0000-4000-8000-000000000008", "1", "更早消息"),
          { ...duplicate, content: { kind: "text", text: "旧页重复副本" } },
        ],
        nextCursor: null,
        lastEventSeq: "5",
      })),
    });
    renderView(client);
    await screen.findByText("最新消息");

    fireEvent.click(screen.getByRole("button", { name: "加载更早消息" }));

    await screen.findByText("更早消息");
    expect(client.loadMessages).toHaveBeenCalledWith(
      conversationId,
      "opaque /+==",
      expect.any(AbortSignal),
    );
    expect(screen.queryByText("旧页重复副本")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("article").map((article) => article.textContent),
    ).toEqual([
      expect.stringContaining("更早消息"),
      expect.stringContaining("保留当前副本"),
      expect.stringContaining("最新消息"),
    ]);
  });

  it("continues an existing history conversation with a second canonical turn", async () => {
    const client = makeClient({
      loadSnapshot: vi.fn(async () =>
        snapshot([
          message("40000000-0000-4000-8000-000000000010", "1", "历史问题", "user"),
          message("50000000-0000-4000-8000-000000000011", "2", "历史回答"),
        ]),
      ),
      submitTurn: vi.fn(async () => accepted()),
    });
    renderView(client);
    await screen.findByText("历史回答");

    fireEvent.change(screen.getByRole("textbox", { name: "消息" }), {
      target: { value: "继续追问" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() =>
      expect(client.submitTurn).toHaveBeenCalledWith(
        conversationId,
        expect.objectContaining({
          input: { kind: "text", text: "继续追问" },
        }),
        expect.any(AbortSignal),
      ),
    );
    expect(client.createConversation).not.toHaveBeenCalled();
    expect(screen.getByText("继续追问")).toBeInTheDocument();
  });

  it("treats an empty persisted snapshot as a normal writable conversation", async () => {
    renderView(makeClient());

    expect(await screen.findByText("这个持久会话暂时没有消息")).toBeInTheDocument();
    expect(screen.getByText("日常持久会话")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("invalidates global auth on 401 and uses one safe message for 404", async () => {
    const unauthorized = makeClient({
      loadSnapshot: vi.fn(async () => {
        throw new DailySessionClientError({
          code: "AUTH_REQUIRED",
          status: 401,
          message: "登录状态已失效，请重新登录",
        });
      }),
    });
    const first = renderView(unauthorized, <AuthStatusProbe />);
    await waitFor(() =>
      expect(screen.getByTestId("auth-status")).toHaveTextContent("anonymous"),
    );
    first.unmount();

    const notFound = makeClient({
      loadSnapshot: vi.fn(async () => {
        throw new DailySessionClientError({
          code: "NOT_FOUND",
          status: 404,
          message: "PRIVATE_OWNER_DETAIL",
        });
      }),
    });
    renderView(notFound);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "会话不存在、已删除或不属于当前用户",
    );
    expect(document.body).not.toHaveTextContent("PRIVATE_OWNER_DETAIL");
  });

  it("shows a safe retry state for malformed or unknown failures", async () => {
    const loadSnapshot = vi
      .fn<DailySessionClient["loadSnapshot"]>()
      .mockRejectedValueOnce(
        new DailySessionClientError({
          code: "INVALID_RESPONSE",
          status: 200,
          message: "服务响应格式错误，请稍后重试",
        }),
      )
      .mockResolvedValueOnce(snapshot());
    renderView(makeClient({ loadSnapshot }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "服务响应格式错误，请稍后重试",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试加载" }));
    expect(await screen.findByText("这个持久会话暂时没有消息")).toBeInTheDocument();
  });

  it("aborts and clears user A before loading user B", async () => {
    const nextIdentity = deferred<{
      enabled: true;
      user: typeof userB;
    }>();
    const oldSnapshot = deferred<ConversationSnapshot>();
    let oldSignal: AbortSignal | undefined;
    const getAuthStatus = vi
      .fn<GlobalAuthClient["getAuthStatus"]>()
      .mockResolvedValueOnce({ enabled: true, user: userA })
      .mockReturnValueOnce(nextIdentity.promise);
    const client = makeClient({
      loadSnapshot: vi
        .fn<DailySessionClient["loadSnapshot"]>()
        .mockImplementationOnce((_id, signal) => {
          oldSignal = signal;
          return oldSnapshot.promise;
        })
        .mockResolvedValueOnce(
          snapshot([
            message("40000000-0000-4000-8000-000000000009", "1", "用户 B 消息"),
          ]),
        ),
    });
    renderView(client, <IdentityRetry />, makeAuthClient(getAuthStatus));
    await waitFor(() => expect(client.loadSnapshot).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "切换身份" }));
    expect(oldSignal?.aborted).toBe(true);
    expect(screen.queryByText("用户 A 消息")).not.toBeInTheDocument();

    await act(async () => {
      nextIdentity.resolve({ enabled: true, user: userB });
      await nextIdentity.promise;
    });
    expect(await screen.findByText("用户 B 消息")).toBeInTheDocument();

    await act(async () => {
      oldSnapshot.resolve(
        snapshot([
          message("40000000-0000-4000-8000-000000000010", "1", "用户 A 迟到消息"),
        ]),
      );
      await oldSnapshot.promise;
    });
    expect(screen.queryByText("用户 A 迟到消息")).not.toBeInTheDocument();
  });

  it("shows a full-login notice in demo mode without loading the snapshot", async () => {
    const client = makeClient();
    renderView(
      client,
      undefined,
      makeAuthClient(vi.fn().mockResolvedValue({ enabled: false })),
    );

    expect(
      await screen.findByRole("heading", { name: "完整登录后使用日常会话" }),
    ).toBeInTheDocument();
    expect(client.loadSnapshot).not.toHaveBeenCalled();
  });
});
