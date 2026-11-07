import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModeProvider } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { SkillMarketError } from "../contracts/error";
import { SkillCreator } from "./skill-creator";

let mockMode = "daily";
vi.mock("next/navigation", () => ({
  usePathname: () => "/skills/creator",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`mode=${mockMode}`),
}));

describe("SkillCreator", () => {
  beforeEach(() => {
    mockMode = "daily";
    sessionStorage.clear();
  });

  it("prevents duplicate requirement analysis while the mutation is pending", async () => {
    let resolveMutation!: (value: unknown) => void;
    const mutate = vi.fn(() => new Promise((resolve) => { resolveMutation = resolve; }));
    const client = { mutate, query: vi.fn() } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "demo-skill" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByLabelText("需求描述"), { target: { value: "Build a useful demo skill" } });
    const analyze = screen.getByRole("button", { name: "分析需求" });
    fireEvent.click(analyze);
    fireEvent.click(analyze);
    expect(mutate).toHaveBeenCalledTimes(1);
    resolveMutation({ ok: false, error: new SkillMarketError({
      area: "creator", code: "SKILL_MARKET_UPSTREAM_UNAVAILABLE", presentation: "unavailable",
      recovery: "retry", retryable: true, status: 502, userMessage: "unavailable",
    }) });
    await waitFor(() => expect(screen.getByRole("button", { name: "分析需求" })).toBeEnabled());
  });

  it("does not create a client request in work mode", async () => {
    mockMode = "work";
    const client = { mutate: vi.fn(), query: vi.fn() } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);
    expect(screen.getByRole("heading", { name: "办公场景暂未接入" })).toBeInTheDocument();
    await waitFor(() => {
      expect(client.query).not.toHaveBeenCalled();
      expect(client.mutate).not.toHaveBeenCalled();
    });
  });
});
