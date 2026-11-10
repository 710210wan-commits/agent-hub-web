/**
 * 知识库 HTTP API 统一请求封装（对接 DSI 后端 /api/kb/*）。
 *
 * 双环境取数路径：
 * - 服务端（Next SSR）：直连 AGENT_API_ORIGIN（绝对地址，如 http://127.0.0.1:3001）
 * - 浏览器：走同源代理 /agent-api（next.config.ts rewrites 转发到 AGENT_API_ORIGIN）
 *   原因：Node 端 fetch 没有"当前页面 origin"，相对路径无法解析；浏览器走代理则无跨域问题。
 *
 * 错误分类（与后端统一错误约定对齐，UI 只认 kind 不认文案）：
 * - 4xx/5xx 错误响应为框架信封 { code, message, data: null, details }；
 *   503 功能未启用时 details.kbUnavailable === true；5xx 的 message 带 "[kind] " 前缀
 * - 401（requireDsiSession）为例外：{ error: string }，不带信封
 * - unauthorized  401 未登录
 * - kbUnavailable 503 知识库功能未启用（DSI_KB_ENABLED=false）
 * - unavailable   502/504 依赖服务不可用（存储服务故障/超时）
 * - notFound      404 知识库或文档不存在
 * - badRequest    400 参数问题
 * - network       连接失败（后端未启动/代理未配置）
 * - unknown       其他
 */

import type {
  KbAdditionalParams,
  KbChunkPreset,
  KbDatabase,
  KbDatabaseDeleteResponse,
  KbDatabaseDetail,
  KbDatabaseListResponse,
  KbDatabaseResponse,
  KbDatabaseStats,
  KbDatabaseUpdateResponse,
  KbChunkPresetListResponse,
  KbDocument,
  KbDocumentChunk,
  KbDocumentContent,
  KbDocumentContentResponse,
  KbDocumentDeleteResponse,
  KbDocumentList,
  KbDocumentStatus,
  KbDocumentStatusResponse,
  KbDocumentTaskResponse,
  KbDocumentUploadResponse,
  KbDocumentUploadResult,
  KbDocumentsResponse,
  KbEmbeddingModel,
  KbEmbeddingModelListResponse,
  KbFolderResponse,
  KbIndexStatus,
  KbParseStatus,
  KbQueryHit,
  KbQueryParamField,
  KbQueryParamOption,
  KbQueryParamsResponse,
  KbQueryTestResponse,
  KbSampleQuestions,
  KbSampleQuestionsResponse,
} from "@/features/knowledge/contracts/generated";

// 数据模型类型统一来自 OpenAPI 契约生成物（api/openapi/kb.v1.json → src/features/knowledge/contracts/generated），
// 这里只做再导出，保持既有引用路径与导出名不变。
export type {
  KbAdditionalParams,
  KbChunkPreset,
  KbDatabase,
  KbDatabaseDetail,
  KbDatabaseStats,
  KbDocument,
  KbDocumentChunk,
  KbDocumentContent,
  KbDocumentList,
  KbDocumentStatus,
  KbDocumentUploadResult,
  KbEmbeddingModel,
  KbIndexStatus,
  KbParseStatus,
  KbQueryHit,
  KbQueryParamField,
  KbQueryParamOption,
  KbSampleQuestions,
};

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

// ========== 数据模型 ==========
// 字段定义见 api/openapi/kb.v1.json；运行时类型由 src/features/knowledge/contracts/generated 生成。
// 这里只保留错误分类与文档状态判断等运行时逻辑。

/** 可触发解析的 xiaozhi 原始状态（待解析 / 解析失败） */
const KB_PARSEABLE_STATUSES = new Set(["uploaded", "error_parsing"]);

/** 可触发入库的 xiaozhi 原始状态（待入库 / 入库失败 / 已入库） */
const KB_INDEXABLE_STATUSES = new Set(["parsed", "error_indexing", "indexed", "done"]);

/** 已入库，再次入库即「重新入库」 */
const KB_REINDEX_STATUSES = new Set(["indexed", "done"]);

/** 有原始文件可下载（URL 类型除外） */
const KB_DOWNLOADABLE_STATUSES = new Set(["parsed", "error_indexing", "indexed", "done"]);

export function canParseKbDocument(document: KbDocument): boolean {
  return !document.is_folder && KB_PARSEABLE_STATUSES.has(document.status);
}

export function canIndexKbDocument(document: KbDocument): boolean {
  return !document.is_folder && KB_INDEXABLE_STATUSES.has(document.status);
}

export function canReindexKbDocument(document: KbDocument): boolean {
  return !document.is_folder && KB_REINDEX_STATUSES.has(document.status);
}

