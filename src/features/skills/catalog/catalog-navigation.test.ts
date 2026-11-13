import { describe, expect, it } from "vitest";

import {
  catalogDetailHref,
  catalogPlazaHref,
  parseSkillCatalogFilter,
} from "./catalog-navigation";

describe("catalog navigation", () => {
  it("restores only valid filter values from a deep link", () => {
    const params = new URLSearchParams(
      "search=%EF%BC%A7%EF%BC%A9%EF%BC%B3&category=%E5%B8%82%E5%9C%BA%E5%8F%91%E5%B8%83&source=market&status=blocked",
    );
    expect(parseSkillCatalogFilter(params)).toEqual({
      search: "ＧＩＳ",
      category: "市场发布",
      source: "market",
      status: "blocked",
    });

    expect(parseSkillCatalogFilter(new URLSearchParams("source=unsafe&status=unsafe")))
      .toMatchObject({ source: "all", status: "all" });
  });

  it("round-trips list context through detail and back links", () => {
    const filter = {
      search: "gis query",
      category: "市场发布",
      source: "market" as const,
      status: "installable" as const,
    };
    const detail = catalogDetailHref("market:publication-1", filter, "daily");
    expect(detail).toContain("/skills/market%3Apublication-1?");
    expect(parseSkillCatalogFilter(new URL(detail, "https://local").searchParams)).toEqual(filter);
    expect(catalogPlazaHref(filter, "daily")).toContain("/skills?mode=1");
  });
});
