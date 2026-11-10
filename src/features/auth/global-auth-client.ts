import { z, type ZodType } from "zod";

/**
 * 全局统一登录客户端（AuthProvider 专用）。
 *
 * 与 chat 的 daily-session-client 的区别：
 * - login 不做"kbUnavailable 时二次 xiaozhi-login 升级"：DSI_KB_ENABLED=false 或
 *   演示登录（mode:"sms"）会建立基础会话，这里如实返回 demo，由 AuthProvider 进入演示态。
 * - xiaozhiUrl 允许空串：DSI 在未配置 XIAOZHI_API_BASE 时返回 ""（无 xiaozhi 环境的
 *   演示部署是合法场景，不能按 INVALID_RESPONSE 误判为 error）。
 */

export interface GlobalAuthUser {
  id: string;
  displayName: string;
  sessionExpiresAt?: string;
}

export type GlobalAuthStatusResult =
  | { enabled: true; user: GlobalAuthUser }
  | { enabled: false };

export type GlobalAuthLoginResult =
  | { kind: "full"; user: GlobalAuthUser }
  | { kind: "demo" };

export interface GlobalAuthClient {
  getAuthStatus(signal?: AbortSignal): Promise<GlobalAuthStatusResult>;
  login(
    input: { username: string; password: string },
    signal?: AbortSignal,
  ): Promise<GlobalAuthLoginResult>;
  loginDemo(signal?: AbortSignal): Promise<void>;
  logout(signal?: AbortSignal): Promise<void>;
}

export class GlobalAuthClientError extends Error {
  readonly status?: number;
  readonly code: string;

  constructor(input: { message: string; code: string; status?: number }) {
    super(input.message);
    this.name = "GlobalAuthClientError";
    this.code = input.code;
    this.status = input.status;
  }
}

const timestamp = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "非法时间格式");

const UserSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  sessionExpiresAt: timestamp.optional(),
});

const AuthStatusSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false), xiaozhiUrl: z.string() }),
  z.object({
    enabled: z.literal(true),
    xiaozhiUrl: z.string(),
    user: UserSchema,
  }),
]);

const LoginResponseSchema = z.object({
  success: z.literal(true),
  user: UserSchema,
  kbUnavailable: z.literal(true).optional(),
});

const LogoutResponseSchema = z.object({ ok: z.literal(true) });

export interface GlobalAuthClientOptions {
  apiBaseUrl?: string;
  fetchFn?: typeof fetch;
}

export function createGlobalAuthClient(
  options: GlobalAuthClientOptions = {},
): GlobalAuthClient {
  const apiBaseUrl = normalizeSameOriginBase(options.apiBaseUrl ?? "/agent-api");
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
          ...(init.body
            ? { "content-type": "application/json; charset=utf-8" }
            : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new GlobalAuthClientError({
        code: "NETWORK_ERROR",
        message: "网络请求失败，请检查后端服务是否已启动",
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    if (!response.ok) throw mapHttpError(response.status, payload);

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new GlobalAuthClientError({
        status: response.status,
        code: "INVALID_RESPONSE",
        message: "服务响应格式错误，请稍后重试",
      });
    }
    return parsed.data;
  }

  async function getAuthStatus(
    signal?: AbortSignal,
  ): Promise<GlobalAuthStatusResult> {
    const status = await request("/auth/xiaozhi-status", AuthStatusSchema, {
      method: "GET",
      signal,
    });
    return status.enabled
      ? { enabled: true, user: status.user }
      : { enabled: false };
  }

  return {
    getAuthStatus,

    async login(input, signal) {
      await request("/auth/login", LoginResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          username: input.username,
          password: input.password,
        }),
        signal,
      });
      // 登录后探测会话类型：完整（含 xiaozhi token）或基础（演示/降级）
      const status = await getAuthStatus(signal);
      return status.enabled
        ? { kind: "full", user: status.user }
        : { kind: "demo" };
    },

    async loginDemo(signal) {
      // mode:"sms" 让 DSI 跳过 xiaozhi 校验，直接建立基础会话（演示/无环境开发用）。
      // 用户名仅用于展示，不参与任何鉴权。
      await request("/auth/login", LoginResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          username: "demo",
          password: "demo",
          mode: "sms",
        }),
        signal,
      });
    },

    async logout(signal) {
      await request("/auth/logout", LogoutResponseSchema, {
        method: "POST",
        signal,
      });
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

function mapHttpError(status: number, payload: unknown): GlobalAuthClientError {
  // DSI 错误体为 { error: string }（如登录失败"账号或授权无效"），优先透出
  const upstreamMessage =
    payload &&
    typeof payload === "object" &&
    typeof (payload as { error?: unknown }).error === "string"
      ? ((payload as { error: string }).error as string)
      : undefined;
  const withMessage = (code: string, fallback: string) =>
    new GlobalAuthClientError({
      status,
      code,
      message: upstreamMessage ?? fallback,
    });
  switch (status) {
    case 400:
      return withMessage("INVALID_REQUEST", "请求无效，请检查输入");
    case 401:
      return withMessage("AUTH_REQUIRED", "登录状态已失效，请重新登录");
    case 403:
      return withMessage(
        "ORIGIN_REJECTED",
        "请求来源校验失败，请联系管理员检查部署配置",
      );
    default:
      return withMessage("REQUEST_FAILED", "登录服务暂不可用，请稍后重试");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
