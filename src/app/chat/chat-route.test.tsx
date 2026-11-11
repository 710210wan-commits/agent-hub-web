import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatTransport } from "@/features/chat/contracts/transport";
import { AuthProvider } from "@/providers/auth-provider";
import { ModeProvider } from "@/providers/mode-provider";

import ChatRoute from "./page";

const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  const push = vi.fn();
  const dailyLoadSession = vi.fn();
  const workLoadSession = vi.fn();
  const getAuthStatus = vi.fn();
  const loadSnapshot = vi.fn();
  const loadMessages = vi.fn();
  const dailyTransport: ChatTransport = {
    kind: "mock",
    capabilities: { selections: true, answerDeltas: true, resume: true },
    createRun: vi.fn(async () => ({ runId: "daily-run" })),
    streamRun: async function* () {
      yield { type: "answer.done", content: "日常回答" } as const;
    },
    abortRun: vi.fn(async () => undefined),
    sessions: {
      listSessions: vi.fn(async () => []),
      loadSession: dailyLoadSession,
    },
  };
  const workTransport: ChatTransport = {
    kind: "xiaozhi",
    capabilities: { selections: false, answerDeltas: true, resume: false },
    createRun: vi.fn(async () => ({
      runId: "work-run",
      sessionId: "thread/created",
    })),
    streamRun: async function* () {
      yield { type: "answer.done", content: "办公回答" } as const;
    },
    abortRun: vi.fn(async () => undefined),
    sessions: {
      listSessions: vi.fn(async () => []),
      loadSession: workLoadSession,
    },
  };
  const dailySessionClient = {
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    loadSnapshot,
    loadMessages,
    renameConversation: vi.fn(),
  };
  const globalAuthClient = {
    getAuthStatus,
    login: vi.fn(),
    loginDemo: vi.fn(),
    logout: vi.fn(),
  };
  return {
    search: "mode=work",
    replace,
    push,
    dailyLoadSession,
    workLoadSession,
    getAuthStatus,
    loadSnapshot,
    loadMessages,
    dailySessionClient,
    globalAuthClient,
    dailyTransport,
    workTransport,
    createChatTransport: vi.fn(() => dailyTransport),
    createProjectsNewTransport: vi.fn(() => dailyTransport),
    createXiaozhiTransport: vi.fn(() => workTransport),
    createDailySessionClient: vi.fn(() => dailySessionClient),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/config/env", () => ({
  readPublicRuntimeConfig: () => ({
    transport: "mock",
    apiBaseUrl: "/agent-api",
    legacyFrontendUrl: "http://localhost:5000",
  }),
}));

vi.mock("@/features/chat/transports/create-transport", () => ({
  createChatTransport: mocks.createChatTransport,
}));

