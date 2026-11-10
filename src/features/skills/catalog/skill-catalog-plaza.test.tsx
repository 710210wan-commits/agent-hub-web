import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SkillMarketClient } from "../api/client";
import { SkillMarketError } from "../contracts/error";
import type { CatalogItemViewModel, SkillCatalogViewModel } from "../contracts/catalog-view-model";
import { ModeProvider } from "@/providers/mode-provider";

import { SkillCatalogPlaza } from "./skill-catalog-plaza";

let mockMode = "daily";

vi.mock("next/navigation", () => ({
  usePathname: () => "/skills",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`mode=${mockMode}`),
}));

function catalogItem(overrides: Partial<CatalogItemViewModel> = {}): CatalogItemViewModel {
  return {
    id: "built-in:alpha",
    name: "alpha-query",
    title: "Alpha Query",
    description: "查询日常目标",
    source: "built-in",
    publicationId: null,
    revision: null,
    categoryLabel: "内置 Skill",
    categorySource: "inferred",
    tools: ["gis-query"],
    loadedScenarios: [],
    scopes: [],
    installState: "built-in-active",
    conflict: null,
    ...overrides,
  };
}

function catalog(items: CatalogItemViewModel[]): SkillCatalogViewModel {
  return { generatedAt: "2026-11-07T00:00:00.000Z", items, total: items.length };
}

function clientStub(query: ReturnType<typeof vi.fn>): SkillMarketClient {
  return { query } as unknown as SkillMarketClient;
}

function renderPlaza(client?: SkillMarketClient) {
  return render(
    <ModeProvider>
      <SkillCatalogPlaza client={client} />
    </ModeProvider>,
  );
}

function cardOf(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const card = heading.closest("article");
  if (!card) throw new Error(`card not found for ${title}`);
  return card as HTMLElement;
}

const mixedCatalog = catalog([
  catalogItem({
    id: "built-in:alpha",
    title: "Alpha Query",
    description: "查询日常目标",
    installState: "built-in-active",
    loadedScenarios: [{ id: "daily", name: "日常" }],
    scopes: [{ type: "scenario", id: "daily", name: "日常" }],
  }),
  catalogItem({
    id: "market:beta",
    name: "beta-report",
    title: "Beta Report",
    description: "生成报告草稿",
    source: "market",
    publicationId: "pub-1",
    revision: 2,
    categoryLabel: "市场发布",
    installState: "enabled",
    tools: ["document-render"],
  }),
  catalogItem({
    id: "market:gamma",
    name: "gamma-gis",
    title: "Gamma GIS",
    description: "GIS 分析工具",
    source: "market",
    publicationId: "pub-2",
    revision: 1,
    categoryLabel: "市场发布",
    installState: "blocked",
    conflict: { reasonCode: "skill.protected_name_conflict" },
    tools: [],
  }),
]);

