import { z, type ZodType } from "zod";

import {
  AcceptedConversationTurnSchema,
  CancelledConversationTurnSchema,
  ConversationEventPageSchema,
  ConversationListSchema,
  ConversationMessagePageSchema,
  ConversationMetadataSchema,
  ConversationSequenceSchema,
  ConversationSnapshotSchema,
  CreateConversationRequestSchema,
  CreatedConversationSchema,
  DailySessionErrorEnvelopeSchema,
  RenameConversationRequestSchema,
  RenamedConversationSchema,
  SubmitConversationTurnRequestSchema,
  type AcceptedConversationTurn,
  type CancelledConversationTurn,
  type ConversationEventPage,
  type ConversationList,
  type ConversationMessagePage,
  type ConversationMetadata,
  type ConversationSnapshot,
  type ConversationPublicEvent,
  type ConversationSequence,
  type CreatedConversation,
  type SubmitConversationTurnRequest,
} from "./daily-session-contract";
import {
  ConversationSseError,
  parseConversationSse,
} from "./conversation-sse";

export interface DailySessionClientOptions {
  apiBaseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface ListConversationsInput {
  limit?: number;
  cursor?: string;
}

export interface CreateConversationInput {
  clientRequestId: string;
  title?: string;
}

export interface RenameConversationInput {
  title: string;
  expectedVersion: number;
}

export type SubmitTurnInput = SubmitConversationTurnRequest;

export interface ListEventsInput {
  afterSeq: ConversationSequence;
  limit?: number;
}

export interface StreamEventsInput {
  afterSeq?: ConversationSequence;
  lastEventId?: string;
}

export interface DailySessionClient {
  listConversations(
    input?: ListConversationsInput,
    signal?: AbortSignal,
  ): Promise<ConversationList>;
  createConversation(
    input: CreateConversationInput,
    signal?: AbortSignal,
  ): Promise<CreatedConversation>;
  loadSnapshot(
    conversationId: string,
    signal?: AbortSignal,
  ): Promise<ConversationSnapshot>;
  loadMessages(
    conversationId: string,
    cursor: string,
    signal?: AbortSignal,
  ): Promise<ConversationMessagePage>;
  renameConversation(
    conversationId: string,
    input: RenameConversationInput,
    signal?: AbortSignal,
  ): Promise<ConversationMetadata>;
  submitTurn(
    conversationId: string,
    input: SubmitTurnInput,
    signal?: AbortSignal,
  ): Promise<AcceptedConversationTurn>;
  listEvents(
    conversationId: string,
    input: ListEventsInput,
    signal?: AbortSignal,
  ): Promise<ConversationEventPage>;
  streamEvents(
    conversationId: string,
    input: StreamEventsInput,
    signal?: AbortSignal,
  ): AsyncIterable<ConversationPublicEvent>;
  cancelTurn(
    conversationId: string,
    turnId: string,
    signal?: AbortSignal,
  ): Promise<CancelledConversationTurn>;
}

export class DailySessionClientError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(input: {
    message: string;
    code: string;
    status?: number;
    requestId?: string;
  }) {
    super(input.message);
    this.name = "DailySessionClientError";
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
  }
}

const conversationIdSchema = z.string().uuid();
const pageLimitSchema = z.number().int().min(1).max(100);
const eventPageLimitSchema = z.number().int().min(1).max(200);

