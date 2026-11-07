import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  type SkillMarketClient,
  type SkillMarketMode,
} from "../api/client";
import { SkillMarketError } from "../contracts/error";
import { skillCatalogViewModelAdapter } from "../contracts/catalog-view-model";
import {
  createInitialSkillCatalogState,
  reduceSkillCatalogState,
  type SkillCatalogPageState,
} from "./catalog-state";

export interface UseSkillCatalogOptions {
  client: SkillMarketClient;
  mode: SkillMarketMode;
}

export interface UseSkillCatalogResult {
  refresh: () => void;
  state: SkillCatalogPageState;
}

export function useSkillCatalog({ client, mode }: UseSkillCatalogOptions): UseSkillCatalogResult {
  const [state, dispatch] = useReducer(
    reduceSkillCatalogState,
    undefined,
    createInitialSkillCatalogState,
  );
  const inFlightRef = useRef(false);
  const generationRef = useRef(0);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  const cancelCurrentLoad = useCallback(() => {
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = undefined;
    inFlightRef.current = false;
  }, []);

  const load = useCallback(() => {
    if (mode !== "daily" || inFlightRef.current) return;
    inFlightRef.current = true;
    const generation = ++generationRef.current;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    dispatch({ type: "skill-catalog-load-started" });
    client
      .query(
        {
          mode: "daily",
          operation: "getSkillCatalog",
          queryParameters: {},
          signal: abortController.signal,
        },
        skillCatalogViewModelAdapter,
      )
      .then((catalog) => {
        if (generationRef.current !== generation) return;
        dispatch({ type: "skill-catalog-load-succeeded", catalog });
      })
      .catch((error: unknown) => {
        if (generationRef.current !== generation) return;
        dispatch({ type: "skill-catalog-load-failed", error: asSkillMarketError(error) });
      })
      .finally(() => {
        if (generationRef.current !== generation) return;
        inFlightRef.current = false;
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = undefined;
        }
      });
  }, [client, mode]);

  useEffect(() => {
    if (mode !== "daily") {
      cancelCurrentLoad();
      dispatch({ type: "skill-catalog-reset" });
      return;
    }
    load();
    return cancelCurrentLoad;
  }, [cancelCurrentLoad, load, mode]);

  const refresh = useCallback(() => {
    load();
  }, [load]);

  return { refresh, state };
}

function asSkillMarketError(error: unknown): SkillMarketError {
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
