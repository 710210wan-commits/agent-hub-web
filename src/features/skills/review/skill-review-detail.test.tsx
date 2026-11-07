import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModeProvider } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { SkillReviewDetail } from "./skill-review-detail";

vi.mock("next/navigation", () => ({
  usePathname: () => "/skills/review/submission-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("mode=daily"),
}));

const submission = {
  artifactKey: "artifact.zip", authorId: "author-1", contentHash: "a".repeat(64),
  id: "submission-1", name: "demo-skill", revision: 2, status: "pending_review" as const,
  submittedAt: "2026-11-07T08:00:00.000Z", reviews: [], triggerCases: [], triggerRuns: [],
};

describe("SkillReviewDetail", () => {
  it("marks missing optional evidence instead of treating it as passing", async () => {
    const query = vi.fn(async (input: { operation: string }) => input.operation === "listSubmissions" ? [submission] : []);
    render(<ModeProvider><SkillReviewDetail client={{ query } as unknown as SkillMarketClient} id="submission-1" /></ModeProvider>);
    expect(await screen.findByRole("heading", { name: "demo-skill" })).toBeInTheDocument();
    expect(screen.getAllByText("后端未提供").length).toBeGreaterThan(0);
  });

  it("allows only one trigger mutation while the request is pending", async () => {
    let resolveMutation!: (value: unknown) => void;
    const mutate = vi.fn(() => new Promise((resolve) => { resolveMutation = resolve; }));
    const query = vi.fn(async (input: { operation: string }) => input.operation === "listSubmissions" ? [submission] : []);
    const client = { mutate, query } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillReviewDetail client={client} id="submission-1" /></ModeProvider>);
    await screen.findByRole("heading", { name: "demo-skill" });
    fireEvent.change(screen.getByLabelText("触发查询"), { target: { value: "run this skill" } });
    const run = screen.getByRole("button", { name: "运行 Trigger Test" });
    fireEvent.click(run);
    fireEvent.click(run);
    expect(mutate).toHaveBeenCalledTimes(1);
    resolveMutation({ ok: true, value: {
      actualTrigger: true, createdAt: "2026-11-07T08:01:00.000Z", durationMs: 20,
      expectedTrigger: true, id: "run-1", model: "test", passed: true,
      query: "run this skill", runBy: "reviewer-1", submissionId: "submission-1",
    } });
    await waitFor(() => expect(screen.getByText(/run-1/)).toBeInTheDocument());
  });
});
