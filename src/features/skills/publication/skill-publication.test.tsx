import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModeProvider } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { SkillMarketError } from "../contracts/error";
import { SkillPublicationDetail } from "./skill-publication-detail";
import { SkillPublicationList } from "./skill-publication-list";

let mockMode = "daily";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/skills/manage/pub-1",
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`mode=${mockMode}&scopeType=agent&scopeId=work`),
}));

const publication = {
  artifactKey: "demo-r1.zip", contentHash: "a".repeat(64), id: "pub-1",
  revision: 1, skillName: "demo-skill", status: "published" as const, submissionId: "sub-1",
};
const catalog = {
  generatedAt: "2026-11-07T08:00:00.000Z", total: 1,
  items: [{ categoryLabel: "其他", categorySource: "inferred", conflict: null,
    description: "Demo", id: "demo-skill", installState: "installable", loadedScenarios: [],
    name: "demo-skill", publicationId: "pub-1", revision: 1, scopes: [], source: "market",
    title: "Demo", tools: [] }],
};

function queryResult(input: { operation: string }) {
  return Promise.resolve(input.operation === "listPublications" ? [publication] : catalog);
}

describe("Skill publication management", () => {
  beforeEach(() => { mockMode = "daily"; push.mockClear(); });

  it("keeps work mode disconnected from the daily publication backend", async () => {
    mockMode = "work";
    const query = vi.fn();
    render(<ModeProvider><SkillPublicationList client={{ query } as unknown as SkillMarketClient} /></ModeProvider>);
    expect(screen.getByRole("heading", { name: "办公场景暂未接入" })).toBeInTheDocument();
    await waitFor(() => expect(query).not.toHaveBeenCalled());
  });

  it("styles the list page actions like the plaza and omits manual refresh", async () => {
    const query = vi.fn().mockResolvedValue([]);
    render(<ModeProvider><SkillPublicationList client={{ query } as unknown as SkillMarketClient} /></ModeProvider>);

    expect(await screen.findByRole("heading", { name: "发布管理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回广场" })).toHaveClass("skill-page-action");
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
  });

  it("does not allow URL parameters to expand the managed daily scope", async () => {
    const mutate = vi.fn().mockResolvedValue({ ok: true, value: {
      id: "installation-1", publicationId: "pub-1", scopeId: "daily", scopeType: "scenario", status: "enabled",
    } });
    const client = { mutate, query: vi.fn(queryResult) } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillPublicationDetail client={client} id="pub-1" /></ModeProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "安装并启用" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      body: { scopeId: "daily", scopeType: "scenario", status: "enabled" },
    }), expect.anything()));
  });

  it("shows a clear permission denial with a return path", async () => {
    const permission = new SkillMarketError({
      area: "publication", code: "skill.permission_denied", presentation: "permission",
      recovery: "back", retryable: false, status: 403, userMessage: "当前身份没有执行此操作的权限。",
    });
    const client = { query: vi.fn().mockRejectedValue(permission) } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillPublicationDetail client={client} id="pub-1" /></ModeProvider>);
    expect(await screen.findByRole("heading", { name: "无权执行此操作" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /返回发布管理/ })).toHaveAttribute("href", "/skills/manage?mode=daily");
  });
});
