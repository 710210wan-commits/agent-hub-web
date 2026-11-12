import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GlobalAuthClient } from "@/features/auth/global-auth-client";
import { AuthProvider, useAuth } from "@/providers/auth-provider";

import { useDailySessionAuthBridge } from "./use-daily-session-auth-bridge";

const fullUser = { id: "u-1", displayName: "张三" };

function createAuthClient(
  getAuthStatus: GlobalAuthClient["getAuthStatus"],
): GlobalAuthClient {
  return {
    getAuthStatus,
    login: vi.fn(),
    loginDemo: vi.fn(),
    logout: vi.fn(),
  };
}

function Probe() {
  const bridge = useDailySessionAuthBridge();
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="enabled">{String(bridge.enabled)}</span>
      <span data-testid="generation">{bridge.identityGeneration}</span>
      <button type="button" onClick={bridge.onAuthRequired}>
        unauthorized
      </button>
      <button type="button" onClick={auth.retry}>
        retry
      </button>
    </div>
  );
}

describe("useDailySessionAuthBridge", () => {
  it("exposes the global identity and invalidates an authenticated 401", async () => {
    const client = createAuthClient(
      vi.fn().mockResolvedValue({ enabled: true, user: fullUser }),
    );
    render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
    expect(screen.getByTestId("enabled")).toHaveTextContent("true");
    const generation = Number(screen.getByTestId("generation").textContent);

    fireEvent.click(screen.getByRole("button", { name: "unauthorized" }));

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(Number(screen.getByTestId("generation").textContent)).toBeGreaterThan(
      generation,
    );
  });

  it("blocks canonical Daily requests in demo mode and ignores a demo 401", async () => {
    render(
      <AuthProvider
        client={createAuthClient(vi.fn().mockResolvedValue({ enabled: false }))}
      >
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("demo"),
    );
    expect(screen.getByTestId("enabled")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "unauthorized" }));

    expect(screen.getByTestId("status")).toHaveTextContent("demo");
  });

  it("changes generation when the verified global user changes", async () => {
    const getAuthStatus = vi
      .fn<GlobalAuthClient["getAuthStatus"]>()
      .mockResolvedValueOnce({ enabled: true, user: fullUser })
      .mockResolvedValueOnce({
        enabled: true,
        user: { id: "u-2", displayName: "李四" },
      });
    render(
      <AuthProvider client={createAuthClient(getAuthStatus)}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
    const first = Number(screen.getByTestId("generation").textContent);

    fireEvent.click(screen.getByRole("button", { name: "retry" }));

    await waitFor(() =>
      expect(Number(screen.getByTestId("generation").textContent)).toBeGreaterThan(
        first,
      ),
    );
  });
});
