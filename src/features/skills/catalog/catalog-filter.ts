import type { CatalogItemViewModel } from "../contracts/catalog-view-model";

export interface SkillCatalogFilter {
  search: string;
  category: string;
  source: "all" | CatalogItemViewModel["source"];
  status: "all" | CatalogItemViewModel["installState"];
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
      if (filter.status !== "all" && item.installState !== filter.status) return false;
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

/**
 * The unified Catalog currently infers `categoryLabel` from the item origin
 * (内置 Skill / 市场发布). While every label maps 1:1 onto a source, the
 * category filter restates the source filter and carries no extra
 * information, so the plaza hides it until the backend provides real
 * categories.
 */
export function areSkillCatalogCategoriesRedundant(
  items: readonly CatalogItemViewModel[],
): boolean {
  if (items.length === 0) return false;
  const labelSources = new Map<string, CatalogItemViewModel["source"]>();
  const sources = new Set<CatalogItemViewModel["source"]>();
  for (const item of items) {
    sources.add(item.source);
    const mapped = labelSources.get(item.categoryLabel);
    if (mapped === undefined) {
      labelSources.set(item.categoryLabel, item.source);
    } else if (mapped !== item.source) {
      return false;
    }
  }
  return labelSources.size === sources.size;
}
