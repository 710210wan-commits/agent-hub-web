"use client";
import { useEffect, useState } from "react";
import { createDailyCapabilityClient } from "./daily-capability-client";
import type { ConversationCapabilityCatalog } from "./contracts";
import { DailySessionClientError } from "../transports/daily-session-client";

export type DailyCapabilityClient = ReturnType<typeof createDailyCapabilityClient>;
export const defaultDailyCapabilityClient = createDailyCapabilityClient();

export function useDailyCapabilities(client: DailyCapabilityClient, generation: number, onAuthRequired: () => void) {
  const [result, setResult] = useState<{ generation: number; catalog?: ConversationCapabilityCatalog; notice?: string }>({ generation });
  useEffect(() => {
    const controller = new AbortController();
    void client.getCatalog(controller.signal).then(catalog => {
      if (!controller.signal.aborted) setResult({ generation, catalog });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof DailySessionClientError && error.status === 401) onAuthRequired();
      else setResult({ generation, notice: error instanceof DailySessionClientError && error.status === 403
        ? "暂无权限访问能力目录" : "能力目录暂不可用" });
    });
    return () => controller.abort();
  }, [client, generation, onAuthRequired]);
  return result.generation === generation ? result : { generation };
}
