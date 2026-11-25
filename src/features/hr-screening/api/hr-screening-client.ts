import * as z from "zod";

import { readPublicRuntimeConfig } from "@/config/env";
import {
  HrConversationStateSchema,
  HrCriterionSchema,
  HrScreeningBatchItemSchema,
  HrScreeningBatchSchema,
  HrScreeningSummarySchema,
  type HrScreeningSummary,
  type HrConversationState,
  type HrCriterion,
  type HrScreeningBatch,
  type HrScreeningBatchItem,
} from "@/features/assistants/contracts/generated";

const errorSchema = z.looseObject({
  error: z.looseObject({ code: z.string(), message: z.string() }),
});
const stateResponse = z.strictObject({ state: HrConversationStateSchema });
const batchResponse = z.looseObject({
  batch: HrScreeningBatchSchema,
  items: z.array(HrScreeningBatchItemSchema),
  reused: z.boolean().optional(),
});

export class HrScreeningClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HrScreeningClientError";
  }
}

export function isHrScreeningClientError(error: unknown): error is HrScreeningClientError {
  return error instanceof HrScreeningClientError;
}

export interface HrScreeningClient {
  getState(conversationId: string, signal?: AbortSignal): Promise<HrConversationState>;
  getSummary(conversationId: string, input: { scope: HrScreeningSummary["scope"]; groupId?: string; tier?: NonNullable<HrScreeningSummary["rows"][number]["advisoryTier"]>; offset: number; limit: number },
    signal?: AbortSignal): Promise<HrScreeningSummary>;
  attachResumes(conversationId: string, draftId: string, clientRequestId: string, signal?: AbortSignal,
    options?: { deduplicate: boolean }): Promise<HrConversationState>;
  replaceJobDescription(
    conversationId: string,
    input: { kind: "text"; text: string; clientRequestId: string } | { kind: "file"; draftId: string; clientRequestId: string },
    signal?: AbortSignal,
  ): Promise<HrConversationState>;
  updateCandidate(
    conversationId: string,
    candidateId: string,
    input: { action: "rename"; displayName: string; clientRequestId: string } | { action: "retire" | "reactivate"; clientRequestId: string },
    signal?: AbortSignal,
  ): Promise<HrConversationState>;
  generateCriteria(conversationId: string, clientRequestId: string, signal?: AbortSignal): Promise<HrConversationState>;
  updateCriteria(conversationId: string, version: number, criteria: HrCriterion[], clientRequestId: string, signal?: AbortSignal): Promise<HrConversationState>;
  confirmCriteria(conversationId: string, version: number, clientRequestId: string, signal?: AbortSignal): Promise<HrConversationState>;
  startBatch(conversationId: string, clientRequestId: string, signal?: AbortSignal): Promise<{ batch: HrScreeningBatch; items: HrScreeningBatchItem[]; reused?: boolean }>;
  getBatch(batchId: string, signal?: AbortSignal): Promise<{ batch: HrScreeningBatch; items: HrScreeningBatchItem[] }>;
  cancelBatch(batchId: string, clientRequestId: string, signal?: AbortSignal): Promise<{ batch: HrScreeningBatch; items: HrScreeningBatchItem[] }>;
  continueBatch(batchId: string, clientRequestId: string, signal?: AbortSignal): Promise<{ batch: HrScreeningBatch; items: HrScreeningBatchItem[] }>;
  retryItem(batchId: string, itemId: string, clientRequestId: string, signal?: AbortSignal): Promise<{ batch: HrScreeningBatch; items: HrScreeningBatchItem[] }>;
  exportBatchCsv(batchId: string, signal?: AbortSignal): Promise<{ fileName: string; content: string }>;
}

