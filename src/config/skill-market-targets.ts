export type SkillMarketTargetErrorCode =
  | "SKILL_MARKET_CONFIG_INVALID"
  | "SKILL_MARKET_MODE_INVALID"
  | "SKILL_MARKET_MODE_UNAVAILABLE"
  | "SKILL_MARKET_PATH_INVALID"
  | "SKILL_MARKET_TARGET_OVERRIDE_FORBIDDEN";

export class SkillMarketTargetError extends Error {
  constructor(
    readonly code: SkillMarketTargetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SkillMarketTargetError";
  }
}

export interface SkillMarketTargetConfig {
  dailyOrigin: string;
}

export interface SkillMarketRequestTarget {
  mode: "daily";
  origin: string;
  path: string;
  url: URL;
}

export interface SkillMarketTargetRequest {
  mode: unknown;
  path: unknown;
  query?: URLSearchParams;
}

type SkillMarketTargetInput = SkillMarketTargetRequest & Record<string, unknown>;

const SERVER_ORIGIN_KEY = "SKILL_MARKET_DAILY_ORIGIN";
const ALLOWED_INPUT_KEYS = new Set(["mode", "path", "query"]);
const TARGET_OVERRIDE_KEYS = new Set([
  "host",
  "hostname",
  "origin",
  "protocol",
  "proxy",
  "proxytarget",
  "target",
  "upstream",
  "upstreamorigin",
  "url",
]);
const RESOURCE_ID = "[A-Za-z0-9_-]{1,200}";
const ALLOWED_PATHS = [
  /^\/api\/skill-market\/creator\/requirements\/(?:analyze|revise|confirm)$/,
  /^\/api\/skill-market\/creator\/smoke\/(?:suggest|run)$/,
  /^\/api\/skill-market\/creator\/(?:tools|generate)$/,
  /^\/api\/skill-market\/creator\/tool-resolution\/(?:recommend|confirm)$/,
  new RegExp(`^/api/skill-market/drafts(?:/${RESOURCE_ID}(?:/submit)?)?$`),
  new RegExp(
    `^/api/skill-market/submissions(?:/${RESOURCE_ID}(?:/(?:review|trigger-tests|publish|publish-and-enable))?)?$`,
  ),
  /^\/api\/skill-market\/publications$/,
  new RegExp(
    `^/api/skill-market/publications/${RESOURCE_ID}/(?:download|revise|withdraw|installations)$`,
  ),
  /^\/api\/skill-market\/catalog$/,
] as const;

export function resolveSkillMarketTargetConfig(
  env: Readonly<Record<string, string | undefined>>,
): SkillMarketTargetConfig {
  const configured = env[SERVER_ORIGIN_KEY]?.trim();
  if (!configured) throw configError();

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw configError();
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw configError();
  }

  return { dailyOrigin: parsed.origin };
}

export function readSkillMarketTargetConfig(): SkillMarketTargetConfig {
  return resolveSkillMarketTargetConfig({
    SKILL_MARKET_DAILY_ORIGIN: process.env.SKILL_MARKET_DAILY_ORIGIN,
  });
}

export function resolveSkillMarketRequestTarget(
  rawInput: unknown,
  env: Readonly<Record<string, string | undefined>>,
): SkillMarketRequestTarget {
  const input = parseTargetInput(rawInput);

  if (input.mode === "work") {
    throw new SkillMarketTargetError(
      "SKILL_MARKET_MODE_UNAVAILABLE",
      "办公场景 Skill Market 暂未接入",
    );
  }
  if (input.mode !== "daily") {
    throw new SkillMarketTargetError(
      "SKILL_MARKET_MODE_INVALID",
      "Skill Market mode 必须明确为 daily",
    );
  }

  const path = validateSkillMarketPath(input.path);
  const query = validateBusinessQuery(input.query);
  const config = resolveSkillMarketTargetConfig(env);
  const url = new URL(path, `${config.dailyOrigin}/`);
  url.search = query.toString();
  return { mode: "daily", origin: config.dailyOrigin, path, url };
}

export async function withSkillMarketRequestTarget<T>(
  input: unknown,
  env: Readonly<Record<string, string | undefined>>,
  forward: (target: SkillMarketRequestTarget) => T | Promise<T>,
): Promise<T> {
  const target = resolveSkillMarketRequestTarget(input, env);
  return await forward(target);
}

function parseTargetInput(input: unknown): SkillMarketTargetInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new SkillMarketTargetError(
      "SKILL_MARKET_PATH_INVALID",
      "Skill Market 请求格式无效",
    );
  }
  const candidate = input as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");
    if (TARGET_OVERRIDE_KEYS.has(normalized)) throw targetOverrideError();
    if (!ALLOWED_INPUT_KEYS.has(key)) {
      throw new SkillMarketTargetError(
        "SKILL_MARKET_PATH_INVALID",
        "Skill Market 请求包含未知字段",
      );
    }
  }
  return candidate as SkillMarketTargetInput;
}

function validateBusinessQuery(query: URLSearchParams | undefined): URLSearchParams {
  if (query === undefined) return new URLSearchParams();
  if (!(query instanceof URLSearchParams)) {
    throw new SkillMarketTargetError(
      "SKILL_MARKET_PATH_INVALID",
      "Skill Market 查询参数格式无效",
    );
  }
  const result = new URLSearchParams();
  for (const [key, value] of query) {
    const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");
    if (TARGET_OVERRIDE_KEYS.has(normalized)) throw targetOverrideError();
    if (normalized === "mode") {
      throw new SkillMarketTargetError(
        "SKILL_MARKET_MODE_INVALID",
        "mode 必须由 BFF 单独解析，不能作为上游查询参数转发",
      );
    }
    result.append(key, value);
  }
  return result;
}

function validateSkillMarketPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/api/skill-market/") ||
    value.startsWith("//") ||
    value.includes("%") ||
    value.includes("\\") ||
    value.includes("//") ||
    /[?#\u0000-\u001f\u007f]/.test(value) ||
    value.split("/").some((segment) => segment === "." || segment === "..") ||
    !ALLOWED_PATHS.some((pattern) => pattern.test(value))
  ) {
    throw new SkillMarketTargetError(
      "SKILL_MARKET_PATH_INVALID",
      "Skill Market 路径不在允许列表中",
    );
  }
  return value;
}

function configError(): SkillMarketTargetError {
  return new SkillMarketTargetError(
    "SKILL_MARKET_CONFIG_INVALID",
    `${SERVER_ORIGIN_KEY} 必须配置为不含路径、凭据、查询或片段的 HTTP(S) Origin`,
  );
}

function targetOverrideError(): SkillMarketTargetError {
  return new SkillMarketTargetError(
    "SKILL_MARKET_TARGET_OVERRIDE_FORBIDDEN",
    "客户端不得指定 Skill Market 上游目标",
  );
}
