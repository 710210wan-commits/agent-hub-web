import type { SkillMarketError } from "../contracts/error";
import type { SkillCatalogViewModel } from "../contracts/catalog-view-model";

export type SkillCatalogPageState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; catalog: SkillCatalogViewModel }
  | { kind: "empty"; generatedAt: string }
  | { kind: "error"; error: SkillMarketError; catalog?: SkillCatalogViewModel }
  | { kind: "refreshing"; catalog: SkillCatalogViewModel };

export type SkillCatalogEvent =
  | { type: "skill-catalog-load-started" }
  | { type: "skill-catalog-load-succeeded"; catalog: SkillCatalogViewModel }
  | { type: "skill-catalog-load-failed"; error: SkillMarketError };

export function createInitialSkillCatalogState(): SkillCatalogPageState {
  return { kind: "idle" };
}

export function reduceSkillCatalogState(
  state: SkillCatalogPageState,
  event: SkillCatalogEvent,
): SkillCatalogPageState {
  switch (event.type) {
    case "skill-catalog-load-started":
      if (state.kind === "success") return { kind: "refreshing", catalog: state.catalog };
      if (state.kind === "refreshing") return state;
      if (state.kind === "error" && state.catalog) {
        return { kind: "refreshing", catalog: state.catalog };
      }
      return { kind: "loading" };
    case "skill-catalog-load-succeeded":
      if (event.catalog.items.length === 0) {
        return { kind: "empty", generatedAt: event.catalog.generatedAt };
      }
      return { kind: "success", catalog: event.catalog };
    case "skill-catalog-load-failed":
      if (state.kind === "refreshing") {
        return { kind: "error", error: event.error, catalog: state.catalog };
      }
      if (state.kind === "error" && state.catalog) {
        return { kind: "error", error: event.error, catalog: state.catalog };
      }
      return { kind: "error", error: event.error };
  }
}
