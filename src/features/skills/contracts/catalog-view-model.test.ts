import { describe, expect, it } from "vitest";

import type { MarketCatalogResponse } from "./generated";
import {
  skillCatalogViewModelAdapter,
} from "./catalog-view-model";
import { defineSkillMarketViewModelAdapter } from "./view-models";

type CatalogItemDto = MarketCatalogResponse["items"][number];

function catalogItemDto(overrides: Partial<CatalogItemDto> = {}): CatalogItemDto {
  return {
    allowedTools: ["gis-query"],
    category: "other",
    categoryLabel: "市场发布",
    categorySource: "inferred",
    description: "查询区域目标",
    id: "market:pub-1",
    loadedByScenarios: [],
    name: "region-query",
    relativePath: "market://pub-1/SKILL.md",
    sourceDir: "Skill Market",
    status: "available",
    title: "Region Query",
    ...overrides,
  };
}

function toViewModel(dto: MarketCatalogResponse) {
  return skillCatalogViewModelAdapter.toViewModel(dto);
}

describe("skillCatalogViewModelAdapter", () => {
  it("is bound to the getSkillCatalog operation", () => {
    expect(skillCatalogViewModelAdapter.operation).toBe("getSkillCatalog");
    expect(skillCatalogViewModelAdapter).toBeInstanceOf(Object);
    expect(typeof skillCatalogViewModelAdapter.toViewModel).toBe("function");
  });

  it("maps a built-in item to a determinate built-in view model", () => {
    const dto: MarketCatalogResponse = {
      generatedAt: "2026-11-07T00:00:00.000Z",
      items: [{
        ...catalogItemDto({
          id: "built-in:daily-brief",
          source: "built-in",
          sourceDir: "skills/daily",
          relativePath: "skills/daily/daily-brief/SKILL.md",
          name: "daily-brief",
          title: "Daily Brief",
          description: "内置日报 Skill",
          categoryLabel: "内置 Skill",
          loadedByScenarios: [{ id: "daily", name: "日常" }],
          availability: { installable: false, runnable: true },
        }),
        market: undefined,
      }],
      total: 1,
    };

    const viewModel = toViewModel(dto);

    expect(viewModel.total).toBe(1);
    expect(viewModel.generatedAt).toBe("2026-11-07T00:00:00.000Z");
    const item = viewModel.items[0];
    expect(item).toMatchObject({
      id: "built-in:daily-brief",
      name: "daily-brief",
      source: "built-in",
      publicationId: null,
      revision: null,
      categoryLabel: "内置 Skill",
      installState: "built-in-active",
      conflict: null,
    });
    expect(item.loadedScenarios).toEqual([{ id: "daily", name: "日常" }]);
    expect(item).toHaveProperty("scopes", [
      { type: "scenario", id: "daily", name: "日常" },
    ]);
    expect(item.tools).toEqual(["gis-query"]);
  });

  it("maps an enabled market item with revision and loaded scenarios", () => {
    const dto: MarketCatalogResponse = {
      generatedAt: "2026-11-07T00:00:00.000Z",
      items: [catalogItemDto({
        source: "market",
        market: { publicationId: "pub-1", revision: 3 },
        loadedByScenarios: [{ id: "daily", name: "日常" }],
        availability: { installable: true, runnable: true },
      })],
      total: 1,
    };

    const item = toViewModel(dto).items[0];

    expect(item).toMatchObject({
      source: "market",
      publicationId: "pub-1",
      revision: 3,
      installState: "enabled",
      conflict: null,
    });
  });

  it("does not treat a legacy non-daily installation as daily enabled", () => {
    const dto: MarketCatalogResponse = {
      generatedAt: "2026-11-08T00:00:00.000Z",
      items: [catalogItemDto({
        source: "market",
        market: { publicationId: "pub-osint", revision: 1 },
        loadedByScenarios: [{ id: "osint", name: "开源情报" }],
        availability: { installable: true, runnable: true },
      })],
      total: 1,
    };

    const item = toViewModel(dto).items[0];

    expect(item.installState).toBe("installable");
    expect(item.scopes).toEqual([{ id: "osint", name: "开源情报", type: "scenario" }]);
  });

  it("maps an installable market item that is not enabled anywhere yet", () => {
    const dto: MarketCatalogResponse = {
      generatedAt: "2026-11-07T00:00:00.000Z",
      items: [catalogItemDto({
        source: "market",
        market: { publicationId: "pub-2", revision: 1 },
        loadedByScenarios: [],
        availability: { installable: true, runnable: false },
      })],
      total: 1,
    };

    const item = toViewModel(dto).items[0];

    expect(item.installState).toBe("installable");
    expect(item.conflict).toBeNull();
  });

  it("maps a protected-name conflict item as blocked with the backend reason code", () => {
    const dto: MarketCatalogResponse = {
      generatedAt: "2026-11-07T00:00:00.000Z",
      items: [catalogItemDto({
        source: "market",
        status: "conflict",
        market: { publicationId: "pub-3", revision: 2 },
        availability: {
          installable: false,
          reasonCode: "skill.protected_name_conflict",
          runnable: false,
        },
      })],
      total: 1,
    };

    const item = toViewModel(dto).items[0];

    expect(item.installState).toBe("blocked");
    expect(item.conflict).toEqual({ reasonCode: "skill.protected_name_conflict" });
  });

  it("keeps legacy items without source or availability determinate", () => {
    const legacyMarket = catalogItemDto({
      market: { publicationId: "pub-9", revision: 4 },
      loadedByScenarios: [],
    });
    delete (legacyMarket as Partial<CatalogItemDto>).source;
    delete (legacyMarket as Partial<CatalogItemDto>).availability;
    const legacyBuiltIn = catalogItemDto({
      id: "built-in:legacy",
      sourceDir: "skills",
      relativePath: "skills/legacy/SKILL.md",
      market: undefined,
      loadedByScenarios: [{ id: "daily", name: "日常" }],
    });
    delete (legacyBuiltIn as Partial<CatalogItemDto>).source;
    delete (legacyBuiltIn as Partial<CatalogItemDto>).availability;

    const viewModel = toViewModel({
      generatedAt: "2026-11-07T00:00:00.000Z",
      items: [legacyMarket, legacyBuiltIn],
      total: 2,
    });

    expect(viewModel.items[0]).toMatchObject({
      source: "market",
      revision: 4,
      installState: "installable",
      conflict: null,
    });
    expect(viewModel.items[1]).toMatchObject({
      source: "built-in",
      revision: null,
      installState: "built-in-active",
      conflict: null,
    });
  });

  it("only exposes fields present in the contract without inventing prompts", () => {
    const viewModel = toViewModel({
      generatedAt: "2026-11-07T00:00:00.000Z",
      items: [catalogItemDto({ argumentHint: "输入区域名称" })],
      total: 1,
    });

    const item = viewModel.items[0];
    expect(Object.keys(item).sort()).toEqual([
      "argumentHint",
      "categoryLabel",
      "categorySource",
      "conflict",
      "description",
      "id",
      "installState",
      "loadedScenarios",
      "name",
      "publicationId",
      "revision",
      "scopes",
      "source",
      "title",
      "tools",
    ].sort());
    expect("prompt" in item).toBe(false);
    expect(item.argumentHint).toBe("输入区域名称");
  });

  it("copies collections so later DTO mutation cannot change the view model", () => {
    const dtoItem = catalogItemDto({
      allowedTools: ["gis-query"],
      loadedByScenarios: [{ id: "daily", name: "日常" }],
    });
    const viewModel = toViewModel({
      generatedAt: "2026-11-07T00:00:00.000Z",
      items: [dtoItem],
      total: 1,
    });

    dtoItem.allowedTools.push("injected-tool");
    dtoItem.loadedByScenarios.push({ id: "work", name: "办公" });

    expect(viewModel.items[0].tools).toEqual(["gis-query"]);
    expect(viewModel.items[0].loadedScenarios).toEqual([{ id: "daily", name: "日常" }]);
  });

  it("fits the SkillMarketViewModelAdapter contract", () => {
    const adapter = defineSkillMarketViewModelAdapter("getSkillCatalog", (dto) => toViewModel(dto));
    expect(adapter.operation).toBe("getSkillCatalog");
  });
});
