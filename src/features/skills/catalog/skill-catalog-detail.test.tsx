import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SkillMarketClient } from "../api/client";
import { ModeProvider } from "@/providers/mode-provider";

import { SkillCatalogDetail } from "./skill-catalog-detail";

vi.mock("next/navigation", () => ({
  usePathname: () => "/skills/market%3Apub-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("mode=daily&search=report&source=market"),
}));

function clientWith(items: unknown[]): SkillMarketClient {
  return {
    query: vi.fn(async () => ({
      generatedAt: "2026-11-07T00:00:00.000Z",
      items,
      total: items.length,
    })),
  } as unknown as SkillMarketClient;
}

describe("SkillCatalogDetail", () => {
  it("renders safe catalog metadata and preserves list context in the back link", async () => {
    render(
      <ModeProvider>
        <SkillCatalogDetail
          client={clientWith([{
            id: "market:pub-1",
            name: "report-skill",
            title: "Report Skill",
            description: "生成报告",
            source: "market",
            publicationId: "pub-1",
            revision: 3,
            categoryLabel: "市场发布",
            categorySource: "inferred",
            tools: ["document-render"],
            loadedScenarios: [{ id: "daily", name: "日常" }],
            scopes: [{ type: "scenario", id: "daily", name: "日常" }],
            installState: "enabled",
            conflict: null,
          }])}
          id="market:pub-1"
        />
      </ModeProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Report Skill" })).toBeInTheDocument();
    expect(screen.getByText("document-render")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回 Skill 广场" }))
      .toHaveAttribute("href", expect.stringContaining("search=report"));
    expect(screen.queryByText(/prompt/i)).not.toBeInTheDocument();
  });

  it("shows a resource-not-found state for an unknown id", async () => {
    render(
      <ModeProvider>
        <SkillCatalogDetail client={clientWith([])} id="missing" />
      </ModeProvider>,
    );
    expect(await screen.findByText("未找到该 Skill")).toBeInTheDocument();
  });
});