describe("SkillCatalogPlaza", () => {
  beforeEach(() => {
    mockMode = "daily";
  });

  it("shows the work placeholder without requesting the catalog", async () => {
    mockMode = "work";
    const query = vi.fn();
    renderPlaza(clientStub(query));

    expect(screen.getByRole("heading", { name: "办公场景暂未接入" })).toBeInTheDocument();
    await waitFor(() => expect(query).not.toHaveBeenCalled());
  });

  it("renders a loading state before the first catalog arrives", () => {
    const query = vi.fn(() => new Promise<SkillCatalogViewModel>(() => undefined));
    renderPlaza(clientStub(query));

    expect(screen.getByRole("status")).toHaveTextContent("正在加载 Skill 广场…");
  });

  it("renders built-in, market and conflict items with determinate badges", async () => {
    const query = vi.fn(async () => mixedCatalog);
    renderPlaza(clientStub(query));

    expect(await screen.findByRole("heading", { name: "Alpha Query" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beta Report" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gamma GIS" })).toBeInTheDocument();

    const alphaCard = cardOf("Alpha Query");
    expect(within(alphaCard).getByText("内置 Skill")).toBeInTheDocument();
    expect(within(alphaCard).getByText("运行中")).toBeInTheDocument();

    const betaCard = cardOf("Beta Report");
    expect(within(betaCard).getByText("市场发布")).toBeInTheDocument();
    expect(within(betaCard).getByText("已启用")).toBeInTheDocument();
    expect(within(betaCard).getByText(/r2/)).toBeInTheDocument();

    const gammaCard = cardOf("Gamma GIS");
    expect(within(gammaCard).getByText("名称冲突")).toBeInTheDocument();
    expect(within(gammaCard).getByText("不可用")).toBeInTheDocument();
  });

  it("opens card details in a dismissible right-side dialog", async () => {
    const query = vi.fn(async () => mixedCatalog);
    renderPlaza(clientStub(query));

    const cardTrigger = await screen.findByRole("button", { name: "查看 Alpha Query 详情" });
    cardTrigger.focus();
    fireEvent.click(cardTrigger);

    const dialog = screen.getByRole("dialog", { name: "Alpha Query" });
    expect(within(dialog).getByText("查询日常目标")).toBeInTheDocument();
    expect(within(dialog).getByText("gis-query")).toBeInTheDocument();
    expect(within(dialog).getAllByText("内置 Skill")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Alpha Query" })).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Alpha Query" })).not.toBeInTheDocument();
    expect(cardTrigger).toHaveFocus();
  });

  it("styles the page actions as buttons, leads creation to the Creator and omits manual refresh", async () => {
    const query = vi.fn(async () => mixedCatalog);
    renderPlaza(clientStub(query));
    await screen.findByRole("heading", { name: "Alpha Query" });

    for (const name of ["创建 Skill", "发布管理", "审核", "我的"]) {
      expect(screen.getByRole("link", { name })).toHaveClass("skill-page-action");
    }
    expect(screen.getByRole("link", { name: "创建 Skill" })).toHaveAttribute(
      "href",
      "/skills/creator?mode=daily",
    );
    expect(screen.getByRole("link", { name: "创建 Skill" })).toHaveClass("skill-page-action-primary");
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
  });

  it("shows a persistent error state with retry when the initial load fails", async () => {
    const query = vi.fn(async (): Promise<SkillCatalogViewModel> => {
      throw new SkillMarketError({
        code: "SKILL_MARKET_UPSTREAM_UNAVAILABLE",
        presentation: "unavailable",
        recovery: "retry",
        retryable: true,
        status: 502,
        userMessage: "Skill Market 服务暂不可用，请稍后重试。",
      });
    });
    renderPlaza(clientStub(query));

    expect(await screen.findByRole("alert")).toHaveTextContent("Skill Market 服务暂不可用");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  });

  it("uses distinct copy for an empty catalog and for zero search results", async () => {
    const query = vi.fn(async () => catalog([]));
    const { unmount } = renderPlaza(clientStub(query));
    expect(await screen.findByText("Skill 广场暂无内容")).toBeInTheDocument();
    unmount();

    const queryWithData = vi.fn(async () => mixedCatalog);
    renderPlaza(clientStub(queryWithData));
    const search = await screen.findByRole("searchbox", { name: "搜索 Skill" });
    fireEvent.change(search, { target: { value: "不存在的技能" } });

    expect(screen.getByText("没有符合条件的 Skill")).toBeInTheDocument();
    expect(screen.queryByText("Skill 广场暂无内容")).not.toBeInTheDocument();
  });

  it("filters by normalized search across name, description and tools", async () => {
    const query = vi.fn(async () => mixedCatalog);
    renderPlaza(clientStub(query));
    const search = await screen.findByRole("searchbox", { name: "搜索 Skill" });

    fireEvent.change(search, { target: { value: "ＢＥＴＡ" } });
    expect(screen.getByRole("heading", { name: "Beta Report" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Alpha Query" })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "gis" } });
    expect(screen.getByRole("heading", { name: "Alpha Query" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gamma GIS" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Beta Report" })).not.toBeInTheDocument();
  });

  it("composes source, status and category filters with a clear action", async () => {
    const query = vi.fn(async () => mixedCatalog);
    renderPlaza(clientStub(query));
    await screen.findByRole("heading", { name: "Alpha Query" });

    fireEvent.change(screen.getByRole("combobox", { name: "来源" }), {
      target: { value: "market" },
    });
    expect(screen.queryByRole("heading", { name: "Alpha Query" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beta Report" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gamma GIS" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "状态" }), {
      target: { value: "conflict" },
    });
    expect(screen.getByRole("heading", { name: "Gamma GIS" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Beta Report" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getByRole("heading", { name: "Alpha Query" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beta Report" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "搜索 Skill" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "清除筛选" })).not.toBeInTheDocument();
  });

  it("limits the category filter options to labels present in the catalog", async () => {
    const query = vi.fn(async () => mixedCatalog);
    renderPlaza(clientStub(query));
    await screen.findByRole("heading", { name: "Alpha Query" });

    const category = screen.getByRole("combobox", { name: "分类" });
    const options = Array.from(category.querySelectorAll("option")).map((option) => option.value);
    expect(options).toEqual(["all", "内置 Skill", "市场发布"]);
  });

  it("filters 500 catalog entries per keystroke with a single catalog load", async () => {
    const many = catalog(
      Array.from({ length: 500 }, (_, index) =>
        catalogItem({
          id: `market:skill-${index}`,
          name: `skill-${String(index).padStart(3, "0")}`,
          title: `Skill ${index}`,
          description: `第 ${index} 个市场 Skill`,
          source: "market",
          publicationId: `pub-${index}`,
          revision: 1,
          categoryLabel: "市场发布",
          installState: "installable",
        }),
      ),
    );
    const query = vi.fn(async () => many);
    renderPlaza(clientStub(query));
    await screen.findByRole("heading", { name: "Skill 0" });

    const search = screen.getByRole("searchbox", { name: "搜索 Skill" });
    fireEvent.change(search, { target: { value: "skill-042" } });
    expect(screen.getByRole("heading", { name: "Skill 42" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Skill 0" })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByRole("heading", { name: "Skill 0" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Skill 499" })).toBeInTheDocument();
    expect(query).toHaveBeenCalledTimes(1);
  }, 10_000);
});
