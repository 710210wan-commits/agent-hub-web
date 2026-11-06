export interface SkillMarketAuditRecord {
  durationMs: number;
  method: "DELETE" | "GET" | "POST" | "PUT" | "UNSUPPORTED";
  path: string;
  requestId?: string;
  status: number;
}

export type SkillMarketAuditSink = (record: SkillMarketAuditRecord) => void;

const SAFE_METHODS = new Set(["DELETE", "GET", "POST", "PUT"]);
const SAFE_PATH = /^\/api\/skill-market(?:\/[A-Za-z0-9._~-]+)+$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function createSkillMarketAuditRecord(input: {
  durationMs: number;
  method: string;
  path: string;
  requestId?: string | null;
  status: number;
}): SkillMarketAuditRecord {
  const method = input.method.toUpperCase();
  const requestId = safeSkillMarketRequestId(input.requestId);
  return {
    durationMs: Number.isFinite(input.durationMs)
      ? Math.max(0, Math.round(input.durationMs))
      : 0,
    method: SAFE_METHODS.has(method)
      ? method as SkillMarketAuditRecord["method"]
      : "UNSUPPORTED",
    path: SAFE_PATH.test(input.path) ? input.path : "/api/skill-market",
    ...(requestId ? { requestId } : {}),
    status: Number.isInteger(input.status) && input.status >= 100 && input.status <= 599
      ? input.status
      : 500,
  };
}

export function safeSkillMarketRequestId(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && SAFE_REQUEST_ID.test(normalized) ? normalized : undefined;
}

export function logSkillMarketAudit(record: SkillMarketAuditRecord): void {
  console.info("skill-market.gateway", record);
}
