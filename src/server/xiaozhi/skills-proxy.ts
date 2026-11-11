import {
  isSafeWorkSkillFilePath,
  isValidWorkSkillSlug,
  WORK_SKILL_SLUG_PATTERN,
} from "@/features/skills/work/contracts";

import { resolveXiaozhiServerConfig } from "./config";

/**
 * Work Skill 独立同源 BFF（`/api/work-skills/*`）。
 *
 * 安全契约（docs/skill-market/2026-11-11-work-skill-frontend-implementation.md §5）：
 * - 每个请求先用 `dsi_app_session` 在服务端验证 DSI 完整登录态；
 *   anonymous、demo、失效会话、缺 Cookie、认证超时/故障全部 fail closed，
 *   且校验发生在读取上传体与调用 Xiaozhi 之前。
 * - Cookie 只发送给 DSI 会话接口；浏览器 Authorization/Host/Cookie 等凭据全部丢弃。
 * - 校验通过后用 server-only `XIAOZHI_API_KEY` 调用白名单内的 Xiaozhi 现有接口。
 * - 支持 JSON、multipart 上传与 ZIP 流式下载；4xx 提取 detail、5xx 泛化，不泄露上游内部信息。
 */

export const WORK_SKILLS_PROXY_TIMEOUT_MS = 60000;
export const WORK_SKILLS_AUTH_TIMEOUT_MS = 8000;

const SESSION_COOKIE_NAME = "dsi_app_session";
const SESSION_COOKIE_PATTERN = /(?:^|;\s*)dsi_app_session=([A-Za-z0-9._~-]+)(?=\s*(?:;|$))/;
const DSI_SESSION_PATH = "/auth/xiaozhi-status";

const REQUEST_HEADERS = ["accept", "accept-language", "content-type"] as const;
const RESPONSE_HEADERS = [
  "cache-control",
  "content-disposition",
  "content-type",
  "etag",
  "last-modified",
  "retry-after",
  "x-request-id",
] as const;

const SLUG_SOURCE = WORK_SKILL_SLUG_PATTERN.source.replace(/^\^/, "").replace(/\$$/, "");
const SLUG_SEGMENT = `(${SLUG_SOURCE})`;
const DRAFT_SEGMENT = "([A-Za-z0-9._~-]+)";

type RuleMethod = "DELETE" | "GET" | "POST" | "PUT";

interface WorkSkillsRule {
  method: RuleMethod;
  path: RegExp;
  query: readonly string[];
  requiredQuery: readonly string[];
}

/** 冻结白名单：只允许 docs/skill-market/2026-11-11-work-skill-frontend-implementation.md §6 列出的接口。 */
const ALLOWED_REQUESTS: readonly WorkSkillsRule[] = [
  { method: "GET", path: /^\/api\/system\/skills$/, query: [], requiredQuery: [] },
  {
    method: "GET",
    path: /^\/api\/system\/skills\/dependency-options$/,
    query: ["slug"],
    requiredQuery: [],
  },
  { method: "POST", path: /^\/api\/system\/skills\/delete-batch$/, query: [], requiredQuery: [] },
  {
    method: "GET",
    path: new RegExp(`^/api/system/skills/${SLUG_SEGMENT}/tree$`),
    query: [],
    requiredQuery: [],
  },
  {
    method: "GET",
    path: new RegExp(`^/api/system/skills/${SLUG_SEGMENT}/file$`),
    query: ["path"],
    requiredQuery: ["path"],
  },
  {
    method: "POST",
    path: new RegExp(`^/api/system/skills/${SLUG_SEGMENT}/file$`),
    query: [],
    requiredQuery: [],
  },
  {
    method: "PUT",
    path: new RegExp(`^/api/system/skills/${SLUG_SEGMENT}/file$`),
    query: [],
    requiredQuery: [],
  },
  {
    method: "DELETE",
    path: new RegExp(`^/api/system/skills/${SLUG_SEGMENT}/file$`),
    query: ["path"],
    requiredQuery: ["path"],
  },
  {
    method: "PUT",
    path: new RegExp(`^/api/system/skills/${SLUG_SEGMENT}/enabled$`),
    query: [],
    requiredQuery: [],
  },
  {
    method: "PUT",
    path: new RegExp(`^/api/system/skills/${SLUG_SEGMENT}/share-config$`),
    query: [],
    requiredQuery: [],
  },
  {
    method: "PUT",
    path: new RegExp(`^/api/system/skills/${SLUG_SEGMENT}/dependencies$`),
    query: [],
    requiredQuery: [],
  },
  {
    method: "GET",
    path: new RegExp(`^/api/system/skills/${SLUG_SEGMENT}/export$`),
    query: [],
    requiredQuery: [],
  },
  {
    method: "DELETE",
    path: new RegExp(`^/api/system/skills/${SLUG_SEGMENT}$`),
    query: [],
    requiredQuery: [],
  },
  { method: "POST", path: /^\/api\/skills\/import\/prepare$/, query: [], requiredQuery: [] },
  { method: "POST", path: /^\/api\/skills\/remote\/list$/, query: [], requiredQuery: [] },
  { method: "POST", path: /^\/api\/skills\/remote\/search$/, query: [], requiredQuery: [] },
  { method: "POST", path: /^\/api\/skills\/remote\/prepare$/, query: [], requiredQuery: [] },
  {
    method: "POST",
    path: new RegExp(`^/api/skills/install-drafts/${DRAFT_SEGMENT}/confirm$`),
    query: [],
    requiredQuery: [],
  },
  {
    method: "DELETE",
    path: new RegExp(`^/api/skills/install-drafts/${DRAFT_SEGMENT}$`),
    query: [],
    requiredQuery: [],
  },
];

