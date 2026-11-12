import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GlobalAuthClient } from "@/features/auth/global-auth-client";
import { KbApiError } from "@/lib/kb-api";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { ModeProvider } from "@/providers/mode-provider";

import KnowledgePage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/knowledge",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const listKbDatabases = vi.fn();

vi.mock("@/lib/kb-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kb-api")>();
  return { ...actual, listKbDatabases: (...args: unknown[]) => listKbDatabases(...args) };
});

function createClientStub(
  overrides: Partial<GlobalAuthClient> = {},
): GlobalAuthClient {
  return {
    getAuthStatus: vi.fn().mockResolvedValue({ enabled: false }),
    login: vi.fn(),
    loginDemo: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function AuthProbe() {
  const { status } = useAuth();
  return <span data-testid="auth-status">{status}</span>;
}

function renderPage(client: GlobalAuthClient) {
  return render(
    <AuthProvider client={client}>
      <AuthProbe />
      <ModeProvider>
        <KnowledgePage />
      </ModeProvider>
    </AuthProvider>,
  );
}

describe("知识库列表页 × 全局登录态（Task 6）", () => {
  beforeEach(() => {
    listKbDatabases.mockReset();
  });

  it("演示态：不请求受保护接口，页面内引导完整登录", async () => {
    renderPage(createClientStub());
    await waitFor(() =>
      expect(screen.getByTestId("auth-status").textContent).toBe("demo"),
    );

    await waitFor(() =>
      expect(screen.getByText("登录后使用知识库")).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("用户名")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("密码")).not.toBeInTheDocument();
    expect(listKbDatabases).not.toHaveBeenCalled();
    // 演示态不被踢出
    expect(screen.getByTestId("auth-status").textContent).toBe("demo");
  });

  it("演示态 + 401：点「去登录」回到未登录态（AuthBoundary 将渲染登录页）", async () => {
    listKbDatabases.mockRejectedValue(
      new KbApiError("unauthorized", 401, "请先登录后再访问知识库"),
    );
    renderPage(createClientStub());
    await waitFor(() =>
      expect(screen.getByText("登录后使用知识库")).toBeInTheDocument(),
    );

    screen.getByRole("button", { name: "去登录" }).click();

    await waitFor(() =>
      expect(screen.getByTestId("auth-status").textContent).toBe("anonymous"),
    );
  });

  it("完整登录态 + 正常数据：渲染知识库列表", async () => {
    listKbDatabases.mockResolvedValue([
      {
        kb_id: "kb-1",
        name: "制度库",
        description: "公司制度",
        type: "milvus",
        supports_documents: true,
      },
    ]);
    const client = createClientStub({
      getAuthStatus: vi.fn().mockResolvedValue({
        enabled: true,
        user: { id: "u-1", displayName: "张三" },
      }),
    });
    renderPage(client);

    await waitFor(() =>
      expect(screen.getByText("制度库")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("auth-status").textContent).toBe("authenticated");
  });

  it("完整登录态 + 403：显示权限或 Origin 错误，但不退出", async () => {
    listKbDatabases.mockRejectedValue(
      new KbApiError(
        "unknown",
        403,
        "请求来源校验失败，请联系管理员检查部署配置",
      ),
    );
    const client = createClientStub({
      getAuthStatus: vi.fn().mockResolvedValue({
        enabled: true,
        user: { id: "u-1", displayName: "张三" },
      }),
    });
    renderPage(client);

    expect(
      await screen.findByText("请求来源校验失败，请联系管理员检查部署配置"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("auth-status").textContent).toBe("authenticated");
    expect(screen.queryByText("登录后使用知识库")).not.toBeInTheDocument();
  });
});
