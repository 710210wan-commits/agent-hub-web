import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GlobalAuthClient } from "@/features/auth/global-auth-client";
import {
  DailySessionClientError,
  type DailySessionClient,
} from "@/features/chat/transports/daily-session-client";
import type { ConversationMetadata } from "@/features/chat/transports/daily-session-contract";
import { AuthProvider, useAuth } from "@/providers/auth-provider";

import { DailySessionHistory } from "./daily-session-history";

const FIRST_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_ID = "00000000-0000-4000-8000-000000000002";
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function conversation(
  conversationId: string,
  overrides: Partial<ConversationMetadata> = {},
): ConversationMetadata {
  return {
    conversationId,
    scenarioId: "daily",
    agentKey: "agent-loop",
    title: "边境态势分析",
    status: "open",
    archivedAt: null,
    version: 1,
    lastEventSeq: "0",
    lastTurnIndex: "0",
    createdAt: "2026-11-09T00:00:00.000Z",
    updatedAt: "2026-11-09T01:02:00.000Z",
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
  };
}

function createAuthClient(enabled = true): GlobalAuthClient {
  return {
    getAuthStatus: vi.fn().mockResolvedValue(
      enabled
        ? { enabled: true, user: { id: "user-1", displayName: "测试用户" } }
        : { enabled: false },
    ),
    login: vi.fn(),
    loginDemo: vi.fn(),
    logout: vi.fn(),
  };
}

function AuthStatusProbe() {
  const { status } = useAuth();
  return <output data-testid="auth-status">{status}</output>;
}

function renderHistory(
  client: DailySessionClient,
  authClient = createAuthClient(),
) {
  return render(
    <AuthProvider client={authClient}>
      <AuthStatusProbe />
      <DailySessionHistory client={client} />
    </AuthProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("DailySessionHistory", () => {
  beforeEach(() => {
    push.mockReset();
  });

  it("shows loading, an empty state, then paginated links with encoded ids", async () => {
    const client = createClient();
    const initial = deferred<{
      conversations: ConversationMetadata[];
      nextCursor: string | null;
    }>();
    vi.mocked(client.listConversations)
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce({
        conversations: [conversation(SECOND_ID, { title: "第二页" })],
        nextCursor: null,
      });

    renderHistory(client);
    expect(await screen.findByText("正在加载日常历史…")).toBeInTheDocument();

    await act(async () => {
      initial.resolve({ conversations: [], nextCursor: "opaque/+==" });
      await initial.promise;
    });
    expect(await screen.findByText("暂无日常历史会话")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    const list = await screen.findByRole("list", { name: "日常历史会话" });
    expect(within(list).getByRole("link", { name: /第二页/ })).toHaveAttribute(
      "href",
      `/chat?mode=daily&conversation=${SECOND_ID}`,
    );
    expect(client.listConversations).toHaveBeenNthCalledWith(
      2,
      { cursor: "opaque/+==" },
      expect.any(AbortSignal),
    );
  });

  it("creates an untitled persistent conversation and navigates to it", async () => {
    const client = createClient();
    vi.mocked(client.createConversation).mockResolvedValue({
      conversation: conversation(FIRST_ID, { title: "新会话" }),
      reused: false,
    });
    renderHistory(client);

    fireEvent.click(await screen.findByRole("button", { name: "新建持久会话" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/chat?mode=daily&conversation=${FIRST_ID}`,
      ),
    );
    expect(client.createConversation).toHaveBeenCalledWith(
      { clientRequestId: expect.any(String) },
      expect.any(AbortSignal),
    );
  });

  it("offers a stable retry when the create result is unknown", async () => {
    const client = createClient();
    vi.mocked(client.createConversation)
      .mockRejectedValueOnce(
        new DailySessionClientError({ code: "NETWORK_ERROR", message: "secret" }),
      )
      .mockResolvedValueOnce({
        conversation: conversation(FIRST_ID),
        reused: true,
      });
    renderHistory(client);

    fireEvent.click(await screen.findByRole("button", { name: "新建持久会话" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("创建结果暂未确认");
    expect(alert).not.toHaveTextContent("secret");

    fireEvent.click(screen.getByRole("button", { name: "重试创建" }));
    await waitFor(() => expect(push).toHaveBeenCalledOnce());
    expect(
      vi.mocked(client.createConversation).mock.calls[0]?.[0].clientRequestId,
    ).toBe(vi.mocked(client.createConversation).mock.calls[1]?.[0].clientRequestId);
  });

  it("renames inline and refreshes the visible title after a conflict", async () => {
    const client = createClient();
    vi.mocked(client.listConversations)
      .mockResolvedValueOnce({
        conversations: [conversation(FIRST_ID)],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        conversations: [conversation(FIRST_ID, { title: "服务端新标题", version: 2 })],
        nextCursor: null,
      });
    vi.mocked(client.renameConversation).mockRejectedValue(
      new DailySessionClientError({ code: "CONFLICT", message: "secret", status: 409 }),
    );
    renderHistory(client);

    fireEvent.click(
      await screen.findByRole("button", { name: "重命名 边境态势分析" }),
    );
    const input = screen.getByRole("textbox", { name: "会话标题" });
    fireEvent.change(input, { target: { value: "本地新标题" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("服务端新标题")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("已刷新最新内容");
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret");
  });

  it("shows safe list failures and supports retry", async () => {
    const client = createClient();
    vi.mocked(client.listConversations)
      .mockRejectedValueOnce(new Error("upstream secret"))
      .mockResolvedValueOnce({ conversations: [], nextCursor: null });
    renderHistory(client);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "日常历史加载失败，请稍后重试",
    );
    expect(screen.queryByText(/upstream secret/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试加载" }));
    expect(await screen.findByText("暂无日常历史会话")).toBeInTheDocument();
  });

  it("shows a pagination failure beside loaded rows and allows retry", async () => {
    const client = createClient();
    vi.mocked(client.listConversations)
      .mockResolvedValueOnce({
        conversations: [conversation(FIRST_ID)],
        nextCursor: "next-page",
      })
      .mockRejectedValueOnce(new Error("upstream secret"))
      .mockResolvedValueOnce({
        conversations: [conversation(SECOND_ID, { title: "第二页" })],
        nextCursor: null,
      });
    renderHistory(client);

    await screen.findByRole("link", { name: /边境态势分析/ });
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "日常历史加载失败，请稍后重试",
    );
    expect(screen.getByRole("link", { name: /边境态势分析/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    expect(await screen.findByRole("link", { name: /第二页/ })).toBeInTheDocument();
  });

  it("invalidates the global identity when history pagination expires", async () => {
    const client = createClient();
    vi.mocked(client.listConversations)
      .mockResolvedValueOnce({
        conversations: [conversation(FIRST_ID)],
        nextCursor: "next-page",
      })
      .mockRejectedValueOnce(
        new DailySessionClientError({
          code: "AUTH_REQUIRED",
          message: "登录已失效",
          status: 401,
        }),
      );
    renderHistory(client);

    await screen.findByRole("link", { name: /边境态势分析/ });
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));

    await waitFor(() =>
      expect(screen.getByTestId("auth-status")).toHaveTextContent("anonymous"),
    );
    expect(screen.queryByText("边境态势分析")).not.toBeInTheDocument();
  });

  it("shows a full-login notice in demo mode without loading conversations", async () => {
    const client = createClient();
    renderHistory(client, createAuthClient(false));

    expect(
      await screen.findByRole("heading", { name: "完整登录后使用日常会话" }),
    ).toBeInTheDocument();
    expect(client.listConversations).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "退出登录" })).not.toBeInTheDocument();
  });
});
