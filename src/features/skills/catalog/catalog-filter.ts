import type { CatalogItemViewModel } from "../contracts/catalog-view-model";

export interface SkillCatalogFilter {
  search: string;
  category: string;
  source: "all" | CatalogItemViewModel["source"];
  status: "all" | "available" | "conflict";
}

export const EMPTY_SKILL_CATALOG_FILTER: SkillCatalogFilter = {
  search: "",
  category: "all",
  source: "all",
  status: "all",
};

export interface SkillCatalogSearchEntry {
  item: CatalogItemViewModel;
  haystack: string;
}

export function normalizeSkillCatalogSearchText(text: string): string {
  return text.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function isSkillCatalogFilterActive(filter: SkillCatalogFilter): boolean {
  return Boolean(
    normalizeSkillCatalogSearchText(filter.search) ||
      filter.category !== "all" ||
      filter.source !== "all" ||
      filter.status !== "all",
  );
}

export function buildSkillCatalogSearchIndex(
  items: readonly CatalogItemViewModel[],
): SkillCatalogSearchEntry[] {
  return items.map((item) => ({
    item,
    haystack: normalizeSkillCatalogSearchText(
      [item.name, item.description, ...item.tools].join(" "),
    ),
  }));
}

export function filterSkillCatalogEntries(
  entries: readonly SkillCatalogSearchEntry[],
  filter: SkillCatalogFilter,
): CatalogItemViewModel[] {
  const search = normalizeSkillCatalogSearchText(filter.search);
  return entries
    .filter(({ item, haystack }) => {
      if (search && !haystack.includes(search)) return false;
      if (filter.category !== "all" && item.categoryLabel !== filter.category) return false;
      if (filter.source !== "all" && item.source !== filter.source) return false;
      if (filter.status === "available" && item.conflict) return false;
      if (filter.status === "conflict" && !item.conflict) return false;
      return true;
    })
    .map(({ item }) => item);
}

export function filterSkillCatalogItems(
  items: readonly CatalogItemViewModel[],
  filter: SkillCatalogFilter,
): CatalogItemViewModel[] {
  return filterSkillCatalogEntries(buildSkillCatalogSearchIndex(items), filter);
}

export function listSkillCatalogCategories(
  items: readonly CatalogItemViewModel[],
): string[] {
  const labels = new Set<string>();
  for (const item of items) labels.add(item.categoryLabel);
  return [...labels].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}
