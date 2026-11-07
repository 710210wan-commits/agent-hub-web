import type * as z from "zod";

import {
  skillMarketOperationSchemas,
  type SkillMarketOperationId,
} from "../contracts/generated";
import {
  SkillMarketError,
  decodeSkillMarketError,
  type SkillMarketErrorArea,
} from "../contracts/error";
import type {
  SkillMarketOperationResponse,
  SkillMarketViewModelAdapter,
} from "../contracts/view-models";

export type SkillMarketMode = "daily" | "work";

export interface SkillMarketClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface SkillMarketRequestInput<TOperation extends SkillMarketOperationId> {
  body?: unknown;
  mode: SkillMarketMode;
  operation: TOperation;
  pathParameters?: unknown;
  queryParameters?: unknown;
  signal?: AbortSignal;
}

export type SkillMarketMutationResult<TViewModel> =
  | { ok: true; value: TViewModel }
  | { ok: false; error: SkillMarketError };

export interface SkillMarketDownloadViewModel {
  blob: Blob;
  fileName: string;
  sha256: string;
}

interface RuntimeOperation {
  method: string;
  path: string;
  pathParameters?: z.ZodType;
  queryParameters?: z.ZodType;
  request?: z.ZodType;
  response: z.ZodType;
}

interface ActiveResponse {
  cleanup: () => void;
  response: Response;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class SkillMarketClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: SkillMarketClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async query<TOperation extends SkillMarketOperationId, TViewModel>(
    input: SkillMarketRequestInput<TOperation>,
    adapter: SkillMarketViewModelAdapter<TOperation, TViewModel>,
  ): Promise<TViewModel> {
    const operation = runtimeOperation(input.operation);
    if (operation.method !== "GET") throw requestError("Query operations must use GET.");
    return this.requestViewModel(input, adapter, operation);
  }

  async mutate<TOperation extends SkillMarketOperationId, TViewModel>(
    input: SkillMarketRequestInput<TOperation>,
    adapter: SkillMarketViewModelAdapter<TOperation, TViewModel>,
  ): Promise<SkillMarketMutationResult<TViewModel>> {
    try {
      const operation = runtimeOperation(input.operation);
      if (operation.method === "GET") throw requestError("Mutation operations must not use GET.");
      return { ok: true, value: await this.requestViewModel(input, adapter, operation) };
    } catch (error) {
      return { ok: false, error: normalizeClientError(error, operationArea(input.operation)) };
    }
  }

  async downloadPublication(input: {
    id: string;
    mode: SkillMarketMode;
    signal?: AbortSignal;
  }): Promise<SkillMarketDownloadViewModel> {
    const request = {
      mode: input.mode,
      operation: "downloadPublication" as const,
      pathParameters: { id: input.id },
      signal: input.signal,
    };
    const operation = runtimeOperation(request.operation);
    const active = await this.fetchResponse(request, operation);
    try {
      const contentType = active.response.headers.get("content-type")?.split(";", 1)[0]?.trim();
      const sha256 = active.response.headers.get("x-content-sha256")?.trim() ?? "";
      const fileName = downloadFileName(active.response.headers.get("content-disposition"));
      if (contentType !== "application/zip" || !/^[a-f0-9]{64}$/.test(sha256) || !fileName) {
        throw responseError(operationArea(request.operation), active.response.status);
      }
      return { blob: await active.response.blob(), fileName, sha256 };
    } finally {
      active.cleanup();
    }
  }

  private async requestViewModel<TOperation extends SkillMarketOperationId, TViewModel>(
    input: SkillMarketRequestInput<TOperation>,
    adapter: SkillMarketViewModelAdapter<TOperation, TViewModel>,
    operation: RuntimeOperation,
  ): Promise<TViewModel> {
    if (adapter.operation !== input.operation) throw requestError("ViewModel adapter does not match the operation.");
    const active = await this.fetchResponse(input, operation);
    try {
      const payload = active.response.status === 204 ? undefined : await readJson(active.response);
      const parsed = operation.response.safeParse(payload);
      if (!parsed.success) throw responseError(operationArea(input.operation), active.response.status);
      return adapter.toViewModel(parsed.data as SkillMarketOperationResponse<TOperation>);
    } finally {
      active.cleanup();
    }
  }

  private async fetchResponse<TOperation extends SkillMarketOperationId>(
    input: SkillMarketRequestInput<TOperation>,
    operation: RuntimeOperation,
  ): Promise<ActiveResponse> {
    assertDaily(input.mode);
    if (input.signal?.aborted) throw cancellationError(operationArea(input.operation));
    const pathParameters = parseOptionalInput(operation.pathParameters, input.pathParameters, "path parameters");
    const queryParameters = parseOptionalInput(operation.queryParameters, input.queryParameters, "query parameters");
    const body = parseOptionalInput(operation.request, input.body, "request body");
    const url = requestUrl(operation.path, pathParameters, queryParameters);
    const controller = new AbortController();
    let abortKind: "caller" | "timeout" | undefined;
    const cancel = () => {
      abortKind = "caller";
      controller.abort(new DOMException("Skill Market request cancelled", "AbortError"));
    };
    input.signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(() => {
      abortKind = "timeout";
      controller.abort(new DOMException("Skill Market client timeout", "TimeoutError"));
    }, this.timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", cancel);
    };

    try {
      const response = await this.fetchImpl(url, {
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        method: operation.method,
        signal: controller.signal,
      });
      if (!response.ok) {
        const decoded = await decodeSkillMarketError(response, { area: operationArea(input.operation) });
        cleanup();
        throw decoded;
      }
      return { cleanup, response };
    } catch (error) {
      cleanup();
      if (error instanceof SkillMarketError) throw error;
      if (abortKind === "caller") throw cancellationError(operationArea(input.operation));
      if (abortKind === "timeout") throw timeoutError(operationArea(input.operation));
      throw unavailableError(operationArea(input.operation));
    }
  }
}