vi.mock("@/features/chat/transports/projects-new-transport", () => ({
  createProjectsNewTransport: mocks.createProjectsNewTransport,
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

function renderRoute() {
  return render(
    <AuthProvider client={mocks.globalAuthClient}>
      <ModeProvider>
        <ChatRoute />
      </ModeProvider>
    </AuthProvider>,
  );
}

describe("ChatRoute", () => {
  beforeEach(() => {
    mocks.search = "mode=work";
    mocks.replace.mockClear();
    mocks.push.mockClear();
    mocks.dailyLoadSession.mockReset();
    mocks.workLoadSession.mockReset();
    mocks.createChatTransport.mockClear();
    mocks.createProjectsNewTransport.mockClear();
    mocks.createXiaozhiTransport.mockClear();
    mocks.createDailySessionClient.mockClear();
    mocks.getAuthStatus.mockReset().mockResolvedValue({
      enabled: true,
      xiaozhiUrl: "http://xiaozhi.local",
      user: {
        id: "daily-user",
        displayName: "日常用户",
        sessionExpiresAt: "2026-11-10T00:00:00.000Z",
      },
    });
    mocks.loadSnapshot.mockReset().mockResolvedValue({
      conversation: {
        conversationId: "10000000-0000-4000-8000-000000000001",
        scenarioId: "daily",
        agentKey: "agent-loop",
        title: "日常历史",
        status: "open",
        archivedAt: null,
        version: 1,
        lastEventSeq: "2",
        lastTurnIndex: "1",
        createdAt: "2026-11-09T00:00:00.000Z",
        updatedAt: "2026-11-09T01:00:00.000Z",
      },
      activeTurn: null,
      messages: [
        {
          messageId: "40000000-0000-4000-8000-000000000004",
          conversationId: "10000000-0000-4000-8000-000000000001",
          turnId: "20000000-0000-4000-8000-000000000002",
          ordinal: "2",
          role: "assistant",
          content: { kind: "text", text: "日常持久回答" },
          revision: 1,
          status: "committed",
          artifactRefs: [],
          createdAt: "2026-11-09T01:00:00.000Z",
        },
      ],
      nextCursor: null,
      lastEventSeq: "2",
    });
    mocks.loadMessages.mockReset();
    vi.stubEnv("NEXT_PUBLIC_E2E_SCENARIOS", "1");
  });

  it("renders work chat with the Xiaozhi transport", () => {
    renderRoute();

    expect(screen.getByRole("textbox", { name: "消息" })).toBeInTheDocument();
    expect(mocks.createXiaozhiTransport).toHaveBeenCalledOnce();
    expect(mocks.createChatTransport).not.toHaveBeenCalled();
  });

  it("keeps daily mode on the existing transport", () => {
    mocks.search = "mode=daily";
    renderRoute();

    expect(screen.getByRole("textbox", { name: "消息" })).toBeInTheDocument();
    expect(mocks.createChatTransport).toHaveBeenCalledOnce();
    expect(mocks.createXiaozhiTransport).not.toHaveBeenCalled();
    expect(mocks.createDailySessionClient).not.toHaveBeenCalled();
  });

  it("routes a daily conversation to the read-only Session client", async () => {
    mocks.search =
      "mode=daily&conversation=10000000-0000-4000-8000-000000000001";
    renderRoute();

    expect(await screen.findByText("日常持久回答")).toBeInTheDocument();
    expect(mocks.loadSnapshot).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001",
      expect.any(AbortSignal),
    );
    expect(mocks.createChatTransport).not.toHaveBeenCalled();
    expect(mocks.dailyLoadSession).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "消息" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "退出登录" })).toHaveLength(1);
    expect(
      screen.queryByRole("heading", { name: "登录日常会话" }),
    ).not.toBeInTheDocument();
  });

  it("never lets the E2E real-backend override replace work transport", () => {
    mocks.search = "mode=work&backend=real";
    renderRoute();

    expect(mocks.createXiaozhiTransport).toHaveBeenCalledOnce();
    expect(mocks.createProjectsNewTransport).not.toHaveBeenCalled();
  });

  it("loads work conversations only through the work transport", async () => {
    mocks.search = "mode=work&conversation=thread-work";
    mocks.workLoadSession.mockResolvedValue({
      session: {
        id: "thread-work",
        title: "历史会话",
        updatedAt: 2,
        isPinned: false,
      },
      messages: [
        { id: "m1", role: "user", content: "历史问题", createdAt: 1 },
        { id: "m2", role: "assistant", content: "历史回答", createdAt: 2 },
      ],
    });
    renderRoute();

    expect(await screen.findByText("历史回答")).toBeInTheDocument();
    expect(mocks.workLoadSession).toHaveBeenCalledWith(
      "thread-work",
      expect.any(AbortSignal),
    );
    expect(mocks.loadSnapshot).not.toHaveBeenCalled();
  });

  it("replaces draft URL with the newly persisted work conversation", async () => {
    mocks.search = "mode=work&draft=nonce-1&panel=open";
    renderRoute();
    fireEvent.change(screen.getByRole("textbox", { name: "消息" }), {
      target: { value: "生成周报" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce());
    const replaced = new URL(
      String(mocks.replace.mock.calls[0]?.[0]),
      "https://agent-hub.test",
    );
    expect(replaced.pathname).toBe("/chat");
    expect(replaced.searchParams.get("mode")).toBe("work");
    expect(replaced.searchParams.get("conversation")).toBe("thread/created");
    expect(replaced.searchParams.get("panel")).toBe("open");
    expect(replaced.searchParams.has("draft")).toBe(false);
  });

  it("keeps the active stream mounted when its new conversation reaches the URL", async () => {
    mocks.search = "mode=work&draft=nonce-live";
    const view = renderRoute();
    fireEvent.change(screen.getByRole("textbox", { name: "消息" }), {
      target: { value: "保持当前回答" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("办公回答")).toBeInTheDocument();

    mocks.search = "mode=work&conversation=thread%2Fcreated";
    view.rerender(
      <AuthProvider client={mocks.globalAuthClient}>
        <ModeProvider>
          <ChatRoute />
        </ModeProvider>
      </AuthProvider>,
    );

    expect(screen.getByText("办公回答")).toBeInTheDocument();
    expect(mocks.createXiaozhiTransport).toHaveBeenCalledOnce();
    expect(mocks.workLoadSession).not.toHaveBeenCalled();
  });
});