export function canDownloadKbDocument(document: KbDocument): boolean {
  return (
    !document.is_folder &&
    document.file_type !== "url" &&
    KB_DOWNLOADABLE_STATUSES.has(document.status)
  );
}

export interface ListKbDocumentsOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  /** 父文件夹 ID；不传表示根目录 */
  parentId?: string;
}

// ========== 过渡登录（DSI 会话） ==========
//
// 统一登录方案尚未与同事确定（计划 T2.3）。在确定前，知识库页面用 DSI 自己的
// 会话登录：POST /auth/login 成功后由 DSI 下发 HttpOnly cookie，后续 /api/kb/*
// 请求自动携带。统一单点登录接入后，只需替换本函数的实现。

export interface KbSessionUser {
  id: string;
  name?: string;
}

interface KbLoginResponse {
  success?: boolean;
  user?: KbSessionUser;
  error?: string;
}

export async function loginKbSession(
  username: string,
  password: string,
): Promise<KbSessionUser> {
  let response: Response;
  try {
    response = await fetch(`${resolveBase()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new KbApiError("network", 0, "无法连接登录服务，请确认后端已启动");
  }

  const payload = (await response.json().catch(() => ({}))) as KbLoginResponse;

  if (response.status === 401) {
    throw new KbApiError("unauthorized", 401, payload.error ?? "用户名或密码错误");
  }
  if (!response.ok) {
    throw classifyFailure(response.status, payload);
  }
  if (!payload.success || !payload.user?.id) {
    throw new KbApiError("unknown", 200, payload.error ?? "登录失败，请稍后重试");
  }
  return payload.user;
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

  let payload: KbErrorPayload = {};
  try {
    payload = (await response.json()) as KbErrorPayload;
  } catch {
    // 非 JSON 响应（如代理空响应），按空对象处理，走状态码分类
  }

  if (response.ok) {
    return payload as T;
  }
  throw classifyFailure(response.status, payload);
}

/**
 * 错误响应载体（契约 §三，DSI api/src/modules/kb/_shared.ts）：
 * - 业务失败（4xx/5xx）：框架信封 { code, message, data: null, details }
 * - 401（requireDsiSession）：{ error }，不带信封
 */
interface KbErrorPayload {
  code?: number;
  message?: string;
  data?: unknown;
  details?: unknown;
  error?: string;
}

/** 从信封或 401 响应中提取可读原因 */
function errorDetail(payload: KbErrorPayload): string | undefined {
  const raw = payload.message ?? payload.error;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 503 功能未启用标记位于信封 details 内 */
function hasKbUnavailableFlag(payload: KbErrorPayload): boolean {
  const details = payload.details;
  return (
    typeof details === "object" &&
    details !== null &&
    (details as Record<string, unknown>).kbUnavailable === true
  );
}

function classifyFailure(
  status: number,
  payload: KbErrorPayload,
): KbApiError {
  const detail = errorDetail(payload);
  if (status === 401) {
    return new KbApiError("unauthorized", status, "请先登录后再访问知识库");
  }
  if (status === 503 && hasKbUnavailableFlag(payload)) {
    return new KbApiError("kbUnavailable", status, "知识库功能未启用");
  }
  if (status === 502 || status === 504) {
    // 502 常是上游 xiaozhi 的具体失败（如模型未配置凭证），message 带 "[kind] " 前缀，
    // 剥掉前缀透出原因，否则用户只看到「暂不可用」无法定位问题。
    const reason = detail?.replace(/^\[\w+\]\s*/, "");
    return new KbApiError(
      "unavailable",
      status,
      reason
        ? `知识库服务暂不可用：${reason}`
        : "知识库服务暂不可用，请稍后重试",
    );
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

/** 获取可用分块策略（GET /api/kb/chunk-presets） */
export async function listKbChunkPresets(): Promise<KbChunkPreset[]> {
  const data = await kbFetch<KbChunkPresetListResponse>("/api/kb/chunk-presets");
  assertSuccess(data, "获取分块策略失败");
  return data.chunk_presets ?? [];
}

/** 获取可用嵌入模型（GET /api/kb/models/embedding） */
export async function listKbEmbeddingModels(): Promise<KbEmbeddingModel[]> {
  const data = await kbFetch<KbEmbeddingModelListResponse>("/api/kb/models/embedding");
  assertSuccess(data, "获取嵌入模型失败");
  return data.models ?? [];
}

/** 新建知识库（POST /api/kb/databases） */
export async function createKbDatabase(input: {
  name: string;
  description?: string;
  embeddingModelSpec?: string;
  chunkPresetId?: string;
}): Promise<KbDatabaseDetail | null> {
  const data = await kbFetch<KbDatabaseResponse>("/api/kb/databases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      ...(input.embeddingModelSpec
        ? { embedding_model_spec: input.embeddingModelSpec }
        : {}),
      ...(input.chunkPresetId ? { chunk_preset_id: input.chunkPresetId } : {}),
    }),
  });
  assertSuccess(data, "新建知识库失败");
  return data.database ?? null;
}

/** 编辑知识库（PUT /api/kb/databases/{kb_id}） */
export async function updateKbDatabase(
  kbId: string,
  input: {
    name: string;
    description?: string;
    chunkPresetId?: string;
    autoGenerateQuestions?: boolean;
  },
): Promise<void> {
  const data = await kbFetch<KbDatabaseUpdateResponse>(
    `/api/kb/databases/${encodeURIComponent(kbId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        ...(input.chunkPresetId ? { chunk_preset_id: input.chunkPresetId } : {}),
        ...(input.autoGenerateQuestions === undefined
          ? {}
          : { auto_generate_questions: input.autoGenerateQuestions }),
      }),
    },
  );
  assertSuccess(data, "保存知识库失败");
}