export function skillMarketQueryKey(
  mode: SkillMarketMode,
  resourceType: string,
  resourceId?: string,
): readonly ["skill-market", SkillMarketMode, string, string] {
  return ["skill-market", mode, resourceType, resourceId ?? "list"];
}

function runtimeOperation(operation: SkillMarketOperationId): RuntimeOperation {
  return skillMarketOperationSchemas[operation];
}

function parseOptionalInput(
  schema: z.ZodType | undefined,
  value: unknown,
  label: string,
): unknown {
  if (!schema) {
    if (value !== undefined) throw requestError(`Unexpected ${label}.`);
    return undefined;
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw requestError(`Invalid ${label}.`);
  return parsed.data;
}

function requestUrl(pathTemplate: string, pathInput: unknown, queryInput: unknown): string {
  const pathValues = isRecord(pathInput) ? pathInput : {};
  const path = pathTemplate.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, name: string) => {
    const value = pathValues[name];
    if (typeof value !== "string" || !value) throw requestError(`Missing path parameter: ${name}.`);
    return encodeURIComponent(value);
  });
  const query = new URLSearchParams({ mode: "daily" });
  if (isRecord(queryInput)) {
    for (const [name, value] of Object.entries(queryInput)) appendQueryValue(query, name, value);
  }
  return `${path}?${query.toString()}`;
}

function appendQueryValue(query: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item) => appendQueryValue(query, name, item));
    return;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    query.append(name, String(value));
    return;
  }
  throw requestError(`Invalid query parameter: ${name}.`);
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function downloadFileName(contentDisposition: string | null): string | undefined {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
  const candidate = match?.[1]?.trim().split(/[\\/]/).pop();
  return candidate?.toLowerCase().endsWith(".zip") ? candidate : undefined;
}

function assertDaily(mode: SkillMarketMode): asserts mode is "daily" {
  if (mode !== "daily") {
    throw new SkillMarketError({
      code: "SKILL_MARKET_MODE_UNAVAILABLE",
      presentation: "conflict",
      recovery: "back",
      retryable: false,
      status: 409,
      userMessage: "办公场景暂未接入 Skill Market。",
    });
  }
}

function requestError(message: string): SkillMarketError {
  return new SkillMarketError({
    code: "SKILL_MARKET_REQUEST_INVALID",
    presentation: "validation",
    recovery: "edit",
    retryable: false,
    status: 422,
    userMessage: message,
  });
}

function responseError(area: SkillMarketErrorArea, status: number): SkillMarketError {
  return new SkillMarketError({
    area,
    code: "SKILL_MARKET_RESPONSE_INVALID",
    presentation: "unknown",
    recovery: "retry",
    retryable: true,
    status: status >= 400 ? status : 502,
    userMessage: "Skill Market 返回了无法识别的数据。",
  });
}

function timeoutError(area: SkillMarketErrorArea): SkillMarketError {
  return new SkillMarketError({
    area,
    code: "SKILL_MARKET_CLIENT_TIMEOUT",
    presentation: "timeout",
    recovery: "retry",
    retryable: true,
    status: 504,
    userMessage: "服务响应超时，请重试。",
  });
}

function cancellationError(area: SkillMarketErrorArea): SkillMarketError {
  return new SkillMarketError({
    area,
    code: "SKILL_MARKET_CLIENT_CANCELLED",
    presentation: "unknown",
    recovery: "back",
    retryable: false,
    status: 499,
    userMessage: "请求已取消。",
  });
}

function unavailableError(area: SkillMarketErrorArea): SkillMarketError {
  return new SkillMarketError({
    area,
    code: "SKILL_MARKET_UPSTREAM_UNAVAILABLE",
    presentation: "unavailable",
    recovery: "retry",
    retryable: true,
    status: 502,
    userMessage: "Skill Market 服务暂不可用，请稍后重试。",
  });
}

function normalizeClientError(error: unknown, area: SkillMarketErrorArea): SkillMarketError {
  if (error instanceof SkillMarketError) return error;
  return unavailableError(area);
}

function operationArea(operation: SkillMarketOperationId): SkillMarketErrorArea {
  if (/Requirement|ToolResolution|Smoke|SkillBundle|CreatorTools/.test(operation)) return "creator";
  if (/Draft/.test(operation)) return "draft";
  if (/Submission|Trigger/.test(operation)) return "review";
  if (/Publication|Installation/.test(operation)) return "publication";
  return "general";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
