export type ChatTransportMode = "mock" | "projects-new";

export interface PublicRuntimeConfig {
  transport: ChatTransportMode;
  apiBaseUrl: string;
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

  return { transport, apiBaseUrl };
}

export function readPublicRuntimeConfig(): PublicRuntimeConfig {
  return resolvePublicRuntimeConfig({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_CHAT_TRANSPORT: process.env.NEXT_PUBLIC_CHAT_TRANSPORT,
    NEXT_PUBLIC_AGENT_API_BASE: process.env.NEXT_PUBLIC_AGENT_API_BASE,
  });
}
