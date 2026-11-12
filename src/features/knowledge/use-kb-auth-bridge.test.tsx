import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GlobalAuthClient } from "@/features/auth/global-auth-client";
import { useDailySessionAuthBridge } from "@/features/chat/session/use-daily-session-auth-bridge";
import { listKbDatabases } from "@/lib/kb-api";
import { AuthProvider, useAuth } from "@/providers/auth-provider";

import { useKbAuthBridge } from "./use-kb-auth-bridge";

function stubFetch(status = 401, body: unknown = { error: "DSI session required" }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

function Probe() {
  useKbAuthBridge();
  const daily = useDailySessionAuthBridge();
  const { status } = useAuth();
  const [kbResult, setKbResult] = useState("idle");
  return (
    <div>
      <span data-testid="auth-status">{status}</span>
      <span data-testid="daily-generation">{daily.identityGeneration}</span>
      <span data-testid="kb-result">{kbResult}</span>
      <button
        type="button"
        onClick={() => {
          void listKbDatabases().then(
            () => setKbResult("resolved"),
            () => setKbResult("rejected"),
          );
        }}
      >
        kb-call
      </button>
    </div>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
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
    stubFetch();
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
    const generation = Number(
      screen.getByTestId("daily-generation").textContent,
    );

    fireEvent.click(screen.getByText("kb-call"));

    await waitFor(() =>
      expect(screen.getByTestId("auth-status").textContent).toBe("anonymous"),
    );
    expect(
      Number(screen.getByTestId("daily-generation").textContent),
    ).toBeGreaterThan(generation);
  });

  it("演示态收到 kb 401 → 不踢登录态，保持 demo", async () => {
    stubFetch();
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

    await waitFor(() =>
      expect(screen.getByTestId("kb-result").textContent).toBe("rejected"),
    );
    expect(screen.getByTestId("auth-status").textContent).toBe("demo");
  });

  it("checking 期间收到 kb 401 → 不抢跑 invalidate，由全局恢复决定身份", async () => {
    stubFetch();
    const pendingStatus = deferred<{
      enabled: true;
      user: { id: string; displayName: string };
    }>();
    render(
      <AuthProvider client={createClient(vi.fn(() => pendingStatus.promise))}>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("auth-status").textContent).toBe("checking");
    fireEvent.click(screen.getByText("kb-call"));
    await waitFor(() =>
      expect(screen.getByTestId("kb-result").textContent).toBe("rejected"),
    );

    pendingStatus.resolve({
      enabled: true,
      user: { id: "u-1", displayName: "张三" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("auth-status").textContent).toBe("authenticated"),
    );
  });

  it("完整登录态收到 kb 403 → 保持 authenticated，不触发全局退出", async () => {
    stubFetch(403, {
      code: 403,
      message: "请求来源校验失败，请联系管理员",
      data: null,
    });
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
      expect(screen.getByTestId("kb-result").textContent).toBe("rejected"),
    );
    expect(screen.getByTestId("auth-status").textContent).toBe("authenticated");
  });

  it("卸载后注销钩子：kb 401 不再影响登录态", async () => {
    stubFetch();
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