export interface WorkSkillsProxyOptions {
  authTimeoutMs?: number;
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface WorkSkillsProxyConfig {
  apiKey: string;
  dsiOrigin: string;
  origin: URL;
}

export async function proxyWorkSkillsRequest(
  request: Request,
  pathSegments: string[],
  options: WorkSkillsProxyOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!safePathSegments(pathSegments)) {
    return proxyError(404, "WORK_SKILLS_ROUTE_NOT_ALLOWED", "Work Skill route is not available.");
  }
  const upstreamPath = `/api/${pathSegments.join("/")}`;
  const method = request.method.toUpperCase() as RuleMethod;
  const rule = ALLOWED_REQUESTS.find(
    (candidate) => candidate.method === method && candidate.path.test(upstreamPath),
  );
  if (!rule) {
    return proxyError(404, "WORK_SKILLS_ROUTE_NOT_ALLOWED", "Work Skill route is not available.");
  }
  const requestUrl = new URL(request.url);
  if (!queryAllowed(rule, requestUrl.searchParams)) {
    return proxyError(404, "WORK_SKILLS_ROUTE_NOT_ALLOWED", "Work Skill route is not available.");
  }

  let config: WorkSkillsProxyConfig;
  try {
    config = resolveProxyConfig(options.env ?? process.env);
  } catch {
    return proxyError(500, "WORK_SKILLS_CONFIG_INVALID", "Work Skill gateway is not configured.");
  }

  const sessionError = await verifyDsiSession(
    request,
    config,
    fetchImpl,
    options.authTimeoutMs ?? WORK_SKILLS_AUTH_TIMEOUT_MS,
  );
  if (sessionError) return sessionError;

  let body: ArrayBuffer | undefined;
  if (method === "POST" || method === "PUT") {
    body = await request.arrayBuffer();
  }

  const target = new URL(upstreamPath, config.origin);
  copyAllowedQuery(rule, requestUrl.searchParams, target.searchParams);

