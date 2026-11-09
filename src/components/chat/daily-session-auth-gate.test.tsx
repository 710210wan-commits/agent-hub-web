import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DailySessionClientError,
  type DailySessionClient,
} from "@/features/chat/transports/daily-session-client";
import { DailySessionAuthProvider } from "@/features/chat/session/daily-session-auth-provider";

import { DailySessionAuthGate } from "./daily-session-auth-gate";

const xiaozhiUrl = "http://127.0.0.1:5050/xiaozhi";
const user = {
  id: "user-7",
  displayName: "测试用户",
  sessionExpiresAt: "2026-11-09T09:02:03.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

function makeClient(
  overrides: Partial<DailySessionClient> = {},
): DailySessionClient {
  return {
    getAuthStatus: vi.fn<DailySessionClient["getAuthStatus"]>(async () => ({
      enabled: false,
      xiaozhiUrl,
    })),
    login: vi.fn<DailySessionClient["login"]>(async () => user),
    logout: vi.fn<DailySessionClient["logout"]>(async () => undefined),
    listConversations: vi.fn<DailySessionClient["listConversations"]>(),
    createConversation: vi.fn<DailySessionClient["createConversation"]>(),
    loadSnapshot: vi.fn<DailySessionClient["loadSnapshot"]>(),
    loadMessages: vi.fn<DailySessionClient["loadMessages"]>(),
    renameConversation: vi.fn<DailySessionClient["renameConversation"]>(),
    ...overrides,
  };
}

function renderGate(client: DailySessionClient) {
  return render(
    <DailySessionAuthProvider client={client}>
      <DailySessionAuthGate>
        <div>受保护的会话管理</div>
      </DailySessionAuthGate>
    </DailySessionAuthProvider>,
  );
}

describe("DailySessionAuthGate", () => {
  it("shows a compact loading state while restoring the Cookie session", () => {
    const pending = deferred<never>();
    renderGate(
      makeClient({
        getAuthStatus: vi.fn(() => pending.promise),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在恢复登录状态");
    expect(screen.queryByText("受保护的会话管理")).not.toBeInTheDocument();
  });

  it("submits the login form and removes the password from the DOM", async () => {
    const login = deferred<typeof user>();
    const client = makeClient({
      login: vi.fn(() => login.promise),
    });
    renderGate(client);
    expect(
      await screen.findByRole("heading", { name: "登录日常会话" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "用户名" }), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "private-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(screen.getByRole("status")).toHaveTextContent("正在恢复登录状态");
    expect(screen.queryByDisplayValue("private-password")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private-password");

    login.resolve(user);
    expect(await screen.findByText("受保护的会话管理")).toBeInTheDocument();
  });

  it("shows a safe login error and never echoes an unknown thrown password", async () => {
    const client = makeClient({
      login: vi.fn(async () => {
        throw new Error("private-password upstream detail");
      }),
    });
    renderGate(client);
    await screen.findByRole("heading", { name: "登录日常会话" });
    fireEvent.change(screen.getByRole("textbox", { name: "用户名" }), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "private-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "登录失败，请检查账号后重试",
    );
    expect(document.body).not.toHaveTextContent("private-password");
  });

  it("renders authenticated content and logs out without exposing work auth", async () => {
    const client = makeClient({
      getAuthStatus: vi.fn(async () => ({ enabled: true, xiaozhiUrl, user })),
    });
    renderGate(client);

    expect(await screen.findByText("受保护的会话管理")).toBeInTheDocument();
    expect(screen.getByText("测试用户")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "登录日常会话" }),
      ).toBeInTheDocument(),
    );
  });

  it("offers retry for a restore error", async () => {
    const getAuthStatus = vi
      .fn<DailySessionClient["getAuthStatus"]>()
      .mockRejectedValueOnce(
        new DailySessionClientError({
          code: "NETWORK_ERROR",
          message: "网络请求失败，请稍后重试",
        }),
      )
      .mockResolvedValueOnce({ enabled: false, xiaozhiUrl });
    renderGate(makeClient({ getAuthStatus }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络请求失败，请稍后重试",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(
      await screen.findByRole("heading", { name: "登录日常会话" }),
    ).toBeInTheDocument();
  });
});
