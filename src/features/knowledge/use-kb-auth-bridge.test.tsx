import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GlobalAuthClient } from "@/features/auth/global-auth-client";
import { listKbDatabases } from "@/lib/kb-api";
import { AuthProvider, useAuth } from "@/providers/auth-provider";

import { useKbAuthBridge } from "./use-kb-auth-bridge";

function stubFetch401() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "DSI session required" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

function Probe() {
  useKbAuthBridge();
  const { status } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{status}</span>
      <button
        type="button"
        onClick={() => {
          void listKbDatabases().catch(() => {});
        }}
      >
        kb-call
      </button>
    </div>
  );
}

function createClient(getAuthStatus: GlobalAuthClient["getAuthStatus"]): GlobalAuthClient {
  return {
    getAuthStatus,
    login: vi.fn(),
    loginDemo: vi.fn(),
    logout: vi.fn(),
  };
}

describe("useKbAuthBridge（401 分流）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("完整登录态收到 kb 401 → 自动 invalidate 回未登录态", async () => {
    stubFetch401();
    const client = createClient(
      vi.fn().mockResolvedValue({
        enabled: true,
        user: { id: "u-1", displayName: "张三" },
      }),
    );
    render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("auth-status").textContent).toBe("authenticated"),
    );

    fireEvent.click(screen.getByText("kb-call"));

    await waitFor(() =>
      expect(screen.getByTestId("auth-status").textContent).toBe("anonymous"),
    );
  });

  it("演示态收到 kb 401 → 不踢登录态，保持 demo", async () => {
    stubFetch401();
    const client = createClient(vi.fn().mockResolvedValue({ enabled: false }));
    render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("auth-status").textContent).toBe("demo"),
    );

    fireEvent.click(screen.getByText("kb-call"));

    // 等待 kb 调用完成（reject 已被捕获），状态应保持 demo
    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThan(0),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId("auth-status").textContent).toBe("demo");
  });

  it("卸载后注销钩子：kb 401 不再影响登录态", async () => {
    stubFetch401();
    const client = createClient(
      vi.fn().mockResolvedValue({
        enabled: true,
        user: { id: "u-1", displayName: "张三" },
      }),
    );
    const { unmount } = render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("auth-status").textContent).toBe("authenticated"),
    );
    unmount();

    await expect(listKbDatabases()).rejects.toMatchObject({
      kind: "unauthorized",
    });
    // 无 Provider 可断言状态，只要不抛未捕获异常、钩子不报错即可
  });
});
