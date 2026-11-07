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

    expect(await screen.findByRole("link", { name: /demo-skill/ })).toHaveAttribute(
      "href", "/skills/review/submission-1?mode=daily",
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does not query the review queue in work mode", async () => {
    mockMode = "work";
    const query = vi.fn();
    render(<ModeProvider><SkillReviewQueue client={{ query } as unknown as SkillMarketClient} /></ModeProvider>);
    expect(screen.getByRole("heading", { name: "办公场景暂未接入" })).toBeInTheDocument();
    await waitFor(() => expect(query).not.toHaveBeenCalled());
  });
});
