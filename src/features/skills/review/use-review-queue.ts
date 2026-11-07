import { useCallback, useEffect, useState } from "react";

import type { SkillMarketClient } from "../api/client";
import { SkillMarketError } from "../contracts/error";
import { reviewQueueAdapter, type ReviewSubmissionViewModel } from "./review-view-model";

type ReviewQueueState =
  | { kind: "loading" }
  | { kind: "success"; submissions: ReviewSubmissionViewModel[] }
  | { kind: "error"; error: SkillMarketError };

export function useReviewQueue(client: SkillMarketClient) {
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<ReviewQueueState>({ kind: "loading" });
  const refresh = useCallback(() => {
    setState({ kind: "loading" });
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    client.query(
      { mode: "daily", operation: "listSubmissions", signal: controller.signal },
      reviewQueueAdapter,
    ).then((submissions) => setState({ kind: "success", submissions }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ kind: "error", error: toReviewError(error) });
      });
    return () => controller.abort();
  }, [client, generation]);

  return { refresh, state };
}

export function toReviewError(error: unknown): SkillMarketError {
  if (error instanceof SkillMarketError) return error;
  return new SkillMarketError({
    area: "review", code: "SKILL_MARKET_UPSTREAM_UNAVAILABLE", presentation: "unavailable",
    recovery: "retry", retryable: true, status: 502,
    userMessage: "Skill Market 审核服务暂不可用，请稍后重试。",
  });
}
