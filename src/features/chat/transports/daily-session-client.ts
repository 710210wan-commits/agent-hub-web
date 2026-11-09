import { z, type ZodType } from "zod";

import {
  ConversationListSchema,
  ConversationMessagePageSchema,
  ConversationMetadataSchema,
  ConversationSnapshotSchema,
  CreateConversationRequestSchema,
  CreatedConversationSchema,
  DailySessionAuthStatusSchema,
  DailySessionErrorEnvelopeSchema,
  DailySessionLoginResponseSchema,
  DailySessionLogoutResponseSchema,
  RenameConversationRequestSchema,
  RenamedConversationSchema,
  type ConversationList,
  type ConversationMessagePage,
  type ConversationMetadata,
  type ConversationSnapshot,
  type CreatedConversation,
  type DailySessionAuthStatus,
  type DailySessionUser,
} from "./daily-session-contract";

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

export interface DailySessionClient {
  getAuthStatus(signal?: AbortSignal): Promise<DailySessionAuthStatus>;
  login(
    input: { username: string; password: string },
    signal?: AbortSignal,
  ): Promise<DailySessionUser>;
  logout(signal?: AbortSignal): Promise<void>;
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

  async function getAuthStatus(signal?: AbortSignal) {
    return request(
      "/auth/xiaozhi-status",
      DailySessionAuthStatusSchema,
      { method: "GET", signal },
    );
  }

  return {
    getAuthStatus,

    async login(input, signal) {
      const body = JSON.stringify({
        username: input.username,
        password: input.password,
      });
      const login = await request(
        "/auth/login",
        DailySessionLoginResponseSchema,
        { method: "POST", body, signal },
      );
      if (login.kbUnavailable) {
        await request(
          "/auth/xiaozhi-login",
          DailySessionLoginResponseSchema,
          { method: "POST", body, signal },
        );
      }

      const status = await getAuthStatus(signal);
      if (!status.enabled) {
        throw new DailySessionClientError({
          status: 401,
          code: "AUTH_REQUIRED",
          message: "登录状态未通过验证，请重新登录",
        });
      }
      return status.user;
    },

    async logout(signal) {
      await request(
        "/auth/logout",
        DailySessionLogoutResponseSchema,
        { method: "POST", signal },
      );
    },

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
  };
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
  const requestId = envelope.success ? envelope.data.error.requestId : undefined;
  const fallback = statusError(status);
  return new DailySessionClientError({
    status,
    requestId,
    code: fallback.code,
    message: fallback.message,
  });
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
