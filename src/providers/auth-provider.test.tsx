import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GlobalAuthClient } from "@/features/auth/global-auth-client";

import { AuthProvider, useAuth } from "./auth-provider";

const fullUser = {
  id: "u-1",
  displayName: "张三",
  sessionExpiresAt: "2026-11-10T16:00:00.000Z",
};

function createClientStub(
  overrides: Partial<GlobalAuthClient> = {},
): GlobalAuthClient {
  return {
    getAuthStatus: vi.fn().mockResolvedValue({ enabled: false }),
    login: vi.fn().mockResolvedValue({ kind: "full", user: fullUser }),
    loginDemo: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="user">{auth.user?.displayName ?? ""}</span>
      <span data-testid="generation">{auth.identityGeneration}</span>
      <span data-testid="error">{auth.errorMessage ?? ""}</span>
      <button type="button" onClick={() => void auth.login("u", "p")}>
        login
      </button>
      <button type="button" onClick={() => void auth.loginDemo()}>
        demo
      </button>
      <button type="button" onClick={() => void auth.logout()}>
        logout
      </button>
      <button type="button" onClick={() => auth.invalidate()}>
        invalidate
      </button>
      <button type="button" onClick={() => auth.retry()}>
        retry
      </button>
    </div>
  );
}

function renderWithClient(client: GlobalAuthClient) {
  return render(
    <AuthProvider client={client}>
      <Probe />
    </AuthProvider>,
  );
}

describe("AuthProvider（全局登录态）", () => {
  it("挂载时恢复完整登录态：enabled:true → authenticated + 真实用户", async () => {
    const client = createClientStub({
      getAuthStatus: vi.fn().mockResolvedValue({ enabled: true, user: fullUser }),
    });
    renderWithClient(client);

    expect(screen.getByTestId("status").textContent).toBe("checking");
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("authenticated"),
    );
    expect(screen.getByTestId("user").textContent).toBe("张三");
  });

  it("挂载时恢复演示态：enabled:false（基础会话）→ demo", async () => {
    renderWithClient(createClientStub());

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("demo"),
    );
  });

  it("挂载时未登录：401/AUTH_REQUIRED → anonymous，而不是 error", async () => {
    const client = createClientStub({
      getAuthStatus: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("未登录"), { code: "AUTH_REQUIRED", status: 401 }),
        ),
    });
    renderWithClient(client);

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("anonymous"),
    );
    expect(screen.getByTestId("error").textContent).toBe("");
  });

  it("挂载时网络错误 → error，可 retry 恢复", async () => {
    const getAuthStatus = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("网络请求失败"), { code: "NETWORK_ERROR" }))
      .mockResolvedValueOnce({ enabled: true, user: fullUser });
    renderWithClient(createClientStub({ getAuthStatus }));

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("error"),
    );
    expect(screen.getByTestId("error").textContent).not.toBe("");

    await act(async () => {
      screen.getByText("retry").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("authenticated"),
    );
  });

  it("login 成功（完整会话）→ authenticated", async () => {
    const client = createClientStub();
    renderWithClient(client);
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("demo"),
    );

    await act(async () => {
      screen.getByText("login").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("authenticated"),
    );
    expect(screen.getByTestId("user").textContent).toBe("张三");
    expect(client.login).toHaveBeenCalledWith(
      { username: "u", password: "p" },
      expect.anything(),
    );
  });

  it("login 返回演示会话（xiaozhi 不可用）→ demo，不报错", async () => {
    const client = createClientStub({
      login: vi.fn().mockResolvedValue({ kind: "demo" }),
    });
    renderWithClient(client);
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("demo"),
    );

    await act(async () => {
      screen.getByText("login").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("demo"),
    );
    expect(screen.getByTestId("error").textContent).toBe("");
  });

  it("login 失败（账号错误）→ anonymous + 错误文案", async () => {
    const client = createClientStub({
      login: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("账号或授权无效"), { code: "AUTH_REQUIRED", status: 401 }),
        ),
    });
    renderWithClient(client);
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("demo"),
    );

    await act(async () => {
      screen.getByText("login").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("anonymous"),
    );
    expect(screen.getByTestId("error").textContent).toContain("账号或授权无效");
  });

  it("loginDemo → demo 态", async () => {
    const client = createClientStub({
      getAuthStatus: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("未登录"), { code: "AUTH_REQUIRED", status: 401 }),
        ),
    });
    renderWithClient(client);
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("anonymous"),
    );

    await act(async () => {
      screen.getByText("demo").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("demo"),
    );
    expect(client.loginDemo).toHaveBeenCalled();
  });

  it("logout → anonymous，且 identityGeneration 递增", async () => {
    const client = createClientStub({
      getAuthStatus: vi.fn().mockResolvedValue({ enabled: true, user: fullUser }),
    });
    renderWithClient(client);
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("authenticated"),
    );
    const before = Number(screen.getByTestId("generation").textContent);

    await act(async () => {
      screen.getByText("logout").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("anonymous"),
    );
    expect(Number(screen.getByTestId("generation").textContent)).toBeGreaterThan(
      before,
    );
  });

  it("invalidate（业务接口 401）→ anonymous + generation 递增，不发请求", async () => {
    const client = createClientStub({
      getAuthStatus: vi.fn().mockResolvedValue({ enabled: true, user: fullUser }),
    });
    renderWithClient(client);
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("authenticated"),
    );
    const before = Number(screen.getByTestId("generation").textContent);
    const calls = {
      status: (client.getAuthStatus as ReturnType<typeof vi.fn>).mock.calls.length,
    };

    act(() => {
      screen.getByText("invalidate").click();
    });
    expect(screen.getByTestId("status").textContent).toBe("anonymous");
    expect(Number(screen.getByTestId("generation").textContent)).toBeGreaterThan(
      before,
    );
    expect(
      (client.getAuthStatus as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(calls.status);
  });

  it("并发竞态：login 进行中触发 logout，最终以后发起的 logout 为准", async () => {
    let resolveLogin!: (value: { kind: "full"; user: typeof fullUser }) => void;
    const client = createClientStub({
      login: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLogin = resolve;
          }),
      ),
    });
    renderWithClient(client);
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("demo"),
    );

    act(() => {
      screen.getByText("login").click();
    });
    act(() => {
      screen.getByText("logout").click();
    });
    // login 迟到返回，不应覆盖 logout 的结果
    await act(async () => {
      resolveLogin({ kind: "full", user: fullUser });
    });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("anonymous"),
    );
  });

  it("同一用户重复恢复不递增 generation；换用户递增", async () => {
    const getAuthStatus = vi
      .fn()
      .mockResolvedValue({ enabled: true, user: fullUser });
    const client = createClientStub({ getAuthStatus });
    renderWithClient(client);
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("authenticated"),
    );
    const first = Number(screen.getByTestId("generation").textContent);

    await act(async () => {
      screen.getByText("retry").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("authenticated"),
    );
    expect(Number(screen.getByTestId("generation").textContent)).toBe(first);

    getAuthStatus.mockResolvedValue({
      enabled: true,
      user: { ...fullUser, id: "u-2", displayName: "李四" },
    });
    await act(async () => {
      screen.getByText("retry").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("user").textContent).toBe("李四"),
    );
    expect(Number(screen.getByTestId("generation").textContent)).toBeGreaterThan(
      first,
    );
  });

  it("useAuth 在 AuthProvider 外使用抛错", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/AuthProvider/);
    consoleError.mockRestore();
  });
});
