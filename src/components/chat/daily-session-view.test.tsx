import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GlobalAuthClient } from "@/features/auth/global-auth-client";
import {
  DailySessionClientError,
  type DailySessionClient,
} from "@/features/chat/transports/daily-session-client";
import type {
  ConversationMessage,
  ConversationMetadata,
  ConversationSnapshot,
} from "@/features/chat/transports/daily-session-contract";
import { AuthProvider, useAuth } from "@/providers/auth-provider";

import { DailySessionView } from "./daily-session-view";

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
    lastEventSeq: "5",
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
    createdAt: "2026-11-09T01:00:00.000Z",
  };
}

function snapshot(
  messages: ConversationMessage[] = [],
  nextCursor: string | null = null,
): ConversationSnapshot {
  return {
    conversation: metadata(),
    activeTurn: null,
    messages,
    nextCursor,
    lastEventSeq: "5",
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
    listEvents: vi.fn(),
    streamEvents: vi.fn(),
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
) {
  return render(
    <AuthProvider client={authClient}>
      {extra}
      <DailySessionView client={client} conversationId={conversationId} />
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
  it("loads a snapshot as read-only messages without composer actions", async () => {
    const pending = deferred<ConversationSnapshot>();
    const client = makeClient({ loadSnapshot: vi.fn(() => pending.promise) });
    renderView(client);

    expect(await screen.findByText("正在加载历史会话…")).toBeInTheDocument();
    await act(async () => {
      pending.resolve(
        snapshot([
          message("40000000-0000-4000-8000-000000000004", "1", "历史问题", "user"),
          message("40000000-0000-4000-8000-000000000005", "2", "历史回答"),
        ]),
      );
      await pending.promise;
    });

    expect(await screen.findByText("历史回答")).toBeInTheDocument();
    expect(screen.getByText("当前为只读历史，会话发送将在后续阶段开放")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "消息" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送" })).not.toBeInTheDocument();
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

  it("treats an empty snapshot as a normal read-only conversation", async () => {
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
