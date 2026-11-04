export type ChatTransportMode = "mock" | "projects-new";

function resolveLegacyFrontendUrl(
  env: Readonly<Record<string, string | undefined>>,
): string {
  const configured = env.NEXT_PUBLIC_LEGACY_FRONTEND_URL?.trim();
  if (!configured) {
    if (env.NODE_ENV === "production") {
      throw new Error("生产环境必须配置老前端地址");
    }
    return "http://localhost:5000";
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("老前端地址必须是安全的 HTTP(S) 地址");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("老前端地址必须是安全的 HTTP(S) 地址");
  }
  return configured;
}

export interface PublicRuntimeConfig {
  transport: ChatTransportMode;
  apiBaseUrl: string;
  legacyFrontendUrl: string;
}

export function resolvePublicRuntimeConfig(
  env: Readonly<Record<string, string | undefined>>,
): PublicRuntimeConfig {
  const transport =
    env.NEXT_PUBLIC_CHAT_TRANSPORT ??
    (env.NODE_ENV === "production" ? "projects-new" : "mock");
  if (transport !== "mock" && transport !== "projects-new") {
    throw new Error(`未知 chat transport: ${transport}`);
  }

  if (env.NODE_ENV === "production" && transport === "mock") {
    throw new Error("生产环境禁止使用 mock transport");
  }

  const apiBaseUrl = env.NEXT_PUBLIC_AGENT_API_BASE ?? "/agent-api";
  const unsafePath =
    apiBaseUrl !== apiBaseUrl.trim() ||
    !apiBaseUrl.startsWith("/") ||
    apiBaseUrl.startsWith("//") ||
    /[\\?#\u0000-\u001f\u007f]/.test(apiBaseUrl);
  const parsed = unsafePath
    ? null
    : new URL(apiBaseUrl, "https://agent-hub.local");
  if (
    !parsed ||
    parsed.origin !== "https://agent-hub.local" ||
    parsed.pathname !== apiBaseUrl
  ) {
    throw new Error("API 地址必须是同源路径");
  }

  return {
    transport,
    apiBaseUrl,
    legacyFrontendUrl: resolveLegacyFrontendUrl(env),
  };
}

export function readPublicRuntimeConfig(): PublicRuntimeConfig {
  return resolvePublicRuntimeConfig({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_CHAT_TRANSPORT: process.env.NEXT_PUBLIC_CHAT_TRANSPORT,
    NEXT_PUBLIC_AGENT_API_BASE: process.env.NEXT_PUBLIC_AGENT_API_BASE,
    NEXT_PUBLIC_LEGACY_FRONTEND_URL: process.env.NEXT_PUBLIC_LEGACY_FRONTEND_URL,
  });
}
