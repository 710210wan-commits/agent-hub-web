import {
  SkillMarketPrincipalError,
  createSkillMarketPrincipalHeaders,
} from "@/config/skill-market-principal";
import { resolveSkillMarketGatewayConfig } from "@/config/skill-market-gateway";
import {
  SkillMarketTargetError,
  resolveSkillMarketRequestTarget,
} from "@/config/skill-market-targets";

export interface SkillMarketGatewayOptions {
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

type NodeRequestInit = RequestInit & { duplex?: "half" };
type AbortKind = "client" | "timeout" | undefined;

const REQUEST_HEADERS = ["accept", "accept-language", "content-type"] as const;
const RESPONSE_HEADERS = [
  "cache-control",
  "content-disposition",
  "content-length",
  "content-type",
  "etag",
  "last-modified",
  "retry-after",
  "x-content-sha256",
  "x-request-id",
] as const;
const SUPPORTED_METHODS = new Set(["DELETE", "GET", "POST", "PUT"]);

export async function proxySkillMarketRequest(
  request: Request,
  pathSegments: readonly string[],
  options: SkillMarketGatewayOptions = {},
): Promise<Response> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestUrl = new URL(request.url);
  const modes = requestUrl.searchParams.getAll("mode");
  if (modes.length !== 1) {
    return gatewayError(400, "SKILL_MARKET_MODE_INVALID", "Skill Market mode is required exactly once.");
  }

  const query = new URLSearchParams(requestUrl.searchParams);
  query.delete("mode");
  const path = `/api/skill-market/${pathSegments.join("/")}`;
  const method = request.method.toUpperCase();
  if (!SUPPORTED_METHODS.has(method)) {
    return gatewayError(405, "SKILL_MARKET_METHOD_NOT_ALLOWED", "Skill Market method is not allowed.");
  }

  let target;
  try {
    target = resolveSkillMarketRequestTarget({ mode: modes[0], path, query }, env);
  } catch (error) {
    return targetErrorResponse(error);
  }

  const headers = forwardedRequestHeaders(request.headers);
  try {
    const principalHeaders = createSkillMarketPrincipalHeaders(
      {
        method,
        originalUrl: `${target.url.pathname}${target.url.search}`,
        timestamp: options.now?.() ?? Date.now(),
      },
      env,
    );
    principalHeaders.forEach((value, name) => headers.set(name, value));
  } catch (error) {
    return principalErrorResponse(error);
  }

  let timeoutMs: number;
  try {
    timeoutMs = options.timeoutMs ?? resolveSkillMarketGatewayConfig(env).timeoutMs;
  } catch {
    return gatewayError(500, "SKILL_MARKET_GATEWAY_CONFIG_INVALID", "Skill Market gateway is not configured.");
  }

  const upstreamController = new AbortController();
  let abortKind: AbortKind;
  const cancelUpstream = () => {
    abortKind = "client";
    upstreamController.abort(new DOMException("Client closed request", "AbortError"));
  };
  if (request.signal.aborted) cancelUpstream();
  else request.signal.addEventListener("abort", cancelUpstream, { once: true });
  const timeout = setTimeout(() => {
    abortKind = "timeout";
    upstreamController.abort(new DOMException("Upstream timeout", "TimeoutError"));
  }, timeoutMs);
  const cleanup = () => {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", cancelUpstream);
  };

  const init: NodeRequestInit = {
    cache: "no-store",
    method,
    headers,
    redirect: "manual",
    signal: upstreamController.signal,
  };
  if (method !== "GET" && request.body) {
    init.body = request.body;
    init.duplex = "half";
  }

  try {
    const upstream = await fetchImpl(target.url, init);
    const responseHeaders = forwardedResponseHeaders(upstream.headers);
    if (!upstream.body || upstream.status === 204) {
      cleanup();
      return new Response(null, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    }
    return new Response(streamWithCleanup(upstream.body, cleanup), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    cleanup();
    if (abortKind === "client") {
      return gatewayError(499, "SKILL_MARKET_CLIENT_CLOSED_REQUEST", "Skill Market request was cancelled.");
    }
    if (abortKind === "timeout") {
      return gatewayError(504, "SKILL_MARKET_UPSTREAM_TIMEOUT", "Skill Market upstream timed out.");
    }
    return gatewayError(502, "SKILL_MARKET_UPSTREAM_UNAVAILABLE", "Skill Market upstream is unavailable.");
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

function streamWithCleanup(
  body: ReadableStream<Uint8Array>,
  cleanup: () => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const item = await reader.read();
        if (item.done) {
          cleanup();
          controller.close();
        } else {
          controller.enqueue(item.value);
        }
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    async cancel(reason) {
      cleanup();
      await reader.cancel(reason);
    },
  });
}

function targetErrorResponse(error: unknown): Response {
  if (!(error instanceof SkillMarketTargetError)) {
    return gatewayError(500, "SKILL_MARKET_GATEWAY_CONFIG_INVALID", "Skill Market gateway is not configured.");
  }
  if (error.code === "SKILL_MARKET_MODE_UNAVAILABLE") {
    return gatewayError(409, error.code, "Work Skill Market is not available.");
  }
  if (error.code === "SKILL_MARKET_CONFIG_INVALID") {
    return gatewayError(500, "SKILL_MARKET_GATEWAY_CONFIG_INVALID", "Skill Market gateway is not configured.");
  }
  return gatewayError(400, error.code, "Skill Market request is invalid.");
}

function principalErrorResponse(error: unknown): Response {
  if (error instanceof SkillMarketPrincipalError) {
    const status = error.code === "SKILL_MARKET_PRINCIPAL_CONFIG_INVALID" ? 500 : 400;
    return gatewayError(status, error.code, status === 500
      ? "Skill Market gateway is not configured."
      : "Skill Market request is invalid.");
  }
  return gatewayError(500, "SKILL_MARKET_GATEWAY_CONFIG_INVALID", "Skill Market gateway is not configured.");
}

function gatewayError(status: number, code: string, error: string): Response {
  return Response.json(
    { code, error },
    { status, headers: { "cache-control": "no-store" } },
  );
}
