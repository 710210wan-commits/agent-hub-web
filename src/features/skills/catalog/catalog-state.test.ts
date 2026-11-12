import { describe, expect, it } from "vitest";

import { SkillMarketError } from "../contracts/error";
import type { SkillCatalogViewModel } from "../contracts/catalog-view-model";
import {
  createInitialSkillCatalogState,
  reduceSkillCatalogState,
} from "./catalog-state";

function catalog(itemCount = 1): SkillCatalogViewModel {
  return {
    generatedAt: "2026-11-07T00:00:00.000Z",
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `skill-${index}`,
      name: `skill-${index}`,
      title: `Skill ${index}`,
      description: "描述",
      source: "built-in" as const,
      publicationId: null,
      revision: null,
      categoryLabel: "内置 Skill",
      categorySource: "inferred" as const,
      tools: [],
      loadedScenarios: [],
      scopes: [],
      installState: "built-in-active" as const,
      conflict: null,
    })),
    total: itemCount,
  };
}

function failure(): SkillMarketError {
  return new SkillMarketError({
    code: "SKILL_MARKET_UPSTREAM_UNAVAILABLE",
    presentation: "unavailable",
    recovery: "retry",
    retryable: true,
    status: 502,
    userMessage: "Skill Market 服务暂不可用，请稍后重试。",
  });
}

describe("reduceSkillCatalogState", () => {
  it("starts idle", () => {
    expect(createInitialSkillCatalogState()).toEqual({ kind: "idle" });
  });

  it("resets loaded daily data to idle", () => {
    expect(reduceSkillCatalogState(
      { kind: "success", catalog: catalog(1) },
      { type: "skill-catalog-reset" },
    )).toEqual({ kind: "idle" });
  });

  it("moves idle to loading on first load", () => {
    const state = reduceSkillCatalogState(createInitialSkillCatalogState(), {
      type: "skill-catalog-load-started",
    });
    expect(state).toEqual({ kind: "loading" });
  });

  it("moves loading to success when items arrive", () => {
    const loaded = catalog(2);
    const state = reduceSkillCatalogState({ kind: "loading" }, {
      type: "skill-catalog-load-succeeded",
      catalog: loaded,
    });
    expect(state).toEqual({ kind: "success", catalog: loaded });
  });

  it("moves loading to empty when the catalog has no items", () => {
    const state = reduceSkillCatalogState({ kind: "loading" }, {
      type: "skill-catalog-load-succeeded",
      catalog: catalog(0),
    });
    expect(state).toEqual({
      kind: "empty",
      generatedAt: "2026-11-07T00:00:00.000Z",
    });
  });

  it("moves loading to error without previous data", () => {
    const error = failure();
    const state = reduceSkillCatalogState({ kind: "loading" }, {
      type: "skill-catalog-load-failed",
      error,
    });
    expect(state).toEqual({ kind: "error", error });
  });

  it("keeps previous results non-blocking when a refresh starts", () => {
    const loaded = catalog(2);
    const state = reduceSkillCatalogState({ kind: "success", catalog: loaded }, {
      type: "skill-catalog-load-started",
    });
    expect(state).toEqual({ kind: "refreshing", catalog: loaded });
  });

  it("replaces refreshing results when refresh succeeds", () => {
    const previous = catalog(1);
    const next = catalog(3);
    const state = reduceSkillCatalogState({ kind: "refreshing", catalog: previous }, {
      type: "skill-catalog-load-succeeded",
      catalog: next,
    });
    expect(state).toEqual({ kind: "success", catalog: next });
  });

  it("keeps previous results when a refresh fails", () => {
    const previous = catalog(2);
    const error = failure();
    const state = reduceSkillCatalogState({ kind: "refreshing", catalog: previous }, {
      type: "skill-catalog-load-failed",
      error,
    });
    expect(state).toEqual({ kind: "error", error, catalog: previous });
  });

  it("retries from a data-less error as a fresh load", () => {
    const state = reduceSkillCatalogState({ kind: "error", error: failure() }, {
      type: "skill-catalog-load-started",
    });
    expect(state).toEqual({ kind: "loading" });
  });

  it("retries from an error that kept data as a refresh", () => {
    const previous = catalog(1);
    const state = reduceSkillCatalogState(
      { kind: "error", error: failure(), catalog: previous },
      { type: "skill-catalog-load-started" },
    );
    expect(state).toEqual({ kind: "refreshing", catalog: previous });
  });

  it("reloads from empty as a fresh load", () => {
    const state = reduceSkillCatalogState(
      { kind: "empty", generatedAt: "2026-11-07T00:00:00.000Z" },
      { type: "skill-catalog-load-started" },
    );
    expect(state).toEqual({ kind: "loading" });
  });

  it("ignores a duplicate load start while already refreshing", () => {
    const loaded = catalog(1);
    const state = reduceSkillCatalogState({ kind: "refreshing", catalog: loaded }, {
      type: "skill-catalog-load-started",
    });
    expect(state).toEqual({ kind: "refreshing", catalog: loaded });
  });
});