/** 删除知识库（DELETE /api/kb/databases/{kb_id}） */
export async function deleteKbDatabase(kbId: string): Promise<void> {
  const data = await kbFetch<KbDatabaseDeleteResponse>(
    `/api/kb/databases/${encodeURIComponent(kbId)}`,
    { method: "DELETE" },
  );
  assertSuccess(data, "删除知识库失败");
}

/** 新建文件夹（POST /api/kb/databases/{kb_id}/folders） */
export async function createKbFolder(
  kbId: string,
  input: { name: string; parentId?: string },
): Promise<void> {
  const data = await kbFetch<KbFolderResponse>(
    `/api/kb/databases/${encodeURIComponent(kbId)}/folders`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        ...(input.parentId ? { parent_id: input.parentId } : {}),
      }),
    },
  );
  assertSuccess(data, "新建文件夹失败");
}

/** 获取知识库列表（GET /api/kb/databases） */
export async function listKbDatabases(): Promise<KbDatabase[]> {
  const data = await kbFetch<KbDatabaseListResponse>("/api/kb/databases");
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

/** 读取库内样例问题（GET /api/kb/databases/{kb_id}/sample-questions） */
export async function getKbSampleQuestions(kbId: string): Promise<KbSampleQuestions> {
  const data = await kbFetch<KbSampleQuestionsResponse>(
    `/api/kb/databases/${encodeURIComponent(kbId)}/sample-questions`,
  );
  assertSuccess(data, "获取样例问题失败");
  const questions = data.questions ?? [];
  return { kb_id: data.kb_id ?? kbId, questions, count: questions.length };
}

/** 触发 AI 生成样例问题（POST /api/kb/databases/{kb_id}/sample-questions） */
export async function generateKbSampleQuestions(
  kbId: string,
  count = 10,
): Promise<KbSampleQuestions> {
  const data = await kbFetch<KbSampleQuestionsResponse>(
    `/api/kb/databases/${encodeURIComponent(kbId)}/sample-questions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count }),
    },
  );
  assertSuccess(data, "生成样例问题失败");
  const questions = data.questions ?? [];
  return { kb_id: data.kb_id ?? kbId, questions, count: questions.length };
}

// ========== 检索测试 ==========

export interface KbQueryTestResult {
  status: string;
  message: string;
  results: KbQueryHit[];
}

/** 读取检索参数定义（GET /api/kb/databases/{kb_id}/query-params） */
export async function getKbQueryParams(
  kbId: string,
): Promise<KbQueryParamField[]> {
  const data = await kbFetch<KbQueryParamsResponse>(
    `/api/kb/databases/${encodeURIComponent(kbId)}/query-params`,
  );
  assertSuccess(data, "获取检索参数失败");
  return data.params ?? [];
}

/** 执行检索测试（POST /api/kb/databases/{kb_id}/query-test） */
export async function testKbQuery(
  kbId: string,
  query: string,
  meta: Record<string, unknown>,
): Promise<KbQueryTestResult> {
  const data = await kbFetch<KbQueryTestResponse>(
    `/api/kb/databases/${encodeURIComponent(kbId)}/query-test`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, meta }),
    },
  );
  assertSuccess(data, "检索失败");
  return {
    status: data.status ?? "success",
    message: data.message ?? "success",
    results: data.results ?? [],
  };
}

export type KbExportFormat = "csv" | "md" | "txt";

/** 导出知识库（GET /api/kb/databases/{kb_id}/export） */
export async function exportKbDatabase(
  kbId: string,
  format: KbExportFormat,
  fileName: string,
): Promise<void> {
  const path =
    `/api/kb/databases/${encodeURIComponent(kbId)}/export` +
    `?format=${encodeURIComponent(format)}`;

  let response: Response;
  try {
    response = await fetch(`${resolveBase()}${path}`, {
      headers: { Accept: "application/octet-stream" },
    });
  } catch {
    throw new KbApiError("network", 0, "无法连接知识库服务，请确认后端已启动");
  }

  if (!response.ok) {
    let payload: KbErrorPayload = {};
    try {
      payload = (await response.json()) as KbErrorPayload;
    } catch {
      // 非 JSON 错误响应，走状态码分类
    }
    throw classifyFailure(response.status, payload);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
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
  if (opts?.parentId) {
    query.set("parent_id", opts.parentId);
  }

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

/** 获取文档预览内容（GET /api/kb/documents/{file_id}/content?kb_id={kb_id}） */
export async function getKbDocumentContent(
  kbId: string,
  fileId: string,
): Promise<KbDocumentContent> {
  const data = await kbFetch<KbDocumentContentResponse>(
    `/api/kb/documents/${encodeURIComponent(fileId)}/content?kb_id=${encodeURIComponent(kbId)}`,
  );
  assertSuccess(data, "获取文档内容失败");

  return {
    kb_id: data.kb_id ?? kbId,
    file_id: data.file_id ?? fileId,
    content: data.content ?? "",
    chunk_count: data.chunk_count ?? 0,
    chunks: Array.isArray(data.chunks) ? data.chunks : [],
  };
}

export interface KbDocumentTaskResult {
  message: string;
  status: string;
  task_id: string;
  queued_count: number;
}

/** 手动解析（POST /api/kb/documents/parse），适用待解析/解析失败文档 */
export async function parseKbDocuments(
  kbId: string,
  fileIds: string[],
): Promise<KbDocumentTaskResult> {
  const data = await kbFetch<KbDocumentTaskResponse>("/api/kb/documents/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kb_id: kbId, file_ids: fileIds }),
  });
  assertSuccess(data, "提交解析任务失败");
  return {
    message: data.message ?? "解析任务已提交",
    status: data.status ?? "queued",
    task_id: data.task_id ?? "",
    queued_count: data.queued_count ?? fileIds.length,
  };
}

/** 手动入库 / 重新入库（POST /api/kb/documents/index） */
export async function indexKbDocuments(
  kbId: string,
  fileIds: string[],
  params?: Record<string, unknown>,
): Promise<KbDocumentTaskResult> {
  const data = await kbFetch<KbDocumentTaskResponse>("/api/kb/documents/index", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kb_id: kbId, file_ids: fileIds, params: params ?? {} }),
  });
  assertSuccess(data, "提交入库任务失败");
  return {
    message: data.message ?? "入库任务已提交",
    status: data.status ?? "queued",
    task_id: data.task_id ?? "",
    queued_count: data.queued_count ?? fileIds.length,
  };
}

/** 下载原件（GET /api/kb/documents/{file_id}/download?kb_id={kb_id}） */
export async function downloadKbDocument(
  kbId: string,
  fileId: string,
  fileName: string,
): Promise<void> {
  const path =
    `/api/kb/documents/${encodeURIComponent(fileId)}/download` +
    `?kb_id=${encodeURIComponent(kbId)}`;

  let response: Response;
  try {
    response = await fetch(`${resolveBase()}${path}`, {
      headers: { Accept: "application/octet-stream" },
    });
  } catch {
    throw new KbApiError("network", 0, "无法连接知识库服务，请确认后端已启动");
  }

  if (!response.ok) {
    let payload: KbErrorPayload = {};
    try {
      payload = (await response.json()) as KbErrorPayload;
    } catch {
      // 非 JSON 错误响应，走状态码分类
    }
    throw classifyFailure(response.status, payload);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

/** 上传文档（POST /api/kb/documents，multipart） */
export async function uploadKbDocument(
  kbId: string,
  file: File,
  parentId?: string,
): Promise<KbDocumentUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kb_id", kbId);
  if (parentId) {
    formData.append("parent_id", parentId);
  }

  // 不手动设置 Content-Type，由浏览器自动补 multipart boundary
  const data = await kbFetch<KbDocumentUploadResponse>("/api/kb/documents", {
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
  const data = await kbFetch<KbDocumentDeleteResponse>(
    `/api/kb/documents/${encodeURIComponent(fileId)}?kb_id=${encodeURIComponent(kbId)}`,
    { method: "DELETE" },
  );
  assertSuccess(data, "删除文档失败");
  return data.message ?? "文档已删除";
}
