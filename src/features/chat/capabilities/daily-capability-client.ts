import { ConversationCapabilityCatalogSchema } from "./contracts";
import { createDailySessionJsonRequester, DailySessionClientError, type DailySessionClientOptions } from "../transports/daily-session-client";

export function createDailyCapabilityClient(options: DailySessionClientOptions = {}) {
  const request = createDailySessionJsonRequester(options);
  return {
    async getCatalog(signal?: AbortSignal) {
      try {
        return await request("/api/conversation-capabilities?scenarioId=daily", ConversationCapabilityCatalogSchema,
          { method: "GET", signal });
      } catch (error) {
        if (error instanceof DailySessionClientError && error.status === 403) {
          throw new DailySessionClientError({ status: 403, code: "FORBIDDEN", message: "暂无权限访问能力目录" });
        }
        throw error;
      }
    },
  };
}