export function createDailySessionClient(
  options: DailySessionClientOptions = {},
): DailySessionClient {
  const apiBaseUrl = normalizeSameOriginBase(
    options.apiBaseUrl ?? "/agent-api",
  );
  const fetchFn = options.fetchFn ?? fetch;

  async function request<T>(
    path: string,
    schema: ZodType<T>,
    init: RequestInit,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(`${apiBaseUrl}${path}`, {
        ...init,
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json; charset=utf-8" } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new DailySessionClientError({
        code: "NETWORK_ERROR",
        message: "网络请求失败，请稍后重试",
      });
    }

    const payload = await readUnknownJson(response);
    if (!response.ok) throw mapHttpError(response.status, payload);

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new DailySessionClientError({
        status: response.status,
        code: "INVALID_RESPONSE",
        message: "服务响应格式错误，请稍后重试",
      });
    }
    return parsed.data;
  }

  return {
    async listConversations(input = {}, signal) {
      const limit = pageLimitSchema.parse(input.limit ?? 100);
      const search = new URLSearchParams({
        limit: String(limit),
        archived: "exclude",
        scenarioId: "daily",
        agentKey: "agent-loop",
      });
      if (input.cursor !== undefined) search.set("cursor", input.cursor);
      return request(
        `/conversations?${search.toString()}`,
        ConversationListSchema,
        { method: "GET", signal },
      );
    },

    async createConversation(input, signal) {
      const body = CreateConversationRequestSchema.parse({
        ...input,
        scenarioId: "daily",
        agentKey: "agent-loop",
      });
      return request("/conversations/", CreatedConversationSchema, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },

    async loadSnapshot(conversationId, signal) {
      const id = conversationIdSchema.parse(conversationId);
      return request(
        `/conversations/${encodeURIComponent(id)}/snapshot?limit=100`,
        ConversationSnapshotSchema,
        { method: "GET", signal },
      );
    },

    async loadMessages(conversationId, cursor, signal) {
      const id = conversationIdSchema.parse(conversationId);
      const search = new URLSearchParams({ limit: "100", cursor });
      return request(
        `/conversations/${encodeURIComponent(id)}/messages?${search.toString()}`,
        ConversationMessagePageSchema,
        { method: "GET", signal },
      );
    },

    async renameConversation(conversationId, input, signal) {
      const id = conversationIdSchema.parse(conversationId);
      const body = RenameConversationRequestSchema.parse(input);
      const result = await request(
        `/conversations/${encodeURIComponent(id)}`,
        RenamedConversationSchema,
        { method: "PATCH", body: JSON.stringify(body), signal },
      );
      return ConversationMetadataSchema.parse(result.conversation);
    },

    async submitTurn(conversationId, input, signal) {
      const id = conversationIdSchema.parse(conversationId);
      const body = SubmitConversationTurnRequestSchema.parse(input);
      return request(
        `/conversations/${encodeURIComponent(id)}/turns`,
        AcceptedConversationTurnSchema,
        { method: "POST", body: JSON.stringify(body), signal },
      );
    },

    async listEvents(conversationId, input, signal) {
      const id = conversationIdSchema.parse(conversationId);
      const afterSeq = ConversationSequenceSchema.parse(input.afterSeq);
      const limit = eventPageLimitSchema.parse(input.limit ?? 200);
      const search = new URLSearchParams({
        afterSeq,
        limit: String(limit),
      });
      return request(
        `/conversations/${encodeURIComponent(id)}/events?${search.toString()}`,
        ConversationEventPageSchema,
        { method: "GET", signal },
      );
    },

    async *streamEvents(conversationId, input, signal) {
      const id = conversationIdSchema.parse(conversationId);
      const search = new URLSearchParams();
      if (input.afterSeq !== undefined) {
        search.set(
          "afterSeq",
          ConversationSequenceSchema.parse(input.afterSeq),
        );
      }
      const lastEventId = parseLastEventId(input.lastEventId, id);
      const query = search.size > 0 ? `?${search.toString()}` : "";

      let response: Response;
      try {
        response = await fetchFn(
          `${apiBaseUrl}/conversations/${encodeURIComponent(id)}/events/stream${query}`,
          {
            method: "GET",
            credentials: "same-origin",
            headers: {
              accept: "text/event-stream",
              ...(lastEventId ? { "last-event-id": lastEventId } : {}),
            },
            signal,
          },
        );
      } catch (error) {
        if (isAbortError(error)) throw error;
        throw streamDisconnected();
      }

      if (!response.ok) {
        throw mapHttpError(response.status, await readUnknownJson(response));
      }
      if (!response.headers.get("content-type")?.includes("text/event-stream")) {
        throw new DailySessionClientError({
          status: response.status,
          code: "INVALID_RESPONSE",
          message: "服务响应格式错误，请稍后重试",
        });
      }

      try {
        for await (const event of parseConversationSse(response, id, signal)) {
          yield event;
        }
      } catch (error) {
        if (isAbortError(error) || error instanceof DailySessionClientError) {
          throw error;
        }
        if (error instanceof ConversationSseError) {
          throw new DailySessionClientError({
            code: error.code,
            message: error.message,
          });
        }
        throw streamDisconnected();
      }

      if (!signal?.aborted) throw streamDisconnected();
    },

    async cancelTurn(conversationId, turnId, signal) {
      const id = conversationIdSchema.parse(conversationId);
      const canonicalTurnId = conversationIdSchema.parse(turnId);
      return request(
        `/conversations/${encodeURIComponent(id)}/turns/${encodeURIComponent(canonicalTurnId)}/cancel`,
        CancelledConversationTurnSchema,
        { method: "POST", signal },
      );
    },
  };
}