export function createHrScreeningClient(options: {
  baseUrl?: string;
  fetcher?: typeof fetch;
} = {}): HrScreeningClient {
  const baseUrl = (options.baseUrl ?? readPublicRuntimeConfig().apiBaseUrl).replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;

  async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      credentials: "same-origin",
      signal,
    });
    if (response.ok) return response;
    let code = "HR_REQUEST_FAILED";
    let message = response.status === 403 ? "权限不足" : "筛选服务暂时不可用";
    try {
      const parsed = errorSchema.parse(await response.json());
      code = parsed.error.code;
      message = parsed.error.message;
    } catch {
      // Ignore proxy/HTML bodies; upstream content is never rendered directly.
    }
    throw new HrScreeningClientError(response.status, code, message);
  }

  async function json<T>(path: string, init: RequestInit, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    const response = await request(path, init, signal);
    return schema.parse(await response.json());
  }

  const post = (body: unknown, signal?: AbortSignal) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }) satisfies RequestInit;

  return {
    async getState(conversationId, signal) {
      const body = await json(`/api/hr/conversations/${encodeURIComponent(conversationId)}/state`,
        { method: "GET" }, stateResponse, signal);
      return body.state;
    },
    getSummary(conversationId, input, signal) {
      const params = new URLSearchParams({ scope: input.scope, offset: String(input.offset), limit: String(input.limit) });
      if (input.groupId) params.set("groupId", input.groupId);
      if (input.tier) params.set("tier", input.tier);
      return json(`/api/hr/conversations/${encodeURIComponent(conversationId)}/screening-summary?${params}`,
        { method: "GET" }, HrScreeningSummarySchema, signal);
    },
    async attachResumes(conversationId, draftId, clientRequestId, signal, options) {
      const body = await json(`/api/hr/conversations/${encodeURIComponent(conversationId)}/attachments`,
        post({ draftId, clientRequestId, ...options }, signal), stateResponse, signal);
      return body.state;
    },
    async replaceJobDescription(conversationId, input, signal) {
      const body = await json(`/api/hr/conversations/${encodeURIComponent(conversationId)}/job-description`,
        post(input, signal), stateResponse, signal);
      return body.state;
    },
    async updateCandidate(conversationId, candidateId, input, signal) {
      const body = await json(`/api/hr/conversations/${encodeURIComponent(conversationId)}/candidates/${encodeURIComponent(candidateId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }, stateResponse, signal);
      return body.state;
    },
    async generateCriteria(conversationId, clientRequestId, signal) {
      const body = await json(`/api/hr/conversations/${encodeURIComponent(conversationId)}/criteria/generate`,
        post({ clientRequestId }, signal), stateResponse, signal);
      return body.state;
    },
    async updateCriteria(conversationId, version, criteria, clientRequestId, signal) {
      const body = await json(`/api/hr/conversations/${encodeURIComponent(conversationId)}/criteria/${version}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: z.array(HrCriterionSchema).parse(criteria), clientRequestId }),
      }, stateResponse, signal);
      return body.state;
    },
    async confirmCriteria(conversationId, version, clientRequestId, signal) {
      const body = await json(`/api/hr/conversations/${encodeURIComponent(conversationId)}/criteria/${version}/confirm`,
        post({ clientRequestId }, signal), stateResponse, signal);
      return body.state;
    },
    startBatch(conversationId, clientRequestId, signal) {
      return json(`/api/hr/conversations/${encodeURIComponent(conversationId)}/screening-batches`,
        post({ clientRequestId }, signal), batchResponse, signal);
    },
    getBatch(batchId, signal) {
      return json(`/api/hr/screening-batches/${encodeURIComponent(batchId)}`, { method: "GET" }, batchResponse, signal);
    },
    cancelBatch(batchId, clientRequestId, signal) {
      return json(`/api/hr/screening-batches/${encodeURIComponent(batchId)}/cancel`,
        post({ clientRequestId }, signal), batchResponse, signal);
    },
    continueBatch(batchId, clientRequestId, signal) {
      return json(`/api/hr/screening-batches/${encodeURIComponent(batchId)}/continue`,
        post({ clientRequestId }, signal), batchResponse, signal);
    },
    retryItem(batchId, itemId, clientRequestId, signal) {
      return json(`/api/hr/screening-batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(itemId)}/retry`,
        post({ clientRequestId }, signal), batchResponse, signal);
    },
    async exportBatchCsv(batchId, signal) {
      const response = await request(`/api/hr/screening-batches/${encodeURIComponent(batchId)}/export.csv`,
        { method: "GET" }, signal);
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([A-Za-z0-9._-]+\.csv)"/.exec(disposition);
      return {
        fileName: match?.[1] ?? "resume-screening.csv",
        content: await response.text(),
      };
    },
  };
}
