/**
 * 知识库 HTTP API 统一请求封装（对接 DSI 后端 /api/kb/*）。
 *
 * 双环境取数路径：
 * - 服务端（Next SSR）：直连 AGENT_API_ORIGIN（绝对地址，如 http://127.0.0.1:3001）
 * - 浏览器：走同源代理 /agent-api（next.config.ts rewrites 转发到 AGENT_API_ORIGIN）
 *   原因：Node 端 fetch 没有"当前页面 origin"，相对路径无法解析；浏览器走代理则无跨域问题。
 *
 * 错误分类（与后端统一错误约定对齐，UI 只认 kind 不认文案）：
 * - unauthorized  401 未登录
 * - kbUnavailable 503 知识库功能未启用（DSI_KB_ENABLED=false）
 * - unavailable   502/504 依赖服务不可用（存储服务故障/超时）
 * - badRequest    400 参数问题
 * - network       连接失败（后端未启动/代理未配置）
 * - unknown       其他
 */

export type KbApiErrorKind =
  | "unauthorized"
  | "kbUnavailable"
  | "unavailable"
  | "badRequest"
  | "network"
  | "unknown";

export class KbApiError extends Error {
  readonly kind: KbApiErrorKind;
  readonly status: number;

  constructor(kind: KbApiErrorKind, status: number, message: string) {
    super(message);
    this.name = "KbApiError";
    this.kind = kind;
    this.status = status;
  }
}

// ========== 数据模型（与 DSI /api/kb/databases 返回对齐） ==========

export interface KbDatabase {
  kb_id: string;
  name: string;
  description: string;
  type: string;
  supports_documents: boolean;
}

interface KbDatabasesResponse {
  success: boolean;
  total: number;
  databases: KbDatabase[];
  message?: string;
}

// ========== 内部实现 ==========

function resolveBase(): string {
  if (typeof window === "undefined") {
    return (process.env.AGENT_API_ORIGIN ?? "").replace(/\/$/, "");
  }
  return "/agent-api";
}

async function kbFetch<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${resolveBase()}${path}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new KbApiError("network", 0, "无法连接知识库服务，请确认后端已启动");
  }

  let payload: { success?: boolean; error?: string; kbUnavailable?: boolean } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // 非 JSON 响应（如代理空响应），按空对象处理，走状态码分类
  }

  if (response.ok) {
    return payload as T;
  }
  throw classifyFailure(response.status, payload);
}

function classifyFailure(
  status: number,
  payload: { success?: boolean; error?: string; kbUnavailable?: boolean },
): KbApiError {
  const detail = payload.error?.trim();
  if (status === 401) {
    return new KbApiError("unauthorized", status, "请先登录后再访问知识库");
  }
  if (status === 503 && payload.kbUnavailable) {
    return new KbApiError("kbUnavailable", status, "知识库功能未启用");
  }
  if (status === 502 || status === 504) {
    return new KbApiError("unavailable", status, "知识库服务暂不可用，请稍后重试");
  }
  if (status === 400) {
    return new KbApiError("badRequest", status, detail ?? "请求参数有误");
  }
  return new KbApiError("unknown", status, detail ?? "加载失败，请稍后重试");
}

/** 把任意错误转成可直接展示的用户文案 */
export function kbErrorMessage(error: unknown): string {
  if (error instanceof KbApiError) {
    return error.message;
  }
  return "加载失败，请稍后重试";
}

// ========== 面向页面的接口 ==========

/** 获取知识库列表（GET /api/kb/databases） */
export async function listKbDatabases(): Promise<KbDatabase[]> {
  const data = await kbFetch<KbDatabasesResponse>("/api/kb/databases");
  if (!data.success) {
    throw new KbApiError("unknown", 200, data.message ?? "获取知识库列表失败");
  }
  return data.databases ?? [];
}
