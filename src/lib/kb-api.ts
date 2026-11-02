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
 * - notFound      404 知识库或文档不存在
 * - badRequest    400 参数问题
 * - network       连接失败（后端未启动/代理未配置）
 * - unknown       其他
 */

export type KbApiErrorKind =
  | "unauthorized"
  | "kbUnavailable"
  | "unavailable"
  | "notFound"
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

// ========== 数据模型（与 DSI /api/kb/* 返回对齐） ==========

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

export interface KbDatabaseStats {
  file_count?: number;
  chunk_count?: number;
  total_size?: number;
  row_count?: number;
  folder_count?: number;
}

export interface KbDatabaseDetail {
  kb_id: string;
  name: string;
  description?: string | null;
  kb_type?: string | null;
  embedding_model_spec?: string | null;
  created_at?: string | null;
  stats?: KbDatabaseStats | null;
}

export type KbParseStatus = "waiting" | "parsing" | "parsed" | "failed";

export type KbIndexStatus = "waiting" | "indexing" | "indexed" | "failed";

export interface KbDocument {
  file_id: string;
  filename: string;
  file_type: string | null;
  file_size: number;
  is_folder: boolean;
  created_at: string | null;
  updated_at: string | null;
  status: string;
  parse_status: KbParseStatus;
  index_status: KbIndexStatus;
}

export interface KbDocumentStatus {
  status: string;
  parse_status: KbParseStatus;
  index_status: KbIndexStatus;
  chunk_count: number;
  error_message: string | null;
  updated_at: string | null;
}

export interface KbDocumentList {
  kb_id: string;
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  stats: KbDatabaseStats | null;
  documents: KbDocument[];
}

export interface KbDocumentUploadResult {
  kb_id: string;
  file_name: string;
  file_id: string;
  status: string;
  message: string;
}

export interface ListKbDocumentsOptions {
  page?: number;
  pageSize?: number;
  status?: string;
}

interface KbDatabaseResponse {
  success: boolean;
  database: KbDatabaseDetail;
  message?: string;
}

interface KbDocumentsResponse {
  success: boolean;
  kb_id: string;
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  stats: KbDatabaseStats | null;
  documents: KbDocument[];
  message?: string;
}

interface KbDocumentStatusResponse extends KbDocumentStatus {
  success: boolean;
  kb_id?: string;
  file_id?: string;
  message?: string;
}

interface KbUploadResponse extends KbDocumentUploadResult {
  success: boolean;
}

interface KbDeleteResponse {
  success: boolean;
  kb_id?: string;
  file_id?: string;
  message?: string;
}

// ========== 内部实现 ==========

function resolveBase(): string {
  if (typeof window === "undefined") {
    return (process.env.AGENT_API_ORIGIN ?? "").replace(/\/$/, "");
  }
  return "/agent-api";
}

function assertSuccess<T extends { success?: boolean; message?: string }>(
  data: T,
  fallbackMessage: string,
): T {
  if (!data.success) {
    throw new KbApiError("unknown", 200, data.message ?? fallbackMessage);
  }
  return data;
}

async function kbFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    response = await fetch(`${resolveBase()}${path}`, { ...init, headers });
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
  if (status === 404) {
    return new KbApiError("notFound", status, "知识库或文档不存在，可能已被删除");
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

/** 获取知识库详情（GET /api/kb/databases/{kb_id}） */
export async function getKbDatabase(kbId: string): Promise<KbDatabaseDetail> {
  const data = await kbFetch<KbDatabaseResponse>(
    `/api/kb/databases/${encodeURIComponent(kbId)}`,
  );
  assertSuccess(data, "获取知识库详情失败");
  if (!data.database) {
    throw new KbApiError("unknown", 200, "知识库详情为空");
  }
  return data.database;
}

/** 获取知识库文档列表（GET /api/kb/databases/{kb_id}/documents） */
export async function listKbDocuments(
  kbId: string,
  opts?: ListKbDocumentsOptions,
): Promise<KbDocumentList> {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 100;
  const status = opts?.status ?? "all";
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    status,
  });

  const data = await kbFetch<KbDocumentsResponse>(
    `/api/kb/databases/${encodeURIComponent(kbId)}/documents?${query.toString()}`,
  );
  assertSuccess(data, "获取文档列表失败");

  return {
    kb_id: data.kb_id ?? kbId,
    total: data.total ?? 0,
    page: data.page ?? page,
    page_size: data.page_size ?? pageSize,
    has_more: Boolean(data.has_more),
    stats: data.stats ?? null,
    documents: data.documents ?? [],
  };
}

/** 获取单个文档的解析/入库状态（GET /api/kb/documents/{file_id}/status） */
export async function getKbDocumentStatus(
  kbId: string,
  fileId: string,
): Promise<KbDocumentStatus> {
  const data = await kbFetch<KbDocumentStatusResponse>(
    `/api/kb/documents/${encodeURIComponent(fileId)}/status?kb_id=${encodeURIComponent(kbId)}`,
  );
  assertSuccess(data, "获取文档状态失败");

  return {
    status: data.status,
    parse_status: data.parse_status,
    index_status: data.index_status,
    chunk_count: data.chunk_count ?? 0,
    error_message: data.error_message ?? null,
    updated_at: data.updated_at ?? null,
  };
}

/** 上传文档（POST /api/kb/documents，multipart） */
export async function uploadKbDocument(
  kbId: string,
  file: File,
): Promise<KbDocumentUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kb_id", kbId);

  // 不手动设置 Content-Type，由浏览器自动补 multipart boundary
  const data = await kbFetch<KbUploadResponse>("/api/kb/documents", {
    method: "POST",
    body: formData,
  });
  assertSuccess(data, "上传文档失败");

  return {
    kb_id: data.kb_id ?? kbId,
    file_name: data.file_name ?? file.name,
    file_id: data.file_id ?? "",
    status: data.status ?? "",
    message: data.message ?? "文档已上传，正在解析",
  };
}

/** 删除文档（DELETE /api/kb/documents/{file_id}?kb_id={kb_id}） */
export async function deleteKbDocument(
  kbId: string,
  fileId: string,
): Promise<string> {
  const data = await kbFetch<KbDeleteResponse>(
    `/api/kb/documents/${encodeURIComponent(fileId)}?kb_id=${encodeURIComponent(kbId)}`,
    { method: "DELETE" },
  );
  assertSuccess(data, "删除文档失败");
  return data.message ?? "文档已删除";
}
