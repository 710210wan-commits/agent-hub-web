import { useCallback, useEffect, useState } from "react";

import type { SkillMarketClient } from "../api/client";
import { skillCatalogViewModelAdapter, type CatalogItemViewModel } from "../contracts/catalog-view-model";
import { SkillMarketError } from "../contracts/error";
import {
  skillDraftSummariesAdapter,
  type SkillDraftSummaryViewModel,
} from "../contracts/skill-mine-view-model";

export interface SkillMineData {
  drafts: SkillDraftSummaryViewModel[];
  enabled: CatalogItemViewModel[];
  available: CatalogItemViewModel[];
}

export type SkillMineState =
  | { kind: "loading" }
  | { kind: "success"; data: SkillMineData }
  | { kind: "error"; error: SkillMarketError };

export function useSkillMine(client: SkillMarketClient) {
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<SkillMineState>({ kind: "loading" });

  const refresh = useCallback(() => {
    setState({ kind: "loading" });
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      client.query(
        { mode: "daily", operation: "getSkillCatalog", queryParameters: {}, signal: controller.signal },
        skillCatalogViewModelAdapter,
      ),
      client.query(
        { mode: "daily", operation: "listDrafts", signal: controller.signal },
        skillDraftSummariesAdapter,
      ),
    ]).then(([catalog, drafts]) => {
      const market = catalog.items.filter((item) => item.source === "market" && !item.conflict);
      setState({
        kind: "success",
        data: {
          drafts,
          enabled: market.filter((item) => item.installState === "enabled"),
          available: market.filter((item) => item.installState === "installable"),
        },
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setState({ kind: "error", error: toSkillMarketError(error) });
    });
    return () => controller.abort();
  }, [client, generation]);

  return { refresh, state };
}

function toSkillMarketError(error: unknown): SkillMarketError {
  if (error instanceof SkillMarketError) return error;
  return new SkillMarketError({
    code: "SKILL_MARKET_UPSTREAM_UNAVAILABLE",
    presentation: "unavailable",
    recovery: "retry",
    retryable: true,
    status: 502,
    userMessage: "Skill Market 服务暂不可用，请稍后重试。",
  });
}
