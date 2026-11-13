import type { AppMode } from "@/config/modes";

import {
  EMPTY_SKILL_CATALOG_FILTER,
  type SkillCatalogFilter,
} from "./catalog-filter";

const SOURCES = new Set<SkillCatalogFilter["source"]>(["all", "built-in", "market"]);
const STATUSES = new Set<SkillCatalogFilter["status"]>([
  "all",
  "built-in-active",
  "enabled",
  "installable",
  "blocked",
]);

export function parseSkillCatalogFilter(params: Pick<URLSearchParams, "get">): SkillCatalogFilter {
  const source = params.get("source") as SkillCatalogFilter["source"] | null;
  const status = params.get("status") as SkillCatalogFilter["status"] | null;
  return {
    search: params.get("search") ?? "",
    category: params.get("category") || "all",
    source: source && SOURCES.has(source) ? source : EMPTY_SKILL_CATALOG_FILTER.source,
    status: status && STATUSES.has(status) ? status : EMPTY_SKILL_CATALOG_FILTER.status,
  };
}

export function catalogDetailHref(
  id: string,
  filter: SkillCatalogFilter,
  mode: AppMode,
): string {
  return catalogHref(`/skills/${encodeURIComponent(id)}`, filter, mode);
}

export function catalogPlazaHref(filter: SkillCatalogFilter, mode: AppMode): string {
  return catalogHref("/skills", filter, mode);
}

function catalogHref(pathname: string, filter: SkillCatalogFilter, mode: AppMode): string {
  const params = new URLSearchParams({ mode });
  if (filter.search) params.set("search", filter.search);
  if (filter.category !== "all") params.set("category", filter.category);
  if (filter.source !== "all") params.set("source", filter.source);
  if (filter.status !== "all") params.set("status", filter.status);
  return `${pathname}?${params.toString()}`;
}
