export interface XiaozhiServerConfig {
  origin: URL;
  apiKey: string;
  agentSlug: string;
}

export function resolveXiaozhiServerConfig(
  env: Readonly<Record<string, string | undefined>>,
): XiaozhiServerConfig {
  const originValue = required(env, "XIAOZHI_API_ORIGIN");
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(originValue);
  } catch {
    throw new Error("XIAOZHI_API_ORIGIN 必须是 HTTP(S) origin");
  }
  if (
    (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") ||
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search ||
    parsedOrigin.hash
  ) {
    throw new Error("XIAOZHI_API_ORIGIN 必须是无凭据、路径、查询或 fragment 的 HTTP(S) origin");
  }

  const apiKey = required(env, "XIAOZHI_API_KEY");
  if (!apiKey.startsWith("yxkey_")) {
    throw new Error("XIAOZHI_API_KEY 必须使用 yxkey_ 前缀");
  }

  return {
    origin: new URL(parsedOrigin.origin),
    apiKey,
    agentSlug: required(env, "XIAOZHI_WORK_AGENT_SLUG"),
  };
}

export function readXiaozhiServerConfig(): XiaozhiServerConfig {
  return resolveXiaozhiServerConfig({
    XIAOZHI_API_ORIGIN: process.env.XIAOZHI_API_ORIGIN,
    XIAOZHI_API_KEY: process.env.XIAOZHI_API_KEY,
    XIAOZHI_WORK_AGENT_SLUG: process.env.XIAOZHI_WORK_AGENT_SLUG,
  });
}

function required(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} 未配置`);
  return value;
}
