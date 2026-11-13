import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GlobalAuthClient } from "@/features/auth/global-auth-client";
import { AuthProvider } from "@/providers/auth-provider";

import { DailySessionAuthNotice } from "./daily-session-auth-notice";

function authClient(enabled: boolean): GlobalAuthClient {
  return {
    getAuthStatus: vi.fn().mockResolvedValue(
      enabled
        ? { enabled: true, user: { id: "u-1", displayName: "张三" } }
        : { enabled: false },
    ),
    login: vi.fn(),
    loginDemo: vi.fn(),
    logout: vi.fn(),
  };
}

describe("DailySessionAuthNotice", () => {
  it("tells demo users that Daily history requires a full login", async () => {
    render(
      <AuthProvider client={authClient(false)}>
        <DailySessionAuthNotice />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "完整登录后使用决策会话" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/演示模式/)).toBeInTheDocument();
  });

  it("renders nothing for authenticated users", async () => {
    const { container } = render(
      <AuthProvider client={authClient(true)}>
        <DailySessionAuthNotice />
      </AuthProvider>,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
