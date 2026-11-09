import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DailySessionClientError,
  createDailySessionClient,
  type DailySessionClient,
} from "@/features/chat/transports/daily-session-client";

import {
  DailySessionAuthProvider,
  useDailySessionAuth,
} from "./daily-session-auth-provider";

const userA = {
  id: "user-a",
  displayName: "用户 A",
  sessionExpiresAt: "2026-11-09T09:02:03.000Z",
};
const userB = {
  id: "user-b",
  displayName: "用户 B",
  sessionExpiresAt: "2026-11-09T10:02:03.000Z",
};
const xiaozhiUrl = "http://127.0.0.1:5050/xiaozhi";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function makeClient(
  overrides: Partial<DailySessionClient> = {},
): DailySessionClient {
  return {
    getAuthStatus: vi.fn<DailySessionClient["getAuthStatus"]>(async () => ({
      enabled: false,
      xiaozhiUrl,
    })),
    login: vi.fn<DailySessionClient["login"]>(async () => userA),
    logout: vi.fn<DailySessionClient["logout"]>(async () => undefined),
    listConversations: vi.fn<DailySessionClient["listConversations"]>(),
    createConversation: vi.fn<DailySessionClient["createConversation"]>(),
    loadSnapshot: vi.fn<DailySessionClient["loadSnapshot"]>(),
    loadMessages: vi.fn<DailySessionClient["loadMessages"]>(),
    renameConversation: vi.fn<DailySessionClient["renameConversation"]>(),
    ...overrides,
  };
}

function Probe() {
  const auth = useDailySessionAuth();
  return (
    <div>
      <output data-testid="status">{auth.status}</output>
      <output data-testid="user">{auth.user?.displayName ?? "none"}</output>
      <output data-testid="generation">{auth.identityGeneration}</output>
      <output data-testid="error">{auth.errorMessage ?? "none"}</output>
      <button onClick={() => void auth.login("alice", "private-password")}>
        登录
      </button>
      <button onClick={() => void auth.logout()}>退出</button>
      <button onClick={auth.retry}>重试</button>
      <button onClick={auth.invalidate}>失效</button>
    </div>
  );
}

function renderProvider(client: DailySessionClient) {
  return render(
    <DailySessionAuthProvider client={client}>
      <Probe />
    </DailySessionAuthProvider>,
  );
}

describe("DailySessionAuthProvider", () => {
  it("restores a verified user and advances the identity generation", async () => {
    const client = makeClient({
      getAuthStatus: vi.fn(async () => ({ enabled: true, xiaozhiUrl, user: userA })),
    });

    renderProvider(client);

    expect(screen.getByTestId("status")).toHaveTextContent("checking");
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("用户 A"),
    );
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("generation")).toHaveTextContent("1");
  });

  it("treats an unverified server session as anonymous", async () => {
    renderProvider(makeClient());

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(screen.getByTestId("generation")).toHaveTextContent("0");
  });

  it("uses the real client basic-session upgrade before authenticating", async () => {
    let statusReads = 0;
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/auth/xiaozhi-status")) {
        statusReads += 1;
        return jsonResponse(
          statusReads === 1
            ? { enabled: false, xiaozhiUrl }
            : { enabled: true, xiaozhiUrl, user: userA },
        );
      }
      if (path.endsWith("/auth/login")) {
        return jsonResponse({ success: true, user: userA, kbUnavailable: true });
      }
      if (path.endsWith("/auth/xiaozhi-login")) {
        return jsonResponse({ success: true, user: userA });
      }
      throw new Error(`unexpected request: ${path}`);
    });
    renderProvider(createDailySessionClient({ fetchFn }));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous"),
    );

    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("用户 A"),
    );
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      "/agent-api/auth/xiaozhi-status",
      "/agent-api/auth/login",
      "/agent-api/auth/xiaozhi-login",
      "/agent-api/auth/xiaozhi-status",
    ]);
  });

  it("returns invalid credentials to anonymous state with a safe error", async () => {
    const client = makeClient({
      login: vi.fn(async () => {
        throw new DailySessionClientError({
          status: 401,
          code: "AUTH_REQUIRED",
          message: "登录状态已失效，请重新登录",
        });
      }),
    });
    renderProvider(client);
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous"),
    );

    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent(
        "登录状态已失效，请重新登录",
      ),
    );
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(document.body).not.toHaveTextContent("private-password");
  });

  it("logs out, clears the user, and advances the generation", async () => {
    const client = makeClient({
      getAuthStatus: vi.fn(async () => ({ enabled: true, xiaozhiUrl, user: userA })),
    });
    renderProvider(client);
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("用户 A"),
    );

    fireEvent.click(screen.getByRole("button", { name: "退出" }));

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(screen.getByTestId("generation")).toHaveTextContent("2");
  });

  it("invalidates a 401 identity immediately", async () => {
    const client = makeClient({
      getAuthStatus: vi.fn(async () => ({ enabled: true, xiaozhiUrl, user: userA })),
    });
    renderProvider(client);
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("用户 A"),
    );

    fireEvent.click(screen.getByRole("button", { name: "失效" }));

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(screen.getByTestId("generation")).toHaveTextContent("2");
  });

  it("aborts an in-flight restore when unmounted", () => {
    const pending = deferred<never>();
    let signal: AbortSignal | undefined;
    const client = makeClient({
      getAuthStatus: vi.fn((_signal) => {
        signal = _signal;
        return pending.promise;
      }),
    });

    const view = renderProvider(client);
    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("hides user A while retry resolves user B and advances once", async () => {
    const nextIdentity = deferred<{
      enabled: true;
      xiaozhiUrl: string;
      user: typeof userB;
    }>();
    const getAuthStatus = vi
      .fn<DailySessionClient["getAuthStatus"]>()
      .mockResolvedValueOnce({ enabled: true, xiaozhiUrl, user: userA })
      .mockReturnValueOnce(nextIdentity.promise);
    renderProvider(makeClient({ getAuthStatus }));
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("用户 A"),
    );

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(screen.getByTestId("status")).toHaveTextContent("checking");
    expect(screen.getByTestId("user")).toHaveTextContent("none");

    await act(async () => {
      nextIdentity.resolve({ enabled: true, xiaozhiUrl, user: userB });
      await nextIdentity.promise;
    });
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("user")).toHaveTextContent("用户 B");
    expect(screen.getByTestId("generation")).toHaveTextContent("2");
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
