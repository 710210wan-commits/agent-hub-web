export type ChatTransportMode = "mock" | "projects-new";

export interface PublicRuntimeConfig {
  transport: ChatTransportMode;
  apiBaseUrl: string;
}

export function resolvePublicRuntimeConfig(
  env: NodeJS.ProcessEnv,
): PublicRuntimeConfig {
  const transport = env.NEXT_PUBLIC_CHAT_TRANSPORT ?? "mock";
  if (transport !== "mock" && transport !== "projects-new") {
    throw new Error(`未知 chat transport: ${transport}`);
  }

  if (env.NODE_ENV === "production" && transport === "mock") {
    throw new Error("生产环境禁止使用 mock transport");
  }

  const apiBaseUrl = env.NEXT_PUBLIC_AGENT_API_BASE ?? "/agent-api";
  if (!apiBaseUrl.startsWith("/") || apiBaseUrl.startsWith("//")) {
    throw new Error("API 地址必须是同源路径");
  }

  return { transport, apiBaseUrl };
}
