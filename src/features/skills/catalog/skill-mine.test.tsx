import { render, screen, waitFor } from "@testing-library/react";
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

function clientStub(query: ReturnType<typeof vi.fn>): SkillMarketClient {
  return { query } as unknown as SkillMarketClient;
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
    expect(screen.getByRole("link", { name: /my-draft/ })).toHaveAttribute(
      "href",
      "/skills/drafts/draft-1?mode=daily",
    );
    expect(screen.getByRole("link", { name: "上传草稿" })).toHaveAttribute(
      "href",
      "/skills/drafts/new?mode=daily",
    );
    expect(screen.getByRole("heading", { name: "Enabled Skill" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Available Skill" })).toBeInTheDocument();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("does not query either endpoint in work mode", async () => {
    mockMode = "work";
    const query = vi.fn();
    render(<ModeProvider><SkillMine client={clientStub(query)} /></ModeProvider>);
    expect(screen.getByRole("heading", { name: "办公场景暂未接入" })).toBeInTheDocument();
    await waitFor(() => expect(query).not.toHaveBeenCalled());
  });
});
