import { describe, expect, it } from "vitest";

import type { CatalogItemViewModel } from "../contracts/catalog-view-model";
import {
  buildSkillCatalogSearchIndex,
  EMPTY_SKILL_CATALOG_FILTER,
  filterSkillCatalogEntries,
  filterSkillCatalogItems,
  isSkillCatalogFilterActive,
  listSkillCatalogCategories,
  normalizeSkillCatalogSearchText,
  type SkillCatalogFilter,
} from "./catalog-filter";

function item(overrides: Partial<CatalogItemViewModel> = {}): CatalogItemViewModel {
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
    installState: "built-in-active",
    conflict: null,
    ...overrides,
  };
}

function filter(overrides: Partial<SkillCatalogFilter> = {}): SkillCatalogFilter {
  return { ...EMPTY_SKILL_CATALOG_FILTER, ...overrides };
}

describe("normalizeSkillCatalogSearchText", () => {
  it("applies NFKC, trims whitespace and folds case", () => {
    expect(normalizeSkillCatalogSearchText("　ＧＩＳ-Query　")).toBe("gis-query");
    expect(normalizeSkillCatalogSearchText("Region  QUERY")).toBe("region  query");
  });
});

describe("filterSkillCatalogEntries", () => {
  const items = [
    item({
      id: "built-in:alpha",
      name: "alpha-query",
      description: "查询日常目标",
      tools: ["gis-query"],
    }),
    item({
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
    item({
      id: "market:gamma",
      name: "gamma-gis",
      title: "Gamma GIS",
      description: "GIS 分析",
      source: "market",
      publicationId: "pub-2",
      revision: 1,
      installState: "blocked",
      conflict: { reasonCode: "skill.protected_name_conflict" },
      tools: [],
    }),
  ];

  it("returns all items unchanged for the empty filter", () => {
    const result = filterSkillCatalogItems(items, EMPTY_SKILL_CATALOG_FILTER);
    expect(result.map((entry) => entry.id)).toEqual(["built-in:alpha", "market:beta", "market:gamma"]);
  });

  it("matches name, description and tools with normalized text", () => {
    const byName = filterSkillCatalogItems(items, filter({ search: "ALPHA" }));
    expect(byName.map((entry) => entry.id)).toEqual(["built-in:alpha"]);

    const byDescription = filterSkillCatalogItems(items, filter({ search: "报告" }));
    expect(byDescription.map((entry) => entry.id)).toEqual(["market:beta"]);

    const byTool = filterSkillCatalogItems(items, filter({ search: "ＧＩＳ-QUERY" }));
    expect(byTool.map((entry) => entry.id)).toEqual(["built-in:alpha"]);
  });

  it("composes search with source, category and status filters", () => {
    const entries = buildSkillCatalogSearchIndex(items);

    const marketOnly = filterSkillCatalogEntries(entries, filter({ source: "market" }));
    expect(marketOnly.map((entry) => entry.id)).toEqual(["market:beta", "market:gamma"]);

    const marketReport = filterSkillCatalogEntries(entries, filter({ source: "market", category: "市场发布" }));
    expect(marketReport.map((entry) => entry.id)).toEqual(["market:beta"]);

    const conflictOnly = filterSkillCatalogEntries(entries, filter({ status: "conflict" }));
    expect(conflictOnly.map((entry) => entry.id)).toEqual(["market:gamma"]);

    const gisMarket = filterSkillCatalogEntries(entries, filter({ search: "gis", source: "market" }));
    expect(gisMarket.map((entry) => entry.id)).toEqual(["market:gamma"]);
  });

  it("keeps the backend order stable across searches", () => {
    const ordered = [
      item({ id: "market:zulu", name: "zulu", title: "Zulu" }),
      item({ id: "built-in:mike", name: "mike-query", title: "Mike" }),
      item({ id: "market:alpha", name: "alpha-tool", title: "Alpha Tool" }),
    ];
    const entries = buildSkillCatalogSearchIndex(ordered);
    const result = filterSkillCatalogEntries(entries, filter({ search: "query" }));
    expect(result.map((entry) => entry.id)).toEqual(["market:zulu", "built-in:mike", "market:alpha"]);
  });
});

describe("isSkillCatalogFilterActive", () => {
  it("is inactive only for the empty filter", () => {
    expect(isSkillCatalogFilterActive(EMPTY_SKILL_CATALOG_FILTER)).toBe(false);
    expect(isSkillCatalogFilterActive(filter({ search: "  " }))).toBe(false);
    expect(isSkillCatalogFilterActive(filter({ search: "gis" }))).toBe(true);
    expect(isSkillCatalogFilterActive(filter({ category: "内置 Skill" }))).toBe(true);
    expect(isSkillCatalogFilterActive(filter({ source: "market" }))).toBe(true);
    expect(isSkillCatalogFilterActive(filter({ status: "conflict" }))).toBe(true);
  });
});

describe("listSkillCatalogCategories", () => {
  it("returns distinct category labels in stable order", () => {
    const labels = listSkillCatalogCategories([
      item({ id: "a", categoryLabel: "市场发布" }),
      item({ id: "b", categoryLabel: "内置 Skill" }),
      item({ id: "c", categoryLabel: "市场发布" }),
    ]);
    expect(labels).toEqual(["内置 Skill", "市场发布"]);
  });
});
