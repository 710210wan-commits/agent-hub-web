import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModeProvider } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { SkillReviewQueue } from "./skill-review-queue";

let mockMode = "daily";
vi.mock("next/navigation", () => ({
  usePathname: () => "/skills/review",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`mode=${mockMode}`),
}));

describe("SkillReviewQueue", () => {
  beforeEach(() => { mockMode = "daily"; });

  it("renders only the submissions returned for the current Principal", async () => {
    const query = vi.fn().mockResolvedValue([{
      artifactKey: "artifact.zip", authorId: "author-1", contentHash: "a".repeat(64),
      id: "submission-1", name: "demo-skill", revision: 2, status: "pending_review",
      submittedAt: "2026-11-07T08:00:00.000Z", reviews: [], triggerCases: [], triggerRuns: [],
    }]);
    const client = { query } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillReviewQueue client={client} /></ModeProvider>);

    expect(await screen.findByRole("link", { name: "进入审核 demo-skill" })).toHaveAttribute(
      "href", "/skills/review/submission-1?mode=1",
    );
    expect(screen.getByText(/作者 author-1 · 修订 r2 · pending_review/)).toBeInTheDocument();
    expect(screen.getByText(`Artifact SHA-256 ${"a".repeat(64)}`)).toBeInTheDocument();
    expect(screen.getByText("冻结审核快照")).toBeInTheDocument();
    expect(screen.getAllByText("后端未提供").length).toBeGreaterThan(0);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("styles page actions like the plaza and omits manual refresh", async () => {
    const query = vi.fn().mockResolvedValue([]);
    render(<ModeProvider><SkillReviewQueue client={{ query } as unknown as SkillMarketClient} /></ModeProvider>);

    expect(await screen.findByRole("heading", { name: "Skill 审核队列" })).toBeInTheDocument();
    expect(screen.getByText("审查冻结快照、Tool 事实、Validator、Diff、Smoke 与 Trigger 证据")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 返回 Skill 广场" })).toHaveClass("back-link");
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
  });

  it("does not query the review queue in work mode", async () => {
    mockMode = "work";
    const query = vi.fn();
    render(<ModeProvider><SkillReviewQueue client={{ query } as unknown as SkillMarketClient} /></ModeProvider>);
    expect(screen.getByRole("heading", { name: "工作场景暂未接入" })).toBeInTheDocument();
    await waitFor(() => expect(query).not.toHaveBeenCalled());
  });
});
