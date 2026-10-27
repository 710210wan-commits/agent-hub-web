export interface AgentApiRewrite {
  source: string;
  destination: string;
}

export function resolveAgentApiRewrites(
  env: Readonly<Record<string, string | undefined>>,
): AgentApiRewrite[] {
  const rawOrigin = env.AGENT_API_ORIGIN?.trim();
  if (!rawOrigin) return [];

  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new Error("AGENT_API_ORIGIN 必须是有效的 http(s) 地址");
  }
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new Error("AGENT_API_ORIGIN 必须是有效的 http(s) 地址");
  }

  return [
    {
      source: "/agent-api/:path*",
      destination: `${origin.toString().replace(/\/$/, "")}/:path*`,
    },
  ];
}