  const headers = forwardedRequestHeaders(request.headers);
  headers.set("authorization", `Bearer ${config.apiKey}`);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? WORK_SKILLS_PROXY_TIMEOUT_MS);
  if (request.signal.aborted) controller.abort();
  else request.signal.addEventListener("abort", () => controller.abort(), { once: true });

  let upstream: Response;
  try {
    upstream = await fetchImpl(target, {
      body,
      cache: "no-store",
      headers,
      method,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    if (timedOut) {
      return proxyError(504, "WORK_SKILLS_UPSTREAM_TIMEOUT", "Work Skill 上游响应超时，请稍后重试。");
    }
    if (request.signal.aborted) {
      return proxyError(499, "WORK_SKILLS_CLIENT_ABORTED", "Work Skill 请求已取消。");
    }
    return proxyError(502, "WORK_SKILLS_UPSTREAM_UNAVAILABLE", "Work Skill 上游暂不可用，请稍后重试。");
  }
  clearTimeout(timer);

  if (upstream.status >= 400) {
    return upstreamErrorResponse(upstream);
  }
  const responseHeaders = forwardedResponseHeaders(upstream.headers);
  if (!upstream.body || upstream.status === 204) {
    return new Response(null, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

function safePathSegments(pathSegments: readonly string[]): boolean {
  return (
    pathSegments.length > 0 &&
    pathSegments.every(
      (segment) =>
        segment !== "." &&
        segment !== ".." &&
        /^[A-Za-z0-9._~-]+$/.test(segment),
    )
  );
}

function queryAllowed(rule: WorkSkillsRule, params: URLSearchParams): boolean {
  for (const name of params.keys()) {
    if (!rule.query.includes(name)) return false;
  }
  for (const name of rule.query) {
    if (params.getAll(name).length > 1) return false;
  }
  for (const name of rule.requiredQuery) {
    if (!params.has(name)) return false;
  }
  const pathParam = params.get("path");
  if (pathParam !== null && !isSafeWorkSkillFilePath(pathParam)) return false;
  const slugParam = params.get("slug");
  if (slugParam !== null && !isValidWorkSkillSlug(slugParam)) return false;
  return true;
}

function copyAllowedQuery(
  rule: WorkSkillsRule,
  source: URLSearchParams,
  target: URLSearchParams,
): void {
  for (const name of rule.query) {
    for (const value of source.getAll(name)) {
      target.set(name, value);
    }
  }
}

function resolveProxyConfig(
  env: Readonly<Record<string, string | undefined>>,
): WorkSkillsProxyConfig {
  const xiaozhi = resolveXiaozhiServerConfig(env);
  return {
    apiKey: xiaozhi.apiKey,
    dsiOrigin: resolveDsiSessionOrigin(env),
    origin: xiaozhi.origin,
  };
}

function resolveDsiSessionOrigin(
  env: Readonly<Record<string, string | undefined>>,
): string {
  const raw = env.AGENT_API_ORIGIN?.trim();
  if (!raw) throw new Error("AGENT_API_ORIGIN 未配置");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("AGENT_API_ORIGIN 必须是有效的 http(s) 地址");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("AGENT_API_ORIGIN 必须是有效的 http(s) 地址");
  }
  return url.origin;
}

function extractSessionCookie(cookieHeader: string | null): string | undefined {
  const match = cookieHeader?.match(SESSION_COOKIE_PATTERN);
  return match?.[1];
}

/**
 * DSI 完整登录态校验。返回 null 表示通过；返回 Response 表示 fail closed 错误。
 * Cookie 只发给 DSI；浏览器其余 Cookie 不带出。
 */
async function verifyDsiSession(
  request: Request,
  config: WorkSkillsProxyConfig,
  fetchImpl: typeof fetch,
  authTimeoutMs: number,
): Promise<Response | null> {
  const sessionId = extractSessionCookie(request.headers.get("cookie"));
  if (!sessionId) {
    return proxyError(401, "WORK_SKILLS_SESSION_REQUIRED", "请先登录后再访问 Work Skill。");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), authTimeoutMs);
  if (request.signal.aborted) controller.abort();
  else request.signal.addEventListener("abort", () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetchImpl(new URL(DSI_SESSION_PATH, config.dsiOrigin), {
      cache: "no-store",
      headers: {
        accept: "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${sessionId}`,
      },
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return proxyError(503, "WORK_SKILLS_AUTH_UNAVAILABLE", "登录状态校验服务暂不可用，请稍后重试。");
  }
  clearTimeout(timer);

  if (response.status === 401 || response.status === 403) {
    return proxyError(401, "WORK_SKILLS_SESSION_INVALID", "登录状态已失效，请重新登录。");
  }
  if (!response.ok) {
    return proxyError(503, "WORK_SKILLS_AUTH_UNAVAILABLE", "登录状态校验服务暂不可用，请稍后重试。");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return proxyError(503, "WORK_SKILLS_AUTH_UNAVAILABLE", "登录状态校验服务暂不可用，请稍后重试。");
  }
  const enabled =
    payload && typeof payload === "object"
      ? (payload as { enabled?: unknown }).enabled
      : undefined;
  if (typeof enabled !== "boolean") {
    return proxyError(503, "WORK_SKILLS_AUTH_UNAVAILABLE", "登录状态校验服务暂不可用，请稍后重试。");
  }
  if (!enabled) {
    return proxyError(401, "WORK_SKILLS_SESSION_INVALID", "登录状态已失效，请重新登录。");
  }
  return null;
}

/** 4xx 提取 FastAPI detail 供前端展示；5xx 泛化，避免泄露上游内部信息。 */
async function upstreamErrorResponse(upstream: Response): Promise<Response> {
  const headers = new Headers();
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) headers.set("retry-after", retryAfter);

  let message: string | undefined;
  if (upstream.status >= 400 && upstream.status < 500) {
    message = await readUpstreamDetail(upstream);
  }
  return proxyError(
    upstream.status,
    "WORK_SKILLS_UPSTREAM_ERROR",
    message ?? "Work Skill 服务暂不可用，请稍后重试。",
    headers,
  );
}

async function readUpstreamDetail(response: Response): Promise<string | undefined> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return undefined;
  }
  try {
    const payload: unknown = await response.json();
    if (
      payload &&
      typeof payload === "object" &&
      typeof (payload as { detail?: unknown }).detail === "string"
    ) {
      return (payload as { detail: string }).detail;
    }
  } catch {
    // 非 JSON 或读取失败时回退通用文案。
  }
  return undefined;
}

function forwardedRequestHeaders(source: Headers): Headers {
  const result = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = source.get(name);
    if (value !== null) result.set(name, value);
  }
  return result;
}

function forwardedResponseHeaders(source: Headers): Headers {
  const result = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = source.get(name);
    if (value !== null) result.set(name, value);
  }
  return result;
}

function proxyError(
  status: number,
  code: string,
  error: string,
  headers = new Headers(),
): Response {
  headers.set("cache-control", "no-store");
  return Response.json({ code, error }, { status, headers });
}
