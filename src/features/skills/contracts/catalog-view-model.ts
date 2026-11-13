import { copy } from "@/config/copy";
import type { MarketCatalogResponse } from "./generated";
import { defineSkillMarketViewModelAdapter } from "./view-models";

export type SkillCatalogSource = "built-in" | "market";

export type SkillCatalogInstallState =
  | "built-in-active"
  | "enabled"
  | "installable"
  | "blocked";

export interface SkillCatalogScenarioViewModel {
  id: string;
  name: string;
}

export interface SkillCatalogScopeViewModel extends SkillCatalogScenarioViewModel {
  type: "scenario";
}

export interface CatalogItemViewModel {
  id: string;
  name: string;
  title: string;
  description: string;
  argumentHint?: string;
  source: SkillCatalogSource;
  publicationId: string | null;
  revision: number | null;
  categoryLabel: string;
  categorySource: "inferred";
  tools: string[];
  loadedScenarios: SkillCatalogScenarioViewModel[];
  scopes: SkillCatalogScopeViewModel[];
  installState: SkillCatalogInstallState;
  conflict: { reasonCode: "skill.protected_name_conflict" } | null;
}

export interface SkillCatalogViewModel {
  generatedAt: string;
  items: CatalogItemViewModel[];
  total: number;
}

type CatalogItemDto = MarketCatalogResponse["items"][number];

export function toSkillCatalogViewModel(dto: MarketCatalogResponse): SkillCatalogViewModel {
  return {
    generatedAt: dto.generatedAt,
    items: dto.items.map(toCatalogItemViewModel),
    total: dto.total,
  };
}

export const skillCatalogViewModelAdapter = defineSkillMarketViewModelAdapter(
  "getSkillCatalog",
  toSkillCatalogViewModel,
);

function toCatalogItemViewModel(dto: CatalogItemDto): CatalogItemViewModel {
  const source = dto.source ?? (dto.market ? "market" : "built-in");
  const conflict = dto.status === "conflict"
    ? { reasonCode: dto.availability?.reasonCode ?? "skill.protected_name_conflict" as const }
    : null;
  const scenarios = dto.loadedByScenarios.map(scenario => ({
    ...scenario,
    name: scenario.id === "daily" ? copy.mode.daily : scenario.id === "work" ? copy.mode.work : scenario.name,
  }));
  return {
    id: dto.id,
    name: dto.name,
    title: dto.title,
    description: dto.description,
    ...(dto.argumentHint ? { argumentHint: dto.argumentHint } : {}),
    source,
    publicationId: dto.market?.publicationId ?? null,
    revision: dto.market?.revision ?? null,
    categoryLabel: dto.categoryLabel,
    categorySource: dto.categorySource,
    tools: [...dto.allowedTools],
    loadedScenarios: scenarios,
    scopes: scenarios.map((scenario) => ({ type: "scenario", ...scenario })),
    installState: resolveInstallState(dto, source, conflict),
    conflict,
  };
}

function resolveInstallState(
  dto: CatalogItemDto,
  source: SkillCatalogSource,
  conflict: CatalogItemViewModel["conflict"],
): SkillCatalogInstallState {
  if (conflict) return "blocked";
  if (source === "built-in") return "built-in-active";
  const dailyEnabled = dto.loadedByScenarios.some((scenario) => scenario.id === "daily");
  return dailyEnabled ? "enabled" : "installable";
}
