import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export interface SkillMarketSensitiveDataOptions {
  buildRoot: string;
  environment?: Readonly<Record<string, string | undefined>>;
  envExamplePath: string;
  forbiddenClientValues: readonly string[];
  forbiddenEverywhereValues: readonly string[];
}

const SERVER_ONLY_ENV_KEYS = [
  "SKILL_MARKET_BFF_TIMEOUT_MS",
  "SKILL_MARKET_DAILY_ORIGIN",
  "SKILL_MARKET_GATEWAY_HMAC_SECRET",
  "SKILL_MARKET_PRINCIPAL_ID",
  "SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS",
  "SKILL_MARKET_PRINCIPAL_PERMISSIONS",
  "SKILL_MARKET_PRINCIPAL_ROLES",
] as const;
const TEXT_ARTIFACT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".rsc",
  ".txt",
]);

export async function assertSkillMarketSensitiveDataSafe(
  options: SkillMarketSensitiveDataOptions,
): Promise<void> {
  await assertPublicEnvSafe(options.envExamplePath, options.environment ?? {});
  const artifacts = await listTextArtifacts(options.buildRoot);
  const forbiddenEverywhere = meaningfulValues(options.forbiddenEverywhereValues);
  const forbiddenClient = meaningfulValues(options.forbiddenClientValues);

  for (const artifact of artifacts) {
    const content = await readFile(artifact, "utf8");
    const relative = path.relative(options.buildRoot, artifact).replaceAll("\\", "/");
    const isClientArtifact = relative.startsWith("static/");
    const leakedValue = forbiddenEverywhere.some((value) => content.includes(value)) ||
      (isClientArtifact && forbiddenClient.some((value) => content.includes(value)));
    const leakedServerKey = isClientArtifact &&
      SERVER_ONLY_ENV_KEYS.some((key) => content.includes(key));
    if (leakedValue || leakedServerKey) {
      throw new Error(`Skill Market sensitive data found in build artifact: ${relative}`);
    }
  }
}

async function assertPublicEnvSafe(
  envExamplePath: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  const envExample = await readFile(envExamplePath, "utf8");
  const publicKeys = [
    ...[...envExample.matchAll(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=/gm)]
      .map((match) => match[1]),
    ...Object.keys(environment).filter((key) => key.startsWith("NEXT_PUBLIC_")),
  ];
  const unsafe = publicKeys.find((key) =>
    /(?:SKILL_MARKET|SECRET|HMAC|PRINCIPAL)/.test(key)
  );
  if (unsafe) {
    throw new Error(`Server-only Skill Market configuration must not use NEXT_PUBLIC: ${unsafe}`);
  }
}

async function listTextArtifacts(root: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && TEXT_ARTIFACT_EXTENSIONS.has(path.extname(entry.name))) {
        result.push(target);
      }
    }
  };
  await visit(root);
  return result;
}

function meaningfulValues(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length >= 8))];
}
