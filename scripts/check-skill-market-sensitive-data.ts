import path from "node:path";

import { assertSkillMarketSensitiveDataSafe } from "./skill-market-sensitive-data";

async function main(): Promise<void> {
  const secret = requiredEnv("SKILL_MARKET_GATEWAY_HMAC_SECRET");
  await assertSkillMarketSensitiveDataSafe({
    buildRoot: path.resolve(".next"),
    environment: process.env,
    envExamplePath: path.resolve(".env.example"),
    forbiddenClientValues: [
      secret,
      process.env.SKILL_MARKET_DAILY_ORIGIN ?? "",
      process.env.SKILL_MARKET_PRINCIPAL_ID ?? "",
      process.env.SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS ?? "",
      process.env.SKILL_MARKET_PRINCIPAL_PERMISSIONS ?? "",
      process.env.SKILL_MARKET_PRINCIPAL_ROLES ?? "",
    ],
    forbiddenEverywhereValues: [secret],
  });
  console.log("Skill Market build artifacts contain no configured sensitive values.");
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the sensitive-data scan.`);
  return value;
}

main().catch((error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : "Skill Market sensitive-data scan failed.";
  console.error(message);
  process.exitCode = 1;
});
