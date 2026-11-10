import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GlobalAuthClient } from "@/features/auth/global-auth-client";
import { AuthProvider } from "@/providers/auth-provider";

import { AuthBoundary } from "./auth-boundary";

const fullUser = {
  id: "u-1",
  displayName: "张三",
  sessionExpiresAt: "2026-11-10T16:00:00.000Z",
};

function createClientStub(
  overrides: Partial<GlobalAuthClient> = {},
): GlobalAuthClient {
  return {
    getAuthStatus: vi.fn().mockRejectedValue(
      Object.assign(new Error("未登录"), { code: "AUTH_REQUIRED", status: 401 }),
    ),
    login: vi.fn().mockResolvedValue({ kind: "full", user: fullUser }),
    loginDemo: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderBoundary(client: GlobalAuthClient) {
  return render(
    <AuthProvider client={client}>
      <AuthBoundary>
        <div>业务内容</div>
      </AuthBoundary>
    </AuthProvider>,
  );
}

describe("AuthBoundary（统一登录边界）", () => {
  it("未登录：只渲染登录页，不渲染业务内容", async () => {
    renderBoundary(createClientStub());

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument(),
    );
    expect(screen.queryByText("业务内容")).not.toBeInTheDocument();
  });

  it("检查中：显示加载提示，不渲染业务内容", () => {
    const client = createClientStub({
      getAuthStatus: vi.fn().mockImplementation(() => new Promise(() => {})),
    });
    renderBoundary(client);

    expect(screen.getByText(/正在确认登录状态/)).toBeInTheDocument();
    expect(screen.queryByText("业务内容")).not.toBeInTheDocument();
  });

  it("登录服务不可达：显示错误与重试，重试成功后放行", async () => {
    const client = createClientStub({
      getAuthStatus: vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error("网络请求失败"), { code: "NETWORK_ERROR" }),
        )
        .mockResolvedValueOnce({ enabled: true, user: fullUser }),
    });
    renderBoundary(client);

    await waitFor(() =>
      expect(screen.getByText(/无法连接登录服务|网络请求失败/)).toBeInTheDocument(),
    );
    expect(screen.queryByText("业务内容")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() =>
      expect(screen.getByText("业务内容")).toBeInTheDocument(),
    );
  });

  it("演示态：直接渲染业务内容", async () => {
    const client = createClientStub({
      getAuthStatus: vi.fn().mockResolvedValue({ enabled: false }),
    });
    renderBoundary(client);

    await waitFor(() =>
      expect(screen.getByText("业务内容")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("heading", { name: "登录" })).not.toBeInTheDocument();
  });

  it("已登录：直接渲染业务内容", async () => {
    const client = createClientStub({
      getAuthStatus: vi.fn().mockResolvedValue({ enabled: true, user: fullUser }),
    });
    renderBoundary(client);

    await waitFor(() =>
      expect(screen.getByText("业务内容")).toBeInTheDocument(),
    );
  });

  it("预填 xiaozhi 本地部署默认账号 admin/admin123", async () => {
    renderBoundary(createClientStub());
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument(),
    );

    expect(screen.getByLabelText("用户名")).toHaveValue("admin");
    expect(screen.getByLabelText("密码")).toHaveValue("admin123");
  });

  it("完整登录流程：提交账号密码 → 登录成功 → 自动渲染业务内容", async () => {
    const client = createClientStub();
    renderBoundary(client);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "zhangsan" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() =>
      expect(screen.getByText("业务内容")).toBeInTheDocument(),
    );
    expect(client.login).toHaveBeenCalledWith(
      { username: "zhangsan", password: "secret" },
      expect.anything(),
    );
  });

  it("账号密码为空：本地校验提示，不发请求", async () => {
    const client = createClientStub();
    renderBoundary(client);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument(),
    );

    // 登录页预填了默认账号，先清空再校验
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(screen.getByText("请输入用户名和密码")).toBeInTheDocument();
    expect(client.login).not.toHaveBeenCalled();
  });

  it("登录失败：显示服务端错误文案，停留在登录页", async () => {
    const client = createClientStub({
      login: vi.fn().mockRejectedValue(
        Object.assign(new Error("账号或授权无效"), {
          code: "AUTH_REQUIRED",
          status: 401,
        }),
      ),
    });
    renderBoundary(client);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "zhangsan" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() =>
      expect(screen.getByText("账号或授权无效")).toBeInTheDocument(),
    );
    expect(screen.queryByText("业务内容")).not.toBeInTheDocument();
  });

  it("演示模式入口：点击后建立演示会话并放行", async () => {
    const client = createClientStub();
    renderBoundary(client);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /暂不登录，不使用知识库/ }),
    );

    await waitFor(() =>
      expect(screen.getByText("业务内容")).toBeInTheDocument(),
    );
    expect(client.loginDemo).toHaveBeenCalled();
  });
});
