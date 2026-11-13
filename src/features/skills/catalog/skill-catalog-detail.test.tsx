import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/providers/auth-provider";
import { ModeProvider } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import skillFileFixture from "../work/fixtures/skill-file.json";
import skillListFixture from "../work/fixtures/skill-list.json";
import skillTreeFixture from "../work/fixtures/skill-tree.json";
import type { WorkSkillListEnvelope } from "../work/contracts";
import type { WorkSkillsApi } from "../work/work-api";

import { SkillCatalogDetail } from "./skill-catalog-detail";

let mockSearch = "mode=daily&search=report&source=market";
const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/skills/market%3Apub-1",
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

const reportItem = {
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
};

function clientWith(items: unknown[], query?: ReturnType<typeof vi.fn>): SkillMarketClient {
  const queryFn =
    query ??
    vi.fn(async () => ({
      generatedAt: "2026-11-07T00:00:00.000Z",
      items,
      total: items.length,
    }));
  return { query: queryFn } as unknown as SkillMarketClient;
}

const workListEnvelope = skillListFixture as unknown as WorkSkillListEnvelope;

beforeEach(() => {
  mockSearch = "mode=daily&search=report&source=market";
  push.mockClear();
});

function workApiStub(overrides: Partial<WorkSkillsApi> = {}): WorkSkillsApi {
  return {
    listSkills: vi.fn(async () => structuredClone(workListEnvelope)),
    getSkillTree: vi.fn(async () => skillTreeFixture.data),
    getSkillFile: vi.fn(async () => skillFileFixture.data),
    ...overrides,
  } as unknown as WorkSkillsApi;
}

function renderDetailWork(id: string, workApi: WorkSkillsApi) {
  return render(
    <AuthProvider>
      <ModeProvider>
        <SkillCatalogDetail id={id} workApi={workApi} />
      </ModeProvider>
    </AuthProvider>,
  );
}

describe("SkillCatalogDetail work mode（Task 5）", () => {
  it("renders the Work editor with its management tabs in work mode", async () => {
    mockSearch = "mode=work";
    renderDetailWork("mysql-reporter", workApiStub());

    expect(await screen.findByRole("heading", { name: "MySQL Reporter" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "代码管理" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "生效范围" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "依赖管理" })).toBeInTheDocument();
  });

  it("keeps the daily catalog client untouched in work mode", async () => {
    mockSearch = "mode=work";
    const query = vi.fn(async () => {
      throw new Error("daily catalog must not be requested in work mode");
    });
    render(
      <AuthProvider>
        <ModeProvider>
          <SkillCatalogDetail client={clientWith([], query)} id="mysql-reporter" workApi={workApiStub()} />
        </ModeProvider>
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: "MySQL Reporter" })).toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
  });

  it("never calls the Work BFF client while in daily mode", async () => {
    mockSearch = "mode=daily&search=report&source=market";
    const workApi = workApiStub();
    render(
      <ModeProvider>
        <SkillCatalogDetail client={clientWith([reportItem])} id="market:pub-1" workApi={workApi} />
      </ModeProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Report Skill" })).toBeInTheDocument();
    expect(workApi.listSkills).not.toHaveBeenCalled();
  });

  it("navigates back to the Work market from the editor", async () => {
    mockSearch = "mode=work";
    renderDetailWork("mysql-reporter", workApiStub());

    fireEvent.click(await screen.findByRole("button", { name: "← 返回 Work Skill" }));
    expect(push).toHaveBeenCalledWith("/skills?mode=2");
  });

  it("aborts the in-flight Work request when switching to daily mode", async () => {
    let workSignal: AbortSignal | undefined;
    const workApi = workApiStub({
      listSkills: vi.fn((signal?: AbortSignal) => {
        workSignal = signal;
        return new Promise<WorkSkillListEnvelope>(() => undefined);
      }),
    });
    mockSearch = "mode=work";
    const view = renderDetailWork("mysql-reporter", workApi);
    await waitFor(() => expect(workSignal).toBeDefined());

    const query = vi.fn(async () => ({
      generatedAt: "2026-11-07T00:00:00.000Z",
      items: [reportItem],
      total: 1,
    }));
    mockSearch = "mode=daily&search=report&source=market";
    view.rerender(
      <AuthProvider>
        <ModeProvider>
          <SkillCatalogDetail client={clientWith([], query)} id="market:pub-1" workApi={workApi} />
        </ModeProvider>
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Report Skill" })).toBeInTheDocument();
    expect(workSignal?.aborted).toBe(true);
  });

  it("aborts the in-flight daily request when switching to work mode", async () => {
    mockSearch = "mode=daily&search=report&source=market";
    let dailySignal: AbortSignal | undefined;
    const query = vi.fn((...args: unknown[]) => {
      dailySignal = (args[0] as { signal?: AbortSignal } | undefined)?.signal;
      return new Promise(() => undefined);
    });
    const view = render(
      <ModeProvider>
        <SkillCatalogDetail client={clientWith([], query)} id="market:pub-1" workApi={workApiStub()} />
      </ModeProvider>,
    );
    await waitFor(() => expect(dailySignal).toBeDefined());

    mockSearch = "mode=work";
    view.rerender(
      <AuthProvider>
        <ModeProvider>
          <SkillCatalogDetail id="mysql-reporter" workApi={workApiStub()} />
        </ModeProvider>
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: "MySQL Reporter" })).toBeInTheDocument();
    expect(dailySignal?.aborted).toBe(true);
  });
});

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
    expect(screen.getByRole("link", { name: "← 返回 Skill 广场" }))
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
