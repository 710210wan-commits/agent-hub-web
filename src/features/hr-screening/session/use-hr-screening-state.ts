"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isHrScreeningClientError, type HrScreeningClient } from "../api/hr-screening-client";
import type { HrConversationState } from "@/features/assistants/contracts/generated";

export function useHrScreeningState({
  client,
  conversationId,
  refreshToken,
  onAuthRequired,
}: {
  client: HrScreeningClient;
  conversationId: string;
  refreshToken: number;
  onAuthRequired?(): void;
}) {
  const [state, setState] = useState<HrConversationState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unavailable">("loading");
  const [manualRefresh, setManualRefresh] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    const abort = new AbortController();
    const current = ++sequence.current;
    void client.getState(conversationId, abort.signal).then(next => {
      if (abort.signal.aborted || current !== sequence.current) return;
      setState(next);
      setStatus("ready");
    }).catch((error: unknown) => {
      if (abort.signal.aborted || current !== sequence.current) return;
      const errorStatus = isHrScreeningClientError(error)
        ? error.status
        : (error as { status?: unknown })?.status;
      if (errorStatus === 401) {
        onAuthRequired?.();
        return;
      }
      if (errorStatus === 404) {
        setState(null);
        setStatus("unavailable");
        return;
      }
      setStatus(previous => previous === "ready" ? previous : "error");
    });
    return () => abort.abort();
  }, [client, conversationId, manualRefresh, onAuthRequired, refreshToken]);

  const refresh = useCallback(() => setManualRefresh(value => value + 1), []);
  return { state, status, refresh };
}
