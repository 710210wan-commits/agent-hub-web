import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GlobalAuthClient } from "@/features/auth/global-auth-client";
import { AuthProvider } from "@/providers/auth-provider";
import { ModeProvider } from "@/providers/mode-provider";

import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("mode=work"),
}));

const fullUser = {
  id: "u-1",
  displayName: "张三",
  sessionExpiresAt: "2026-11-10T16:00:00.000Z",
};

function createClientStub(
  overrides: Partial<GlobalAuthClient> = {},
): GlobalAuthClient {
  return {
    getAuthStatus: vi.fn().mockResolvedValue({ enabled: true, user: fullUser }),
    login: vi.fn(),
    loginDemo: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderSidebar(client: GlobalAuthClient) {
  return render(
    <AuthProvider client={client}>
      <ModeProvider>
        <Sidebar mobileOpen={false} onNavigate={() => {}} />
      </ModeProvider>
    </AuthProvider>,
  );
}

describe("Sidebar 登录身份与退出", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("完整登录态：显示真实用户名与退出按钮", async () => {
    renderSidebar(createClientStub());

    // 用户名与头像缩写同源，允许出现多处
    await waitFor(() =>
      expect(screen.getAllByText("张三").length).toBeGreaterThan(0),
    );
    expect(screen.getByText("已登录")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "退出登录" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("演示用户")).not.toBeInTheDocument();
  });

  it("演示态：显示演示标识，同样可退出", async () => {
    const client = createClientStub({
      getAuthStatus: vi.fn().mockResolvedValue({ enabled: false }),
    });
    renderSidebar(client);

    await waitFor(() =>
      expect(screen.getAllByText("演示模式").length).toBeGreaterThan(0),
    );
    expect(
      screen.getByRole("button", { name: "退出登录" }),
    ).toBeInTheDocument();
  });

  it("点击退出：调用 logout 并回到未登录态", async () => {
    const client = createClientStub();
    renderSidebar(client);
    await waitFor(() =>
      expect(screen.getAllByText("张三").length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() =>
      expect(screen.getByText("未登录")).toBeInTheDocument(),
    );
    expect(client.logout).toHaveBeenCalled();
    expect(screen.queryByText("张三")).not.toBeInTheDocument();
  });
});
