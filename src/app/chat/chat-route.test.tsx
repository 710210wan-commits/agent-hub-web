import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/providers/auth-provider";
import { ModeProvider } from "@/providers/mode-provider";

import ChatRoute from "./page";

const { createChatTransport } = vi.hoisted(() => ({
  createChatTransport: vi.fn(() => ({
    kind: "mock" as const,
    capabilities: { selections: true, answerDeltas: true, resume: true },
    createRun: vi.fn(),
    streamRun: vi.fn(),
    abortRun: vi.fn(),
  })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("mode=work"),
}));

vi.mock("@/config/env", () => ({
  readPublicRuntimeConfig: () => ({ transport: "mock", apiBaseUrl: "/agent-api" }),
}));

vi.mock("@/features/chat/transports/create-transport", () => ({
  createChatTransport,
}));

describe("ChatRoute", () => {
  beforeEach(() => createChatTransport.mockClear());

  it("renders the unavailable Office Loop entry without creating the daily transport", () => {
    render(
      <AuthProvider>
        <ModeProvider>
          <ChatRoute />
        </ModeProvider>
      </AuthProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "办公场景暂未接入" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "消息" })).not.toBeInTheDocument();
    expect(createChatTransport).not.toHaveBeenCalled();
  });
});
