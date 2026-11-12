import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SkillMarketClient } from "../api/client";
import { ModeProvider } from "@/providers/mode-provider";

import { SkillMine } from "./skill-mine";

let mockMode = "daily";
vi.mock("next/navigation", () => ({
  usePathname: () => "/skills/mine",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`mode=${mockMode}`),
}));

function clientStub(query: ReturnType<typeof vi.fn>, mutate = vi.fn()): SkillMarketClient {
  return { mutate, query } as unknown as SkillMarketClient;
}

describe("SkillMine", () => {
  beforeEach(() => {
    mockMode = "daily";
  });

  it("uses backend drafts and the shared catalog to separate the three mine groups", async () => {
    const query = vi.fn(async (input: { operation: string }) => {
      if (input.operation === "listDrafts") {
        return [{ id: "draft-1", name: "my-draft", revision: 2, status: "editing", fileCount: 3 }];
      }
      return {
        generatedAt: "2026-11-07T00:00:00.000Z",
        total: 2,
        items: [
          {
            id: "market:enabled",
            name: "enabled",
            title: "Enabled Skill",
            description: "enabled",
            source: "market",
            publicationId: "pub-1",
            revision: 1,
            categoryLabel: "市场发布",
            categorySource: "inferred",
            tools: [],
            loadedScenarios: [{ id: "daily", name: "日常" }],
            scopes: [{ type: "scenario", id: "daily", name: "日常" }],
            installState: "enabled",
            conflict: null,
          },
          {
            id: "market:available",
            name: "available",
            title: "Available Skill",
            description: "available",
            source: "market",
            publicationId: "pub-2",
            revision: 1,
            categoryLabel: "市场发布",
            categorySource: "inferred",
            tools: [],
            loadedScenarios: [],
            scopes: [],
            installState: "installable",
            conflict: null,
          },
        ],
      };
    });

    render(<ModeProvider><SkillMine client={clientStub(query)} /></ModeProvider>);

    expect(await screen.findByRole("heading", { name: "我的 Skill" })).toBeInTheDocument();
    const draft = screen.getByRole("article", { name: "草稿 my-draft" });
    expect(within(draft).getByRole("link", { name: "编辑" })).toHaveAttribute(
      "href", "/skills/creator?mode=daily&draftId=draft-1",
    );
    expect(within(draft).getByRole("button", { name: "提交审核" })).toBeInTheDocument();
    expect(within(draft).getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "上传 Skill ZIP 或目录" })).toHaveAttribute(
      "href",
      "/skills/drafts/new?mode=daily",
    );
    expect(screen.getByRole("link", { name: "Creator" })).toHaveAttribute(
      "href",
      "/skills/creator?mode=daily",
    );
    expect(screen.getByRole("heading", { name: "Enabled Skill" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Available Skill" })).toBeInTheDocument();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("styles page actions like the plaza and omits manual refresh", async () => {
    const query = vi.fn(async (input: { operation: string }) =>
      input.operation === "listDrafts"
        ? []
        : { generatedAt: "2026-11-07T00:00:00.000Z", total: 0, items: [] },
    );
    render(<ModeProvider><SkillMine client={clientStub(query)} /></ModeProvider>);

    expect(await screen.findByRole("heading", { name: "我的 Skill" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 返回 Skill 广场" })).toHaveClass("back-link");
    for (const name of ["发布管理", "审核", "Creator"]) {
      expect(screen.getByRole("link", { name })).toHaveClass("skill-page-action");
    }
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
  });

  it("submits and deletes editing drafts from the workspace", async () => {
    const query = vi.fn(async (input: { operation: string }) => input.operation === "listDrafts"
      ? [{ id: "draft-1", name: "my-draft", revision: 2, status: "editing", fileCount: 3 }]
      : { generatedAt: "2026-11-07T00:00:00.000Z", total: 0, items: [] });
    const mutate = vi.fn(async (input: { operation: string }) => input.operation === "submitDraft"
      ? { ok: true, value: { id: "submission-1", revision: 2, status: "pending_review" } }
      : { ok: true, value: undefined });
    render(<ModeProvider><SkillMine client={clientStub(query, mutate)} /></ModeProvider>);
    const draft = await screen.findByRole("article", { name: "草稿 my-draft" });

    fireEvent.click(within(draft).getByRole("button", { name: "提交审核" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      mode: "daily", operation: "submitDraft", pathParameters: { id: "draft-1" },
    }), expect.anything()));
    expect(await screen.findByText(/已提交审核/)).toBeInTheDocument();

    const refreshedDraft = await screen.findByRole("article", { name: "草稿 my-draft" });
    fireEvent.click(within(refreshedDraft).getByRole("button", { name: "删除" }));
    fireEvent.click(within(refreshedDraft).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(mutate).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: "daily", operation: "deleteDraft", pathParameters: { id: "draft-1" },
    }), expect.anything()));
  });

  it("does not query either endpoint in work mode", async () => {
    mockMode = "work";
    const query = vi.fn();
    render(<ModeProvider><SkillMine client={clientStub(query)} /></ModeProvider>);
    expect(screen.getByRole("heading", { name: "办公场景暂未接入" })).toBeInTheDocument();
    await waitFor(() => expect(query).not.toHaveBeenCalled());
  });
});
