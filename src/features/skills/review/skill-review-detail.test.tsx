import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("uses one shared heading style for every evidence subsection", async () => {
    const query = vi.fn(async (input: { operation: string }) => input.operation === "listSubmissions" ? [submission] : []);
    render(
      <ModeProvider>
        <SkillReviewDetail client={{ query } as unknown as SkillMarketClient} id="submission-1" />
      </ModeProvider>,
    );

    const definition = await screen.findByRole("heading", { name: "Definition" });
    for (const name of [
      "Definition",
      "Requirement",
      "Revision Diff",
      "Tool 与 Validator",
      "Smoke Evidence",
      "审核历史",
      "Trigger Test",
      "审核决定",
    ]) {
      expect(screen.getByRole("heading", { name })).toHaveClass("skill-review-evidence-title");
    }
    expect(definition.tagName).toBe("H2");
    const reviewHistory = screen.getByRole("heading", { name: "审核历史" }).closest("section");
    expect(reviewHistory).not.toBeNull();
    expect(within(reviewHistory as HTMLElement).getByText("暂无审核记录")).toBeVisible();
    expect(within(reviewHistory as HTMLElement).queryByText("后端未提供")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行额外测试" })).toHaveClass("secondary-button", "creator-action-button");
    expect(screen.getByRole("button", { name: "批准" })).toHaveClass("primary-button", "creator-action-button");
    expect(screen.getByRole("button", { name: "拒绝" })).toHaveClass("secondary-button", "creator-action-button");
    expect(screen.getByRole("button", { name: "删除待审核提交" })).toHaveClass("secondary-button", "creator-action-button", "skill-draft-danger-button");
    expect(screen.getByText(/Validator 已在提交时由后端执行/)).toBeVisible();
    const triggerSection = screen.getByRole("heading", { name: "Trigger Test" }).closest("section");
    expect(triggerSection).not.toBeNull();
    fireEvent.click(within(triggerSection as HTMLElement).getByText("额外测试（不影响审核）"));
    fireEvent.click(within(triggerSection as HTMLElement).getByRole("button", { name: "运行额外测试" }));
    expect(within(triggerSection as HTMLElement).getByRole("alert")).toHaveTextContent("请先输入触发查询");
  });

  it("marks missing optional evidence instead of treating it as passing", async () => {
    const query = vi.fn(async (input: { operation: string }) => input.operation === "listSubmissions" ? [submission] : []);
    render(<ModeProvider><SkillReviewDetail client={{ query } as unknown as SkillMarketClient} id="submission-1" /></ModeProvider>);
    expect(await screen.findByRole("heading", { name: "demo-skill" })).toBeInTheDocument();
    expect(screen.getAllByText("后端未提供").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
  });

  it("allows only one trigger mutation while the request is pending", async () => {
    let resolveMutation!: (value: unknown) => void;
    const mutate = vi.fn(() => new Promise((resolve) => { resolveMutation = resolve; }));
    const query = vi.fn(async (input: { operation: string }) => input.operation === "listSubmissions" ? [submission] : []);
    const client = { mutate, query } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillReviewDetail client={client} id="submission-1" /></ModeProvider>);
    await screen.findByRole("heading", { name: "demo-skill" });
    fireEvent.click(screen.getByText("额外测试（不影响审核）"));
    expect(screen.getByRole("radio", { name: "应该触发" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "不应该触发" })).not.toBeChecked();
    expect(screen.getByText(/未显式选择.*不应该触发/)).toBeVisible();
    expect(screen.getByText(/使用 demo-skill/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("触发查询"), { target: { value: "run this skill" } });
    const run = screen.getByRole("button", { name: "运行额外测试" });
    fireEvent.click(run);
    fireEvent.click(run);
    expect(mutate).toHaveBeenCalledTimes(1);
    resolveMutation({ ok: true, value: {
      actualTrigger: true, createdAt: "2026-11-07T08:01:00.000Z", durationMs: 20,
      expectedTrigger: true, id: "run-1", model: "test", passed: true,
      query: "run this skill", runBy: "reviewer-1", submissionId: "submission-1",
    } });
    await waitFor(() => expect(screen.getByText("run this skill")).toBeInTheDocument());
    expect(screen.getByText("期望：触发 · 实际：触发")).toBeVisible();
  });

  it("shows the Trigger gate beside approval when only one of two cases passed", async () => {
    const gatedSubmission = {
      ...submission,
      triggerCases: [
        { expectedTrigger: true, id: "positive", query: "use demo-skill" },
        { expectedTrigger: false, id: "negative", query: "normal question" },
      ],
    };
    const runs = [
      { actualTrigger: true, createdAt: "2026-11-07T08:01:00.000Z", durationMs: 20, expectedTrigger: true, id: "run-1", model: "test", passed: true, query: "use demo-skill", runBy: "reviewer-1", submissionId: "submission-1" },
      { actualTrigger: true, createdAt: "2026-11-07T08:02:00.000Z", durationMs: 20, expectedTrigger: false, id: "run-2", model: "test", passed: false, query: "normal question", reason: "unexpected trigger", runBy: "reviewer-1", submissionId: "submission-1" },
    ];
    const query = vi.fn(async (input: { operation: string }) => input.operation === "listSubmissions" ? [gatedSubmission] : runs);
    const mutate = vi.fn();
    render(<ModeProvider><SkillReviewDetail client={{ mutate, query } as unknown as SkillMarketClient} id="submission-1" /></ModeProvider>);
    await screen.findByRole("heading", { name: "demo-skill" });

    expect(screen.getByText(/审核门禁：未通过 · 1\/2 个预置 Case 已通过/)).toBeVisible();
    expect(screen.getByText(/点击一次即可运行尚未通过的预置 Case/)).toBeVisible();
    expect(screen.getByText("已通过", { selector: ".skill-trigger-case-status" })).toBeVisible();
    expect(screen.getByText("未通过", { selector: ".skill-trigger-case-status" })).toBeVisible();
    for (const name of ["Definition 已核对", "Validator 已核对", "Trigger 证据已核对"]) fireEvent.click(screen.getByLabelText(name));
    fireEvent.click(screen.getByRole("button", { name: "批准" }));

    const decisionSection = screen.getByRole("heading", { name: "审核决定" }).closest("section");
    expect(within(decisionSection as HTMLElement).getByRole("alert")).toHaveTextContent("Trigger 审核门禁未通过：当前 1/2 个预置 Case 已通过");
    expect(mutate).not.toHaveBeenCalled();

    mutate.mockResolvedValueOnce({ ok: true, value: { ...runs[1], actualTrigger: false, id: "run-3", passed: true } });
    fireEvent.click(screen.getByRole("button", { name: "运行全部未通过 Case" }));
    await waitFor(() => expect(screen.getByText(/审核门禁：已通过 · 2\/2 个预置 Case 已通过/)).toBeVisible());
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      body: { expectedTrigger: false, query: "normal question" },
      operation: "runTriggerTests",
    }), expect.anything());
  });
});
