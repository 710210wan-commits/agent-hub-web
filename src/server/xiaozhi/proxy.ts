import { resolveXiaozhiServerConfig } from "./config";

export interface XiaozhiProxyOptions {
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
}

type Rule = Readonly<{
  method: "GET" | "POST";
  path: RegExp;
}>;

const ALLOWED_REQUESTS: readonly Rule[] = [
  { method: "GET", path: /^\/api\/system\/health$/ },
  { method: "GET", path: /^\/api\/agent\/default$/ },
  { method: "POST", path: /^\/api\/chat\/thread$/ },
  { method: "GET", path: /^\/api\/chat\/threads$/ },
  { method: "GET", path: /^\/api\/chat\/thread\/[^/?#]+\/history$/ },
  { method: "POST", path: /^\/api\/agent\/runs$/ },
  { method: "GET", path: /^\/api\/agent\/runs\/[^/?#]+\/events$/ },
  { method: "GET", path: /^\/api\/agent\/runs\/[^/?#]+\/result$/ },
  { method: "POST", path: /^\/api\/agent\/runs\/[^/?#]+\/cancel$/ },
];

const REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "last-event-id",
] as const;

const RESPONSE_HEADERS = [
  "cache-control",
  "content-disposition",
  "content-type",
  "etag",
  "last-modified",
  "retry-after",
  "x-request-id",
] as const;

export function isAllowedWorkAgentRequest(method: string, path: string): boolean {
  if (
    path.includes("\\") ||
    path.includes("%") ||
    path.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return false;
  }
  const normalizedMethod = method.toUpperCase();
  return ALLOWED_REQUESTS.some(
    (rule) => rule.method === normalizedMethod && rule.path.test(path),
  );
}

export async function proxyWorkAgentRequest(
  request: Request,
  pathSegments: string[],
  options: XiaozhiProxyOptions = {},
): Promise<Response> {
  if (!safePathSegments(pathSegments)) {
    return proxyError(404, "WORK_AGENT_ROUTE_NOT_ALLOWED", "Work Agent route is not available.");
  }

  const upstreamPath = `/api/${pathSegments.join("/")}`;
  const method = request.method.toUpperCase();
  if (!isAllowedWorkAgentRequest(method, upstreamPath)) {
    return proxyError(404, "WORK_AGENT_ROUTE_NOT_ALLOWED", "Work Agent route is not available.");
  }

  let config;
  try {
    config = resolveXiaozhiServerConfig(options.env ?? process.env);
  } catch {
    return proxyError(500, "WORK_AGENT_CONFIG_INVALID", "Work Agent gateway is not configured.");
  }

  const requestUrl = new URL(request.url);
  const target = new URL(upstreamPath, config.origin);
  copyAllowedQuery(upstreamPath, requestUrl.searchParams, target.searchParams);
  if (upstreamPath === "/api/chat/threads") {
    target.searchParams.set("agent_id", config.agentSlug);
  }
  if (/^\/api\/agent\/runs\/[^/]+\/events$/.test(upstreamPath)) {
    target.searchParams.set("verbose", "false");
  }

  const headers = forwardedRequestHeaders(request.headers);
  headers.set("authorization", `Bearer ${config.apiKey}`);

  let body: string | undefined;
  if (
    method === "POST" &&
    (upstreamPath === "/api/chat/thread" || upstreamPath === "/api/agent/runs")
  ) {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return proxyError(400, "WORK_AGENT_JSON_INVALID", "Work Agent request body must be valid JSON.");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return proxyError(400, "WORK_AGENT_JSON_INVALID", "Work Agent request body must be a JSON object.");
    }
    const nextPayload = { ...(payload as Record<string, unknown>) };
    if (upstreamPath === "/api/chat/thread") {
      nextPayload.agent_id = config.agentSlug;
    } else {
      nextPayload.agent_slug = config.agentSlug;
    }
    body = JSON.stringify(nextPayload);
    headers.set("content-type", "application/json");
  }

  let upstream: Response;
  try {
    upstream = await (options.fetchImpl ?? fetch)(target, {
      body,
      cache: "no-store",
      headers,
      method,
      redirect: "manual",
      signal: request.signal,
    });
  } catch {
    return proxyError(502, "WORK_AGENT_UPSTREAM_UNAVAILABLE", "Work Agent upstream is unavailable.");
  }

  if (upstream.status >= 400) {
    const responseHeaders = new Headers();
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) responseHeaders.set("retry-after", retryAfter);
    return proxyError(
      upstream.status,
      "WORK_AGENT_UPSTREAM_ERROR",
      "Work Agent upstream request failed.",
      responseHeaders,
    );
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

function copyAllowedQuery(
  path: string,
  source: URLSearchParams,
  target: URLSearchParams,
): void {
  const names = path === "/api/chat/threads"
    ? ["limit", "offset"]
    : /^\/api\/agent\/runs\/[^/]+\/events$/.test(path)
      ? ["after_seq"]
      : [];
  for (const name of names) {
    const value = source.get(name);
    if (value !== null) target.set(name, value);
  }
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
