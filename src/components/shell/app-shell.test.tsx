import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModeProvider } from "@/providers/mode-provider";
import { AuthProvider } from "@/providers/auth-provider";

import { AppShell } from "./app-shell";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams("mode=work&panel=open"),
}));

describe("AppShell", () => {
  beforeEach(() => replace.mockClear());

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
      expect(link).toHaveAttribute("href", expect.stringContaining("mode=work"));
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
});
