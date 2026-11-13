import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/providers/auth-provider";
import { ModeProvider } from "@/providers/mode-provider";

import HistoryPage from "./page";

const mocks = vi.hoisted(() => {
  const listSessions = vi.fn();
  const loadSession = vi.fn();
  const getAuthStatus = vi.fn();
  const logout = vi.fn();
  const listConversations = vi.fn();
  const createConversation = vi.fn();
  const renameConversation = vi.fn();
  const dailyClient = {
    listConversations,
    createConversation,
    loadSnapshot: vi.fn(),
    loadMessages: vi.fn(),
    renameConversation,
  };
  const globalAuthClient = {
    getAuthStatus,
    login: vi.fn(),
    loginDemo: vi.fn(),
    logout,
  };
  return {
    search: "mode=work",
    push: vi.fn(),
    replace: vi.fn(),
    listSessions,
    loadSession,
    getAuthStatus,
    logout,
    listConversations,
    createConversation,
    renameConversation,
    dailyClient,
    globalAuthClient,
    createDailySessionClient: vi.fn(() => dailyClient),
    createXiaozhiTransport: vi.fn(() => ({
      kind: "xiaozhi" as const,
      capabilities: { selections: false, answerDeltas: true, resume: false },
      sessions: { listSessions, loadSession },
      createRun: vi.fn(),
      streamRun: async function* () {},
      abortRun: vi.fn(async () => undefined),
    })),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/history",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/features/chat/transports/xiaozhi-transport", () => ({
  createXiaozhiTransport: mocks.createXiaozhiTransport,
}));

vi.mock("@/features/chat/transports/daily-session-client", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/chat/transports/daily-session-client")
  >();
  return { ...actual, createDailySessionClient: mocks.createDailySessionClient };
});

function renderPage() {
  return render(
    <AuthProvider client={mocks.globalAuthClient}>
      <ModeProvider>
        <HistoryPage />
      </ModeProvider>
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

describe("HistoryPage", () => {
  beforeEach(() => {
    mocks.search = "mode=work";
    mocks.push.mockClear();
    mocks.replace.mockClear();
    mocks.listSessions.mockReset();
    mocks.loadSession.mockReset();
    mocks.createXiaozhiTransport.mockClear();
    mocks.getAuthStatus.mockReset().mockResolvedValue({
      enabled: true,
      xiaozhiUrl: "http://xiaozhi.local",
      user: {
        id: "daily-user",
        displayName: "日常用户",
        sessionExpiresAt: "2026-11-10T00:00:00.000Z",
      },
    });
    mocks.logout.mockReset().mockResolvedValue(undefined);
    mocks.listConversations.mockReset().mockResolvedValue({
      conversations: [],
      nextCursor: null,
    });
    mocks.createConversation.mockReset();
    mocks.renameConversation.mockReset();
    mocks.createDailySessionClient.mockClear();
  });

  it("shows work sessions pinned first then newest and links encoded thread ids", async () => {
    mocks.listSessions.mockResolvedValue([
      {
        id: "ordinary-new",
        title: "普通最新",
        updatedAt: Date.parse("2026-11-06T09:00:00Z"),
        isPinned: false,
      },
      {
        id: "thread/../?x=1#frag",
        title: "置顶较早",
        updatedAt: Date.parse("2026-11-05T08:00:00Z"),
        isPinned: true,
      },
      {
        id: "pinned-new",
        title: "置顶最新",
        updatedAt: Date.parse("2026-11-06T08:00:00Z"),
        isPinned: true,
      },
    ]);

    renderPage();

    const list = await screen.findByRole("list", { name: "工作历史会话" });
    expect(
      within(list)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      expect.stringContaining("置顶最新"),
      expect.stringContaining("置顶较早"),
      expect.stringContaining("普通最新"),
    ]);
    expect(within(list).getAllByText("置顶")).toHaveLength(2);
    expect(within(list).getByRole("link", { name: /置顶较早/ })).toHaveAttribute(
      "href",
      "/chat?mode=2&conversation=thread%2F..%2F%3Fx%3D1%23frag",
    );
  });

  it("shows explicit loading and empty states", async () => {
    const pending = deferred<never[]>();
    mocks.listSessions.mockReturnValue(pending.promise);
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("正在加载工作历史");

    await act(async () => {
      pending.resolve([]);
      await pending.promise;
    });
    expect(await screen.findByText("暂无工作历史会话")).toBeInTheDocument();
  });

  it("shows a safe error state when session loading fails", async () => {
    mocks.listSessions.mockRejectedValue(new Error("upstream secret detail"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "历史会话加载失败，请稍后重试",
    );
    expect(screen.queryByText(/upstream secret detail/)).not.toBeInTheDocument();
  });

  it("shows authenticated daily history without touching Xiaozhi", async () => {
    mocks.search = "mode=daily";
    mocks.listSessions.mockResolvedValue([
      {
        id: "work-only",
        title: "不应出现的办公记录",
        updatedAt: 1,
        isPinned: false,
      },
    ]);

    renderPage();

    expect(await screen.findByText("暂无决策历史会话")).toBeInTheDocument();
    expect(screen.getByText("日常用户")).toBeInTheDocument();
    expect(screen.queryByText("不应出现的办公记录")).not.toBeInTheDocument();
    expect(mocks.createXiaozhiTransport).not.toHaveBeenCalled();
    expect(mocks.listSessions).not.toHaveBeenCalled();
    expect(mocks.listConversations).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("button", { name: "退出登录" })).toHaveLength(1);
    expect(
      screen.queryByRole("heading", { name: "登录日常会话" }),
    ).not.toBeInTheDocument();
  });

  it("aborts the old work request and ignores its result after switching daily", async () => {
    const pending = deferred<
      Array<{
        id: string;
        title: string;
        updatedAt: number;
        isPinned: boolean;
      }>
    >();
    let signal: AbortSignal | undefined;
    mocks.listSessions.mockImplementation((nextSignal?: AbortSignal) => {
      signal = nextSignal;
      return pending.promise;
    });
    const view = renderPage();
    await waitFor(() => expect(mocks.listSessions).toHaveBeenCalledOnce());

    mocks.search = "mode=daily";
    view.rerender(
      <AuthProvider client={mocks.globalAuthClient}>
        <ModeProvider>
          <HistoryPage />
        </ModeProvider>
      </AuthProvider>,
    );
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      pending.resolve([
        {
          id: "late-work",
          title: "迟到的办公记录",
          updatedAt: 1,
          isPinned: false,
        },
      ]);
      await pending.promise;
    });
    expect(await screen.findByText("暂无决策历史会话")).toBeInTheDocument();
    expect(screen.queryByText("迟到的办公记录")).not.toBeInTheDocument();
  });
});
