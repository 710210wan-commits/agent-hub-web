import { useCallback, useEffect, useState } from "react";

import type { SkillMarketClient } from "../api/client";
import { skillCatalogViewModelAdapter } from "../contracts/catalog-view-model";
import { SkillMarketError } from "../contracts/error";
import { publicationSummariesAdapter, toPublicationViewModels, type PublicationViewModel } from "./publication-view-model";

type PublicationState =
  | { kind: "loading" }
  | { kind: "success"; publications: PublicationViewModel[] }
  | { kind: "error"; error: SkillMarketError };

export function usePublications(client: SkillMarketClient) {
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<PublicationState>({ kind: "loading" });
  const refresh = useCallback(() => {
    setState({ kind: "loading" });
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      client.query({ mode: "daily", operation: "listPublications", signal: controller.signal }, publicationSummariesAdapter),
      client.query({ mode: "daily", operation: "getSkillCatalog", queryParameters: {}, signal: controller.signal }, skillCatalogViewModelAdapter),
    ]).then(([publications, catalog]) => {
      setState({ kind: "success", publications: toPublicationViewModels(publications, catalog) });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ kind: "error", error: toPublicationError(error) });
    });
    return () => controller.abort();
  }, [client, generation]);

  return { refresh, state };
}

export function toPublicationError(error: unknown): SkillMarketError {
  if (error instanceof SkillMarketError) return error;
  return new SkillMarketError({
    area: "publication", code: "SKILL_MARKET_UPSTREAM_UNAVAILABLE", presentation: "unavailable",
    recovery: "retry", retryable: true, status: 502,
    userMessage: "Skill Market 发布管理服务暂不可用，请稍后重试。",
  });
}
