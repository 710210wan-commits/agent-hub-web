export interface SkillMarketGatewayConfig {
  timeoutMs: number;
}

export function resolveSkillMarketGatewayConfig(
  env: Readonly<Record<string, string | undefined>>,
): SkillMarketGatewayConfig {
  const raw = env.SKILL_MARKET_BFF_TIMEOUT_MS?.trim();
  if (!raw) return { timeoutMs: 30_000 };
  const timeoutMs = Number(raw);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error("SKILL_MARKET_BFF_TIMEOUT_MS 必须是 1000 到 120000 之间的整数");
  }
  return { timeoutMs };
}

export function readSkillMarketGatewayConfig(): SkillMarketGatewayConfig {
  return resolveSkillMarketGatewayConfig({
    SKILL_MARKET_BFF_TIMEOUT_MS: process.env.SKILL_MARKET_BFF_TIMEOUT_MS,
  });
}