function parseLastEventId(
  raw: string | undefined,
  conversationId: string,
): string | undefined {
  if (raw === undefined) return undefined;
  const prefix = `${conversationId}:`;
  if (!raw.startsWith(prefix)) {
    throw new Error("Last-Event-ID 必须属于当前会话");
  }
  ConversationSequenceSchema.parse(raw.slice(prefix.length));
  return raw;
}

function streamDisconnected(): DailySessionClientError {
  return new DailySessionClientError({
    code: "STREAM_DISCONNECTED",
    message: "会话事件流已断开，请重新连接",
  });
}

function normalizeSameOriginBase(raw: string): string {
  const unsafe =
    raw !== raw.trim() ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    /[\\?#\u0000-\u001f\u007f]/.test(raw);
  const parsed = unsafe ? null : new URL(raw, "https://agent-hub.local");
  if (
    !parsed ||
    parsed.origin !== "https://agent-hub.local" ||
    parsed.pathname !== raw
  ) {
    throw new Error("API 地址必须是同源路径");
  }
  return raw.replace(/\/+$/, "");
}

async function readUnknownJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    if (!response.ok) return undefined;
    throw new DailySessionClientError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "服务响应格式错误，请稍后重试",
    });
  }
}

function mapHttpError(status: number, payload: unknown): DailySessionClientError {
  const envelope = DailySessionErrorEnvelopeSchema.safeParse(payload);
  const fallback = statusError(status);
  if (!envelope.success) {
    return new DailySessionClientError({
      status,
      code: fallback.code,
      message: fallback.message,
    });
  }
  const { code, requestId } = envelope.data.error;
  return new DailySessionClientError({
    status,
    requestId,
    code,
    message: backendErrorMessage(code) ?? fallback.message,
  });
}

function backendErrorMessage(code: string): string | undefined {
  switch (code) {
    case "TURN_IN_PROGRESS":
      return "当前会话已有任务运行中";
    case "IDEMPOTENCY_CONFLICT":
      return "请求标识冲突，请重新发起请求";
    case "RESYNC_REQUIRED":
      return "事件记录已过期，请重新同步会话";
    case "CONVERSATION_EXECUTION_DISABLED":
      return "当前会话暂不可执行";
    default:
      return undefined;
  }
}

function statusError(status: number): { code: string; message: string } {
  switch (status) {
    case 400:
      return { code: "INVALID_REQUEST", message: "请求无效，请检查输入" };
    case 401:
      return { code: "AUTH_REQUIRED", message: "登录状态已失效，请重新登录" };
    case 403:
      return {
        code: "ORIGIN_REJECTED",
        message: "请求来源校验失败，请联系管理员检查部署配置",
      };
    case 404:
      return { code: "NOT_FOUND", message: "会话不存在或无权访问" };
    case 409:
      return { code: "CONFLICT", message: "会话已被更新，请刷新后重试" };
    case 503:
      return {
        code: "STORAGE_UNAVAILABLE",
        message: "服务暂不可用，请稍后重试",
      };
    default:
      return { code: "REQUEST_FAILED", message: "请求失败，请稍后重试" };
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
