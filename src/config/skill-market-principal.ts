import { createHmac } from "node:crypto";

export const SKILL_MARKET_PRINCIPAL_HEADERS = {
  id: "x-skill-principal-id",
  managedScenarios: "x-skill-principal-managed-scenarios",
  permissions: "x-skill-principal-permissions",
  roles: "x-skill-principal-roles",
  signature: "x-skill-principal-signature",
  timestamp: "x-skill-principal-timestamp",
} as const;

export type SkillMarketPrincipalRole =
  | "admin"
  | "author"
  | "reviewer"
  | "scenario_admin";

export type SkillMarketPrincipalErrorCode =
  | "SKILL_MARKET_PRINCIPAL_CONFIG_INVALID"
  | "SKILL_MARKET_SIGNING_INPUT_INVALID";

export class SkillMarketPrincipalError extends Error {
  constructor(
    readonly code: SkillMarketPrincipalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SkillMarketPrincipalError";
  }
}

export interface SkillMarketPrincipalConfig {
  id: string;
  managedScenarioIds: string[];
  permissions: string[];
  roles: SkillMarketPrincipalRole[];
  secret: string;
}

export interface SkillMarketSigningInput {
  method: string;
  originalUrl: string;
  timestamp?: number;
}

const ALLOWED_METHODS = new Set(["DELETE", "GET", "POST", "PUT"]);
const ALLOWED_ROLES = new Set<SkillMarketPrincipalRole>([
  "admin",
  "author",
  "reviewer",
  "scenario_admin",
]);
const SAFE_URL_ORIGIN = "https://skill-market-signing.local";

export function resolveSkillMarketPrincipalConfig(
  env: Readonly<Record<string, string | undefined>>,
): SkillMarketPrincipalConfig {
  const secret = env.SKILL_MARKET_GATEWAY_HMAC_SECRET;
  const id = env.SKILL_MARKET_PRINCIPAL_ID?.trim() ?? "";
  const roles = parseRoles(env.SKILL_MARKET_PRINCIPAL_ROLES);
  if (
    !secret ||
    secret.length < 32 ||
    /[\u0000-\u001f\u007f]/.test(secret) ||
    !isSafeHeaderValue(id) ||
    roles.length === 0
  ) {
    throw principalConfigError();
  }
  return {
    id,
    managedScenarioIds: parseList(env.SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS),
    permissions: parseList(env.SKILL_MARKET_PRINCIPAL_PERMISSIONS),
    roles,
    secret,
  };
}

export function readSkillMarketPrincipalConfig(): SkillMarketPrincipalConfig {
  return resolveSkillMarketPrincipalConfig({
    SKILL_MARKET_GATEWAY_HMAC_SECRET:
      process.env.SKILL_MARKET_GATEWAY_HMAC_SECRET,
    SKILL_MARKET_PRINCIPAL_ID: process.env.SKILL_MARKET_PRINCIPAL_ID,
    SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS:
      process.env.SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS,
    SKILL_MARKET_PRINCIPAL_PERMISSIONS:
      process.env.SKILL_MARKET_PRINCIPAL_PERMISSIONS,
    SKILL_MARKET_PRINCIPAL_ROLES:
      process.env.SKILL_MARKET_PRINCIPAL_ROLES,
  });
}

export function createSkillMarketPrincipalHeaders(
  input: SkillMarketSigningInput,
  env: Readonly<Record<string, string | undefined>>,
): Headers {
  const method = input.method.toUpperCase();
  const originalUrl = validateOriginalUrl(input.originalUrl);
  const timestamp = input.timestamp ?? Date.now();
  if (!ALLOWED_METHODS.has(method) || !Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw signingInputError();
  }

  const principal = resolveSkillMarketPrincipalConfig(env);
  const canonical = [
    "skill-market-principal-v1",
    method,
    originalUrl,
    principal.id,
    principal.roles.join(","),
    principal.managedScenarioIds.join(","),
    principal.permissions.join(","),
    String(timestamp),
  ].join("\n");
  const signature = createHmac("sha256", principal.secret)
    .update(canonical)
    .digest("hex");

  return new Headers({
    [SKILL_MARKET_PRINCIPAL_HEADERS.id]: principal.id,
    [SKILL_MARKET_PRINCIPAL_HEADERS.managedScenarios]:
      principal.managedScenarioIds.join(","),
    [SKILL_MARKET_PRINCIPAL_HEADERS.permissions]: principal.permissions.join(","),
    [SKILL_MARKET_PRINCIPAL_HEADERS.roles]: principal.roles.join(","),
    [SKILL_MARKET_PRINCIPAL_HEADERS.signature]: signature,
    [SKILL_MARKET_PRINCIPAL_HEADERS.timestamp]: String(timestamp),
  });
}

function parseRoles(value: string | undefined): SkillMarketPrincipalRole[] {
  const roles = parseList(value);
  if (roles.some((role) => !ALLOWED_ROLES.has(role as SkillMarketPrincipalRole))) {
    throw principalConfigError();
  }
  return roles as SkillMarketPrincipalRole[];
}

function parseList(value: string | undefined): string[] {
  const values = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length > 100 || values.some((item) => !isSafeHeaderValue(item))) {
    throw principalConfigError();
  }
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isSafeHeaderValue(value: string): boolean {
  return value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f,]/.test(value);
}

function validateOriginalUrl(value: string): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/api/skill-market/") ||
    /[\\#\u0000-\u001f\u007f]/.test(value)
  ) {
    throw signingInputError();
  }
  let parsed: URL;
  try {
    parsed = new URL(value, SAFE_URL_ORIGIN);
  } catch {
    throw signingInputError();
  }
  if (
    parsed.origin !== SAFE_URL_ORIGIN ||
    `${parsed.pathname}${parsed.search}` !== value
  ) {
    throw signingInputError();
  }
  return value;
}

function principalConfigError(): SkillMarketPrincipalError {
  return new SkillMarketPrincipalError(
    "SKILL_MARKET_PRINCIPAL_CONFIG_INVALID",
    "Skill Market 服务端 Principal 配置缺失或无效",
  );
}

function signingInputError(): SkillMarketPrincipalError {
  return new SkillMarketPrincipalError(
    "SKILL_MARKET_SIGNING_INPUT_INVALID",
    "Skill Market 签名请求无效",
  );
}
