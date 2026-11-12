import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModeProvider } from "@/providers/mode-provider";
import { AuthProvider } from "@/providers/auth-provider";

import { AppShell } from "./app-shell";

const replace = vi.fn();
const push = vi.fn();
const randomUUID = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams("mode=work&panel=open"),
}));

describe("AppShell", () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    randomUUID.mockReset();
    randomUUID.mockReturnValueOnce("draft-1").mockReturnValueOnce("draft-2");
    vi.stubGlobal("crypto", { randomUUID });
  });

  it("renders the approved brand and navigation without internal runtime labels", () => {
    render(
      <AuthProvider>
        <ModeProvider>
          <AppShell title="新对话">内容</AppShell>
        </ModeProvider>
      </AuthProvider>,
    );

    expect(screen.getByText("智能体平台")).toBeInTheDocument();
    expect(screen.queryByText("AgentLoop")).not.toBeInTheDocument();
    expect(screen.queryByText("Workflow")).not.toBeInTheDocument();

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent?.trim()),
    ).toEqual([
      "新对话",
      "历史对话",
      "GIS 工作台",
      "知识库",
      "Skill",
      "MCP",
      "设置",
    ]);

    for (const link of within(navigation).getAllByRole("link")) {
      if (link.textContent?.trim() === "GIS 工作台") {
        expect(link).toHaveAttribute(
          "href",
          process.env.NEXT_PUBLIC_LEGACY_FRONTEND_URL ?? "http://localhost:5000",
        );
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
      } else {
        expect(link).toHaveAttribute("href", expect.stringContaining("mode=work"));
      }
      expect(link).toHaveAccessibleName(link.textContent?.trim());
      expect(link).toHaveAttribute("aria-label", link.textContent?.trim());
    }
  });

  it("switches mode while preserving unrelated query parameters", () => {
    render(
      <AuthProvider>
        <ModeProvider>
          <AppShell title="新对话">内容</AppShell>
        </ModeProvider>
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "日常" }));

    expect(replace).toHaveBeenCalledWith("/chat?mode=daily&panel=open");
  });

  it("starts each new chat with a draft nonce rather than a fake conversation", () => {
    render(
      <AuthProvider>
        <ModeProvider>
          <AppShell title="新对话">内容</AppShell>
        </ModeProvider>
      </AuthProvider>,
    );

    const newChat = screen.getByRole("link", { name: "新对话" });
    fireEvent.click(newChat);
    fireEvent.click(newChat);

    expect(push).toHaveBeenNthCalledWith(1, "/chat?mode=work&draft=draft-1");
    expect(push).toHaveBeenNthCalledWith(2, "/chat?mode=work&draft=draft-2");
    expect(push.mock.calls.flat().join(" ")).not.toContain("conversation=");
  });
});
